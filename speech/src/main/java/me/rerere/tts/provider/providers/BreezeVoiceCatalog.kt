package me.rerere.tts.provider.providers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** 音色目录里的一条记录，字段取自 `GET /v1/voices` 的返回。 */
data class BreezeVoiceSummary(
    val id: String,
    val name: String,
    val languageCode: String? = null,
    val description: String? = null,
)

/**
 * 拉取 Breeze 账号下的音色列表。
 *
 * 音色 ID 形如 `voc_xeh3w54cqvnp`，靠手输几乎不可能记对，设置页需要这个列表让用户点选。
 * 这里只取第一页（接口默认返回全部可用音色），不做分页。
 */
class BreezeVoiceCatalog(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(40, TimeUnit.SECONDS)
        .build(),
) {
    suspend fun list(baseUrl: String, apiKey: String): List<BreezeVoiceSummary> =
        withContext(Dispatchers.IO) {
            require(apiKey.isNotBlank()) { "Breeze TTS API Key is required" }
            val rawUrl = "${baseUrl.trim().trimEnd('/')}/v1/voices"
            val url = rawUrl.toHttpUrlOrNull()
                ?: error("Breeze base url is invalid: $baseUrl")
            val request = Request.Builder()
                .url(url)
                .addHeader("xi-api-key", apiKey.trim())
                .get()
                .build()
            httpClient.newCall(request).execute().use { response ->
                val text = response.body.string()
                if (!response.isSuccessful) {
                    error("Breeze voices request failed: ${response.code} ${text.take(300)}")
                }
                if (text.isBlank()) emptyList() else parseBreezeVoices(text)
            }
        }
}

internal fun parseBreezeVoices(json: String): List<BreezeVoiceSummary> {
    val array = JSONObject(json).optJSONArray("voices") ?: return emptyList()
    return buildList {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val id = item.optString("voice_id")
            if (id.isBlank()) continue
            add(
                BreezeVoiceSummary(
                    id = id,
                    name = item.optString("name").ifBlank { id },
                    languageCode = item.optString("language_code").takeIf { it.isNotBlank() },
                    description = item.optString("description").takeIf { it.isNotBlank() },
                )
            )
        }
    }
}
