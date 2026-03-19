import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

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
        if (!apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing API key' }));
          return;
        }

        const { system, messages, model } = body;
        if (!system || !messages) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing system or messages' }));
          return;
        }

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
              max_tokens: 4096,
              system,
              messages,
            }),
          });

          if (!response.ok) {
            const errBody = await response.text();
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: errBody }));
            return;
          }

          const data = await response.json();
          const content = (data as any).content?.[0]?.text || '';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content }));
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message || 'Internal error' }));
        }
      });

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
              const account = await kv.get(`account:${token}`) as { journalIds: string[] } | null;
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
              const account = await kv.get(`account:${token}`) as { journalIds: string[] } | null;
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
          const { action, accountToken, journalId, shareToken, journal } = body;

          switch (action) {
            case 'create': {
              if (!accountToken || !journalId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing accountToken or journalId' }));
                return;
              }
              const account = await kv.get(`account:${accountToken}`) as { journalIds: string[] } | null;
              if (!account || !account.journalIds.includes(journalId)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Account does not own this journal' }));
                return;
              }
              const token = nanoid(6);
              await kv.set(`share:${token}`, { journalId, createdBy: accountToken });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ shareToken: token }));
              return;
            }
            case 'import': {
              if (!shareToken) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing shareToken' }));
                return;
              }
              const base = shareToken.replace(/-V$/, '');
              const permission = shareToken.endsWith('-V') ? 'view' : 'edit';
              const share = await kv.get(`share:${base}`) as { journalId: string; createdBy: string } | null;
              if (!share) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Share token not found' }));
                return;
              }
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
            case 'update': {
              if (!shareToken || !journal) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing shareToken or journal' }));
                return;
              }
              if (shareToken.endsWith('-V')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'View-only token cannot update' }));
                return;
              }
              const share = await kv.get(`share:${shareToken}`) as { journalId: string; createdBy: string } | null;
              if (!share) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Share token not found' }));
                return;
              }
              if (journal.id !== share.journalId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Journal ID mismatch' }));
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
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.KV_REST_API_URL = env.KV_REST_API_URL;
  process.env.KV_REST_API_TOKEN = env.KV_REST_API_TOKEN;

  return {
    root: '.',
    publicDir: 'public',
    plugins: [apiProxy()],
    build: {
      outDir: 'dist',
    },
  };
});
