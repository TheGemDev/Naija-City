// Neighbours in the estates. Signed-in players send their properties up (worker/estate.ts checks them
// against what they actually paid for and hands out plot slots); everyone can look at who has land
// in a region. Guests still see their own estate, just without neighbours.

import { create } from 'zustand';
import { estateHooks, useGame } from '../game/store';
import { sectionOf, type EstateLot } from '../game/estate';
import type { PlotSize } from '../game/property';
import { api, useSession } from './session';
import { flushWallet } from './wallet';

export interface Neighbour extends EstateLot {
  pid: string;
  uid: string;
  owner: string;
  building: boolean;
  /** An NPC citizen's house (src/game/npcs.ts): how many children live there. */
  kids?: number | null;
}

interface EstateState {
  /** Other players' plots, by region. */
  byRegion: Record<string, Neighbour[]>;
  /** Plot slots handed out so far in each region (highest slot + 1), which says how many estates it has. */
  totals: Record<string, number>;
  loading: string | null;
  /** Slot tapped in the estate scene. */
  picked: number | null;
}

export const useEstate = create<EstateState>(() => ({ byRegion: {}, totals: {}, loading: null, picked: null }));

const myUid = () => useSession.getState().user?.uid;
const others = (region: string) => (useEstate.getState().byRegion[region] ?? []).filter((n) => n.uid !== myUid());

/** Everyone's plots in one estate of a region (public, no sign-in needed). */
export async function loadEstate(region: string, no: number) {
  useEstate.setState({ loading: region });
  try {
    const res = await fetch(`/api/estate/${region}?n=${no}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const { plots, total } = (await res.json()) as { plots: Neighbour[]; total: number };
    useEstate.setState((s) => ({
      byRegion: { ...s.byRegion, [region]: [...(s.byRegion[region] ?? []).filter((n) => sectionOf(n.slot) !== no), ...plots] },
      totals: { ...s.totals, [region]: total },
    }));
  } catch {
    /* offline or local dev without the API: just no neighbours */
  } finally {
    useEstate.setState((s) => (s.loading === region ? { loading: null } : {}));
  }
}

/** Send my properties up; apply the slots the server assigned. */
async function syncNow() {
  const s = useSession.getState();
  if (!s.user || s.offline || s.status !== 'ready') return;
  // The server checks each property against the ledger, so the payments must land first.
  await flushWallet();
  const props = useGame.getState().properties.map((p) => ({ id: p.id, region: p.region, plot: p.plot, design: p.design, stage: p.stage, building: !!p.building, want: p.chosenSlot }));
  const res = await api('/api/estate/sync', { method: 'POST', body: JSON.stringify({ properties: props }) });
  if (!res.ok) return;
  const { slots } = (await res.json()) as { slots: Record<string, number> };
  useGame.setState((g) => ({
    properties: g.properties.map((p) => (slots[p.id] !== undefined && slots[p.id] !== p.slot ? { ...p, slot: slots[p.id] } : p)),
  }));
}

let timer: ReturnType<typeof setTimeout> | null = null;
const schedule = () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => syncNow().catch(() => {}), 2500);
};

/** What a property looks like to the estate (plot, design, stage), so cosmetic changes don't resync. */
const shape = (ps: ReturnType<typeof useGame.getState>['properties']) =>
  ps.map((p) => `${p.id}:${p.region}:${p.plot}:${p.design}:${p.stage}:${p.building ? 1 : 0}`).join('|');

export function startEstate() {
  estateHooks.slots = (region) => others(region).map((n) => n.slot);
  estateHooks.lots = (region) => [
    ...others(region),
    ...useGame
      .getState()
      .properties.filter((p) => p.region === region)
      .map((p) => ({ slot: p.slot ?? 0, plot: p.plot as PlotSize, stage: p.stage, design: p.design })),
  ];
  estateHooks.onVisit = (region, no) => void loadEstate(region, no);
  const unGame = useGame.subscribe((g, prev) => {
    if (g.properties !== prev.properties && shape(g.properties) !== shape(prev.properties)) schedule();
  });
  const unSession = useSession.subscribe((s, prev) => {
    if (s.status === 'ready' && prev.status !== 'ready') schedule();
  });
  if (useSession.getState().status === 'ready') schedule();
  return () => {
    unGame();
    unSession();
    estateHooks.slots = estateHooks.lots = estateHooks.onVisit = null;
  };
}
