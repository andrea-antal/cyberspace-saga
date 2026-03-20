import { appState, loadApiKey, saveApiKey, loadAccountToken, saveAccountToken, isOwnJournal, persist, loadByokModel, saveByokModel, loadRememberApiKey, saveRememberApiKey } from '../state';
import { render } from '../main';
import { escAttr } from '../util';
import { createAccount, saveToCloud, loadFromCloud } from '../cloud';

export function renderSettings($page: HTMLElement): void {
  const key = loadApiKey();
  const masked = key ? key.slice(0, 10) + '...' + key.slice(-4) : '';

  let html = '<div style="font-size:18px;font-weight:bold;margin-bottom:16px;">Settings</div>';

  // --- API Key section ---
  html += '<div style="margin-bottom:24px;">';
  html += '<div style="font-size:14px;font-weight:bold;margin-bottom:8px;">Anthropic API Key</div>';
  html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">Required for AI features. Saved in your browser. Proxied through our server to reach Anthropic — we never log or store your key. Get one at <a href="https://console.anthropic.com" target="_blank" style="color:var(--choice-red)">console.anthropic.com</a></div>';

  if (key) {
    html += `<div style="font-size:13px;color:var(--text-light);margin-bottom:8px;">Current key: <code>${masked}</code></div>`;
  }

  html += `<input type="password" class="edit-textarea choice-input" id="api-key-input" value="${escAttr(key)}" placeholder="sk-ant-..." style="width:100%;height:40px;font-family:monospace;font-size:14px;">`;
  const rememberChecked = loadRememberApiKey();
  html += `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:14px;color:var(--text-light);cursor:pointer;">`;
  html += `<input type="checkbox" id="remember-api-key" data-action="toggle-remember-key" ${rememberChecked ? 'checked' : ''} style="cursor:pointer;">`;
  html += `Remember this key across sessions</label>`;
  html += '<div style="margin-top:10px;display:flex;gap:8px;">';
  html += '<button class="btn btn-active btn-small" data-action="save-api-key">Save Key</button>';
  if (key) {
    html += '<button class="btn btn-small btn-danger" data-action="clear-api-key">Remove Key</button>';
  }
  html += '</div>';

  if (key) {
    const byokModel = loadByokModel();
    html += '<div style="margin-top:14px;">';
    html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:6px;">Model</div>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    html += `<button class="btn btn-small ${byokModel === 'sonnet' ? 'btn-active' : ''}" data-action="toggle-byok-model" data-model="sonnet" style="min-width:80px;">Sonnet</button>`;
    html += `<button class="btn btn-small ${byokModel === 'opus' ? 'btn-active' : ''}" data-action="toggle-byok-model" data-model="opus" style="min-width:80px;">Opus</button>`;
    html += '<span id="byok-model-notice" style="font-size:13px;color:var(--text-light);opacity:0;transition:opacity 0.3s;margin-left:8px;"></span>';
    html += '</div>';
    html += '<div style="font-size:13px;color:var(--text-light);margin-top:6px;">Opus is more capable but slower and more expensive.</div>';
    html += '</div>';
  }

  html += '</div>';

  // --- Cloud Backup section ---
  html += '<div style="margin-bottom:24px;padding-top:20px;border-top:1px solid var(--cream-dark);">';
  html += '<div style="font-size:14px;font-weight:bold;margin-bottom:8px;">Cloud Backup</div>';
  html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">Back up your decisions to the cloud and restore them on any device. No account needed — just a token.</div>';

  const accountToken = loadAccountToken();
  if (accountToken) {
    html += `<div style="font-size:13px;color:var(--text-light);margin-bottom:8px;">Your token: <code>${accountToken}</code></div>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    html += '<button class="btn btn-active btn-small" data-action="save-to-cloud">Sync to Cloud</button>';
    html += '<button class="btn btn-small" data-action="copy-account-token">Copy Token</button>';
    html += '<button class="btn btn-small btn-danger" data-action="disconnect-account">Disconnect</button>';
    html += '</div>';
  } else {
    html += '<button class="btn btn-active btn-small" data-action="generate-account-token">Create Backup</button>';
    html += '<div style="margin-top:12px;">';
    html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:6px;">Already have a token?</div>';
    html += '<div style="display:flex;gap:8px;">';
    html += `<input type="text" class="edit-textarea choice-input" id="restore-token-input" placeholder="Paste your token" style="flex:1;height:40px;font-family:monospace;font-size:14px;">`;
    html += '<button class="btn btn-small" data-action="load-from-cloud">Restore</button>';
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';

  // --- Import Shared section ---
  html += '<div style="margin-bottom:24px;padding-top:20px;border-top:1px solid var(--cream-dark);">';
  html += '<div style="font-size:14px;font-weight:bold;margin-bottom:8px;">Import Shared Decision</div>';
  html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">Paste a share token from someone else to import their decision.</div>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<input type="text" class="edit-textarea choice-input" id="import-share-input" placeholder="Paste share token" style="flex:1;height:40px;">';
  html += '<button class="btn btn-small" data-action="import-shared">Import</button>';
  html += '</div>';
  html += '</div>';

  $page.innerHTML = html;
}

export function handleToggleRememberKey(): void {
  const checkbox = document.getElementById('remember-api-key') as HTMLInputElement;
  if (!checkbox) return;
  saveRememberApiKey(checkbox.checked);
  // Re-save the key to move it between storages
  const currentKey = loadApiKey();
  if (currentKey) saveApiKey(currentKey);
}

export function handleSaveApiKey(): void {
  const input = document.getElementById('api-key-input') as HTMLInputElement;
  if (!input) return;
  saveApiKey(input.value.trim());
  render();
}

export function handleClearApiKey(): void {
  saveApiKey('');
  render();
}

export function handleToggleByokModel(model: 'sonnet' | 'opus'): void {
  saveByokModel(model);

  // Update button states in-place
  document.querySelectorAll<HTMLButtonElement>('[data-action="toggle-byok-model"]').forEach(btn => {
    btn.classList.toggle('btn-active', btn.dataset.model === model);
  });

  // Flash confirmation notice
  const notice = document.getElementById('byok-model-notice');
  if (notice) {
    const label = model === 'opus' ? 'Opus' : 'Sonnet';
    notice.textContent = `Switched to ${label}`;
    notice.style.opacity = '1';
    setTimeout(() => { notice.style.opacity = '0'; }, 1500);
  }
}

export async function handleGenerateAccountToken(): Promise<void> {
  const ownJournals = appState.journals.filter(j => isOwnJournal(j.id));
  try {
    const token = await createAccount(ownJournals);
    saveAccountToken(token);
    render();
  } catch (err: any) {
    alert('Failed to create backup: ' + err.message);
  }
}

export async function handleSaveToCloud(): Promise<void> {
  const token = loadAccountToken();
  if (!token) return;
  const btn = document.querySelector('[data-action="save-to-cloud"]') as HTMLButtonElement;
  if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
  try {
    const ownJournals = appState.journals.filter(j => isOwnJournal(j.id));
    await saveToCloud(token, ownJournals);
    if (btn) { btn.textContent = 'Synced!'; setTimeout(() => render(), 1500); }
  } catch (err: any) {
    if (btn) { btn.textContent = 'Sync to Cloud'; btn.disabled = false; }
    alert('Sync failed: ' + err.message);
  }
}

export async function handleLoadFromCloud(): Promise<void> {
  const input = document.getElementById('restore-token-input') as HTMLInputElement;
  if (!input) return;
  const token = input.value.trim();
  if (!token) return;
  try {
    const journals = await loadFromCloud(token);
    const shared = appState.journals.filter(j => !isOwnJournal(j.id));
    appState.journals = [...journals, ...shared];
    saveAccountToken(token);
    persist();
    render();
  } catch (err: any) {
    alert('Restore failed: ' + err.message);
  }
}

export function handleCopyAccountToken(): void {
  const token = loadAccountToken();
  if (token) navigator.clipboard.writeText(token);
}

export function handleDisconnectAccount(): void {
  saveAccountToken('');
  render();
}
