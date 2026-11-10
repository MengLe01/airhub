package me.rerere.tts.controller

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import me.rerere.tts.model.PlaybackState
import me.rerere.tts.model.PlaybackStatus
import me.rerere.tts.model.TTSResponse
import me.rerere.tts.provider.TTSManager
import me.rerere.tts.provider.TTSProviderException
import me.rerere.tts.provider.TTSProviderSetting
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicLong

private const val TAG = "TtsController"
private const val MAX_SYNTHESIS_ATTEMPTS = 3
private const val SYNTHESIS_RETRY_BASE_DELAY_MS = 500L

// 已合成音频的内存缓存上限，超出后按最久未使用淘汰
private const val MAX_CACHE_BYTES = 48L * 1024 * 1024
private const val MAX_CACHE_ENTRIES = 256

// 这些字段不影响合成结果，不参与缓存键（换密钥或改名字不该让音频失效）
private val IGNORED_PROVIDER_FIELDS = setOf("id", "name", "apiKey")

// encodeDefaults 保证同一份配置生成的键稳定；模型或音色一变，键就跟着变
private val cacheKeyJson = Json {
    encodeDefaults = true
    ignoreUnknownKeys = true
}

/**
 * TTS 控制器（重构版）
 * - 负责文本分片、预取合成、排队播放与状态上报
 * - 对外 API 与原版兼容
 */
