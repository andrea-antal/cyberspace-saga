import type { AppState, ViewState, Journal, Page, InterviewState, SharedJournalMeta } from './types';

const STORAGE_KEY = 'cyoa-decision-journal';
const API_KEY_KEY = 'cyoa-api-key';
const REMEMBER_KEY_KEY = 'cyoa-remember-api-key';
const ACCOUNT_TOKEN_KEY = 'cyoa-account-token';
const SHARED_JOURNALS_KEY = 'cyoa-shared-journals';
const BYOK_MODEL_KEY = 'cyoa-byok-model';
export type Provider = 'anthropic' | 'openai';
const GUIDE_DISMISSED_KEY = 'cyoa-guide-dismissed';
const COVER_PREF_KEY = 'cyoa-cover-pref';
const HIDE_COVER_ART_KEY = 'cyoa-hide-cover-art';
const THEME_PREF_KEY = 'cyoa-theme-pref';
const FONT_PREF_KEY = 'cyoa-font-pref';
const LLM_MODE_KEY = 'cyoa-llm-mode';
export type LlmMode = 'api' | 'local';
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

export function loadRememberApiKey(): boolean {
  return localStorage.getItem(REMEMBER_KEY_KEY) === 'true';
}

export function saveRememberApiKey(remember: boolean): void {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY_KEY, 'true');
  } else {
    localStorage.removeItem(REMEMBER_KEY_KEY);
  }
}

export function loadApiKey(): string {
  // Check localStorage first (persisted), then sessionStorage (session-only)
  return localStorage.getItem(API_KEY_KEY) || sessionStorage.getItem(API_KEY_KEY) || '';
}

export function saveApiKey(key: string): void {
  // Always clear both storages first
  localStorage.removeItem(API_KEY_KEY);
  sessionStorage.removeItem(API_KEY_KEY);

  if (key) {
    if (loadRememberApiKey()) {
      localStorage.setItem(API_KEY_KEY, key);
    } else {
      sessionStorage.setItem(API_KEY_KEY, key);
    }
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

export function detectProvider(key: string): Provider {
  if (key.startsWith('sk-ant-')) return 'anthropic';
  return 'openai';
}

export function isGuideDismissed(): boolean {
  return localStorage.getItem(GUIDE_DISMISSED_KEY) === 'true';
}

export function dismissGuide(): void {
  localStorage.setItem(GUIDE_DISMISSED_KEY, 'true');
}

export function showGuide(): void {
  localStorage.removeItem(GUIDE_DISMISSED_KEY);
}

export function loadCoverPref(): string {
  return localStorage.getItem(COVER_PREF_KEY) || 'random';
}

export function saveCoverPref(pref: string): void {
  if (pref === 'random') {
    localStorage.removeItem(COVER_PREF_KEY);
  } else {
    localStorage.setItem(COVER_PREF_KEY, pref);
  }
}

export function loadHideCoverArt(): boolean {
  return localStorage.getItem(HIDE_COVER_ART_KEY) === 'true';
}

export function saveHideCoverArt(hide: boolean): void {
  if (hide) {
    localStorage.setItem(HIDE_COVER_ART_KEY, 'true');
  } else {
    localStorage.removeItem(HIDE_COVER_ART_KEY);
  }
}

export type ThemeId = 'parchment' | 'midnight' | 'rose-quartz' | 'forest' | 'obsidian';
export type FontId = 'classic' | 'editorial' | 'modern' | 'literary' | 'typewriter';

export function loadThemePref(): ThemeId {
  return (localStorage.getItem(THEME_PREF_KEY) as ThemeId) || 'parchment';
}

export function saveThemePref(theme: ThemeId): void {
  if (theme === 'parchment') {
    localStorage.removeItem(THEME_PREF_KEY);
  } else {
    localStorage.setItem(THEME_PREF_KEY, theme);
  }
}

export function loadFontPref(): FontId {
  return (localStorage.getItem(FONT_PREF_KEY) as FontId) || 'classic';
}

export function saveFontPref(font: FontId): void {
  if (font === 'classic') {
    localStorage.removeItem(FONT_PREF_KEY);
  } else {
    localStorage.setItem(FONT_PREF_KEY, font);
  }
}

export function loadLlmMode(): LlmMode {
  return localStorage.getItem(LLM_MODE_KEY) === 'local' ? 'local' : 'api';
}

export function saveLlmMode(mode: LlmMode): void {
  if (mode === 'api') {
    localStorage.removeItem(LLM_MODE_KEY);
  } else {
    localStorage.setItem(LLM_MODE_KEY, mode);
  }
}

export function getActiveModel(): string {
  const key = loadApiKey();
  const tier = loadByokModel();
  if (key && detectProvider(key) === 'openai') {
    return tier === 'opus' ? 'gpt-5.4' : 'gpt-5.4-mini';
  }
  return tier === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
}

export function getSharedMeta(journalId: string): SharedJournalMeta | undefined {
  return loadSharedJournals().find(s => s.journalId === journalId);
}

// Standalone journals are loaded in memory only — not persisted, not editable
export const standaloneIds = new Set<string>();

export function isOwnJournal(journalId: string): boolean {
  if (standaloneIds.has(journalId)) return false;
  return !getSharedMeta(journalId);
}

export function canEdit(journalId: string): boolean {
  if (standaloneIds.has(journalId)) return false;
  const meta = getSharedMeta(journalId);
  if (!meta) return true;
  return meta.permission === 'edit';
}

export function canDelete(journalId: string): boolean {
  if (standaloneIds.has(journalId)) return false;
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
