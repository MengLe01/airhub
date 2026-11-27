import * as React from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

/**
 * 替代 window.confirm / window.prompt 的确认与输入弹窗。
 * 浏览器原生弹窗在 WebView 里是系统样式，和界面完全脱节。
 *
 * 尺寸沿用上游 dialog 的默认外观；DeepSeek 主题的圆角、阴影、遮罩
 * 由 styles/deepseek.css 按 `.ds-dialog` 统一接管。
 */
const CONTENT_CLASS = "ds-dialog w-[380px] gap-0 p-0 sm:max-w-[380px]";

const BUTTON_CLASS = "ds-dialog-button h-10 min-w-[72px] rounded-full px-3.5";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText: string;
  cancelText: string;
  /** 危险操作：确认按钮用红色 */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  const handleConfirm = React.useCallback(async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }, [onConfirm, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={CONTENT_CLASS}
        overlayClassName="ds-dialog-overlay"
        // 自动聚焦会让「取消」按钮亮起一圈焦点环，弹窗一打开就有多余的视觉
        onOpenAutoFocus={(event) => event.preventDefault()}
        showCloseButton={false}
      >
        <div className="px-6 py-[22px]">
          <DialogHeader className="gap-0 text-left">
            <DialogTitle className="text-base font-semibold leading-6">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="mt-3 text-sm leading-[22px] text-label-secondary">
                {description}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              className={BUTTON_CLASS}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {cancelText}
            </Button>
            <Button
              className={BUTTON_CLASS}
              disabled={pending}
              onClick={() => {
                void handleConfirm();
              }}
              type="button"
              variant={destructive ? "destructive" : "default"}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText: string;
  cancelText: string;
  /** 允许提交空值，例如「拒绝工具调用」的原因是可选的 */
  allowEmpty?: boolean;
  onSubmit: (value: string) => void | Promise<void>;
}

/** 替代 window.prompt 的输入弹窗，外观与 ConfirmDialog 同一套 */
function PromptDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  defaultValue = "",
  confirmText,
  cancelText,
  allowEmpty = false,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = React.useState(defaultValue);
  const [pending, setPending] = React.useState(false);

  // 每次重新打开都回到默认值，避免上次输入残留
  React.useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [defaultValue, open]);

  const submit = React.useCallback(async () => {
    const trimmed = value.trim();
    if (!allowEmpty && !trimmed) return;
    setPending(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }, [allowEmpty, onOpenChange, onSubmit, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={CONTENT_CLASS}
        overlayClassName="ds-dialog-overlay"
        showCloseButton={false}
      >
        <div className="px-6 py-[22px]">
          <DialogHeader className="gap-0 text-left">
            <DialogTitle className="text-base font-semibold leading-6">{title}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            className="mt-3 h-10 rounded-full px-4 text-sm"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={placeholder}
            value={value}
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button
              className={BUTTON_CLASS}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {cancelText}
            </Button>
            <Button
              className={BUTTON_CLASS}
              disabled={pending || (!allowEmpty && value.trim().length === 0)}
              onClick={() => {
                void submit();
              }}
              type="button"
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog, PromptDialog };
export type { ConfirmDialogProps, PromptDialogProps };
