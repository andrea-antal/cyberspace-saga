import { appState, viewState, persist, getJournal, resetInterviewState, loadSharedJournals, saveSharedJournals, loadAccountToken, saveAccountToken, loadApiKey, isOwnJournal, canEdit, canDelete, isGuideDismissed, dismissGuide, saveApiKey, saveCoverPref, saveHideCoverArt, standaloneIds, loadThemePref, loadFontPref, saveLlmMode } from './state';
import type { Journal } from './types';
import { renderShelf, openJournal, deleteJournal, createJournal, createJournalFromAI, openJournalForAI, handleShareJournal, toggleShelfManaging } from './render/shelf';
import { renderPageView, renderPageEdit, saveEdit, addChoice, removeChoice, deletePage, getPendingKernelText, clearPendingKernelText, handleToggleLike } from './render/page';
import { renderMap } from './render/map';
import { renderInput, submitSituation, submitAnswer, skipInterview, regenerateFromKernel } from './render/input';
import { renderSettings, handleSaveApiKey, handleClearApiKey, handleToggleByokModel, handleToggleRememberKey, handleToggleGuide, handleSelectTheme, handleSelectFont, applyTheme, applyFont, handleSaveProfile, showDeleteProfileModal, closeDeleteProfileModal, confirmDeleteProfile, handleRestoreProfile, loadProfileIntoForm } from './render/settings';
import { renderLeaderboard } from './render/leaderboard';
import { renderProfile } from './render/profile';
import { renderBookmarks, addBookmark, removeBookmark } from './render/bookmarks';
import { regeneratePage } from './ai/client';
import { parseRegeneratedPage } from './ai/parser';
import { fetchSharedJournal, importShared, createSlug, resolveSlug, unpublishSlug } from './cloud';
import { esc } from './util';
import { syncToCloudIfNeeded, flushSync } from './sync';
import { exportJSON, exportMarkdown, exportHTML, exportPDF } from './export';
import './style.css';

const $page = document.getElementById('page')!;
const $bookmarks = document.getElementById('bookmarks')!;
const $book = document.getElementById('book')!;
const $modal = document.getElementById('modal')!;
const $modalTitle = document.getElementById('modal-title') as HTMLInputElement;
const $aiModal = document.getElementById('ai-modal')!;
const $aiModalContent = document.getElementById('ai-modal-content')!;
const $shareModal = document.getElementById('share-modal')!;
const $renameModal = document.getElementById('rename-modal')!;
const $renameModalTitle = document.getElementById('rename-modal-title') as HTMLInputElement;
const $deleteModal = document.getElementById('delete-modal')!;
const $deleteModalTitle = document.getElementById('delete-modal-title')!;
const $regenModal = document.getElementById('regen-modal')!;
const $faqModal = document.getElementById('faq-modal')!;
const $faqModalContent = document.getElementById('faq-modal-content')!;
const $editNavigateModal = document.getElementById('edit-navigate-modal')!;
const $editNavigateTarget = document.getElementById('edit-navigate-target')!;
let pendingDeleteId: string | null = null;
let pendingRenameId: string | null = null;
let activeProfileUsername: string | null = null;
let pendingEditNavigatePage: number | null = null;
let pendingAdventureTitle: string | null = null;

function cleanupStandalone(): void {
  if (standaloneIds.size === 0) return;
  appState.journals = appState.journals.filter(j => !standaloneIds.has(j.id));
  standaloneIds.clear();
}

