import { appState, viewState, persist, getJournal, genId, resetInterviewState, getSharedMeta, isOwnJournal, canDelete, loadAccountToken, standaloneIds, loadCoverPref, loadHideCoverArt } from '../state';
import { render } from '../main';
import { esc, slugify } from '../util';
import type { Journal } from '../types';
import { createShareToken, getSlug, saveToCloud, getLikeStatus, likeJournal, unlikeJournal, setUnlisted } from '../cloud';
import { syncToCloudIfNeeded } from '../sync';

let shelfManaging = false;

export function toggleShelfManaging(): void {
  shelfManaging = !shelfManaging;
  render();
}

// --- Cover images ---
export const COVERS = [
  'covers/cyberspacesaga-a-heroine.png',
  'covers/cyberspacesaga-b-hero.png',
  'covers/cyberspacesaga-b-heroine.png',
  'covers/enchantedkingdoms-a-hero.png',
  'covers/enchantedkingdoms-b-heroine.png',
  'covers/enchantedkingdoms-c-heroine.png',
  'covers/neonunderworld-a-heroine.png',
  'covers/neonunderworld-b-hero.png',
  'covers/neonunderworld-c-hero.png',
  'covers/primordial_depths-a-heroine.png',
  'covers/primordial_depths-b-hero.png',
  'covers/primordial_depths-c-heroine.png',
  'covers/quantumlabyrinth-a-heroine.png',
  'covers/quantumlabyrinth-b-hero.png',
  'covers/quantumlabyrinth-c-heroine.png',
];

function getActiveCover(): string {
  const pref = loadCoverPref();
  if (pref !== 'random' && COVERS.includes(pref)) return pref;
  return COVERS[Math.floor(Math.random() * COVERS.length)];
}

// Pick once per page load
const sessionCover = getActiveCover();

