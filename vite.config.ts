import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';

function callClaudeCli(system: string, messages: { role: string; content: string }[], model?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const prompt = messages.map(m => {
      if (m.role === 'assistant') return `[Assistant]: ${m.content}`;
      return m.content;
    }).join('\n\n');

    const cliModel = model || 'sonnet';
    const args = [
      '-p', prompt,
      '--system-prompt', system,
      '--model', cliModel,
      '--output-format', 'json',
      '--bare',
      '--tools', '',
      '--no-session-persistence',
    ];

    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    child.stdin.end();

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stderr.on('data', (d: Buffer) => errChunks.push(d));

    child.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString();
      const stderr = Buffer.concat(errChunks).toString();
      if (code !== 0) {
        reject(new Error(stderr || `claude exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed.result || '');
      } catch {
        resolve(stdout.trim());
      }
    });
  });
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function apiProxy(): Plugin {
  return {
    name: 'api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const body = await readBody(req);
        const apiKey = req.headers['x-api-key'] as string;
        const { system, messages, model, provider } = body;

        if (!system || !messages) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing system or messages' }));
          return;
        }

        // Claude CLI path (local use via Max subscription)
        if (body.cliMode) {
          try {
            const content = await callClaudeCli(system, messages, model);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ content }));
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message || 'Claude CLI error' }));
          }
          return;
        }

        if (!apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing API key' }));
          return;
        }

        // OpenAI BYOK
        if (provider === 'openai') {
          try {
            const openAiMessages = [
              { role: 'system', content: system },
              ...messages,
            ];
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: model || 'gpt-5.4-mini',
                max_completion_tokens: 8192,
                messages: openAiMessages,
              }),
            });

            if (!response.ok) {
              const status = response.status;
              if (status === 401) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid API key' }));
              } else {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `OpenAI API error (${status})` }));
              }
              return;
            }

            const data = await response.json() as any;
            const content = data.choices?.[0]?.message?.content || '';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ content }));
          } catch (_e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal error' }));
          }
          return;
        }

        // Anthropic BYOK (streaming if requested)
        if (body.stream) {
          try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: model || 'claude-sonnet-4-6',
                max_tokens: 8192,
                system,
                messages,
                stream: true,
              }),
            });

            if (!response.ok) {
              const status = response.status;
              if (status === 401) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid API key' }));
              } else {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Anthropic API error (${status})` }));
              }
              return;
            }

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });

            const reader = response.body?.getReader();
            if (!reader) {
              res.end();
              return;
            }

            const decoder = new TextDecoder();
            let sentenceBuffer = '';

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value as any, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue;
                  const data = line.slice(6).trim();
                  if (data === '[DONE]') continue;
                  try {
                    const event = JSON.parse(data);
                    if (event.type === 'content_block_delta' && event.delta?.text) {
                      sentenceBuffer += event.delta.text;
                      const sentenceEnd = /([.?!\n])\s*/g;
                      let lastEnd = 0;
                      let match: RegExpExecArray | null;
                      while ((match = sentenceEnd.exec(sentenceBuffer)) !== null) {
                        lastEnd = match.index + match[0].length;
                      }
                      if (lastEnd > 0) {
                        const sentence = sentenceBuffer.slice(0, lastEnd);
                        sentenceBuffer = sentenceBuffer.slice(lastEnd);
                        res.write(`data: ${JSON.stringify({ text: sentence })}\n\n`);
                      }
                    }
                  } catch { /* skip */ }
                }
              }
            } finally {
              reader.releaseLock();
            }

            if (sentenceBuffer.trim()) {
              res.write(`data: ${JSON.stringify({ text: sentenceBuffer })}\n\n`);
            }
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
          } catch (e: any) {
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: e.message || 'Internal error' }));
            }
          }
          return;
        }

        // Anthropic BYOK (non-streaming)
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: model || 'claude-sonnet-4-6',
              max_tokens: 8192,
              system,
              messages,
            }),
          });

          if (!response.ok) {
            const status = response.status;
            if (status === 401) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid API key' }));
            } else if (status === 429) {
              res.writeHead(429, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Rate limited — try again shortly' }));
            } else {
              res.writeHead(status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Anthropic API error (${status})` }));
            }
            return;
          }

          const data = await response.json();
          const content = (data as any).content?.[0]?.text || '';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content }));
        } catch (_e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal error' }));
        }
      });

      // Account API proxy
      server.middlewares.use('/api/account', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await readBody(req);
          const { kv } = await import('@vercel/kv');
          const { nanoid } = await import('nanoid');

          const { action, token, journals } = body;

          switch (action) {
            case 'create': {
              const accountToken = nanoid(8);
              const journalIds: string[] = [];
              for (const j of journals) {
                await kv.set(`journal:${j.id}`, j);
                journalIds.push(j.id);
              }
              await kv.set(`account:${accountToken}`, { journalIds });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ token: accountToken }));
              return;
            }
            case 'save': {
              if (!token) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing token' }));
                return;
              }
              const account = await kv.get<{ journalIds: string[] }>(`account:${token}`);
              if (!account) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Account not found' }));
                return;
              }
              const journalIds: string[] = [];
              for (const j of journals) {
                await kv.set(`journal:${j.id}`, j);
                journalIds.push(j.id);
              }
              await kv.set(`account:${token}`, { journalIds });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            case 'load': {
              if (!token) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing token' }));
                return;
              }
              const account = await kv.get<{ journalIds: string[] }>(`account:${token}`);
              if (!account) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Account not found' }));
                return;
              }
              const loaded = [];
              for (const id of account.journalIds) {
                const j = await kv.get(`journal:${id}`);
                if (j) loaded.push(j);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ journals: loaded }));
              return;
            }
            default:
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unknown action' }));
          }
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message || 'Internal error' }));
        }
      });

      // Share API proxy
      server.middlewares.use('/api/share', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await readBody(req);
          const { kv } = await import('@vercel/kv');
          const { nanoid } = await import('nanoid');
          const { action, accountToken, journalId, shareToken, journal, slug, unlisted } = body;

          switch (action) {
            case 'create': {
              if (!accountToken || !journalId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing fields' }));
                return;
              }
              const existing = await kv.get<string>(`share-by-journal:${journalId}`);
              if (existing) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ shareToken: existing }));
                return;
              }
              const token = nanoid(6);
              await kv.set(`share:${token}`, { journalId, createdBy: accountToken, permission: 'edit' });
              await kv.set(`share-by-journal:${journalId}`, token);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ shareToken: token, permission: 'edit' }));
              return;
            }
            case 'import': {
              if (!shareToken) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing shareToken' }));
                return;
              }
              const base = shareToken.replace(/-V$/, '');
              const clientViewOnly = shareToken.endsWith('-V');
              const share = await kv.get<{ journalId: string; createdBy: string; permission?: string }>(`share:${base}`);
              if (!share) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Share token not found' }));
                return;
              }
              const permission = clientViewOnly ? 'view' : (share.permission || 'edit');
              const j = await kv.get(`journal:${share.journalId}`);
              if (!j) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Journal not found' }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ journal: j, permission, shareToken: base, journalId: share.journalId }));
              return;
            }
            case 'get-slug': {
              const slugVal = await kv.get<string>(`slug-by-journal:${journalId}`);
              const unlistedVal = slugVal ? await kv.get<boolean>(`slug-unlisted:${slugVal}`) : false;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ slug: slugVal, unlisted: !!unlistedVal }));
              return;
            }
            case 'create-slug': {
              if (!accountToken || !journalId || !slug) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing fields' }));
                return;
              }
              const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
              let shareTokenVal = await kv.get<string>(`share-by-journal:${journalId}`);
              if (!shareTokenVal) {
                shareTokenVal = nanoid(6);
                await kv.set(`share:${shareTokenVal}`, { journalId, createdBy: accountToken, permission: 'edit' });
                await kv.set(`share-by-journal:${journalId}`, shareTokenVal);
              }
              let finalSlug = cleanSlug;
              const existingOwner = await kv.get<string>(`slug:${finalSlug}`);
              if (existingOwner && existingOwner !== journalId) {
                finalSlug = `${cleanSlug}-${nanoid(4).toLowerCase()}`;
              }
              const oldSlug = await kv.get<string>(`slug-by-journal:${journalId}`);
              if (oldSlug && oldSlug !== finalSlug) {
                await kv.del(`slug:${oldSlug}`);
              }
              await kv.set(`slug:${finalSlug}`, journalId);
              await kv.set(`slug-by-journal:${journalId}`, finalSlug);
              await kv.set(`journal-owner:${journalId}`, accountToken);
              if (unlisted) await kv.set(`slug-unlisted:${finalSlug}`, true);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ slug: finalSlug, shareToken: shareTokenVal }));
              return;
            }
            case 'resolve-slug': {
              if (!slug) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing slug' }));
                return;
              }
              const jId = await kv.get<string>(`slug:${slug}`);
              if (!jId) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Slug not found' }));
                return;
              }
              const j = await kv.get(`journal:${jId}`);
              if (!j) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Journal not found' }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ journal: j, journalId: jId }));
              return;
            }
            case 'update': {
              if (!shareToken || !journal) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing fields' }));
                return;
              }
              const share = await kv.get<{ journalId: string; createdBy: string }>(`share:${shareToken}`);
              if (!share) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Share token not found' }));
                return;
              }
              await kv.set(`journal:${share.journalId}`, journal);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            default:
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unknown action' }));
          }
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message || 'Internal error' }));
        }
      });

      // Social API proxy (likes, leaderboard, profiles)
      server.middlewares.use('/api/social', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await readBody(req);
          const { kv } = await import('@vercel/kv');
          const { action, accountToken, journalId } = body;

          switch (action) {
            case 'like':
            case 'unlike': {
              if (!accountToken || !journalId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing fields' }));
                return;
              }
              const likeKey = `like:${accountToken}:${journalId}`;
              if (action === 'like') {
                await kv.set(likeKey, true);
                const count = await kv.incr(`likes:${journalId}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ liked: true, count }));
              } else {
                await kv.del(likeKey);
                const count = await kv.decr(`likes:${journalId}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ liked: false, count: Math.max(0, count) }));
              }
              return;
            }
            case 'status': {
              const count = (await kv.get<number>(`likes:${journalId}`)) || 0;
              const liked = accountToken ? !!(await kv.get(`like:${accountToken}:${journalId}`)) : false;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ liked, count }));
              return;
            }
            case 'leaderboard': {
              // Simple implementation for dev
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ entries: [] }));
              return;
            }
            case 'featured': {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ entries: [] }));
              return;
            }
            default:
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
          }
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message || 'Internal error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.KV_REST_API_URL = env.KV_REST_API_URL;
  process.env.KV_REST_API_TOKEN = env.KV_REST_API_TOKEN;
  process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

  return {
    root: '.',
    publicDir: 'public',
    plugins: [apiProxy()],
    build: {
      outDir: 'dist',
    },
  };
});
