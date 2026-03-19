import { appState, viewState, persist, getJournal, resetInterviewState, loadSharedJournals, canEdit, canDelete } from './state';
import { renderShelf, openJournal, deleteJournal, createJournal, createJournalFromAI, openJournalForAI, handleImportShared, handleShareJournal } from './render/shelf';
import { renderPageView, renderPageEdit, saveEdit, addChoice, removeChoice, deletePage } from './render/page';
import { renderMap } from './render/map';
import { renderInput, submitSituation, submitAnswer, skipInterview } from './render/input';
import { renderSettings, handleSaveApiKey, handleClearApiKey, handleGenerateAccountToken, handleSaveToCloud, handleLoadFromCloud, handleCopyAccountToken, handleDisconnectAccount, handleSetModel } from './render/settings';
import { renderBookmarks, addBookmark, removeBookmark } from './render/bookmarks';
import { regeneratePage } from './ai/client';
import { parseRegeneratedPage } from './ai/parser';
import { fetchSharedJournal } from './cloud';
import { esc } from './util';
import './style.css';

const $page = document.getElementById('page')!;
const $bookmarks = document.getElementById('bookmarks')!;
const $book = document.getElementById('book')!;
const $modal = document.getElementById('modal')!;
const $modalTitle = document.getElementById('modal-title') as HTMLInputElement;
const $aiModal = document.getElementById('ai-modal')!;
const $aiModalContent = document.getElementById('ai-modal-content')!;
const $shareModal = document.getElementById('share-modal')!;

export function render(): void {
  // Toggle cover curl visibility
  const isInterior = viewState.view !== 'shelf' && viewState.view !== 'settings';
  $book.classList.toggle('interior', isInterior);

  switch (viewState.view) {
    case 'shelf': renderShelf($page); break;
    case 'page': viewState.editMode ? renderPageEdit($page) : renderPageView($page); break;
    case 'map': renderMap($page); break;
    case 'input': renderInput($page); break;
    case 'settings': renderSettings($page); break;
  }
  renderBookmarks($bookmarks);
}

function showAiModal(): void {
  let html = '';

  // New decision option
  html += '<div style="margin-bottom:16px;">';
  html += '<label for="ai-modal-title" style="font-size:14px;color:var(--text-light);display:block;margin-bottom:6px;">Start a new decision</label>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<input type="text" id="ai-modal-title" class="edit-textarea choice-input" style="flex:1;height:40px;" placeholder="Should I take the job at StartupCo?">';
  html += '<button class="btn btn-primary" data-action="ai-new-journal">Go</button>';
  html += '</div>';
  html += '</div>';

  // Existing journals
  if (appState.journals.length > 0) {
    html += '<div style="border-top:1px solid var(--cream-dark);padding-top:14px;">';
    html += '<div style="font-size:14px;color:var(--text-light);margin-bottom:10px;">Or explore an existing decision</div>';
    html += '<ul class="shelf-list">';
    appState.journals.forEach(j => {
      const pageCount = Object.keys(j.pages).length;
      html += `<li class="shelf-item" data-action="ai-select-journal" data-id="${j.id}" style="padding:10px 12px;">
        <div>
          <div class="shelf-item-title">${esc(j.title)}</div>
          <div class="shelf-item-meta" style="font-size:inherit;">${pageCount} page${pageCount !== 1 ? 's' : ''}</div>
        </div>
      </li>`;
    });
    html += '</ul>';
    html += '</div>';
  }

  $aiModalContent.innerHTML = html;
  $aiModal.style.display = 'flex';
  setTimeout(() => {
    const input = document.getElementById('ai-modal-title') as HTMLInputElement;
    if (input) input.focus();
  }, 50);
}

