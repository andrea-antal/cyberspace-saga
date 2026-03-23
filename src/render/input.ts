import { viewState, getJournal, interviewState, persist, resetInterviewState, loadApiKey } from '../state';
import { render } from '../main';
import { esc, escAttr } from '../util';
import { sendInterview, sendInterviewStream, generateTree, generateSkeleton, generatePageContent, generatePageOne } from '../ai/client';
import { syncToCloudIfNeeded } from '../sync';
import { parseGeneratedTree, parseSkeleton } from '../ai/parser';
import type { Page } from '../types';

export function renderInput($page: HTMLElement): void {
  const j = getJournal();
  if (!j) { viewState.view = 'shelf'; render(); return; }

  let html = '';

  html += `<div style="font-size:18px;font-weight:bold;margin-bottom:16px;">${esc(j.title)}</div>`;

  if (interviewState.phase !== 'done') {
    html += '<div style="font-size:16px;font-weight:bold;margin-bottom:6px;">Describe your situation</div>';
    html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:14px;">Tell me everything about this decision. What do you know? What are you unsure about? What matters to you?</div>';
  }

  if (interviewState.phase === 'input') {
    const hasAccess = !!loadApiKey();

    if (!hasAccess) {
      html += '<div style="margin-bottom:16px;padding:14px;background:rgba(255,255,255,0.3);border-radius:6px;border:1px solid var(--cream-dark);">';
      html += '<div style="font-size:14px;font-weight:bold;margin-bottom:8px;">Set up AI access to generate</div>';
      html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">You can still describe your situation below -- just set up access before generating.</div>';

      // BYOK inline
      html += '<div style="margin-bottom:10px;">';
      html += '<div style="font-size:14px;font-weight:bold;margin-bottom:4px;">Bring your own API key</div>';
      html += '<div style="display:flex;gap:8px;">';
      html += `<input type="password" class="edit-textarea choice-input" id="inline-api-key" placeholder="sk-ant-..." style="flex:1;height:36px;font-family:monospace;font-size:14px;">`;
      html += '<button class="btn btn-active btn-small" data-action="inline-save-api-key">Save</button>';
      html += '</div>';
      html += '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">This key is saved for this session only. To persist it across sessions, go to Settings.</div>';
      html += '</div>';

      html += '</div>';
    }

    html += `<textarea class="edit-textarea" id="situation-input" style="min-height:200px" placeholder="I'm deciding whether to...">${esc(interviewState.situation)}</textarea>`;
    html += '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-ghost" data-action="start-manual">Build your own</button>';
    html += `<button class="btn btn-primary" data-action="submit-situation" ${hasAccess ? '' : 'disabled'}>Generate adventure!</button>`;
    html += '</div>';
  } else if (interviewState.phase === 'waiting') {
    html += renderConversation();
    html += '<div class="thinking-state">';
    html += '<div class="thinking-cards">';
    html += '<div class="thinking-card" style="animation-delay:0s;">🃏</div>';
    html += '<div class="thinking-card" style="animation-delay:0.3s;">🃏</div>';
    html += '<div class="thinking-card" style="animation-delay:0.6s;">🃏</div>';
    html += '</div>';
    html += '<div class="thinking-label">Reading the cards';
    html += '<span class="generating-dots"><span>.</span><span>.</span><span>.</span></span>';
    html += '</div>';
    html += '<div class="thinking-sub">Preparing questions about your situation</div>';
    html += '</div>';
  } else if (interviewState.phase === 'interviewing') {
    html += renderConversation();

    html += `<textarea class="edit-textarea" id="interview-answer" style="min-height:80px" placeholder="Your answer..."></textarea>`;
    html += '<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-ghost" data-action="skip-interview">Skip — just generate</button>';
    html += '<button class="btn btn-primary" data-action="submit-answer">Answer</button>';
    html += '</div>';
  } else if (interviewState.phase === 'generating') {
    html += renderConversation();
    html += '<div class="generating-state">';
    html += '<div class="generating-icon-wrap"><div class="generating-icon">🔮</div>';
    html += '<div class="sparkle-particle" style="top:-5px;left:55%;animation-delay:0s;">✦</div>';
    html += '<div class="sparkle-particle" style="top:25%;right:-10px;animation-delay:0.5s;">✧</div>';
    html += '<div class="sparkle-particle" style="bottom:10%;left:-5px;animation-delay:1s;">✦</div>';
    html += '<div class="sparkle-particle" style="top:10%;left:-8px;animation-delay:1.5s;">✧</div>';
    html += '<div class="sparkle-particle" style="bottom:15%;right:-8px;animation-delay:0.7s;">✦</div>';
    html += '<div class="sparkle-particle" style="top:5%;right:15%;animation-delay:1.8s;">✧</div>';
    html += '<div class="sparkle-particle" style="top:45%;left:0;animation-delay:0.3s;">✦</div>';
    html += '<div class="sparkle-particle" style="bottom:0;left:45%;animation-delay:1.2s;">✧</div>';
    html += '</div>';
    html += '<div class="generating-label">Mapping out your possible futures</div>';
    html += '<div class="generating-bar"><div class="generating-bar-fill"></div></div>';
    html += '</div>';
  } else if (interviewState.phase === 'done') {
    html += '<div style="text-align:center;padding:40px 0;">';
    html += '<div class="done-map-icon">🗺️</div>';
    html += '<div style="font-size:16px;margin-bottom:18px;">Your adventure has been mapped.</div>';
    html += '<button class="btn btn-primary" data-action="go-page" data-page="1">Turn to page 1</button>';
    html += '</div>';
  }

  if (interviewState.error) {
    html += `<div style="margin-top:14px;padding:12px;background:rgba(196,30,30,0.08);border:1px solid rgba(196,30,30,0.2);border-radius:4px;font-size:14px;color:var(--red);">`;
    html += esc(interviewState.error);
    if (interviewState.error.includes('Settings')) {
      html += ` <button class="btn-link" style="font-size:14px;color:var(--red);text-decoration:underline;" data-action="go-settings">Go to Settings</button>`;
    }
    html += '</div>';
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
  let html = '<div class="interview-conversation">';
  for (let i = 0; i < interviewState.conversation.length; i++) {
    const msg = interviewState.conversation[i];
    const isLast = i === interviewState.conversation.length - 1;
    if (msg.role === 'user') {
      html += `<div class="interview-msg interview-user"><strong>You:</strong> ${esc(msg.content)}</div>`;
    } else {
      const cls = isLast ? 'interview-ai-response interview-ai-latest' : 'interview-ai-response';
      html += `<div class="${cls}"><span class="ai-response-icon">🤖</span>${formatAssistant(msg.content)}</div>`;
    }
  }
  html += '</div>';
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
    interviewState.conversation.push({ role: 'assistant', content: '' });
    interviewState.phase = 'interviewing';
    render();
    scrollToLatestAssistant();

    const response = await sendInterviewStream(interviewState.situation, [], (chunk) => {
      const msgs = interviewState.conversation;
      msgs[msgs.length - 1].content += chunk;
      const el = document.querySelector('.interview-ai-latest');
      if (el) el.innerHTML = `<span class="ai-response-icon">🤖</span>${formatAssistant(msgs[msgs.length - 1].content)}`;
    });

    interviewState.conversation[interviewState.conversation.length - 1].content = response;
    render();
  } catch (e: any) {
    if (interviewState.conversation[interviewState.conversation.length - 1]?.content === '') {
      interviewState.conversation.pop();
    }
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

  const userMessages = interviewState.conversation.filter(m => m.role === 'user');
  if (userMessages.length >= 3) {
    await doGenerate();
    return;
  }

  interviewState.phase = 'waiting';
  render();

  try {
    interviewState.conversation.push({ role: 'assistant', content: '' });
    interviewState.phase = 'interviewing';
    render();
    scrollToLatestAssistant();

    const response = await sendInterviewStream(interviewState.situation, interviewState.conversation.slice(1, -1), (chunk) => {
      const msgs = interviewState.conversation;
      msgs[msgs.length - 1].content += chunk;
      const el = document.querySelector('.interview-ai-latest');
      if (el) el.innerHTML = `<span class="ai-response-icon">🤖</span>${formatAssistant(msgs[msgs.length - 1].content)}`;
    });

    interviewState.conversation[interviewState.conversation.length - 1].content = response;
    render();
  } catch (e: any) {
    if (interviewState.conversation[interviewState.conversation.length - 1]?.content === '') {
      interviewState.conversation.pop();
    }
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

  const j0 = getJournal();
  if (j0) {
    j0.kernel = [...interviewState.conversation];
    persist();
  }

  render();

  const fullContext = interviewState.conversation
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  try {
    const j = getJournal();
    if (!j) return;

    // Stage 1: Generate page 1 with streaming
    j.pages = {
      1: { content: '', choices: [], isEnding: false, type: 'fact', source: 'ai' },
    };
    interviewState.phase = 'done';
    viewState.view = 'page';
    viewState.currentPage = 1;
    render();

    const page1Content = await generatePageOne(interviewState.situation, fullContext, (chunk) => {
      const currentJ = getJournal();
      if (currentJ?.pages[1]) {
        currentJ.pages[1].content += chunk;
        const contentEl = document.querySelector('.page-content');
        if (contentEl) {
          contentEl.innerHTML = formatPageContent(currentJ.pages[1].content);
        }
      }
    });

    if (j.pages[1]) {
      j.pages[1].content = page1Content.trim();
    }
    persist();
    render();

    // Stage 2: Generate skeleton in background
    const skeletonRaw = await generateSkeleton(interviewState.situation, fullContext);
    const skeleton = parseSkeleton(skeletonRaw);

    for (const [num, sp] of Object.entries(skeleton.pages)) {
      const pageNum = Number(num);
      if (pageNum === 1) {
        j.pages[1].choices = sp.choices;
        j.pages[1].isEnding = sp.isEnding;
      } else {
        j.pages[pageNum] = {
          content: sp.summary,
          choices: sp.choices,
          isEnding: sp.isEnding,
          type: sp.type,
          source: 'ai',
          confidence: sp.confidence,
        };
      }
    }
    persist();
    render();

    // Stage 3: Fill in remaining pages progressively
    const remainingPages = Object.keys(skeleton.pages).map(Number).filter(n => n !== 1);
    const BATCH_SIZE = 2;

    for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
      const batch = remainingPages.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (num) => {
          const sp = skeleton.pages[num];
          try {
            const content = await generatePageContent(
              interviewState.situation,
              num,
              sp.summary,
              sp.type,
              sp.choices,
              sp.isEnding,
            );
            return { num, content: content.trim() };
          } catch {
            return { num, content: sp.summary };
          }
        })
      );

      const currentJ = getJournal();
      if (!currentJ) return;
      for (const { num, content } of results) {
        if (currentJ.pages[num]) {
          currentJ.pages[num].content = content;
        }
      }
      persist();
      if (batch.includes(viewState.currentPage)) {
        render();
      }
    }

    syncToCloudIfNeeded();
  } catch (e: any) {
    try {
      const result = await generateTree(interviewState.situation, fullContext);
      const pages = parseGeneratedTree(result);

      const j = getJournal();
      if (!j) return;
      j.pages = pages;
      persist();
      syncToCloudIfNeeded();
      interviewState.phase = 'done';
      render();
    } catch (fallbackErr: any) {
      interviewState.error = fallbackErr.message || 'Failed to generate decision tree.';
      interviewState.phase = 'interviewing';
      render();
    }
  }
}

function formatPageContent(text: string): string {
  return text.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('');
}
