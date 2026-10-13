// Faces for players a screen only knows by uid or @username (leaderboards, feeds, lists). Asked for in one batch and
// kept for the session (server side: /api/looks in worker/social.ts).

import { create } from 'zustand';
import { api } from './session';

/** Looks by uid, or by `@username`. `null` means we asked and they have none. */
export const useLooks = create<Record<string, string | null>>(() => ({}));

export const lookKey = (uid?: string | null, username?: string | null) => uid || (username ? `@${username.toLowerCase()}` : '');

const BATCH = 40;
const asked = new Set<string>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Ask for a player's look. Calls made close together go out as one request. */
export function wantLook(key: string) {
  if (!key || asked.has(key)) return;
  asked.add(key);
  queue.push(key);
  timer ??= setTimeout(flush, 60);
}

async function flush() {
  const batch = queue.slice(0, BATCH);
  queue = queue.slice(BATCH);
  timer = queue.length ? setTimeout(flush, 60) : null;
  const uids = batch.filter((k) => !k.startsWith('@'));
  const names = batch.filter((k) => k.startsWith('@')).map((k) => k.slice(1));
  try {
    const res = await api(`/api/looks?u=${uids.map(encodeURIComponent).join(',')}&n=${names.map(encodeURIComponent).join(',')}`);
    if (!res.ok) throw new Error('looks');
    const { players } = (await res.json()) as { players: Array<{ uid: string; username: string | null; look: string | null }> };
    const next: Record<string, string | null> = Object.fromEntries(batch.map((k) => [k, null]));
    for (const p of players) {
      next[p.uid] = p.look;
      if (p.username) next[lookKey(null, p.username)] = p.look;
    }
    useLooks.setState(next);
  } catch {
    // Signed out or offline: the initial stays, and the next screen that shows them asks again.
    batch.forEach((k) => asked.delete(k));
  }
}
