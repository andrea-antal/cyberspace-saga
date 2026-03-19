import { appState, viewState, persist, getJournal, genId, resetInterviewState, getSharedMeta, isOwnJournal, canDelete, loadAccountToken, loadSharedJournals, saveSharedJournals } from '../state';
import { render } from '../main';
import { esc } from '../util';
import type { Journal } from '../types';
import { createShareToken, importShared, saveToCloud } from '../cloud';

export function renderShelf($page: HTMLElement): void {
  let html = '<div class="shelf">';

  // Cover image
  html += '<div class="cover-image-frame"><img src="cyoa-cover.png" alt="Decision Journal" onerror="this.parentElement.style.display=\'none\'"></div>';


  if (appState.journals.length === 0) {
    html += '<div class="shelf-empty">No decisions yet.<br>Every adventure begins with a choice.</div>';
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
      html += `<li class="shelf-item" data-action="open-journal" data-id="${j.id}">
        <div>
          <div class="shelf-item-title">&#10040; ${esc(j.title)}${badge}</div>
          <div class="shelf-item-meta">${date} &middot; ${pageCount} page${pageCount !== 1 ? 's' : ''} &middot; ${pathCount} path${pathCount !== 1 ? 's' : ''}</div>
        </div>`;
      if (isOwnJournal(j.id)) {
        html += `<span class="shelf-item-share" data-action="share-journal" data-id="${j.id}">Share</span>`;
      }
      if (canDelete(j.id)) {
        html += `<span class="shelf-item-delete" data-action="delete-journal" data-id="${j.id}" title="Delete">&times;</span>`;
      }
      html += `</li>`;
    });
    html += '</ul>';
  }

  // Import shared section
  html += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--cream-dark);">';
  html += '<div style="font-size:14px;color:var(--text-light);margin-bottom:6px;">Import a shared decision</div>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<input type="text" class="edit-textarea choice-input" id="import-share-input" placeholder="Paste share token" style="flex:1;height:40px;">';
  html += '<button class="btn btn-small" data-action="import-shared">Import</button>';
  html += '</div>';
  html += '</div>';

  html += '<div class="shelf-new">';
  html += '<button class="btn btn-primary" data-action="show-modal">New Decision</button>';
  html += '<button class="btn" data-action="show-ai-modal">Explore with AI</button>';
  html += '<button class="btn btn-ghost btn-small" data-action="go-settings">Settings</button>';
  html += '</div>';
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
  viewState.view = 'page';
  viewState.currentPage = 1;
  viewState.editMode = false;
  persist();
  render();
}

export function deleteJournal(id: string): void {
  const j = getJournal(id);
  if (!j) return;
  if (!confirm(`Delete "${j.title}"? This can't be undone.`)) return;
  appState.journals = appState.journals.filter(x => x.id !== id);
  if (appState.activeJournalId === id) appState.activeJournalId = null;
  persist();
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

export async function handleImportShared(): Promise<void> {
  const input = document.getElementById('import-share-input') as HTMLInputElement;
  if (!input) return;
  const token = input.value.trim();
  if (!token) return;
  try {
    const result = await importShared(token);
    const existing = appState.journals.findIndex(j => j.id === result.journalId);
    if (existing !== -1) {
      appState.journals[existing] = result.journal as Journal;
    } else {
      appState.journals.push(result.journal as Journal);
    }
    const shared = loadSharedJournals();
    const metaIdx = shared.findIndex(s => s.journalId === result.journalId);
    const meta = { shareToken: result.shareToken, journalId: result.journalId, permission: result.permission as 'edit' | 'view' };
    if (metaIdx !== -1) {
      shared[metaIdx] = meta;
    } else {
      shared.push(meta);
    }
    saveSharedJournals(shared);
    persist();
    render();
  } catch (err: any) {
    alert('Import failed: ' + err.message);
  }
}

export async function handleShareJournal(id: string): Promise<void> {
  const accountToken = loadAccountToken();
  if (!accountToken) {
    alert('Create a cloud backup first (Settings > Cloud Backup) to share decisions.');
    return;
  }
  try {
    // Sync to cloud first to ensure journal exists there
    const ownJournals = appState.journals.filter(j => isOwnJournal(j.id));
    await saveToCloud(accountToken, ownJournals);
    const token = await createShareToken(accountToken, id);
    const $content = document.getElementById('share-modal-content')!;
    $content.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:14px;font-weight:bold;margin-bottom:4px;">Full access (view + edit)</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <code id="share-token-edit" style="font-size:16px;padding:6px 10px;background:rgba(255,255,255,0.3);border-radius:4px;">${token}</code>
          <button class="btn btn-small" data-action="copy-share-edit">Copy</button>
        </div>
      </div>
      <div>
        <div style="font-size:14px;font-weight:bold;margin-bottom:4px;">View only</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <code id="share-token-view" style="font-size:16px;padding:6px 10px;background:rgba(255,255,255,0.3);border-radius:4px;">${token}-V</code>
          <button class="btn btn-small" data-action="copy-share-view">Copy</button>
        </div>
      </div>
    `;
    document.getElementById('share-modal')!.style.display = 'flex';
  } catch (err: any) {
    alert('Failed to create share link: ' + err.message);
  }
}
