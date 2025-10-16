// ==UserScript==
// @name         触发AI文本优化助手
// @version      1.1
// @description  通过按钮远程触发 ST-Specific-Sentence-Correction 扩展的核心功能。
// @author       Cline
// ==/UserScript==
(function () {
  'use strict';

  // 定义按钮的名称
  const buttonName = '去处换行标签';

  // 注册一个事件监听器，等待按钮被点击
  eventOn(getButtonEvent(buttonName), async () => {
    try {
      // 1. 获取最后一条消息
      const messages = getChatMessages(-1);
      if (!messages || messages.length === 0) {
        toastr.warning('无法找到最后一条消息。');
        return;
      }
      const lastMessage = messages[0];
      const messageId = lastMessage.message_id;
      const originalContent = lastMessage.message;

      // 2. 定义正则表达式和替换字符串
      const findRegex = /<\/?br\b[^>]*>/gi;
      const replaceString = '\n';

      // 检查内容中是否真的有<br>标签
      if (!findRegex.test(originalContent)) {
        toastr.info('最后一条消息中没有找到<br>标签。');
        return;
      }

      // 3. 执行替换
      const newContent = originalContent.replace(findRegex, replaceString);

      // 4. 更新消息内容
      // setChatMessages会触发页面刷新，所以最好放在最后
      await setChatMessages([{ message_id: messageId, message: newContent }]);

      toastr.success('已成功移除最后一条消息中的<br>标签！');
    } catch (error) {
      console.error('【去<br>】脚本出错:', error);
      toastr.error('执行脚本时发生错误，请按F12查看控制台获取详细信息。');
    }
  });

  // 脚本初始化时，检查并尝试自动添加按钮（如果它还不存在）
  // 这让用户无需手动在脚本设置中创建按钮
  (async function () {
    try {
      const scriptId = getScriptId();
      if (scriptId) {
        const buttons = getScriptButtons(scriptId);
        const buttonExists = buttons.some(b => b.name === buttonName);

        if (!buttonExists) {
          // 使用 appendInexistentScriptButtons 添加按钮
          appendInexistentScriptButtons(scriptId, [{ name: buttonName, visible: true }]);
          toastr.info(`“${buttonName}” 按钮已自动添加，您可能需要刷新一次页面才能看到它。`);
        }
      }
    } catch (e) {
      // 如果在非脚本库环境中（例如，直接在浏览器控制台粘贴），getScriptId会失败。
      // 这是正常现象，提示用户手动添加。
      console.log(
        '当前环境无法自动添加按钮。请进入酒馆助手的脚本库，编辑此脚本，然后在“按键绑定”中手动添加一个名为“去<br>”的按钮。',
      );
    }
  })();
})();

