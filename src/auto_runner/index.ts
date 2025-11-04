import { start, stop, refreshSettings } from './core';
import { initPanel, destroyPanel } from './panel';

// --- Polling Logic ---
let mvuCheckInterval: number | null = null;
let lastSeenMvuInstance: any = null;

async function rebuild() {
  console.log('[AutoRunner] Detected MVU instance change, rebuilding...');
  // Stop and clean up the old instance
  stop();
  destroyPanel();

  // Re-initialize
  await refreshSettings();
  initPanel();
  start();

  toastr.info(
    `构建信息: ${__BUILD_DATE__ ?? 'Unknown'} (${__COMMIT_ID__ ?? 'Unknown'})`,
    '[AUTO]脚本加载成功'
  );
}

function startMvuMonitor() {
  // Clear any existing interval
  if (mvuCheckInterval) {
    clearInterval(mvuCheckInterval);
  }

  // Immediately check and set the initial instance
  lastSeenMvuInstance = (window.parent as any).Mvu;

  mvuCheckInterval = setInterval(() => {
    const currentMvu = (window.parent as any).Mvu;
    // Check if Mvu exists and if it's a new instance
    if (currentMvu && currentMvu !== lastSeenMvuInstance) {
      lastSeenMvuInstance = currentMvu; // Update immediately to prevent re-triggering
      rebuild();
    }
  }, 1000); // Check every second
}

function stopMvuMonitor() {
  if (mvuCheckInterval) {
    clearInterval(mvuCheckInterval);
    mvuCheckInterval = null;
  }
}

// --- Main Lifecycle ---

$(async () => {
  // 1. Initial setup
  await refreshSettings();
  initPanel();
  start();

  // 2. Start monitoring for MVU changes
  startMvuMonitor();
  
  // 3. Initial load toast
  toastr.info(
    `构建信息: ${__BUILD_DATE__ ?? 'Unknown'} (${__COMMIT_ID__ ?? 'Unknown'})`,
    '[AUTO]脚本加载成功'
  );
});

$(window).on('pagehide', () => {
  // Stop the monitor when the script unloads
  stopMvuMonitor();
  
  // Standard cleanup
  destroyPanel();
  stop();
});
