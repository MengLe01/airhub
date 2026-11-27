import * as React from "react";

import dayjs from "dayjs";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import {
  Check,
  CirclePlus,
  Folder,
  FolderInput,
  FolderPlus,
  Laptop,
  Languages,
  Moon,
  MoreHorizontal,
  MoveRight,
  Palette,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  LogOut,
  Sun,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { InfiniteScrollArea } from "~/components/extended/infinite-scroll-area";
import Logo from "~/components/logo";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmDialog, PromptDialog } from "~/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { UIAvatar } from "~/components/ui/ui-avatar";
import { useSettingsStore } from "~/stores";
import {
  useTheme,
  type ColorTheme,
  type CustomThemeCss,
  type Theme,
} from "~/components/theme-provider";
import { ConversationSearchButton } from "~/components/conversation-search-button";
import { CustomThemeDialog } from "~/components/custom-theme-dialog";
import { getAssistantDisplayName } from "~/lib/display";
import { cn } from "~/lib/utils";
import { clearWebAuthToken } from "~/services/api";
import type {
  AssistantAvatar,
  AssistantProfile,
  AssistantTag,
  ConversationListDto,
  FolderDto,
} from "~/types";

const THEME_OPTIONS: Array<{
  value: Theme;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "light",
    labelKey: "theme_light",
    icon: Sun,
  },
  {
    value: "dark",
    labelKey: "theme_dark",
    icon: Moon,
  },
  {
    value: "system",
    labelKey: "theme_system",
    icon: Laptop,
  },
];

const COLOR_THEME_OPTIONS: Array<{
  value: ColorTheme;
  labelKey: string;
}> = [
  {
    value: "default",
    labelKey: "color_default",
  },
  {
    value: "deepseek",
    labelKey: "color_deepseek",
  },
  {
    value: "claude",
    labelKey: "color_claude",
  },
  {
    value: "t3-chat",
    labelKey: "color_t3_chat",
  },
  {
    value: "mono",
    labelKey: "color_mono",
  },
  {
    value: "bubblegum",
    labelKey: "color_bubblegum",
  },
  {
    value: "custom",
    labelKey: "color_custom",
  },
];

const LANGUAGE_OPTIONS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
] as const;

/** 一个分组区块：置顶，或某个日期档位 */
interface ConversationSection {
  key: string;
  label: string;
  conversations: ConversationListDto[];
}

/** 侧边栏按粗粒度日期分组时的档位，顺序即天数上限 */
const DATE_BUCKETS = [
  { maxDays: 0, key: "today", labelKey: "today" },
  { maxDays: 1, key: "yesterday", labelKey: "yesterday" },
  { maxDays: 7, key: "within_7_days", labelKey: "within_7_days" },
  { maxDays: 30, key: "within_30_days", labelKey: "within_30_days" },
] as const;

function getDateLabel(date: dayjs.Dayjs, t: TFunction): string {
  const today = dayjs().startOf("day");
  const yesterday = today.subtract(1, "day");

  if (date.isSame(today, "day")) return t("conversation_sidebar.today");
  if (date.isSame(yesterday, "day")) return t("conversation_sidebar.yesterday");

  const native = date.toDate();
  const sameYear = date.year() === today.year();
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return formatter.format(native);
}

/** 分组标题：分组开关关闭时退回逐日分组，开启时按档位归并，30 天以上按年月 */
function getSectionHeader(
  date: dayjs.Dayjs,
  groupingEnabled: boolean,
  t: TFunction,
): { key: string; label: string } {
  if (!groupingEnabled) {
    return { key: date.format("YYYY-MM-DD"), label: getDateLabel(date, t) };
  }

  const daysAgo = dayjs().startOf("day").diff(date, "day");
  for (const bucket of DATE_BUCKETS) {
    if (daysAgo <= bucket.maxDays) {
      return { key: bucket.key, label: t(`conversation_sidebar.${bucket.labelKey}`) };
    }
  }
  return {
    key: date.format("YYYY-MM"),
    label: t("conversation_sidebar.month_group", { year: date.year(), month: date.month() + 1 }),
  };
}

