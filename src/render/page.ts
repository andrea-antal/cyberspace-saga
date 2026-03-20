import { viewState, getJournal, nextPageNum, persist, BM_COLORS, canEdit, getSharedMeta } from '../state';
import { render } from '../main';
import { esc, escAttr } from '../util';
import type { Page } from '../types';
import { updateShared } from '../cloud';

let _pendingKernelText: string | null = null;

export function getPendingKernelText(): string | null { return _pendingKernelText; }
export function clearPendingKernelText(): void { _pendingKernelText = null; }

function renderKernelView($page: HTMLElement): void {
  const j = getJournal();
  if (!j) { viewState.view = 'shelf'; render(); return; }

  let html = '<div class="nav-bar">';
  html += '<span></span>';
  html += `<span class="nav-title" data-action="go-map">${esc(j.title)}</span>`;
  html += '</div>';

  const kernelText = j.situation || 'No situation recorded for this adventure.';
  html += `<div class="page-content page-paper-fact">${esc(kernelText)}</div>`;

  html += '<div class="page-choices">';
  html += '<div class="page-choice">';
  html += '&#10040; Begin the adventure, ';
  html += '<a data-action="go-page" data-page="1"><span class="turn-text">turn to page 1.</span></a>';
  html += '</div>';
  html += '</div>';

  html += '<div class="page-actions">';
  if (canEdit(j.id)) {
    html += '<button class="btn-link" data-action="enter-edit">Edit</button>';
  }
  html += '</div>';

  html += '<div class="page-number">&mdash; 0 &mdash;</div>';
  $page.innerHTML = html;
}

function renderKernelEdit($page: HTMLElement): void {
  const j = getJournal();
  if (!j) return;
  if (!canEdit(j.id)) {
    viewState.editMode = false;
    renderKernelView($page);
    return;
  }

  let html = '<div class="edit-bar">';
  html += '<span class="nav-link" data-action="cancel-edit">&larr; Cancel</span>';
  html += '<button class="btn btn-primary btn-small" data-action="save-edit">Done</button>';
  html += '</div>';

  html += `<textarea class="edit-textarea" id="edit-content" style="min-height:200px" placeholder="Describe your situation...">${esc(j.situation || '')}</textarea>`;

  html += '<div class="page-number">&mdash; 0 &mdash;</div>';
  $page.innerHTML = html;
}

export function saveKernelEdit(): void {
  const j = getJournal();
  if (!j) return;

  const contentEl = document.getElementById('edit-content') as HTMLTextAreaElement;
  if (!contentEl) return;

  const newText = contentEl.value.trim();
  const oldText = (j.situation || '').trim();

  if (newText === oldText) {
    viewState.editMode = false;
    render();
    return;
  }

  _pendingKernelText = newText;
  const modal = document.getElementById('regen-modal');
  if (modal) modal.style.display = 'flex';
}

