import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

let isRunning = false;

async function onMessageReceived(message_id: number) {
  setTimeout(async () => {
    // 增加一个短暂的延迟，以确保消息已完全注册
    await new Promise(resolve => setTimeout(resolve, 100));

    // 1. 获取最新设置和消息
    const settings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
    const lastMessage = getChatMessages(message_id)[0];

    // 2. 检查触发条件
    console.log('[诊断] 获取到的消息对象:', lastMessage);
    if (!settings.enabled || !lastMessage || lastMessage.role !== 'assistant' || settings.remainingReplies <= 0 || isRunning) {
      return;
    }

    isRunning = true;
  toastr.info(`自动执行: ${settings.totalReplies - settings.remainingReplies + 1}/${settings.totalReplies}`);

  try {
    // 3. 获取聊天上下文并进行正则处理
    const charName = await substitudeMacros('{{char}}');
    const userName = await substitudeMacros('{{user}}');
    const lastId = await getLastMessageId();
    const allChatHistory = getChatMessages(`0-${lastId}`);
    // 仅保留当前用户和AI角色的消息，过滤掉示例对话等
    const chatHistory = allChatHistory.filter(msg => msg.name === userName || msg.name === charName);
    const regex = new RegExp(settings.regex, 'gm');
    const contextPrompt = chatHistory
      .map(msg => {
        const cleanedMessage = msg.message.replace(regex, '');
        return `${msg.name}: ${cleanedMessage}`;
      })
      .join('\n');

    // 4. 调用“副AI”生成下一条指令
    const nextUserInstruction = await generateRaw({
      ordered_prompts: [
        { role: 'system', content: contextPrompt },
        { role: 'user', content: settings.prompt },
      ],
      custom_api: {
        apiurl: settings.apiUrl,
        key: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
      } as any,
      should_stream: false,
    });

    if (!nextUserInstruction || nextUserInstruction.trim() === '') {
      throw new Error('副AI没有返回有效指令。');
    }

    // 5. 对副AI的输出进行正则处理
    let processedInstruction = nextUserInstruction;
    if (settings.subAiRegex) {
      try {
        const subAiRegex = new RegExp(settings.subAiRegex, 'gm');
        processedInstruction = processedInstruction.replace(subAiRegex, settings.subAiRegexReplacement);
      } catch (e: any) {
        const error = e as Error;
        console.error('副AI正则处理出错:', error);
        toastr.error(`副AI正则处理错误: ${error.message}`);
      }
    }

    // 6. 将指令填入输入框并模拟点击发送
    $('#send_textarea').val(processedInstruction);
    $('#send_but').trigger('click');

    // 7. 更新状态
    settings.remainingReplies--;
    await replaceVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });
  } catch (e: any) {
    const error = e as Error;
    console.error('自动化脚本运行出错:', error);
    toastr.error(`脚本错误: ${error.message}`);
  } finally {
    isRunning = false;
    // 再次获取最新设置以检查是否完成
    const finalSettings: Settings = SettingsSchema.parse(
      getVariables({ type: 'script', script_id: getScriptId() }) || {},
    );
    if (finalSettings.remainingReplies <= 0 && finalSettings.enabled) {
      toastr.info('自动化任务完成。');
      // 任务完成后自动禁用脚本
      finalSettings.enabled = false;
      await replaceVariables(_.cloneDeep(finalSettings), { type: 'script', script_id: getScriptId() });
    }
  }
  }, 0);
}

function onGenerationStopped() {
  if (isRunning) {
    isRunning = false;
    toastr.warning('自动化任务已被手动终止。');
  }
}

export function start() {
  // 监听 AI 回复完成
  eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
  // 监听生成停止事件
  eventOn(tavern_events.GENERATION_STOPPED, onGenerationStopped);

  console.log('自动化运行脚本已启动并监听事件。');
}

export function stop() {
  eventRemoveListener(tavern_events.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
  eventRemoveListener(tavern_events.GENERATION_STOPPED, onGenerationStopped);
  if (isRunning) {
    // 尝试通过命令停止正在进行的生成
    triggerSlash('/stop');
  }
  isRunning = false;
  console.log('自动化运行脚本已停止。');
}
