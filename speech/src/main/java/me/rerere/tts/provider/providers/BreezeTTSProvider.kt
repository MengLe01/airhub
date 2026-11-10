package me.rerere.tts.provider.providers

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import me.rerere.tts.model.AudioChunk
import me.rerere.tts.model.AudioFormat
import me.rerere.tts.model.TTSRequest
import me.rerere.tts.provider.TTSProvider
import me.rerere.tts.provider.TTSProviderException
import me.rerere.tts.provider.TTSProviderSetting
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

private const val TAG = "BreezeTTSProvider"

/**
 * Float 直接 toDouble() 会把 0.8f 变成 0.800000011920929 发给服务端，
 * 先按两位小数四舍五入再转，保证请求体里是 0.8 这种干净的值。
 */
private fun Float.toRequestDouble(): Double = (this * 100f).roundToInt() / 100.0

/** Breeze 返回的 output_format 与客户端解码格式的映射。 */
internal fun breezeAudioFormat(outputFormat: String): AudioFormat =
    when (outputFormat.trim().lowercase()) {
        "wav", "wav_24000" -> AudioFormat.WAV
        "pcm", "pcm_24000" -> AudioFormat.PCM
        "aac", "aac_24000_128" -> AudioFormat.AAC
        "opus" -> AudioFormat.OPUS
        else -> AudioFormat.MP3
    }

/**
 * 按 Breeze Developer API 的约定拼请求：
 * `POST {baseUrl}/v1/text-to-speech/{voice_id}?output_format=xxx`，鉴权走 `xi-api-key`。
 *
 * 留空的字段一律不下发，交给服务端默认值，避免把空字符串当成显式参数发过去。
 */
internal fun buildBreezeTTSRequest(
    setting: TTSProviderSetting.Breeze,
    text: String,
): Request {
    require(setting.apiKey.isNotBlank()) { "Breeze TTS API Key is required" }
    require(setting.voiceId.isNotBlank()) { "Breeze TTS Voice ID is required" }
    require(text.isNotBlank()) { "Breeze TTS text is empty" }

    val rawUrl = "${setting.baseUrl.trim().trimEnd('/')}/v1/text-to-speech/${setting.voiceId.trim()}"
    val url = (rawUrl.toHttpUrlOrNull()
        ?: error("Breeze TTS base url is invalid: ${setting.baseUrl}"))
        .newBuilder()
        .addQueryParameter("output_format", setting.outputFormat.trim())
        .build()

    val body = JSONObject().apply {
        put("text", text)
        if (setting.model.isNotBlank()) put("model_id", setting.model.trim())
        if (setting.languageCode.isNotBlank()) {
            put("language_code", setting.languageCode.trim().lowercase())
        }
        if (setting.instructions.isNotBlank()) put("instructions", setting.instructions.trim())
        put(
            "voice_settings",
            JSONObject().apply {
                put("guidance_scale", setting.guidanceScale.coerceIn(1f, 10f).toRequestDouble())
                put("use_speaker_boost", setting.speakerBoost)
                put("speed", setting.speed.coerceIn(0.5f, 2f).toRequestDouble())
                put("volume", setting.volume.coerceIn(0.01f, 2f).toRequestDouble())
            }
        )
    }

    return Request.Builder()
        .url(url)
        .addHeader("xi-api-key", setting.apiKey.trim())
        .addHeader("Content-Type", "application/json")
        .post(body.toString().toRequestBody("application/json".toMediaType()))
        .build()
}

/**
 * Breeze Blue 语音合成。
 *
 * 走非流式同步接口 (`delivery` 保持默认 sync)，服务端一次性返回完整音频二进制。
 * 注意它没有 OpenAI 兼容端点，也不是 ElevenLabs 的完整兼容实现 —— 只是形状相似，
 * `voice_settings` 的字段名和取值区间都不同。
 */
class BreezeTTSProvider : TTSProvider<TTSProviderSetting.Breeze> {
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        // 某个音色第一次合成时服务端要预载参考音频, 实测能到 ~100s, 必须留足余量
        .readTimeout(240, TimeUnit.SECONDS)
        .build()

    override fun generateSpeech(
        context: Context,
        providerSetting: TTSProviderSetting.Breeze,
        request: TTSRequest,
    ): Flow<AudioChunk> = flow {
        val httpRequest = buildBreezeTTSRequest(providerSetting, request.text)
        Log.i(
            TAG,
            "generateSpeech: model=${providerSetting.model}, voice=${providerSetting.voiceId}, " +
                "format=${providerSetting.outputFormat}"
        )

        httpClient.newCall(httpRequest).execute().use { response ->
            val contentType = response.header("Content-Type").orEmpty()
            if (!response.isSuccessful) {
                val detail = runCatching { response.body.string() }.getOrNull().orEmpty().take(500)
                Log.e(TAG, "generateSpeech: ${response.code} ${response.message} $detail")
                throw TTSProviderException(
                    message = "Breeze TTS request failed: ${response.code} ${response.message} $detail",
                    statusCode = response.code,
                )
            }

            val format = breezeAudioFormat(providerSetting.outputFormat)
            val audioData = response.body.bytes()
            // 正常情况下成功就是 audio/*; 若拿到 JSON 说明服务端降级成了别的东西 (例如异步 job),
            // 直接当音频塞给播放器只会得到一段放不出来的字节, 所以这里显式报错。
            if (!contentType.startsWith("audio/", ignoreCase = true)) {
                val preview = audioData.toString(Charsets.UTF_8).take(500)
                Log.e(TAG, "generateSpeech: unexpected content-type=$contentType body=$preview")
                throw TTSProviderException(
                    message = "Breeze TTS returned non-audio response ($contentType): $preview",
                    statusCode = response.code,
                )
            }
            if (audioData.isEmpty()) {
                throw TTSProviderException(
                    message = "Breeze TTS returned empty audio",
                    statusCode = response.code,
                )
            }

            emit(
                AudioChunk(
                    data = audioData,
                    format = format,
                    isLast = true,
                    metadata = mapOf(
                        "provider" to "breeze",
                        "model" to providerSetting.model,
                        "voiceId" to providerSetting.voiceId,
                        "outputFormat" to providerSetting.outputFormat,
                    )
                )
            )
        }
    }.flowOn(Dispatchers.IO)
}
