import { loadApiKey, getModelId } from '../state';
import { INTERVIEW_SYSTEM_PROMPT, GENERATE_SYSTEM_PROMPT, REGENERATE_SYSTEM_PROMPT } from './prompt';
import type { ConversationMessage } from '../types';

async function callApi(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = loadApiKey();
  if (!apiKey) {
    throw new Error('No API key set. Go to Settings to add your Anthropic API key.');
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ system: systemPrompt, messages, model: getModelId() }),
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
