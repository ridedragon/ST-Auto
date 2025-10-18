import _ from 'lodash';
import { z } from 'zod';
import { SettingsSchema, type Settings, type RegexRule } from './types';

// --- 类型定义 ---
const PromptEntrySchema = z.object({
  name: z.string(),
  content: z.string(),
  enabled: z.boolean(),
  editing: z.boolean(),
  role: z.enum(['user', 'system', 'assistant']),
});

const PromptsSchema = z.array(PromptEntrySchema);
type PromptEntry = z.infer<typeof PromptEntrySchema>;

// --- 状态管理 ---
enum AutomationState {
  IDLE,
  RUNNING,
  PAUSED,
  ERROR,
}

let state: AutomationState = AutomationState.IDLE;
let settings: Settings = SettingsSchema.parse({});
let retryCount = 0;
let internalExemptionCounter = 0; // 新增的、只在内存中的豁免计数器
let isTrulyAutomatedMode = false; // “真·自动化”模式开关

// --- 辅助函数 ---

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
        // 尝试解析 /pattern/flags 格式
        const match = rule.find.match(/^\/(.*)\/([gimsuy]*)$/s);
        let regex: RegExp;

        if (match) {
          // 输入是 /.../flags 格式
          const pattern = match[1];
          const flags = match[2];
          regex = new RegExp(pattern, flags);
        } else {
          // 输入是普通字符串，默认使用 'g' 标志
          regex = new RegExp(rule.find, 'g');
        }

        processedText = processedText.replace(regex, rule.replace);
      } catch (e) {
        console.error(`正则表达式规则 "${rule.name || rule.id}" 无效:`, e);
        // 避免在控制台刷屏
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
 * 获取最新的设置
 */
async function refreshSettings() {
  try {
    const savedSettings = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    settings = SettingsSchema.parse(_.merge(SettingsSchema.parse({}), savedSettings));
  } catch (error) {
    console.error('[AutoRunner] 加载设置失败:', error);
    toastr.error('加载设置失败，将使用默认设置。');
    settings = SettingsSchema.parse({});
  }
}

/**
 * 检查是否应该停止循环
 */
function shouldStop(): boolean {
  if (state !== AutomationState.RUNNING) {
    return true;
  }
  if (settings.executedCount >= settings.totalReplies) {
    toastr.info('已达到总回复次数，全自动运行结束。');
    return true;
  }
  return false;
}

/**
 * 增加执行次数
 */
async function incrementExecutedCount() {
  settings.executedCount++;
  // 直接修改并保存，让 vue 响应
  await replaceVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });
}

/**
 * 调用副AI
 */
async function callSubAI(): Promise<string | null> {
  toastr.info('正在调用副AI...');
  const lastMessageId = await getLastMessageId();
  const allMessages = getChatMessages(`0-${lastMessageId}`); // 获取所有消息
  if (!allMessages || allMessages.length === 0) {
    toastr.error('无法获取聊天记录');
    return null;
  }

  // 准备提示词和聊天记录
  const finalMessages: { role: string; content: string }[] = [];
  const messagesForSubAI = allMessages.filter(msg => msg.role !== 'system');
  const processedChatMessages = messagesForSubAI.map(msg => {
    const content = applyRegexRules(msg.message, settings.contextRegexRules);
    return { role: msg.role, content };
  });

  for (const entry of settings.promptEntries) {
    if (entry.is_chat_history) {
      finalMessages.push(...processedChatMessages);
    } else if (entry.enabled && entry.content) {
      finalMessages.push({ role: entry.role, content: entry.content });
    }
  }

  const body = {
    model: settings.model,
    messages: finalMessages,
    temperature: settings.temperature,
    top_p: settings.top_p,
    top_k: settings.top_k,
    max_tokens: settings.max_tokens,
  };

  console.log('[AutoRunner] 发送给副AI的完整信息:', body);
  toastr.info('完整的请求信息已打印到控制台 (F12)。');

  try {
    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`副AI API 请求失败: ${response.statusText}`);
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('副AI未返回有效内容');
    }
    toastr.success('副AI响应成功');
    return reply;
  } catch (error) {
    console.error('调用副AI时出错:', error);
    toastr.error(`调用副AI失败: ${(error as Error).message}`);
    return null;
  }
}

