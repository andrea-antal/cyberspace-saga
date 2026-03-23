import { appState, loadAccountToken, isOwnJournal } from './state';
import { saveToCloud } from './cloud';

let needsSync = false;
let syncInFlight = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function showIndicator(state: 'saving' | 'saved'): void {
  const el = document.getElementById('sync-indicator');
  if (!el) return;

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  el.textContent = state === 'saving' ? '☁ Saving...' : '☁ Saved';
  el.className = `sync-indicator sync-${state}`;

  if (state === 'saved') {
    hideTimer = setTimeout(() => {
      el.className = 'sync-indicator';
    }, 2000);
  }
}

export function syncToCloudIfNeeded(): void {
  const token = loadAccountToken();
  if (!token) return;

  needsSync = true;
  showIndicator('saving');

  if (syncInFlight) return;
  syncInFlight = true;

  const ownJournals = appState.journals.filter(j => isOwnJournal(j.id));
  saveToCloud(token, ownJournals)
    .then(() => { needsSync = false; showIndicator('saved'); })
    .catch(() => { /* silent — needsSync stays true, retry on next trigger */ })
    .finally(() => { syncInFlight = false; });
}

export function flushSync(): void {
  if (!needsSync) return;
  const token = loadAccountToken();
  if (!token) return;

  const ownJournals = appState.journals.filter(j => isOwnJournal(j.id));
  const body = JSON.stringify({ action: 'save', token, journals: ownJournals });

  // Best-effort sync on page hide — navigator.sendBeacon for reliability
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/auth', blob);
  } else {
    saveToCloud(token, ownJournals).catch(() => {});
  }
}
