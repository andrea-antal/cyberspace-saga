import { loadApiKey, getActiveModel, detectProvider, loadLlmMode } from '../state';
import { INTERVIEW_SYSTEM_PROMPT, GENERATE_SYSTEM_PROMPT, REGENERATE_SYSTEM_PROMPT, SKELETON_SYSTEM_PROMPT, PAGE_ONE_SYSTEM_PROMPT, PAGE_CONTENT_SYSTEM_PROMPT } from './prompt';
import type { ConversationMessage } from '../types';

async function callApiStream(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
): Promise<string> {
  const llmMode = loadLlmMode();

  // CLI mode doesn't support streaming — fall back to non-streaming and emit result as one chunk
  if (llmMode === 'local') {
    const content = await callApi(systemPrompt, messages);
    onChunk(content);
    return content;
  }

  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('No API key set. Add your key in Settings.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };
  const bodyObj: Record<string, any> = {
    system: systemPrompt,
    messages,
    stream: true,
    model: getActiveModel(),
    provider: detectProvider(apiKey),
  };

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error('Invalid API key. Check your key in Settings.');
    throw new Error(`API error (${res.status}): ${body}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.done) continue;
        if (data.text) {
          fullContent += data.text;
          onChunk(data.text);
        }
      } catch { /* skip */ }
    }
  }

  return fullContent;
}

async function callApi(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const llmMode = loadLlmMode();
  const apiKey = loadApiKey();

  if (!apiKey && llmMode !== 'local') throw new Error('No API key set. Add your key in Settings.');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const bodyObj: Record<string, any> = { system: systemPrompt, messages };

  if (llmMode === 'local') {
    bodyObj.cliMode = true;
  } else {
    headers['X-API-Key'] = apiKey;
    bodyObj.model = getActiveModel();
    bodyObj.provider = detectProvider(apiKey);
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error('Invalid API key. Check your key in Settings.');
    }
    throw new Error(`API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.content;
}

export async function sendInterview(situation: string, followUp: ConversationMessage[]): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: 'user', content: situation },
    ...followUp,
  ];
  return callApi(INTERVIEW_SYSTEM_PROMPT, messages);
}

export async function sendInterviewStream(
  situation: string,
  followUp: ConversationMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: 'user', content: situation },
    ...followUp,
  ];
  return callApiStream(INTERVIEW_SYSTEM_PROMPT, messages, onChunk);
}

export async function generateTree(situation: string, fullContext: string): Promise<string> {
  const messages = [
    { role: 'user', content: `Here is the decision situation and interview context:\n\n${fullContext}\n\nGenerate the decision tree.` },
  ];
  return callApi(GENERATE_SYSTEM_PROMPT, messages);
}

export async function regeneratePage(pageContent: string, context: string): Promise<string> {
  const messages = [
    { role: 'user', content: `Context: ${context}\n\nCurrent scenario page:\n${pageContent}\n\nGenerate an alternative scenario.` },
  ];
  return callApi(REGENERATE_SYSTEM_PROMPT, messages);
}

export async function generateSkeleton(situation: string, fullContext: string): Promise<string> {
  const messages = [
    { role: 'user', content: `Here is the decision situation and interview context:\n\n${fullContext}\n\nGenerate the tree structure.` },
  ];
  return callApi(SKELETON_SYSTEM_PROMPT, messages);
}

export async function generatePageOne(situation: string, fullContext: string, onChunk: (text: string) => void): Promise<string> {
  const messages = [
    { role: 'user', content: `Here is the decision situation and interview context:\n\n${fullContext}\n\nWrite page 1 — the fact summary.` },
  ];
  return callApiStream(PAGE_ONE_SYSTEM_PROMPT, messages, onChunk);
}

export async function generatePageContent(situation: string, pageNum: number, summary: string, type: string, choices: { text: string; page: number }[], isEnding: boolean): Promise<string> {
  const choiceDesc = choices.length > 0
    ? `\nThis page leads to: ${choices.map(c => `"${c.text}" (page ${c.page})`).join(', ')}`
    : '';
  const endingNote = isEnding ? '\nThis is an ending page.' : '';

  const messages = [
    { role: 'user', content: `Decision situation: ${situation}\n\nWrite content for page ${pageNum}.\nType: ${type}\nSummary: ${summary}${choiceDesc}${endingNote}` },
  ];
  return callApi(PAGE_CONTENT_SYSTEM_PROMPT, messages);
}