(function () {
  'use strict';

  const MAX_RETRIES = 10; // 尝试10次
  const RETRY_DELAY = 500; // 每次间隔500毫秒
  let retryCount = 0;

  // 主脚本初始化函数
  function initializeScript() {
    console.log('[触发AI文本优化助手] 成功找到 API，脚本开始初始化...');
    const api = window.parent.aiOptimizer;

    // 用于在步骤之间存储内容的变量
    let sourceContentForOptimization = '';
    let optimizedContentResult = '';

    // --- 按钮定义 ---
    const buttons = [
      { name: '提取句子(SSC)', action: handleExtract, info: '从最后一条消息中提取包含禁用词的句子。' },
      { name: '优化并替换(SSC)', action: handleOptimize, info: '优化后，在弹出框中确认替换。' },
      { name: '全自动优化(SSC)', action: handleFullAuto, info: '自动执行“提取-优化-替换”的完整流程。' },
    ];

    // --- 按钮功能实现 ---

    // 对应 "提取待修改句子"
    function handleExtract() {
      toastr.info('正在提取待优化句子...');
      api.manualOptimize(content => {
        if (content) {
          sourceContentForOptimization = content; // 保存提取到的内容
          optimizedContentResult = ''; // 清空旧的优化结果
          const popupContent = `<p>已提取以下内容：</p><textarea class="text_pole" rows="10" style="width: 100%;" readonly>${content}</textarea>`;
          window.parent.SillyTavern.getContext().callGenericPopup(popupContent, '提取成功', '', {
            okButton: '关闭',
            wide: true,
          });
        } else {
          sourceContentForOptimization = ''; // 如果没内容则清空
          toastr.info('在最后一条角色消息中未找到包含禁用词的句子。');
        }
      });
    }

    // 对应 "优化并替换"
    async function handleOptimize() {
      if (!sourceContentForOptimization) {
        toastr.warning('请先点击“提取句子(SSC)”来获取待优化内容。');
        return;
      }
      toastr.info('正在发送给AI进行优化...');
      try {
        // 获取最后一条角色消息作为上下文
        const lastCharMessage = await getLastCharMessage();
        // 尝试获取系统提示词，如果函数不存在则使用空字符串
        const systemPrompt = typeof api.getSystemPrompt === 'function' ? api.getSystemPrompt() : '';
        const result = await api.optimizeText(sourceContentForOptimization, systemPrompt, lastCharMessage);

        if (result !== null) {
          // 使用临时变量来传递数据
          window.parent.tempPopupText = result;
          const popupContent = `
                        <p><b>原始句子:</b></p>
                        <textarea class="text_pole" rows="5" style="width: 100%;" readonly>${sourceContentForOptimization}</textarea>
                        <p><b>优化后句子 (可编辑):</b></p>
                        <textarea oninput="window.parent.tempPopupText = this.value" id="manual-optimizer-result" class="text_pole" rows="5" style="width: 100%;">${result}</textarea>
                    `;

          // 弹出确认替换的对话框
          const userConfirmed = await window.parent.SillyTavern.getContext().callGenericPopup(
            popupContent,
            '优化完成 - 对比并替换',
            '',
            { okButton: '替换', cancelButton: '取消', wide: true },
          );

          const finalOptimizedText = window.parent.tempPopupText;
          delete window.parent.tempPopupText; // 清理临时变量

          if (userConfirmed) {
            // 用户点击了“替换”
            toastr.info('正在执行替换...');
            api.replaceMessage(sourceContentForOptimization, finalOptimizedText, newContent => {
              if (newContent) {
                toastr.success('替换成功！');
                // 成功后清空变量，准备下一次操作
                sourceContentForOptimization = '';
                optimizedContentResult = '';
              }
            });
          } else {
            toastr.info('替换操作已取消。');
          }
        } else {
          optimizedContentResult = ''; // 如果中止则清空
        }
      } catch (error) {
        console.error(error);
        toastr.error('优化失败，请查看控制台日志。');
      }
    }

    // 对应 "一键全自动优化"
    async function handleFullAuto() {
      try {
        toastr.info('自动化优化流程已启动...');
        const sourceContent = await new Promise(resolve => {
          api.manualOptimize(content => resolve(content));
        });

        if (!sourceContent) {
          toastr.info('在最后一条角色消息中未找到可优化的内容，流程中止。');
          return 'NO_CONTENT';
        }

        // 步骤1: 提取和编辑
        window.parent.tempPopupText = sourceContent;
        const extractedPopupContent = `<p>已提取以下内容（可编辑），点击“继续”发送给AI优化：</p><textarea oninput="window.parent.tempPopupText = this.value" id="auto-optimizer-source" class="text_pole" rows="10" style="width: 100%;">${sourceContent}</textarea>`;
        const continueStep1 = await window.parent.SillyTavern.getContext().callGenericPopup(
          extractedPopupContent,
          '步骤1: 提取并编辑',
          '',
          { okButton: '继续', cancelButton: '取消', wide: true },
        );

        const editedSourceContent = window.parent.tempPopupText;
        delete window.parent.tempPopupText;

        if (!continueStep1) {
          toastr.info('自动化流程已由用户取消。');
          return 'CANCELLED';
        }

        toastr.info('正在发送给AI优化...');

        // 步骤2: 优化
        const lastCharMessage = await getLastCharMessage();
        const systemPrompt = typeof api.getSystemPrompt === 'function' ? api.getSystemPrompt() : '';
        const optimizedResultText = await api.optimizeText(editedSourceContent, systemPrompt, lastCharMessage);

        if (optimizedResultText === null) {
          console.log('[Auto Optimizer] 优化被用户取消，流程中止。');
          return 'CANCELLED';
        }
        if (!optimizedResultText) {
          throw new Error('AI 未能返回优化后的文本。');
        }

        // 步骤3: 对比和替换
        window.parent.tempPopupText = optimizedResultText;
        const optimizedPopupContent = `
                    <p><b>原始句子:</b></p>
                    <textarea class="text_pole" rows="5" style="width: 100%;" readonly>${editedSourceContent}</textarea>
                    <p><b>优化后句子 (可编辑):</b></p>
                    <textarea oninput="window.parent.tempPopupText = this.value" id="auto-optimizer-result" class="text_pole" rows="5" style="width: 100%;">${optimizedResultText}</textarea>
                `;
        const userConfirmed = await window.parent.SillyTavern.getContext().callGenericPopup(
          optimizedPopupContent,
          '步骤2: 对比并确认替换',
          '',
          { okButton: '替换', cancelButton: '取消', wide: true },
        );

        const finalOptimizedText = window.parent.tempPopupText;
        delete window.parent.tempPopupText;

        if (!userConfirmed) {
          toastr.info('自动化流程已由用户取消。');
          return 'CANCELLED';
        }

        toastr.info('正在执行替换...');
        const success = await new Promise(resolve => {
          api.replaceMessage(editedSourceContent, finalOptimizedText, newContent => {
            if (newContent) {
              toastr.success('替换完成！流程结束。', '成功', { timeOut: 5000 });
              resolve(true);
            } else {
              resolve(false);
            }
          });
        });
        
        return success ? 'SUCCESS' : 'FAILED';

      } catch (error) {
        console.error('[Auto Optimizer] 流程执行出错:', error);
        toastr.error(error.message, '自动化流程失败', { timeOut: 10000 });
        throw error; // 向上抛出错误
      }
    }

    // --- 辅助函数 ---
    async function getLastCharMessage() {
      try {
        const lastMessageId = await getLastMessageId();
        if (lastMessageId < 0) return '';

        const startId = Math.max(0, lastMessageId - 9);
        const messages = getChatMessages(`${startId}-${lastMessageId}`);

        const lastCharMsg = [...messages].reverse().find(m => !m.is_user);
        return lastCharMsg ? lastCharMsg.mes : '';
      } catch (e) {
        console.error('获取最后一条角色消息时出错:', e);
        return '';
      }
    }

    // --- 注册按钮和事件 ---
    buttons.forEach(button => {
      eventOn(getButtonEvent(button.name), button.action);
    });

    // =================================================================
    // 全自动运行逻辑
    // =================================================================
    const AUTO_RUN_BUTTON_NAME = '全自动运行';
    let isAutomationRunning = false;

    async function automationLoop() {
        // 启动时，先处理一次初始状态
        try {
            const lastMessage = (getChatMessages(-1) || [])[0];
            if (lastMessage && lastMessage.role === 'user') {
                toastr.info('[自动运行] 检测到用户消息，首先触发主AI生成...');
                await triggerSlash('/trigger await=true');
            }
        } catch (error) {
            console.error('[自动运行] 启动时检查出错:', error);
            toastr.error('启动时检查最后一条消息出错，请查看控制台。');
            stopAutomation();
            return;
        }

        // 进入主循环
        while (isAutomationRunning) {
            try {
                toastr.info('[自动运行] 开始新一轮处理...');

                // 1. 调用 handleFullAuto 并根据其返回值决定下一步
                const result = await handleFullAuto();

                if (result === 'SUCCESS') {
                    // 优化成功，将优化后的消息作为用户输入，触发主AI
                    toastr.info('[自动运行] SSC优化成功，将作为用户输入触发主AI...');
                    const finalMessage = (getChatMessages(-1) || [])[0];
                    if (!finalMessage || finalMessage.role !== 'assistant') {
                        toastr.warning('[自动运行] 优化后未能获取到有效的AI消息，流程暂停。');
                        stopAutomation();
                        return;
                    }
                    $('#send_textarea').val(finalMessage.message);
                    $('#send_but').trigger('click');

                    // 等待主AI生成完毕
                    await new Promise(resolve => {
                        eventOnce(tavern_events.GENERATION_ENDED, () => resolve(true));
                        eventOnce(tavern_events.GENERATION_STOPPED, () => resolve(false));
                    });

                } else if (result === 'NO_CONTENT') {
                    // 没有可优化的内容，说明AI回复很完美，直接让“用户”（副AI）继续
                    toastr.info('[自动运行] 未找到可优化内容，模拟用户继续对话...');
                    $('#send_textarea').val('（继续）'); // 或者其他提示继续的词
                    $('#send_but').trigger('click');
                    
                    // 等待主AI生成完毕
                     await new Promise(resolve => {
                        eventOnce(tavern_events.GENERATION_ENDED, () => resolve(true));
                        eventOnce(tavern_events.GENERATION_STOPPED, () => resolve(false));
                    });

                } else if (result === 'CANCELLED') {
                    // 用户手动取消，停止自动化
                    toastr.info('[自动运行] 用户取消了操作，自动化已停止。');
                    stopAutomation();
                    return;
                } else {
                    // 其他失败情况
                    toastr.warning('[自动运行] SSC流程未成功完成，流程暂停。');
                    stopAutomation();
                    return;
                }

                if (!isAutomationRunning) {
                    toastr.info('自动化在等待AI生成时被手动停止。');
                    return;
                }

            } catch (error) {
                console.error('[全自动运行] 循环出错:', error);
                toastr.error('自动化运行时发生错误，请查看控制台。流程已终止。');
                stopAutomation();
                return;
            }
        }
    }

    function startAutomation() {
        if (isAutomationRunning) return;
        isAutomationRunning = true;
        toastr.success('全自动运行已启动！', '自动化控制');
        automationLoop();
    }

    function stopAutomation() {
        if (!isAutomationRunning) return;
        isAutomationRunning = false;
        toastr.info('全自动运行已停止。', '自动化控制');
        triggerSlash('/stop');
    }

    eventOn(getButtonEvent(AUTO_RUN_BUTTON_NAME), () => {
        if (isAutomationRunning) {
            stopAutomation();
        } else {
            startAutomation();
        }
    });


    // 自动将按钮添加到脚本设置中
    (async function () {
      try {
        const scriptId = getScriptId();
        if (scriptId) {
          const existingButtons = getScriptButtons(scriptId);
          const allButtons = [...buttons.map(b => b.name), AUTO_RUN_BUTTON_NAME];
          const buttonsToAdd = allButtons.filter(bName => !existingButtons.some(eb => eb.name === bName));

          if (buttonsToAdd.length > 0) {
            appendInexistentScriptButtons(
              scriptId,
              buttonsToAdd.map(bName => ({ name: bName, visible: true })),
            );
            toastr.info(`已自动添加 ${buttonsToAdd.length} 个按钮到脚本，刷新页面后可见。`);
          }
        }
      } catch (e) {
        console.log(
          '当前环境无法自动添加按钮。请进入酒馆助手的脚本库，编辑此脚本，然后在“按键绑定”中手动添加以下按钮: ' +
            buttons.map(b => b.name).join(', '),
        );
      }
    })();
  }

  // 等待 API 加载的函数
  function waitForApi() {
    // 检查API对象及其关键方法是否存在
    if (
      typeof window.parent.SillyTavern?.getContext === 'function' &&
      typeof window.parent.aiOptimizer?.manualOptimize === 'function'
    ) {
      // API 已找到，初始化脚本
      initializeScript();
    } else if (retryCount < MAX_RETRIES) {
      // API 未找到，延迟后重试
      retryCount++;
      console.log(`[触发AI文本优化助手] 未找到 API，将在 ${RETRY_DELAY}ms 后重试... (${retryCount}/${MAX_RETRIES})`);
      if (retryCount === 1) {
        // 只在第一次重试时打印，避免刷屏
        console.log(
          '[触发AI文本优化助手] 正在检查顶层窗口对象... 请在浏览器控制台(F12)中查看是否存在 "aiOptimizer" 和 "SillyTavern" 属性。顶层窗口属性列表如下:',
        );
        console.log(Object.keys(window.parent));
      }
      setTimeout(waitForApi, RETRY_DELAY);
    } else {
      // 达到最大重试次数，显示错误
      console.log(
        '[触发AI文本优化助手] 错误: 未找到 ST-Specific-Sentence-Correction 扩展的 API (window.parent.aiOptimizer) 或 SillyTavern 上下文。请确保该扩展已正确安装并启用。',
      );
      toastr.error('未找到“AI文本优化助手”扩展或SillyTavern上下文，脚本无法运行。', '错误', { timeOut: 10000 });
    }
  }

  // 启动等待过程
  waitForApi();
})();

