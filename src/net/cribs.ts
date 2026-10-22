// Cribs on the client: scores, ratings, the leaderboard and tours, saved layouts, style packs and designer jobs.
// Server: worker/cribs.ts. Rules: game/cribs.ts.

import { create } from 'zustand';
import { api, pushSaveNow, useSession } from './session';
import { setServerBalance } from './wallet';
import { requestHomeVisit } from './social';
import { enterHouseVisit } from './visit';
import { planVisit } from '../ui/visitTrip';
import { avatarCell } from '../game/avatar';
import { ITEMS } from '../game/catalog';
import { houseLayout, placementError, type PlacedItem } from '../game/grid';
import { activeDesignOf, houseKeyOf, inOwnHouse, moneyHooks, naira, txn, useGame, type GameState } from '../game/store';
import { useVisit, type HouseVisit } from '../game/visits';
import { serialize, saveLocal } from '../game/save';
import {
  layoutQuote, snapshotHouse, STYLE_PACK_BY_ID, type CribPart, type DesignDraft, type DesignJobStatus, type LayoutSnapshot,
} from '../game/cribs';

/* ---------- Types the server sends ---------- */

export interface CribHouse { pid: string; design: string | null; city: string; base: number; score: number; tier: string; value: number; items: number; parts: CribPart[]; rating: { avg: number; n: number; weighted: number } | null }
export interface TopHouse { uid: string; pid: string; design: string | null; city: string; score: number; base: number; tier: string; value: number; items: number; username: string; name: string | null; rating: { n: number; avg: number } | null }
export interface Tour { id: number; uid: string; pid: string; city: string; region: string | null; slot: number | null; caption: string; open: boolean; score: number; tier: string; layout: LayoutSnapshot; at: number; username: string; photo: string | null }
export interface SavedLayout { id: number; name: string; design: string | null; snapshot: LayoutSnapshot; items: number; value: number; at: number }
export interface DesignJob {
  id: number; pid: string; design: string | null; fee: number; budget: number; spent: number; status: DesignJobStatus; note: string; hours: number;
  createdAt: number; acceptedAt: number | null; expiresAt: number | null; submittedAt: number | null; settledAt: number | null; delivered: boolean; version: number;
  client: { uid: string; username: string | null }; designer: { uid: string; username: string | null }; role: 'client' | 'designer';
  draft?: DesignDraft; base?: DesignDraft; pieces?: number;
}
export interface JobLog { actor: string; action: string; detail: string; amount: number; at: number }

interface CribsState {
  houses: CribHouse[];
  best: { pid: string; score: number; tier: string } | null;
  designer: { xp: number; level: number; jobs: number } | null;
  top: Record<string, TopHouse[]>;
  tours: Tour[];
  layouts: SavedLayout[];
  jobs: DesignJob[];
  loading: boolean;
}

