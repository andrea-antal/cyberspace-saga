import type { Journal } from './types';

async function cloudFetch(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

export async function saveToCloud(token: string, journals: Journal[]): Promise<void> {
  await cloudFetch('/api/account', { action: 'save', token, journals });
}

export async function loadFromCloud(token: string): Promise<Journal[]> {
  const data = await cloudFetch('/api/account', { action: 'load', token });
  return data.journals;
}

export async function createShareToken(accountToken: string, journalId: string): Promise<string> {
  const data = await cloudFetch('/api/share', { action: 'create', accountToken, journalId });
  return data.shareToken;
}

export async function importShared(shareToken: string): Promise<{ journal: Journal; permission: 'edit' | 'view'; shareToken: string; journalId: string }> {
  return cloudFetch('/api/share', { action: 'import', shareToken });
}

export async function updateShared(shareToken: string, journal: Journal): Promise<void> {
  await cloudFetch('/api/share', { action: 'update', shareToken, journal });
}

export async function fetchSharedJournal(shareToken: string): Promise<Journal> {
  const data = await cloudFetch('/api/share', { action: 'import', shareToken });
  return data.journal;
}

export async function getSlug(journalId: string): Promise<{ slug: string | null; unlisted: boolean }> {
  const data = await cloudFetch('/api/share', { action: 'get-slug', journalId });
  return { slug: data.slug, unlisted: !!data.unlisted };
}

export async function createSlug(accountToken: string, journalId: string, slug: string, unlisted?: boolean): Promise<{ slug: string; shareToken: string }> {
  return cloudFetch('/api/share', { action: 'create-slug', accountToken, journalId, slug, unlisted });
}

export async function setUnlisted(accountToken: string, journalId: string, unlisted: boolean): Promise<void> {
  await cloudFetch('/api/share', { action: 'set-unlisted', accountToken, journalId, unlisted });
}

export async function resolveSlug(slug: string): Promise<{ journal: Journal; journalId: string }> {
  return cloudFetch('/api/share', { action: 'resolve-slug', slug });
}

export async function unpublishSlug(accountToken: string, journalId: string): Promise<void> {
  await cloudFetch('/api/share', { action: 'unpublish', accountToken, journalId });
}

export async function likeJournal(accountToken: string, journalId: string): Promise<{ liked: boolean; count: number }> {
  return cloudFetch('/api/social', { action: 'like', accountToken, journalId });
}

export async function unlikeJournal(accountToken: string, journalId: string): Promise<{ liked: boolean; count: number }> {
  return cloudFetch('/api/social', { action: 'unlike', accountToken, journalId });
}

export async function getLikeStatus(accountToken: string | null, journalId: string): Promise<{ liked: boolean; count: number }> {
  return cloudFetch('/api/social', { action: 'status', accountToken, journalId });
}

export async function getLeaderboard(): Promise<{ entries: { journalId: string; likes: number; title: string; slug: string | null; creatorUsername: string | null }[] }> {
  return cloudFetch('/api/social', { action: 'leaderboard' });
}

export async function saveProfile(username: string, bio: string, links: string[]): Promise<any> {
  return cloudFetch('/api/social', { action: 'save-profile', username, bio, links });
}

export async function getProfile(): Promise<{ profile: any | null }> {
  return cloudFetch('/api/social', { action: 'get-profile' });
}

export async function resolveProfile(username: string): Promise<{ profile: any; stories: { journalId: string; title: string; slug: string; likes: number }[]; totalLikes: number }> {
  return cloudFetch('/api/social', { action: 'resolve-profile', username });
}

export async function deleteProfile(): Promise<any> {
  return cloudFetch('/api/social', { action: 'delete-profile' });
}

export async function restoreProfile(): Promise<any> {
  return cloudFetch('/api/social', { action: 'restore-profile' });
}

export async function getFeaturedStories(): Promise<{ entries: { journalId: string; likes: number; title: string; slug: string | null; creatorUsername: string | null }[] }> {
  return cloudFetch('/api/social', { action: 'featured' });
}
