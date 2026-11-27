import * as React from "react";

import { useNavigate, useParams } from "react-router";

import {
  ConversationQuickJump,
  getConversationMessageAnchorId,
} from "~/components/conversation-quick-jump";
import { ConversationSidebar } from "~/components/conversation-sidebar";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "~/components/extended/conversation";
import { ChatInput } from "~/components/input/chat-input";
import { ChatMessage } from "~/components/message/chat-message";
import { ConversationSearchButton } from "~/components/conversation-search-button";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Drawer, DrawerContent } from "~/components/ui/drawer";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { TypingIndicator } from "~/components/ui/typing-indicator";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "~/components/ui/sidebar";
import { useIsMobile } from "~/hooks/use-mobile";
import { toConversationSummaryUpdate, useConversationList } from "~/hooks/use-conversation-list";
import { useCurrentAssistant } from "~/hooks/use-current-assistant";
import { useFolders } from "~/hooks/use-folders";
import { convertConversationToMarkdown, downloadMarkdown } from "~/lib/export-markdown";
import { cn } from "~/lib/utils";
import api, { sse } from "~/services/api";
import { useChatInputStore, useAppStore } from "~/stores";
import { WorkbenchHost } from "~/components/workbench/workbench-host";
import {
  useWorkbench,
  useWorkbenchController,
  WorkbenchProvider,
} from "~/components/workbench/workbench-context";
import {
  type ConversationDto,
  type MessageNodeDto,
  type MessageDto,
  type ConversationNodeUpdateEventDto,
  type ConversationErrorEventDto,
  type ConversationSnapshotEventDto,
  type ProviderModel,
  type Settings,
  type UIMessagePart,
  isNoticeOnly,
} from "~/types";
import { CirclePlus, FileDown, MessageSquare, Share } from "lucide-react";
import Logo from "~/components/logo";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import i18n from "~/i18n";

type ConversationStreamEvent =
  | ConversationSnapshotEventDto
  | ConversationNodeUpdateEventDto
  | ConversationErrorEventDto;

interface SelectedNodeMessage {
  node: MessageNodeDto;
  message: MessageNodeDto["messages"][number];
}
type ConversationSummaryUpdater = (update: ReturnType<typeof toConversationSummaryUpdate>) => void;

const EDIT_DRAFT_ATTACHMENT_MARK = "__from_message_attachment";
const EDIT_DRAFT_SOURCE_INDEX = "__from_message_source_index";
const EMPTY_INPUT_ATTACHMENTS: UIMessagePart[] = [];
const EMPTY_SUGGESTIONS: string[] = [];

interface EditDraft {
  text: string;
  attachments: UIMessagePart[];
  sourceParts: UIMessagePart[];
  textPartIndex: number | null;
}

interface EditingSession {
  messageId: string;
  sourceParts: UIMessagePart[];
  textPartIndex: number | null;
}

function createHomeDraftId() {
  return `home-${uuidv4()}`;
}

function truncatePreviewText(value: string, maxLength = 48): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function getQuickJumpPreview(
  message: MessageDto,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const textPreview = message.parts
    .filter((part): part is Extract<UIMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .find((text) => text.length > 0);

  if (textPreview) {
    return truncatePreviewText(textPreview.replace(/\s+/g, " "));
  }

  const fallbackPart = message.parts.find(Boolean);
  if (!fallbackPart) return t("conversations.preview.empty_message");

  switch (fallbackPart.type) {
    case "notice":
      return truncatePreviewText(fallbackPart.title.trim());
    case "image":
      return t("conversations.preview.image");
    case "video":
      return t("conversations.preview.video");
    case "audio":
      return t("conversations.preview.audio");
    case "document":
      return fallbackPart.fileName.trim().length > 0
        ? t("conversations.preview.document_with_name", {
            name: truncatePreviewText(fallbackPart.fileName.trim(), 32),
          })
        : t("conversations.preview.document");
    case "reasoning":
      return fallbackPart.reasoning.trim().length > 0
        ? truncatePreviewText(fallbackPart.reasoning.trim().replace(/\s+/g, " "))
        : t("conversations.preview.thinking");
    case "tool":
      return fallbackPart.toolName.trim().length > 0
        ? t("conversations.preview.tool_with_name", {
            name: truncatePreviewText(fallbackPart.toolName.trim(), 32),
          })
        : t("conversations.preview.tool_call");
    case "text":
      return t("conversations.preview.empty_message");
  }
}

function isAttachmentPart(
  part: UIMessagePart,
): part is Extract<UIMessagePart, { type: "image" | "video" | "audio" | "document" }> {
  return (
    part.type === "image" ||
    part.type === "video" ||
    part.type === "audio" ||
    part.type === "document"
  );
}

function getLastTextPartIndex(parts: UIMessagePart[]): number | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index]?.type === "text") {
      return index;
    }
  }

  return null;
}

function getDraftSourceIndex(part: UIMessagePart): number | null {
  const value = part.metadata?.[EDIT_DRAFT_SOURCE_INDEX];
  return typeof value === "number" ? value : null;
}

