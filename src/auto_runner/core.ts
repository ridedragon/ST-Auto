import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

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

// --- 辅助函数 ---

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
  const lastMessageId = await getMessageId('last');
  const allMessages = getChatMessages(`0-${lastMessageId}`); // 获取所有消息
  if (!allMessages || allMessages.length === 0) {
    toastr.error('无法获取聊天记录');
    return null;
  }

  // 过滤掉主AI的预设提示词
  const messagesForSubAI = allMessages.filter(msg => msg.role !== 'system');

  // 应用上下文正则
  let contextString = messagesForSubAI.map(msg => `${msg.role}: ${msg.message}`).join('\n');
  if (settings.regex) {
    try {
      const regex = new RegExp(settings.regex, 'gm');
      contextString = contextString.replace(regex, '');
    } catch (e) {
      console.error('上下文正则表达式错误:', e);
      toastr.warning('上下文正则表达式无效，已跳过处理。');
    }
  }

  const body = {
    model: settings.model,
    messages: [
      { role: 'system', content: settings.prompt },
      { role: 'user', content: contextString },
    ],
    temperature: settings.temperature,
    top_p: settings.top_p,
    top_k: settings.top_k,
    max_tokens: settings.max_tokens,
  };

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
  if (!settings.subAiRegex) {
    return reply;
  }
  try {
    const regex = new RegExp(settings.subAiRegex, 'g');
    return reply.replace(regex, settings.subAiRegexReplacement || '');
  } catch (e) {
    console.error('副AI输出正则表达式错误:', e);
    toastr.warning('副AI输出正则表达式无效，已跳过处理。');
    return reply;
  }
}

/**
 * 执行SSC优化和“一键处理”
 */
async function triggerSscAndProcess() {
  toastr.info('执行“全自动优化(SSC)”...');
  await eventEmit(getButtonEvent('全自动优化(SSC)'));
  await delay(2000); // 等待界面渲染

  toastr.info('执行“一键处理”...');
  await eventEmit(getButtonEvent('一键处理'));
  await delay(4000); // 等待界面渲染
}

// --- 主循环逻辑 ---

async function runAutomation() {
  if (shouldStop()) {
    stopAutomation();
    return;
  }

  await refreshSettings();
  const lastMessage = (getChatMessages(-1) || [])[0];

  if (!lastMessage) {
    toastr.error('无法获取最后一条消息，自动化暂停。');
    state = AutomationState.PAUSED;
    return;
  }

  try {
    if (lastMessage.role === 'user') {
      // --- 分支 A: 最后一条是用户消息 ---
      toastr.info('检测到用户消息，开始重新生成...');
      await triggerSlash('/continue await=true');
      // 主AI响应完成后，绑定的 tavern_events.MESSAGE_RECEIVED 事件会再次触发 runAutomation
    } else {
      // --- 分支 B: 最后一条是AI消息 ---
      toastr.info('检测到AI消息，开始完整循环...');

      // 步骤 1 & 2: SSC 和 一键处理
      await triggerSscAndProcess();

      // 步骤 3: 发送给副AI
      const subAiReply = await callSubAI();
      if (!subAiReply) {
        throw new Error('未能从副AI获取回复');
      }

      // 步骤 4: 处理副AI回复并以用户身份发送
      const processedReply = processSubAiResponse(subAiReply);
      // 更新UI上的文本框
      // 注意：这里无法直接更新Vue组件的ref，需要通过事件或其他方式通知UI
      // 暂时我们先将它存入一个临时变量，或者考虑用一个 message event
      console.log('处理后的回复:', processedReply);
      
      toastr.info('以用户身份发送处理后的消息...');
      await triggerSlash(`/sendas name={{user}} "${processedReply.replace(/"/g, '\\"')}"`);
      await triggerSlash('/trigger await=true'); // 触发主AI生成
    }

    await incrementExecutedCount();
    retryCount = 0; // 成功后重置重试次数
  } catch (error) {
    console.error('自动化循环出错:', error);
    retryCount++;
    if (retryCount > settings.maxRetries) {
      toastr.error('已达到最大重试次数，自动化已停止。');
      state = AutomationState.ERROR;
      stopAutomation();
    } else {
      toastr.warning(`自动化循环出错，将在5秒后重试 (${retryCount}/${settings.maxRetries})`);
      await delay(5000);
      runAutomation(); // 重试
    }
  }
}

// --- 监听主AI消息完成事件 ---
function onMessageReceived() {
  if (state === AutomationState.RUNNING) {
    // 等待一小段时间，确保酒馆完全处理完消息
    setTimeout(runAutomation, 1000);
  }
}

// --- 暴露给外部的控制函数 ---

/**
 * 启动全自动运行
 */
function startAutomation() {
  if (state === AutomationState.RUNNING) return;

  toastr.success('全自动运行已启动！');
  state = AutomationState.RUNNING;
  retryCount = 0;

  // 绑定事件
  eventOn(tavern_events.MESSAGE_RECEIVED, onMessageReceived);

  // 立即开始第一次循环
  runAutomation();
}

/**
 * 停止全自动运行
 */
function stopAutomation() {
  if (state === AutomationState.IDLE) return;

  toastr.info('全自动运行已停止。');
  state = AutomationState.IDLE;

  // 解绑事件
  eventRemoveListener(tavern_events.MESSAGE_RECEIVED, onMessageReceived);

  // 尝试停止任何正在进行的生成
  triggerSlash('/stop');
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
}

/**
 * 脚本卸载时执行
 */
export function stop() {
  stopAutomation();
  eventRemoveListener(getButtonEvent('全自动运行'), startAutomation);
}
