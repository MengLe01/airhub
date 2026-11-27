import * as React from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { useTranslation } from "react-i18next";

import { cn } from "~/lib/utils";

export interface InfiniteScrollAreaProps extends Omit<React.ComponentProps<"div">, "id"> {
  /** Total count of currently loaded items (used by InfiniteScroll internally) */
  dataLength: number;
  /** Callback to load the next page */
  next: () => void;
  /** Whether more items are available */
  hasMore: boolean;
  /** Element shown while loading more items */
  loader?: React.ReactNode;
  /** Stable unique id for the scrollable container */
  scrollTargetId?: string;
  /**
   * 鼠标移入或滚动时才画出滚动条，离开或停手一段时间后自动消失。
   * 原生 webkit 滚动条的 thumb 没法做过渡动画，只能靠 data-scrolling 开关显隐。
   */
  autoHideScrollbar?: boolean;
}

function InfiniteScrollArea({
  className,
  children,
  dataLength,
  next,
  hasMore,
  loader,
  scrollTargetId = "infinite-scroll-target",
  autoHideScrollbar = false,
  onScroll,
  onPointerEnter,
  onPointerLeave,
  ...props
}: InfiniteScrollAreaProps) {
  const { t } = useTranslation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const hideTimer = React.useRef<number | null>(null);
  const hovering = React.useRef(false);

  React.useEffect(() => {
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // 显隐只改 data 属性，不触发 React 重渲染
  const scheduleHide = React.useCallback((element: HTMLElement, delay: number) => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      delete element.dataset.scrolling;
    }, delay);
  }, []);

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      onScroll?.(event);
      if (!autoHideScrollbar) return;

      const element = event.currentTarget;
      element.dataset.scrolling = "true";
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      // 鼠标还停在列表上就保持常显，离开时由 pointerleave 收尾
      if (!hovering.current) scheduleHide(element, 900);
    },
    [autoHideScrollbar, onScroll, scheduleHide],
  );

  const handlePointerEnter = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerEnter?.(event);
      if (!autoHideScrollbar) return;
      hovering.current = true;
      event.currentTarget.dataset.scrolling = "true";
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [autoHideScrollbar, onPointerEnter],
  );

  const handlePointerLeave = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(event);
      if (!autoHideScrollbar) return;
      hovering.current = false;
      // 留一小段时间再收，避免鼠标划出划进时闪一下
      scheduleHide(event.currentTarget, 700);
    },
    [autoHideScrollbar, onPointerLeave, scheduleHide],
  );

  const defaultLoader = (
    <div className="px-2 py-2 text-center text-xs text-muted-foreground">
      {t("infinite_scroll.load_more")}
    </div>
  );
  const effectiveLoader = loader ?? defaultLoader;

  // When the container isn't scrollable (content shorter than viewport)
  // but there's still more data, auto-trigger the next load.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasMore) return;

    // Wait a frame so the DOM has been updated with the latest children.
    const rafId = requestAnimationFrame(() => {
      if (el.scrollHeight <= el.clientHeight) {
        next();
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [dataLength, hasMore, next]);

  return (
    <div
      ref={containerRef}
      data-slot="infinite-scroll-area"
      id={scrollTargetId}
      className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", className)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onScroll={handleScroll}
      {...props}
    >
      <InfiniteScroll
        dataLength={dataLength}
        next={next}
        hasMore={hasMore}
        loader={effectiveLoader}
        scrollableTarget={scrollTargetId}
      >
        {children}
      </InfiniteScroll>
    </div>
  );
}

export { InfiniteScrollArea };