/**
 * 处理副AI的响应
 * @param reply 副AI的原始回复
 */
function processSubAiResponse(reply: string): string {
  return applyRegexRules(reply, settings.subAiRegexRules);
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
  toastr.info('正在执行“一键处理”...');
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

    toastr.success('“一键处理”完成。');
  } catch (error) {
    console.error('[AutoRunner] 执行“一键处理”时出错:', error);
    toastr.error('执行“一键处理”时发生错误。');
  }
}

/**
 * 执行SSC优化和“一键处理”，并处理用户取消操作
 * @returns {Promise<boolean>} 如果成功或无事可做则返回 true，如果用户取消则返回 false
 */
/**
 * 切换“真·自动化”模式
 * @param enable 是否开启
 */
export function toggleTrulyAutomatedMode(enable: boolean) {
  isTrulyAutomatedMode = enable;
  toastr.info(`“真·自动化”模式已${enable ? '开启' : '关闭'}`);
}

async function triggerSscAndProcess(): Promise<boolean> {
  // 使用新的内部计数器进行豁免判断
  if (internalExemptionCounter < settings.exemptionCount) {
    toastr.info(
      `豁免计数 (${internalExemptionCounter}) 小于豁免次数 (${settings.exemptionCount})，跳过SSC和一键处理。`,
    );
    internalExemptionCounter++; // 增加内部豁免计数
    return true; // 返回 true 以继续主流程
  }

  const api = (window.parent as any).aiOptimizer;
  if (!api || typeof api.manualOptimize !== 'function' || typeof api.optimizeText !== 'function') {
    toastr.warning('未找到 AI Optimizer API，跳过优化步骤。');
    // 即使找不到API，也继续执行“一键处理”
    toastr.info('执行“一键处理”...');
    await eventEmit(getButtonEvent('一键处理'));
    await delay(5000);
    return true;
  }

  try {
    toastr.info('自动化优化流程已启动...');
    const sourceContent: string | null = await new Promise(resolve => {
      api.manualOptimize((content: string | null) => resolve(content));
    });

    if (!sourceContent) {
      toastr.info('在最后一条角色消息中未找到可优化的内容，跳过SSC优化。');
    } else {
      // 步骤1: 提取和编辑
      (window.parent as any).tempPopupText = sourceContent;
      const extractedPopupContent = `<p>已提取以下内容（可编辑），点击“继续”发送给AI优化：</p><textarea oninput="window.parent.tempPopupText = this.value" id="auto-optimizer-source" class="text_pole" rows="10" style="width: 100%;">${sourceContent}</textarea>`;

      let continueStep1: boolean;
      if (isTrulyAutomatedMode) {
        toastr.info('[真·自动化] 自动确认步骤1。');
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
        toastr.info('自动化流程已由用户在步骤1取消。');
        return false; // 用户取消
      }

      toastr.info('正在发送给AI优化...');

      // 步骤2: 优化
      const lastCharMessage = await getLastCharMessage();
      const systemPrompt = typeof api.getSystemPrompt === 'function' ? api.getSystemPrompt() : '';
      const optimizedResultText = await api.optimizeText(editedSourceContent, systemPrompt, lastCharMessage);

      if (optimizedResultText === null) {
        toastr.info('优化被用户取消。');
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
        toastr.info('[真·自动化] 自动确认步骤2。');
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
        toastr.info('替换操作已由用户取消。');
        return false; // 用户取消
      }

      toastr.info('正在执行SSC替换...');
      await new Promise<void>(resolve => {
        api.replaceMessage(editedSourceContent, finalOptimizedText, (newContent: string | null) => {
          if (newContent) {
            toastr.success('SSC 替换完成！');
          }
          resolve();
        });
      });
    }

    // 关键修复：恢复无条件延迟，以确保SSC替换后的DOM更新完成。
    toastr.info('等待2秒以确保系统稳定...');
    await delay(2000);

    // 直接调用“一键处理”的逻辑，而不是通过事件
    await executeOneClickProcess();
    await delay(5000); // 保留原有的5秒等待

    return true; // 成功
  } catch (error) {
    console.error('[Auto Optimizer] 流程执行出错:', error);
    toastr.error((error as Error).message, '自动化优化流程失败');
    return false; // 失败
  }
}