function toEditDraft(message: MessageDto): EditDraft | null {
  const textPartIndex = getLastTextPartIndex(message.parts);
  const text =
    textPartIndex !== null && message.parts[textPartIndex]?.type === "text"
      ? message.parts[textPartIndex].text
      : "";

  const attachments = message.parts.flatMap((part, index) => {
    if (!isAttachmentPart(part)) return [];

    return [
      {
        ...part,
        metadata: {
          ...part.metadata,
          [EDIT_DRAFT_ATTACHMENT_MARK]: true,
          [EDIT_DRAFT_SOURCE_INDEX]: index,
        },
      },
    ];
  });

  if (text.trim().length === 0 && attachments.length === 0) {
    return null;
  }

  return {
    text,
    attachments,
    sourceParts: message.parts,
    textPartIndex,
  };
}

function shouldDeleteAttachmentFileOnRemove(part: UIMessagePart): boolean {
  if (!part.metadata) return true;

  return part.metadata[EDIT_DRAFT_ATTACHMENT_MARK] !== true;
}

function stripEditDraftMetadata(parts: UIMessagePart[]): UIMessagePart[] {
  return parts.map((part) => {
    if (!part.metadata) {
      return part;
    }

    const hasEditMark =
      EDIT_DRAFT_ATTACHMENT_MARK in part.metadata || EDIT_DRAFT_SOURCE_INDEX in part.metadata;
    if (!hasEditMark) {
      return part;
    }

    const nextMetadata = { ...part.metadata };
    delete nextMetadata[EDIT_DRAFT_ATTACHMENT_MARK];
    delete nextMetadata[EDIT_DRAFT_SOURCE_INDEX];

    return {
      ...part,
      metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined,
    };
  });
}

function buildEditedParts(session: EditingSession, draftParts: UIMessagePart[]): UIMessagePart[] {
  const textPart = draftParts.find(
    (part): part is Extract<UIMessagePart, { type: "text" }> => part.type === "text",
  );
  const editedText = textPart?.text ?? "";

  const retainedAttachmentIndexes = new Set<number>();
  const appendedAttachments: UIMessagePart[] = [];

  draftParts.forEach((part) => {
    if (!isAttachmentPart(part)) return;

    if (part.metadata?.[EDIT_DRAFT_ATTACHMENT_MARK] === true) {
      const sourceIndex = getDraftSourceIndex(part);
      if (sourceIndex !== null) {
        retainedAttachmentIndexes.add(sourceIndex);
      }
      return;
    }

    appendedAttachments.push(part);
  });

  const preservedParts: UIMessagePart[] = [];

  session.sourceParts.forEach((part, index) => {
    if (session.textPartIndex !== null && index === session.textPartIndex && part.type === "text") {
      preservedParts.push({ ...part, text: editedText });
      return;
    }

    if (isAttachmentPart(part)) {
      if (retainedAttachmentIndexes.has(index)) {
        preservedParts.push(part);
      }
      return;
    }

    preservedParts.push(part);
  });

  if (session.textPartIndex === null && textPart && textPart.text.trim().length > 0) {
    return [textPart, ...preservedParts, ...appendedAttachments];
  }

  return [...preservedParts, ...appendedAttachments];
}

function applyNodeUpdate(
  conversation: ConversationDto,
  event: ConversationNodeUpdateEventDto,
): ConversationDto {
  if (conversation.id !== event.conversationId) {
    return conversation;
  }

  const nextNodes = [...conversation.messages];
  const indexById = nextNodes.findIndex((node) => node.id === event.nodeId);
  const targetIndex = indexById >= 0 ? indexById : event.nodeIndex;

  if (targetIndex < 0) {
    return conversation;
  }

  if (targetIndex < nextNodes.length) {
    nextNodes[targetIndex] = event.node;
  } else if (targetIndex === nextNodes.length) {
    nextNodes.push(event.node);
  } else {
    return conversation;
  }

  return {
    ...conversation,
    messages: nextNodes,
    updateAt: event.updateAt,
    isGenerating: event.isGenerating,
  };
}

