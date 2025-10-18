import { start, stop, refreshSettings } from './core';
import { initPanel, destroyPanel } from './panel';

$(async () => {
  // 1. 首先，加载所有设置
  await refreshSettings();

  // 2. 然后，基于加载的设置初始化UI
  initPanel();

  // 3. 最后，启动核心逻辑（它会监听按钮事件）
  start();
});

$(window).on('pagehide', () => {
  // 卸载面板
  destroyPanel();
  // 停止核心自动化逻辑
  stop();
});
