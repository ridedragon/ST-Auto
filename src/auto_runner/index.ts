import { start, stop, refreshSettings } from './core';
import { initPanel, destroyPanel } from './panel';

let observer: MutationObserver | null = null;

async function rebuild() {
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

function startObserver() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (
            node instanceof HTMLElement &&
            node.classList.contains('toast-info') &&
            node.querySelector('.toast-title')?.textContent?.includes('[MVU]脚本加载成功')
          ) {
            console.log('[AutoRunner] Detected MVU reload, rebuilding...');
            rebuild();
          }
        });
      }
    }
  });

  observer.observe(window.parent.document.body, { childList: true, subtree: true });
}

$(async () => {
  // 1. 首先，加载所有设置
  await refreshSettings();

  // 2. 然后，基于加载的设置初始化UI
  initPanel();

  // 3. 启动核心逻辑（它会监听按钮事件）
  start();

  // 4. 启动观察者
  startObserver();
  
  toastr.info(
    `构建信息: ${__BUILD_DATE__ ?? 'Unknown'} (${__COMMIT_ID__ ?? 'Unknown'})`,
    '[AUTO]脚本加载成功'
  );
});

$(window).on('pagehide', () => {
  // 停止观察者
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  // 卸载面板
  destroyPanel();
  // 停止核心自动化逻辑
  stop();
});
