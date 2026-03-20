import type { AppState, ViewState, Journal, Page, InterviewState, SharedJournalMeta } from './types';

const STORAGE_KEY = 'cyoa-decision-journal';
const API_KEY_KEY = 'cyoa-api-key';
const ACCOUNT_TOKEN_KEY = 'cyoa-account-token';
const SHARED_JOURNALS_KEY = 'cyoa-shared-journals';
const BYOK_MODEL_KEY = 'cyoa-byok-model';
export const BM_COLORS = 5;

// --- Persistence ---

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Migrate v1 journals: add missing type/source fields
      if (data.journals) {
        data.journals.forEach((j: Journal) => {
          Object.values(j.pages).forEach((pg: Page) => {
            if (!pg.type) pg.type = 'fact';
            if (!pg.source) pg.source = 'user';
          });
          if (!j.bookmarks) j.bookmarks = [];
        });
      }
      return data;
    }
  } catch (e) { /* ignore */ }
  return { journals: [], activeJournalId: null };
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) || '';
}

export function saveApiKey(key: string): void {
  if (key) {
    localStorage.setItem(API_KEY_KEY, key);
  } else {
    localStorage.removeItem(API_KEY_KEY);
  }
}

export function loadAccountToken(): string {
  return localStorage.getItem(ACCOUNT_TOKEN_KEY) || '';
}

export function saveAccountToken(token: string): void {
  if (token) {
    localStorage.setItem(ACCOUNT_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCOUNT_TOKEN_KEY);
  }
}

export function loadSharedJournals(): SharedJournalMeta[] {
  try {
    const raw = localStorage.getItem(SHARED_JOURNALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSharedJournals(shared: SharedJournalMeta[]): void {
  localStorage.setItem(SHARED_JOURNALS_KEY, JSON.stringify(shared));
}

export function loadByokModel(): 'sonnet' | 'opus' {
  return localStorage.getItem(BYOK_MODEL_KEY) === 'opus' ? 'opus' : 'sonnet';
}

export function saveByokModel(model: 'sonnet' | 'opus'): void {
  localStorage.setItem(BYOK_MODEL_KEY, model);
}

export function getActiveModel(): string {
  return loadByokModel() === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
}

export function getSharedMeta(journalId: string): SharedJournalMeta | undefined {
  return loadSharedJournals().find(s => s.journalId === journalId);
}

export function isOwnJournal(journalId: string): boolean {
  return !getSharedMeta(journalId);
}

export function canEdit(journalId: string): boolean {
  const meta = getSharedMeta(journalId);
  if (!meta) return true;
  return meta.permission === 'edit';
}

export function canDelete(journalId: string): boolean {
  return isOwnJournal(journalId);
}

// --- State singletons ---

export let appState: AppState = loadState();
export let viewState: ViewState = {
  view: 'shelf',
  currentPage: 1,
  editMode: false,
  pageHistory: [],
};
export let interviewState: InterviewState = {
  situation: '',
  conversation: [],
  phase: 'input',
};

export function resetInterviewState(): void {
  interviewState.situation = '';
  interviewState.conversation = [];
  interviewState.phase = 'input';
  interviewState.error = undefined;
}

// --- Helpers ---

export function getJournal(id?: string): Journal | undefined {
  return appState.journals.find(j => j.id === (id || appState.activeJournalId));
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function nextPageNum(journal: Journal): number {
  const used = Object.keys(journal.pages).map(Number);
  let n = Math.max(...used) + Math.floor(Math.random() * 8) + 3;
  while (used.includes(n)) n++;
  return n;
}

export function persist(): void {
  saveState(appState);
}
