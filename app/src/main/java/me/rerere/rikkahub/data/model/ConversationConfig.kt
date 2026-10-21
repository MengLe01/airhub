package me.rerere.rikkahub.data.model

import kotlinx.serialization.Serializable
import me.rerere.ai.core.ReasoningLevel
import me.rerere.ai.provider.BuiltInTools
import me.rerere.ai.provider.Model
import me.rerere.rikkahub.data.datastore.Settings
import me.rerere.rikkahub.data.datastore.findModelById
import me.rerere.rikkahub.data.datastore.getAssistantById
import me.rerere.rikkahub.data.datastore.getCurrentAssistant
import kotlin.uuid.Uuid

/**
 * 会话开始后固定在会话上的配置。
 *
 * 新会话没有这份配置，聊天页里的切换直接改助手；会话落库时从助手拍一份快照，
 * 之后的切换只影响当前会话，别处的改动不会打乱它的上下文和缓存。
 * 模式注入和 Lorebook 同样随会话固定，沿用 [Conversation.modeInjectionIds] 与 [Conversation.lorebookIds]。
 */
@Serializable
data class ConversationConfig(
    // 这张快照属于哪一次独立期，和助手上的 pinSessionId 相等才算数
    val pinSessionId: Uuid? = null,
    val chatModelId: Uuid? = null,
    val reasoningLevel: ReasoningLevel = ReasoningLevel.AUTO,
    val enableWebSearch: Boolean = false,
    val builtInSearch: Boolean = false, // 模型内置搜索，覆盖模型自身的开关
    val mcpServers: Set<Uuid> = emptySet(),
    val workspaceId: Uuid? = null,
    val enabledSkills: Set<String> = emptySet(),
)

// 内置搜索是模型的开关，不在助手上，由调用方另行填入
private fun Assistant.toConversationConfig() = ConversationConfig(
    chatModelId = chatModelId,
    reasoningLevel = reasoningLevel,
    enableWebSearch = enableWebSearch,
    mcpServers = mcpServers,
    workspaceId = workspaceId,
    enabledSkills = enabledSkills,
)

private fun Assistant.withConversationConfig(config: ConversationConfig) = copy(
    chatModelId = config.chatModelId,
    reasoningLevel = config.reasoningLevel,
    enableWebSearch = config.enableWebSearch,
    mcpServers = config.mcpServers,
    workspaceId = config.workspaceId,
    enabledSkills = config.enabledSkills,
)

/**
 * 会话上的这份快照是否属于助手当前的独立期：
 * 助手开着「对话独立设置」（pinSessionId 非空），且快照带着同一个 id。
 * 拨动开关会换 id，所以上一个独立期拍的快照全部不再算数，不会在关掉再打开后复活。
 */
private fun Conversation.isPinnedBy(stored: Assistant): Boolean {
    val pinSessionId = stored.pinSessionId ?: return false
    return config?.pinSessionId == pinSessionId
}

/** 会话视角下的助手：会话开始后，会话持有的字段覆盖助手自身的值。 */
fun Assistant.withConversation(conversation: Conversation): Assistant {
    // 助手关着「对话独立设置」时，会话上保留的快照不生效，直接用助手自身的设置
    if (!conversation.isPinnedBy(this)) return this
    val config = conversation.config ?: return this
    return withConversationConfig(config).copy(
        modeInjectionIds = conversation.modeInjectionIds,
        lorebookIds = conversation.lorebookIds,
    )
}

/** 聊天页改动助手后留在会话上的部分，[updated] 是会话视角下改动后的助手。 */
fun Conversation.withAssistantUpdate(updated: Assistant, settings: Settings): Conversation {
    val previous = settings.getAssistantOf(this)
    val config = config
    val conversation = if (!settings.isConfigPinned(this) || config == null) {
        this
    } else {
        copy(
            config = updated.toConversationConfig().copy(
                pinSessionId = config.pinSessionId,
                builtInSearch = if (updated.chatModelId == config.chatModelId) {
                    config.builtInSearch
                } else {
                    // 内置搜索是模型自身的能力，换模型后跟随新模型的开关
                    settings.findModelById(updated.chatModelId)?.tools?.contains(BuiltInTools.Search) == true
                }
            ),
            modeInjectionIds = updated.modeInjectionIds,
            lorebookIds = updated.lorebookIds,
        )
    }
    // 工作目录属于原来的工作区，换工作区后失效
    return if (updated.workspaceId != previous.workspaceId) conversation.copy(workspaceCwd = null) else conversation
}

