package me.rerere.rikkahub.ui.hooks

import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.text.selection.SelectionState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier

/**
 * 记录当前有哪些文本区块存在活动选区。
 *
 * 拖动列表收键盘时会 clearFocus，而清焦点会连带把选区一起清掉
 *（SelectionManager 在焦点丢失时调 onRelease，把 selection 置为 null）。
 * 所以拖动之前先问一句有没有选区：有就跳过清焦点，让 Compose 自己收键盘
 *（选中文字时焦点会转到 SelectionManager，输入框失焦，键盘自然收起）。
 *
 * 只记实例、不存快照，读取发生在手势回调里，所以用普通 List 就够，
 * 不需要可观察状态，也不会引起重组。
 */
@Stable
class ChatSelectionTracker {
    private val states = mutableListOf<SelectionState>()

    fun register(state: SelectionState) {
        if (states.none { it === state }) {
            states += state
        }
    }

    fun unregister(state: SelectionState) {
        states.removeAll { it === state }
    }

    /** 有任意一处正在选中文字时为 true */
    fun hasSelection(): Boolean = states.any { it.selectedTexts.isNotEmpty() }
}

val LocalChatSelectionTracker = compositionLocalOf<ChatSelectionTracker?> { null }

/**
 * 带选区登记的 [SelectionContainer]。
 *
 * 没有外层 tracker 时（消息以外的场景）行为与普通 SelectionContainer 一致。
 */
@Composable
fun TrackedSelectionContainer(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val tracker = LocalChatSelectionTracker.current
    val state = remember { SelectionState() }

    if (tracker != null) {
        DisposableEffect(tracker, state) {
            tracker.register(state)
            onDispose { tracker.unregister(state) }
        }
    }

    SelectionContainer(state = state, modifier = modifier, content = content)
}
