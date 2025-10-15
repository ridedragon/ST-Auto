import { start } from '@/auto_runner/core';
import { initPanel, destroyPanel } from '@/auto_runner/panel';

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
