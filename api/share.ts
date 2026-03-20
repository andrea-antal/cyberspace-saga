import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { nanoid } from 'nanoid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, accountToken, journalId, shareToken, journal } = req.body;

  try {
    switch (action) {
      case 'create': {
        if (!accountToken || !journalId) return res.status(400).json({ error: 'Missing accountToken or journalId' });
        const account = await kv.get<{ journalIds: string[] }>(`account:${accountToken}`);
        if (!account || !account.journalIds.includes(journalId)) {
          return res.status(403).json({ error: 'Account does not own this journal' });
        }
        // Return existing token if one already exists for this journal
        const existing = await kv.get<string>(`share-by-journal:${journalId}`);
        if (existing) {
          const existingShare = await kv.get(`share:${existing}`);
          if (existingShare) {
            return res.status(200).json({ shareToken: existing });
          }
        }
        const token = nanoid(6);
        await kv.set(`share:${token}`, { journalId, createdBy: accountToken });
        await kv.set(`share-by-journal:${journalId}`, token);
        return res.status(200).json({ shareToken: token });
      }
      case 'import': {
        if (!shareToken) return res.status(400).json({ error: 'Missing shareToken' });
        const base = shareToken.replace(/-V$/, '');
        const permission = shareToken.endsWith('-V') ? 'view' : 'edit';
        const share = await kv.get<{ journalId: string; createdBy: string }>(`share:${base}`);
        if (!share) return res.status(404).json({ error: 'Share token not found' });
        const j = await kv.get(`journal:${share.journalId}`);
        if (!j) return res.status(404).json({ error: 'Journal not found' });
        return res.status(200).json({ journal: j, permission, shareToken: base, journalId: share.journalId });
      }
      case 'update': {
        if (!shareToken || !journal) return res.status(400).json({ error: 'Missing shareToken or journal' });
        if (shareToken.endsWith('-V')) return res.status(403).json({ error: 'View-only token cannot update' });
        const share = await kv.get<{ journalId: string; createdBy: string }>(`share:${shareToken}`);
        if (!share) return res.status(404).json({ error: 'Share token not found' });
        if (journal.id !== share.journalId) return res.status(400).json({ error: 'Journal ID mismatch' });
        await kv.set(`journal:${share.journalId}`, journal);
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
