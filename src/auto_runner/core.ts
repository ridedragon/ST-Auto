const SUB_AI_NAME = '副AI'; // 请根据实际情况修改副AI的名字
let isAutomationRunning = false;

// --- 核心自动化循环逻辑 ---
async function runAutomationCycle() {
  // 使用一个锁来防止并发执行
  if (isAutomationRunning === false) {
    return;
  }

  try {
    const lastMessage = (getChatMessages(-1) || [])[0];
    if (!lastMessage) {
      toastr.warning('无法获取最后一条消息，自动化已暂停。');
      stopAutomation();
      return;
    }

    if (lastMessage.role === 'user') {
      // 情况 A: 最后一条是用户消息
      toastr.info('[自动运行] 检测到用户消息，触发主AI生成...');
      await triggerSlash('/trigger await=true');
      // AI生成后，绑定的 MESSAGE_RECEIVED 事件会自动触发下一次循环
    } else {
      // 情况 B: 最后一条是AI消息 (包括主AI刚刚生成的消息)
      toastr.info('[自动运行] 检测到AI消息，开始处理流程...');

      // 1. 触发“全自动优化(SSC)”并等待
      toastr.info('[自动运行] 步骤 1/3: 触发“全自动优化(SSC)”...');
      await eventEmit(getButtonEvent('全自动优化(SSC)'));
      // 简单的延迟，以确保异步操作有时间完成和DOM更新
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 2. 触发“一键处理”并等待
      toastr.info('[自动运行] 步骤 2/3: 触发“一键处理”...');
      await eventEmit(getButtonEvent('一键处理'));
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 3. 将最终消息发送给副AI
      toastr.info(`[自动运行] 步骤 3/3: 发送给 ${SUB_AI_NAME}...`);
      const finalMessage = (getChatMessages(-1) || [])[0];

      // 再次确认最后一条消息是AI的，防止中途出错
      if (finalMessage && finalMessage.role === 'assistant') {
        // 使用/sendas来发送消息，它不会触发AI回复
        await triggerSlash(`/sendas name=${SUB_AI_NAME} "${finalMessage.message.replace(/"/g, '\\"')}"`);
        toastr.success(`[自动运行] 已成功发送给 ${SUB_AI_NAME}。等待主AI回复...`);
        // 发送给副AI后，需要主AI回复，所以我们再次触发主AI
        await triggerSlash('/trigger await=true');
      } else {
        toastr.warning('[自动运行] 未能获取到最终的AI消息，无法发送给副AI。流程暂停。');
        stopAutomation();
      }
    }
  } catch (error) {
    console.error('[全自动运行] 循环出错:', error);
    toastr.error('自动化运行时发生错误，请查看控制台。流程已终止。');
    stopAutomation();
  }
}

// --- 启动和停止功能 ---
export function startAutomation() {
  if (isAutomationRunning) return;
  isAutomationRunning = true;
  toastr.success('全自动运行已启动！', '自动化控制');

  // 监听AI消息完成事件来驱动循环
  eventOn(tavern_events.MESSAGE_RECEIVED, runAutomationCycle);

  // 立即执行一次以启动流程
  runAutomationCycle();
}

export function stopAutomation() {
  if (!isAutomationRunning) return;
  isAutomationRunning = false;

  // 移除事件监听器以停止循环
  eventRemoveListener(tavern_events.MESSAGE_RECEIVED, runAutomationCycle);

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
