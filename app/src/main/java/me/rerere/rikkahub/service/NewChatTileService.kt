package me.rerere.rikkahub.service

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService
import me.rerere.rikkahub.ACTION_NEW_CHAT
import me.rerere.rikkahub.RouteActivity

/**
 * 通知栏下拉面板里的「新建对话」磁贴。
 *
 * 行为和长按应用图标里的同名快捷方式一致：复用已有的 RouteActivity 实例，把导航栈清成一个新对话，
 * 所以侧滑返回会直接回到桌面。会话内容存在数据库里，不受影响；正在生成的会话也不会因为界面被销毁而中断。
 *
 * 磁贴不会自动出现在面板里，需要用户自己进编辑模式拖出来。
 */
class NewChatTileService : TileService() {
    override fun onClick() {
        val intent = Intent(this, RouteActivity::class.java).apply {
            action = ACTION_NEW_CHAT
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14 起必须传 PendingIntent，直接传 Intent 的那个重载已废弃
            startActivityAndCollapse(
                PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
