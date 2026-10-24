package me.rerere.rikkahub.ui.hooks

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.platform.LocalDensity

/**
 * 输入法弹出时把对话内容往上带。
 *
 * 只在「收起 → 展开」的那一刻问一次用户是不是在底部：不在底部就一帧都不动，正在
 * 往上翻历史时视野保持不动。要跟的话，动画期间每一帧把列表钉到最后一条，内容自然
 * 贴着输入栏上沿走。
 *
 * 钉底用 [LazyListState.requestScrollToItem] 一次请求，不拿 scrollBy 去追位移：
 * 绝对位置不会欠账，也不会一帧里滚好几个整屏。也不去算键盘让留白长了多少 ——
 * 留白是布局自己长出来的，钉住底部就够了。
 */
@Composable
fun ImeLazyListAutoScroller(
    lazyListState: LazyListState,
    isNearBottom: () -> Boolean,
    enabled: () -> Boolean = { true },
) {
    val density = LocalDensity.current
    // 判断「键盘在不在」只能用 ime 自己的高度：拿「导航栏 ∪ 键盘」的高度来判断的话，
    // 导航栏高度不为 0 的机型会一直被判成「键盘已弹出」，跟随一次都不会发生。
    val ime = WindowInsets.ime
    val currentIsNearBottom by rememberUpdatedState(isNearBottom)
    val currentEnabled by rememberUpdatedState(enabled)

    LaunchedEffect(lazyListState) {
        // 只追踪键盘高度：它每变一帧就来一次，正好一帧钉一次；
        // 收起后高度归 0，复位等下回弹出再重新判断。
        var keyboardShown = false
        var follow = false
        snapshotFlow { ime.getBottom(density) }.collect { height ->
            if (height == 0) {
                keyboardShown = false
                follow = false
                return@collect
            }
            if (!keyboardShown) {
                // 刚抬起：按这一刻用户的位置决定跟不跟
                keyboardShown = true
                follow = currentIsNearBottom()
            }
            // 手指按在列表上、或者列表还在惯性里时不抢滚动权
            if (!follow || !currentEnabled() || lazyListState.isScrollInProgress) return@collect
            val lastIndex = lazyListState.layoutInfo.totalItemsCount - 1
            if (lastIndex >= 0) lazyListState.requestScrollToItem(lastIndex)
        }
    }
}
