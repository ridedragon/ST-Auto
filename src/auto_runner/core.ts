import _ from 'lodash';
import { computed, ref, watch } from 'vue';
import { z } from 'zod';
import mammoth from 'mammoth';
import {
  PromptEntrySchema,
  PromptSetSchema,
  SettingsSchema,
  RegexRuleSchema,
  type RegexRule,
  type Settings,
} from './types';

// --- 状态管理 ---
const ABORT_SIGNAL = Symbol('ABORT_SIGNAL');
export const isCallingSubAI = ref(false); // 响应式状态，用于UI更新
let subAiAbortController: AbortController | null = null;

enum AutomationState {
  IDLE,
  RUNNING,
  PAUSED,
  ERROR,
}

let state: AutomationState = AutomationState.IDLE;
let isAutomationRunning = false; // 防止并发执行的锁
let pendingAutomationRun = false; // 用于处理并发触发的标志
export const settings = ref<Settings>(SettingsSchema.parse({}));
let retryCount = 0;
let mainAiRegenRetryCount = 0; // 用于主AI空消息重试的计数器
let internalExemptionCounter = 0; // 新增的、只在内存中的豁免计数器
let isTrulyAutomatedMode = false; // “真·自动化”模式开关

// --- 响应式数据 ---

// 当前激活的提示词配置集
export const activePromptSet = computed(() => {
  const activeSet = settings.value.promptSets.find(p => p.id === settings.value.activePromptSetId);
  if (activeSet) {
    return activeSet;
  }
  // 如果找不到，或者没有激活的，返回一个默认的空集，避免UI崩溃
  return PromptSetSchema.parse({ name: '（无有效配置）', promptEntries: [] });
});

// --- 配置集管理函数 ---

export function addNewPromptSet() {
  const newName = window.prompt('请输入新配置的名称：', `新配置 ${settings.value.promptSets.length + 1}`);
  if (!newName) return;

  const chatHistoryEntry = PromptEntrySchema.parse({
    name: '聊天记录',
    content: '此条目是聊天记录的占位符',
    enabled: true,
    editing: false,
    role: 'user',
    is_chat_history: true,
  });

  const newSet = PromptSetSchema.parse({
    name: newName,
    promptEntries: [chatHistoryEntry],
  });
  settings.value.promptSets.push(newSet);
  settings.value.activePromptSetId = newSet.id;
  showToast('success', `已创建新配置 "${newName}"`);
}

export function renameActivePromptSet() {
  const activeSet = activePromptSet.value;
  if (!activeSet || activeSet.name === '（无有效配置）') return;

  const newName = window.prompt('请输入新的名称：', activeSet.name);
  if (newName && newName !== activeSet.name) {
    const setToUpdate = settings.value.promptSets.find(p => p.id === activeSet.id);
    if (setToUpdate) {
      setToUpdate.name = newName;
      showToast('success', '配置已重命名');
    }
  }
}

export function deleteActivePromptSet() {
  if (settings.value.promptSets.length <= 1) {
    showToast('error', '无法删除最后一个配置集', true);
    return;
  }

  const activeSet = activePromptSet.value;
  if (!activeSet || !window.confirm(`确定要删除配置 "${activeSet.name}" 吗？此操作不可撤销。`)) {
    return;
  }

  const index = settings.value.promptSets.findIndex(p => p.id === activeSet.id);
  if (index > -1) {
    settings.value.promptSets.splice(index, 1);
    // 激活前一个或第一个
    settings.value.activePromptSetId = settings.value.promptSets[Math.max(0, index - 1)]?.id || null;
    showToast('success', `配置 "${activeSet.name}" 已删除`);
  }
}

