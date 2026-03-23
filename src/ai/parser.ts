import type { Page } from '../types';
import { repairJSON } from './repair';

export function parseGeneratedTree(raw: string): Record<number, Page> {
  const cleaned = repairJSON(raw);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON. Try again.');
  }

  if (!parsed.pages || typeof parsed.pages !== 'object') {
    throw new Error('AI response missing pages. Try again.');
  }

  const pages: Record<number, Page> = {};

  for (const [key, value] of Object.entries(parsed.pages)) {
    const pageNum = parseInt(key);
    if (isNaN(pageNum)) continue;

    const raw = value as any;
    pages[pageNum] = {
      content: String(raw.content || ''),
      choices: Array.isArray(raw.choices) ? raw.choices.map((c: any) => ({
        text: String(c.text || ''),
        page: Number(c.page),
      })).filter((c: { text: string; page: number }) => !isNaN(c.page)) : [],
      isEnding: Boolean(raw.isEnding),
      type: validateType(raw.type),
      source: 'ai',
      confidence: validateConfidence(raw.confidence),
    };
  }

  // Ensure page 1 exists
  if (!pages[1]) {
    throw new Error('AI response missing page 1. Try again.');
  }

  // Validate all choice targets exist, create stubs for missing ones
  for (const page of Object.values(pages)) {
    for (const choice of page.choices) {
      if (!pages[choice.page]) {
        pages[choice.page] = {
          content: '(This path hasn\'t been explored yet.)',
          choices: [],
          isEnding: true,
          type: 'ending',
          source: 'ai',
        };
      }
    }
  }

  return pages;
}

export interface SkeletonPage {
  summary: string;
  choices: { text: string; page: number }[];
  isEnding: boolean;
  type: 'fact' | 'decision' | 'scenario' | 'ending';
  confidence?: 'high' | 'medium' | 'low';
}

export interface Skeleton {
  title: string;
  pages: Record<number, SkeletonPage>;
}

export function parseSkeleton(raw: string): Skeleton {
  const cleaned = repairJSON(raw);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid structure. Try again.');
  }

  if (!parsed.pages || typeof parsed.pages !== 'object') {
    throw new Error('AI response missing pages. Try again.');
  }

  const pages: Record<number, SkeletonPage> = {};

  for (const [key, value] of Object.entries(parsed.pages)) {
    const pageNum = parseInt(key);
    if (isNaN(pageNum)) continue;

    const raw = value as any;
    pages[pageNum] = {
      summary: String(raw.summary || ''),
      choices: Array.isArray(raw.choices) ? raw.choices.map((c: any) => ({
        text: String(c.text || ''),
        page: Number(c.page),
      })).filter((c: { text: string; page: number }) => !isNaN(c.page)) : [],
      isEnding: Boolean(raw.isEnding),
      type: validateType(raw.type),
      confidence: validateConfidence(raw.confidence),
    };
  }

  if (!pages[1]) {
    throw new Error('AI response missing page 1. Try again.');
  }

  return { title: parsed.title || 'Untitled', pages };
}

export function parseRegeneratedPage(raw: string): { content: string; confidence?: 'high' | 'medium' | 'low' } {
  const cleaned = repairJSON(raw);
  const parsed = JSON.parse(cleaned);
  return {
    content: String(parsed.content || ''),
    confidence: validateConfidence(parsed.confidence),
  };
}

function validateType(t: any): 'fact' | 'decision' | 'scenario' | 'ending' {
  const valid = ['fact', 'decision', 'scenario', 'ending'];
  return valid.includes(t) ? t : 'fact';
}

function validateConfidence(c: any): 'high' | 'medium' | 'low' | undefined {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(c) ? c : undefined;
}