// 直接产出分组区块，不再先铺成扁平的「标题 + 条目」再折叠一次。
// 吸顶标题必须是某个区块的子元素、且区块本身高于标题，标题才有可粘附的行程；
// 否则标题只会在自己那点高的包装盒里打转，看起来完全没吸顶。
function groupConversations(
  conversations: ConversationListDto[],
  t: TFunction,
  groupingEnabled: boolean,
): ConversationSection[] {
  const sections: ConversationSection[] = [];
  const pinned = conversations.filter((c) => c.isPinned);

  if (pinned.length > 0) {
    sections.push({
      key: "pinned",
      label: t("conversation_sidebar.pinned"),
      conversations: pinned,
    });
  }

  let current: ConversationSection | null = null;
  for (const c of conversations) {
    if (c.isPinned) continue;

    const header = getSectionHeader(dayjs(c.updateAt).startOf("day"), groupingEnabled, t);
    if (!current || current.key !== header.key) {
      current = { key: header.key, label: header.label, conversations: [] };
      sections.push(current);
    }
    current.conversations.push(c);
  }

  return sections;
}

export interface ConversationSidebarProps {
  conversations: ConversationListDto[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  userName: string;
  userAvatar?: AssistantAvatar | null;
  assistants: AssistantProfile[];
  assistantTags: AssistantTag[];
  currentAssistantId: string | null;
  onSelect: (id: string) => void;
  onAssistantChange: (assistantId: string) => Promise<void>;
  onPin?: (id: string) => Promise<void>;
  onRegenerateTitle?: (id: string) => Promise<void>;
  onMoveToAssistant?: (id: string, assistantId: string) => Promise<void>;
  onUpdateTitle?: (id: string, title: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCreateConversation?: () => void;
  webAuthEnabled?: boolean;
  folders?: FolderDto[];
  selectedFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  onCreateFolder?: (name: string) => Promise<void>;
  onRenameFolder?: (id: string, name: string) => Promise<void>;
  onDeleteFolder?: (id: string) => Promise<void>;
  onMoveToFolder?: (conversationId: string, folderId: string | null) => Promise<void>;
}

interface ConversationListRowProps {
  conversation: ConversationListDto;
  isActive: boolean;
  assistants: AssistantProfile[];
  folders: FolderDto[];
  onSelect: (id: string) => void;
  onPin?: (id: string) => Promise<void>;
  onRegenerateTitle?: (id: string) => Promise<void>;
  onMoveToAssistant?: (id: string, assistantId: string) => Promise<void>;
  onMoveToFolder?: (conversationId: string, folderId: string | null) => Promise<void>;
  onUpdateTitle?: (id: string, title: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const ConversationListRow = React.memo(
  ({
    conversation,
    isActive,
    assistants,
    folders,
    onSelect,
    onPin,
    onRegenerateTitle,
    onMoveToAssistant,
    onMoveToFolder,
    onUpdateTitle,
    onDelete,
  }: ConversationListRowProps) => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [pendingAction, setPendingAction] = React.useState<string | null>(null);
    // 原来用 window.confirm / window.prompt，WebView 里是浏览器原生样式，和界面完全不搭
    const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
    // 改标题是就地编辑：当前行直接变成输入框，不再另开弹窗
    const [editingTitle, setEditingTitle] = React.useState(false);
    const [titleDraft, setTitleDraft] = React.useState("");
    // 输入框卸载时也会触发 blur，用 ref 保证 Enter / Esc 之后不会再提交一次
    const editingTitleRef = React.useRef(false);
    // 菜单是鼠标点开的还是键盘打开的，决定关闭后要不要把焦点还回来
    const openedByPointer = React.useRef(false);

    const moveTargets = React.useMemo(
      () => assistants.filter((assistant) => assistant.id !== conversation.assistantId),
      [assistants, conversation.assistantId],
    );

    const hasMenuAction = Boolean(
      onPin ||
      onRegenerateTitle ||
      onMoveToAssistant ||
      onMoveToFolder ||
      onUpdateTitle ||
      onDelete,
    );

    const runAction = React.useCallback(
      async (
        actionId: string,
        action: () => Promise<void>,
        messages?: { success?: string; error?: string },
      ) => {
        setPendingAction(actionId);
        try {
          await action();
          setMenuOpen(false);
          if (messages?.success) {
            toast.success(messages.success);
          }
        } catch (error) {
          console.error("Conversation action failed", error);
          toast.error(messages?.error ?? t("conversation_sidebar.action_failed_retry"));
        } finally {
          setPendingAction(null);
        }
      },
      [t],
    );

    const cancelTitleEdit = React.useCallback(() => {
      editingTitleRef.current = false;
      setEditingTitle(false);
    }, []);

    // Enter 与 blur 都可能触发提交，editingTitleRef 保证只提交一次
    const commitTitle = React.useCallback(async () => {
      if (!editingTitleRef.current) return;
      editingTitleRef.current = false;
      setEditingTitle(false);
      const nextTitle = titleDraft.trim();
      if (!nextTitle || nextTitle === conversation.title || !onUpdateTitle) return;
      await runAction(
        "update-title",
        async () => {
          await onUpdateTitle(conversation.id, nextTitle);
        },
        // 标题就地改完立刻能看到，不再额外弹「已更新」
        { error: t("conversation_sidebar.title_update_failed") },
      );
    }, [conversation.id, conversation.title, onUpdateTitle, runAction, t, titleDraft]);

    if (editingTitle) {
      return (
        <SidebarMenuItem>
          <input
            autoFocus
            // pl 用 9 而不是 10：输入框有 1px 边框，加起来正好等于标题那侧的 10px，
            // 否则切换的瞬间文字会整体右移 1px
            className="h-10 w-full rounded-xl border border-primary bg-background pr-2.5 pl-[9px] text-sm outline-none"
            onBlur={() => {
              void commitTitle();
            }}
            onChange={(event) => setTitleDraft(event.target.value)}
            // 光标放到末尾，不整段选中：全选后再打字会把原标题整个覆盖掉
            onFocus={(event) => {
              const element = event.currentTarget;
              const end = element.value.length;
              element.setSelectionRange(end, end);
            }}
            onKeyDown={(event) => {
              // 中文输入法选词时按 Enter 只是上屏，不能当成提交
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void commitTitle();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelTitleEdit();
              }
            }}
            value={titleDraft}
          />
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <SidebarMenuButton
            className="h-10 rounded-xl pl-2.5"
            isActive={isActive}
            onClick={() => onSelect(conversation.id)}
            onContextMenu={(event) => {
              if (!hasMenuAction) return;
              event.preventDefault();
              setMenuOpen(true);
            }}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {conversation.title || t("conversation_sidebar.unnamed_conversation")}
              </span>
              {conversation.isGenerating && (
                <span
                  className="inline-block size-2 shrink-0 rounded-full bg-emerald-500"
                  aria-label={t("conversation_sidebar.generating")}
                  title={t("conversation_sidebar.generating")}
                />
              )}
            </span>
          </SidebarMenuButton>

          {hasMenuAction && (
            <>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  showOnHover
                  className="top-2.5!"
                  aria-label={t("conversation_sidebar.conversation_actions")}
                  title={t("conversation_sidebar.conversation_actions")}
                  disabled={pendingAction !== null}
                  onPointerDown={() => {
                    openedByPointer.current = true;
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <MoreHorizontal className="size-4" />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                // 菜单关闭时 Radix 会把焦点还给触发按钮，而程序化聚焦会命中 :focus-visible，
                // 于是点过的那一行的「…」上会留下一圈蓝色描边。
                // 鼠标打开的情况下不还焦点；键盘打开时照旧还，Tab 导航的焦点环不能丢。
                onCloseAutoFocus={(event) => {
                  if (openedByPointer.current) {
                    event.preventDefault();
                    openedByPointer.current = false;
                  }
                }}
                className="min-w-[124px]"
                side="bottom"
                sideOffset={6}
              >
                {/* 菜单顺序对齐 DeepSeek：置顶 / 重命名 / 自动命名 / 移动 / 分组 / 删除，
                    破坏性操作固定在末尾，离手最远 */}
                {onPin && (
                  <DropdownMenuItem
                    disabled={pendingAction !== null}
                    onSelect={(event) => {
                      event.preventDefault();
                      void runAction(
                        "pin",
                        async () => {
                          await onPin(conversation.id);
                        },
                        // 置顶会把这一行立刻挪到「置顶」分组，结果自明，不再弹提示
                        {
                          error: conversation.isPinned
                            ? t("conversation_sidebar.unpin_failed")
                            : t("conversation_sidebar.pin_failed"),
                        },
                      );
                    }}
                  >
                    {conversation.isPinned ? (
                      <PinOff className="size-4" />
                    ) : (
                      <Pin className="size-4" />
                    )}
                    <span>
                      {conversation.isPinned
                        ? t("conversation_sidebar.unpin")
                        : t("conversation_sidebar.pin")}
                    </span>
                  </DropdownMenuItem>
                )}

                {onUpdateTitle && (
                  <DropdownMenuItem
                    disabled={pendingAction !== null}
                    onSelect={(event) => {
                      event.preventDefault();
                      if (pendingAction !== null) return;
                      setMenuOpen(false);
                      setTitleDraft(conversation.title);
                      editingTitleRef.current = true;
                      setEditingTitle(true);
                    }}
                  >
                    <Pencil className="size-4" />
                    <span>{t("conversation_sidebar.edit_title")}</span>
                  </DropdownMenuItem>
                )}

                {onRegenerateTitle && (
                  <DropdownMenuItem
                    disabled={pendingAction !== null}
                    onSelect={(event) => {
                      event.preventDefault();
                      void runAction(
                        "regenerate-title",
                        async () => {
                          await onRegenerateTitle(conversation.id);
                        },
                        // 自动命名时什么都不弹，标题稍后自己变
                        { error: t("conversation_sidebar.regenerate_title_failed") },
                      );
                    }}
                  >
                    <RefreshCw className="size-4" />
                    <span>{t("conversation_sidebar.regenerate_title")}</span>
                  </DropdownMenuItem>
                )}

                {onMoveToAssistant && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                      disabled={pendingAction !== null || moveTargets.length === 0}
                    >
                      <MoveRight className="size-4" />
                      <span>{t("conversation_sidebar.move_to_assistant")}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {moveTargets.length === 0 ? (
                        <DropdownMenuItem disabled>
                          {t("conversation_sidebar.no_available_assistants")}
                        </DropdownMenuItem>
                      ) : (
                        moveTargets.map((assistant) => (
                          <DropdownMenuItem
                            key={assistant.id}
                            disabled={pendingAction !== null}
                            onSelect={(event) => {
                              event.preventDefault();
                              void runAction(
                                `move:${assistant.id}`,
                                async () => {
                                  await onMoveToAssistant(conversation.id, assistant.id);
                                },
                                {
                                  success: t("conversation_sidebar.moved_to_assistant", {
                                    assistant: getAssistantDisplayName(assistant.name),
                                  }),
                                  error: t("conversation_sidebar.move_conversation_failed"),
                                },
                              );
                            }}
                          >
                            {getAssistantDisplayName(assistant.name)}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                {onMoveToFolder && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={pendingAction !== null}>
                      <FolderInput className="size-4" />
                      <span>{t("conversation_sidebar.move_to_folder")}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        disabled={pendingAction !== null || !conversation.folderId}
                        onSelect={(event) => {
                          event.preventDefault();
                          void runAction(
                            "move-folder:none",
                            async () => {
                              await onMoveToFolder(conversation.id, null);
                            },
                            {
                              success: t("conversation_sidebar.moved_to_folder_none"),
                              error: t("conversation_sidebar.move_conversation_failed"),
                            },
                          );
                        }}
                      >
                        <span>{t("conversation_sidebar.remove_from_folder")}</span>
                      </DropdownMenuItem>
                      {folders.length > 0 && <DropdownMenuSeparator />}
                      {folders.map((folder) => (
                        <DropdownMenuItem
                          key={folder.id}
                          disabled={pendingAction !== null || folder.id === conversation.folderId}
                          onSelect={(event) => {
                            event.preventDefault();
                            void runAction(
                              `move-folder:${folder.id}`,
                              async () => {
                                await onMoveToFolder(conversation.id, folder.id);
                              },
                              {
                                success: t("conversation_sidebar.moved_to_folder", {
                                  folder: folder.name,
                                }),
                                error: t("conversation_sidebar.move_conversation_failed"),
                              },
                            );
                          }}
                        >
                          <Folder className="size-4" />
                          <span className="truncate">{folder.name}</span>
                          {folder.id === conversation.folderId && (
                            <Check className="ml-auto size-4" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

                {onDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={pendingAction !== null}
                    onSelect={(event) => {
                      event.preventDefault();
                      if (pendingAction !== null) return;
                      setMenuOpen(false);
                      setDeleteConfirmOpen(true);
                    }}
                  >
                    <Trash2 className="size-4" />
                    <span>{t("conversation_sidebar.delete_conversation")}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </>
          )}
        </DropdownMenu>

        {onDelete && (
          <ConfirmDialog
            cancelText={t("conversation_sidebar.cancel")}
            confirmText={t("conversation_sidebar.delete_confirm_action")}
            description={t("conversation_sidebar.delete_description")}
            destructive
            onConfirm={() =>
              runAction(
                "delete",
                async () => {
                  await onDelete(conversation.id);
                },
                // 删完这一行就没了，再弹一个「会话已删除」只会多一层噪音
                { error: t("conversation_sidebar.delete_failed") },
              )
            }
            onOpenChange={setDeleteConfirmOpen}
            open={deleteConfirmOpen}
            title={t("conversation_sidebar.delete_title")}
          />
        )}
      </SidebarMenuItem>
    );
  },
);

function resolveLanguage(language: string): (typeof LANGUAGE_OPTIONS)[number]["value"] {
  return language.startsWith("zh") ? "zh-CN" : "en-US";
}

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLanguage = resolveLanguage(i18n.resolvedLanguage ?? i18n.language);
  const currentOption =
    LANGUAGE_OPTIONS.find((option) => option.value === currentLanguage) ?? LANGUAGE_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="text-foreground"
          type="button"
          aria-label={`Language: ${currentOption.label}`}
          title={`Language: ${currentOption.label}`}
        >
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40" side="top" align="end">
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        {LANGUAGE_OPTIONS.map((option) => {
          const selected = option.value === currentLanguage;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                void i18n.changeLanguage(option.value);
              }}
            >
              <span className="flex-1">{option.label}</span>
              <Check className={selected ? "size-4" : "size-4 opacity-0"} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FolderBarProps {
  folders: FolderDto[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreate?: (name: string) => Promise<void>;
  onRename?: (id: string, name: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

function FolderBar({
  folders,
  selectedFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: FolderBarProps) {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<FolderDto | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<FolderDto | null>(null);

  const handleCreate = React.useCallback(
    async (name: string) => {
      if (!onCreate) return;
      try {
        await onCreate(name);
      } catch (folderError) {
        console.error("Create folder failed", folderError);
        toast.error(t("conversation_sidebar.folder_create_failed"));
      }
    },
    [onCreate, t],
  );

  const handleRename = React.useCallback(
    async (folder: FolderDto, name: string) => {
      if (!onRename || name === folder.name) return;
      try {
        await onRename(folder.id, name);
      } catch (folderError) {
        console.error("Rename folder failed", folderError);
        toast.error(t("conversation_sidebar.folder_rename_failed"));
      }
    },
    [onRename, t],
  );

  const handleDelete = React.useCallback(
    async (folder: FolderDto) => {
      if (!onDelete) return;
      try {
        await onDelete(folder.id);
      } catch (folderError) {
        console.error("Delete folder failed", folderError);
        toast.error(t("conversation_sidebar.folder_delete_failed"));
      }
    },
    [onDelete, t],
  );

  return (
    <div className="-mt-1 mb-3 flex items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition",
          selectedFolderId === null
            ? "bg-muted text-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        {t("conversation_sidebar.folder_all")}
      </button>

      {folders.map((folder) => {
        const selected = folder.id === selectedFolderId;
        return (
          <DropdownMenu key={folder.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(folder.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(folder.id);
                }
              }}
              onContextMenu={(event) => {
                if (!onRename && !onDelete) return;
                event.preventDefault();
              }}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition",
                selected
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              <Folder className="size-3" />
              <span className="max-w-[8rem] truncate">{folder.name}</span>
              {(onRename || onDelete) && (
                <DropdownMenuTrigger asChild>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={t("conversation_sidebar.folder_actions")}
                    onClick={(event) => event.stopPropagation()}
                    className="ml-0.5 inline-flex items-center opacity-70 hover:opacity-100"
                  >
                    <MoreHorizontal className="size-3" />
                  </span>
                </DropdownMenuTrigger>
              )}
            </div>
            <DropdownMenuContent side="bottom" align="start" className="w-40">
              {onRename && (
                <DropdownMenuItem onSelect={() => setRenameTarget(folder)}>
                  <Pencil className="size-4" />
                  <span>{t("conversation_sidebar.folder_rename")}</span>
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(folder)}>
                  <Trash2 className="size-4" />
                  <span>{t("conversation_sidebar.folder_delete")}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      {onCreate && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label={t("conversation_sidebar.folder_create")}
          title={t("conversation_sidebar.folder_create")}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/80"
        >
          <FolderPlus className="size-3.5" />
        </button>
      )}

      <PromptDialog
        cancelText={t("conversation_sidebar.cancel")}
        confirmText={t("conversation_sidebar.save")}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        open={createOpen}
        placeholder={t("conversation_sidebar.folder_name_prompt")}
        title={t("conversation_sidebar.folder_create")}
      />
      <PromptDialog
        cancelText={t("conversation_sidebar.cancel")}
        confirmText={t("conversation_sidebar.save")}
        defaultValue={renameTarget?.name ?? ""}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onSubmit={async (name) => {
          if (renameTarget) await handleRename(renameTarget, name);
        }}
        open={renameTarget !== null}
        placeholder={t("conversation_sidebar.folder_rename_prompt")}
        title={t("conversation_sidebar.folder_rename")}
      />
      <ConfirmDialog
        cancelText={t("conversation_sidebar.cancel")}
        confirmText={t("conversation_sidebar.folder_delete")}
        description={
          deleteTarget
            ? t("conversation_sidebar.folder_delete_confirm", { folder: deleteTarget.name })
            : undefined
        }
        destructive
        onConfirm={async () => {
          if (deleteTarget) await handleDelete(deleteTarget);
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget !== null}
        title={t("conversation_sidebar.folder_delete")}
      />
    </div>
  );
}

export const ConversationSidebar = React.memo(
  ({
    conversations,
    activeId,
    loading,
    error,
    hasMore,
    loadMore,
    userName,
    userAvatar,
    assistants,
    assistantTags,
    currentAssistantId,
    onSelect,
    onAssistantChange,
    onPin,
    onRegenerateTitle,
    onMoveToAssistant,
    onUpdateTitle,
    onDelete,
    onCreateConversation,
    webAuthEnabled = false,
    folders = [],
    selectedFolderId = null,
    onSelectFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveToFolder,
  }: ConversationSidebarProps) => {
    const { t, i18n } = useTranslation();
    const { theme, setTheme, colorTheme, setColorTheme, customThemeCss, setCustomThemeCss } =
      useTheme();

    const [pickerOpen, setPickerOpen] = React.useState(false);
    const [customThemeOpen, setCustomThemeOpen] = React.useState(false);
    const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
    const [switchingAssistantId, setSwitchingAssistantId] = React.useState<string | null>(null);
    const [switchError, setSwitchError] = React.useState<string | null>(null);
    const enableSidebarDateGrouping = useSettingsStore(
      (state) => state.settings?.displaySetting?.enableSidebarDateGrouping ?? true,
    );

    const currentTheme = theme;
    const currentThemeOption =
      THEME_OPTIONS.find((option) => option.value === currentTheme) ?? THEME_OPTIONS[2];
    const CurrentThemeIcon = currentThemeOption.icon;
    const currentColorThemeOption =
      COLOR_THEME_OPTIONS.find((option) => option.value === colorTheme) ?? COLOR_THEME_OPTIONS[0];

    const handleCustomThemeSave = React.useCallback(
      (themeCss: CustomThemeCss) => {
        setCustomThemeCss(themeCss);
        setColorTheme("custom");
        toast.success(t("conversation_sidebar.custom_theme_saved"));
      },
      [setColorTheme, setCustomThemeCss, t],
    );

    const currentAssistant = React.useMemo(
      () =>
        assistants.find((assistant) => assistant.id === currentAssistantId) ??
        assistants[0] ??
        null,
      [assistants, currentAssistantId],
    );

    const sections = React.useMemo(
      () => groupConversations(conversations, t, enableSidebarDateGrouping),
      [conversations, enableSidebarDateGrouping, i18n.resolvedLanguage, t],
    );

    const filteredAssistants = React.useMemo(() => {
      if (selectedTagIds.length === 0) {
        return assistants;
      }
      return assistants.filter((assistant) =>
        assistant.tags.some((tagId) => selectedTagIds.includes(tagId)),
      );
    }, [assistants, selectedTagIds]);

    const toggleTag = React.useCallback((tagId: string) => {
      setSelectedTagIds((current) =>
        current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
      );
    }, []);

    const handleAssistantSelect = React.useCallback(
      async (assistantId: string) => {
        if (assistantId === currentAssistantId) {
          setPickerOpen(false);
          return;
        }
        setSwitchError(null);
        setSwitchingAssistantId(assistantId);
        try {
          await onAssistantChange(assistantId);
          setPickerOpen(false);
        } catch (switchAssistantError) {
          if (switchAssistantError instanceof Error) {
            setSwitchError(switchAssistantError.message);
          } else {
            setSwitchError(t("conversation_sidebar.switch_assistant_failed"));
          }
        } finally {
          setSwitchingAssistantId(null);
        }
      },
      [currentAssistantId, onAssistantChange],
    );

    const handleWebLogout = React.useCallback(() => {
      clearWebAuthToken();
      toast.success("Web session cleared");
      window.location.reload();
    }, []);

    return (
      <Sidebar collapsible="offcanvas" variant="sidebar">
        {/* 和主内容区顶部同高（h-16）。内部改成底部对齐并留 12px 下边距：
            内容底边正好落在 52px 处，接上下面 12px 的组间留白，视觉上三处等距。
            不用负边距去追这个数——SidebarContent 会裁掉溢出的部分，按钮顶边会被切掉。 */}
        <SidebarHeader className="flex h-16 flex-row items-end justify-between px-3 pb-3">
          <Logo className="size-6 shrink-0 text-primary" />
          <div className="flex items-center gap-1">
            <ConversationSearchButton iconOnly onSelect={onSelect} />
            <SidebarTrigger className="size-7 text-muted-foreground hover:text-foreground" />
          </div>
        </SidebarHeader>
        <SidebarContent className="min-h-0 overflow-x-hidden">
          <SidebarGroup className="px-3 pt-0">
            <Button
              data-sidebar-new-chat
              variant="ghost"
              className="w-full justify-center"
              onClick={onCreateConversation}
            >
              <CirclePlus className="size-4" />
              {t("conversation_sidebar.new_conversation")}
            </Button>
          </SidebarGroup>

          <SidebarGroup className="flex min-h-0 flex-1 flex-col px-3 pt-0">
            {onSelectFolder && (
              <FolderBar
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelect={onSelectFolder}
                onCreate={onCreateFolder}
                onRename={onRenameFolder}
                onDelete={onDeleteFolder}
              />
            )}
            <InfiniteScrollArea
              // 往右多占 12px（外层 px-3 的右内边距），让滚动条正好落在右侧留白里，
              // 条目的左右留白才相等；否则右边会比左边多出一条滚动条的宽度。
              className="scrollbar-on-hover -mr-3"
              autoHideScrollbar
              dataLength={conversations.length}
              next={loadMore}
              hasMore={hasMore}
              scrollTargetId="conversationScrollTarget"
            >
              <SidebarMenu>
                {loading && (
                  <SidebarMenuItem>
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      {t("conversation_sidebar.loading")}
                    </div>
                  </SidebarMenuItem>
                )}
                {error && (
                  <SidebarMenuItem>
                    <div className="px-2 py-2 text-xs text-destructive">{error}</div>
                  </SidebarMenuItem>
                )}
                {!loading && !error && conversations.length === 0 && (
                  <SidebarMenuItem>
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      {t("conversation_sidebar.no_conversations")}
                    </div>
                  </SidebarMenuItem>
                )}
                {sections.map((section, sectionIndex) => (
                  <li
                    key={section.key}
                    // 组间距比 DeepSeek 原版更紧：那边是 16 + 4，这里收到 8 + 4。
                    // 组内行距保持 0，靠这一档间距把分组区分开就够了
                    className={cn("flex min-w-0 flex-col", sectionIndex > 0 && "mt-2 pt-1")}
                  >
                    <div
                      className={cn(
                        // 标题向左吃掉 group 的 px-3 让吸顶底色通栏，
                        // 左侧补回 12 + 条目自身的 pl-2.5 = 22px，文字才和会话标题同一条竖线
                        "sticky top-0 z-10 -mx-3 bg-sidebar py-0.5 pr-5 pl-[22px] text-xs font-medium leading-[18px] text-muted-foreground",
                        section.key === "pinned" && "z-20",
                      )}
                    >
                      {section.label}
                    </div>
                    <ul className="flex w-full min-w-0 flex-col">
                      {section.conversations.map((item) => (
                        <ConversationListRow
                          key={item.id}
                          conversation={item}
                          isActive={item.id === activeId}
                          assistants={assistants}
                          folders={folders}
                          onSelect={onSelect}
                          onPin={onPin}
                          onRegenerateTitle={onRegenerateTitle}
                          onMoveToAssistant={onMoveToAssistant}
                          onMoveToFolder={onMoveToFolder}
                          onUpdateTitle={onUpdateTitle}
                          onDelete={onDelete}
                        />
                      ))}
                    </ul>
                  </li>
                ))}
              </SidebarMenu>
            </InfiniteScrollArea>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Dialog
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (!open) {
                setSwitchError(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-foreground"
                type="button"
              >
                {currentAssistant ? (
                  <>
                    <UIAvatar
                      key={currentAssistant.id}
                      size="sm"
                      name={getAssistantDisplayName(currentAssistant.name)}
                      avatar={currentAssistant.avatar}
                    />
                    <span className="truncate">
                      {getAssistantDisplayName(currentAssistant.name)}
                    </span>
                  </>
                ) : (
                  <span className="truncate">{t("conversation_sidebar.select_assistant")}</span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80svh] max-w-xl overflow-hidden p-0">
              <DialogHeader className="border-b px-6 py-4">
                <DialogTitle>{t("conversation_sidebar.select_assistant")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 px-6 py-4">
                {assistantTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {assistantTags.map((tag) => {
                      const selected = selectedTagIds.includes(tag.id);
                      return (
                        <Button
                          key={tag.id}
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          onClick={() => toggleTag(tag.id)}
                        >
                          {tag.name}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {switchError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {switchError}
                  </div>
                )}

                <ScrollArea className="h-[380px]">
                  <div className="space-y-2">
                    {filteredAssistants.map((assistant) => {
                      const selected = assistant.id === currentAssistantId;
                      const switching = switchingAssistantId === assistant.id;
                      const displayName = getAssistantDisplayName(assistant.name);
                      return (
                        <button
                          key={assistant.id}
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition hover:bg-muted"
                          onClick={() => void handleAssistantSelect(assistant.id)}
                          disabled={switchingAssistantId !== null}
                        >
                          <UIAvatar size="sm" name={displayName} avatar={assistant.avatar} />
                          <span className="min-w-0 flex-1 truncate text-sm">{displayName}</span>
                          {selected && !switching && (
                            <Badge variant="secondary" className="gap-1">
                              <Check className="size-3" />
                              {t("conversation_sidebar.current")}
                            </Badge>
                          )}
                          {switching && (
                            <Badge variant="secondary" className="text-xs">
                              {t("conversation_sidebar.switching")}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                    {filteredAssistants.length === 0 && (
                      <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                        {t("conversation_sidebar.no_assistants_by_tag")}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>

          <CustomThemeDialog
            open={customThemeOpen}
            onOpenChange={setCustomThemeOpen}
            initialCss={customThemeCss}
            onSave={handleCustomThemeSave}
          />

          <div className="flex items-center gap-2 px-1 py-1">
            <UIAvatar name={userName} avatar={userAvatar} className="size-8 shrink-0" />
            <div className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</div>

            {webAuthEnabled && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                type="button"
                onClick={handleWebLogout}
                aria-label="Clear web session"
                title="Clear web session"
              >
                <LogOut className="size-4" />
              </Button>
            )}

            <LanguageSwitcher />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="text-foreground"
                  type="button"
                  aria-label={t("conversation_sidebar.theme_mode_label", {
                    label: t(`conversation_sidebar.${currentThemeOption.labelKey}`),
                  })}
                  title={t("conversation_sidebar.theme_mode_label", {
                    label: t(`conversation_sidebar.${currentThemeOption.labelKey}`),
                  })}
                >
                  <CurrentThemeIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44" side="top" align="end">
                <DropdownMenuLabel>{t("conversation_sidebar.theme_mode")}</DropdownMenuLabel>
                {THEME_OPTIONS.map((option) => {
                  const selected = option.value === currentTheme;
                  const ThemeOptionIcon = option.icon;
                  return (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => {
                        setTheme(option.value);
                      }}
                    >
                      <ThemeOptionIcon className="size-4" />
                      <span className="flex-1">{t(`conversation_sidebar.${option.labelKey}`)}</span>
                      <Check className={selected ? "size-4" : "size-4 opacity-0"} />
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="text-foreground"
                  type="button"
                  aria-label={t("conversation_sidebar.theme_color_label", {
                    label: t(`conversation_sidebar.${currentColorThemeOption.labelKey}`),
                  })}
                  title={t("conversation_sidebar.theme_color_label", {
                    label: t(`conversation_sidebar.${currentColorThemeOption.labelKey}`),
                  })}
                >
                  <Palette className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44" side="top" align="end">
                <DropdownMenuLabel>{t("conversation_sidebar.theme_color")}</DropdownMenuLabel>
                {COLOR_THEME_OPTIONS.map((option) => {
                  const selected = option.value === colorTheme;
                  return (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => {
                        setColorTheme(option.value);
                      }}
                    >
                      <span className="flex-1">{t(`conversation_sidebar.${option.labelKey}`)}</span>
                      <Check className={selected ? "size-4" : "size-4 opacity-0"} />
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setCustomThemeOpen(true);
                  }}
                >
                  <span className="flex-1">{t("conversation_sidebar.edit_custom_css")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarFooter>
      </Sidebar>
    );
  },
);
