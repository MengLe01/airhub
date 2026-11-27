import { useTranslation } from "react-i18next";

import { AIIcon } from "~/components/ui/ai-icon";
import { UIAvatar } from "~/components/ui/ui-avatar";
import { useSettingsStore } from "~/stores";
import type { AssistantProfile, MessageDto, ProviderModel } from "~/types";

export interface ChatMessageAvatarRowProps {
  message: MessageDto;
  hasMessageContent: boolean;
  loading: boolean;
  assistant?: AssistantProfile | null;
  model?: ProviderModel | null;
}

export function ChatMessageAvatarRow({
  message,
  hasMessageContent,
  loading,
  assistant,
  model,
}: ChatMessageAvatarRowProps) {
  const { t } = useTranslation(["common", "page"]);
  const displaySetting = useSettingsStore((state) => state.settings?.displaySetting);

  if (!hasMessageContent) {
    return null;
  }

  if (message.role === "USER") {
    if (!displaySetting?.showUserAvatar) {
      return null;
    }

    const userName =
      displaySetting.userNickname.trim() ||
      t("page:conversations.user.default_name", { defaultValue: "User" });

    return (
      <div className="flex w-full justify-end">
        <div className="flex items-center gap-2">
          <div className="min-w-0 truncate text-sm font-medium text-foreground/90">{userName}</div>
          <UIAvatar name={userName} avatar={displaySetting.userAvatar} className="size-9" />
        </div>
      </div>
    );
  }

  if (message.role !== "ASSISTANT") {
    return null;
  }

  const showModelIcon = displaySetting?.showModelIcon !== false;
  const showModelName = displaySetting?.showModelName === true;

  // 模型被删除后用消息上的快照；两者都没有时退回助手名称
  const modelInfo = model ?? message.modelSnapshot ?? null;
  const useAssistantAvatar = assistant?.useAssistantAvatar === true;
  const defaultAssistantName = t("common:quick_jump.role_assistant", { defaultValue: "Assistant" });
  const assistantName = assistant?.name?.trim() || defaultAssistantName;
  const modelName = modelInfo
    ? modelInfo.displayName.trim() || modelInfo.modelId.trim() || defaultAssistantName
    : assistantName;
  const title = useAssistantAvatar ? assistantName : modelName;

  const icon = !showModelIcon ? null : useAssistantAvatar ? (
    <UIAvatar name={assistantName} avatar={assistant?.avatar} className="size-9" />
  ) : modelInfo ? (
    <AIIcon
      name={modelInfo.modelId}
      size={36}
      loading={loading}
      className="bg-secondary"
      imageClassName="h-[72%] w-[72%]"
    />
  ) : null;
  if (!icon && !showModelName) {
    return null;
  }

  return (
    <div className="flex w-full justify-start">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        {showModelName ? (
          <div className="min-w-0 truncate text-sm font-medium text-foreground/90">{title}</div>
        ) : null}
      </div>
    </div>
  );
}
