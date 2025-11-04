import { start, stop, refreshSettings } from './core';
import { initPanel, destroyPanel } from './panel';

async function rebuild() {
  console.log('[AutoRunner] Detected MVU reload, rebuilding...');
  // 停止并清理旧实例
  stop();
  destroyPanel();

  // 重新初始化
  await refreshSettings();
  initPanel();
  start();

  toastr.info(
    `构建信息: ${__BUILD_DATE__ ?? 'Unknown'} (${__COMMIT_ID__ ?? 'Unknown'})`,
    '[AUTO]脚本加载成功'
  );
}

$(async () => {
  // 1. 首先，加载所有设置
  await refreshSettings();

  // 2. 然后，基于加载的设置初始化UI
  initPanel();

  // 3. 启动核心逻辑（它会监听按钮事件）
  start();

  // 4. 监听 MVU 初始化事件
  eventOn('global_Mvu_initialized', rebuild);
  
  toastr.info(
    `构建信息: ${__BUILD_DATE__ ?? 'Unknown'} (${__COMMIT_ID__ ?? 'Unknown'})`,
    '[AUTO]脚本加载成功'
  );
});

$(window).on('pagehide', () => {
  // 移除事件监听器
  eventRemoveListener('global_Mvu_initialized', rebuild);
  // 卸载面板
  destroyPanel();
  // 停止核心自动化逻辑
  stop();
});