/** 聊天页改动助手后写回助手设置的部分：会话持有的字段保持 [stored] 的原值。 */
fun Assistant.withoutConversationFields(conversation: Conversation, stored: Assistant): Assistant =
    if (!conversation.isPinnedBy(stored)) {
        this
    } else {
        withConversationConfig(stored.toConversationConfig()).copy(
            // 开关只在助手设置页拨动，聊天页的改动不许把它带跑
            pinSessionId = stored.pinSessionId,
            modeInjectionIds = stored.modeInjectionIds,
            lorebookIds = stored.lorebookIds,
        )
    }

/** 会话所属助手自身的设置，不含会话上固定的配置；助手被删除后退回当前助手。 */
fun Settings.getStoredAssistantOf(conversation: Conversation): Assistant =
    getAssistantById(conversation.assistantId) ?: getCurrentAssistant()

/** 会话所属的助手（会话视角）。 */
fun Settings.getAssistantOf(conversation: Conversation): Assistant {
    val stored = getStoredAssistantOf(conversation)
    val assistant = stored.withConversation(conversation)
    if (!conversation.isPinnedBy(stored)) return assistant
    // 助手自身的失效引用在读取设置时已清理，会话上固定的这份在这里滤掉
    return assistant.copy(
        mcpServers = assistant.mcpServers.filterTo(mutableSetOf()) { id -> mcpServers.any { it.id == id } },
        modeInjectionIds = assistant.modeInjectionIds
            .filterTo(mutableSetOf()) { id -> modeInjections.any { it.id == id } },
        lorebookIds = assistant.lorebookIds.filterTo(mutableSetOf()) { id -> lorebooks.any { it.id == id } },
    )
}

/** 会话使用的聊天模型；会话开始后内置搜索以会话上固定的开关为准。 */
fun Settings.getChatModelOf(conversation: Conversation): Model? {
    val stored = getStoredAssistantOf(conversation)
    val assistantModel = findModelById(stored.chatModelId ?: chatModelId)
    if (!conversation.isPinnedBy(stored)) return assistantModel
    val config = conversation.config ?: return assistantModel
    // 固定的模型被删除后退回助手当前的模型，内置搜索也跟随该模型自身的开关
    val model = findModelById(config.chatModelId) ?: return assistantModel
    return model.copy(
        tools = if (config.builtInSearch) model.tools + BuiltInTools.Search else model.tools - BuiltInTools.Search
    )
}

/**
 * 会话是否真的固定着自己的配置：
 * 会话有快照，且所属助手开着「对话独立设置」，且快照属于当前这一期。
 */
fun Settings.isConfigPinned(conversation: Conversation): Boolean =
    conversation.isPinnedBy(getStoredAssistantOf(conversation))

/**
 * 把助手当前的配置固定到会话上。已经固定过的会话原样返回，
 * 只有固定的模型被删除时才改为固定助手当前的模型，之后不再跟着助手变。
 * 助手关着「对话独立设置」时不固定，会话一直跟着助手；
 * 快照属于上一期（开关被拨动过）时按当前设置重新拍一张。
 */
fun Conversation.bindConfig(settings: Settings): Conversation {
    val stored = settings.getStoredAssistantOf(this)
    val pinSessionId = stored.pinSessionId ?: return this
    val config = config
    if (config != null && config.pinSessionId == pinSessionId) {
        val model = settings.getChatModelOf(this) ?: return this
        if (model.id == config.chatModelId) return this
        return copy(config = config.copy(chatModelId = model.id, builtInSearch = BuiltInTools.Search in model.tools))
    }
    // 走的是助手当前的设置：上一期的快照已经判废，这里补拍一张这一期的
    val model = settings.getChatModelOf(this)
    val assistant = settings.getAssistantOf(this)
    return copy(
        config = assistant.toConversationConfig().copy(
            pinSessionId = pinSessionId,
            chatModelId = model?.id,
            builtInSearch = model != null && BuiltInTools.Search in model.tools,
        ),
        // 旧版本允许会话单独绑定注入，这类会话保留自己的绑定
        modeInjectionIds = modeInjectionIds.ifEmpty { assistant.modeInjectionIds },
        lorebookIds = lorebookIds.ifEmpty { assistant.lorebookIds },
    )
}