export const useCribs = create<CribsState>(() => ({ houses: [], best: null, designer: null, top: {}, tours: [], layouts: [], jobs: [], loading: false }));

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await api(path, { ...init, ...(init?.json !== undefined ? { method: init.method ?? 'POST', body: JSON.stringify(init.json) } : {}) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
const signedIn = () => !!useSession.getState().user;

/* ---------- Scores ---------- */

/** My houses' scores. The game's latest save goes up first, so the score is of the house as it is now. */
export async function loadMyCribs(fresh = false) {
  if (!signedIn()) return;
  useCribs.setState({ loading: true });
  try {
    if (fresh) await pushSaveNow().catch(() => {});
    const d = await call<{ houses: CribHouse[]; best: CribsState['best']; designer: CribsState['designer'] }>('/api/cribs/me');
    useCribs.setState({ houses: d.houses, best: d.best, designer: d.designer });
  } finally {
    useCribs.setState({ loading: false });
  }
}

export const loadHouseCard = (uid: string, pid?: string | null) =>
  call<{ owner: { uid: string; username: string | null }; house: CribHouse; reviews: { stars: number; comment: string; at: number; username: string | null }[]; ratedToday: number | null }>(
    `/api/cribs/house?uid=${encodeURIComponent(uid)}${pid ? `&pid=${encodeURIComponent(pid)}` : ''}`,
  );

export async function loadTop(city: string | null) {
  const d = await call<{ houses: TopHouse[] }>(`/api/cribs/top${city ? `?city=${city}` : ''}`);
  useCribs.setState((s) => ({ top: { ...s.top, [city ?? 'all']: d.houses } }));
}

/* ---------- Visits and ratings ---------- */

/** Tell the server a visit began, so the guest can rate the house later (it checks the room really let them in). */
async function checkIn(owner: string) {
  try {
    await call('/api/cribs/checkin', { json: { owner } });
  } catch {
    /* offline, or not a real visit: no rating then */
  }
}
// Every time a visit starts (not a break-in), check in. A second check a little later covers a slow room.
useVisit.subscribe((s, p) => {
  const v = s.current;
  if (!v || v.burglary || (p.current && p.current.ownerUid === v.ownerUid)) return;
  void checkIn(v.ownerUid);
  setTimeout(() => { if (useVisit.getState().current?.ownerUid === v.ownerUid) void checkIn(v.ownerUid); }, 5_000);
});

export const rateHouse = (owner: string, pid: string, stars: number, comment: string) =>
  call<{ ok: true; score: number | null; tier: string | null }>('/api/cribs/rate', { json: { owner, pid, stars, comment } });

/* ---------- Tours ---------- */

export async function loadTours() {
  const d = await call<{ tours: Tour[] }>('/api/cribs/tours');
  useCribs.setState({ tours: d.tours });
}

export async function postTour(pid: string, caption: string, open: boolean, snapId: number | null) {
  await pushSaveNow().catch(() => {});
  await call('/api/cribs/tours', { json: { pid, caption, open, snapId } });
  await loadTours();
}

export const deleteTour = async (id: number) => {
  await call(`/api/cribs/tours/${id}`, { method: 'DELETE' });
  useCribs.setState((s) => ({ tours: s.tours.filter((t) => t.id !== id) }));
};

/**
 * Visit a toured house through the usual visit flow: an open house lets you in once you get there (the trip to its
 * state and estate first, ui/visitTrip.ts); otherwise the owner gets a visit request to answer.
 */
export async function visitTour(t: Tour) {
  if (!t.open) {
    await requestHomeVisit(t.uid);
    useGame.getState().toast(`🚪 Asked @${t.username} to let you in. You’ll get a message when they answer.`);
    return;
  }
  const open = async (): Promise<HouseVisit> => {
    const d = await call<{ home?: HouseVisit; request?: boolean }>(`/api/cribs/tours/${t.id}/visit`, { json: {} });
    if (!d.home) throw new Error('That house is not open any more');
    return d.home;
  };
  planVisit({ city: t.city, region: t.region, slot: t.slot, owner: t.username, finish: open });
  useGame.getState().toast(`🧭 Off to @${t.username}’s house. Get to ${t.region ? 'the estate' : 'their city'} and you’ll walk in.`);
}

/* ---------- Layouts ---------- */

export async function loadLayouts() {
  const d = await call<{ layouts: SavedLayout[] }>('/api/cribs/layouts');
  useCribs.setState({ layouts: d.layouts });
}

/** The house I'm standing in, as a layout snapshot (furniture, paint and every per-house decorating value in the save). */
export function currentSnapshot(): LayoutSnapshot {
  const s = useGame.getState();
  const key = houseKeyOf(s);
  return snapshotHouse(serialize() as unknown as Record<string, unknown>, key, s.items, activeDesignOf(s));
}

export async function saveLayout(name: string) {
  await call('/api/cribs/layouts', { json: { name, snapshot: currentSnapshot() } });
  await loadLayouts();
}

export const deleteLayout = async (id: number) => {
  await call(`/api/cribs/layouts/${id}`, { method: 'DELETE' });
  useCribs.setState((s) => ({ layouts: s.layouts.filter((l) => l.id !== id) }));
};

/** Where layouts and packs can be put: only in your own house, standing inside it. */
export function applyBlocker(): string | null {
  const s = useGame.getState();
  if (!inOwnHouse(s)) return 'Go home first: layouts go into the house you are standing in';
  if (s.task) return 'Finish what you are doing first';
  if (s.rentedOut?.includes(houseKeyOf(s))) return 'This house is rented out';
  return null;
}

/** What a snapshot would cost to lay out here: pieces in this house or in storage are reused. */
export function quoteHere(items: { type: string }[], reuseHouse = true) {
  const s = useGame.getState();
  return layoutQuote(items, [...(reuseHouse ? s.items : []), ...s.furnitureInventory]);
}

/** Pays for pieces the way the shop does: one wallet event per piece, so the server counts each as owned. */
function buyPieces(types: string[], label: string) {
  const total = types.reduce((sum, t) => sum + (ITEMS[t]?.price ?? 0), 0);
  if (!total) return;
  useGame.setState((s) => ({ money: s.money - total, txns: [txn(s, label, -total), ...s.txns].slice(0, 40) }));
  for (const t of types) moneyHooks.onChange?.({ amount: -ITEMS[t].price, kind: 'buy', ref: t });
}

let uid = Date.now();
const newId = () => `c${(uid++).toString(36)}`;

/** Sets this house's value in every per-house save map the snapshot carried (finishes, lighting...), and property fields. */
function applyDecor(s: GameState, key: string, snap: LayoutSnapshot): Partial<GameState> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(snap.decor ?? {})) {
    const cur = (s as unknown as Record<string, unknown>)[field];
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) out[field] = { ...(cur as object), [key]: value };
  }
  if (snap.prop && Object.keys(snap.prop).length) out.properties = s.properties.map((p) => (p.id === key ? { ...p, ...snap.prop } : p));
  return out as Partial<GameState>;
}