export function renderPageView($page: HTMLElement): void {
  const j = getJournal();
  if (!j) { viewState.view = 'shelf'; render(); return; }

  if (viewState.currentPage === 0) { renderKernelView($page); return; }

  const pg = j.pages[viewState.currentPage];
  if (!pg) { viewState.view = 'shelf'; render(); return; }

  const prevPage = viewState.pageHistory.length > 0
    ? viewState.pageHistory[viewState.pageHistory.length - 1]
    : null;

  let html = '<div class="nav-bar">';
  if (prevPage !== null) {
    html += `<span class="nav-link" data-action="go-back">&larr; p.${prevPage}</span>`;
  } else if (viewState.currentPage === 1) {
    html += `<span class="nav-link" data-action="go-page" data-page="0">&larr; p.0</span>`;
  } else {
    html += '<span></span>';
  }
  html += `<span class="nav-title" data-action="go-map">${esc(j.title)}</span>`;
  html += '</div>';

  // Page type indicator
  if (pg.type && pg.type !== 'fact') {
    const label = pg.type === 'decision' ? 'Decision point' : pg.type === 'scenario' ? 'One possible future' : 'Ending';
    html += `<div class="page-type-indicator type-${pg.type}">${label}`;
    if (pg.confidence && pg.type === 'scenario') {
      html += ` <span class="confidence-badge confidence-${pg.confidence}">${pg.confidence} confidence</span>`;
    }
    html += '</div>';
  }
  if (pg.type === 'fact' && pg.source !== 'user') {
    html += '<div class="page-type-indicator type-fact">Based on what you shared</div>';
  }


  const pageClass = `page-content page-paper-${pg.type || 'fact'}`;
  if (pg.content) {
    html += `<div class="${pageClass}">${esc(pg.content)}</div>`;
  } else {
    html += `<div class="${pageClass} empty">This page is blank. What happens on this path?</div>`;
  }

  if (pg.choices && pg.choices.length > 0) {
    html += '<div class="page-choices">';
    pg.choices.forEach(c => {
      html += `<div class="page-choice">`;
      html += `&#10040; ${esc(c.text)}, `;
      html += `<a data-action="go-page" data-page="${c.page}"><span class="turn-text">turn to page ${c.page}.</span></a>`;
      html += `</div>`;
    });
    html += '</div>';
  }

  if (pg.isEnding) {
    html += '<div class="page-ending">THE END</div>';
  }

  html += '<div class="page-actions">';
  if (canEdit(j.id)) {
    html += `<button class="btn-link" data-action="enter-edit">Edit</button>`;
    if (pg.source !== 'user' && pg.type === 'scenario') {
      html += ` <button class="btn-link" data-action="regenerate-page">Regenerate</button>`;
      const canUndo = pg.contentHistory && pg.contentHistoryIndex !== undefined && pg.contentHistoryIndex >= 0;
      const canRedo = pg.contentHistory && pg.contentHistoryIndex !== undefined && pg.contentHistoryIndex + 2 < pg.contentHistory.length;
      if (canUndo) {
        html += ` <button class="btn-link" data-action="undo-regenerate">Undo</button>`;
        if (!pg.forkedAlternate) {
          html += ` <button class="btn-link" data-action="fork-alternate">Keep both</button>`;
        }
      }
      if (canRedo) {
        html += ` <button class="btn-link" data-action="redo-regenerate">Redo</button>`;
      }
    }
  }
  const isBookmarked = j.bookmarks && j.bookmarks.includes(viewState.currentPage);
  if (isBookmarked) {
    html += `<button class="btn-link" data-action="remove-bookmark" data-page="${viewState.currentPage}">Release page ${viewState.currentPage}</button>`;
  } else if (!j.bookmarks || j.bookmarks.length < BM_COLORS) {
    html += `<button class="btn-link" data-action="add-bookmark" data-page="${viewState.currentPage}">Hold this page</button>`;
  }
  html += '</div>';

  html += `<div class="page-number">&mdash; ${viewState.currentPage} &mdash;</div>`;

  $page.innerHTML = html;
}

export function renderPageEdit($page: HTMLElement): void {
  if (viewState.currentPage === 0) { renderKernelEdit($page); return; }

  const j = getJournal();
  if (!j) return;
  if (!canEdit(j.id)) {
    viewState.editMode = false;
    renderPageView($page);
    return;
  }
  const pg = j.pages[viewState.currentPage];
  if (!pg) return;

  let html = '<div class="edit-bar">';
  html += `<span class="nav-link" data-action="cancel-edit">&larr; Cancel</span>`;
  html += `<button class="btn btn-primary btn-small" data-action="save-edit">Done</button>`;
  html += '</div>';

  html += `<textarea class="edit-textarea" id="edit-content" placeholder="What happens on this path? Write your thoughts, consequences, feelings...">${esc(pg.content || '')}</textarea>`;

  html += '<div style="margin-top:18px">';
  html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:8px;font-weight:bold;">Paths from here:</div>';

  if (pg.choices) {
    pg.choices.forEach((c, i) => {
      html += `<div class="edit-choice-row">
        <input class="edit-textarea choice-input" style="flex:1" value="${escAttr(c.text)}" data-choice-idx="${i}" placeholder="If you decide to...">
        <span class="choice-page-num">&rarr; p.${c.page}</span>
        <button class="btn btn-small btn-danger" data-action="remove-choice" data-idx="${i}" title="Remove">&times;</button>
      </div>`;
    });
  }
  html += `<button class="btn btn-small btn-ghost" data-action="add-choice">+ Add a path</button>`;
  html += '</div>';

  html += `<label class="ending-check">
    <input type="checkbox" id="edit-ending" ${pg.isEnding ? 'checked' : ''}>
    This is an ending
  </label>`;

  if (viewState.currentPage !== 1) {
    html += `<div style="margin-top:18px;text-align:right;">`;
    html += `<button class="btn btn-small btn-danger" data-action="delete-page">Delete this page</button>`;
    html += `</div>`;
  }

  html += `<div class="page-number">&mdash; ${viewState.currentPage} &mdash;</div>`;

  $page.innerHTML = html;
}