// --- 主循环逻辑 ---

async function runAutomation(isFirstRun = false) {
  if (shouldStop()) {
    stopAutomation();
    return;
  }

  // 首次运行时，我们信任 startAutomation 中准备好的、最新的设置。
  // 后续运行时，刷新以获取用户在UI上可能做出的新更改。
  if (!isFirstRun) {
    await refreshSettings();
  }
  const lastMessage = (getChatMessages(-1) || [])[0];

  if (!lastMessage) {
    toastr.error('无法获取最后一条消息，自动化暂停。');
    state = AutomationState.PAUSED;
    return;
  }

  try {
    if (lastMessage.role === 'user') {
      // --- 分支 A: 最后一条是用户消息 ---
      toastr.info('检测到用户消息，触发主AI生成...');
      await triggerSlash('/trigger await=true');
      // 主AI响应完成后，绑定的 tavern_events.MESSAGE_RECEIVED 事件会再次触发 runAutomation
    } else {
      // --- 分支 B: 最后一条是AI消息 ---
      toastr.info('检测到AI消息，开始完整循环...');

      // 步骤 1 & 2: SSC 和 一键处理
      const processSuccess = await triggerSscAndProcess();
      if (!processSuccess) {
        toastr.warning('用户取消了操作，全自动运行已停止。');
        stopAutomation();
        return;
      }

      // 步骤 3: 发送给副AI，并包含重试逻辑
      let subAiReply: string | null = null;
      let subAiRetryCount = 0;
      while (subAiRetryCount <= settings.maxRetries) {
        subAiReply = await callSubAI();
        if (subAiReply) {
          break; // 成功获取回复，跳出循环
        }
        subAiRetryCount++;
        if (subAiRetryCount > settings.maxRetries) {
          toastr.error(`调用副AI已达到最大重试次数 (${settings.maxRetries})，自动化已停止。`);
          stopAutomation();
          return;
        }
        toastr.warning(`调用副AI失败，将在5秒后重试 (${subAiRetryCount}/${settings.maxRetries})`);
        await delay(5000);
      }

      if (!subAiReply) {
        // 理论上不会执行到这里，因为上面的循环会return
        toastr.error('未能从副AI获取回复，自动化已停止。');
        stopAutomation();
        return;
      }

      // 步骤 4: 处理副AI回复并以用户身份发送
      const processedReply = processSubAiResponse(subAiReply);
      // 更新UI上的文本框
      // 注意：这里无法直接更新Vue组件的ref，需要通过事件或其他方式通知UI
      // 暂时我们先将它存入一个临时变量，或者考虑用一个 message event
      console.log('处理后的回复:', processedReply);

      toastr.info('以用户身份发送处理后的消息...');
      // 使用 /send 命令，它默认以用户身份发送

      // 根据用户指示，直接发送处理后的消息，不添加任何引号或转义
      await triggerSlash(`/send ${processedReply}`);
      await triggerSlash('/trigger await=true'); // 触发主AI生成
    }

    await incrementExecutedCount();
  } catch (error) {
    // 这个 catch 现在只处理 triggerSscAndProcess 和 triggerSlash 中的意外错误
    console.error('自动化循环出错:', error);
    toastr.error(`自动化循环发生意外错误: ${(error as Error).message}，流程已终止。`);
    state = AutomationState.ERROR;
    stopAutomation();
  }
}

