import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { nanoid } from 'nanoid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, token, journals } = req.body;

  try {
    switch (action) {
      case 'create': {
        const accountToken = nanoid(8);
        const journalIds: string[] = [];
        for (const j of journals) {
          await kv.set(`journal:${j.id}`, j);
          journalIds.push(j.id);
        }
        await kv.set(`account:${accountToken}`, { journalIds });
        return res.status(200).json({ token: accountToken });
      }
      case 'save': {
        if (!token) return res.status(400).json({ error: 'Missing token' });
        const account = await kv.get<{ journalIds: string[] }>(`account:${token}`);
        if (!account) return res.status(404).json({ error: 'Account not found' });
        const journalIds: string[] = [];
        for (const j of journals) {
          await kv.set(`journal:${j.id}`, j);
          journalIds.push(j.id);
        }
        await kv.set(`account:${token}`, { journalIds });
        return res.status(200).json({ ok: true });
      }
      case 'load': {
        if (!token) return res.status(400).json({ error: 'Missing token' });
        const account = await kv.get<{ journalIds: string[] }>(`account:${token}`);
        if (!account) return res.status(404).json({ error: 'Account not found' });
        const loaded = [];
        for (const id of account.journalIds) {
          const j = await kv.get(`journal:${id}`);
          if (j) loaded.push(j);
        }
        return res.status(200).json({ journals: loaded });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