export function saveEdit(): void {
  if (viewState.currentPage === 0) { saveKernelEdit(); return; }

  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg) return;

  const contentEl = document.getElementById('edit-content') as HTMLTextAreaElement;
  if (contentEl) pg.content = contentEl.value;
  const endingEl = document.getElementById('edit-ending') as HTMLInputElement;
  if (endingEl) pg.isEnding = endingEl.checked;

  // Mark as user-edited if was AI
  if (pg.source === 'ai') pg.source = 'ai-edited';

  document.querySelectorAll<HTMLInputElement>('[data-choice-idx]').forEach(input => {
    const idx = parseInt(input.dataset.choiceIdx!);
    if (pg.choices[idx]) pg.choices[idx].text = input.value;
  });

  persist();
  // Sync shared journal edits back to cloud
  const sharedMeta = getSharedMeta(j.id);
  if (sharedMeta && sharedMeta.permission === 'edit') {
    updateShared(sharedMeta.shareToken, j).catch(() => {});
  }
  viewState.editMode = false;
  render();
}

function saveCurrentEdits(): void {
  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg) return;

  const contentEl = document.getElementById('edit-content') as HTMLTextAreaElement;
  if (contentEl) pg.content = contentEl.value;
  const endingEl = document.getElementById('edit-ending') as HTMLInputElement;
  if (endingEl) pg.isEnding = endingEl.checked;
  document.querySelectorAll<HTMLInputElement>('[data-choice-idx]').forEach(input => {
    const idx = parseInt(input.dataset.choiceIdx!);
    if (pg.choices[idx]) pg.choices[idx].text = input.value;
  });
}

export function addChoice(): void {
  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg) return;
  if (!pg.choices) pg.choices = [];

  saveCurrentEdits();

  const newPageNum = nextPageNum(j);
  pg.choices.push({ text: 'If you decide to...', page: newPageNum });
  j.pages[newPageNum] = { content: '', choices: [], isEnding: false, type: 'decision', source: 'user' };
  persist();
  render();
}

export function removeChoice(idx: number): void {
  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg) return;

  saveCurrentEdits();

  const removed = pg.choices.splice(idx, 1)[0];
  if (removed) {
    const targetPage = j.pages[removed.page];
    if (targetPage && !targetPage.content && (!targetPage.choices || targetPage.choices.length === 0)) {
      const hasOtherRef = Object.values(j.pages).some(p =>
        p.choices && p.choices.some(c => c.page === removed.page)
      );
      if (!hasOtherRef) {
        delete j.pages[removed.page];
        if (j.bookmarks) j.bookmarks = j.bookmarks.filter(b => b !== removed.page);
      }
    }
  }

  persist();
  render();
}

export function deletePage(): void {
  if (viewState.currentPage === 1) return;
  const j = getJournal();
  if (!j) return;
  if (!confirm('Delete this page?')) return;

  Object.values(j.pages).forEach(pg => {
    if (pg.choices) {
      pg.choices = pg.choices.filter(c => c.page !== viewState.currentPage);
    }
  });
  delete j.pages[viewState.currentPage];
  if (j.bookmarks) j.bookmarks = j.bookmarks.filter(b => b !== viewState.currentPage);

  persist();
  viewState.editMode = false;
  viewState.view = 'shelf';
  render();
}