// --- 监听主AI消息完成事件 ---
function onMessageReceived() {
  if (state === AutomationState.RUNNING) {
    // 等待一小段时间，确保酒馆完全处理完消息
    // 后续的运行都不是首次运行
    setTimeout(() => runAutomation(false), 1000);
  }
}

/**
 * 强制停止函数，用于监听系统停止事件
 */
function forceStop() {
  if (state === AutomationState.RUNNING) {
    toastr.warning('来自系统的停止信号，全自动运行已终止。');
    stopAutomation();
  }
}

// --- 暴露给外部的控制函数 ---

/**
 * 启动全自动运行
 */
async function startAutomation() {
  if (state === AutomationState.RUNNING) return;

  // 1. 增加延迟，等待酒馆环境稳定
  await delay(1000);

  // 2. 首先，获取最新的设置，确保任何UI更改都已加载
  await refreshSettings();

  toastr.success('全自动运行已启动！');
  state = AutomationState.RUNNING;
  retryCount = 0;
  internalExemptionCounter = 0; // 重置内部豁免计数器

  // 3. 在内存中重置总执行次数，并异步保存它以更新UI（无需等待）
  settings.executedCount = 0;
  replaceVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });

  // 4. 绑定事件
  eventOn(tavern_events.MESSAGE_RECEIVED, onMessageReceived);
  eventOn(tavern_events.GENERATION_STOPPED, forceStop);

  // 5. 立即开始第一次循环，并告知这是“首次运行”，以使用内存中正确的设置
  runAutomation(true);
}

/**
 * 停止全自动运行
 */
async function stopAutomation() {
  if (state === AutomationState.IDLE) return;

  toastr.info('全自动运行已停止。');
  state = AutomationState.IDLE;

  // 当任何自动化停止时，都自动关闭“真·自动化”模式，防止状态污染
  if (isTrulyAutomatedMode) {
    isTrulyAutomatedMode = false;
    toastr.info('“真·自动化”模式已随运行停止而关闭。');
  }

  // 解绑事件
  eventRemoveListener(tavern_events.MESSAGE_RECEIVED, onMessageReceived);
  eventRemoveListener(tavern_events.GENERATION_STOPPED, forceStop);

  // 尝试停止任何正在进行的生成
  triggerSlash('/stop');

  // 最终处理：确保最后一条AI消息也被处理
  toastr.info('正在对最后生成的消息执行最终处理...');
  await delay(1000); // 等待消息渲染稳定

  const lastMessage = (getChatMessages(-1) || [])[0];
  if (lastMessage && lastMessage.role === 'assistant') {
    // 强制执行最终处理，绕过豁免计数
    if (settings.exemptionCount > 0) {
      internalExemptionCounter = settings.exemptionCount;
    }
    const processSuccess = await triggerSscAndProcess();
    if (processSuccess) {
      toastr.success('最终处理完成，脚本已彻底结束。');
    } else {
      toastr.warning('最终处理被用户取消，脚本已彻底结束。');
    }
  } else {
    toastr.info('没有需要最终处理的AI消息，脚本已结束。');
  }
}

/**
 * 脚本加载时执行
 */
export function start() {
  // 监听按钮点击事件
  eventOn(getButtonEvent('全自动运行'), () => {
    if (state === AutomationState.RUNNING) {
      stopAutomation();
    } else {
      startAutomation();
    }
  });
  // 初始化设置
  refreshSettings();

  // 将核心控制函数暴露到全局，供其他脚本使用
  initializeGlobal('AutoRunnerCore', {
    toggleTrulyAutomatedMode,
  });
}

/**
 * 脚本卸载时执行
 */
export function stop() {
  stopAutomation();
  eventRemoveListener(getButtonEvent('全自动运行'), startAutomation);
}
