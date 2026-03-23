import { appState, loadApiKey, saveApiKey, loadAccountToken, isOwnJournal, persist, loadByokModel, saveByokModel, loadRememberApiKey, saveRememberApiKey, isGuideDismissed, dismissGuide, showGuide, detectProvider, loadCoverPref, saveCoverPref, loadHideCoverArt, saveHideCoverArt, loadThemePref, saveThemePref, loadFontPref, saveFontPref, loadLlmMode, saveLlmMode, type ThemeId, type FontId } from '../state';
import { COVERS } from './shelf';
import { render } from '../main';
import { escAttr } from '../util';
import { getProfile, saveProfile, deleteProfile, restoreProfile } from '../cloud';

export function renderSettings($page: HTMLElement): void {
  const key = loadApiKey();
  const masked = key ? key.slice(0, 10) + '...' + key.slice(-4) : '';
  const accountToken = loadAccountToken();

  const sectionHead = (label: string) => `<div class="page-number" style="margin-top:34px;margin-bottom:26px;"><span style="flex:1;height:2px;background:var(--cream-dark);"></span> ${label} <span style="flex:1;height:2px;background:var(--cream-dark);"></span></div>`;

  let html = '<div class="settings-view">';

  // --- API Key section ---
  html += sectionHead('AI Access');
  html += '<div style="margin-bottom:34px;">';
  html += '<div style="font-size:12pt;color:var(--text-light);margin-bottom:10px;">Bring your own Anthropic or OpenAI API key. Saved in your browser. Proxied through our server — we never log or store your key.</div>';

  if (key) {
    html += `<div style="font-size:12pt;color:var(--text-light);margin-bottom:8px;"><strong>Current key:</strong> <code>${masked}</code></div>`;
  }

  html += `<input type="password" class="edit-textarea choice-input" id="api-key-input" value="${escAttr(key)}" placeholder="sk-ant-... or sk-..." style="width:100%;height:40px;font-family:monospace;font-size:14px;">`;
  const rememberChecked = loadRememberApiKey();
  html += `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12pt;color:var(--text-light);cursor:pointer;">`;
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
    const provider = detectProvider(key);
    const fastLabel = provider === 'openai' ? 'GPT-5.4 mini' : 'Sonnet';
    const powerLabel = provider === 'openai' ? 'GPT-5.4' : 'Opus';
    html += '<div style="display:flex;gap:8px;align-items:center;margin-top:14px;">';
    html += '<span style="font-size:12pt;color:var(--text-light);font-weight:bold;">Model:</span>';
    html += `<button class="btn btn-small ${byokModel === 'sonnet' ? 'btn-active' : ''}" data-action="toggle-byok-model" data-model="sonnet" style="min-width:80px;">${fastLabel}</button>`;
    html += `<button class="btn btn-small ${byokModel === 'opus' ? 'btn-active' : ''}" data-action="toggle-byok-model" data-model="opus" style="min-width:80px;">${powerLabel}</button>`;
    html += '<span id="byok-model-notice" style="font-size:12pt;color:var(--text-light);opacity:0;transition:opacity 0.3s;margin-left:8px;"></span>';
    html += '</div>';
  }

  html += '</div>';

  // --- Creator Profile section ---
  if (accountToken) {
    html += renderCreatorProfileSection();
  }

  // --- Guide section ---
  html += sectionHead('Adventure Guide');
  html += '<div style="margin-bottom:34px;">';
  const guideDismissed = isGuideDismissed();
  html += `<label style="display:flex;align-items:center;gap:6px;font-size:12pt;color:var(--text-light);cursor:pointer;">`;
  html += `<input type="checkbox" id="toggle-guide" data-action="toggle-guide" ${guideDismissed ? '' : 'checked'} style="cursor:pointer;">`;
  html += `Show guide when creating a new adventure</label>`;
  html += '</div>';

  // --- Cover section ---
  html += sectionHead('Cover Art');
  html += '<div style="margin-bottom:34px;">';
  const hideCover = loadHideCoverArt();
  html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">`;
  html += `<label style="display:flex;align-items:center;gap:6px;font-size:12pt;color:var(--text-light);cursor:pointer;">`;
  html += `<input type="checkbox" id="toggle-hide-cover" data-action="toggle-hide-cover" ${hideCover ? 'checked' : ''} style="cursor:pointer;">`;
  html += `Hide cover art</label>`;
  html += `<span id="hide-cover-notice" style="font-size:12pt;color:var(--choice-red);opacity:0;transition:opacity 0.3s;white-space:nowrap;"></span>`;
  html += `</div>`;
  if (!hideCover) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
    html += '<div style="font-size:12pt;color:var(--text-light);">Choose a cover or let it randomize on each visit.</div>';
    html += '<span id="cover-saved-notice" style="font-size:12pt;color:var(--choice-red);opacity:0;transition:opacity 0.3s;white-space:nowrap;"></span>';
    html += '</div>';
    html += renderCoverSelector();
  }
  html += '</div>';

  // --- Appearance section ---
  html += sectionHead('Appearance');
  html += '<div style="margin-bottom:34px;">';
  html += renderAppearanceSection();
  html += '</div>';

  // --- LLM Mode toggle (dev only) ---
  const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isDev) {
    const llmMode = loadLlmMode();
    const isLocal = llmMode === 'local';
    html += sectionHead('AI Provider');
    html += '<div style="margin-bottom:34px;">';
    html += '<div style="font-size:14px;color:var(--text-light);margin-bottom:10px;">Switch between API (uses your API key) and Local (uses Claude CLI with your Max subscription).</div>';
    html += '<div style="display:flex;align-items:center;gap:12px;">';
    html += `<span style="font-size:14px;color:var(--text-light);${!isLocal ? 'font-weight:bold;' : ''}">API</span>`;
    html += `<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">`;
    html += `<input type="checkbox" id="toggle-llm-mode" data-action="toggle-llm-mode" ${isLocal ? 'checked' : ''} style="opacity:0;width:0;height:0;">`;
    html += `<span style="position:absolute;inset:0;background:${isLocal ? 'var(--choice-red)' : 'var(--cream-dark)'};border-radius:12px;transition:background 0.2s;"></span>`;
    html += `<span style="position:absolute;top:2px;left:${isLocal ? '22px' : '2px'};width:20px;height:20px;background:white;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>`;
    html += `</label>`;
    html += `<span style="font-size:14px;color:var(--text-light);${isLocal ? 'font-weight:bold;' : ''}">Local (Max)</span>`;
    html += `<span id="llm-mode-notice" style="font-size:12pt;color:var(--choice-red);opacity:0;transition:opacity 0.3s;white-space:nowrap;"></span>`;
    html += '</div>';
    html += '</div>';
  }

  html += '</div>'; // .settings-view
  $page.innerHTML = html;
}

