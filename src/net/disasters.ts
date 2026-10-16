// Natural disasters in the game (rules in game/disasters.ts, the server in worker/disasters.ts). The list is public and
// the same for everyone, so it is polled from the edge-cached GET /api/disasters; what happened to me (a bill, a hurt
// leg, a flooded engine) arrives live on the socket as a 'disaster' event, and as a push when the game is closed.

import { create } from 'zustand';
import { DISASTER_KINDS, DISASTERS, phaseOf, placeDisaster, type Disaster, type DisasterKind, type DisasterPhase } from '../game/disasters';
import { injury } from '../game/injury';
import { useGame } from '../game/store';
import type { CarPart } from '../game/carCare';
import { api, useSession } from './session';
import { refreshBalance, setServerBalance } from './wallet';

interface DisasterHit { id: number; what: string; cost: number }

interface DisasterState {
  list: Disaster[];
  /** Dev-only disasters made up in this tab (?disaster=flood), merged into the list. */
  fake: Disaster[];
  /** The server's clock minus ours, so a phase changes at the same moment for everyone. */
  skew: number;
  hits: DisasterHit[];
  /** Disasters still in their warning that are heading for one of my houses, and the ones I have prepared for. */
  threatened: number[];
  prepared: number[];
  busy: boolean;
  refresh(): Promise<void>;
  prepare(id: number): Promise<void>;
}

export const useDisasters = create<DisasterState>((set, get) => ({
  list: [],
  fake: [],
  skew: 0,
  hits: [],
  threatened: [],
  prepared: [],
  busy: false,
  async refresh() {
    try {
      const res = await api('/api/disasters');
      if (res.ok) {
        const data = (await res.json()) as { now: number; list: Disaster[] };
        // The list can be a few seconds old from the edge cache; the skew only has to be roughly right.
        set({ list: data.list, skew: Math.abs(data.now - Date.now()) < 15_000 ? 0 : data.now - Date.now() });
      }
      if (!useSession.getState().user || !get().list.length) return set({ hits: [], threatened: [], prepared: [] });
      const mine = await api('/api/disasters/mine');
      if (mine.ok) set((await mine.json()) as Pick<DisasterState, 'hits' | 'threatened' | 'prepared'>);
    } catch {
      /* offline: keep what we have */
    }
  },
  async prepare(id) {
    const g = useGame.getState();
    set({ busy: true });
    try {
      const res = await api('/api/disasters/prepare', { method: 'POST', body: JSON.stringify({ id }) });
      const data = (await res.json()) as { balance?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not do that now');
      if (data.balance !== undefined) setServerBalance(data.balance);
      set((s) => ({ prepared: [...s.prepared, id] }));
      const d = allDisasters().find((x) => x.id === id);
      g.toast(`🛡️ Done. If ${d ? `the ${DISASTERS[d.kind].title.toLowerCase()}` : 'it'} reaches your house, the damage will be half.`);
    } catch (error) {
      g.toast(error instanceof Error ? error.message : 'Could not do that now');
    } finally {
      set({ busy: false });
    }
  },
}));

/** The time on the server's clock. */
export const disasterNow = () => Date.now() + useDisasters.getState().skew;

/** Every disaster known, real and (in development) made up. */
export function allDisasters(): Disaster[] {
  const s = useDisasters.getState();
  return s.fake.length ? [...s.list, ...s.fake] : s.list;
}

/** Disasters in that city that can still be seen (warning, on, or leaving traces). */
export function useCityDisasters(city: string): Disaster[] {
  const list = useDisasters((s) => s.list);
  const fake = useDisasters((s) => s.fake);
  return [...list, ...fake].filter((d) => d.city === city && phaseOf(d, disasterNow()) !== 'over');
}

let polling: ReturnType<typeof setInterval> | null = null;
/** Poll the list while the game is open: every minute, and sooner when the tab comes back. Safe to call more than once. */
export function startDisasters() {
  if (polling) return;
  void useDisasters.getState().refresh();
  polling = setInterval(() => {
    if (document.visibilityState === 'visible') void useDisasters.getState().refresh();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void useDisasters.getState().refresh();
  });
}

export interface DisasterEvent {
  t: 'disaster';
  what: 'news' | 'house' | 'shop' | 'car' | 'hurt' | 'relief';
  id: number;
  kind?: DisasterKind;
  text?: string;
  until?: number;
  car?: { id: string; parts: { part: CarPart; amount: number }[] };
}

/** Something a disaster did to me (or a new one to show), from the socket (net/multiplayer.ts). */
export function onDisasterEvent(e: DisasterEvent) {
  const disasters = useDisasters.getState();
  if (e.what === 'news') {
    void disasters.refresh();
    return;
  }
  const g = useGame.getState();
  if (e.text) g.toast(e.text);
  if (e.what === 'house' || e.what === 'relief' || e.what === 'hurt') void refreshBalance();
  if (e.what === 'hurt' && e.until) {
    injury.until = e.until;
    g.hospitalize();
  }
  // The server wrote the same damage into the saved game; this is the copy the open game holds, which it saves next.
  if (e.what === 'car' && e.car) for (const { part, amount } of e.car.parts) g.damageCar(e.car.id, part, amount);
  void disasters.refresh();
}

/* ---------- Development ---------- */

/**
 * Make up a disaster in this tab only, to see it without the server: ?disaster=flood (or several, comma-separated),
 * &dphase=warning|active|aftermath, &dt=0.6 (how far through that phase), &dseed=3 (where it lands), &dcity=lagos.
 * Also window.__disaster('fire', 'active', 0.5) from the console. Nothing reaches the server, so nothing is damaged.
 */
export function fakeDisaster(kind: DisasterKind, phase: DisasterPhase = 'active', t = 0.6, seed = 1, city = useGame.getState().destinationId): Disaster {
  const def = DISASTERS[kind];
  const spot = placeDisaster(kind, city, seed);
  const now = disasterNow();
  // Start it as far back as it takes to be `t` of the way through `phase` now.
  const back = phase === 'warning' ? def.warnMs * t : phase === 'active' ? def.warnMs + def.activeMs * t : def.warnMs + def.activeMs + def.afterMs * t;
  const at = now - back;
  const id = -Math.round(Math.random() * 1e9);
  const strikesAt = at + def.warnMs;
  const endsAt = strikesAt + def.activeMs;
  return { id, ...spot, place: spot.place ?? null, at, strikesAt, endsAt, clearAt: endsAt + def.afterMs, toll: null };
}

if (import.meta.env.DEV) {
  const add = (kind: DisasterKind, phase?: DisasterPhase, t?: number, seed?: number, city?: string) => {
    const d = fakeDisaster(kind, phase, t, seed, city);
    useDisasters.setState((s) => ({ fake: [...s.fake, d] }));
    return d;
  };
  Object.assign(window, {
    __disaster: add,
    __clearDisasters: () => useDisasters.setState({ fake: [] }),
  });
  const q = new URLSearchParams(location.search);
  const kinds = (q.get('disaster') ?? '').split(',').filter((k): k is DisasterKind => DISASTER_KINDS.includes(k as DisasterKind));
  if (kinds.length) {
    // Wait for the game to know which city it is in.
    setTimeout(() => kinds.forEach((k, i) => add(k, (q.get('dphase') as DisasterPhase) ?? 'active', Number(q.get('dt') ?? 0.6), Number(q.get('dseed') ?? 1) + i, q.get('dcity') ?? undefined)), 1500);
  }
}

