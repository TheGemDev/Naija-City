// Adopted children on the client (Phone → Adopt; rules in src/game/kids.ts, server in worker/kids.ts).
//
// The server is the truth: this keeps its last answer and moves each child's needs on locally with the same
// simulate(), so the bars and the HUD chip move between reads. Care is a game task (src/game/store.ts): this says
// whether one can start, and sends it to the server when it is done.

import { create } from 'zustand';
import { inOwnHouse, naira, useGame } from '../game/store';
import {
  CARE, KIDS, MILESTONE_JOY, careOfAction, kidAlert, kidHooks, simulate, stageOf, type CareId, type KidOffer, type KidSex, type KidSnap, type KidStatus,
} from '../game/kids';
import { api, useSession } from './session';
import { refreshBalance } from './wallet';

export interface Milestone { id: string; at: number; seen: number; shared?: number }
export interface Kid {
  id: number; name: string; sex: KidSex; look: string; story: string; home: string; bornAt: number; status: KidStatus;
  readyAt: number; adoptedAt: number | null; takenAt: number | null;
  snap: KidSnap; asleepUntil: number; schoolUntil: number; strikes: number; milestones: Milestone[];
}
export interface PastKid { id: number; name: string; sex: KidSex; look: string; status: KidStatus; bornAt: number; adoptedAt: number | null }
interface Check { ok: boolean; label: string }
export interface Eligibility { home: Check; arrest: Check; savings: Check; slots: Check; room: number; ok: boolean }

interface KidsState {
  kids: Kid[];
  past: PastKid[];
  offers: KidOffer[];
  nannyUntil: number;
  eligibility: Eligibility | null;
  /** Server clock minus this device's, so a phone with the wrong time still shows the right bars. */
  skew: number;
  loaded: boolean;
}

export const useKids = create<KidsState>(() => ({ kids: [], past: [], offers: [], nannyUntil: 0, eligibility: null, skew: 0, loaded: false }));

const toast = (t: string) => useGame.getState().toast(t);
export const serverNow = () => Date.now() + useKids.getState().skew;

/** A child's needs right now, moved on from the server's snapshot. */
export function liveSnap(k: Kid, at = serverNow()): KidSnap {
  if (k.status !== 'home') return k.snap;
  return simulate(k.snap, { bornAt: k.bornAt, asleepUntil: k.asleepUntil, schoolUntil: k.schoolUntil, nannyUntil: useKids.getState().nannyUntil }, at);
}
export const atHome = (s: KidsState) => s.kids.filter((k) => k.status === 'home');

async function call<T>(path: string, body?: unknown, quiet = false): Promise<T | null> {
  try {
    const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (!quiet) toast((data as { error?: string }).error ?? 'Something went wrong');
      return null;
    }
    return data as T;
  } catch {
    if (!quiet) toast('No connection');
    return null;
  }
}

let loading: Promise<void> | null = null;
const readyTold = new Set<number>();
export function loadKids(quiet = true): Promise<void> {
  if (!useSession.getState().user) return Promise.resolve();
  loading ??= (async () => {
    const before = useKids.getState();
    const r = await call<{ kids: Kid[]; past: PastKid[]; offers: KidOffer[]; nannyUntil: number; eligibility: Eligibility; now: number }>('/api/kids', undefined, quiet);
    if (!r) return;
    useKids.setState({ kids: r.kids, past: r.past, offers: r.offers, nannyUntil: r.nannyUntil, eligibility: r.eligibility, skew: r.now - Date.now(), loaded: true });
    // Things the server decided while we weren't looking.
    if (before.loaded) {
      for (const k of r.kids) {
        const was = before.kids.find((x) => x.id === k.id);
        if (!was) continue;
        if (k.status === 'taken' && was.status !== 'taken') toast(`👶🏾 💔 Social Welfare took ${k.name}. You have 3 days to get ${k.sex === 'f' ? 'her' : 'him'} back in Phone → Adopt.`);
        else if (k.strikes > was.strikes) toast(`👶🏾 ⚠️ Social Welfare warning ${k.strikes} of ${KIDS.strikesToTake}: an officer found ${k.name} neglected.`);
      }
    }
    for (const k of r.kids) {
      if (k.status !== 'pending' || k.readyAt > r.now || readyTold.has(k.id)) continue;
      readyTold.add(k.id);
      toast(`👶🏾 ${k.name}'s papers are ready. Bring ${k.sex === 'f' ? 'her' : 'him'} home in Phone → Adopt.`);
    }
  })().finally(() => { loading = null; });
  return loading;
}

const putKid = (kid: Kid) => useKids.setState((s) => ({ kids: s.kids.map((k) => (k.id === kid.id ? kid : k)) }));

export async function applyFor(key: string, name?: string) {
  const r = await call<{ id: number; readyAt: number }>('/api/kids/apply', { key, name });
  if (r) {
    toast('👶🏾 Application approved! Fee paid. The paperwork takes a few minutes.');
    void refreshBalance();
    await loadKids(false);
  }
  return !!r;
}

export async function collectKid(id: number) {
  const r = await call<{ kid: Kid }>('/api/kids/collect', { id });
  if (r) {
    putKid(r.kid);
    toast(`👶🏾 Welcome home, ${r.kid.name}! 🏠`);
  }
  return !!r;
}

export async function reclaimKid(id: number) {
  const r = await call<{ kid: Kid }>('/api/kids/reclaim', { id });
  if (r) {
    putKid(r.kid);
    toast(`👶🏾 ${r.kid.name} is back home. Social Welfare will be watching.`);
    void refreshBalance();
  }
  return !!r;
}

