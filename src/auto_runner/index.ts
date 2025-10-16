import { start, stop } from './core';
import { initPanel, destroyPanel } from './panel';

$(() => {
  // 初始化设置面板
  initPanel();

  // 启动核心自动化逻辑 (注释掉，因为现在由手动按钮控制)
  // start();
});

$(window).on('pagehide', () => {
  // 卸载面板
  destroyPanel();
  // 停止核心自动化逻辑
  stop();
});
