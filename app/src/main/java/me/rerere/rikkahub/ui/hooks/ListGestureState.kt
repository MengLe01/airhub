package me.rerere.rikkahub.ui.hooks

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput

/**
 * 列表上的手指状态。
 *
 * 只观察不消费，消息里的按钮、长按菜单照常工作。
 */
@Stable
class ListGestureState {
    // 手指是否按在列表上（包括还没超过 touch slop 的那一段）
    var isPressing by mutableStateOf(false)
        internal set

    // 点在没有任何子组件消费的地方（消息之间的空白、列表底部留白）
    internal var onBlankTap: (() -> Unit)? = null

    // 手指刚拖起来（超过 touch slop）的那一下，每条手势只触发一次
    internal var onDragStart: (() -> Unit)? = null
}

@Composable
fun rememberListGestureState(
    onBlankTap: () -> Unit = {},
    onDragStart: () -> Unit = {},
): ListGestureState {
    val state = remember { ListGestureState() }
    SideEffect {
        state.onBlankTap = onBlankTap
        state.onDragStart = onDragStart
    }
    return state
}

/**
 * 在 [PointerEventPass.Initial] 拿到按下、在 [PointerEventPass.Final] 拿到抬起，
 * 中间不消费事件，所以不会影响列表自己的拖动和子组件的点击。
 */
fun Modifier.observeListGestures(state: ListGestureState): Modifier = pointerInput(state) {
    val touchSlop = viewConfiguration.touchSlop
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        var moved = false
        var consumed = false
        state.isPressing = true
        try {
            var pressed = true
            while (pressed) {
                val event = awaitPointerEvent(PointerEventPass.Final)
                val change = event.changes.firstOrNull { it.id == down.id }
                if (change == null) {
                    pressed = false
                } else {
                    if (change.isConsumed) consumed = true
                    if (!moved && (change.position - down.position).getDistance() > touchSlop) {
                        // 一超过 slop 当场通知，不用让外面再挂一个观察者盯着状态
                        moved = true
                        state.onDragStart?.invoke()
                    }
                    pressed = change.pressed
                }
            }
        } finally {
            state.isPressing = false
        }
        // 被子组件消费掉的点击（按钮、可点的消息）不算「点空白」
        if (!moved && !consumed) state.onBlankTap?.invoke()
    }
}