/**
 * Lays a snapshot (a saved layout, or a style pack placed by autoPlace) out in the house I'm in: every piece now here
 * or in storage is reused where the snapshot wants one like it, the rest is bought at today's price, anything that
 * doesn't fit this house goes to storage, and the paint and decorating values come with it.
 * `keepRest`: style packs leave the furniture already in the house where it is.
 */
export function applySnapshot(snap: LayoutSnapshot, opts: { keepRest?: boolean; label: string }): { bought: number; spent: number; stored: number } {
  const s = useGame.getState();
  const key = houseKeyOf(s);
  const layout = houseLayout(activeDesignOf(s), s.wallEdits[key]);
  const fixed = s.items.filter((i) => ITEMS[i.type]?.fixed);
  const kept: PlacedItem[] = opts.keepRest ? s.items.filter((i) => !ITEMS[i.type]?.fixed) : [];
  const pool: PlacedItem[] = [...(opts.keepRest ? [] : s.items.filter((i) => !ITEMS[i.type]?.fixed)), ...s.furnitureInventory];
  const toBuy: string[] = [];
  const placed: PlacedItem[] = [...fixed, ...kept];
  const stored: PlacedItem[] = [];
  const here = avatarCell();
  // Pieces standing on others (game/mount.ts) go last, onto whatever their table became here.
  const onTop = (i: { on?: unknown }) => typeof i.on === 'string';
  const order = [...snap.items.filter((i) => !onTop(i)), ...snap.items.filter(onTop)];
  const ids = new Map<string, string>();
  for (const want of order) {
    if (!ITEMS[want.type] || ITEMS[want.type].fixed) continue;
    const idx = pool.findIndex((p) => p.type === want.type && !p.stolen);
    const piece: PlacedItem = idx >= 0 ? pool.splice(idx, 1)[0] : { id: newId(), type: want.type, x: 0, z: 0, rot: 0 };
    if (idx < 0) toBuy.push(want.type);
    const { id: was, ...fields } = want as typeof want & { on?: string };
    const next = { ...piece, ...fields, id: piece.id } as PlacedItem;
    if (onTop(want)) next.on = ids.get((want as { on?: string }).on!) ?? '__gone';
    if (placementError(next, placed, here, undefined, layout)) {
      // Back to plain storage: no pose left over from the layout.
      const { mount: _m, on: _o, px: _x, pz: _z, y: _y, rotDeg: _r, ...plain } = piece;
      stored.push(plain);
    } else {
      placed.push(next);
      if (was) ids.set(was, piece.id);
    }
  }
  const spent = toBuy.reduce((sum, t) => sum + ITEMS[t].price, 0);
  buyPieces(toBuy, opts.label);
  useGame.setState((st) => ({
    items: placed,
    furnitureInventory: [...pool, ...stored],
    housePaint: snap.paint ? { ...st.housePaint, [key]: { ...snap.paint } } : st.housePaint,
    selectedId: null,
    placing: null,
    ...applyDecor(st, key, snap),
  }));
  saveLocal();
  return { bought: toBuy.length, spent, stored: stored.length };
}

