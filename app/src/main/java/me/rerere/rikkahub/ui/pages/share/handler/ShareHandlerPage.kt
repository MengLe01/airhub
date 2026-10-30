package me.rerere.rikkahub.ui.pages.share.handler

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch
import me.rerere.hugeicons.HugeIcons
import me.rerere.hugeicons.stroke.File02
import me.rerere.rikkahub.R
import me.rerere.rikkahub.data.files.FilesManager
import me.rerere.rikkahub.ui.context.LocalNavController
import me.rerere.rikkahub.utils.base64Encode
import me.rerere.rikkahub.utils.navigateToChatPage
import me.rerere.rikkahub.utils.plus
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import org.koin.core.parameter.parametersOf

@Composable
fun ShareHandlerPage(text: String, files: List<String>) {
    val vm: ShareHandlerVM = koinViewModel(parameters = { parametersOf(text) })
    val filesManager: FilesManager = koinInject()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val navController = LocalNavController.current

    // 分享进来的附件：图片给出预览，其它类型只显示文件名与类型
    val attachments = remember(files) {
        files.map { raw ->
            val uri = raw.toUri()
            SharedAttachment(
                uri = uri,
                name = runCatching { filesManager.getFileNameFromUri(uri) }.getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?: uri.lastPathSegment.orEmpty(),
                mime = runCatching { filesManager.getFileMimeType(uri) }.getOrNull().orEmpty(),
            )
        }
    }
    val images = attachments.filter { it.mime.startsWith("image/") }
    val others = attachments.filterNot { it.mime.startsWith("image/") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(stringResource(R.string.share_handler_page_title))
                }
            )
        }
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = it + PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (vm.shareText.isNotBlank() || attachments.isNotEmpty()) {
                item {
                    Card {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            if (vm.shareText.isNotBlank()) {
                                Text(
                                    text = vm.shareText,
                                    maxLines = 5,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }

                            if (images.isNotEmpty()) {
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    items(images.size) { index ->
                                        AsyncImage(
                                            model = images[index].uri,
                                            contentDescription = images[index].name,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier
                                                .size(96.dp)
                                                .clip(RoundedCornerShape(12.dp)),
                                        )
                                    }
                                }
                            }

                            others.forEach { file ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = HugeIcons.File02,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Column {
                                        Text(
                                            text = file.name,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        if (file.mime.isNotBlank()) {
                                            Text(
                                                text = file.mime,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            items(settings.assistants) { assistant ->
                Surface(
                    onClick = {
                        scope.launch {
                            vm.updateAssistant(assistant.id)
                            navigateToChatPage(
                                navigator = navController,
                                initText = vm.shareText.base64Encode(),
                                initFiles = attachments.map { it.uri }
                            )
                        }
                    },
                    tonalElevation = 4.dp,
                    shape = MaterialTheme.shapes.medium
                ) {
                    ListItem(
                        headlineContent = {
                            Text(
                                text = assistant.name.ifEmpty {
                                    stringResource(R.string.assistant_page_default_assistant)
                                },
                                maxLines = 1
                            )
                        },
                    )
                }
            }
        }
    }
}

private data class SharedAttachment(
    val uri: Uri,
    val name: String,
    val mime: String,
)
