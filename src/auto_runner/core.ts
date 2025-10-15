import _ from 'lodash';
import { type Settings, saveSettings, getSettings } from './settings';

let isRunning = false;
let currentSettings: Settings;

function applyRegex(text: string, regex: string): string {
  if (!regex) return text;
  try {
    const re = new RegExp(regex, 'gm');
    return text.replace(re, '');
  } catch (e) {
    console.error('正则表达式错误:', e);
    toastr.error('正则表达式无效，请检查。');
    return text;
  }
}

async function onMessageReceived(message_id: number) {
  if (isRunning) {
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 100));

  const lastMessage = getChatMessages(-1)[0];

  if (!currentSettings.selectedModel || !lastMessage || (lastMessage.role !== 'user' && lastMessage.role !== 'assistant')) {
    return;
  }

  isRunning = true;
  toastr.info(`自动执行中...`);

  try {
    const lastId = await getLastMessageId();
    const chatHistory = getChatMessages(`0-${lastId}`);
    
    const processedHistory = chatHistory.map(msg => {
      const processedMessage = applyRegex(msg.message, currentSettings.regex);
      return `${msg.name}: ${processedMessage}`;
    }).join('\n');

    const nextUserInstruction = await generate({
      user_input: processedHistory,
      custom_api: {
        model: currentSettings.selectedModel,
      } as any,
      should_stream: false,
    });

    if (!nextUserInstruction || nextUserInstruction.trim() === '') {
      throw new Error('副AI没有返回有效指令。');
    }

    $('#send_textarea').val(nextUserInstruction);
    $('#send_but').trigger('click');

  } catch (e: any) {
    const error = e as Error;
    console.error('自动化脚本运行出错:', error);
    toastr.error(`脚本错误: ${error.message}`);
  } finally {
    isRunning = false;
    toastr.info('自动执行完毕。');
  }
}

export function start(settings: Settings) {
  currentSettings = settings;
  // 监听所有消息
  eventOn(tavern_events.MESSAGE_SENT, onMessageReceived);
  eventOn(tavern_events.GENERATION_ENDED, onMessageReceived);
  
  console.log('自动化运行脚本已启动并监听事件。');
}
