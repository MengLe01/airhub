package me.rerere.tts.provider.providers

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.rerere.tts.model.AudioFormat
import me.rerere.tts.provider.TTSProviderSetting
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.uuid.Uuid

class BreezeTTSProviderTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun bodyOf(setting: TTSProviderSetting.Breeze, text: String = "你好，世界") =
        buildBreezeTTSRequest(setting, text).let { request ->
            val buffer = Buffer()
            request.body!!.writeTo(buffer)
            Json.parseToJsonElement(buffer.readUtf8()).jsonObject
        }

    private fun setting(
        apiKey: String = "brz_key",
        baseUrl: String = "https://api.breeze.blue",
        voiceId: String = "voc_test",
        model: String = "breeze-tts-2",
        outputFormat: String = "mp3",
        languageCode: String = "",
        instructions: String = "",
        guidanceScale: Float = 4f,
        speakerBoost: Boolean = true,
        speed: Float = 1f,
        volume: Float = 1f,
    ) = TTSProviderSetting.Breeze(
        apiKey = apiKey,
        baseUrl = baseUrl,
        voiceId = voiceId,
        model = model,
        outputFormat = outputFormat,
        languageCode = languageCode,
        instructions = instructions,
        guidanceScale = guidanceScale,
        speakerBoost = speakerBoost,
        speed = speed,
        volume = volume,
    )

    @Test
    fun buildsPathAndQueryPerApiContract() {
        val request = buildBreezeTTSRequest(
            setting(baseUrl = "https://api.breeze.blue/", voiceId = " voc_xeh3w54cqvnp ", outputFormat = "wav_24000"),
            "hi"
        )
        assertEquals(
            "https://api.breeze.blue/v1/text-to-speech/voc_xeh3w54cqvnp?output_format=wav_24000",
            request.url.toString()
        )
        assertEquals("POST", request.method)
        assertEquals("brz_key", request.header("xi-api-key"))
    }

    @Test
    fun omitsBlankOptionalFields() {
        val body = bodyOf(setting(languageCode = " ", instructions = ""))
        assertEquals("你好，世界", body.getValue("text").jsonPrimitive.content)
        assertEquals("breeze-tts-2", body.getValue("model_id").jsonPrimitive.content)
        assertNull(body["language_code"])
        assertNull(body["instructions"])
    }

    @Test
    fun sendsOptionalFieldsWhenPresent() {
        val body = bodyOf(setting(languageCode = "ZH", instructions = "  用气声说  "))
        assertEquals("zh", body.getValue("language_code").jsonPrimitive.content)
        assertEquals("用气声说", body.getValue("instructions").jsonPrimitive.content)
    }

    @Test
    fun writesVoiceSettingsInBreezeShape() {
        val body = bodyOf(setting(guidanceScale = 4f, speakerBoost = true, speed = 1.25f, volume = 0.8f))
            .getValue("voice_settings").jsonObject
        assertEquals("4.0", body.getValue("guidance_scale").jsonPrimitive.content)
        assertEquals("true", body.getValue("use_speaker_boost").jsonPrimitive.content)
        assertEquals("1.25", body.getValue("speed").jsonPrimitive.content)
        assertEquals("0.8", body.getValue("volume").jsonPrimitive.content)
        // 这两个是 ElevenLabs 的字段, Breeze 不认, 不能漏出去
        assertNull(body["stability"])
        assertNull(body["similarity_boost"])
    }

    @Test
    fun clampsVoiceSettingsToDocumentedRange() {
        val body = bodyOf(setting(guidanceScale = 99f, speed = 0.1f, volume = 9f))
            .getValue("voice_settings").jsonObject
        assertEquals("10.0", body.getValue("guidance_scale").jsonPrimitive.content)
        assertEquals("0.5", body.getValue("speed").jsonPrimitive.content)
        assertEquals("2.0", body.getValue("volume").jsonPrimitive.content)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankApiKey() {
        buildBreezeTTSRequest(setting(apiKey = "  "), "hi")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankVoiceId() {
        buildBreezeTTSRequest(setting(voiceId = " "), "hi")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankText() {
        buildBreezeTTSRequest(setting(), "   ")
    }

    @Test
    fun settingsSurviveSerialization() {
        val original: TTSProviderSetting = setting(instructions = "轻声细语")
        val encoded = json.encodeToString(TTSProviderSetting.serializer(), original)
        assertTrue(encoded.contains("\"breeze\""))

        val restored = json.decodeFromString(TTSProviderSetting.serializer(), encoded)
        assertEquals(original, restored)
    }

    @Test
    fun mapsOutputFormatToDecoderFormat() {
        assertEquals(AudioFormat.MP3, breezeAudioFormat("mp3"))
        assertEquals(AudioFormat.MP3, breezeAudioFormat("mp3_24000_128"))
        assertEquals(AudioFormat.WAV, breezeAudioFormat("wav_24000"))
        assertEquals(AudioFormat.PCM, breezeAudioFormat("pcm"))
        assertEquals(AudioFormat.AAC, breezeAudioFormat("aac_24000_128"))
        assertEquals(AudioFormat.OPUS, breezeAudioFormat("opus"))
    }

    @Test
    fun parsesVoiceList() {
        val voices = parseBreezeVoices(
            """
            {"voices":[
              {"voice_id":"voc_a","name":"甲","language_code":"zh","description":"描述"},
              {"voice_id":"","name":"坏数据"},
              {"voice_id":"voc_b"}
            ]}
            """.trimIndent()
        )
        assertEquals(2, voices.size)
        assertEquals("voc_a", voices[0].id)
        assertEquals("甲", voices[0].name)
        assertEquals("zh", voices[0].languageCode)
        assertEquals("描述", voices[0].description)
        // 没有 name 时回落到 id, 避免设置页出现空条目
        assertEquals("voc_b", voices[1].name)
        assertNull(voices[1].languageCode)
    }

    @Test
    fun parsesEmptyVoiceList() {
        val voices = parseBreezeVoices("""{"voices":[]}""")
        assertTrue(voices.isEmpty())
        assertFalse(voices.isNotEmpty())
    }

    @Test
    fun serializedIdStaysStableAcrossCopies() {
        val id = Uuid.parse("00000000-0000-0000-0000-000000000002")
        val copied = TTSProviderSetting.Breeze(id = id).copyProvider(name = "重命名")
        assertEquals(id, copied.id)
        assertEquals("重命名", copied.name)
    }
}
