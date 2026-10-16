// The server-paid side hustles on the client (worker/hustles.ts): the daily check-in, freelance gigs, the farm and
// invite bonuses. The server decides every payout; this keeps its answer and the wallet balance it sends back.

import { create } from 'zustand';
import type { CropId, FreelanceBrief, FreelanceKind } from '../game/hustles';
import { naira, useGame } from '../game/store';
import { api } from './session';
import { setServerBalance } from './wallet';

export interface FreelanceTask { id: string; kind: FreelanceKind; pay: number; startedAt: number; minMs: number; expiresAt: number; brief: FreelanceBrief }
export interface FarmPlot { slot: number; crop: CropId | null; plantedAt: number | null }

export interface HustleState {
  now: number;
  day: number;
  dayEnds: number;
  daily: { claimed: boolean; streak: number; best: number; reward: number; week: number[] };
  freelance: { done: number; earned: number; perDay: number; knowledge: number; active: FreelanceTask | null };
  farm: { plots: FarmPlot[]; prices: Record<CropId, number> };
  referral: { ready: string[]; waiting: number; paidThisWeek: number; welcome: 'none' | 'pending' | 'ready' | 'paid'; shifts: number };
}

/** The last freelance hand-in, so the phone can show how it was marked. */
export interface FreelanceResult { score: number; earned: number; net: number; late: boolean; answer: unknown }

interface Store {
  state: HustleState | null;
  /** The server's clock minus this device's, so timers count down to the server's moments. */
  skew: number;
  busy: boolean;
  result: FreelanceResult | null;
}

export const useHustle = create<Store>(() => ({ state: null, skew: 0, busy: false, result: null }));

const toast = (t: string) => useGame.getState().toast(t);

async function call<T>(path: string, body?: unknown): Promise<(T & { state?: HustleState; balance?: number }) | null> {
  useHustle.setState({ busy: true });
  try {
    const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { state?: HustleState; balance?: number; error?: string };
    if (!res.ok) {
      toast(data.error ?? 'Something went wrong');
      return null;
    }
    if (typeof data.balance === 'number') setServerBalance(data.balance);
    if (data.state) keep(data.state);
    return data;
  } catch {
    toast('No connection');
    return null;
  } finally {
    useHustle.setState({ busy: false });
  }
}

function keep(state: HustleState) {
  useHustle.setState({ state, skew: state.now - Date.now() });
}

export async function loadHustles() {
  try {
    const res = await api('/api/hustle');
    if (res.ok) keep((await res.json()) as HustleState);
  } catch {
    /* offline: the tab shows what it last had */
  }
}

export async function claimDaily() {
  const r = await call<{ reward: number; streak: number }>('/api/hustle/daily', {});
  if (r) toast(`📅 Day ${r.streak} check-in: +${naira(r.reward)}${r.streak % 7 === 0 ? ' Salary day! 🎉' : ''}`);
}

export async function startFreelance(kind: FreelanceKind) {
  useHustle.setState({ result: null });
  const r = await call<{ task: FreelanceTask }>('/api/hustle/freelance/start', { kind });
  if (r) {
    const s = useHustle.getState().state;
    if (s) useHustle.setState({ state: { ...s, freelance: { ...s.freelance, active: r.task } } });
  }
}

export async function submitFreelance(id: string, answer: unknown) {
  const r = await call<FreelanceResult>('/api/hustle/freelance/submit', { id, answer });
  if (!r) return;
  useHustle.setState({ result: { score: r.score, earned: r.earned, net: r.net, late: r.late, answer: r.answer } });
  toast(r.earned > 0 ? `💻 Client paid ${naira(r.earned)} (${Math.round(r.score * 100)}% happy)` : r.late ? '⌛ Too late. The client found someone else' : '😬 The client was not happy. No pay this time');
}

export async function leasePlot() {
  const r = await call<{ slot: number; cost: number }>('/api/hustle/farm/lease', {});
  if (r) toast(`🌾 Plot ${r.slot + 1} is yours for ${naira(r.cost)}. Time to plant!`);
}

export async function plantCrop(slot: number, crop: CropId) {
  await call('/api/hustle/farm/plant', { slot, crop });
}

export async function harvestCrop(slot: number) {
  const r = await call<{ crop: CropId; value: number; net: number; rotten: boolean }>('/api/hustle/farm/harvest', { slot });
  if (r) toast(r.rotten ? `🥀 It rotted in the ground. The market paid only ${naira(r.value)}` : `🧺 Sold the harvest at the market for ${naira(r.value)}`);
}

export async function claimReferrals() {
  const r = await call<{ paid: number; count: number; welcome: number }>('/api/hustle/referral/claim', {});
  if (!r) return;
  const parts = [r.paid ? `${naira(r.paid)} for ${r.count} friend${r.count === 1 ? '' : 's'}` : '', r.welcome ? `${naira(r.welcome)} welcome bonus` : ''].filter(Boolean);
  toast(`🤝 ${parts.join(' + ')}`);
}
