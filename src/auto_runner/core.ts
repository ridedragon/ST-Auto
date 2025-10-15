import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

let isRunning = false;

async function onMessageReceived(message_id: number) {
  if (isRunning) {
    return;
  }

  // 增加一个短暂的延迟，以确保消息已完全注册
  await new Promise(resolve => setTimeout(resolve, 100));

  // 1. 获取最新设置和消息
  const settings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
  const lastMessage = getChatMessages(-1)[0];

  // 2. 检查触发条件
  if (!settings.enabled || !lastMessage || lastMessage.role !== 'assistant' || settings.remainingReplies <= 0) {
    return;
  }

  isRunning = true;
  toastr.info(`自动执行: ${settings.totalReplies - settings.remainingReplies + 1}/${settings.totalReplies}`);

  try {
    // 3. 获取聊天上下文
    const lastId = await getLastMessageId();
    const chatHistory = getChatMessages(`0-${lastId}`);
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

    // 5. 将指令填入输入框并模拟点击发送
    $('#send_textarea').val(nextUserInstruction);
    $('#send_but').trigger('click');

    // 6. 更新状态
    settings.remainingReplies--;
    replaceVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });

  } catch (e: any) {
    const error = e as Error;
    console.error('自动化脚本运行出错:', error);
    toastr.error(`脚本错误: ${error.message}`);
  } finally {
    isRunning = false;
    // 再次获取最新设置以检查是否完成
    const finalSettings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
    if (finalSettings.remainingReplies <= 0 && finalSettings.enabled) {
        toastr.info('自动化任务完成。');
        // 任务完成后自动禁用脚本
        finalSettings.enabled = false;
        replaceVariables(_.cloneDeep(finalSettings), { type: 'script', script_id: getScriptId() });
    }
  }
}

function onUserMessage() {
    const settings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
    
    // 当用户发送消息且脚本启用时，将总次数赋给剩余次数
    if (settings.enabled) {
        settings.remainingReplies = settings.totalReplies;
        replaceVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });
    }
}

export function start() {
  // 监听 AI 回复完成
  eventOn(tavern_events.GENERATION_ENDED, onMessageReceived);
  // 监听用户发送消息以启动计数器
  eventOn(tavern_events.MESSAGE_SENT, onUserMessage);
  
  console.log('自动化运行脚本已启动并监听事件。');
}
