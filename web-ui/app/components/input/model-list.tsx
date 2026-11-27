import * as React from "react";

import { Check, Heart, LoaderCircle, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCurrentAssistant } from "~/hooks/use-current-assistant";
import { useCurrentModel } from "~/hooks/use-current-model";
import { getModelDisplayName } from "~/lib/display";
import { cn } from "~/lib/utils";
import api from "~/services/api";
import type { ConversationDto, ProviderModel } from "~/types";
import { AIIcon } from "~/components/ui/ai-icon";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";

export interface ModelListProps {
  disabled?: boolean;
  className?: string;
  conversation?: ConversationDto | null;
  onChanged?: (model: ProviderModel) => void;
}

interface ModelSection {
  providerId: string;
  providerName: string;
  models: ProviderModel[];
}

const FAVORITE_SECTION_ID = "__favorites__";

/**
 * 模型选择器里能出现的模型：聊天模型，且没在 App 里被隐藏。
 * 隐藏只影响选择器，模型本身仍然可用（例如会话里已经选过它）。
 */
function isSelectableModel(model: ProviderModel | undefined): model is ProviderModel {
  return model?.type === "CHAT" && model.isHidden !== true;
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

interface ModelOptionRowProps {
  model: ProviderModel;
  selected: boolean;
  updating: boolean;
  favorite: boolean;
  disabled: boolean;
  onSelect: (model: ProviderModel) => void | Promise<void>;
  onToggleFavorite: (model: ProviderModel) => void | Promise<void>;
}

function ModelOptionRow({
  model,
  selected,
  updating,
  favorite,
  disabled,
  onSelect,
  onToggleFavorite,
}: ModelOptionRowProps) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={cn(
        "hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition",
        disabled && "pointer-events-none opacity-60",
        selected && "bg-primary/5",
      )}
      onClick={() => {
        if (disabled) {
          return;
        }

        void onSelect(model);
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void onSelect(model);
        }
      }}
    >
      <AIIcon name={model.modelId} size={20} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">
          {getModelDisplayName(model.displayName, model.modelId)}
        </div>
        <div className="text-muted-foreground truncate text-[11px] leading-tight">
          {model.modelId}
        </div>
      </div>

      {updating ? (
        <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
      ) : selected ? (
        <Check className="text-primary size-3.5" />
      ) : (
        <button
          type="button"
          className={favorite ? "text-primary" : "text-muted-foreground hover:text-primary"}
          onClick={(event) => {
            event.stopPropagation();
            void onToggleFavorite(model);
          }}
        >
          <Heart className={cn("size-3.5", favorite && "fill-current")} />
        </button>
      )}
    </div>
  );
}

