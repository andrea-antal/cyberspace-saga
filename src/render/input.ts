import { viewState, getJournal, interviewState, persist, resetInterviewState } from '../state';
import { render } from '../main';
import { esc } from '../util';
import { sendInterview, generateTree } from '../ai/client';
import { parseGeneratedTree } from '../ai/parser';
import type { Page } from '../types';

export function renderInput($page: HTMLElement): void {
  const j = getJournal();
  if (!j) { viewState.view = 'shelf'; render(); return; }

  let html = '';

  html += `<div style="font-size:18px;font-weight:bold;margin-bottom:16px;">${esc(j.title)}</div>`;
  html += '<div style="font-size:16px;font-weight:bold;margin-bottom:6px;">Describe your situation</div>';
  html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:14px;">Tell me everything about this decision. What do you know? What are you unsure about? What matters to you?</div>';

  if (interviewState.phase === 'input') {
    html += `<textarea class="edit-textarea" id="situation-input" style="min-height:200px" placeholder="I'm deciding whether to...">${esc(interviewState.situation)}</textarea>`;
    html += '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-primary" data-action="submit-situation">Generate adventure!</button>';
    html += '</div>';
  } else if (interviewState.phase === 'waiting') {
    // Show user's message + thinking indicator while waiting for AI questions
    html += renderConversation();
    html += '<div style="text-align:center;padding:24px 0;color:var(--text-light);font-style:italic;">';
    html += 'Thinking about your situation';
    html += '<span class="generating-dots"><span>.</span><span>.</span><span>.</span></span>';
    html += '</div>';
  } else if (interviewState.phase === 'interviewing') {
    // Show conversation + answer input (only shown after AI questions have arrived)
    html += renderConversation();

    html += `<textarea class="edit-textarea" id="interview-answer" style="min-height:80px" placeholder="Your answer..."></textarea>`;
    html += '<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-ghost" data-action="skip-interview">Skip — just generate</button>';
    html += '<button class="btn btn-primary" data-action="submit-answer">Answer</button>';
    html += '</div>';
  } else if (interviewState.phase === 'generating') {
    html += renderConversation();
    html += '<div class="generating-state">';
    html += '<div class="generating-icon">🔮</div>';
    html += '<div class="generating-label">Mapping out your possible futures <span class="sparkle">✨</span></div>';
    html += '<div class="generating-bar"><div class="generating-bar-fill"></div></div>';
    html += '</div>';
  } else if (interviewState.phase === 'done') {
    html += '<div style="text-align:center;padding:20px 0;">';
    html += '<div style="font-size:16px;margin-bottom:14px;">Your adventure has been mapped.</div>';
    html += '<button class="btn btn-primary" data-action="go-page" data-page="1">Turn to page 1</button>';
    html += '</div>';
  }

  if (interviewState.error) {
    html += `<div style="margin-top:14px;padding:12px;background:rgba(196,30,30,0.08);border:1px solid rgba(196,30,30,0.2);border-radius:4px;font-size:14px;color:var(--red);">${esc(interviewState.error)}</div>`;
  }

  $page.innerHTML = html;
}

function scrollToLatestAssistant(): void {
  requestAnimationFrame(() => {
    const el = document.querySelector('.interview-ai-response');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function formatAssistant(text: string): string {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderConversation(): string {
  // User messages go in the conversation block
  let html = '<div class="interview-conversation">';
  for (const msg of interviewState.conversation) {
    if (msg.role === 'user') {
      html += `<div class="interview-msg interview-user"><strong>You:</strong> ${esc(msg.content)}</div>`;
    }
  }
  html += '</div>';

  // Latest AI response rendered separately below
  const assistantMsgs = interviewState.conversation.filter(m => m.role === 'assistant');
  if (assistantMsgs.length > 0) {
    const latest = assistantMsgs[assistantMsgs.length - 1];
    html += `<div class="interview-ai-response"><span class="ai-response-icon">🤖</span>${formatAssistant(latest.content)}</div>`;
  }

  return html;
}

export async function submitSituation(): Promise<void> {
  const input = document.getElementById('situation-input') as HTMLTextAreaElement;
  if (!input || !input.value.trim()) return;

  const j = getJournal();
  if (!j) return;

  interviewState.situation = input.value.trim();
  j.situation = interviewState.situation;
  persist();

  interviewState.conversation.push({ role: 'user', content: interviewState.situation });
  interviewState.phase = 'waiting';
  interviewState.error = undefined;
  render();

  try {
    const response = await sendInterview(interviewState.situation, []);
    interviewState.conversation.push({ role: 'assistant', content: response });
    interviewState.phase = 'interviewing';
    render();
    scrollToLatestAssistant();
  } catch (e: any) {
    interviewState.error = e.message || 'Failed to connect to AI. Check your API key in Settings.';
    interviewState.phase = 'input';
    render();
  }
}

export async function submitAnswer(): Promise<void> {
  const input = document.getElementById('interview-answer') as HTMLTextAreaElement;
  if (!input || !input.value.trim()) return;

  const answer = input.value.trim();
  interviewState.conversation.push({ role: 'user', content: answer });
  interviewState.error = undefined;

  // Check if we have enough context (2+ user messages = situation + 1 answer)
  const userMessages = interviewState.conversation.filter(m => m.role === 'user');
  if (userMessages.length >= 3) {
    // Enough context, generate the tree
    await doGenerate();
    return;
  }

  // Need more questions — show waiting state
  interviewState.phase = 'waiting';
  render();

  try {
    const response = await sendInterview(interviewState.situation, interviewState.conversation.slice(1));
    interviewState.conversation.push({ role: 'assistant', content: response });
    interviewState.phase = 'interviewing';
    render();
    scrollToLatestAssistant();
  } catch (e: any) {
    interviewState.error = e.message || 'Failed to connect to AI.';
    interviewState.phase = 'interviewing';
    render();
  }
}

export async function skipInterview(): Promise<void> {
  interviewState.error = undefined;
  await doGenerate();
}

export async function regenerateFromKernel(situation: string): Promise<void> {
  interviewState.situation = situation;
  interviewState.conversation = [{ role: 'user', content: situation }];
  interviewState.error = undefined;
  await doGenerate();
}

async function doGenerate(): Promise<void> {
  interviewState.phase = 'generating';
  render();

  try {
    const fullContext = interviewState.conversation
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const result = await generateTree(interviewState.situation, fullContext);
    const pages = parseGeneratedTree(result);

    const j = getJournal();
    if (!j) return;

    // Replace journal pages with generated tree
    j.pages = pages;
    persist();

    interviewState.phase = 'done';
    render();
  } catch (e: any) {
    interviewState.error = e.message || 'Failed to generate decision tree.';
    interviewState.phase = 'interviewing';
    render();
  }
}