function renderCreatorProfileSection(): string {
  const sectionHead = (label: string) => `<div class="page-number" style="margin-top:34px;margin-bottom:26px;"><span style="flex:1;height:2px;background:var(--cream-dark);"></span> ${label} <span style="flex:1;height:2px;background:var(--cream-dark);"></span></div>`;

  let html = sectionHead('Profile');
  html += '<div style="margin-bottom:34px;">';
  html += '<div style="font-size:12pt;color:var(--text-light);margin-bottom:14px;">Set up your public profile. Readers can find you at <strong>/@username</strong>.</div>';

  const labelW = 'width:80px;min-width:80px;font-size:12pt;color:var(--text-light);white-space:nowrap;';

  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
  html += `<label style="${labelW}font-weight:bold;">Username:</label>`;
  html += '<input type="text" id="profile-username" class="edit-textarea choice-input" placeholder="yourname" style="flex:1;height:40px;font-size:14px;" maxlength="30">';
  html += '</div>';
  html += '<div id="profile-username-warning" style="font-size:12px;color:var(--text-light);margin-left:88px;min-height:0;display:none;">Changing your username releases the old one immediately — anyone can claim it.</div>';
  html += '<div id="profile-username-cooldown" style="font-size:12px;color:var(--text-light);margin-left:88px;min-height:0;display:none;"></div>';
  html += '<div id="profile-err-username" style="font-size:12pt;color:var(--red);margin-left:88px;min-height:0;margin-bottom:10px;"></div>';

  html += '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">';
  html += `<label style="${labelW}padding-top:10px;font-weight:bold;">Bio:</label>`;
  html += '<textarea id="profile-bio" class="edit-textarea" placeholder="Tell readers about yourself... (280 chars)" rows="3" style="flex:1;min-height:0;height:80px;font-size:14px;resize:none;" maxlength="280"></textarea>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:80px 1fr;gap:8px;align-items:center;margin-bottom:4px;">';
  html += `<label style="font-size:12pt;color:var(--text-light);white-space:nowrap;font-weight:bold;">Links:</label>`;
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  for (let i = 0; i < 3; i++) {
    html += `<input type="text" id="profile-link-${i}" class="edit-textarea choice-input" placeholder="example.com/you" style="flex:1;min-width:120px;height:36px;font-size:14px;">`;
  }
  html += '</div>';
  html += '</div>';
  for (let i = 0; i < 3; i++) {
    html += `<div id="profile-err-link-${i}" style="font-size:12pt;color:var(--red);margin-left:88px;min-height:0;"></div>`;
  }
  html += '<div style="margin-bottom:10px;"></div>';

  // Restore banner
  html += '<div id="profile-restore-banner" style="display:none;padding:12px;background:rgba(196,30,30,0.08);border:1px solid var(--red);border-radius:6px;margin-bottom:14px;">';
  html += '<div id="profile-restore-text" style="font-size:13px;color:var(--text);margin-bottom:8px;"></div>';
  html += '<button class="btn btn-small btn-active" data-action="restore-profile">Restore Profile</button>';
  html += '<span id="profile-restore-status" style="font-size:12px;color:var(--text-light);margin-left:8px;"></span>';
  html += '</div>';

  html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">';
  html += '<button class="btn btn-active btn-small" data-action="save-profile">Save Profile</button>';
  html += '<span id="profile-link-preview"></span>';
  html += '<button id="profile-delete-btn" class="btn btn-small btn-danger" data-action="delete-profile" style="border-color:var(--red);display:none;">Delete Profile</button>';
  html += '<span id="profile-status" style="font-size:12pt;"></span>';
  html += '</div>';

  html += '</div>';
  return html;
}

