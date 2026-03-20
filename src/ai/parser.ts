import type { Page } from '../types';

export function parseGeneratedTree(raw: string): Record<number, Page> {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from surrounding text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        throw new Error('AI returned invalid JSON. Try again.');
      }
    } else {
      throw new Error('AI returned invalid JSON. Try again.');
    }
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

export function parseRegeneratedPage(raw: string): { content: string; confidence?: 'high' | 'medium' | 'low' } {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

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
