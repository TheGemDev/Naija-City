// Hangouts and love on the client (server side: worker/hangout.ts).

import { create } from 'zustand';
import type { CheatRecord, HangoutKind, HangoutScope } from '../game/hangout';
import { useGame } from '../game/store';
import { api } from './session';
import { refreshBalance } from './wallet';

export interface HangoutInfo {
  id: number; kind: HangoutKind; scope: HangoutScope; title: string; endsAt: number;
  host: { uid: string; username: string }; guests: string[]; joined: boolean; need: number; max: number;
}
export interface LoveInfo {
  uid: string; username: string; status: 'asked_date' | 'dating' | 'asked_marry' | 'married'; mine: boolean;
  since: number; bond: number; canPropose: boolean; datingFor: number;
  /** Not your main one: you have a babe (or spouse) already. */
  side: boolean;
  /** Ms until you can spend another night together. */
  nightIn: number;
}
export interface Rules { ring: number; bondToMarry: number; datingMs: number; divorce: number; max: number }

interface Hangouts {
  hangouts: HangoutInfo[];
  finalLive: boolean;
  earnedToday: number;
  dailyCap: number;
  lovers: LoveInfo[];
  rules: Rules | null;
  loaded: boolean;
}

export const useHangouts = create<Hangouts>(() => ({
  hangouts: [], finalLive: false, earnedToday: 0, dailyCap: 0, lovers: [], rules: null, loaded: false,
}));

const toast = (t: string) => useGame.getState().toast(t);

async function call<T>(path: string, body?: unknown): Promise<T | null> {
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

export async function loadHangouts() {
  const r = await call<{ hangouts: HangoutInfo[]; finalLive: boolean; earnedToday: number; dailyCap: number }>('/api/hangouts');
  if (r) useHangouts.setState({ ...r, loaded: true });
}

export async function loadLove() {
  const r = await call<{ lovers: LoveInfo[]; rules?: Rules }>('/api/love');
  if (r) useHangouts.setState({ lovers: r.lovers, rules: r.rules ?? useHangouts.getState().rules });
}

export async function hostHangout(kind: HangoutKind, scope: HangoutScope, partner?: string) {
  const r = await call('/api/hangouts/host', { kind, scope, partner });
  if (r) { toast('Hangout open. Call your people!'); await loadHangouts(); }
}

export async function joinHangout(id: number) {
  const r = await call('/api/hangouts/join', { id });
  if (r) { toast('You are in 🎉'); await loadHangouts(); }
}

export async function leaveHangout(id: number) {
  await call('/api/hangouts/leave', { id });
  await loadHangouts();
}

export async function askOut(username: string) {
  const r = await call('/api/love/ask', { username });
  if (r) { toast('Request sent 💌'); await loadLove(); }
  return !!r;
}

const caughtToast = (caught?: string[]) => {
  if (caught?.length) toast(`🔥 @${caught.join(', @')} found out. Wahala!`);
};

export async function loveAction(kind: 'accept' | 'propose' | 'end', uid: string) {
  const r = await call<{ status?: string; caught?: string[] }>(`/api/love/${kind}`, { uid });
  if (r) {
    if (kind === 'accept') toast(r.status === 'married' ? 'You are married! 💍' : 'You are dating 💕');
    if (kind === 'propose') toast('Ring bought. Now we wait… 💍');
    caughtToast(r.caught);
    refreshBalance();
    await loadLove();
  }
  return !!r;
}

/** Fade to black. Restores your energy and grows the bond. */
export async function spendNight(uid: string) {
  const r = await call<{ caught?: string[] }>('/api/love/night', { uid });
  if (r) {
    useGame.setState((s) => ({ needs: { ...s.needs, energy: 100, fun: Math.min(100, s.needs.fun + 25), social: Math.min(100, s.needs.social + 25) } }));
    toast('🌙 You spent the night together. Morning, love 💞');
    caughtToast(r.caught);
    await loadLove();
  }
  return !!r;
}

/* ---------- Cheaters list ---------- */

export interface Cheaters {
  recent: CheatRecord[];
  /** How many cheats are on my own record. */
  mine: number;
  wipeCost: number;
}

export async function loadCheaters() {
  return call<Cheaters>('/api/love/cheaters');
}

export async function searchCheater(username: string) {
  const u = username.trim().replace(/^@/, '');
  if (!u) return null;
  return call<{ username: string; records: CheatRecord[] }>(`/api/love/cheaters/search?u=${encodeURIComponent(u)}`);
}

/** Pay to clear my name off the cheaters list. */
export async function wipeMyCheats() {
  const r = await call<{ balance: number; wipeCost: number }>('/api/love/cheaters/wipe', {});
  if (r) {
    toast('🧽 Your name is clean. For now…');
    refreshBalance();
  }
  return r;
}
