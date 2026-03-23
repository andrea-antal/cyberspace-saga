import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

export interface Profile {
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  links?: string[];
  accountToken: string;
  usernameChangedAt?: string;
  deletedAt?: string;
}

const USERNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

function cleanUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, accountToken, journalId, username } = req.body;

  try {
    switch (action) {
      case 'like': {
        if (!accountToken || !journalId) return res.status(400).json({ error: 'Missing fields' });
        const likeKey = `like:${accountToken}:${journalId}`;
        const already = await kv.get(likeKey);
        if (already) return res.status(200).json({ liked: true, count: await getLikeCount(journalId) });
        await kv.set(likeKey, true);
        const count = await kv.incr(`likes:${journalId}`);
        return res.status(200).json({ liked: true, count });
      }
      case 'unlike': {
        if (!accountToken || !journalId) return res.status(400).json({ error: 'Missing fields' });
        const likeKey = `like:${accountToken}:${journalId}`;
        const exists = await kv.get(likeKey);
        if (!exists) return res.status(200).json({ liked: false, count: await getLikeCount(journalId) });
        await kv.del(likeKey);
        const count = await kv.decr(`likes:${journalId}`);
        return res.status(200).json({ liked: false, count: Math.max(0, count) });
      }
      case 'status': {
        if (!journalId) return res.status(400).json({ error: 'Missing journalId' });
        const count = await getLikeCount(journalId);
        const liked = accountToken ? !!(await kv.get(`like:${accountToken}:${journalId}`)) : false;
        return res.status(200).json({ liked, count });
      }
      case 'leaderboard': {
        const slugKeys = await kv.keys('slug:*');
        const entries: { journalId: string; likes: number; title: string; slug: string | null; creatorUsername: string | null }[] = [];

        for (const key of slugKeys.slice(0, 100)) {
          const slug = key.replace('slug:', '');
          if (slug.includes(':')) continue;
          const isUnlisted = await kv.get(`slug-unlisted:${slug}`);
          if (isUnlisted) continue;
          const jId = await kv.get<string>(key);
          if (!jId) continue;
          const likes = await getLikeCount(jId);
          const j = await kv.get<{ title: string }>(` journal:${jId}`);
          const ownerToken = await kv.get<string>(`journal-owner:${jId}`);
          let creatorUsername: string | null = null;
          if (ownerToken) {
            const profile = await kv.get<Profile>(`profile:${ownerToken}`);
            if (profile && !profile.deletedAt) creatorUsername = profile.username;
          }
          entries.push({ journalId: jId, likes, title: j?.title || 'Untitled', slug, creatorUsername });
        }

        entries.sort((a, b) => b.likes - a.likes);
        return res.status(200).json({ entries: entries.slice(0, 20) });
      }
      case 'featured': {
        const featuredIds = await kv.get<string[]>('featured-stories') || [];
        const entries: { journalId: string; likes: number; title: string; slug: string | null; creatorUsername: string | null }[] = [];
        for (const jId of featuredIds) {
          const likes = await getLikeCount(jId);
          const j = await kv.get<{ title: string }>(`journal:${jId}`);
          const slug = await kv.get<string>(`slug-by-journal:${jId}`);
          const ownerToken = await kv.get<string>(`journal-owner:${jId}`);
          let creatorUsername: string | null = null;
          if (ownerToken) {
            const profile = await kv.get<Profile>(`profile:${ownerToken}`);
            if (profile && !profile.deletedAt) creatorUsername = profile.username;
          }
          entries.push({ journalId: jId, likes, title: j?.title || 'Untitled', slug, creatorUsername });
        }
        return res.status(200).json({ entries });
      }
      case 'save-profile': {
        if (!accountToken) return res.status(401).json({ error: 'Missing accountToken' });
        const { bio, links } = req.body;
        const cleanName = cleanUsername(username || '');
        if (!USERNAME_RE.test(cleanName)) return res.status(400).json({ error: 'Invalid username' });

        const existing = await kv.get<Profile>(`profile:${accountToken}`);
        const oldUsername = existing?.username;
        const isChange = oldUsername && oldUsername !== cleanName;

        if (isChange && existing?.usernameChangedAt) {
          const elapsed = Date.now() - new Date(existing.usernameChangedAt).getTime();
          if (elapsed < USERNAME_COOLDOWN_MS) {
            return res.status(400).json({ error: 'Username was changed recently. Please wait before changing again.' });
          }
        }

        // Check username availability
        if (!oldUsername || isChange) {
          const taken = await kv.get(`username:${cleanName}`);
          if (taken && taken !== accountToken) return res.status(400).json({ error: 'Username is taken' });
        }

        // Release old username
        if (isChange && oldUsername) {
          await kv.del(`username:${oldUsername}`);
        }

        const profile: Profile = {
          username: cleanName,
          displayName: cleanName,
          bio: (bio || '').slice(0, 280),
          links: Array.isArray(links) ? links.slice(0, 3).map((l: string) => (l || '').slice(0, 200)) : [],
          accountToken,
          usernameChangedAt: isChange ? new Date().toISOString() : existing?.usernameChangedAt,
        };

        await kv.set(`profile:${accountToken}`, profile);
        await kv.set(`username:${cleanName}`, accountToken);
        return res.status(200).json({ ok: true, profile });
      }
      case 'get-profile': {
        if (!accountToken) return res.status(401).json({ error: 'Missing accountToken' });
        const profile = await kv.get<Profile>(`profile:${accountToken}`);
        const isDeleted = !!profile?.deletedAt;
        const deleteGraceRemaining = isDeleted && profile?.deletedAt
          ? Math.max(0, Math.ceil((new Date(profile.deletedAt).getTime() + DELETE_GRACE_MS - Date.now()) / (24 * 60 * 60 * 1000)))
          : null;
        const canChangeUsername = !profile?.usernameChangedAt || (Date.now() - new Date(profile.usernameChangedAt).getTime() >= USERNAME_COOLDOWN_MS);
        return res.status(200).json({ profile, canChangeUsername, isDeleted, deleteGraceRemaining });
      }
      case 'resolve-profile': {
        const { username: reqUsername } = req.body;
        if (!reqUsername) return res.status(400).json({ error: 'Missing username' });
        const ownerToken = await kv.get<string>(`username:${reqUsername.toLowerCase()}`);
        if (!ownerToken) return res.status(404).json({ error: 'Profile not found' });
        const profile = await kv.get<Profile>(`profile:${ownerToken}`);
        if (!profile || profile.deletedAt) return res.status(404).json({ error: 'Profile not found' });

        // Get stories
        const account = await kv.get<{ journalIds: string[] }>(`account:${ownerToken}`);
        const stories: { journalId: string; title: string; slug: string; likes: number }[] = [];
        let totalLikes = 0;
        if (account) {
          for (const jId of account.journalIds) {
            const slug = await kv.get<string>(`slug-by-journal:${jId}`);
            if (!slug) continue;
            const isUnlisted = await kv.get(`slug-unlisted:${slug}`);
            if (isUnlisted) continue;
            const j = await kv.get<{ title: string }>(`journal:${jId}`);
            const likes = await getLikeCount(jId);
            totalLikes += likes;
            stories.push({ journalId: jId, title: j?.title || 'Untitled', slug, likes });
          }
        }
        stories.sort((a, b) => b.likes - a.likes);
        return res.status(200).json({ profile: { ...profile, accountToken: undefined }, stories, totalLikes });
      }
      case 'delete-profile': {
        if (!accountToken) return res.status(401).json({ error: 'Missing accountToken' });
        const profile = await kv.get<Profile>(`profile:${accountToken}`);
        if (!profile) return res.status(404).json({ error: 'No profile' });
        profile.deletedAt = new Date().toISOString();
        await kv.set(`profile:${accountToken}`, profile);
        return res.status(200).json({ ok: true });
      }
      case 'restore-profile': {
        if (!accountToken) return res.status(401).json({ error: 'Missing accountToken' });
        const profile = await kv.get<Profile>(`profile:${accountToken}`);
        if (!profile) return res.status(404).json({ error: 'No profile' });
        delete profile.deletedAt;
        await kv.set(`profile:${accountToken}`, profile);
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}

async function getLikeCount(journalId: string): Promise<number> {
  const count = await kv.get<number>(`likes:${journalId}`);
  return count || 0;
}