let profileLoaded = false;
let savedUsername = '';

export async function loadProfileIntoForm(): Promise<void> {
  if (profileLoaded) return;
  try {
    const data = await getProfile() as any;
    const { profile, canChangeUsername, usernameChangeAvailableAt, isDeleted, deleteGraceRemaining } = data;
    if (!profile) return;
    profileLoaded = true;
    savedUsername = profile.username || '';

    if (isDeleted && deleteGraceRemaining !== null && deleteGraceRemaining > 0) {
      const banner = document.getElementById('profile-restore-banner');
      const text = document.getElementById('profile-restore-text');
      if (banner && text) {
        text.textContent = `Your profile was deleted. You have ${deleteGraceRemaining} day${deleteGraceRemaining === 1 ? '' : 's'} to restore it. After that, your username (@${profile.username}) will be available for others.`;
        banner.style.display = 'block';
      }
      for (const id of ['profile-username', 'profile-bio', 'profile-link-0', 'profile-link-1', 'profile-link-2']) {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) { el.disabled = true; el.style.opacity = '0.5'; }
      }
      const usernameEl = document.getElementById('profile-username') as HTMLInputElement;
      if (usernameEl) usernameEl.value = profile.username || '';
      return;
    }

    const usernameEl = document.getElementById('profile-username') as HTMLInputElement;
    const bioEl = document.getElementById('profile-bio') as HTMLTextAreaElement;
    if (usernameEl) {
      usernameEl.value = profile.username || '';
      if (!canChangeUsername) {
        usernameEl.disabled = true;
        usernameEl.style.opacity = '0.6';
      }
      usernameEl.addEventListener('input', () => {
        const warning = document.getElementById('profile-username-warning');
        if (warning) {
          warning.style.display = usernameEl.value.trim().toLowerCase() !== savedUsername ? 'block' : 'none';
        }
      });
    }
    if (bioEl) bioEl.value = profile.bio || '';
    const links = profile.links || [];
    for (let i = 0; i < 3; i++) {
      const el = document.getElementById(`profile-link-${i}`) as HTMLInputElement;
      if (el && links[i]) el.value = links[i];
    }
    if (!canChangeUsername && usernameChangeAvailableAt) {
      const cooldownEl = document.getElementById('profile-username-cooldown');
      if (cooldownEl) {
        const date = new Date(usernameChangeAvailableAt);
        const daysLeft = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        cooldownEl.textContent = `Username can be changed again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`;
        cooldownEl.style.display = 'block';
      }
    }
    if (profile.username) {
      const preview = document.getElementById('profile-link-preview');
      if (preview) {
        preview.innerHTML = `<a href="/@${escAttr(profile.username)}" style="font-size:12pt;color:var(--text-light);">View profile &rarr;</a>`;
      }
    }
    const deleteBtn = document.getElementById('profile-delete-btn');
    if (deleteBtn) deleteBtn.style.display = '';
  } catch {
    // Silent
  }
}