export function ModelList({
  disabled = false,
  className,
  conversation = null,
  onChanged,
}: ModelListProps) {
  const { t } = useTranslation("input");
  const { settings, currentAssistant } = useCurrentAssistant();
  const { currentModelId } = useCurrentModel(conversation);

  const [open, setOpen] = React.useState(false);
  const [searchKeywords, setSearchKeywords] = React.useState("");
  const [selectedProviderId, setSelectedProviderId] = React.useState<string | null>(null);
  const [updatingModelId, setUpdatingModelId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const favoriteModelIds = settings?.favoriteModels ?? [];
  const favoriteModelIdSet = React.useMemo(() => new Set(favoriteModelIds), [favoriteModelIds]);

  const sections = React.useMemo<ModelSection[]>(() => {
    if (!settings) {
      return [];
    }

    const keyword = normalizeKeyword(searchKeywords);

    return settings.providers
      .filter((provider) => provider.enabled)
      .map((provider) => {
        const models = provider.models.filter((model) => {
          if (!isSelectableModel(model)) {
            return false;
          }

          if (keyword.length === 0) {
            return true;
          }

          const displayName = getModelDisplayName(model.displayName, model.modelId).toLowerCase();
          const modelId = model.modelId.toLowerCase();
          return displayName.includes(keyword) || modelId.includes(keyword);
        });

        return {
          providerId: provider.id,
          providerName: provider.name,
          models,
        };
      })
      .filter((section) => section.models.length > 0);
  }, [searchKeywords, settings]);

  const selectedSection = React.useMemo(() => {
    if (sections.length === 0) {
      return null;
    }

    return sections.find((section) => section.providerId === selectedProviderId) ?? sections[0];
  }, [sections, selectedProviderId]);
  const filteredModels = React.useMemo(
    () => sections.flatMap((section) => section.models),
    [sections],
  );

  const favoriteModels = React.useMemo(() => {
    return favoriteModelIds
      .map((id) => filteredModels.find((model) => model.id === id))
      .filter((model): model is ProviderModel => model !== undefined);
  }, [favoriteModelIds, filteredModels]);
  const isFavoriteSectionSelected = selectedProviderId === FAVORITE_SECTION_ID;
  const displayedModels = isFavoriteSectionSelected
    ? favoriteModels
    : (selectedSection?.models ?? []);

  // 当前模型可能已被隐藏，标签仍要显示它的名字，所以这里查全部聊天模型
  const currentModel = React.useMemo(
    () =>
      settings?.providers
        .flatMap((provider) => provider.models)
        .find((model) => model.id === currentModelId && model.type === "CHAT") ?? null,
    [currentModelId, settings],
  );

  const currentModelLabel = currentModel
    ? getModelDisplayName(currentModel.displayName, currentModel.modelId)
    : t("model_list.select_model");

  React.useEffect(() => {
    if (!open) {
      setSearchKeywords("");
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    if (sections.length === 0 && favoriteModels.length === 0) {
      setSelectedProviderId(null);
      return;
    }

    if (selectedProviderId === FAVORITE_SECTION_ID && favoriteModels.length > 0) {
      return;
    }

    if (
      selectedProviderId &&
      sections.some((section) => section.providerId === selectedProviderId)
    ) {
      return;
    }

    const currentModelSection =
      currentModelId == null
        ? null
        : sections.find((section) => section.models.some((model) => model.id === currentModelId));
    setSelectedProviderId(
      currentModelSection?.providerId ??
        (favoriteModels.length > 0 ? FAVORITE_SECTION_ID : (sections[0]?.providerId ?? null)),
    );
  }, [currentModelId, favoriteModels.length, open, sections, selectedProviderId]);

  React.useEffect(() => {
    if (!disabled) {
      return;
    }

    setOpen(false);
  }, [disabled]);

  const handleSelectModel = React.useCallback(
    async (model: ProviderModel) => {
      if (disabled || !currentAssistant) {
        return;
      }

      if (model.id === currentModelId) {
        setOpen(false);
        return;
      }

      setUpdatingModelId(model.id);
      setError(null);

      try {
        if (conversation) {
          await api.post<ConversationDto>(`conversations/${conversation.id}/config`, {
            chatModelId: model.id,
          });
        } else {
          await api.post<{ status: string }>("settings/assistant/model", {
            assistantId: currentAssistant.id,
            modelId: model.id,
          });
        }
        onChanged?.(model);
        setOpen(false);
      } catch (changeError) {
        const message =
          changeError instanceof Error ? changeError.message : t("model_list.switch_model_failed");
        setError(message);
      } finally {
        setUpdatingModelId(null);
      }
    },
    [conversation, currentAssistant, currentModelId, disabled, onChanged, t],
  );

  const handleToggleFavorite = React.useCallback(
    async (model: ProviderModel) => {
      if (disabled || !settings) {
        return;
      }

      const isFavorite = favoriteModelIds.includes(model.id);
      const newFavoriteModels = isFavorite
        ? favoriteModelIds.filter((id) => id !== model.id)
        : [...favoriteModelIds, model.id];

      setUpdatingModelId(model.id);
      setError(null);

      try {
        await api.post<{ status: string }>("settings/favorite-models", {
          modelIds: newFavoriteModels,
        });
      } catch (changeError) {
        const message =
          changeError instanceof Error
            ? changeError.message
            : t("model_list.update_favorites_failed");
        setError(message);
      } finally {
        setUpdatingModelId(null);
      }
    },
    [disabled, favoriteModelIds, settings, t],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled || !currentAssistant) {
          setOpen(false);
          return;
        }

        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("ds-pill min-w-0 justify-start", className)}
          disabled={disabled || !currentAssistant}
        >
          <AIIcon
            name={currentModel?.modelId ?? "auto"}
            size={16}
            className="bg-transparent"
            imageClassName="h-full w-full"
          />
          <span className="min-w-0 flex-1 truncate text-left">{currentModelLabel}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-[min(92vw,20rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto space-y-3 p-4"
      >
        <PopoverTitle className="text-sm">{t("model_list.title")}</PopoverTitle>

        {/* 顺序按「搜索在最后、供应商在模型之后」排：
            供应商数量与每家模型数都不固定，把模型区高度固定住，
            切换供应商时浮窗不会一会高一会低。 */}
        <div className="space-y-3">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
              {error}
            </div>
          ) : null}

          <div>
            {sections.length === 0 && favoriteModels.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t("model_list.empty")}
              </div>
            ) : (
              <div className="flex min-h-0 flex-col gap-2">
                {/* 模型区固定高度：条目少时留白，多时内部滚动，浮窗整体高度不变 */}
                <ScrollArea className="h-56 **:data-[slot=scroll-area-viewport]:h-56">
                  <div className="space-y-0.5">
                    {displayedModels.map((model) => (
                      <ModelOptionRow
                        key={model.id}
                        model={model}
                        selected={model.id === currentModelId}
                        updating={model.id === updatingModelId}
                        favorite={favoriteModelIdSet.has(model.id)}
                        disabled={disabled || updatingModelId !== null}
                        onSelect={handleSelectModel}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                </ScrollArea>

                {/* 供应商区：横向滚动，条目数变化不会改变浮窗高度 */}
                <ScrollArea className="w-full **:data-[slot=scroll-area-viewport]:max-h-20">
                  <div className="flex flex-wrap items-center gap-1.5 pb-1">
                    {favoriteModels.length > 0 && (
                      <button
                        type="button"
                        className={cn(
                          "bg-muted/60 hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                          isFavoriteSectionSelected && "border-primary bg-primary/10 text-primary",
                        )}
                        onClick={() => {
                          setSelectedProviderId(FAVORITE_SECTION_ID);
                        }}
                      >
                        <Heart
                          className={cn("size-3", isFavoriteSectionSelected && "fill-current")}
                        />
                        <span>{t("model_list.favorites")}</span>
                      </button>
                    )}

                    {sections.map((section) => {
                      const selected = section.providerId === selectedProviderId;
                      return (
                        <button
                          key={section.providerId}
                          type="button"
                          className={cn(
                            "bg-muted/60 hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                            selected && "border-primary bg-primary/10 text-primary",
                          )}
                          onClick={() => {
                            setSelectedProviderId(section.providerId);
                          }}
                        >
                          <AIIcon
                            name={section.providerName}
                            size={12}
                            className="bg-transparent"
                            imageClassName="h-full w-full"
                          />
                          <span className="truncate">{section.providerName}</span>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>

                {/* 搜索放在最后，离模型列表最近的那块固定不动 */}
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                  <Input
                    value={searchKeywords}
                    onChange={(event) => {
                      setSearchKeywords(event.target.value);
                    }}
                    placeholder={t("model_list.search_placeholder")}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