async function handlePublishSlug(journalId: string): Promise<void> {
  const accountToken = loadAccountToken();
  if (!accountToken) return;
  const slugInput = document.getElementById('share-slug-input') as HTMLInputElement;
  const btn = document.getElementById('publish-slug-btn') as HTMLButtonElement;
  const status = document.getElementById('slug-status')!;
  const result = document.getElementById('slug-result')!;
  const urlEl = document.getElementById('share-url-standalone')!;
  if (!slugInput) return;

  const slug = slugInput.value.trim();
  if (!slug) { status.textContent = 'Enter a name first.'; return; }
  if (slug.length < 3) { status.textContent = 'Must be at least 3 characters.'; return; }

  btn.textContent = 'Publishing...';
  btn.disabled = true;
  status.textContent = '';

  try {
    const unlistedCheckbox = document.getElementById('share-unlisted') as HTMLInputElement | null;
    const unlistedVal = unlistedCheckbox ? unlistedCheckbox.checked : false;
    const data = await createSlug(accountToken, journalId, slug, unlistedVal);
    const finalUrl = `${window.location.origin}/${data.slug}`;
    urlEl.textContent = finalUrl;
    result.style.display = 'block';
    const unlistedToggle = document.getElementById('unlisted-toggle');
    if (unlistedToggle) unlistedToggle.style.display = '';
    slugInput.value = data.slug;
    if (data.slug !== slug) {
      status.textContent = 'Name was taken — a suffix was added.';
    } else {
      status.textContent = 'Published!';
    }
    btn.textContent = 'Update';
    btn.disabled = false;
  } catch (err: any) {
    status.textContent = err.message || 'Failed to publish.';
    btn.textContent = 'Publish';
    btn.disabled = false;
  }
}

export function render(): void {
  const isInterior = viewState.view !== 'shelf';
  $book.classList.toggle('interior', isInterior);

  switch (viewState.view) {
    case 'shelf': renderShelf($page); break;
    case 'page': viewState.editMode ? renderPageEdit($page) : renderPageView($page); break;
    case 'map': renderMap($page); break;
    case 'input': renderInput($page); break;
    case 'settings': renderSettings($page); loadProfileIntoForm(); break;
    case 'leaderboard': renderLeaderboard($page); break;
    case 'profile': if (activeProfileUsername) renderProfile($page, activeProfileUsername); break;
  }
  if (isInterior && !viewState.editMode) {
    $page.insertAdjacentHTML('afterbegin', '<div class="mobile-back" data-action="go-shelf">&larr; Back to cover</div>');
  }
  renderBookmarks($bookmarks);
}

