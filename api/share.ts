import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { nanoid } from 'nanoid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, accountToken, journalId, shareToken, journal, slug, unlisted } = req.body;

  try {
    switch (action) {
      case 'create': {
        if (!accountToken || !journalId) return res.status(400).json({ error: 'Missing accountToken or journalId' });
        const account = await kv.get<{ journalIds: string[] }>(`account:${accountToken}`);
        if (!account || !account.journalIds.includes(journalId)) {
          return res.status(403).json({ error: 'Account does not own this journal' });
        }
        const existing = await kv.get<string>(`share-by-journal:${journalId}`);
        if (existing) {
          const existingShare = await kv.get(`share:${existing}`);
          if (existingShare) {
            return res.status(200).json({ shareToken: existing });
          }
        }
        const token = nanoid(6);
        await kv.set(`share:${token}`, { journalId, createdBy: accountToken, permission: 'edit' });
        await kv.set(`share-by-journal:${journalId}`, token);
        return res.status(200).json({ shareToken: token, permission: 'edit' });
      }
      case 'import': {
        if (!shareToken) return res.status(400).json({ error: 'Missing shareToken' });
        const base = shareToken.replace(/-V$/, '');
        const clientViewOnly = shareToken.endsWith('-V');
        const share = await kv.get<{ journalId: string; createdBy: string; permission?: string }>(`share:${base}`);
        if (!share) return res.status(404).json({ error: 'Share token not found' });
        const permission = clientViewOnly ? 'view' : (share.permission || 'edit');
        const j = await kv.get(`journal:${share.journalId}`);
        if (!j) return res.status(404).json({ error: 'Journal not found' });
        return res.status(200).json({ journal: j, permission, shareToken: base, journalId: share.journalId });
      }
      case 'update': {
        if (!shareToken || !journal) return res.status(400).json({ error: 'Missing shareToken or journal' });
        const share = await kv.get<{ journalId: string; createdBy: string; permission?: string }>(`share:${shareToken}`);
        if (!share) return res.status(404).json({ error: 'Share token not found' });
        if (share.permission !== 'edit') return res.status(403).json({ error: 'View-only access' });
        await kv.set(`journal:${share.journalId}`, journal);
        return res.status(200).json({ ok: true });
      }
      case 'get-slug': {
        if (!journalId) return res.status(400).json({ error: 'Missing journalId' });
        const slugVal = await kv.get<string>(`slug-by-journal:${journalId}`);
        const unlistedVal = slugVal ? await kv.get<boolean>(`slug-unlisted:${slugVal}`) : false;
        return res.status(200).json({ slug: slugVal, unlisted: !!unlistedVal });
      }
      case 'create-slug': {
        if (!accountToken || !journalId || !slug) return res.status(400).json({ error: 'Missing fields' });
        const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
        if (cleanSlug.length < 3) return res.status(400).json({ error: 'Slug too short' });

        // Ensure share token exists
        let shareTokenVal = await kv.get<string>(`share-by-journal:${journalId}`);
        if (!shareTokenVal) {
          shareTokenVal = nanoid(6);
          await kv.set(`share:${shareTokenVal}`, { journalId, createdBy: accountToken, permission: 'edit' });
          await kv.set(`share-by-journal:${journalId}`, shareTokenVal);
        }

        // Try slug, add suffix if taken
        let finalSlug = cleanSlug;
        const existingOwner = await kv.get<string>(`slug:${finalSlug}`);
        if (existingOwner && existingOwner !== journalId) {
          finalSlug = `${cleanSlug}-${nanoid(4).toLowerCase()}`;
        }

        // Remove old slug if different
        const oldSlug = await kv.get<string>(`slug-by-journal:${journalId}`);
        if (oldSlug && oldSlug !== finalSlug) {
          await kv.del(`slug:${oldSlug}`);
          await kv.del(`slug-unlisted:${oldSlug}`);
        }

        await kv.set(`slug:${finalSlug}`, journalId);
        await kv.set(`slug-by-journal:${journalId}`, finalSlug);
        await kv.set(`journal-owner:${journalId}`, accountToken);
        if (unlisted) await kv.set(`slug-unlisted:${finalSlug}`, true);

        return res.status(200).json({ slug: finalSlug, shareToken: shareTokenVal });
      }
      case 'set-unlisted': {
        if (!accountToken || !journalId) return res.status(400).json({ error: 'Missing fields' });
        const slugKey = await kv.get<string>(`slug-by-journal:${journalId}`);
        if (!slugKey) return res.status(404).json({ error: 'No slug found' });
        if (unlisted) {
          await kv.set(`slug-unlisted:${slugKey}`, true);
        } else {
          await kv.del(`slug-unlisted:${slugKey}`);
        }
        return res.status(200).json({ ok: true });
      }
      case 'resolve-slug': {
        if (!slug) return res.status(400).json({ error: 'Missing slug' });
        const jId = await kv.get<string>(`slug:${slug}`);
        if (!jId) return res.status(404).json({ error: 'Slug not found' });
        const j = await kv.get(`journal:${jId}`);
        if (!j) return res.status(404).json({ error: 'Journal not found' });
        return res.status(200).json({ journal: j, journalId: jId });
      }
      case 'unpublish': {
        if (!accountToken || !journalId) return res.status(400).json({ error: 'Missing fields' });
        const owner = await kv.get<string>(`journal-owner:${journalId}`);
        if (owner !== accountToken) return res.status(403).json({ error: 'Not the owner' });
        const slugToRemove = await kv.get<string>(`slug-by-journal:${journalId}`);
        if (slugToRemove) {
          await kv.del(`slug:${slugToRemove}`);
          await kv.del(`slug-unlisted:${slugToRemove}`);
          await kv.del(`slug-by-journal:${journalId}`);
        }
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
