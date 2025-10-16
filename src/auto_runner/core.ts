import { getSettings } from './settings';
import type { Settings } from './types';

const SUB_AI_NAME = '副AI'; // 请根据实际情况修改副AI的名字
let isAutomationRunning = false;

/**
 * 调用副AI的API
 * @param mainAiReply 主AI的回复
 * @param settings 脚本设置
 * @returns 副AI的回复
 */
async function callSubAi(mainAiReply: string, settings: Settings): Promise<string> {
  const { apiUrl, apiKey, model, temperature, top_p, top_k, max_tokens, prompt, regex, subAiRegex, subAiRegexReplacement } = settings;

  if (!apiUrl || !model) {
    throw new Error('API地址或模型未设置');
  }

  // 1. 从酒馆获取上下文
  const context = (getChatMessages(-1) || []).map(m => `${m.role}: ${m.message}`).join('\n');
  
  // 2. (可选) 正则处理上下文
  let processedContext = context;
  if (regex) {
    try {
      const re = new RegExp(regex, 'g');
      processedContext = context.replace(re, '');
    } catch (e) {
      console.error('上下文正则表达式无效:', e);
    }
  }

  // 3. 构建发送给副AI的最终提示词
  const finalPrompt = `${prompt}\n\n以下是当前的对话历史:\n${processedContext}\n\n主AI刚刚的回复是:\n${mainAiReply}\n\n请根据以上信息，作为'${SUB_AI_NAME}'进行回复:`;

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: finalPrompt }],
      temperature,
      top_p,
      top_k,
      max_tokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`副AI API调用失败: ${response.statusText}`);
  }

  const data = await response.json();
  let subAiReply = data.choices[0]?.message?.content || '';

  // 4. (可选) 正则处理副AI的输出
  if (subAiRegex) {
    try {
      const re = new RegExp(subAiRegex, 'g');
      subAiReply = subAiReply.replace(re, subAiRegexReplacement || '');
    } catch (e) {
      console.error('副AI输出正则表达式无效:', e);
    }
  }

  return subAiReply.trim();
}


/**
 * 处理主AI回复的后续流程
 */
async function handleMainAiReply() {
  toastr.info('[自动运行] 检测到主AI消息，开始后处理...');

  // 1. 触发“全自动优化(SSC)”并等待
  toastr.info('[自动运行] 步骤 1/3: 触发“全自动优化(SSC)”...');
  await eventEmit(getButtonEvent('全自动优化(SSC)'));
  await new Promise(resolve => setTimeout(resolve, 1500)); // 等待SSC完成

  // 2. 触发“一键处理”的数据处理部分
  toastr.info('[自动运行] 步骤 2/3: 触发“一键处理”...');
  await eventEmit(getButtonEvent('一键处理'));
  await new Promise(resolve => setTimeout(resolve, 1500)); // 等待处理完成

  // 3. 将最终消息发送给副AI
  toastr.info(`[自动运行] 步骤 3/3: 将结果发送给 ${SUB_AI_NAME}...`);
  const finalMessage = (getChatMessages(-1) || [])[0];

  if (finalMessage && finalMessage.role === 'assistant') {
    const settings = getSettings();
    if (!settings) {
        toastr.error('无法获取设置，无法调用副AI。');
        stopAutomation();
        return null;
    }
    const subAiResponse = await callSubAi(finalMessage.message, settings);
    return subAiResponse;
  } else {
    toastr.warning('[自动运行] 未能获取到最终的AI消息，无法发送给副AI。');
    return null;
  }
}


// --- 核心自动化循环逻辑 ---
async function runAutomationCycle() {
  const settings = getSettings();
  if (!settings) {
    toastr.error('无法获取设置，自动化流程无法启动。');
    stopAutomation();
    return;
  }

  let remaining = settings.remainingReplies;
  let messageForMainAi = "继续"; // 初始消息

  while (isAutomationRunning && remaining > 0) {
    try {
      toastr.info(`[自动运行] 第 ${settings.totalReplies - remaining + 1} / ${settings.totalReplies} 轮开始...`);

      // 步骤 1: 副AI以用户身份发送消息，触发主AI回复
      toastr.info(`[自动运行] 步骤 1: 副AI发送消息触发主AI...`);
      // 使用 /send 触发主AI回复，并等待其完成
      await triggerSlash(`/send as_user=true await=true "${messageForMainAi.replace(/"/g, '\\"')}"`);
      
      // 步骤 2: 主AI回复后，进行后处理（SSC, 一键处理, 发送给副AI）
      const subAiNextMessage = await handleMainAiReply();

      if (subAiNextMessage === null) {
        toastr.warning('[自动运行] 后处理失败，流程中断。');
        stopAutomation();
        break;
      }
      
      if (typeof subAiNextMessage === 'string') {
        messageForMainAi = subAiNextMessage; // 更新下一轮要发送给主AI的消息
      } else {
        toastr.warning('[自动运行] 未能从副AI获取到有效的下一轮消息，流程中断。');
        stopAutomation();
        break;
      }

      remaining--;
      // 更新剩余次数到设置中
      const currentSettings = getSettings();
      if(currentSettings) {
        currentSettings.remainingReplies = remaining;
        await replaceVariables(currentSettings, { type: 'script', script_id: getScriptId() });
      }

      toastr.success(`[自动运行] 第 ${settings.totalReplies - remaining} 轮完成。`);

    } catch (error) {
      console.error('[全自动运行] 循环出错:', error);
      toastr.error('自动化运行时发生错误，请查看控制台。流程已终止。');
      stopAutomation();
      break;
    }
  }

  if (remaining <= 0) {
    toastr.success('所有自动化任务已完成！');
  }
  stopAutomation(); // 循环结束或中断后，确保停止
}

// --- 启动和停止功能 ---
export function startAutomation() {
  if (isAutomationRunning) return;
  isAutomationRunning = true;
  toastr.success('全自动运行已启动！', '自动化控制');
  
  // 直接开始循环，不再监听事件
  runAutomationCycle();
}

export function stopAutomation() {
  if (!isAutomationRunning) return;
  isAutomationRunning = false;
  
  toastr.info('全自动运行已停止。', '自动化控制');
  // 尝试停止任何可能正在进行的AI生成
  triggerSlash('/stop');
}

// 兼容旧的导出，虽然index.ts现在不会直接用它们
export function start() {
  console.log('Auto runner started via legacy start()');
}
export function stop() {
  console.log('Auto runner stopped via legacy stop()');
}