(function () {
    'use strict';

    const newButtonName = '一键处理';

    // 注册按钮点击事件
    eventOn(getButtonEvent(newButtonName), async () => {
        toastr.info('处理中⚙️...');

        try {
            // 步骤 1: 去除换行标签 (不弹窗)
            const messages = getChatMessages(-1);
            if (!messages || messages.length === 0) {
                toastr.warning('无法找到最后一条消息。');
                return;
            }
            const lastMessage = messages[0];
            const messageId = lastMessage.message_id;
            const originalContent = lastMessage.message;
            const findRegex = /<\/?br\b[^>]*>/gi;
            const replaceString = '\n';

            if (findRegex.test(originalContent)) {
                const newContent = originalContent.replace(findRegex, replaceString);
                // 更新消息，但不弹出单独的成功提示
                await setChatMessages([{ message_id: messageId, message: newContent }]);
                console.log('[一键处理] 已移除<br>标签。');
            } else {
                console.log('[一键处理] 未找到<br>标签，跳过移除步骤。');
            }

            // 步骤 2: 触发 "重新读取初始变量" 按钮的功能
            console.log('[一键处理] 正在触发 "重新读取初始变量"...');
            await eventEmit(getButtonEvent('重新读取初始变量'));
            console.log('[一键处理] "重新读取初始变量" 已完成。');

            // 步骤 3: 触发 "重新处理变量" 按钮的功能
            console.log('[一键处理] 正在触发 "重新处理变量"...');
            await eventEmit(getButtonEvent('重新处理变量'));
            console.log('[一键处理] "重新处理变量" 已完成。');

            toastr.success('处理完成😘');

        } catch (error) {
            console.error(`[${newButtonName}] 脚本出错:`, error);
            toastr.error('执行一键处理脚本时发生错误，请按F12查看控制台。');
        }
    });

    // 自动将按钮添加到UI
    (async function () {
        try {
            const scriptId = getScriptId();
            if (scriptId) {
                // 使用 appendInexistentScriptButtons 以免重复添加
                appendInexistentScriptButtons(scriptId, [{ name: newButtonName, visible: true }]);
            }
        } catch (e) {
            // 在非脚本库环境中，这会失败，是正常现象
            console.log(`无法自动添加“${newButtonName}”按钮。请在脚本设置中手动添加。`);
        }
    })();
})();
