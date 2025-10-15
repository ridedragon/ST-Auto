import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

// 存储当前剩余回复次数的状态
let remainingReplies = 0;
let isRunning = false;

async function onMessageReceived(message_id: number) {
  if (isRunning) {
    console.log('自动化脚本正在运行中，跳过本次触发。');
    return;
  }

  // 1. 获取最新设置和消息
  const settings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
  const lastMessage = getChatMessages(-1)[0];

  // 2. 检查触发条件
  if (!settings.enabled || !lastMessage || lastMessage.role !== 'assistant' || remainingReplies <= 0) {
    return;
  }

  isRunning = true;
  toastr.info(`自动化脚本介入，剩余 ${remainingReplies} 次回复。`);

  try {
    // 3. 获取聊天上下文
    const chatHistory = getChatMessages(`0-${message_id}`);
    const contextPrompt = chatHistory.map(msg => `${msg.name}: ${msg.message}`).join('\n');

    // 4. 调用“副AI”生成下一条指令
    const nextUserInstruction = await generate({
      user_input: `${contextPrompt}\n\n${settings.prompt}`,
      custom_api: {
        apiurl: settings.apiUrl,
        key: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
      } as any, // HACK: 绕过类型检查
      should_stream: false,
    });

    if (!nextUserInstruction || nextUserInstruction.trim() === '') {
      throw new Error('副AI没有返回有效指令。');
    }

    // 5. 将指令作为用户消息发送
    await createChatMessages([{
      role: 'user',
      name: SillyTavern.name1, // 使用当前用户名
      message: nextUserInstruction,
    }]);

    // 6. 更新状态
    remainingReplies--;
    toastr.success(`指令已发送，剩余 ${remainingReplies} 次。`);

  } catch (e: any) {
    const error = e as Error;
    console.error('自动化脚本运行出错:', error);
    toastr.error(`脚本错误: ${error.message}`);
  } finally {
    isRunning = false;
    if (remainingReplies <= 0) {
        toastr.info('自动化任务完成。');
        // 任务完成后自动禁用脚本
        const currentSettings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
        if (currentSettings.enabled) {
            currentSettings.enabled = false;
            replaceVariables(_.cloneDeep(currentSettings), { type: 'script', script_id: getScriptId() });
        }
    }
  }
}

function onUserMessage() {
    const settings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
    
    // 当用户发送消息且脚本启用时，初始化或重置回复计数器
    if (settings.enabled) {
        remainingReplies = settings.maxReplies;
        toastr.info(`自动化脚本已启动，将代替用户回复 ${remainingReplies} 次。`);
    }
}

export function start() {
  // 监听 AI 回复
  eventOn(tavern_events.MESSAGE_RECEIVED, onMessageReceived);
  // 监听用户发送消息以启动计数器
  eventOn(tavern_events.MESSAGE_SENT, onUserMessage);
  
  console.log('自动化运行脚本已启动并监听事件。');
}
