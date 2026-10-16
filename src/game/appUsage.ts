// Which phone apps you actually use, for the home screen's Frequent row (ui/Phone.tsx). Each open adds a point that
// fades with a half-life of a few days, so the row follows what you use now without one busy afternoon fixing it for
// good. Kept in this browser only: it is a convenience, and losing it just empties the row.

import { create } from 'zustand';

const KEY = 'naija-app-usage';
/** An open counts half as much after this long. */
const HALF_LIFE_MS = 3 * 24 * 3600_000;
/** Below this an app has not been used enough lately to earn a place. */
const MIN_SCORE = 1.5;

type Usage = Record<string, { score: number; at: number }>;

function load(): Usage {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Usage) : {};
  } catch {
    return {};
  }
}

const decayed = (u: { score: number; at: number }, now: number) => u.score * 0.5 ** ((now - u.at) / HALF_LIFE_MS);

export const useAppUsage = create<{ usage: Usage }>(() => ({ usage: load() }));

/** You opened an app from the home screen. */
export function noteAppOpen(id: string) {
  const now = Date.now();
  const usage = { ...useAppUsage.getState().usage };
  usage[id] = { score: (usage[id] ? decayed(usage[id], now) : 0) + 1, at: now };
  useAppUsage.setState({ usage });
  try {
    localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    /* private window or full storage: the row just won't remember */
  }
}

/** Your `n` most used apps lately, out of `allowed`, most used first. */
export function frequentApps<T extends string>(usage: Usage, allowed: T[], n: number): T[] {
  const now = Date.now();
  return allowed
    .map((id) => ({ id, s: usage[id] ? decayed(usage[id], now) : 0 }))
    .filter((a) => a.s >= MIN_SCORE)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((a) => a.id);
}