/** A pack's finishes go into the house's own finishes, only when the house keeps them on the property (game/cribs.ts StylePack). */
function packFinishes(s: GameState, finishes?: Record<string, string>): Pick<LayoutSnapshot, 'prop'> | null {
  const property = s.properties.find((p) => p.id === houseKeyOf(s)) as (Record<string, unknown> | undefined);
  const cur = property?.finishes;
  if (!finishes || !cur || typeof cur !== 'object') return null;
  return { prop: { finishes: { ...(cur as object), ...finishes } } };
}

/** A style pack's pieces, placed by autoPlace into this house (the preview and the apply use the same plan). */
export function packSnapshot(packId: string, placed: { type: string; x: number; z: number; rot: number; paint?: (string | null)[] | null }[]): LayoutSnapshot {
  const pack = STYLE_PACK_BY_ID[packId];
  const s = useGame.getState();
  return {
    v: 1,
    design: activeDesignOf(s),
    items: placed.map((p) => ({ ...p, ...(pack.itemPaint?.[p.type] ? { paint: pack.itemPaint[p.type] } : {}) })),
    paint: pack.paint,
    ...(packFinishes(s, pack.finishes) ?? {}),
  };
}

/* ---------- Designer jobs ---------- */

export async function loadJobs() {
  if (!signedIn()) return;
  const d = await call<{ jobs: DesignJob[] }>('/api/design/jobs');
  useCribs.setState({ jobs: d.jobs });
  void deliverJobs(d.jobs);
}

export const loadJob = (id: number) => call<{ job: DesignJob; log: JobLog[] }>(`/api/design/${id}`);

export async function hireDesigner(designer: string, pid: string, fee: number, budget: number, hours: number, note: string) {
  await pushSaveNow().catch(() => {});
  const d = await call<{ id: number; balance: number }>('/api/design/hire', { json: { designer, pid, fee, budget, hours, note } });
  setServerBalance(d.balance);
  await loadJobs();
  return d.id;
}

export async function jobAction(id: number, action: 'accept' | 'decline' | 'cancel' | 'submit' | 'approve' | 'revert') {
  const d = await call<{ balance?: number }>(`/api/design/${id}/${action}`, { json: {} });
  if (typeof d.balance === 'number') setServerBalance(d.balance);
  await loadJobs();
}

export type DesignOp =
  | { op: 'move'; itemId: string; x: number; z: number; rot: number }
  | { op: 'place'; itemId: string; x: number; z: number; rot: number }
  | { op: 'store'; itemId: string }
  | { op: 'buy'; type: string; x: number; z: number; rot: number }
  | { op: 'paint'; part: 'inner' | 'outer'; colour: string | null };

export const jobOp = (id: number, version: number, op: DesignOp) =>
  call<{ version: number; draft: DesignDraft; spent: number }>(`/api/design/${id}/op`, { json: { ...op, version } });

const delivering = new Set<number>();

