// Friends, quests and the season board on the client (server side: worker/community.ts).

import { create } from 'zustand';
import { naira, useGame } from '../game/store';
import { api } from './session';
import { setServerBalance } from './wallet';

export interface Person { uid: string; username: string; at: number; lastSeen?: number | null }
export interface Friends { friends: Person[] }


export interface Quest {
  id: string; label: string; icon: string; target: number; reward: number; points: number; progress: number; claimed: boolean;
}
export interface SeasonRow { rank: number; uid: string; username: string; points: number; me: boolean }
export interface Season {
  id: number; endsAt: number; points: number; rank: number | null; prizes: { rank: number; prize: number }[]; top: SeasonRow[];
}
export interface Prize { season: number; rank: number; prize: number; title: string }
export interface Quests {
  daily: Quest[]; weekly: Quest[]; dayEndsAt: number; weekEndsAt: number; season: Season; prize: Prize | null;
}

interface Community {
  friends: Friends | null;
  quests: Quests | null;
  busy: boolean;
}

export const useCommunity = create<Community>(() => ({
  friends: null, quests: null, busy: false,
}));

const toast = (t: string) => useGame.getState().toast(t);

async function call<T = unknown>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast((data as { error?: string }).error ?? 'Something went wrong');
      return null;
    }
    return data as T;
  } catch {
    toast('No connection');
    return null;
  }
}

export async function loadFriends() {
  const f = await call<Friends>('/api/friends');
  if (f) useCommunity.setState({ friends: f });
}

export async function unfriend(uid: string) {
  const r = await call('/api/friends/remove', { uid });
  if (r) await loadFriends();
  return !!r;
}

/** Server says a reply just made us friends with `username`. */
export function onFriendEvent(e: { uid: string; username: string }) {
  toast(`🤝 You and @${e.username} are now friends`);
  void loadFriends();
}

export async function loadQuests() {
  const q = await call<Quests>('/api/quests');
  if (q) useCommunity.setState({ quests: q });
}

export async function claimQuest(id: string) {
  const r = await call<{ reward: number; points: number; balance: number }>('/api/quests/claim', { id });
  if (r) {
    setServerBalance(r.balance);
    toast(`Quest done: +${naira(r.reward)} · +${r.points} season pts`);
    await loadQuests();
  }
}

export async function claimPrize() {
  const r = await call<{ prize: number; title: string; balance: number }>('/api/quests/prize', {});
  if (r) {
    setServerBalance(r.balance);
    toast(`${r.title}! +${naira(r.prize)} season prize 🏆`);
    await loadQuests();
  }
}