// --- Event delegation ---
document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) return;
  const action = target.dataset.action!;

  switch (action) {
    case 'go-shelf':
      appState.activeJournalId = null;
      viewState.view = 'shelf';
      viewState.editMode = false;
      viewState.pageHistory = [];
      resetInterviewState();
      render();
      pushHistory();
      window.scrollTo(0, 0);
      break;
    case 'go-page': {
      const page = parseInt(target.dataset.page!);
      if (!isNaN(page)) {
        // Push current page to history if we're already viewing a page
        if (viewState.view === 'page') {
          viewState.pageHistory.push(viewState.currentPage);
        }
        viewState.currentPage = page;
        viewState.view = 'page';
        viewState.editMode = false;
        $page.innerHTML = '';
        requestAnimationFrame(() => { render(); window.scrollTo(0, 0); pushHistory(); });
      }
      break;
    }
    case 'go-back': {
      if (viewState.pageHistory.length > 0) {
        viewState.currentPage = viewState.pageHistory.pop()!;
        viewState.editMode = false;
        $page.innerHTML = '';
        requestAnimationFrame(() => { render(); window.scrollTo(0, 0); pushHistory(); });
      } else {
        appState.activeJournalId = null;
        viewState.view = 'shelf';
        viewState.editMode = false;
        render();
        pushHistory();
        window.scrollTo(0, 0);
      }
      break;
    }
    case 'go-map':
      viewState.view = 'map';
      viewState.editMode = false;
      render();
      pushHistory();
      window.scrollTo(0, 0);
      break;
    case 'go-input':
      resetInterviewState();
      viewState.view = 'input';
      render();
      pushHistory();
      window.scrollTo(0, 0);
      break;
    case 'go-settings':
      viewState.view = 'settings';
      render();
      pushHistory();
      window.scrollTo(0, 0);
      break;
    case 'enter-edit': {
      const j = getJournal();
      if (j && !canEdit(j.id)) break;
      viewState.editMode = true;
      render();
      window.scrollTo(0, 0);
      break;
    }
    case 'cancel-edit':
      viewState.editMode = false;
      render();
      window.scrollTo(0, 0);
      break;
    case 'save-edit':
      saveEdit();
      break;
    case 'add-choice':
      addChoice();
      break;
    case 'remove-choice': {
      const idx = parseInt(target.dataset.idx!);
      if (!isNaN(idx)) removeChoice(idx);
      break;
    }
    case 'delete-page': {
      const j = getJournal();
      if (j && !canDelete(j.id)) break;
      deletePage();
      break;
    }
    case 'add-bookmark': {
      const pg = parseInt(target.dataset.page!);
      if (!isNaN(pg)) addBookmark(pg);
      break;
    }
    case 'remove-bookmark': {
      e.stopPropagation();
      const pg = parseInt(target.dataset.page!);
      if (!isNaN(pg)) removeBookmark(pg);
      break;
    }
    case 'show-modal':
      $modal.style.display = 'flex';
      $modalTitle.value = '';
      setTimeout(() => $modalTitle.focus(), 50);
      break;
    case 'close-modal':
      $modal.style.display = 'none';
      break;
    case 'create-journal': {
      const title = $modalTitle.value.trim();
      if (!title) return;
      $modal.style.display = 'none';
      createJournal(title);
      pushHistory();
      break;
    }
    case 'show-ai-modal':
      showAiModal();
      break;
    case 'close-ai-modal':
      $aiModal.style.display = 'none';
      break;
    case 'ai-new-journal': {
      const input = document.getElementById('ai-modal-title') as HTMLInputElement;
      const title = input?.value.trim();
      if (!title) return;
      $aiModal.style.display = 'none';
      createJournalFromAI(title);
      pushHistory();
      break;
    }
    case 'ai-select-journal': {
      const id = target.dataset.id!;
      $aiModal.style.display = 'none';
      openJournalForAI(id);
      pushHistory();
      break;
    }
    case 'open-journal':
      openJournal(target.dataset.id!);
      pushHistory();
      window.scrollTo(0, 0);
      break;
    case 'delete-journal':
      e.stopPropagation();
      if (!canDelete(target.dataset.id!)) break;
      deleteJournal(target.dataset.id!);
      pushHistory();
      break;
    case 'submit-situation':
      submitSituation();
      break;
    case 'submit-answer':
      submitAnswer();
      break;
    case 'skip-interview':
      skipInterview();
      break;
    case 'save-api-key':
      handleSaveApiKey();
      break;
    case 'clear-api-key':
      handleClearApiKey();
      break;
    case 'regenerate-page':
      handleRegenerate();
      break;
    case 'undo-regenerate':
      handleUndo();
      break;
    case 'redo-regenerate':
      handleRedo();
      break;
    case 'fork-alternate':
      handleForkAlternate();
      break;
    case 'generate-account-token':
      handleGenerateAccountToken();
      break;
    case 'save-to-cloud':
      handleSaveToCloud();
      break;
    case 'load-from-cloud':
      handleLoadFromCloud();
      break;
    case 'copy-account-token':
      handleCopyAccountToken();
      break;
    case 'disconnect-account':
      handleDisconnectAccount();
      break;
    case 'set-model':
      handleSetModel(target.dataset.model || '');
      break;
    case 'import-shared':
      handleImportShared();
      break;
    case 'share-journal':
      handleShareJournal(target.dataset.id!);
      break;
    case 'close-share-modal':
      $shareModal.style.display = 'none';
      break;
    case 'copy-share-edit': {
      const el = document.getElementById('share-token-edit');
      if (el) navigator.clipboard.writeText(el.textContent || '');
      break;
    }
    case 'copy-share-view': {
      const el = document.getElementById('share-token-view');
      if (el) navigator.clipboard.writeText(el.textContent || '');
      break;
    }
  }
});