/**
 * A settled job reaches my house: approved, the designer's arrangement goes in (pieces I still have, matched by id,
 * plus what they bought); reverted, the house stays and what they bought goes to storage. Ids make it safe to repeat.
 */
async function deliverJobs(jobs: DesignJob[]) {
  for (const j of jobs) {
    if (j.role !== 'client' || j.delivered || (j.status !== 'approved' && j.status !== 'reverted') || delivering.has(j.id)) continue;
    delivering.add(j.id);
    try {
      const { job } = await loadJob(j.id);
      if (job.draft) applyDesign(job, job.draft);
      await call(`/api/design/${j.id}/delivered`, { json: {} });
    } catch {
      delivering.delete(j.id);
    }
  }
}

function applyDesign(job: DesignJob, draft: DesignDraft) {
  const s = useGame.getState();
  const active = houseKeyOf(s) === job.pid;
  const property = s.properties.find((p) => p.id === job.pid);
  const houseItems = active ? s.items : property?.items ?? [];
  const all = [...houseItems, ...s.furnitureInventory, ...s.properties.filter((p) => p.id !== job.pid).flatMap((p) => p.items ?? [])];
  const have = new Set(all.map((i) => i.id));
  const bought = new Set(draft.bought);
  const boughtPieces = [...draft.items, ...draft.storage].filter((i) => bought.has(i.id) && !have.has(i.id));
  if (job.status === 'reverted') {
    if (boughtPieces.length) useGame.setState((st) => ({ furnitureInventory: [...st.furnitureInventory, ...boughtPieces.map((i) => ({ id: i.id, type: i.type, x: 0, z: 0, rot: 0 }))] }));
    useGame.getState().toast(boughtPieces.length ? `📦 ${boughtPieces.length} piece${boughtPieces.length === 1 ? '' : 's'} your designer bought went to storage.` : 'The design was reverted.');
    saveLocal();
    return;
  }
  // The pool is this house plus storage; the design takes what it places from it, by id.
  const pool = new Map([...houseItems, ...s.furnitureInventory].map((i) => [i.id, i]));
  const next: PlacedItem[] = [];
  for (const d of draft.items) {
    const mine = pool.get(d.id);
    if (mine) { pool.delete(d.id); next.push({ ...mine, x: d.x, z: d.z, rot: d.rot }); }
    else if (bought.has(d.id) && !have.has(d.id)) next.push({ id: d.id, type: d.type, x: d.x, z: d.z, rot: d.rot });
  }
  const leftovers = [...pool.values()].filter((i) => !ITEMS[i.type]?.fixed);
  const storageBought = draft.storage.filter((i) => bought.has(i.id) && !have.has(i.id)).map((i) => ({ id: i.id, type: i.type, x: 0, z: 0, rot: 0 }));
  // A fixed piece (the gate) that the draft somehow lacks stays in the house.
  for (const i of houseItems) if (ITEMS[i.type]?.fixed && !next.some((n) => n.id === i.id)) next.push(i);
  useGame.setState((st) => ({
    ...(active ? { items: next } : { properties: st.properties.map((p) => (p.id === job.pid ? { ...p, items: next } : p)) }),
    furnitureInventory: [...leftovers, ...storageBought],
    housePaint: draft.paint ? { ...st.housePaint, [job.pid]: { ...draft.paint } } : st.housePaint,
    selectedId: null,
  }));
  saveLocal();
  useGame.getState().toast(`🛋️ Your house has its new look from @${job.designer.username ?? 'your designer'}.`);
}

// Settled jobs reach the house soon after sign-in and then every couple of minutes.
let jobTimer: ReturnType<typeof setInterval> | null = null;
useSession.subscribe((s, p) => {
  if (s.status === 'ready' && p.status !== 'ready') {
    setTimeout(() => void loadJobs().catch(() => {}), 8_000);
    jobTimer ??= setInterval(() => void loadJobs().catch(() => {}), 120_000);
  }
  if (!s.user && jobTimer) { clearInterval(jobTimer); jobTimer = null; }
});

export const formatNaira = naira;
export { enterHouseVisit };