function useConversationDetail(activeId: string | null, updateSummary: ConversationSummaryUpdater) {
  const { t } = useTranslation("page");
  const [detail, setDetail] = React.useState<ConversationDto | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  const resetDetail = React.useCallback(() => {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  React.useEffect(() => {
    if (!activeId) {
      resetDetail();
      return;
    }

    let mounted = true;
    setDetailLoading(true);
    setDetailError(null);

    const abortController = new AbortController();

    api
      .get<ConversationDto>(`conversations/${activeId}`)
      .then((data) => {
        if (!mounted) return;
        setDetail(data);
        updateSummary(toConversationSummaryUpdate(data));
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setDetailError(err.message || t("conversations.errors.load_detail_failed"));
        setDetail(null);
      })
      .finally(() => {
        if (!mounted) return;
        setDetailLoading(false);
      });

    void sse<ConversationStreamEvent>(
      `conversations/${activeId}/stream`,
      {
        onMessage: ({ event, data }) => {
          if (!mounted) return;

          if (event === "error" && data.type === "error") {
            toast.error(data.message);
            return;
          }

          if (event === "snapshot" && data.type === "snapshot") {
            useAppStore.getState().setClockOffset(data.serverTime);
            setDetail(data.conversation);
            updateSummary(toConversationSummaryUpdate(data.conversation));
            setDetailError(null);
            setDetailLoading(false);
            return;
          }

          if (event !== "node_update" || data.type !== "node_update") return;

          useAppStore.getState().setClockOffset(data.serverTime);
          setDetail((prev) => {
            if (!prev) return prev;
            const next = applyNodeUpdate(prev, data);
            if (next === prev) return prev;
            if (prev.isGenerating !== next.isGenerating) {
              updateSummary(toConversationSummaryUpdate(next));
            }
            return next;
          });
          setDetailError(null);
          setDetailLoading(false);
        },
        onError: (streamError) => {
          if (!mounted) return;
          console.error("Conversation detail SSE error:", streamError);
        },
      },
      { signal: abortController.signal },
    );

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, [activeId, resetDetail, t, updateSummary]);

  const selectedNodeMessages = React.useMemo<SelectedNodeMessage[]>(() => {
    if (!detail) return [];
    return detail.messages.map((node) => ({
      node,
      message: node.messages[node.selectIndex] ?? node.messages[0],
    }));
  }, [detail]);

  return {
    detail,
    detailLoading,
    detailError,
    selectedNodeMessages,
    resetDetail,
  };
}

function useDraftInputController({
  activeId,
  isHomeRoute,
  homeDraftId,
  setHomeDraftId,
  folderId,
  navigate,
  refreshList,
}: {
  activeId: string | null;
  isHomeRoute: boolean;
  homeDraftId: string;
  folderId: string | null;
  setHomeDraftId: React.Dispatch<React.SetStateAction<string>>;
  navigate: ReturnType<typeof useNavigate>;
  refreshList: () => void;
}) {
  const draftKey = activeId ?? (isHomeRoute ? homeDraftId : null);
  const draft = useChatInputStore(
    React.useCallback((state) => (draftKey ? state.drafts[draftKey] : undefined), [draftKey]),
  );

  const setDraftText = useChatInputStore((state) => state.setText);
  const addDraftParts = useChatInputStore((state) => state.addParts);
  const removeDraftPart = useChatInputStore((state) => state.removePartAt);
  const getSubmitParts = useChatInputStore((state) => state.getSubmitParts);
  const clearDraft = useChatInputStore((state) => state.clearDraft);

  const inputText = draft?.text ?? "";
  const inputAttachments = draft?.parts ?? EMPTY_INPUT_ATTACHMENTS;

  const handleInputTextChange = React.useCallback(
    (text: string) => {
      if (!draftKey) return;
      setDraftText(draftKey, text);
    },
    [draftKey, setDraftText],
  );

  const handleAddInputParts = React.useCallback(
    (parts: UIMessagePart[]) => {
      if (!draftKey || parts.length === 0) return;
      addDraftParts(draftKey, parts);
    },
    [addDraftParts, draftKey],
  );

  const handleRemoveInputPart = React.useCallback(
    (index: number) => {
      if (!draftKey) return;
      removeDraftPart(draftKey, index);
    },
    [draftKey, removeDraftPart],
  );

  const handleSubmit = React.useCallback(async () => {
    if (!draftKey) return;

    const parts = getSubmitParts(draftKey);
    if (parts.length === 0) return;

    if (activeId) {
      await api.post<{ status: string }>(`conversations/${activeId}/messages`, { parts });
      clearDraft(draftKey);
      return;
    }

    const conversationId = uuidv4();
    setHomeDraftId(createHomeDraftId());

    await api.post<{ status: string }>(`conversations/${conversationId}/messages`, {
      parts,
      folderId,
    });
    clearDraft(draftKey);

    navigate(`/c/${conversationId}`);
    refreshList();
  }, [
    activeId,
    clearDraft,
    draftKey,
    folderId,
    getSubmitParts,
    navigate,
    refreshList,
    setHomeDraftId,
  ]);

  const replaceDraft = React.useCallback(
    (text: string, parts: UIMessagePart[]) => {
      if (!draftKey) return;
      clearDraft(draftKey);
      setDraftText(draftKey, text);
      addDraftParts(draftKey, parts);
    },
    [addDraftParts, clearDraft, draftKey, setDraftText],
  );

  const clearCurrentDraft = React.useCallback(() => {
    if (!draftKey) return;
    clearDraft(draftKey);
  }, [clearDraft, draftKey]);

  const getCurrentSubmitParts = React.useCallback(() => {
    if (!draftKey) return [];
    return getSubmitParts(draftKey);
  }, [draftKey, getSubmitParts]);

  return {
    draftKey,
    inputText,
    inputAttachments,
    handleInputTextChange,
    handleAddInputParts,
    handleRemoveInputPart,
    handleSubmit,
    replaceDraft,
    clearCurrentDraft,
    getCurrentSubmitParts,
  };
}

const ConversationTimeline = React.memo(
  ({
    activeId,
    isHomeRoute,
    detailLoading,
    detailError,
    selectedNodeMessages,
    isGenerating,
    settings,
    conversationAssistantId,
    contentClassName,
    onEdit,
    onDelete,
    onFork,
    onRegenerate,
    onSelectBranch,
    onToolApproval,
  }: {
    activeId: string | null;
    isHomeRoute: boolean;
    detailLoading: boolean;
    detailError: string | null;
    selectedNodeMessages: SelectedNodeMessage[];
    isGenerating: boolean;
    settings: Settings | null;
    conversationAssistantId: string | null;
    contentClassName?: string;
    onEdit: (message: MessageDto) => void | Promise<void>;
    onDelete: (messageId: string) => Promise<void>;
    onFork: (messageId: string) => Promise<void>;
    onRegenerate: (messageId: string) => Promise<void>;
    onSelectBranch: (nodeId: string, selectIndex: number) => Promise<void>;
    onToolApproval: (
      toolCallId: string,
      approved: boolean,
      reason: string,
      answer?: string,
    ) => Promise<void>;
  }) => {
    const { t } = useTranslation("page");
    const canQuickJump =
      Boolean(activeId) && !detailLoading && !detailError && selectedNodeMessages.length > 1;
    // 每次渲染都新建数组会让 quick jump 里的监听与缓存全部作废，这里固定引用
    const quickJumpItems = React.useMemo(() => {
      if (!canQuickJump) return [];
      return selectedNodeMessages
        .filter(({ message }) => !isNoticeOnly(message))
        .map(({ message }) => ({
          id: message.id,
          role: message.role,
          preview: getQuickJumpPreview(message, t),
        }));
    }, [canQuickJump, selectedNodeMessages, t]);
    const assistant = React.useMemo(() => {
      if (!settings || !conversationAssistantId) return null;
      return settings.assistants.find((item) => item.id === conversationAssistantId) ?? null;
    }, [conversationAssistantId, settings]);
    const modelById = React.useMemo(() => {
      const map = new Map<string, ProviderModel>();
      if (!settings) return map;

      for (const provider of settings.providers) {
        for (const model of provider.models) {
          if (!map.has(model.id)) {
            map.set(model.id, model);
          }
        }
      }

      return map;
    }, [settings]);

    return (
      <Conversation className="flex-1 min-h-0">
        <ConversationContent
          className={cn("ds-chat-column gap-4 px-4 py-6 md:px-11", contentClassName)}
        >
          {!activeId && !isHomeRoute && (
            <ConversationEmptyState
              icon={<MessageSquare className="size-10" />}
              title={t("conversations.empty_state.select_title")}
              description={t("conversations.empty_state.select_description")}
            />
          )}
          {activeId && detailLoading && (
            <ConversationEmptyState
              title={t("conversations.empty_state.loading_title")}
              description={t("conversations.empty_state.loading_description")}
            />
          )}
          {activeId && detailError && (
            <ConversationEmptyState
              title={t("conversations.empty_state.error_title")}
              description={detailError}
            />
          )}
          {!detailLoading && !detailError && activeId && selectedNodeMessages.length === 0 && (
            <ConversationEmptyState
              icon={<MessageSquare className="size-10" />}
              title={t("conversations.empty_state.no_message_title")}
              description={t("conversations.empty_state.no_message_description")}
            />
          )}
          {!detailLoading &&
            !detailError &&
            activeId &&
            selectedNodeMessages.map(({ node, message }, index) => {
              const model = message.modelId ? (modelById.get(message.modelId) ?? null) : null;

              return (
                <div
                  key={message.id}
                  id={getConversationMessageAnchorId(message.id)}
                  className="scroll-mt-24"
                >
                  <ChatMessage
                    node={node}
                    message={message}
                    loading={isGenerating && index === selectedNodeMessages.length - 1}
                    isLastMessage={index === selectedNodeMessages.length - 1}
                    assistant={assistant}
                    model={model}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onFork={onFork}
                    onRegenerate={onRegenerate}
                    onSelectBranch={onSelectBranch}
                    onToolApproval={onToolApproval}
                  />
                </div>
              );
            })}
          {!detailLoading && !detailError && activeId && isGenerating && (
            <div className="flex items-start py-2">
              <TypingIndicator className="px-1 py-2" />
            </div>
          )}
        </ConversationContent>

        {canQuickJump ? <ConversationQuickJump items={quickJumpItems} /> : null}

        <ConversationScrollButton
          aria-label={t("conversations.header.scroll_to_bottom")}
          title={t("conversations.header.scroll_to_bottom")}
        />
      </Conversation>
    );
  },
);

export function meta() {
  return [
    { title: i18n.t("page:conversations.meta.title") },
    {
      name: "description",
      content: i18n.t("page:conversations.meta.description"),
    },
  ];
}

/** 桌面端侧边栏展开时收起按钮在侧边栏里，收起后才在主区左上角出现；
    移动端侧边栏是覆盖式抽屉，state 恒为桌面端的开合值，必须始终给出入口 */
function CollapsedHeaderActions({
  onSelect,
  onCreateConversation,
}: {
  onSelect: (id: string) => void;
  onCreateConversation: () => void;
}) {
  const { t } = useTranslation();
  const { state, isMobile } = useSidebar();

  // 移动端仍是单独的汉堡按钮，展开后交给抽屉
  if (isMobile) {
    return <SidebarTrigger className="text-muted-foreground hover:text-foreground" />;
  }
  if (state !== "collapsed") return null;

  // 收起后和 DeepSeek 一致：左边留空不放 logo，三个入口收进一条胶囊
  return (
    <div className="ds-icon-cluster flex shrink-0 items-center">
      <SidebarTrigger className="ds-icon-btn size-[34px]" />
      <ConversationSearchButton className="ds-icon-btn size-[34px]" iconOnly onSelect={onSelect} />
      <Button
        aria-label={t("conversation_sidebar.new_conversation")}
        className="ds-icon-btn size-[34px]"
        onClick={onCreateConversation}
        size="icon"
        title={t("conversation_sidebar.new_conversation")}
        variant="ghost"
      >
        <CirclePlus className="size-[18px]" />
      </Button>
    </div>
  );
}

export default function ConversationsPage() {
  const workbench = useWorkbenchController();

  return (
    <WorkbenchProvider value={workbench}>
      <ConversationsPageInner />
    </WorkbenchProvider>
  );
}

function ConversationsPageInner() {
  const { t } = useTranslation("page");
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isHomeRoute = !routeId;
  const isMobile = useIsMobile();
  const { panel, closePanel } = useWorkbench();

  const { settings, assistants, currentAssistantId } = useCurrentAssistant();
  const {
    folders,
    selectedFolderId,
    setSelectedFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    moveConversationToFolder,
  } = useFolders(currentAssistantId);
  const {
    conversations,
    activeId,
    setActiveId,
    loading,
    error,
    hasMore,
    loadMore,
    refreshList,
    updateConversationSummary,
  } = useConversationList({
    currentAssistantId,
    routeId,
    autoSelectFirst: !isHomeRoute,
    folderId: selectedFolderId,
  });

  const [homeDraftId, setHomeDraftId] = React.useState(() => createHomeDraftId());
  const [editingSession, setEditingSession] = React.useState<EditingSession | null>(null);

  const { detail, detailLoading, detailError, selectedNodeMessages, resetDetail } =
    useConversationDetail(activeId, updateConversationSummary);

  const {
    draftKey,
    inputText,
    inputAttachments,
    handleInputTextChange,
    handleAddInputParts,
    handleRemoveInputPart,
    handleSubmit,
    replaceDraft,
    clearCurrentDraft,
    getCurrentSubmitParts,
  } = useDraftInputController({
    activeId,
    isHomeRoute,
    homeDraftId,
    setHomeDraftId,
    folderId: selectedFolderId,
    navigate,
    refreshList,
  });

  const activeConversation = conversations.find((item) => item.id === activeId);
  const chatSuggestions = detail?.chatSuggestions ?? EMPTY_SUGGESTIONS;

  React.useEffect(() => {
    const base = t("conversations.meta.title");
    document.title = activeConversation?.title ? `${activeConversation.title} - ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [activeConversation?.title, t]);
  const isNewChat = isHomeRoute && !activeId;

  // 欢迎语每次进来随机一条，下标只在挂载时抽一次，重渲染不会跳；
  // 切语言时靠 t 重新取值
  const welcomeIndex = React.useMemo(() => Math.floor(Math.random() * 4), []);
  const welcomePrompts = React.useMemo(
    () => [
      t("conversations.welcome_prompt"),
      t("conversations.welcome_prompt_2"),
      t("conversations.welcome_prompt_3"),
      t("conversations.welcome_prompt_4"),
    ],
    [t],
  );
  const welcomePrompt = welcomePrompts[welcomeIndex] ?? welcomePrompts[0];
  const showSuggestions =
    Boolean(activeId) && !detailLoading && !detailError && chatSuggestions.length > 0;
  const displaySuggestions = showSuggestions ? chatSuggestions : EMPTY_SUGGESTIONS;

  const handleSelect = React.useCallback(
    (id: string) => {
      setActiveId(id);
      if (routeId !== id) {
        navigate(`/c/${id}`);
      }
    },
    [navigate, routeId, setActiveId],
  );

  React.useEffect(() => {
    setEditingSession(null);
  }, [activeId]);

  const handleAssistantChange = React.useCallback(
    async (assistantId: string) => {
      await api.post<{ status: string }>("settings/assistant", { assistantId });
      setActiveId(null);
      resetDetail();
      if (routeId) {
        navigate("/", { replace: true });
      }
      refreshList();
    },
    [navigate, refreshList, resetDetail, routeId, setActiveId],
  );

  const handleToolApproval = React.useCallback(
    async (toolCallId: string, approved: boolean, reason: string, answer?: string) => {
      if (!activeId) return;
      await api.post<{ status: string }>(`conversations/${activeId}/tool-approval`, {
        toolCallId,
        approved,
        reason,
        ...(answer != null ? { answer } : {}),
      });
    },
    [activeId],
  );

  const handleRegenerate = React.useCallback(
    async (messageId: string) => {
      if (!activeId) return;
      await api.post<{ status: string }>(`conversations/${activeId}/regenerate`, {
        messageId,
      });
    },
    [activeId],
  );

  const handleSelectBranch = React.useCallback(
    async (nodeId: string, selectIndex: number) => {
      if (!activeId) return;
      await api.post<{ status: string }>(`conversations/${activeId}/nodes/${nodeId}/select`, {
        selectIndex,
      });
    },
    [activeId],
  );

  const handleDeleteMessage = React.useCallback(
    async (messageId: string) => {
      if (!activeId) return;
      await api.delete<{ status: string }>(`conversations/${activeId}/messages/${messageId}`);
    },
    [activeId],
  );

  const handleForkMessage = React.useCallback(
    async (messageId: string) => {
      if (!activeId) return;
      const response = await api.post<{ conversationId: string }>(
        `conversations/${activeId}/fork`,
        {
          messageId,
        },
      );
      setActiveId(response.conversationId);
      navigate(`/c/${response.conversationId}`);
      refreshList();
    },
    [activeId, navigate, refreshList, setActiveId],
  );

  const handleStartEdit = React.useCallback(
    (message: MessageDto) => {
      if (!activeId || (message.role !== "USER" && message.role !== "ASSISTANT")) return;

      const draft = toEditDraft(message);
      if (!draft) return;

      setEditingSession({
        messageId: message.id,
        sourceParts: draft.sourceParts,
        textPartIndex: draft.textPartIndex,
      });
      replaceDraft(draft.text, draft.attachments);
    },
    [activeId, replaceDraft],
  );

  const handleCancelEdit = React.useCallback(() => {
    setEditingSession(null);
    clearCurrentDraft();
  }, [clearCurrentDraft]);

  const handleClickSuggestion = React.useCallback(
    (suggestion: string) => {
      if (editingSession) {
        setEditingSession(null);
      }
      handleInputTextChange(suggestion);
    },
    [editingSession, handleInputTextChange],
  );

  const handleSend = React.useCallback(async () => {
    if (!editingSession) {
      await handleSubmit();
      return;
    }

    if (!activeId) return;

    const draftParts = getCurrentSubmitParts();
    if (draftParts.length === 0) return;

    const nextParts = buildEditedParts(editingSession, draftParts);

    await api.post<{ status: string }>(
      `conversations/${activeId}/messages/${editingSession.messageId}/edit`,
      { parts: stripEditDraftMetadata(nextParts) },
    );

    setEditingSession(null);
    clearCurrentDraft();
  }, [activeId, clearCurrentDraft, editingSession, getCurrentSubmitParts, handleSubmit]);

  const handleTogglePinConversation = React.useCallback(
    async (conversationId: string) => {
      await api.post<{ status: string }>(`conversations/${conversationId}/pin`);
      refreshList();
    },
    [refreshList],
  );

  const handleRegenerateConversationTitle = React.useCallback(
    async (conversationId: string) => {
      await api.post<{ status: string }>(`conversations/${conversationId}/regenerate-title`);
      refreshList();
    },
    [refreshList],
  );

  const handleMoveConversation = React.useCallback(
    async (conversationId: string, assistantId: string) => {
      await api.post<{ status: string }>(`conversations/${conversationId}/move`, { assistantId });
      if (conversationId === activeId) {
        setActiveId(null);
        resetDetail();
        setHomeDraftId(createHomeDraftId());
        if (routeId === conversationId) {
          navigate("/", { replace: true });
        }
      }
      refreshList();
    },
    [activeId, navigate, refreshList, resetDetail, routeId, setActiveId],
  );

  const handleUpdateConversationTitle = React.useCallback(
    async (conversationId: string, title: string) => {
      await api.post<{ status: string }>(`conversations/${conversationId}/title`, { title });
      refreshList();
    },
    [refreshList],
  );

  const handleDeleteConversation = React.useCallback(
    async (conversationId: string) => {
      await api.delete<Record<string, never>>(`conversations/${conversationId}`, {
        parseJson: (raw) => (raw ? JSON.parse(raw) : {}),
      });
      if (conversationId === activeId) {
        setActiveId(null);
        resetDetail();
        setHomeDraftId(createHomeDraftId());
        if (routeId === conversationId) {
          navigate("/", { replace: true });
        }
      }
      refreshList();
    },
    [activeId, navigate, refreshList, resetDetail, routeId, setActiveId],
  );

  const handleSelectFolder = React.useCallback(
    (folderId: string | null) => {
      setSelectedFolderId(folderId);
    },
    [setSelectedFolderId],
  );

  const handleCreateFolder = React.useCallback(
    async (name: string) => {
      await createFolder(name);
    },
    [createFolder],
  );

  const handleRenameFolder = React.useCallback(
    async (id: string, name: string) => {
      await renameFolder(id, name);
    },
    [renameFolder],
  );

  const handleDeleteFolder = React.useCallback(
    async (id: string) => {
      await deleteFolder(id);
      refreshList();
    },
    [deleteFolder, refreshList],
  );

  const handleMoveConversationToFolder = React.useCallback(
    async (conversationId: string, folderId: string | null) => {
      await moveConversationToFolder(conversationId, folderId);
      refreshList();
    },
    [moveConversationToFolder, refreshList],
  );

  const handleCreateConversation = React.useCallback(() => {
    closePanel();
    setActiveId(null);
    resetDetail();
    setHomeDraftId(createHomeDraftId());

    if (routeId) {
      navigate("/");
    }
  }, [closePanel, navigate, resetDetail, routeId, setActiveId]);

  const handleStop = React.useCallback(async () => {
    if (!activeId) return;
    await api.post<{ status: string }>(`conversations/${activeId}/stop`);
  }, [activeId]);

  const hasWorkbenchPanel = Boolean(panel);
  const workbenchPanelRef = React.useRef<PanelImperativeHandle | null>(null);

  React.useEffect(() => {
    if (isMobile) return;

    const workbenchPanel = workbenchPanelRef.current;
    if (!workbenchPanel) return;

    if (hasWorkbenchPanel) {
      workbenchPanel.expand();
    } else {
      workbenchPanel.collapse();
    }
  }, [hasWorkbenchPanel, isMobile]);

  // 桌面端输入区浮在消息列表之上，需要实测高度给列表补底部留白，
  // 否则最后一条会被输入卡遮住。走 CSS 变量而不是 state：
  // 输入框随行数变高时会连续触发 ResizeObserver，setState 会把整页重渲染一遍，
  // 改变量只让浏览器重算这一块布局。
  const composerRef = React.useRef<HTMLDivElement>(null);
  const chatContentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = composerRef.current;
    const host = chatContentRef.current;
    if (!element || !host) return;

    const update = () => {
      host.style.setProperty(
        "--composer-height",
        `${Math.round(element.getBoundingClientRect().height)}px`,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isMobile]);

  // 进入已有对话时，消息是异步到达的：内容会先以「顶部」的滚动位置渲染出来，
  // 再被 StickToBottom 拉到最底部，看起来就是内容闪一下又瞬移。
  // 这里在滚动落到底之前先把列表藏起来（visibility 不占位变化，布局照常计算，
  // 所以库仍然能算出正确的高度并滚到底），到底后再显示。
  // 用「记录已揭示的会话 id」而不是布尔量：切走时自然变回未揭示，不会闪一帧旧内容。
  const [revealedFor, setRevealedFor] = React.useState<string | null>(null);
  const contentRevealed = revealedFor === activeId;

  React.useEffect(() => {
    if (contentRevealed || !activeId) return;
    // 数据还没到，继续等
    if (detailLoading || (!detail && !detailError)) return;
    // 出错时直接显示，把错误状态露出来比一直空着好
    if (detailError) {
      setRevealedFor(activeId);
      return;
    }

    // 最多等 12 帧；通常第二三帧就已经在底部了
    let frame = 0;
    let raf = 0;
    const check = () => {
      const scroller = document.querySelector('[role="log"] > div');
      frame += 1;
      const atBottom =
        !scroller || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2;
      if (atBottom || frame >= 12) {
        setRevealedFor(activeId);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [activeId, contentRevealed, detail, detailError, detailLoading]);

  // 分享 = 导出 Markdown。DeepSeek 在右上角放一个图标，点开才选导出粒度
  const canShare = Boolean(detail && detail.messages.length > 0);
  const handleExportConversation = React.useCallback(
    (includeReasoning: boolean) => {
      if (!detail || detail.messages.length === 0) return;
      const content = convertConversationToMarkdown(detail, includeReasoning);
      downloadMarkdown(content, `${detail.title || "conversation"}.md`);
    },
    [detail],
  );

  const chatContent = (
    <div
      ref={chatContentRef}
      className={cn(
        "relative flex flex-1 flex-col min-h-0 overflow-hidden",
        // 新会话的欢迎块整体居中，但容器留 64px 底边距，视觉上比正中高 32px
        isNewChat && "justify-center pb-16",
      )}
    >
      {!isNewChat && (
        <div
          className={cn(
            "relative flex min-h-0 flex-1",
            // 滚动落到底之前先藏起来，避免看到内容从顶部瞬移到底部
            !contentRevealed && "invisible",
          )}
        >
          <ConversationTimeline
            activeId={activeId}
            isHomeRoute={isHomeRoute}
            detailLoading={detailLoading}
            detailError={detailError}
            selectedNodeMessages={selectedNodeMessages}
            isGenerating={detail?.isGenerating ?? false}
            settings={settings}
            conversationAssistantId={detail?.assistantId ?? null}
            contentClassName="md:pb-[calc(var(--composer-height,0px)+12px)]"
            onEdit={handleStartEdit}
            onDelete={handleDeleteMessage}
            onFork={handleForkMessage}
            onRegenerate={handleRegenerate}
            onSelectBranch={handleSelectBranch}
            onToolApproval={handleToolApproval}
          />
        </div>
      )}

      <div
        ref={composerRef}
        className={cn(
          "shrink-0",
          // 桌面端输入区浮在消息列表之上，滚动条才能一直画到窗口底部
          !isNewChat && "md:pointer-events-none md:absolute md:inset-x-0 md:bottom-0 md:z-10",
        )}
      >
        {isNewChat && (
          <div className="mb-[21px] flex items-center justify-center gap-2 px-4">
            <Logo className="size-8 shrink-0 text-primary max-[439px]:size-7" />
            <p className="text-2xl font-semibold leading-8 text-foreground max-[439px]:text-xl max-[439px]:leading-7">
              {welcomePrompt}
            </p>
          </div>
        )}
        <ChatInput
          className={!isNewChat ? "md:pointer-events-auto" : undefined}
          welcome={isNewChat}
          value={inputText}
          attachments={inputAttachments}
          conversation={detail}
          ready={draftKey !== null}
          isGenerating={detail?.isGenerating ?? false}
          disabled={detailLoading || Boolean(detailError)}
          onValueChange={handleInputTextChange}
          onAddParts={handleAddInputParts}
          suggestions={displaySuggestions}
          onSuggestionClick={handleClickSuggestion}
          isEditing={Boolean(editingSession)}
          onCancelEdit={editingSession ? handleCancelEdit : undefined}
          shouldDeleteFileOnRemove={shouldDeleteAttachmentFileOnRemove}
          onRemovePart={handleRemoveInputPart}
          onSend={handleSend}
          onStop={activeId ? handleStop : undefined}
        />
      </div>
    </div>
  );

  return (
    <SidebarProvider defaultOpen className="h-svh overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        loading={loading}
        error={error}
        hasMore={hasMore}
        loadMore={loadMore}
        userName={
          settings?.displaySetting.userNickname?.trim() || t("conversations.user.default_name")
        }
        userAvatar={settings?.displaySetting.userAvatar}
        assistants={assistants}
        assistantTags={settings?.assistantTags ?? []}
        currentAssistantId={currentAssistantId}
        onSelect={handleSelect}
        onAssistantChange={handleAssistantChange}
        onPin={handleTogglePinConversation}
        onRegenerateTitle={handleRegenerateConversationTitle}
        onMoveToAssistant={handleMoveConversation}
        onUpdateTitle={handleUpdateConversationTitle}
        onDelete={handleDeleteConversation}
        onCreateConversation={handleCreateConversation}
        webAuthEnabled={settings?.webServerJwtEnabled === true}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={handleSelectFolder}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveToFolder={handleMoveConversationToFolder}
      />
      <SidebarInset className="flex min-h-svh flex-col overflow-hidden">
        {/* 与侧边栏顶栏同高（h-16），展开时左右两侧顶边才对得齐 */}
        <div className="flex h-16 shrink-0 items-center gap-2 px-4">
          <CollapsedHeaderActions
            onSelect={handleSelect}
            onCreateConversation={handleCreateConversation}
          />
          {/* 选中会话后才显示标题，没有时不再留一行「请选择会话」占位 */}
          {activeConversation ? (
            <div className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
              {activeConversation.title}
            </div>
          ) : null}
          {/* 和 DeepSeek 一致：会话里有内容时，右上角才出现分享入口 */}
          {canShare && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("conversations.header.share")}
                  className="ds-icon-btn size-8 shrink-0"
                  size="icon"
                  title={t("conversations.header.share")}
                  variant="ghost"
                >
                  <Share className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
                <DropdownMenuItem onSelect={() => handleExportConversation(false)}>
                  <FileDown className="size-4" />
                  <span>{t("conversations.header.export_markdown")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleExportConversation(true)}>
                  <FileDown className="size-4" />
                  <span>{t("conversations.header.export_markdown_with_reasoning")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!isMobile ? (
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel
              defaultSize={hasWorkbenchPanel ? 64 : 100}
              minSize={40}
              className="flex min-h-0 flex-col"
            >
              {chatContent}
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className={cn(!hasWorkbenchPanel && "pointer-events-none opacity-0")}
            />
            <ResizablePanel
              defaultSize={hasWorkbenchPanel ? 36 : 0}
              minSize={24}
              collapsible
              collapsedSize={0}
              panelRef={workbenchPanelRef}
              className="flex min-h-0 flex-col"
            >
              {panel ? (
                <WorkbenchHost panel={panel} onClose={closePanel} className="border-l-0" />
              ) : null}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          chatContent
        )}

        {isMobile && panel ? (
          <Drawer
            open={hasWorkbenchPanel}
            onOpenChange={(open) => {
              if (!open) {
                closePanel();
              }
            }}
            direction="bottom"
          >
            <DrawerContent className="h-[85vh] max-h-[85vh]">
              <WorkbenchHost panel={panel} onClose={closePanel} className="border-l-0" />
            </DrawerContent>
          </Drawer>
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}