// Modal keyboard
$modalTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const title = $modalTitle.value.trim();
    if (!title) return;
    $modal.style.display = 'none';
    createJournal(title);
  }
  if (e.key === 'Escape') $modal.style.display = 'none';
});

// AI modal keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.metaKey) {
    const aiInput = document.getElementById('ai-modal-title') as HTMLInputElement;
    if (aiInput && aiInput === document.activeElement) {
      const title = aiInput.value.trim();
      if (!title) return;
      $aiModal.style.display = 'none';
      createJournalFromAI(title);
    }
  }
  if (e.key === 'Escape') {
    if ($aiModal.style.display !== 'none') $aiModal.style.display = 'none';
  }

  // Cmd+Enter in interview
  if (e.key === 'Enter' && e.metaKey) {
    const situationInput = document.getElementById('situation-input');
    if (situationInput === document.activeElement) {
      submitSituation();
    }
    const answerInput = document.getElementById('interview-answer');
    if (answerInput === document.activeElement) {
      submitAnswer();
    }
  }
});

async function handleRegenerate(): Promise<void> {
  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg) return;

  const origContent = pg.content;
  pg.content = 'Regenerating...';
  render();

  try {
    const result = await regeneratePage(origContent, j.situation || j.title);
    const parsed = parseRegeneratedPage(result);
    if (!pg.contentHistory) pg.contentHistory = [];
    // Truncate any redo history beyond current index
    if (pg.contentHistoryIndex !== undefined) {
      pg.contentHistory = pg.contentHistory.slice(0, pg.contentHistoryIndex + 1);
    }
    pg.contentHistory.push(origContent);
    pg.contentHistoryIndex = pg.contentHistory.length - 1;
    pg.content = parsed.content;
    pg.confidence = parsed.confidence;
    pg.source = 'ai';
    persist();
  } catch (e: any) {
    pg.content = origContent;
  }
  render();
}

function handleUndo(): void {
  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg || !pg.contentHistory || pg.contentHistoryIndex === undefined || pg.contentHistoryIndex < 0) return;

  // Save current content as redo target
  if (pg.contentHistoryIndex === pg.contentHistory.length - 1) {
    pg.contentHistory.push(pg.content);
  } else {
    pg.contentHistory[pg.contentHistoryIndex + 1] = pg.content;
  }
  pg.content = pg.contentHistory[pg.contentHistoryIndex];
  pg.contentHistoryIndex--;
  persist();
  render();
}

function handleRedo(): void {
  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg || !pg.contentHistory || pg.contentHistoryIndex === undefined) return;

  const nextIndex = pg.contentHistoryIndex + 2;
  if (nextIndex >= pg.contentHistory.length) return;

  pg.contentHistoryIndex++;
  pg.content = pg.contentHistory[nextIndex];
  persist();
  render();
}

