import * as React from "react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useSettingsStore } from "~/stores";
import { useStickToBottomContext } from "use-stick-to-bottom";

export function getConversationMessageAnchorId(messageId: string): string {
  return `message-anchor-${messageId}`;
}

export interface ConversationQuickJumpItem {
  id: string;
  role: string;
  preview?: string;
}

interface ConversationQuickJumpProps {
  items: ConversationQuickJumpItem[];
}

function getRoleLabel(
  role: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const normalizedRole = role.toUpperCase();
  if (normalizedRole === "USER") return t("quick_jump.role_user");
  if (normalizedRole === "ASSISTANT") return t("quick_jump.role_assistant");
  return t("quick_jump.role_message");
}

/** 滚动停手后多久把定位条淡出 */
const RAIL_HIDE_DELAY_MS = 1600;

export function ConversationQuickJump({ items }: ConversationQuickJumpProps) {
  const { t } = useTranslation();
  const { scrollRef } = useStickToBottomContext();
  const showMessageJumper = useSettingsStore(
    (state) => state.settings?.displaySetting?.showMessageJumper ?? true,
  );
  const [activeMessageId, setActiveMessageId] = React.useState<string | null>(null);
  const [railVisible, setRailVisible] = React.useState(false);
  const canQuickJump = showMessageJumper && items.length > 1 && items.length <= 128;

  const resolveActiveMessageId = React.useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || items.length === 0) {
      return items[items.length - 1]?.id ?? null;
    }

    const scrollTopLine = scrollElement.getBoundingClientRect().top + 24;

    // 锚点在文档流里按 items 顺序排列，「是否越过分割线」是单调的，
    // 直接二分出最后一个越过的位置，每帧布局读取从 N 次降到 log2(N) 次。
    let low = 0;
    let high = items.length - 1;
    let activeIndex = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const anchor = document.getElementById(getConversationMessageAnchorId(items[mid].id));

      // 偶尔会有锚点还没挂上（懒加载 / 分支切换中），此时单调性不成立，退回线性扫描。
      if (!anchor) {
        let linearId = items[0]?.id ?? null;
        for (const item of items) {
          const element = document.getElementById(getConversationMessageAnchorId(item.id));
          if (!element) continue;
          if (element.getBoundingClientRect().top > scrollTopLine) break;
          linearId = item.id;
        }
        return linearId;
      }

      if (anchor.getBoundingClientRect().top <= scrollTopLine) {
        activeIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // 一条都没越过时高亮第一条，和原来的行为一致
    return (items[activeIndex] ?? items[0])?.id ?? null;
  }, [items, scrollRef]);

  React.useEffect(() => {
    if (!canQuickJump) {
      setActiveMessageId(null);
      setRailVisible(false);
      return;
    }

    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      setActiveMessageId(resolveActiveMessageId());
      return;
    }

    let frameId: number | null = null;
    let hideTimer: number | null = null;

    const updateActive = () => {
      frameId = null;
      const nextActiveId = resolveActiveMessageId();
      setActiveMessageId((prev) => (prev === nextActiveId ? prev : nextActiveId));
    };
    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateActive);
    };

    // 一次滚动只挂一个监听：高亮走 rAF，显隐走定时器，都在同一个回调里派发
    const handleScroll = () => {
      scheduleUpdate();
      setRailVisible(true);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setRailVisible(false), RAIL_HIDE_DELAY_MS);
    };

    updateActive();
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", scheduleUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
    };
  }, [canQuickJump, resolveActiveMessageId, scrollRef]);

  const handleQuickJump = React.useCallback((messageId: string) => {
    const anchor = document.getElementById(getConversationMessageAnchorId(messageId));
    if (!anchor) return;

    setActiveMessageId(messageId);
    anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!canQuickJump) {
    return null;
  }

  return (
    <div className="ds-quick-jump pointer-events-none absolute inset-y-0 right-0 z-20 hidden lg:block">
      <div
        className="ds-quick-jump-rail pointer-events-auto absolute top-1/2"
        data-visible={railVisible}
        onMouseEnter={() => setRailVisible(true)}
      >
        {items.map((item, index) => {
          const isActive = activeMessageId === item.id;
          const roleLabel = getRoleLabel(item.role, t);

          return (
            <Tooltip key={`quick-jump-${item.id}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="ds-quick-jump-item"
                  data-active={isActive}
                  aria-label={t("quick_jump.jump_to_message", {
                    index: index + 1,
                    role: roleLabel,
                  })}
                  title={t("quick_jump.message_title", { index: index + 1, role: roleLabel })}
                  onClick={() => {
                    handleQuickJump(item.id);
                  }}
                >
                  <span className="ds-quick-jump-mark" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="max-w-64 text-left">
                <div className="space-y-0.5">
                  <div className="text-[11px] text-background/75">
                    {index + 1}/{items.length} · {roleLabel}
                  </div>
                  <div>{item.preview?.trim() || t("quick_jump.no_preview")}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