class TtsController(
    context: Context,
    private val ttsManager: TTSManager
) {
    // 协程作用域
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // 组件
    private val chunker = TextChunker(maxChunkLength = 160)
    private val synthesizer = TtsSynthesizer(ttsManager)
    private val audio = AudioPlayer(context)

    // Provider & 作业
    private var currentProvider: TTSProviderSetting? = null
    private var workerJob: Job? = null
    private var isPaused = false

    // 队列与缓存（基于稳定 ID：同样的供应商配置 + 同样的文本 → 同样的键）
    private val queue: ConcurrentLinkedQueue<TtsChunk> = ConcurrentLinkedQueue()
    private val allChunks: MutableList<TtsChunk> = mutableListOf()
    private val cache = ConcurrentHashMap<UUID, CacheEntry>()

    // 只增不减的访问序号，用来判断哪个缓存条目最久没被用过
    private val cacheAccessSeq = AtomicLong()

    // 行为参数
    private val chunkDelayMs = 120L
    private val prefetchCount = 2

    // 状态流（保留与旧版兼容的 StateFlow）
    private val _isAvailable = MutableStateFlow(false)
    val isAvailable: StateFlow<Boolean> = _isAvailable.asStateFlow()

    private val _isSpeaking = MutableStateFlow(false)
    val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _currentChunk = MutableStateFlow(0)
    val currentChunk: StateFlow<Int> = _currentChunk.asStateFlow()

    private val _totalChunks = MutableStateFlow(0)
    val totalChunks: StateFlow<Int> = _totalChunks.asStateFlow()

    // 统一播放状态（融合音频播放 + 分片进度）
    private val _playbackState = MutableStateFlow(PlaybackState())
    val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()

    init {
        // 同步底层播放器状态到统一状态，并补充分片信息
        scope.launch {
            audio.playbackState.collectLatest { audioState ->
                _playbackState.update {
                    audioState.copy(
                        currentChunkIndex = _currentChunk.value,
                        totalChunks = _totalChunks.value,
                        status = if (!_isAvailable.value) PlaybackStatus.Idle else audioState.status
                    )
                }
            }
        }
    }

    /** 选择/取消选择 Provider */
    fun setProvider(provider: TTSProviderSetting?) {
        val previous = currentProvider
        currentProvider = provider
        _isAvailable.update { provider != null }
        if (provider == null) {
            hardReset()
        } else if (previous != null && providerFingerprint(previous) != providerFingerprint(provider)) {
            // 模型或音色变了，旧缓存对应的键已经不再成立（只改名字或密钥不算）
            hardReset()
        }
    }

    /**
     * 朗读文本
     * - flush=true: 清空当前进度并重新开始
     * - flush=false: 继续队列，追加朗读
     */
    fun speak(text: String, flush: Boolean = true) {
        if (text.isBlank()) return
        val provider = currentProvider
        if (provider == null) {
            _error.update { "No TTS provider selected" }
            return
        }

        val fingerprint = providerFingerprint(provider)
        val newChunks = chunker.split(text).map { it.copy(id = stableChunkId(fingerprint, it.text)) }
        if (newChunks.isEmpty()) return

        if (flush) {
            internalReset()
            allChunks.addAll(newChunks)
            queue.addAll(newChunks)
            _currentChunk.update { 0 }
        } else {
            // 追加时，重映射 index 以保持全局顺序
            val startIndex = (allChunks.lastOrNull()?.index ?: -1) + 1
            val remapped = newChunks.mapIndexed { i, c -> c.copy(index = startIndex + i) }
            allChunks.addAll(remapped)
            queue.addAll(remapped)
        }
        _totalChunks.update { queue.size }
        _error.update { null }

        _playbackState.update {
            it.copy(
                currentChunkIndex = _currentChunk.value,
                totalChunks = _totalChunks.value,
                status = PlaybackStatus.Buffering
            )
        }

        if (workerJob?.isActive != true) startWorker()
    }

    /**
     * 开始新一次朗读前清理播放现场。
     * 已经合成好的音频会留在缓存里（下次读同样的内容可直接复用），
     * 只有还在合成中的请求会被取消，避免停下来之后仍在后台消耗接口额度。
     */
    private fun internalReset() {
        workerJob?.cancel()
        audio.stop()
        audio.clear()
        isPaused = false
        queue.clear()
        allChunks.clear()
        cancelInFlightSynthesis()
        _isSpeaking.update { false }
        _currentChunk.update { 0 }
        _totalChunks.update { 0 }
        _error.update { null }
        _playbackState.update { PlaybackState(status = PlaybackStatus.Idle) }
    }

    /** 暂停播放（保留进度） */
    fun pause() {
        isPaused = true
        audio.pause()
        _playbackState.update { it.copy(status = PlaybackStatus.Paused) }
    }

    /** 恢复播放 */
    fun resume() {
        isPaused = false
        audio.resume()
        _playbackState.update { it.copy(status = PlaybackStatus.Playing) }
    }

    /**
     * 从头重播当前会话。
     * 分片文本没有变，缓存键也就没变，已经合成过的分段会直接命中，不再请求接口。
     */
    fun replay() {
        if (allChunks.isEmpty()) return
        if (currentProvider == null) {
            _error.update { "No TTS provider selected" }
            return
        }
        if (queue.isNotEmpty()) queue.clear()
        queue.addAll(allChunks)
        _currentChunk.update { 0 }
        _totalChunks.update { allChunks.size }
        _error.update { null }
        _playbackState.update {
            it.copy(
                currentChunkIndex = 0,
                totalChunks = allChunks.size,
                positionMs = 0L,
                durationMs = 0L,
                status = PlaybackStatus.Buffering
            )
        }
        if (workerJob?.isActive != true) startWorker()
    }

    /** 快进当前音频 */
    fun fastForward(ms: Long = 5_000) {
        audio.seekBy(ms)
    }

    /** 设置播放速度 */
    fun setSpeed(speed: Float) {
        audio.setSpeed(speed)
    }

    /** 跳过下一段（不打断当前正在播放） */
    fun skipNext() {
        if (queue.isNotEmpty()) {
            queue.poll()
            _totalChunks.update { queue.size }
        }
    }

    /**
     * 停止播放并结束当前会话。
     * 分片表和已合成的音频都会保留，所以关掉浮窗之后仍然可以重放；
     * 只取消还在合成中的请求（它们的结果已经没人要了）。
     */
    fun stop() {
        workerJob?.cancel()
        audio.stop()
        audio.clear()
        isPaused = false
        queue.clear()
        cancelInFlightSynthesis()
        _isSpeaking.update { false }
        _currentChunk.update { 0 }
        _totalChunks.update { allChunks.size }
        _playbackState.update { PlaybackState(status = PlaybackStatus.Idle) }
    }

    /** 丢弃当前会话的全部分片与缓存（切换供应商或释放资源时使用） */
    private fun hardReset() {
        workerJob?.cancel()
        audio.stop()
        audio.clear()
        isPaused = false
        queue.clear()
        allChunks.clear()
        cache.values.forEach { it.deferred.cancel(CancellationException("Reset")) }
        cache.clear()
        _isSpeaking.update { false }
        _currentChunk.update { 0 }
        _totalChunks.update { 0 }
        _error.update { null }
        _playbackState.update { PlaybackState(status = PlaybackStatus.Idle) }
    }

    /** 释放资源 */
    fun dispose() {
        hardReset()
        scope.cancel()
        audio.release()
    }

    // region 内部：缓存
    /**
     * 用「供应商配置 + 分片文本」派生一个稳定 ID。
     * 同样的音色、同样的文字永远得到同一个键；音色或文本一变，键就跟着变，旧缓存自然失效。
     */
    private fun stableChunkId(fingerprint: String, text: String): UUID {
        val payload = buildString {
            append(fingerprint)
            append('\u0000')
            append(text.length)
            append('\u0000')
            append(text)
        }
        return UUID.nameUUIDFromBytes(payload.toByteArray(Charsets.UTF_8))
    }

    private fun providerFingerprint(provider: TTSProviderSetting): String {
        val element = runCatching {
            cacheKeyJson.encodeToJsonElement(TTSProviderSetting.serializer(), provider).jsonObject
        }.getOrNull() ?: return provider.id.toString()
        return element.entries
            .asSequence()
            .filter { it.key !in IGNORED_PROVIDER_FIELDS }
            .sortedBy { it.key }
            .joinToString(separator = ";") { "${it.key}=${it.value}" }
    }

    /** 取消还没合成完的请求并移出缓存，已完成的条目保持不动 */
    private fun cancelInFlightSynthesis() {
        cache.entries.forEach { (id, entry) ->
            if (!entry.deferred.isCompleted) {
                entry.deferred.cancel(CancellationException("Cancelled"))
                cache.remove(id, entry)
            }
        }
    }

    private fun evictCacheIfNeeded() {
        val totalBytes = cache.values.sumOf { it.sizeBytes.toLong() }
        if (totalBytes <= MAX_CACHE_BYTES && cache.size <= MAX_CACHE_ENTRIES) return

        val victims = cache.entries
            .filter { it.value.deferred.isCompleted && !it.value.deferred.isCancelled }
            .sortedBy { it.value.lastAccessSeq }
            .map { it.key }

        var remainingBytes = totalBytes
        var remainingEntries = cache.size
        for (id in victims) {
            if (remainingBytes <= MAX_CACHE_BYTES && remainingEntries <= MAX_CACHE_ENTRIES) break
            val removed = cache.remove(id) ?: continue
            remainingBytes -= removed.sizeBytes
            remainingEntries -= 1
        }
    }
    // endregion

    // region 内部：播放调度
    private fun startWorker() {
        val provider = currentProvider
        if (provider == null) {
            _error.update { "No TTS provider selected" }
            return
        }

        workerJob = scope.launch {
            _isSpeaking.update { true }
            var processedCount = _currentChunk.value
            try {
                while (isActive) {
                    if (isPaused) {
                        delay(80)
                        continue
                    }

                    val chunk = queue.poll() ?: break

                    // 更新状态（1-based）
                    _currentChunk.update { processedCount + 1 }
                    _totalChunks.update { queue.size + 1 }
                    _playbackState.update {
                        it.copy(
                            currentChunkIndex = _currentChunk.value,
                            totalChunks = _totalChunks.value
                        )
                    }

                    // 仅预取当前分片后的固定窗口
                    prefetchNextChunks(chunk.index)

                    val response = try {
                        awaitOrCreate(chunk, provider)
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        Log.e(TAG, "Synthesis error", e)
                        _error.update { e.message ?: "TTS synthesis error" }
                        processedCount++
                        continue
                    }

                    // 播放
                    try {
                        audio.play(response)
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        Log.e(TAG, "Playback error", e)
                        _error.update { e.message ?: "Audio playback error" }
                    }

                    if (queue.isNotEmpty()) delay(chunkDelayMs)

                    processedCount++
                }
            } finally {
                _isSpeaking.update { false }
                if (queue.isEmpty()) {
                    _playbackState.update { it.copy(status = PlaybackStatus.Ended) }
                }
            }
        }
    }

    private fun prefetchNextChunks(currentIndex: Int) {
        val provider = currentProvider ?: return
        val begin = currentIndex + 1
        val endExclusive = (begin + prefetchCount).coerceAtMost(allChunks.size)
        if (begin >= endExclusive) return

        for (i in begin until endExclusive) {
            val chunk = allChunks.getOrNull(i) ?: continue
            getOrCreateSynthesis(chunk, provider)
        }
    }

    private suspend fun awaitOrCreate(chunk: TtsChunk, provider: TTSProviderSetting): TTSResponse {
        val deferred = getOrCreateSynthesis(chunk, provider)
        return try {
            deferred.await()
        } catch (e: Exception) {
            // 失败或被取消的结果不能留，否则下次会命中一个只会抛异常的条目。
            // 注意要按「条目身份」删除：同一段文本可能已经被新一次朗读重新写进缓存，
            // 无条件 remove 会把新的那条也删掉。
            if (e is CancellationException || deferred.isCancelled) {
                val cached = cache[chunk.id]
                if (cached != null && cached.deferred === deferred) {
                    cache.remove(chunk.id, cached)
                }
            }
            throw e
        }
    }

    private fun getOrCreateSynthesis(
        chunk: TtsChunk,
        provider: TTSProviderSetting
    ): Deferred<TTSResponse> {
        val cached = cache[chunk.id]
        if (cached != null) {
            if (!cached.deferred.isCancelled) {
                cached.lastAccessSeq = cacheAccessSeq.incrementAndGet()
                return cached.deferred
            }
            // 已取消的条目不会再产出结果，移除后重建
            cache.remove(chunk.id, cached)
        }

        val deferred = scope.async(Dispatchers.IO) {
            synthesizeWithRetry(provider, chunk)
        }
        val entry = CacheEntry(deferred)
        val existing = cache.putIfAbsent(chunk.id, entry)
        if (existing != null) {
            // 并发下别人先放进去了，丢弃这一次多余的请求
            deferred.cancel()
            existing.lastAccessSeq = cacheAccessSeq.incrementAndGet()
            return existing.deferred
        }
        entry.lastAccessSeq = cacheAccessSeq.incrementAndGet()

        deferred.invokeOnCompletion { cause ->
            if (cause != null) {
                cache.remove(chunk.id, entry)
            } else {
                entry.sizeBytes = runCatching {
                    deferred.getCompleted().audioData.size
                }.getOrDefault(0)
                evictCacheIfNeeded()
            }
        }
        return deferred
    }

    private suspend fun synthesizeWithRetry(
        provider: TTSProviderSetting,
        chunk: TtsChunk
    ): TTSResponse {
        var attempt = 1
        while (true) {
            try {
                return synthesizer.synthesize(provider, chunk)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!e.isRetryableSynthesisError() || attempt >= MAX_SYNTHESIS_ATTEMPTS) throw e

                val retryDelayMs = SYNTHESIS_RETRY_BASE_DELAY_MS * (1L shl (attempt - 1))
                Log.w(
                    TAG,
                    "Synthesis attempt $attempt/$MAX_SYNTHESIS_ATTEMPTS failed for chunk ${chunk.index}; " +
                        "retrying in ${retryDelayMs}ms",
                    e
                )
                delay(retryDelayMs)
                attempt++
            }
        }
    }
    // endregion

    private class CacheEntry(
        val deferred: Deferred<TTSResponse>
    ) {
        @Volatile
        var lastAccessSeq: Long = 0L

        @Volatile
        var sizeBytes: Int = 0
    }
}

private fun Exception.isRetryableSynthesisError(): Boolean {
    return this is IOException || this is TTSProviderException && isRetryable
}