function handleForkAlternate(): void {
  const j = getJournal();
  if (!j) return;
  const pg = j.pages[viewState.currentPage];
  if (!pg || !pg.contentHistory || pg.contentHistoryIndex === undefined) return;

  // The previous version becomes a new alternate page
  const prevContent = pg.contentHistory[pg.contentHistoryIndex >= 0 ? pg.contentHistoryIndex : 0];
  if (!prevContent) return;

  const nextPageNum = Object.keys(j.pages).map(Number).reduce((a, b) => Math.max(a, b), 0) + 1;
  j.pages[nextPageNum] = {
    content: prevContent,
    choices: [],
    isEnding: pg.isEnding,
    type: pg.type,
    source: pg.source,
    confidence: pg.confidence,
  };

  pg.forkedAlternate = true;

  // Find parent pages that link to current page and add alternate path
  const currentPageNum = viewState.currentPage;
  Object.values(j.pages).forEach(p => {
    if (p.choices) {
      const linksHere = p.choices.some(c => c.page === currentPageNum);
      if (linksHere) {
        p.choices.push({ text: 'An alternate path', page: nextPageNum });
      }
    }
  });

  persist();
  render();
}

// --- History API for browser back/forward ---
interface HistoryEntry {
  view: string;
  journalId: string | null;
  page: number;
  editMode: boolean;
}

function currentHistoryState(): HistoryEntry {
  return {
    view: viewState.view,
    journalId: appState.activeJournalId,
    page: viewState.currentPage,
    editMode: viewState.editMode,
  };
}

function pushHistory(): void {
  const state = currentHistoryState();
  const url = stateToUrl(state);
  history.pushState(state, '', url);
}

function replaceHistory(): void {
  const state = currentHistoryState();
  const url = stateToUrl(state);
  history.replaceState(state, '', url);
}

function stateToUrl(state: HistoryEntry): string {
  if (state.view === 'shelf') return '/';
  if (state.view === 'map' && state.journalId) return `/?j=${state.journalId}&v=map`;
  if (state.view === 'input' && state.journalId) return `/?j=${state.journalId}&v=input`;
  if (state.view === 'settings') return '/?v=settings';
  if (state.view === 'page' && state.journalId) return `/?j=${state.journalId}&p=${state.page}`;
  return '/';
}

window.addEventListener('popstate', (e) => {
  const state = e.state as HistoryEntry | null;
  if (!state) {
    appState.activeJournalId = null;
    viewState.view = 'shelf';
    viewState.editMode = false;
    viewState.pageHistory = [];
    render();
    window.scrollTo(0, 0);
    return;
  }

  appState.activeJournalId = state.journalId;
  viewState.view = state.view as any;
  viewState.currentPage = state.page;
  viewState.editMode = state.editMode;
  render();
  window.scrollTo(0, 0);
});

// Init — parse URL or default to shelf
function initFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const journalId = params.get('j');
  const pageNum = params.get('p');
  const view = params.get('v');

  if (journalId && appState.journals.some(j => j.id === journalId)) {
    appState.activeJournalId = journalId;
    if (view === 'map') {
      viewState.view = 'map';
    } else if (view === 'input') {
      viewState.view = 'input';
    } else if (pageNum) {
      viewState.view = 'page';
      viewState.currentPage = parseInt(pageNum) || 1;
    } else {
      viewState.view = 'page';
      viewState.currentPage = 1;
    }
  } else if (view === 'settings') {
    viewState.view = 'settings';
  } else {
    viewState.view = 'shelf';
  }
}

async function syncSharedJournals(): Promise<void> {
  const shared = loadSharedJournals();
  if (shared.length === 0) return;
  let updated = false;
  for (const meta of shared) {
    try {
      const journal = await fetchSharedJournal(meta.shareToken);
      const idx = appState.journals.findIndex(j => j.id === meta.journalId);
      if (idx !== -1) {
        appState.journals[idx] = journal;
        updated = true;
      }
    } catch {
      // Silent failure — keep cached version
    }
  }
  if (updated) {
    persist();
    render();
  }
}

initFromUrl();
render();
replaceHistory();
syncSharedJournals();