function clearProfileErrors(): void {
  const ids = ['profile-err-username', 'profile-err-link-0', 'profile-err-link-1', 'profile-err-link-2'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  }
  for (const id of ['profile-username', 'profile-link-0', 'profile-link-1', 'profile-link-2']) {
    const el = document.getElementById(id);
    if (el) el.style.outline = '';
  }
  const statusEl = document.getElementById('profile-status');
  if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }
}

function showFieldError(fieldId: string, errId: string, message: string): void {
  const field = document.getElementById(fieldId);
  const err = document.getElementById(errId);
  if (field) { field.style.outline = '2px solid var(--red)'; field.focus(); }
  if (err) err.textContent = message;
}

export async function handleSaveProfile(): Promise<void> {
  clearProfileErrors();
  const usernameEl = document.getElementById('profile-username') as HTMLInputElement;
  const bioEl = document.getElementById('profile-bio') as HTMLTextAreaElement;
  const statusEl = document.getElementById('profile-status');
  if (!usernameEl) return;

  const username = usernameEl.value.trim();
  const bio = bioEl?.value?.trim() || '';
  const links: string[] = [];
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`profile-link-${i}`) as HTMLInputElement;
    if (el?.value?.trim()) links.push(el.value.trim());
    else links.push('');
  }

  if (!username || username.length < 3) {
    showFieldError('profile-username', 'profile-err-username', 'Must be at least 3 characters.');
    return;
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(username)) {
    showFieldError('profile-username', 'profile-err-username', 'Letters, numbers, hyphens, and underscores only.');
    return;
  }

  for (let i = 0; i < 3; i++) {
    if (!links[i]) continue;
    if (!/^https?:\/\//i.test(links[i])) {
      links[i] = 'https://' + links[i];
      const el = document.getElementById(`profile-link-${i}`) as HTMLInputElement;
      if (el) el.value = links[i];
    }
    try {
      new URL(links[i]);
    } catch {
      showFieldError(`profile-link-${i}`, `profile-err-link-${i}`, 'Not a valid URL');
      return;
    }
  }

  const cleanLinks = links.filter(l => l);

  if (statusEl) { statusEl.textContent = 'Saving...'; statusEl.style.color = 'var(--text-light)'; }

  try {
    await saveProfile(username, bio, cleanLinks);
    if (statusEl) { statusEl.textContent = 'Saved!'; statusEl.style.color = 'var(--text-light)'; }
    profileLoaded = true;
    const preview = document.getElementById('profile-link-preview');
    if (preview) {
      preview.innerHTML = `<a href="/@${escAttr(username.toLowerCase())}" style="font-size:12pt;color:var(--text-light);">View profile &rarr;</a>`;
    }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  } catch (err: any) {
    if (statusEl) { statusEl.textContent = err.message || 'Failed to save.'; statusEl.style.color = 'var(--red)'; }
  }
}

export function showDeleteProfileModal(): void {
  const modal = document.getElementById('delete-profile-modal');
  if (modal) modal.style.display = 'flex';
}

export function closeDeleteProfileModal(): void {
  const modal = document.getElementById('delete-profile-modal');
  if (modal) modal.style.display = 'none';
}