function showAiModal(): void {
  let html = '';

  html += '<div style="margin-bottom:16px;">';
  html += '<div style="display:flex;gap:8px;">';
  html += '<input type="text" id="ai-modal-title" class="edit-textarea choice-input" style="flex:1;height:40px;" placeholder="Should I take the job at StartupCo?">';
  html += '<button class="btn btn-primary btn-small" data-action="ai-modal-next">Go</button>';
  html += '</div>';
  html += '</div>';

  if (appState.journals.length > 0) {
    html += '<div style="border-top:1px solid var(--cream-dark);padding-top:14px;">';
    html += '<div style="font-size:14px;color:var(--text-light);margin-bottom:10px;">Explore an existing adventure</div>';
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

function showAiModalStep2(title: string): void {
  pendingAdventureTitle = title;
  const showGuide = !isGuideDismissed();

  let html = '';
  html += `<div style="font-size:15pt;font-weight:bold;margin-bottom:16px;color:var(--text);">&#10040; ${esc(title)}</div>`;

  if (showGuide) {
    html += '<div style="font-size:15px;font-weight:bold;margin-bottom:12px;">How do you want to explore this?</div>';

    html += '<div style="margin-bottom:14px;padding:14px;background:rgba(255,255,255,0.3);border-radius:6px;">';
    html += '<div style="font-size:14px;font-weight:bold;margin-bottom:4px;">AI-Guided <span style="font-size:12px;font-weight:normal;color:var(--text-light);">(recommended)</span></div>';
    html += '<div style="font-size:14px;color:var(--text-light);line-height:1.4;">Tell AI about your situation. It\'ll ask clarifying questions, then generate a branching map of plausible scenarios and outcomes -- including paths you might not think to explore on your own.</div>';
    html += '</div>';

    html += '<div style="margin-bottom:16px;padding:14px;background:rgba(255,255,255,0.3);border-radius:6px;">';
    html += '<div style="font-size:14px;font-weight:bold;margin-bottom:4px;">Build Manually</div>';
    html += '<div style="font-size:14px;color:var(--text-light);line-height:1.4;">Create pages and link them together yourself. You\'re in full control of every scenario and branch.</div>';
    html += '</div>';
  }

  html += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
  html += '<button class="btn btn-ghost" data-action="start-manual">Build Manually</button>';
  html += '<button class="btn btn-primary" data-action="start-ai">AI-Guided</button>';
  html += '</div>';

  if (showGuide) {
    html += '<div style="text-align:center;margin-top:12px;">';
    html += '<button class="btn-link" style="font-size:12px;color:var(--text-light);" data-action="dismiss-guide">Don\'t show this again</button>';
    html += '</div>';
  }

  $aiModalContent.innerHTML = html;
}

function showFaqModal(openSection?: string): void {
  const p = 'style="font-size:14px;color:var(--text-light);margin:10px 0 0;line-height:1.4;"';
  let html = '';

  html += `<details class="shelf-intro-item"${openSection ? '' : ' open'}><summary class="shelf-intro-heading">What is this?</summary>`;
  html += `<p ${p}>A decision journal styled like an interactive gamebook. Each choice branches into a different scenario, so you can see where your options might lead before you commit.</p>`;
  html += '</details>';

  html += `<details class="shelf-intro-item"><summary class="shelf-intro-heading">How does it work?</summary>`;
  html += `<p ${p}>Build your decision tree by hand, or let AI interview you about your situation and generate a branching map of plausible futures you might not have thought of.</p>`;
  html += '</details>';

  html += `<details class="shelf-intro-item"><summary class="shelf-intro-heading">How does the AI work?</summary>`;
  html += `<p ${p}>By default, this app uses Claude (by Anthropic). When you choose the AI-guided path, the AI reads your situation, asks you follow-up questions to understand the nuances, and then generates a branching tree of plausible scenarios.</p>`;
  html += `<p ${p}>Generation can take 15-30 seconds -- the AI is thinking through multiple branching paths and writing out each scenario, so it's doing a lot of work behind the scenes. The interview step helps it ask better questions and produce more relevant results.</p>`;
  html += `<p ${p}>To use AI features, bring your own API key in Settings. We support both Anthropic and OpenAI keys -- the app detects which provider you're using from the key format.</p>`;
  html += `<p ${p}>Different AI models have different personalities. Claude tends to be more direct and willing to name uncomfortable truths, while OpenAI models may hedge more or add caveats on sensitive topics. Both produce useful results, but the tone and level of frankness can vary -- so if you switch providers and the output feels different, that's expected.</p>`;
  html += '</details>';

  html += `<details class="shelf-intro-item" id="faq-terms"><summary class="shelf-intro-heading">Terms & Conditions</summary>`;
  html += `<p ${p}>This is a personal tool for exploring decisions. The AI-generated scenarios are hypothetical thought exercises, not professional advice -- please don't treat them as predictions or recommendations.</p>`;
  html += `<p ${p}>The service is provided as-is. We do our best to keep things running smoothly, but we can't guarantee uptime or that your data will be preserved forever.</p>`;
  html += `<p ${p}><strong>Your content:</strong> We don't claim any rights to the adventures you create. You're free to use, share, or publish them however you like -- but keep in mind that AI-generated content may have limited copyright protection, and you're responsible for how you use it.</p>`;
  html += `<p ${p}><strong>API keys:</strong> If you bring your own API key, it's stored in your browser's session storage and automatically forgotten when you close the tab. It only persists across sessions if you explicitly opt in. You can remove it anytime from Settings. When you generate, your key is proxied through our server to reach the provider -- we never log or store it.</p>`;
  html += `<p ${p}><strong>Third-party AI providers:</strong> If you use your own API key (Anthropic or OpenAI), you're also subject to that provider's terms of service.</p>`;
  html += '</details>';

  html += `<details class="shelf-intro-item"><summary class="shelf-intro-heading">Privacy Policy</summary>`;
  html += `<p ${p}><strong>Your data:</strong> Your adventures are stored in your browser's local storage. If you set up cloud backup, they are also stored on our servers.</p>`;
  html += `<p ${p}><strong>API keys:</strong> Your API key is stored in your browser's session storage and automatically forgotten when you close the tab. It only persists across sessions if you explicitly opt in. When you generate, your key is proxied through our server to reach the provider -- we never log or store it.</p>`;
  html += `<p ${p}><strong>Data deletion:</strong> You can clear your local data anytime by clearing your browser storage. To have your server-side data removed, contact us at <a href="mailto:andrea@yoursaga.cc?subject=Data%20Deletion%20Request" style="color:var(--choice-red);">andrea@yoursaga.cc</a> and we'll delete it.</p>`;
  html += '</details>';

  html += `<details class="shelf-intro-item"><summary class="shelf-intro-heading">Who made this?</summary>`;
  html += `<p ${p}>This app was built by <a href="https://drealabs.com" target="_blank" style="color:var(--choice-red);">DREA LABS</a>. The source code is available as a public repo: <a href="https://github.com/andrea-antal/cyberspace-saga" target="_blank" style="color:var(--choice-red);">cyberspace-saga</a>.</p>`;
  html += `<p ${p}>Questions or feedback? Reach out at <a href="mailto:andrea@yoursaga.cc?subject=Feedback%3A%20yoursaga.cc" style="color:var(--choice-red);">andrea@yoursaga.cc</a>.</p>`;
  html += `<p ${p}>The public version is released under the <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" style="color:var(--choice-red);">Creative Commons Attribution-NonCommercial-ShareAlike 4.0</a> license. You're free to explore the code, learn from it, fork it, and build on it for non-commercial purposes -- just give credit and share your changes under the same license.</p>`;
  html += '</details>';

  $faqModalContent.innerHTML = html;
  $faqModal.style.display = 'flex';

  if (openSection) {
    const el = document.getElementById(openSection);
    if (el) {
      el.setAttribute('open', '');
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// --- Click outside modal to close ---
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      (overlay as HTMLElement).style.display = 'none';
      pendingDeleteId = null;
      pendingEditNavigatePage = null;
      pendingAdventureTitle = null;
      clearPendingKernelText();
    }
  });
});

