import { start } from './core';
import { initPanel, destroyPanel } from './panel';

$(() => {
  // 初始化设置面板
  initPanel();

  // 启动核心自动化逻辑
  start();
});

$(window).on('pagehide', () => {
  // 卸载面板
  destroyPanel();
});