export function renderShelf($page: HTMLElement): void {
  // Standalone cover: show cover image + adventure title only
  if (appState.activeJournalId && standaloneIds.has(appState.activeJournalId)) {
    const j = getJournal();
    if (j) {
      renderStandaloneCover($page, j);
      return;
    }
  }

  let html = '<div class="shelf">';

  // Cover image (or text title if hidden)
  if (loadHideCoverArt()) {
    html += '<div class="cover-title" style="text-align:center;padding:24px 0;">YOUR SAGA</div>';
  } else {
    html += `<div class="cover-image-frame"><img src="${sessionCover}" alt="Decision Journal" onerror="this.parentElement.style.display='none'"></div>`;
  }


  if (appState.journals.length === 0) {
    html += '<div class="shelf-empty">You are the hero of your own adventure. Choose wisely, for you may discover pathways to outcomes you never would have dreamed of...</div>';
  } else {
    html += '<ul class="shelf-list">';
    appState.journals.forEach(j => {
      const pageCount = Object.keys(j.pages).length;
      const pathCount = countPaths(j);
      const date = new Date(j.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const shared = getSharedMeta(j.id);
      const badge = shared
        ? shared.permission === 'view'
          ? ' <span class="shared-badge">view only</span>'
          : ' <span class="shared-badge">shared</span>'
        : '';
      html += `<li class="shelf-item" data-action="open-journal" data-id="${j.id}" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="flex:1;min-width:0;">
          <div class="shelf-item-title">&#10040; ${esc(j.title)}${badge}</div>
          <div class="shelf-item-meta">${date} &middot; ${pageCount} page${pageCount !== 1 ? 's' : ''} &middot; ${pathCount} path${pathCount !== 1 ? 's' : ''}<span id="shelf-likes-${j.id}"></span></div>
        </div>`;
      if (shelfManaging && canDelete(j.id)) {
        html += `<button class="btn btn-small" style="flex-shrink:0;margin-left:8px;font-size:11px;" data-action="delete-journal" data-id="${j.id}">Delete</button>`;
      }
      html += `</li>`;
    });
    html += '</ul>';
  }

  html += `<div class="shelf-new">`;
  html += '<button class="btn btn-primary" data-action="show-ai-modal">New Adventure</button>';
  if (appState.journals.length > 0) {
    html += `<button class="btn btn-small" data-action="manage-shelf" style="margin-left:8px;">${shelfManaging ? 'Done' : 'Manage'}</button>`;
  }
  html += '</div>';
  html += '<div style="text-align:center;margin-top:8px;display:flex;justify-content:center;gap:12px;">';
  html += '<button class="btn-link" style="font-size:12px;" data-action="go-leaderboard">Top Stories</button>';
  html += '<button class="btn-link" style="font-size:12px;" data-action="show-faq-modal">Help/FAQ</button>';
  html += '<button class="btn-link" style="font-size:12px;" data-action="go-settings">Settings</button>';
  html += '</div>';
  html += '</div>';
  $page.innerHTML = html;

  // Fetch like counts for own journals
  fetchShelfLikes();
}

function fetchShelfLikes(): void {
  const token = loadAccountToken() || null;
  appState.journals.forEach(j => {
    if (!isOwnJournal(j.id)) return;
    getLikeStatus(token, j.id).then(({ count }) => {
      const el = document.getElementById(`shelf-likes-${j.id}`);
      if (el && count > 0) {
        el.textContent = ` \u00b7 ${count} like${count !== 1 ? 's' : ''}`;
      }
    }).catch(() => {});
  });
}

function renderStandaloneCover($page: HTMLElement, j: Journal): void {
  let html = '<div class="shelf">';
  if (loadHideCoverArt()) {
    html += '<div class="cover-title" style="text-align:center;padding:24px 0;">YOUR SAGA</div>';
  } else {
    html += `<div class="cover-image-frame"><img src="${sessionCover}" alt="Decision Journal" onerror="this.parentElement.style.display='none'"></div>`;
  }
  html += `<div style="text-align:center;padding:24px 16px;">`;
  html += `<a data-action="standalone-begin" style="cursor:pointer;text-decoration:none;">`;
  html += `<div style="font-size:20px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:var(--text);">&#10040; ${esc(j.title)}</div>`;
  html += `<div style="font-size:14px;color:var(--text-light);margin-top:8px;">Tap to begin</div>`;
  html += `</a>`;
  html += `</div>`;
  html += '</div>';
  $page.innerHTML = html;
}

function countPaths(j: Journal): number {
  let count = 0;
  Object.values(j.pages).forEach(pg => {
    if (pg.choices) count += pg.choices.length;
  });
  return count;
}

export function openJournal(id: string): void {
  appState.activeJournalId = id;
  viewState.editMode = false;

  // If journal is fresh/empty (only default blank page 1), go to input view
  const j = getJournal(id);
  const pageKeys = j ? Object.keys(j.pages) : [];
  const isFresh = j && pageKeys.length === 1 && j.pages[1] && !j.pages[1].content;
  if (isFresh) {
    resetInterviewState();
    viewState.view = 'input';
  } else {
    viewState.view = 'page';
    viewState.currentPage = 1;
  }

  persist();
  render();
}

export function deleteJournal(id: string): void {
  const j = getJournal(id);
  if (!j) return;
  appState.journals = appState.journals.filter(x => x.id !== id);
  if (appState.activeJournalId === id) appState.activeJournalId = null;
  persist();
  syncToCloudIfNeeded();
  viewState.view = 'shelf';
  render();
}

export function createJournal(title: string): void {
  const j: Journal = {
    id: genId(),
    title,
    created: new Date().toISOString(),
    pages: {
      1: { content: '', choices: [], isEnding: false, type: 'fact', source: 'user' }
    },
    bookmarks: [],
  };
  appState.journals.unshift(j);
  appState.activeJournalId = j.id;
  persist();

  syncToCloudIfNeeded();
  viewState.view = 'page';
  viewState.currentPage = 1;
  render();
}

export function createJournalFromAI(title: string): void {
  const j: Journal = {
    id: genId(),
    title,
    created: new Date().toISOString(),
    pages: {
      1: { content: '', choices: [], isEnding: false, type: 'fact', source: 'user' }
    },
    bookmarks: [],
  };
  appState.journals.unshift(j);
  appState.activeJournalId = j.id;
  persist();

  syncToCloudIfNeeded();
  resetInterviewState();
  viewState.view = 'input';
  render();
}

export function openJournalForAI(id: string): void {
  appState.activeJournalId = id;
  persist();
  resetInterviewState();
  viewState.view = 'input';
  render();
}

export async function handleShareJournal(id: string): Promise<void> {
  const accountToken = loadAccountToken();
  if (!accountToken) {
    alert('Create a cloud backup first (Settings > Cloud Backup) to share decisions.');
    return;
  }
  const $content = document.getElementById('share-modal-content')!;
  $content.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text-light);font-style:italic;">Generating share link...</div>';
  document.getElementById('share-modal')!.style.display = 'flex';

  try {
    const j = getJournal(id);
    const ownJournals = appState.journals.filter(j => isOwnJournal(j.id));
    const [, slugData] = await Promise.all([
      saveToCloud(accountToken, ownJournals),
      getSlug(id),
    ]);
    const existingSlug = slugData.slug;
    const isUnlisted = slugData.unlisted;
    const token = await createShareToken(accountToken, id);
    const defaultSlug = existingSlug || (j ? slugify(j.title) : '');
    const origin = window.location.origin;
    const viewUrl = `${origin}/?s=${token}-V`;
    const editUrl = `${origin}/?s=${token}`;

    const slugSection = `
        <div style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:0;font-size:14px;">
            <span style="padding:6px 0 6px 10px;background:rgba(255,255,255,0.3);border-radius:4px 0 0 4px;color:var(--text-light);white-space:nowrap;">${origin}/</span>
            <input type="text" id="share-slug-input" value="${esc(defaultSlug)}" placeholder="your-adventure-name" style="flex:1;padding:6px 10px;background:rgba(255,255,255,0.3);border:none;border-left:1px solid var(--cream-dark);border-radius:0 4px 4px 0;font-size:14px;font-family:inherit;outline:none;min-width:0;">
          </div>
          <div style="font-size:12px;color:var(--text-light);margin-top:4px;">3\u201360 characters. Letters, numbers, and hyphens only. If taken, a short suffix is added.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-small btn-active" id="publish-slug-btn" data-action="publish-slug" data-id="${id}">${existingSlug ? 'Update' : 'Publish'}</button>${existingSlug ? `
          <button class="btn btn-small btn-danger" data-action="unpublish-slug" data-id="${id}">Unpublish</button>` : ''}
          <span id="slug-status" style="font-size:14px;color:var(--text-light);"></span>
        </div>
        <div id="slug-result" style="${existingSlug ? '' : 'display:none;'}margin-top:8px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <code id="share-url-standalone" style="font-size:14px;padding:6px 10px;background:rgba(255,255,255,0.3);border-radius:4px;word-break:break-all;flex:1;">${existingSlug ? `${origin}/${existingSlug}` : ''}</code>
            <button class="btn btn-small btn-active" data-action="copy-share-standalone">Copy Link</button>
          </div>
        </div>
        <div id="unlisted-toggle" style="${existingSlug ? '' : 'display:none;'}margin-top:8px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:14px;color:var(--text-light);cursor:pointer;">
            <input type="checkbox" id="share-unlisted" ${isUnlisted ? 'checked' : ''} style="cursor:pointer;">
            Hide from leaderboard and top stories
          </label>
        </div>`;

    const editToggle = `
        <div style="margin-top:8px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:14px;color:var(--text-light);cursor:pointer;">
            <input type="checkbox" id="share-allow-edit" style="cursor:pointer;">
            Allow editing
          </label>
        </div>`;

    $content.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:14px;font-weight:bold;margin-bottom:4px;">Public link</div>
        <div style="font-size:14px;color:var(--text-light);margin-bottom:8px;">Anyone with the link can read this adventure.</div>
        ${slugSection}
      </div>
      <div style="padding-top:16px;border-top:1px solid var(--cream-dark);">
        <div style="font-size:14px;font-weight:bold;margin-bottom:4px;">Private link</div>
        <div style="font-size:14px;color:var(--text-light);margin-bottom:8px;">Only people you share this link with can access it. The adventure is saved to their shelf.</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <code id="share-url" style="font-size:14px;padding:6px 10px;background:rgba(255,255,255,0.3);border-radius:4px;word-break:break-all;flex:1;">${viewUrl}</code>
          <button class="btn btn-small btn-active" data-action="copy-share-url">Copy Link</button>
        </div>
        ${editToggle}
      </div>
    `;
    // Sanitize slug input in real time
    const slugInput = document.getElementById('share-slug-input') as HTMLInputElement | null;
    if (slugInput) {
      slugInput.addEventListener('input', () => {
        slugInput.value = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      });
    }
    // Toggle between view-only and edit URLs
    const checkbox = document.getElementById('share-allow-edit') as HTMLInputElement | null;
    const urlEl = document.getElementById('share-url')!;
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        urlEl.textContent = checkbox.checked ? editUrl : viewUrl;
      });
    }
    // Toggle unlisted (opt out of leaderboard/featured)
    const unlistedCheckbox = document.getElementById('share-unlisted') as HTMLInputElement | null;
    if (unlistedCheckbox) {
      unlistedCheckbox.addEventListener('change', () => {
        setUnlisted(accountToken, id, unlistedCheckbox.checked).catch(() => {
          unlistedCheckbox.checked = !unlistedCheckbox.checked;
        });
      });
    }
  } catch (err: any) {
    $content.innerHTML = `<div style="color:var(--red);font-size:14px;">Failed to create share link: ${err.message}</div>`;
  }
}
