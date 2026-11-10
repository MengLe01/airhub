package me.rerere.tts.provider

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.uuid.Uuid

@Serializable
sealed class TTSProviderSetting {
    abstract val id: Uuid
    abstract val name: String

    abstract fun copyProvider(
        id: Uuid = this.id,
        name: String = this.name,
    ): TTSProviderSetting

    @Serializable
    @SerialName("openai")
    data class OpenAI(
        override var id: Uuid = Uuid.random(),
        override var name: String = "OpenAI TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.openai.com/v1",
        val model: String = "gpt-4o-mini-tts",
        val voice: String = "alloy"
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("gemini")
    data class Gemini(
        override var id: Uuid = Uuid.random(),
        override var name: String = "Gemini TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://generativelanguage.googleapis.com/v1beta",
        val model: String = "gemini-2.5-flash-preview-tts",
        val voiceName: String = "Kore"
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("system")
    data class SystemTTS(
        override var id: Uuid = Uuid.random(),
        override var name: String = "System TTS",
        val speechRate: Float = 1.0f,
        val pitch: Float = 1.0f,
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("minimax")
    data class MiniMax(
        override var id: Uuid = Uuid.random(),
        override var name: String = "MiniMax TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.minimaxi.com/v1",
        val model: String = "speech-2.8-hd",
        val voiceId: String = "female-shaonv",
        val speed: Float = 1.0f
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("qwen")
    data class Qwen(
        override var id: Uuid = Uuid.random(),
        override var name: String = "Qwen TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1",
        val model: String = "qwen-audio-3.0-tts-flash",
        val voice: String = "longanhuan_v3.6",
        val format: String = "wav",
        val sampleRate: Int = 24000,
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("groq")
    data class Groq(
        override var id: Uuid = Uuid.random(),
        override var name: String = "Groq TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.groq.com/openai/v1",
        val model: String = "canopylabs/orpheus-v1-english",
        val voice: String = "austin"
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("xai")
    data class XAI(
        override var id: Uuid = Uuid.random(),
        override var name: String = "xAI TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.x.ai/v1",
        val voiceId: String = "eve",
        val language: String = "auto"
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("mimo")
    // 默认值仅用于快捷起步 可在设置页任意修改
    data class MiMo(
        override var id: Uuid = Uuid.random(),
        override var name: String = "MiMo TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.xiaomimimo.com/v1",
        val model: String = "mimo-v2.5-tts",
        val voice: String = "mimo_default"
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("elevenlabs")
    data class ElevenLabs(
        override var id: Uuid = Uuid.random(),
        override var name: String = "ElevenLabs TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.elevenlabs.io",
        val model: String = "eleven_multilingual_v2",
        val voiceId: String = "JBFqnCBsd6RMkjVDRZzb",
        val stability: Float = 0.5f,
        val similarityBoost: Float = 0.75f,
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    /**
     * 阶跃星辰 Step TTS (step-tts-mini / step-tts-vivid / stepaudio-2.5-tts)。
     *
     * 与 Step ASR 共用同一个 baseUrl 与鉴权方式 (Authorization: Bearer sk-xxx),
     * 走 OpenAI 兼容的 [POST /v1/audio/speech] 非流式接口, 服务端一次性返回完整音频
     * 二进制 (默认 mp3, 也可选 wav/pcm/opus/flac)。客户端把整段音频包成一个 AudioChunk
     * 发出, 由 TtsSynthesizer 统一收集后交给播放器。
     *
     * 仅 stepaudio-2.5-tts 模型支持 [instruction] 字段 (全局语境, ≤200 字符), 其它模型
     * (step-tts-mini / step-tts-vivid / step-tts-2) 会忽略该字段, 留空时不下发。
     *
     * 官方文档:
     * - 模型总览: https://platform.stepfun.com/docs/zh/guides/models/stepaudio-2.5-tts
     * - 开发指南: https://platform.stepfun.com/docs/zh/guides/developer/tts
     */
    @Serializable
    @SerialName("step")
    data class Step(
        override var id: Uuid = Uuid.random(),
        override var name: String = "Step TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.stepfun.com",
        // step-tts-mini | step-tts-vivid | stepaudio-2.5-tts | step-tts-2
        val model: String = "step-tts-mini",
        // 完整 voice-id 列表见开发指南; 默认值与官方 SDK 一致
        val voice: String = "elegantgentle-female",
        // mp3 | wav | pcm | opus | flac; 注意 StepFun API 使用 camelCase 字段名
        val responseFormat: String = "mp3",
        // 0.5 - 2.0, 1.0 为正常语速
        val speed: Float = 1.0f,
        // 0.1 - 2.0, 1.0 为正常音量
        val volume: Float = 1.0f,
        // 8000 | 16000 | 22050 | 24000
        val sampleRate: Int = 24000,
        // 仅 stepaudio-2.5-tts 生效; ≤200 字符, 留空时不下发
        val instruction: String = "",
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("fish-audio")
    data class FishAudio(
        override var id: Uuid = Uuid.random(),
        override var name: String = "Fish Audio TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.fish.audio",
        val model: String = "s2.1-pro",
        val referenceId: String = "",
        val temperature: Float = 0.7f,
        val speed: Float = 1.0f,
        val format: String = "mp3",
        val topP: Float = 0.7f,
        val chunkLength: Int = 300,
        val normalize: Boolean = true,
        val latency: String = "normal",
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    /**
     * Breeze Blue TTS (https://docs.breezeblue.ai)
     *
     * 形态与 ElevenLabs 同构但语义不同, 不能直接复用 ElevenLabs 通道:
     * - 音色 ID 落在 path (`/v1/text-to-speech/{voice_id}`), 形如 `voc_xxxxxxxxxxxx`
     * - `output_format` 落在 query, 是**封闭枚举**, 不接受 ElevenLabs 的 `mp3_44100_128`
     * - `voice_settings` 只认 guidance_scale / use_speaker_boost / speed / volume,
     *   没有 ElevenLabs 的 stability / similarity_boost
     * - `instructions` 是它的核心能力: 用自然语言描述语气情绪, 由 [guidanceScale] 控制服从强度
     * - 鉴权走 `xi-api-key` 请求头, key 形如 `brz_xxxxxxxx`
     *
     * 首次合成该音色时服务端可能要预载参考音频 (实测一次 ~98s), 因此超时设得比其它 provider 宽。
     */
    @Serializable
    @SerialName("breeze")
    data class Breeze(
        override var id: Uuid = Uuid.random(),
        override var name: String = "Breeze TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://api.breeze.blue",
        // breeze-tts-2 (en/zh) | breeze-tts-2-multilingual (51 种语言)
        val model: String = "breeze-tts-2",
        // 从 GET /v1/voices 拿到的 voice_id, 形如 voc_xeh3w54cqvnp
        val voiceId: String = "",
        // 封闭枚举, 见 BREEZE_OUTPUT_FORMATS
        val outputFormat: String = "mp3",
        // ISO 639-1 两位语言码; 留空则不下发, 由服务端按文本处理
        val languageCode: String = "",
        // 自然语言语气指导, 与文本同语言; 留空则不下发
        val instructions: String = "",
        // 1.0 - 10.0, 控制对 instructions 的服从强度
        val guidanceScale: Float = 1.0f,
        // 提升与参考音色的相似度; 当 instructions 非空且 guidanceScale > 1.0 时服务端会忽略
        val speakerBoost: Boolean = false,
        // 0.5 - 2.0
        val speed: Float = 1.0f,
        // 0.01 - 2.0
        val volume: Float = 1.0f,
    ) : TTSProviderSetting() {
        override fun copyProvider(
            id: Uuid,
            name: String,
        ): TTSProviderSetting {
            return this.copy(
                id = id,
                name = name,
            )
        }
    }

    @Serializable
    @SerialName("volcengine")
    data class Volcengine(
        override val id: Uuid = Uuid.random(),
        override val name: String = "Volcengine TTS",
        val apiKey: String = "",
        val baseUrl: String = "https://openspeech.bytedance.com",
        val resourceId: String = "seed-tts-2.0",
        val speaker: String = "zh_female_vv_uranus_bigtts",
        val speechRate: Int = 0,
    ) : TTSProviderSetting() {
        override fun copyProvider(id: Uuid, name: String): TTSProviderSetting =
            copy(id = id, name = name)
    }

    companion object {
        /**
         * Breeze 的 output_format 是服务端封闭枚举, 传未列出的值会在参数校验阶段直接 422。
         * 注意这里刻意不含 flac: 客户端的 [me.rerere.tts.model.AudioFormat] 没有 FLAC,
         * 声明错了会让播放器按错误格式解码。
         */
        val BREEZE_OUTPUT_FORMATS = listOf(
            "mp3",
            "mp3_24000_64",
            "mp3_24000_96",
            "mp3_24000_128",
            "mp3_24000_160",
            "wav",
            "wav_24000",
            "pcm",
            "pcm_24000",
            "aac",
            "aac_24000_128",
            "opus",
        )

        /** Breeze 的两个模型及其语言覆盖, 供设置页展示。 */
        val BREEZE_MODELS = listOf(
            "breeze-tts-2" to "Breeze TTS 2 (en / zh)",
            "breeze-tts-2-multilingual" to "Breeze TTS 2 Multilingual (51 语言)",
        )

        val Types by lazy {
            listOf(
                OpenAI::class,
                Gemini::class,
                SystemTTS::class,
                MiniMax::class,
                Qwen::class,
                Groq::class,
                XAI::class,
                MiMo::class,
                ElevenLabs::class,
                Step::class,
                FishAudio::class,
                Volcengine::class,
                Breeze::class,
            )
        }
    }
}
