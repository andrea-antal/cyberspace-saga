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

export async function createAccount(journals: Journal[]): Promise<string> {
  const data = await cloudFetch('/api/account', { action: 'create', journals });
  return data.token;
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
