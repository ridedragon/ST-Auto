import { z } from 'zod';
import _ from 'lodash';

// 复用 app.vue 中的 Zod Schema
const SettingsSchema = z.object({
  enabled: z.boolean().default(false),
  prompt: z.string().default(''),
  apiUrl: z.string().default(''),
  apiKey: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.7),
  maxReplies: z.number().min(1).default(10),
});

type Settings = z.infer<typeof SettingsSchema>;

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
  if (!settings.enabled || lastMessage.role !== 'assistant' || remainingReplies <= 0) {
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
        model: 'claude-3-opus-20240229', // 暂时硬编码，未来可以加入设置
        temperature: settings.temperature,
      } as any, // HACK: 绕过类型检查
      should_stream: false,
    });

    if (!nextUserInstruction || nextUserInstruction.trim() === '') {
      throw new Error('副AI没有返回有效指令。');
    }

    // 5. 将指令作为用户消息发送
    await createChatMessages([
      {
        role: 'user',
        name: SillyTavern.name1, // 使用当前用户名
        message: nextUserInstruction,
      },
    ]);

    // 6. 更新状态
    remainingReplies--;
    // 可以在这里将 remainingReplies 保存到变量中，如果需要跨会话保持状态
    toastr.success(`指令已发送，剩余 ${remainingReplies} 次。`);
  } catch (error) {
    console.error('自动化脚本运行出错:', error);
    toastr.error(`脚本错误: ${error.message}`);
  } finally {
    isRunning = false;
    if (remainingReplies <= 0) {
      toastr.info('自动化任务完成。');
      // 任务完成后自动禁用脚本
      settings.enabled = false;
      replaceVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });
    }
  }
}

function onUserFirstMessage(message_id: number) {
  const settings: Settings = SettingsSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }) || {});
  const firstMessage = getChatMessages(0)[0];

  // 只有在脚本启用且是用户发送的第一条消息时才初始化
  if (settings.enabled && getChatMessages('0-{{lastMessageId}}').length === 1 && firstMessage.role === 'user') {
    remainingReplies = settings.maxReplies;
    toastr.info(`自动化脚本已启动，将代替用户回复 ${remainingReplies} 次。`);
  }
}

export function start() {
  // 监听 AI 回复
  eventOn(tavern_events.MESSAGE_RECEIVED, onMessageReceived);
  // 监听用户发送的第一条消息以启动计数器
  eventOn(tavern_events.MESSAGE_SENT, onUserFirstMessage);

  console.log('自动化运行脚本已启动并监听事件。');
}