export function exportActivePromptSet() {
  const activeSet = activePromptSet.value;
  if (!activeSet || activeSet.name === '（无有效配置）') {
    showToast('error', '没有可导出的有效配置。');
    return;
  }

  const exportData = {
    version: 2,
    promptSet: activeSet,
    contextRegexRules: settings.value.contextRegexRules,
    subAiRegexRules: settings.value.subAiRegexRules,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `[AutoRunner] ${activeSet.name}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('success', '当前完整预设（提示词+正则）已导出');
}

export function importPromptSets() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      const data = JSON.parse(text);

      // --- 新的导入逻辑 ---
      if (data.version === 2 && data.promptSet) {
        // 这是新的完整预设格式
        const { promptSet, contextRegexRules, subAiRegexRules } = data;

        // 1. 导入提示词集
        const parsedSet = PromptSetSchema.safeParse(promptSet);
        if (parsedSet.success) {
          let targetSet = settings.value.promptSets.find(p => p.name === parsedSet.data.name);
          if (targetSet) {
            if (window.confirm(`已存在名为 "${parsedSet.data.name}" 的提示词配置。要覆盖它吗？`)) {
              const index = settings.value.promptSets.findIndex(p => p.id === targetSet!.id);
              if (index > -1) {
                // 保持ID不变，只更新内容
                parsedSet.data.id = targetSet.id;
                settings.value.promptSets[index] = parsedSet.data;
              }
            }
          } else {
            parsedSet.data.id = `set_${Date.now()}_${Math.random()}`;
            settings.value.promptSets.push(parsedSet.data);
          }
          settings.value.activePromptSetId = parsedSet.data.id;
          showToast('success', `提示词配置 "${parsedSet.data.name}" 已导入并激活。`);
        } else {
          showToast('error', '导入的提示词配置部分格式无效。', true);
          return;
        }

        // 2. 导入正则规则
        if (
          contextRegexRules &&
          subAiRegexRules &&
          window.confirm('文件包含正则规则。要用导入的规则覆盖当前的上下文和副AI正则规则吗？')
        ) {
          const parsedContextRules = z.array(RegexRuleSchema).safeParse(contextRegexRules);
          const parsedSubAiRules = z.array(RegexRuleSchema).safeParse(subAiRegexRules);

          if (parsedContextRules.success && parsedSubAiRules.success) {
            settings.value.contextRegexRules = parsedContextRules.data;
            settings.value.subAiRegexRules = parsedSubAiRules.data;
            showToast('success', '上下文和副AI正则规则已成功导入。');
          } else {
            showToast('error', '导入的正则规则部分格式无效。', true);
          }
        }
      } else {
        // --- 旧的、只导入提示词集的逻辑 ---
        const setsToImport: any[] = Array.isArray(data) ? data : [data];
        let importedCount = 0;
        for (const setData of setsToImport) {
          const parsed = PromptSetSchema.safeParse(setData);
          if (parsed.success) {
            if (settings.value.promptSets.some(p => p.name === parsed.data.name)) {
              if (!window.confirm(`已存在名为 "${parsed.data.name}" 的配置。要覆盖它吗？`)) {
                continue;
              }
              const oldIndex = settings.value.promptSets.findIndex(p => p.name === parsed.data.name);
              if (oldIndex > -1) settings.value.promptSets.splice(oldIndex, 1);
            }
            parsed.data.id = `set_${Date.now()}_${Math.random()}`;
            settings.value.promptSets.push(parsed.data);
            importedCount++;
          } else {
            console.error('导入的数据格式无效:', parsed.error);
            showToast('error', '一个或多个导入的配置格式无效，详情请查看控制台。', true);
          }
        }
        if (importedCount > 0) {
          showToast('success', `成功导入 ${importedCount} 个旧格式的配置。`);
        }
      }
    } catch (error) {
      console.error('导入失败:', error);
      showToast('error', '导入文件失败，请确保是有效的JSON文件。', true);
    }
  };
  input.click();
}

// 创建一个防抖函数用于保存
const debouncedSave = _.debounce((newSettings: Settings) => {
  // 关键修复：使用JSON序列化来彻底净化对象，移除Vue的Proxy
  const pureSettings = JSON.parse(JSON.stringify(newSettings));
  replaceVariables(pureSettings, { type: 'script', script_id: getScriptId() });
  console.log('[AutoRunner] Settings saved.');
}, 500);

// 监听设置变化并调用防抖函数
watch(
  settings,
  newSettings => {
    debouncedSave(newSettings);
  },
  { deep: true },
);

// --- 辅助函数 ---

/**
 * 根据设置决定是否显示通知
 * @param type 通知类型 ('info', 'success', 'warning', 'error')
 * @param message 显示的消息
 * @param alwaysShow 无论如何都显示 (用于最关键的通知)
 */
function showToast(type: 'info' | 'success' | 'warning' | 'error', message: string, alwaysShow = false) {
  if (!settings.value.conciseNotifications || alwaysShow) {
    toastr[type](message);
  }
}

/**
 * 应用一个正则表达式规则数组到文本上
 * @param text 原始文本
 * @param rules 规则数组
 * @returns 处理后的文本
 */
function applyRegexRules(text: string, rules: readonly RegexRule[]): string {
  let processedText = text;
  for (const rule of rules) {
    if (rule.enabled && rule.find) {
      try {
        const match = rule.find.match(/^\/(.*)\/([gimsuy]*)$/s);
        let pattern: string;
        let flags: string;

        if (match) {
          pattern = match[1];
          flags = match[2];
        } else {
          pattern = rule.find;
          flags = 'g'; // 默认是全局
        }

        // 如果模式以 ^ 开头，全局标志 'g' 的行为可能不符合预期。
        // 在这种情况下，我们移除 'g' 标志，并手动循环替换。
        if (pattern.startsWith('^') && flags.includes('g')) {
          const nonGlobalFlags = flags.replace('g', '');
          const regex = new RegExp(pattern, nonGlobalFlags);
          // 循环替换，直到不再匹配
          while (regex.test(processedText)) {
            processedText = processedText.replace(regex, rule.replace);
          }
        } else {
          // 对于其他情况，标准替换即可
          const regex = new RegExp(pattern, flags);
          processedText = processedText.replace(regex, rule.replace);
        }
      } catch (e) {
        console.error(`正则表达式规则 "${rule.name || rule.id}" 无效:`, e);
      }
    }
  }
  return processedText;
}

/**
 * 延迟指定毫秒
 * @param ms 延迟的毫秒数
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 获取最新的设置，并处理旧数据迁移
 */
export async function refreshSettings() {
  // 1. 加载原始数据
  const savedSettingsRaw = getVariables({ type: 'script', script_id: getScriptId() }) || {};
  // 2. 关键修复：使用JSON序列化来彻底净化对象，移除之前版本可能存入的Proxy
  const savedSettings = JSON.parse(JSON.stringify(savedSettingsRaw));
  const result = SettingsSchema.safeParse(savedSettings);

  if (result.success) {
    // 1. 解析成功，现在对数据进行健康检查和修复
    const parsed = result.data;
    let wasModified = false;

    // 确保至少有一个配置集
    if (parsed.promptSets.length === 0) {
      const chatHistoryEntry = PromptEntrySchema.parse({
        name: '聊天记录',
        content: '此条目是聊天记录的占位符',
        enabled: true,
        editing: false,
        role: 'user',
        is_chat_history: true,
      });
      const defaultSet = PromptSetSchema.parse({
        name: '默认配置',
        promptEntries: [chatHistoryEntry],
      });
      parsed.promptSets.push(defaultSet);
      parsed.activePromptSetId = defaultSet.id;
      wasModified = true;
      showToast('info', '未找到任何配置，已创建默认配置。');
    } else {
      // 确保每个配置集都有聊天记录条目
      for (const pSet of parsed.promptSets) {
        if (!pSet.promptEntries.some(e => e.is_chat_history)) {
          const chatHistoryEntry = PromptEntrySchema.parse({
            name: '聊天记录',
            content: '此条目是聊天记录的占位符',
            enabled: true,
            editing: false,
            role: 'user',
            is_chat_history: true,
          });
          pSet.promptEntries.unshift(chatHistoryEntry);
          wasModified = true;
          showToast('info', `为配置 "${pSet.name}" 补全了缺失的“聊天记录”条目。`);
        }
      }
    }

    // 确保 activePromptSetId 有效
    if (!parsed.promptSets.some(p => p.id === parsed.activePromptSetId)) {
      parsed.activePromptSetId = parsed.promptSets[0]?.id || null;
      wasModified = true;
    }

    settings.value = parsed;
    if (wasModified) {
      // 如果我们修复了任何东西，立即保存回去
      debouncedSave.cancel(); // 取消任何待处理的保存
      replaceVariables(JSON.parse(JSON.stringify(parsed)), { type: 'script', script_id: getScriptId() });
    }
  } else {
    // 2. 解析失败，数据已损坏或格式过时
    console.error('[AutoRunner] 加载或解析设置失败:', result.error);
    showToast('error', '加载设置时发现不兼容的数据，将尝试迁移。您的部分设置可能已重置。', true);

    // --- 稳健的迁移逻辑 ---
    const migratedSettings = SettingsSchema.parse({}); // 创建一个包含所有默认值的新设置对象

    // 逐个字段尝试从旧数据迁移
    for (const key in migratedSettings) {
      if (Object.prototype.hasOwnProperty.call(savedSettings, key)) {
        const keyTyped = key as keyof Settings;
        const fieldSchema = SettingsSchema.shape[keyTyped];
        const parseResult = fieldSchema.safeParse(savedSettings[keyTyped]);
        if (parseResult.success) {
          // @ts-expect-error - We are dynamically assigning to a typed object, which is unsafe but intended here.
          migratedSettings[keyTyped] = parseResult.data;
        } else {
          console.warn(`[AutoRunner] 无法迁移字段 "${keyTyped}"，将使用默认值。错误:`, parseResult.error);
        }
      }
    }

    // 对迁移后的数据执行与成功路径中相同的健康检查
    let wasModified = false;
    if (migratedSettings.promptSets.length === 0) {
      const chatHistoryEntry = PromptEntrySchema.parse({
        name: '聊天记录',
        content: '此条目是聊天记录的占位符',
        enabled: true,
        editing: false,
        role: 'user',
        is_chat_history: true,
      });
      const defaultSet = PromptSetSchema.parse({ name: '默认配置', promptEntries: [chatHistoryEntry] });
      migratedSettings.promptSets.push(defaultSet);
      migratedSettings.activePromptSetId = defaultSet.id;
      wasModified = true;
    } else {
      for (const pSet of migratedSettings.promptSets) {
        if (!pSet.promptEntries.some(e => e.is_chat_history)) {
          const chatHistoryEntry = PromptEntrySchema.parse({
            name: '聊天记录',
            content: '此条目是聊天记录的占位符',
            enabled: true,
            editing: false,
            role: 'user',
            is_chat_history: true,
          });
          pSet.promptEntries.unshift(chatHistoryEntry);
          wasModified = true;
        }
      }
    }
    if (!migratedSettings.promptSets.some(p => p.id === migratedSettings.activePromptSetId)) {
      migratedSettings.activePromptSetId = migratedSettings.promptSets[0]?.id || null;
      wasModified = true;
    }

    settings.value = migratedSettings;

    // 用修复和迁移后的设置覆盖掉旧数据
    debouncedSave.cancel();
    replaceVariables(JSON.parse(JSON.stringify(migratedSettings)), { type: 'script', script_id: getScriptId() });
    showToast('success', '数据迁移完成。请检查您的设置。', true);
  }
}

/**
 * 检查是否应该停止循环
 */
function shouldStop(): boolean {
  if (state !== AutomationState.RUNNING) {
    return true;
  }
  // 如果 totalReplies <= 0，则视为无限次运行
  if (settings.value.totalReplies <= 0) {
    return false;
  }
  if (settings.value.executedCount >= settings.value.totalReplies) {
    showToast('info', '已达到总回复次数，全自动运行结束。', true);
    return true;
  }
  return false;
}

/**
 * 增加执行次数
 */
async function incrementExecutedCount() {
  settings.value.executedCount++;
  // 立即保存以防止在快速连续运行时因刷新设置而丢失状态。
  // 我们取消任何待处理的防抖保存，并立即执行一次保存。
  debouncedSave.cancel();
  const pureSettings = JSON.parse(JSON.stringify(settings.value));
  replaceVariables(pureSettings, { type: 'script', script_id: getScriptId() });
}

/**
 * 调用副AI
 */
async function callSubAI(): Promise<string | null | typeof ABORT_SIGNAL> {
  const toastElement = toastr.info('正在向副AI发送消息...', undefined, {
    timeOut: 0, // 不会自动消失
    extendedTimeOut: 0,
    closeButton: false,
    tapToDismiss: false,
  });

  isCallingSubAI.value = true;
  subAiAbortController = new AbortController();

  try {
    const lastMessageId = await getLastMessageId();
    const allMessages = getChatMessages(`0-${lastMessageId}`);
    if (!allMessages || allMessages.length === 0) {
      showToast('error', '无法获取聊天记录', true);
      return null;
    }

    const finalMessages: {
      role: string;
      content: (string | { type: string; image_url?: { url: string }; text?: string })[];
    }[] = [];

    const messagesForSubAI = allMessages.filter(msg => msg.role !== 'system');
    const processedChatMessages = messagesForSubAI.map(msg => {
      const content = applyRegexRules(msg.message, settings.value.contextRegexRules);
      return { role: msg.role, content: [content] };
    });

    for (const entry of activePromptSet.value.promptEntries) {
      if (entry.is_chat_history) {
        finalMessages.push(...processedChatMessages);
      } else if (entry.enabled) {
        const contentParts: (string | { type: string; image_url?: { url: string }; text?: string })[] = [];

        // Add text content if it exists
        if (entry.content) {
          contentParts.push(entry.content);
        }

        // Add attachments
        if (entry.attachments && entry.attachments.length > 0) {
          for (const attachment of entry.attachments) {
            const binaryString = atob(attachment.content);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;

            if (attachment.type.startsWith('image/')) {
              contentParts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${attachment.type};base64,${attachment.content}`,
                },
              });
            } else if (
              attachment.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ) {
              try {
                const result = await mammoth.extractRawText({ arrayBuffer });
                contentParts.push(
                  `\n\n--- Attachment: ${attachment.name} ---\n${result.value}\n--- End Attachment ---`,
                );
              } catch (e) {
                console.error(`Error extracting text from docx ${attachment.name}:`, e);
              }
            } else {
              // For other non-image files (like text, json), decode and append as text
              try {
                const blob = new Blob([arrayBuffer], { type: attachment.type });
                const decodedContent = await new Response(blob).text();
                contentParts.push(
                  `\n\n--- Attachment: ${attachment.name} ---\n${decodedContent}\n--- End Attachment ---`,
                );
              } catch (e) {
                console.error(`Error decoding attachment ${attachment.name}:`, e);
              }
            }
          }
        }

        if (contentParts.length > 0) {
          finalMessages.push({ role: entry.role, content: contentParts });
        }
      }
    }

    // OpenAI's type for messages with images is slightly different.
    // We need to adjust the structure if there are images.
    const messagesForApi = finalMessages.map(msg => {
      // If content is an array and has more than just a single string,
      // it's a multi-modal message.
      if (Array.isArray(msg.content) && msg.content.length > 1) {
        const newContent = msg.content
          .map(part => {
            if (typeof part === 'string') {
              return { type: 'text', text: part };
            }
            return part;
          })
          .filter(Boolean); // Filter out any empty parts
        return { ...msg, content: newContent };
      }
      // Otherwise, it's a simple text message.
      return { ...msg, content: Array.isArray(msg.content) ? msg.content.join('\n') : msg.content };
    });

    const body = {
      model: settings.value.model,
      messages: messagesForApi,
      temperature: settings.value.temperature,
      top_p: settings.value.top_p,
      top_k: settings.value.top_k,
      max_tokens: settings.value.max_tokens,
    };

    console.log('[AutoRunner] 发送给副AI的完整信息:', body);
    if (!settings.value.conciseNotifications) {
      showToast('info', '完整的请求信息已打印到控制台 (F12)。');
    }

    const response = await fetch(`${settings.value.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.value.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: subAiAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(`副AI API 请求失败: ${response.statusText}`);
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('副AI未返回有效内容');
    }
    showToast('success', '副AI响应成功');
    return reply;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      showToast('warning', '已中止向副AI发送消息。', true);
      return ABORT_SIGNAL;
    } else {
      console.error('调用副AI时出错:', error);
      showToast('error', `调用副AI失败: ${(error as Error).message}`, true);
    }
    return null;
  } finally {
    // toastr.remove() 可能因元素被修改而不可靠。
    // toastr.clear() 是一个更稳健的方法，可以移除所有提示。
    // 因为这是我们期望的唯一持久性提示，所以这样做是安全的。
    toastr.clear();
    isCallingSubAI.value = false;
    subAiAbortController = null;
  }
}

/**
 * 处理副AI的响应
 * @param reply 副AI的原始回复
 */
function processSubAiResponse(reply: string): string {
  return applyRegexRules(reply, settings.value.subAiRegexRules);
}

/**
 * 获取最后一条角色消息的文本
 */
async function getLastCharMessage(): Promise<string> {
  try {
    const lastMessageId = await getLastMessageId();
    if (lastMessageId < 0) return '';

    // 搜索最近的10条消息以提高效率
    const startId = Math.max(0, lastMessageId - 9);
    const messages = getChatMessages(`${startId}-${lastMessageId}`);

    const lastCharMsg = [...messages].reverse().find(m => m.role === 'assistant');
    return lastCharMsg ? lastCharMsg.message : '';
  } catch (e) {
    console.error('获取最后一条角色消息时出错:', e);
    return '';
  }
}

/**
 * 执行“一键处理”按钮的核心逻辑
 * 1. 移除最后一条消息中的 <br> 标签
 * 2. 触发“重新读取初始变量”
 * 3. 触发“重新处理变量”
 */
async function executeOneClickProcess() {
  showToast('info', '正在执行“一键处理”...');
  try {
    // 步骤 1: 去除换行标签
    const messages = getChatMessages(-1);
    if (messages && messages.length > 0) {
      const lastMessage = messages[0];
      const { message_id, message: originalContent } = lastMessage;
      const findRegex = /<\/?br\b[^>]*>/gi;

      if (findRegex.test(originalContent)) {
        const newContent = originalContent.replace(findRegex, '\n');
        await setChatMessages([{ message_id, message: newContent }]);
        console.log('[AutoRunner] 已移除<br>标签。');
      }
    }

    // 步骤 2 & 3: 触发其他按钮事件
    await eventEmit(getButtonEvent('重新读取初始变量'));
    await eventEmit(getButtonEvent('重新处理变量'));

    showToast('success', '“一键处理”完成。');
  } catch (error) {
    console.error('[AutoRunner] 执行“一键处理”时出错:', error);
    showToast('error', '执行“一键处理”时发生错误。', true);
  }
}

/**
 * 执行SSC优化和“一键处理”，并处理用户取消操作
 * @returns {Promise<boolean>} 如果成功或无事可做则返回 true，如果用户取消则返回 false
 */
/**
 * 切换“真·自动化”模式
 */
export function toggleTrulyAutomatedMode() {
  isTrulyAutomatedMode = !isTrulyAutomatedMode;
  showToast('info', `“真·自动化”模式已${isTrulyAutomatedMode ? '开启' : '关闭'}`, true);
}

async function triggerSscAndProcess(force = false): Promise<boolean> {
  // 检查豁免条件
  if (!force && internalExemptionCounter < settings.value.exemptionCount) {
    showToast(
      'info',
      `豁免计数 (${internalExemptionCounter + 1}/${settings.value.exemptionCount})，跳过SSC和一键处理。`,
    );
    internalExemptionCounter++;
    return true; // 跳过，但流程继续
  }

  try {
    // 只有在不豁免的情况下才执行 SSC 优化
    const api = (window.parent as any).aiOptimizer;
    if (!api || typeof api.manualOptimize !== 'function' || typeof api.optimizeText !== 'function') {
      showToast('warning', '未找到 AI Optimizer API，跳过优化步骤。');
    } else {
      showToast('info', '自动化优化流程已启动...');
      const sourceContent: string | null = await new Promise(resolve => {
        api.manualOptimize((content: string | null) => resolve(content));
      });

      if (!sourceContent) {
        showToast('info', '在最后一条角色消息中未找到可优化的内容，跳过SSC优化。');
      } else {
        // 步骤1: 提取和编辑
        (window.parent as any).tempPopupText = sourceContent;
        const extractedPopupContent = `<p>已提取以下内容（可编辑），点击“继续”发送给AI优化：</p><textarea oninput="window.parent.tempPopupText = this.value" id="auto-optimizer-source" class="text_pole" rows="10" style="width: 100%;">${sourceContent}</textarea>`;

        let continueStep1: boolean;
        if (isTrulyAutomatedMode) {
          showToast('info', '[真·自动化] 自动确认步骤1。');
          continueStep1 = true;
        } else {
          continueStep1 = await (window.parent as any).SillyTavern.getContext().callGenericPopup(
            extractedPopupContent,
            '步骤1: 提取并编辑',
            '',
            { okButton: '继续', cancelButton: '取消', wide: true },
          );
        }

        const editedSourceContent = (window.parent as any).tempPopupText;
        delete (window.parent as any).tempPopupText;

        if (!continueStep1) {
          showToast('info', '自动化流程已由用户在步骤1取消。');
          return false; // 用户取消
        }
        if (state !== AutomationState.RUNNING) return false; // 在弹窗后检查中止状态

        showToast('info', '正在发送给AI优化...');

        // 步骤2: 优化
        const lastCharMessage = await getLastCharMessage();
        const systemPrompt = typeof api.getSystemPrompt === 'function' ? api.getSystemPrompt() : '';
        const optimizedResultText = await api.optimizeText(editedSourceContent, systemPrompt, lastCharMessage);

        if (optimizedResultText === null) {
          showToast('info', '优化被用户取消。');
          return false; // 用户取消
        }
        if (!optimizedResultText) {
          throw new Error('AI 未能返回优化后的文本。');
        }

        // 步骤3: 对比和替换
        (window.parent as any).tempPopupText = optimizedResultText;
        const optimizedPopupContent = `
                    <p><b>原始句子:</b></p>
                    <textarea class="text_pole" rows="5" style="width: 100%;" readonly>${editedSourceContent}</textarea>
                    <p><b>优化后句子 (可编辑):</b></p>
                    <textarea oninput="window.parent.tempPopupText = this.value" id="auto-optimizer-result" class="text_pole" rows="5" style="width: 100%;">${optimizedResultText}</textarea>
                `;
        let userConfirmed: boolean;
        if (isTrulyAutomatedMode) {
          showToast('info', '[真·自动化] 自动确认步骤2。');
          userConfirmed = true;
        } else {
          userConfirmed = await (window.parent as any).SillyTavern.getContext().callGenericPopup(
            optimizedPopupContent,
            '步骤2: 对比并确认替换',
            '',
            { okButton: '替换', cancelButton: '取消', wide: true },
          );
        }

        const finalOptimizedText = (window.parent as any).tempPopupText;
        delete (window.parent as any).tempPopupText;

        if (!userConfirmed) {
          showToast('info', '替换操作已由用户取消。');
          return false; // 用户取消
        }
        if (state !== AutomationState.RUNNING) return false; // 在第二个弹窗后检查中止状态

        showToast('info', '正在执行SSC替换...');
        await new Promise<void>(resolve => {
          api.replaceMessage(editedSourceContent, finalOptimizedText, (newContent: string | null) => {
            if (newContent) {
              showToast('success', 'SSC 替换完成！');
            }
            resolve();
          });
        });
      }
    }

    // 无论是否执行了SSC，都继续执行后续步骤
    showToast('info', '等待2秒以确保系统稳定...');
    await delay(2000);

    // 直接调用“一键处理”的逻辑
    await executeOneClickProcess();
    await delay(5000); // 保留原有的5秒等待

    return true; // 表示整个流程（无论是否包含SSC）成功继续
  } catch (error) {
    console.error('[Auto Optimizer] 流程执行出错:', error);
    showToast('error', (error as Error).message, true);
    return false; // 失败
  }
}

// --- 主循环逻辑 ---

async function runAutomation(isFirstRun = false) {
  // 关键修复：防止并发执行的锁检查
  if (isAutomationRunning) {
    console.log('[AutoRunner] Automation is already running. Setting pending flag.');
    pendingAutomationRun = true; // 设置标志，表示有待处理的运行请求
    return;
  }

  if (shouldStop()) {
    stopAutomation();
    return;
  }

  try {
    isAutomationRunning = true; // 获取锁

    // 首次运行时，我们信任 startAutomation 中准备好的、最新的设置。
    // 后续运行时，刷新以获取用户在UI上可能做出的新更改。
    if (!isFirstRun) {
      await refreshSettings();
    }
    const lastMessage = (getChatMessages(-1) || [])[0];

    if (!lastMessage) {
      showToast('error', '无法获取最后一条消息，自动化暂停。', true);
      state = AutomationState.PAUSED;
      return; // finally 将释放锁
    }

    if (lastMessage.role === 'user') {
      // --- 分支 A: 最后一条是用户消息 ---
      mainAiRegenRetryCount = 0; // 用户发言，重置主AI空消息重试计数
      showToast('info', '检测到用户消息，触发主AI生成...');
      await triggerSlash('/trigger await=true');
      // 主AI响应完成后，绑定的 tavern_events.MESSAGE_RECEIVED 事件会再次触发 runAutomation
      // 不在这里增加计数，因为这不是一个完整的循环
    } else {
      // --- 分支 B: 最后一条是AI消息 ---

      // 首先，检查AI消息是否为空
      if (!lastMessage.message || lastMessage.message.trim() === '') {
        if (mainAiRegenRetryCount >= settings.value.maxRetries) {
          showToast('error', `主AI多次返回空消息，已达到最大重试次数 (${settings.value.maxRetries})，自动化已停止。`, true);
          stopAutomation({ skipFinalProcessing: true });
          return; // finally 将释放锁
        }
        mainAiRegenRetryCount++;
        showToast(
          'warning',
          `主AI返回空消息，将自动重新生成 (尝试 ${mainAiRegenRetryCount}/${settings.value.maxRetries})。`,
          true,
        );
        await triggerSlash('/regenerate await=true');
        return; // 新消息将再次触发循环
      }

      // AI消息非空，重置计数器并继续
      mainAiRegenRetryCount = 0;
      showToast('info', '检测到AI消息，开始完整循环...');

      // 步骤 1 & 2: SSC 和 一键处理
      const processSuccess = await triggerSscAndProcess();
      if (!processSuccess) {
        stopAutomation({ skipFinalProcessing: true, userCancelled: true });
        return; // finally 将释放锁
      }

      // 关键修复：在长时间处理后，再次检查状态
      if (state !== AutomationState.RUNNING) {
        console.log('[AutoRunner] Automation was stopped during SSC/process phase. Aborting sub AI call.');
        return; // finally 将释放锁
      }

      // 步骤 3 & 4: 发送给副AI，处理并发送（包含对处理后空消息的重试逻辑）
      let subAiRetryCount = 0;
      let finalReplyToSend: string | null = null;

      while (subAiRetryCount <= settings.value.maxRetries) {
        // 检查状态，如果已停止则退出循环
        if (state !== AutomationState.RUNNING) {
          console.log('[AutoRunner] 自动化已停止，跳过副AI调用。');
          return;
        }

        const subAiRawReply = await callSubAI();

        if (subAiRawReply === ABORT_SIGNAL) {
          stopAutomation({ skipFinalProcessing: true, userCancelled: true });
          return; // finally 将释放锁
        }

        if (subAiRawReply) {
          const processedReply = processSubAiResponse(subAiRawReply);
          console.log('处理后的回复:', processedReply);

          // 检查处理后的回复是否有效
          if (processedReply && processedReply.trim() !== '') {
            finalReplyToSend = processedReply;
            break; // 成功，跳出循环
          } else {
            showToast('warning', '副AI返回的消息处理后为空，将重试...');
          }
        }

        subAiRetryCount++;
        if (subAiRetryCount > settings.value.maxRetries) {
          showToast('error', `调用副AI并获得有效回复已达到最大重试次数 (${settings.value.maxRetries})，自动化已停止。`, true);
          stopAutomation({ skipFinalProcessing: true });
          return; // finally 将释放锁
        }
        showToast('warning', `调用副AI失败或回复无效，将在5秒后重试 (${subAiRetryCount}/${settings.value.maxRetries})`);
        await delay(5000);

        // 延迟后再次检查状态
        if (state !== AutomationState.RUNNING) {
          console.log('[AutoRunner] 自动化已停止，重试循环终止。');
          return;
        }
      }

      if (!finalReplyToSend) {
        return; // 如果循环结束了还没有有效回复，则停止当前循环
      }

      showToast('info', '以用户身份发送处理后的消息...');
      await triggerSlash(`/send ${finalReplyToSend}`);
      await triggerSlash('/trigger await=true'); // 触发主AI生成
    }

    // 关键修复：只有在完整的分支B（AI消息 -> 用户消息 -> AI消息）完成后，才增加计数
    if (lastMessage.role !== 'user') {
      await incrementExecutedCount();
    }
  } catch (error) {
    console.error('自动化循环出错:', error);
    showToast('error', `自动化循环发生意外错误: ${(error as Error).message}，流程已终止。`, true);
    state = AutomationState.ERROR;
    stopAutomation({ skipFinalProcessing: true });
  } finally {
    isAutomationRunning = false; // 释放锁

    // 检查是否有在本次运行时被挂起的运行请求
    if (pendingAutomationRun) {
      console.log('[AutoRunner] Processing pending automation run.');
      pendingAutomationRun = false; // 重置标志
      // 使用 setTimeout 避免堆栈溢出，并提供一个小的喘息时间
      setTimeout(() => runAutomation(false), 100);
    }
  }
}

// --- 监听主AI消息完成事件 ---
function onMessageReceived() {
  if (state === AutomationState.RUNNING) {
    // 直接尝试运行，runAutomation内部的锁和标志会处理并发
    // 提供一个小的延迟，以确保酒馆的DOM和其他状态更新完毕
    setTimeout(() => runAutomation(false), 500);
  }
}

/**
 * 强制停止函数，用于监听系统停止事件
 */
function forceStop() {
  if (state === AutomationState.RUNNING) {
    // 在简洁模式下，这条消息会被 stopAutomation 中的消息覆盖，所以只在详细模式下显示
    if (!settings.value.conciseNotifications) {
      showToast('warning', '来自系统的停止信号，全自动运行已终止。');
    }
    stopAutomation({ skipFinalProcessing: true });
  }
}

// --- 暴露给外部的控制函数 ---

/**
 * 启动全自动运行
 */
// The handler for the button click
function onRunButtonClicked() {
  if (state === AutomationState.RUNNING) {
    stopAutomation();
  } else {
    startAutomation();
  }
}

async function startAutomation() {
  if (state === AutomationState.RUNNING) return;

  // 关键修复：重置锁状态，以防万一
  isAutomationRunning = false;

  if (!settings.value.enabled) {
    showToast('warning', '脚本未启用，请先勾选“启用脚本”。', true);
    return;
  }

  // 1. 增加延迟，等待酒馆环境稳定
  await delay(1000);

  // 2. 首先，获取最新的设置，确保任何UI更改都已加载
  await refreshSettings();

  showToast('success', '全自动运行已启动！', true);
  state = AutomationState.RUNNING;
  retryCount = 0;
  mainAiRegenRetryCount = 0; // 重置主AI重试计数器
  internalExemptionCounter = 0; // 重置内部豁免计数器

  // 3. 在内存中重置总执行次数，并异步保存它以更新UI（无需等待）
  settings.value.executedCount = 0;
  // 保存操作已通过 watch a

  // 4. 绑定事件
  eventOn(tavern_events.MESSAGE_RECEIVED, onMessageReceived);
  eventOn(tavern_events.GENERATION_STOPPED, forceStop);

  // 5. 立即开始第一次循环，并告知这是“首次运行”，以使用内存中正确的设置
  runAutomation(true);
}

/**
 * 停止全自动运行
 */
export async function stopAutomation(options: { skipFinalProcessing?: boolean; userCancelled?: boolean } = {}) {
  if (state === AutomationState.IDLE) return;

  let stopMessage: string;
  if (options.userCancelled) {
    stopMessage = '用户取消了操作，全自动运行已停止。';
  } else if (options.skipFinalProcessing) {
    stopMessage = '全自动运行已因错误而终止。';
  } else {
    stopMessage = '全自动运行已停止。';
  }
  showToast('info', stopMessage, true);

  state = AutomationState.IDLE;
  isAutomationRunning = false; // 关键修复：释放锁

  // 解绑事件
  eventRemoveListener(tavern_events.MESSAGE_RECEIVED, onMessageReceived);
  eventRemoveListener(tavern_events.GENERATION_STOPPED, forceStop);

  // 尝试停止任何正在进行的生成
  abortSubAICall(); // 中止可能在运行的副AI调用
  triggerSlash('/stop');

  // 尝试中止 SSC 优化请求
  const aiOptimizer = (window.parent as any).aiOptimizer;
  if (aiOptimizer && typeof aiOptimizer.abortOptimization === 'function') {
    aiOptimizer.abortOptimization();
  }

  // 如果是因错误而停止，则跳过最终处理
  if (options.skipFinalProcessing) {
    // 在简洁模式下，这条消息是多余的，因为上面的 stopMessage 已经足够
    if (!settings.value.conciseNotifications) {
      showToast('warning', '因发生错误而跳过最终处理，脚本已彻底结束。');
    }
    // 无论如何都要重置真自动化模式
    if (isTrulyAutomatedMode) {
      isTrulyAutomatedMode = false;
      showToast('info', '“真·自动化”模式已随运行停止而关闭。');
    }
    return;
  }

  // 最终处理：确保最后一条AI消息也被处理
  showToast('info', '正在对最后生成的消息执行最终处理...');
  await delay(1000); // 等待消息渲染稳定

  const lastMessage = (getChatMessages(-1) || [])[0];
  if (lastMessage && lastMessage.role === 'assistant') {
    // 关键修复：在最终处理期间，临时将状态恢复为 RUNNING，以满足 triggerSscAndProcess 的前置条件
    const prevState = state;
    state = AutomationState.RUNNING;

    try {
      // 强制执行最终处理，忽略豁免计数
      const processSuccess = await triggerSscAndProcess(true);
      if (processSuccess) {
        showToast('success', '最终处理完成，脚本已彻底结束。', true);
      } else {
        showToast('warning', '最终处理被用户取消，脚本已彻底结束。', true);
      }
    } finally {
      // 确保在处理结束后，状态被正确地设置回 IDLE
      state = AutomationState.IDLE;
    }
  } else {
    showToast('info', '没有需要最终处理的AI消息，脚本已结束。');
  }

  // 当任何自动化停止时，都自动关闭“真·自动化”模式，防止状态污染
  if (isTrulyAutomatedMode) {
    isTrulyAutomatedMode = false;
    showToast('info', '“真·自动化”模式已随运行停止而关闭。');
  }
}

/**
 * 中止正在进行的副AI调用
 */
export function abortSubAICall() {
  if (subAiAbortController) {
    subAiAbortController.abort();
    console.log('[AutoRunner] Abort signal sent to sub AI call.');
  }
}

/**
 * 彻底中止所有自动化流程的紧急函数
 */
export function abortAll() {
  // 显式中止可能存在的网络请求，无论当前状态如何
  abortSubAICall();
  // 尝试中止 SSC 优化请求
  const aiOptimizer = (window.parent as any).aiOptimizer;
  if (aiOptimizer && typeof aiOptimizer.abortOptimization === 'function') {
    aiOptimizer.abortOptimization();
  }
  
  // 使用这些选项来模拟用户立即、无条件地停止一切
  stopAutomation({ skipFinalProcessing: true, userCancelled: true });
}

/**
 * 脚本加载时执行
 */
export function start() {
  // 监听按钮点击事件
  eventOn(getButtonEvent('全自动运行'), onRunButtonClicked);

  // 将核心控制函数暴露到全局，供其他脚本使用
  initializeGlobal('AutoRunnerCore', {
    toggleTrulyAutomatedMode,
    abortSubAICall,
    abortAll, // 将新的终止函数添加到全局接口
  });
}

/**
 * 脚本卸载时执行
 */
export function stop() {
  stopAutomation();
  eventRemoveListener(getButtonEvent('全自动运行'), onRunButtonClicked);
}
