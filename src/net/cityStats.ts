// The two public numbers on the phone's home screen and the landing page: players online and site visits.
// Server side: worker/lobby.ts counts both as they happen and /api/stats serves them.

import { create } from 'zustand';

export interface CityStats { online: number; visitsTotal: number }

export const useCityStats = create<{ stats: CityStats | null }>(() => ({ stats: null }));

/** /api/stats may be a couple of seconds old, so for this long after the room pushed a count, the pushed one is newer. */
const PUSH_WINS_MS = 3000;
let pushedAt = 0;

// Visits only ever go up, so an older answer arriving late never takes the number back down.
const set = (online: number, visitsTotal: number) =>
  useCityStats.setState((s) => ({ stats: { online, visitsTotal: Math.max(visitsTotal, s.stats?.visitsTotal ?? 0) } }));

/** The room sends the totals whenever someone joins or leaves it (worker/room.ts), so the online count moves at once. */
export function onCityEvent(m: { online: number; visits?: number }) {
  pushedAt = Date.now();
  set(m.online, m.visits ?? 0);
}

async function loadCityStats() {
  const asked = Date.now();
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const d = (await res.json()) as CityStats;
    const shown = useCityStats.getState().stats;
    set(shown && pushedAt > asked - PUSH_WINS_MS ? shown.online : d.online, d.visitsTotal);
  } catch { /* offline: keep the last numbers */ }
}

/** Keep the numbers fresh for as long as the caller shows them and the page is on screen. Returns the stop function. */
export function watchCityStats(everyMs = 10_000) {
  const load = () => {
    if (document.visibilityState === 'visible') void loadCityStats();
  };
  load();
  const timer = setInterval(load, everyMs);
  document.addEventListener('visibilitychange', load);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', load);
  };
}
