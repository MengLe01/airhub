import * as React from "react";

import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { extractTableDataFromElement, tableDataToMarkdown } from "streamdown";

import { copyTextToClipboard } from "~/lib/clipboard";

const COPY_FEEDBACK_MS = 1500;

/**
 * 表格：右上角只留一个「复制」，把表格转成 Markdown 文本，不弹确认。
 *
 * 只覆盖 table 这一个元素，thead/tbody/tr/th/td 仍交给 streamdown，
 * 它们自带的 data-streamdown 标记继续被样式表接管——上游改表格结构时这里不用跟着改。
 * streamdown 自己那套复制下拉 / 下载 / 全屏由 controls 关掉，避免两套操作并存。
 */
export function MarkdownTable({
  children,
  node,
  ...props
}: React.ComponentProps<"table"> & { node?: unknown }) {
  void node;
  const { t } = useTranslation("markdown");
  const tableRef = React.useRef<HTMLTableElement>(null);
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = React.useCallback(async () => {
    const element = tableRef.current;
    if (!element) return;

    try {
      await copyTextToClipboard(tableDataToMarkdown(extractTableDataFromElement(element)));
      setCopied(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <div className="ds-table">
      {/* 预留一行给右上角的操作，悬停才显形（触屏常显） */}
      <div className="ds-table-actions">
        <button
          aria-label={t("table.copy_markdown")}
          className="ds-table-copy"
          onClick={() => {
            void handleCopy();
          }}
          type="button"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? t("code_block.copied") : t("code_block.copy")}</span>
        </button>
      </div>
      <div className="ds-table-scroll">
        <table ref={tableRef} {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

export const tableComponents = {
  table: ({ children, ...props }: React.ComponentProps<"table"> & { node?: unknown }) => (
    <MarkdownTable {...props}>{children}</MarkdownTable>
  ),
};
