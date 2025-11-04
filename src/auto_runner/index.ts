import { start, stop, refreshSettings } from './core';
import { initPanel, destroyPanel } from './panel';

// --- Persistent Polling Logic ---
let mvuCheckInterval: number | null = null;

// A key for the property on the parent window to store the last seen MVU instance.
// Using a unique key to avoid conflicts.
const LAST_SEEN_MVU_KEY = '__auto_run_last_seen_mvu';

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
  // Clear any existing interval from a previous, non-destroyed instance
  if (mvuCheckInterval) {
    clearInterval(mvuCheckInterval);
  }

  // Initialize the persistent state on the parent window if it doesn't exist
  if (!(window.parent as any)[LAST_SEEN_MVU_KEY]) {
    (window.parent as any)[LAST_SEEN_MVU_KEY] = (window.parent as any).Mvu;
  }

  mvuCheckInterval = setInterval(() => {
    const currentMvu = (window.parent as any).Mvu;
    const lastSeenMvu = (window.parent as any)[LAST_SEEN_MVU_KEY];

    // Check if Mvu exists and if its instance is different from the one we last stored
    if (currentMvu && currentMvu !== lastSeenMvu) {
      // CRITICAL: Update the stored instance on the parent window immediately
      (window.parent as any)[LAST_SEEN_MVU_KEY] = currentMvu;
      
      // Trigger the rebuild
      rebuild();
    }
  }, 1000); // Check every second
}

function stopMvuMonitor() {
  if (mvuCheckInterval) {
    clearInterval(mvuCheckInterval);
    mvuCheckInterval = null;
  }
  // Optional: Clean up the property on the parent window when the script is truly unloaded,
  // though it's generally safe to leave it.
  // delete (window.parent as any)[LAST_SEEN_MVU_KEY];
}

// --- Main Lifecycle ---

$(async () => {
  // 1. Initial setup
  await refreshSettings();
  initPanel();
  start();

  // 2. Start monitoring for MVU changes using the persistent state method
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
