import { start, stop, refreshSettings } from './core';
import { initPanel, destroyPanel } from './panel';

// --- localStorage-based Persistent Polling Logic ---
let mvuCheckInterval: number | null = null;
const MVU_ID_KEY = '__auto_run_last_seen_mvu_id';

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

  mvuCheckInterval = setInterval(() => {
    const currentMvu = (window.parent as any).Mvu;
    if (!currentMvu) {
      // MVU is not loaded yet, do nothing.
      return;
    }

    const lastSeenId = localStorage.getItem(MVU_ID_KEY);
    const currentInstanceId = currentMvu.__auto_run_instance_id;

    if (currentInstanceId && currentInstanceId === lastSeenId) {
      // The instance is the same one we've already processed. Do nothing.
      return;
    }

    // If we reach here, it means MVU has been rebuilt.
    // It's either a new instance without our ID, or an old one with a different ID.
    
    // Generate a new unique ID for this new instance
    const newId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    currentMvu.__auto_run_instance_id = newId;
    
    // Store the new ID in localStorage
    localStorage.setItem(MVU_ID_KEY, newId);

    // And trigger the rebuild of our script
    rebuild();

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