// --- Cover group accordion ---
document.addEventListener('toggle', (e) => {
  const details = e.target as HTMLDetailsElement;
  if (!details.classList.contains('cover-group') || !details.open) return;
  document.querySelectorAll<HTMLDetailsElement>('details.cover-group').forEach(d => {
    if (d !== details) d.removeAttribute('open');
  });
}, true);

// --- Event delegation ---
document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) return;
  const action = target.dataset.action!;

  switch (action) {
    case 'standalone-begin':
      viewState.view = 'page';
      viewState.currentPage = 1;
      viewState.editMode = false;
      viewState.pageHistory = [];
      render();
      pushHistory();
      window.scrollTo(0, 0);
      break;
    case 'go-shelf':
      cleanupStandalone();
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
      } else if (appState.activeJournalId && standaloneIds.has(appState.activeJournalId)) {
        viewState.view = 'shelf';
        viewState.editMode = false;
        render();
        pushHistory();
        window.scrollTo(0, 0);
      } else {
        cleanupStandalone();
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
      if (target.dataset.scroll) {
        document.getElementById(target.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo(0, 0);
      }
      break;
    case 'go-leaderboard':
      viewState.view = 'leaderboard';
      render();
      pushHistory();
      window.scrollTo(0, 0);
      break;
    case 'manage-shelf':
      toggleShelfManaging();
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
      pendingAdventureTitle = null;
      break;
    case 'show-faq-modal':
      showFaqModal();
      break;
    case 'show-faq-terms':
      showFaqModal('faq-terms');
      break;
    case 'close-faq-modal':
      $faqModal.style.display = 'none';
      break;
    case 'ai-modal-next': {
      const input = document.getElementById('ai-modal-title') as HTMLInputElement;
      const title = input?.value.trim();
      if (!title) return;
      showAiModalStep2(title);
      break;
    }
    case 'start-ai': {
      if (!pendingAdventureTitle) return;
      $aiModal.style.display = 'none';
      createJournalFromAI(pendingAdventureTitle);
      pendingAdventureTitle = null;
      requestAnimationFrame(() => { window.scrollTo(0, 0); pushHistory(); });
      break;
    }
    case 'start-manual': {
      if (pendingAdventureTitle) {
        $aiModal.style.display = 'none';
        createJournal(pendingAdventureTitle);
        pendingAdventureTitle = null;
        requestAnimationFrame(() => { window.scrollTo(0, 0); pushHistory(); });
      } else {
        const j = getJournal();
        if (j) {
          const situationInput = document.getElementById('situation-input') as HTMLTextAreaElement;
          if (situationInput && situationInput.value.trim()) {
            j.situation = situationInput.value.trim();
          }
          persist();
          syncToCloudIfNeeded();
        }
        viewState.view = 'page';
        viewState.currentPage = 1;
        viewState.editMode = true;
        render();
        pushHistory();
        window.scrollTo(0, 0);
      }
      break;
    }
    case 'dismiss-guide': {
      dismissGuide();
      if (pendingAdventureTitle) showAiModalStep2(pendingAdventureTitle);
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
    case 'rename-journal': {
      const renameId = target.dataset.id!;
      if (!isOwnJournal(renameId)) break;
      const rj = getJournal(renameId);
      if (!rj) break;
      pendingRenameId = renameId;
      $renameModalTitle.value = rj.title;
      $renameModal.style.display = 'flex';
      setTimeout(() => { $renameModalTitle.focus(); $renameModalTitle.select(); }, 50);
      break;
    }
    case 'close-rename-modal':
      pendingRenameId = null;
      $renameModal.style.display = 'none';
      break;
    case 'confirm-rename': {
      const newTitle = $renameModalTitle.value.trim();
      if (pendingRenameId && newTitle) {
        const rj = getJournal(pendingRenameId);
        if (rj && newTitle !== rj.title) {
          rj.title = newTitle;
          persist();
          syncToCloudIfNeeded();
          render();
        }
      }
      pendingRenameId = null;
      $renameModal.style.display = 'none';
      break;
    }
    case 'delete-journal': {
      e.stopPropagation();
      const delId = target.dataset.id!;
      if (!canDelete(delId)) break;
      const delJournal = getJournal(delId);
      if (!delJournal) break;
      pendingDeleteId = delId;
      $deleteModalTitle.textContent = delJournal.title;
      $deleteModal.style.display = 'flex';
      break;
    }
    case 'close-delete-modal':
      pendingDeleteId = null;
      $deleteModal.style.display = 'none';
      break;
    case 'confirm-delete':
      if (pendingDeleteId) {
        deleteJournal(pendingDeleteId);
        pushHistory();
      }
      pendingDeleteId = null;
      $deleteModal.style.display = 'none';
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
    case 'save-profile':
      handleSaveProfile();
      break;
    case 'delete-profile':
      showDeleteProfileModal();
      break;
    case 'close-delete-profile-modal':
      closeDeleteProfileModal();
      break;
    case 'confirm-delete-profile':
      confirmDeleteProfile();
      break;
    case 'restore-profile':
      handleRestoreProfile();
      break;
    case 'inline-save-api-key': {
      const keyInput = document.getElementById('inline-api-key') as HTMLInputElement;
      if (keyInput && keyInput.value.trim()) {
        saveApiKey(keyInput.value.trim());
        render();
      }
      break;
    }
    case 'clear-api-key':
      handleClearApiKey();
      break;
    case 'toggle-remember-key':
      handleToggleRememberKey();
      break;
    case 'toggle-guide':
      handleToggleGuide();
      break;
    case 'toggle-hide-cover': {
      const cb = target as HTMLInputElement;
      saveHideCoverArt(cb.checked);
      render();
      const hideNotice = document.getElementById('hide-cover-notice');
      if (hideNotice) {
        hideNotice.textContent = cb.checked ? 'Cover art hidden' : 'Cover art visible';
        hideNotice.style.opacity = '1';
        setTimeout(() => { hideNotice.style.opacity = '0'; }, 1500);
      }
      break;
    }
    case 'select-cover':
      if (target.dataset.cover) {
        saveCoverPref(target.dataset.cover);
        render();
        const notice = document.getElementById('cover-saved-notice');
        if (notice) {
          notice.textContent = target.dataset.cover === 'random' ? 'Randomize saved' : 'Cover saved';
          notice.style.opacity = '1';
          setTimeout(() => { notice.style.opacity = '0'; }, 1500);
        }
      }
      break;
    case 'select-theme':
      if (target.dataset.theme) {
        handleSelectTheme(target.dataset.theme as any);
      }
      break;
    case 'select-font':
      if (target.dataset.font) {
        handleSelectFont(target.dataset.font as any);
      }
      break;
    case 'toggle-llm-mode': {
      const cb = target as HTMLInputElement;
      const mode = cb.checked ? 'local' : 'api';
      saveLlmMode(mode);
      render();
      const notice = document.getElementById('llm-mode-notice');
      if (notice) {
        notice.textContent = mode === 'local' ? 'Using Claude CLI (Max)' : 'Using API';
        notice.style.opacity = '1';
        setTimeout(() => { notice.style.opacity = '0'; }, 1500);
      }
      break;
    }
    case 'toggle-byok-model':
      if (target.dataset.model === 'sonnet' || target.dataset.model === 'opus') {
        handleToggleByokModel(target.dataset.model);
      }
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
    case 'toggle-like':
      if (target.dataset.id) handleToggleLike(target.dataset.id);
      break;
    case 'share-journal':
      handleShareJournal(target.dataset.id!);
      break;
    case 'close-share-modal':
      $shareModal.style.display = 'none';
      break;
    case 'publish-slug':
      handlePublishSlug(target.dataset.id!);
      break;
    case 'export-journal': {
      const j = getJournal(target.dataset.id);
      if (!j) break;
      let exportHtml = '<div style="font-size:16px;font-weight:bold;margin-bottom:12px;">Export: ' + esc(j.title) + '</div>';
      exportHtml += '<div style="display:flex;flex-direction:column;gap:8px;">';
      exportHtml += `<button class="btn btn-small" data-action="do-export" data-format="json" data-id="${j.id}">JSON (raw data)</button>`;
      exportHtml += `<button class="btn btn-small" data-action="do-export" data-format="markdown" data-id="${j.id}">Markdown</button>`;
      exportHtml += `<button class="btn btn-small" data-action="do-export" data-format="html" data-id="${j.id}">HTML (styled)</button>`;
      exportHtml += `<button class="btn btn-small" data-action="do-export" data-format="pdf" data-id="${j.id}">PDF (print)</button>`;
      exportHtml += '</div>';
      $faqModalContent.innerHTML = exportHtml;
      $faqModal.style.display = 'flex';
      break;
    }
    case 'do-export': {
      const j = getJournal(target.dataset.id);
      if (!j) break;
      const format = target.dataset.format;
      if (format === 'json') exportJSON(j);
      else if (format === 'markdown') exportMarkdown(j);
      else if (format === 'html') exportHTML(j);
      else if (format === 'pdf') exportPDF(j);
      $faqModal.style.display = 'none';
      break;
    }
    case 'unpublish-slug': {
      const accountToken = loadAccountToken();
      if (!accountToken || !target.dataset.id) break;
      if (!confirm('Unpublish this link? The slug will be released and anyone with the link will no longer be able to access it.')) break;
      const btn = target as HTMLButtonElement;
      btn.textContent = 'Removing...';
      btn.disabled = true;
      unpublishSlug(accountToken, target.dataset.id).then(() => {
        const result = document.getElementById('slug-result');
        const status = document.getElementById('slug-status');
        const publishBtn = document.getElementById('publish-slug-btn');
        if (result) result.style.display = 'none';
        if (status) status.textContent = 'Unpublished.';
        if (publishBtn) publishBtn.textContent = 'Publish';
        btn.remove();
      }).catch((err: any) => {
        btn.textContent = 'Unpublish';
        btn.disabled = false;
        alert('Failed to unpublish: ' + err.message);
      });
      break;
    }
    case 'edit-navigate': {
      const navPage = parseInt(target.dataset.page!);
      if (isNaN(navPage)) break;
      pendingEditNavigatePage = navPage;
      $editNavigateTarget.textContent = `page ${navPage}`;
      $editNavigateModal.style.display = 'flex';
      break;
    }
    case 'close-edit-navigate-modal':
      pendingEditNavigatePage = null;
      $editNavigateModal.style.display = 'none';
      break;
    case 'confirm-edit-navigate': {
      if (pendingEditNavigatePage !== null) {
        saveEdit();
        viewState.pageHistory.push(viewState.currentPage);
        viewState.currentPage = pendingEditNavigatePage;
        viewState.editMode = true;
        pendingEditNavigatePage = null;
        $editNavigateModal.style.display = 'none';
        render();
        pushHistory();
        window.scrollTo(0, 0);
      }
      break;
    }
    case 'close-regen-modal':
      $regenModal.style.display = 'none';
      clearPendingKernelText();
      break;
    case 'regen-just-save': {
      const j = getJournal();
      const text = getPendingKernelText();
      if (j && text !== null) {
        j.situation = text;
        if (j.kernel && j.kernel.length > 0 && j.kernel[0].role === 'user') {
          j.kernel[0].content = text;
        }
        persist();
        syncToCloudIfNeeded();
      }
      clearPendingKernelText();
      $regenModal.style.display = 'none';
      viewState.editMode = false;
      render();
      break;
    }
    case 'regen-confirm': {
      const j = getJournal();
      const text = getPendingKernelText();
      if (j && text !== null) {
        j.situation = text;
        persist();
        syncToCloudIfNeeded();
        clearPendingKernelText();
        $regenModal.style.display = 'none';
        viewState.editMode = false;
        viewState.view = 'input';
        render();
        regenerateFromKernel(text);
      }
      break;
    }
    case 'copy-share-url':
    case 'copy-share-standalone': {
      const elId = action === 'copy-share-standalone' ? 'share-url-standalone' : 'share-url';
      const el = document.getElementById(elId);
      const btn = target as HTMLButtonElement;
      if (el) {
        navigator.clipboard.writeText(el.textContent || '');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
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

// Rename modal keyboard
$renameModalTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const newTitle = $renameModalTitle.value.trim();
    if (!newTitle || !pendingRenameId) return;
    const rj = getJournal(pendingRenameId);
    if (rj && newTitle !== rj.title) {
      rj.title = newTitle;
      persist();
      syncToCloudIfNeeded();
      render();
    }
    pendingRenameId = null;
    $renameModal.style.display = 'none';
  }
  if (e.key === 'Escape') {
    pendingRenameId = null;
    $renameModal.style.display = 'none';
  }
});

// AI modal keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.metaKey) {
    const aiInput = document.getElementById('ai-modal-title') as HTMLInputElement;
    if (aiInput && aiInput === document.activeElement) {
      const title = aiInput.value.trim();
      if (!title) return;
      showAiModalStep2(title);
    }
  }
  if (e.key === 'Escape') {
    if ($aiModal.style.display !== 'none') $aiModal.style.display = 'none';
  }

  // Cmd+Enter in interview
  if (e.key === 'Enter' && e.metaKey) {
    const situationInput = document.getElementById('situation-input');
    if (situationInput === document.activeElement) {
      if (loadApiKey()) submitSituation();
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
    if (pg.contentHistoryIndex !== undefined) {
      pg.contentHistory = pg.contentHistory.slice(0, pg.contentHistoryIndex + 1);
    }
    pg.contentHistory.push(origContent);
    pg.contentHistoryIndex = pg.contentHistory.length - 1;
    pg.content = parsed.content;
    pg.confidence = parsed.confidence;
    pg.source = 'ai';
    persist();
    syncToCloudIfNeeded();
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
  syncToCloudIfNeeded();
  render();
}

// --- History API ---
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
  if (state.view === 'leaderboard') return '/?v=leaderboard';
  if (state.view === 'profile' && activeProfileUsername) return `/@${activeProfileUsername}`;
  if (state.view === 'page' && state.journalId) return `/?j=${state.journalId}&p=${state.page}`;
  return '/';
}

window.addEventListener('popstate', (e) => {
  const state = e.state as HistoryEntry | null;
  if (!state) {
    cleanupStandalone();
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

// Init
let pendingShareImport = false;
let pendingStandaloneLoad = false;

function initFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const readParam = params.get('r');
  const shareParam = params.get('s');
  const journalId = params.get('j');
  const pageNum = params.get('p');
  const view = params.get('v');

  const pathRaw = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');

  // Profile route: /@username
  if (pathRaw.startsWith('@') && /^@[a-z0-9][a-z0-9_-]*$/.test(pathRaw)) {
    activeProfileUsername = pathRaw.slice(1);
    viewState.view = 'profile';
    return;
  }

  // Path-based slug: /my-adventure-name
  const pathSlug = pathRaw;
  if (pathSlug && !pathSlug.includes('/') && /^[a-z0-9-]+$/.test(pathSlug)) {
    pendingStandaloneLoad = true;
    return;
  }

  if (readParam) {
    pendingStandaloneLoad = true;
    return;
  }

  if (shareParam) {
    pendingShareImport = true;
    return;
  }

  if (journalId && appState.journals.some(j => j.id === journalId)) {
    appState.activeJournalId = journalId;
    const jnl = getJournal(journalId);
    const jnlKeys = jnl ? Object.keys(jnl.pages) : [];
    const isFresh = jnl && jnlKeys.length === 1 && jnl.pages[1] && !jnl.pages[1].content;

    if (view === 'map') {
      viewState.view = 'map';
    } else if (view === 'input') {
      viewState.view = 'input';
    } else if (isFresh) {
      viewState.view = 'input';
    } else if (pageNum) {
      viewState.view = 'page';
      const parsed = parseInt(pageNum);
      viewState.currentPage = isNaN(parsed) ? 1 : parsed;
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
      // Silent failure
    }
  }
  if (updated) {
    persist();
    render();
  }
}

initFromUrl();
applyTheme(loadThemePref());
applyFont(loadFontPref());
if (!pendingShareImport && !pendingStandaloneLoad) {
  render();
  replaceHistory();
}
importFromShareUrl();
loadStandaloneAdventure();
syncSharedJournals();

async function importFromShareUrl(): Promise<void> {
  if (!pendingShareImport) return;
  const params = new URLSearchParams(window.location.search);
  const shareParam = params.get('s');
  if (!shareParam) return;

  $page.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-light);font-size:16px;">Loading shared adventure...</div>';

  try {
    const result = await importShared(shareParam);
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

    appState.activeJournalId = result.journalId;
    viewState.view = 'page';
    viewState.currentPage = 0;
    viewState.editMode = false;

    history.replaceState(currentHistoryState(), '', stateToUrl(currentHistoryState()));
    render();
    syncToCloudIfNeeded();
  } catch (err: any) {
    $page.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:16px;color:var(--text);margin-bottom:12px;">Could not load this adventure</div>
      <div style="font-size:14px;color:var(--text-light);margin-bottom:16px;">${esc(err.message)}</div>
      <button class="btn btn-primary btn-small" data-action="go-shelf">Go to Shelf</button>
    </div>`;
  } finally {
    pendingShareImport = false;
  }
}

async function loadStandaloneAdventure(): Promise<void> {
  if (!pendingStandaloneLoad) return;

  const pathSlug = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');
  const isSlug = pathSlug && !pathSlug.includes('/') && /^[a-z0-9-]+$/.test(pathSlug);
  const readParam = new URLSearchParams(window.location.search).get('r');

  if (!isSlug && !readParam) return;

  $page.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-light);font-size:16px;">Loading adventure...</div>';

  try {
    let journal: Journal;
    let jid: string;

    if (isSlug) {
      const result = await resolveSlug(pathSlug);
      journal = result.journal as Journal;
      jid = result.journalId;
    } else {
      const result = await importShared(readParam! + '-V');
      journal = result.journal as Journal;
      jid = result.journalId;
    }

    const existing = appState.journals.findIndex(j => j.id === jid);
    if (existing !== -1) {
      appState.journals[existing] = journal;
    } else {
      appState.journals.push(journal);
    }
    standaloneIds.add(jid);

    appState.activeJournalId = jid;
    viewState.view = 'shelf';
    viewState.editMode = false;

    history.replaceState(currentHistoryState(), '', '/');
    render();
  } catch (err: any) {
    $page.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:16px;color:var(--text);margin-bottom:12px;">Could not load this adventure</div>
      <div style="font-size:14px;color:var(--text-light);margin-bottom:16px;">${esc(err.message)}</div>
      <button class="btn btn-primary btn-small" data-action="go-shelf">Go to Shelf</button>
    </div>`;
  } finally {
    pendingStandaloneLoad = false;
  }
}

// Safety net: flush pending sync when tab is hidden or page unloads
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSync();
});
