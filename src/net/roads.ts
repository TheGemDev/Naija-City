import { create } from 'zustand';
import '../game/abuja';
import '../game/lagos';
import '../game/kano';
import { allPotholeSites } from '../game/city';
import type { RoadsSnapshot } from '../game/roads';
import { BROKEN_BELOW, DEFAULT_STATE_CAPS, DEFAULT_STATE_LAWS, PLACE_ASSET, type StateAsset, type StateCaps, type StateLaws } from '../game/treasury';
import { setServerBalance } from './wallet';
import { api } from './session';

interface RoadsState {
  /** Open pothole sites. Guests (no server) see every site. */
  open: number[];
  /** Street lights that are out. Guests see them all working. */
  lamps: number[];
  data: RoadsSnapshot | null;
  busy: boolean;
  error: string | null;
  refresh(): Promise<void>;
  fix(site: number, from: 'treasury' | 'pocket', what?: 'pothole' | 'lamp'): Promise<void>;
  /** Every dark street light in the city, from its treasury, in one go. */
  fixAllLamps(city: string): Promise<void>;
  /** Back to every site open (signed out). */
  reset(): void;
}

const ALL = allPotholeSites();

export const useRoads = create<RoadsState>((set) => ({
  open: ALL,
  lamps: [],
  data: null,
  busy: false,
  error: null,
  async refresh() {
    try {
      const res = await api('/api/roads');
      if (!res.ok) return;
      const data = (await res.json()) as RoadsSnapshot;
      set({ data, open: data.open, lamps: data.lamps ?? [] });
    } catch {
      /* offline: keep what we have */
    }
  },
  async fix(site, from, what = 'pothole') {
    set({ busy: true, error: null });
    try {
      const res = await api(what === 'lamp' ? '/api/roads/lamp' : '/api/roads/fix', { method: 'POST', body: JSON.stringify({ site, from }) });
      const result = (await res.json()) as { snapshot?: RoadsSnapshot; balance?: number; error?: string };
      if (!res.ok) throw new Error(result.error ?? `Roads service returned ${res.status}`);
      if (result.snapshot) set({ data: result.snapshot, open: result.snapshot.open, lamps: result.snapshot.lamps ?? [] });
      if (result.balance !== undefined) setServerBalance(result.balance);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Roads service is unavailable' });
    } finally {
      set({ busy: false });
    }
  },
  async fixAllLamps(city) {
    set({ busy: true, error: null });
    try {
      const res = await api('/api/roads/lamps/all', { method: 'POST', body: JSON.stringify({ city }) });
      const result = (await res.json()) as { snapshot?: RoadsSnapshot; balance?: number; error?: string };
      if (!res.ok) throw new Error(result.error ?? `Roads service returned ${res.status}`);
      if (result.snapshot) set({ data: result.snapshot, open: result.snapshot.open, lamps: result.snapshot.lamps ?? [] });
      if (result.balance !== undefined) setServerBalance(result.balance);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Roads service is unavailable' });
    } finally {
      set({ busy: false });
    }
  },
  reset: () => set({ open: ALL, lamps: [], data: null, error: null }),
}));

/** The state asset that keeps this place on the map up, if it has fallen apart (game/treasury.ts BROKEN_BELOW). Null for a place in good order. */
export function brokenAsset(city: string, placeId: string): StateAsset | null {
  const asset = PLACE_ASSET[placeId];
  const condition = asset ? useRoads.getState().data?.assets?.[city]?.[asset] : undefined;
  return asset && condition !== undefined && condition < BROKEN_BELOW ? asset : null;
}

/** A state's own taxes and fees, so a screen can show what things really cost there. The standard ones until the server has said. */
export function useStateLaws(city: string): StateLaws {
  return useRoads((s) => s.data?.laws?.[city]) ?? DEFAULT_STATE_LAWS;
}

/** The most a state may charge for each tax and fee: the president's maximum. */
export function useStateCaps(): StateCaps {
  return useRoads((s) => s.data?.caps) ?? DEFAULT_STATE_CAPS;
}
