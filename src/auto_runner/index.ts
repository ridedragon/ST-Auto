import { start } from './core';
import { initPanel, destroyPanel } from './panel';
import { getSettings } from './settings';
import toastr from 'toastr';

$(() => {
  const settings = getSettings();
  // 初始化设置面板
  initPanel(settings);
  
  // 启动核心自动化逻辑
  start(settings);
  toastr.success('Auto脚本加载成功');
});

$(window).on('pagehide', () => {
  // 卸载面板
  destroyPanel();
});
