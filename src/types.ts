export type PageType = 'fact' | 'decision' | 'scenario' | 'ending';
export type PageSource = 'user' | 'ai' | 'ai-edited';

export interface Page {
  content: string;
  choices: Choice[];
  isEnding: boolean;
  type: PageType;
  source: PageSource;
  confidence?: 'high' | 'medium' | 'low';
  contentHistory?: string[];
  contentHistoryIndex?: number;
  forkedAlternate?: boolean;
}

export interface Choice {
  text: string;
  page: number;
}

export interface Journal {
  id: string;
  title: string;
  created: string;
  pages: Record<number, Page>;
  bookmarks: number[];
  situation?: string;
  kernel?: ConversationMessage[];
}

export interface AppState {
  journals: Journal[];
  activeJournalId: string | null;
  apiKey?: string;
}

export type ViewName = 'shelf' | 'page' | 'map' | 'input' | 'settings' | 'leaderboard' | 'profile';

export interface ViewState {
  view: ViewName;
  currentPage: number;
  editMode: boolean;
  pageHistory: number[];
}

// AI generation types
export interface ClarifyingQuestion {
  question: string;
  why: string;
}

export interface GeneratedTree {
  title: string;
  pages: Record<number, Page>;
  clarifyingQuestions?: ClarifyingQuestion[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface InterviewState {
  situation: string;
  conversation: ConversationMessage[];
  phase: 'input' | 'waiting' | 'interviewing' | 'generating' | 'done';
  error?: string;
}

export type SharePermission = 'edit' | 'view';

export interface SharedJournalMeta {
  shareToken: string;
  journalId: string;
  permission: SharePermission;
}
