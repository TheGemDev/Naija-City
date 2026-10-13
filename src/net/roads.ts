import { create } from 'zustand';
import '../game/abuja';
import '../game/lagos';
import '../game/kano';
import { allPotholeSites } from '../game/city';
import type { RoadsSnapshot } from '../game/roads';
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
  reset: () => set({ open: ALL, lamps: [], data: null, error: null }),
}));