export async function confirmDeleteProfile(): Promise<void> {
  closeDeleteProfileModal();
  const statusEl = document.getElementById('profile-status');
  try {
    await deleteProfile();
    profileLoaded = false;
    render();
  } catch (err: any) {
    if (statusEl) { statusEl.textContent = err.message || 'Failed to delete.'; statusEl.style.color = 'var(--red)'; }
  }
}

export async function handleRestoreProfile(): Promise<void> {
  const statusEl = document.getElementById('profile-restore-status');
  if (statusEl) statusEl.textContent = 'Restoring...';
  try {
    await restoreProfile();
    profileLoaded = false;
    render();
  } catch (err: any) {
    if (statusEl) statusEl.textContent = err.message || 'Failed to restore.';
  }
}

// --- Theme & Font definitions ---

const THEMES: { id: ThemeId; name: string; swatch: string; textColor: string }[] = [
  { id: 'parchment', name: 'Parchment', swatch: '#f4e8c1', textColor: '#2c1810' },
  { id: 'midnight', name: 'Midnight', swatch: '#1e2233', textColor: '#d4cfc4' },
  { id: 'rose-quartz', name: 'Rose Quartz', swatch: '#f5e8e4', textColor: '#2c1820' },
  { id: 'forest', name: 'Forest', swatch: '#f0ead0', textColor: '#1c2a18' },
  { id: 'obsidian', name: 'Obsidian', swatch: '#1c1c1e', textColor: '#d8d4cc' },
];

const FONTS: { id: FontId; name: string; preview: string }[] = [
  { id: 'classic', name: 'Classic', preview: "'Fraunces', Georgia, serif" },
  { id: 'editorial', name: 'Editorial', preview: "'Playfair Display', Georgia, serif" },
  { id: 'modern', name: 'Modern', preview: "'DM Sans', sans-serif" },
  { id: 'literary', name: 'Literary', preview: "'Spectral', Georgia, serif" },
  { id: 'typewriter', name: 'Typewriter', preview: "'Space Mono', monospace" },
];

function renderAppearanceSection(): string {
  const currentTheme = loadThemePref();
  const currentFont = loadFontPref();

  let html = '';

  // Color schemes
  html += '<div style="font-size:12pt;color:var(--text-light);margin-bottom:8px;font-weight:bold;">Color Scheme:</div>';
  html += `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">`;
  for (const theme of THEMES) {
    const selected = currentTheme === theme.id;
    const borderStyle = selected ? '3px solid var(--choice-red)' : '2px solid var(--cream-dark)';
    html += `<div data-action="select-theme" data-theme="${theme.id}" style="cursor:pointer;text-align:center;">`;
    html += `<div style="width:52px;height:52px;border-radius:8px;background:${theme.swatch};border:${borderStyle};display:flex;align-items:center;justify-content:center;margin-bottom:4px;">`;
    html += `<span style="font-size:12pt;font-weight:bold;color:${theme.textColor};">Aa</span>`;
    html += '</div>';
    html += `<div style="font-size:12pt;color:var(--text-light);">${theme.name}</div>`;
    html += '</div>';
  }
  html += '</div>';

  // Fonts
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
  html += '<div style="font-size:12pt;color:var(--text-light);font-weight:bold;">Font:</div>';
  html += '<span id="font-saved-notice" style="font-size:12pt;color:var(--choice-red);opacity:0;transition:opacity 0.3s;white-space:nowrap;"></span>';
  html += '</div>';
  html += `<div style="display:flex;flex-direction:column;gap:6px;">`;
  for (const font of FONTS) {
    const selected = currentFont === font.id;
    const border = selected ? '2px solid var(--choice-red)' : '1px solid var(--cream-dark)';
    const bg = selected ? 'rgba(139,0,0,0.06)' : 'transparent';
    html += `<div data-action="select-font" data-font="${font.id}" style="cursor:pointer;padding:10px 14px;border-radius:8px;border:${border};background:${bg};transition:border 0.15s, background 0.15s;">`;
    html += `<span style="font-family:${font.preview};font-size:12pt;">${font.name}</span>`;
    html += `<span style="font-family:${font.preview};font-size:12pt;color:var(--text-light);margin-left:10px;">The path diverges before you...</span>`;
    html += '</div>';
  }
  html += '</div>';

  return html;
}