export async function bookNanny(days: number) {
  const r = await call<{ nannyUntil: number }>('/api/kids/nanny', { days });
  if (r) {
    useKids.setState({ nannyUntil: r.nannyUntil });
    toast(`👶🏾 The nanny is booked for ${days} day${days > 1 ? 's' : ''}. She will keep them fed, clean and happy.`);
    void refreshBalance();
  }
  return !!r;
}

export async function paySchool(id: number) {
  const r = await call<{ kid: Kid; note: string }>('/api/kids/school', { id });
  if (r) {
    putKid(r.kid);
    toast(`👶🏾 ${r.note}`);
    void refreshBalance();
  }
  return !!r;
}

/** Seen a milestone (and maybe posted it): the first time, it lifts the parent's fun and social. */
export async function seeMilestone(id: number, milestone: string, share: boolean) {
  const r = await call<{ joy: boolean; posted: boolean }>('/api/kids/milestone', { id, milestone, share });
  if (!r) return;
  useKids.setState((s) => ({
    kids: s.kids.map((k) => (k.id === id ? { ...k, milestones: k.milestones.map((m) => (m.id === milestone ? { ...m, seen: 1, shared: share ? 1 : m.shared } : m)) } : k)),
  }));
  if (r.joy) {
    useGame.setState((g) => ({ needs: { ...g.needs, fun: Math.min(100, g.needs.fun + MILESTONE_JOY.fun), social: Math.min(100, g.needs.social + MILESTONE_JOY.social) } }));
  }
  if (r.posted) toast('🐦 Posted to Twitter');
}

/* ---------- Care, as game tasks ---------- */

/** Who a care is for: the child at home who needs it most, if anyone does. */
export function careTarget(care: CareId, at = serverNow()): Kid | null {
  const def = CARE[care];
  const list = atHome(useKids.getState())
    .filter((k) => def.stages.includes(stageOf(k.bornAt, at)))
    .map((k) => ({ k, s: liveSnap(k, at) }))
    .filter(({ k, s }) => {
      if (care === 'clinic') return s.sick || s.health < 80;
      if (care === 'sleep') return k.asleepUntil <= at && s.sleep < 85;
      if (care === 'play' && k.asleepUntil > at) return false;
      return s[def.need!] < KIDS.fullAt;
    })
    .sort((a, b) => (def.need ? a.s[def.need] - b.s[def.need] : a.s.health - b.s.health));
  return list[0]?.k ?? null;
}

/** The child each running care task is for, picked when it started. */
const targets = new Map<string, number>();
/** Which child a running care task is for (three/Children.tsx puts them in your arms or at the furniture). */
export const careTargetOf = (actionId: string) => targets.get(actionId) ?? null;

function canStart(actionId: string): boolean {
  const care = careOfAction(actionId);
  if (!care) return false;
  if (!useSession.getState().user) { toast('👶🏾 Sign in to adopt and raise children.'); return false; }
  const kids = atHome(useKids.getState());
  if (!kids.length) { toast(useKids.getState().kids.some((k) => k.status === 'pending') ? '👶🏾 The papers are not done yet. Bring your child home from Phone → Adopt.' : '👶🏾 No child at home yet. Phone → Adopt.'); return false; }
  if (!inOwnHouse(useGame.getState())) { toast('👶🏾 Your children are at home. Go home to care for them 🏠'); return false; }
  const kid = careTarget(care);
  if (!kid) { toast(care === 'clinic' ? '👶🏾 Everybody is well. No need for the doctor.' : care === 'sleep' ? '👶🏾 Nobody is sleepy right now.' : `👶🏾 Nobody needs that right now.`); return false; }
  const cost = CARE[care].cost(stageOf(kid.bornAt, serverNow()));
  if (useGame.getState().money < cost) { toast(`👶🏾 That costs ${naira(cost)}.`); return false; }
  targets.set(actionId, kid.id);
  return true;
}

async function done(actionId: string, itemType: string | null) {
  const care = careOfAction(actionId);
  if (!care) return;
  const id = targets.get(actionId);
  targets.delete(actionId);
  const r = await call<{ kid: Kid; note: string; cost: number }>('/api/kids/care', { id, care, item: itemType ?? undefined });
  if (!r) return;
  putKid(r.kid);
  toast(`👶🏾 ${r.note}${r.cost ? ` · ${naira(r.cost)}` : ''}`);
  if (r.cost) void refreshBalance();
}

kidHooks.canStart = canStart;
kidHooks.done = done;

/** Start the care task for one need: at the right nursery furniture if the house has it, else where you stand. */
export function startCare(care: CareId) {
  const g = useGame.getState();
  const action = `kid_${care}`;
  const item = inOwnHouse(g) ? g.items.find((i) => CARE[care].items.includes(i.type)) : undefined;
  g.startAction(item ? item.id : null, action);
}

/* ---------- Watching ---------- */

const told = new Map<string, number>();
/** The same alert for the same child is said at most this often in the game. */
const TOAST_GAP_MS = 15 * 60_000;

/** Reads the children every minute while signed in, and says when one starts needing something. */
export function watchKids(): () => void {
  void loadKids();
  const read = setInterval(() => { if (document.visibilityState === 'visible') void loadKids(); }, 60_000);
  const look = setInterval(() => {
    const now = serverNow();
    for (const k of atHome(useKids.getState())) {
      const a = kidAlert(k.name, k.sex, stageOf(k.bornAt, now), liveSnap(k, now));
      if (!a) continue;
      const key = `${k.id}:${a.key}`;
      if ((told.get(key) ?? 0) > Date.now() - TOAST_GAP_MS) continue;
      told.set(key, Date.now());
      toast(a.title.startsWith('👶🏾') ? a.title : `👶🏾 ${a.title}`);
    }
  }, 10_000);
  return () => { clearInterval(read); clearInterval(look); };
}