const COVER_TITLES: Record<string, string> = {
  cyberspacesaga: 'Cyberspace Odyssey',
  enchantedkingdoms: 'Enchanted Kingdoms',
  neonunderworld: 'Neon Underworld',
  primordial_depths: 'Primordial Depths',
  quantumlabyrinth: 'Quantum Labyrinth',
};

function coverTitle(path: string): string {
  const slug = path.replace('covers/', '').replace(/-[a-z]-(hero|heroine)\.png$/, '');
  return COVER_TITLES[slug] || slug;
}

function renderCoverSelector(): string {
  const pref = loadCoverPref();

  const groups: Record<string, string[]> = {};
  for (const c of COVERS) {
    const title = coverTitle(c);
    if (!groups[title]) groups[title] = [];
    groups[title].push(c);
  }

  const selectedStyle = 'outline:3px solid var(--choice-red);outline-offset:2px;';
  let html = '';

  html += `<div data-action="select-cover" data-cover="random" style="display:inline-block;margin-bottom:12px;cursor:pointer;padding:6px 14px;border-radius:4px;font-size:12pt;${pref === 'random' ? 'background:var(--choice-red);color:#fff;' : 'background:var(--cream-dark);color:var(--text);'}">Randomize</div>`;

  for (const [title, covers] of Object.entries(groups)) {
    const hasSelected = covers.some(c => c === pref);
    html += `<details class="cover-group" style="margin-bottom:8px;"${hasSelected ? ' open' : ''}>`;
    html += `<summary style="font-size:12pt;color:var(--text);cursor:pointer;padding:4px 0;">${title}</summary>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0;">';
    for (const c of covers) {
      const selected = pref === c;
      html += `<div data-action="select-cover" data-cover="${c}" style="cursor:pointer;border-radius:4px;overflow:hidden;width:80px;${selected ? selectedStyle : ''}">`;
      html += `<img src="${c}" alt="${title}" style="width:100%;display:block;border-radius:4px;">`;
      html += '</div>';
    }
    html += '</div></details>';
  }

  return html;
}

// --- Handlers ---

export function handleSelectTheme(theme: ThemeId): void {
  saveThemePref(theme);
  applyTheme(theme);
  render();
}

export function handleSelectFont(font: FontId): void {
  saveFontPref(font);
  applyFont(font);
  render();
  requestAnimationFrame(() => {
    const notice = document.getElementById('font-saved-notice');
    if (notice) {
      const label = FONTS.find(f => f.id === font)?.name || font;
      notice.textContent = `Switched to ${label}`;
      notice.style.opacity = '1';
      setTimeout(() => { notice.style.opacity = '0'; }, 1500);
    }
  });
}

export function applyTheme(theme: ThemeId): void {
  if (theme === 'parchment') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function applyFont(font: FontId): void {
  if (font === 'classic') {
    document.documentElement.removeAttribute('data-font');
  } else {
    document.documentElement.setAttribute('data-font', font);
  }
}

export function handleToggleRememberKey(): void {
  const checkbox = document.getElementById('remember-api-key') as HTMLInputElement;
  if (!checkbox) return;
  saveRememberApiKey(checkbox.checked);
  const currentKey = loadApiKey();
  if (currentKey) saveApiKey(currentKey);
}

export function handleToggleGuide(): void {
  const checkbox = document.getElementById('toggle-guide') as HTMLInputElement;
  if (!checkbox) return;
  if (checkbox.checked) {
    showGuide();
  } else {
    dismissGuide();
  }
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

  document.querySelectorAll<HTMLButtonElement>('[data-action="toggle-byok-model"]').forEach(btn => {
    btn.classList.toggle('btn-active', btn.dataset.model === model);
  });

  const notice = document.getElementById('byok-model-notice');
  if (notice) {
    const key = loadApiKey();
    const provider = key ? detectProvider(key) : 'anthropic';
    const label = model === 'opus'
      ? (provider === 'openai' ? 'GPT-5.4' : 'Opus')
      : (provider === 'openai' ? 'GPT-5.4 mini' : 'Sonnet');
    notice.textContent = `Switched to ${label}`;
    notice.style.opacity = '1';
    setTimeout(() => { notice.style.opacity = '0'; }, 1500);
  }
}
