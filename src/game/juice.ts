// Feel: money that pops off the wallet, confetti on a big win, a screen shake and a buzz in the hand
// when something hits you. startJuice() listens to the game like startSfx() does (game/sfx.ts) and
// ui/Juice.tsx draws it.

import { create } from 'zustand';
import { useGame } from './store';
import { driveState } from './driveState';
import { useCaught } from './caughtScenes';

const KEY_HAPTICS = 'kaduna-haptics-on';

const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

let hapticsOn = read(KEY_HAPTICS, 'true') !== 'false';
export const hapticsEnabled = () => hapticsOn;
export const hapticsSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export function setHaptics(on: boolean) {
  hapticsOn = on;
  try { localStorage.setItem(KEY_HAPTICS, String(on)); } catch { /* storage blocked */ }
  if (on) haptic('tap');
}

const PATTERNS = {
  tap: 10,
  coin: 18,
  win: [20, 40, 20, 40, 70],
  miss: [30, 40, 30],
  thud: 45,
  arrest: [90, 60, 220],
} satisfies Record<string, number | number[]>;
export type Haptic = keyof typeof PATTERNS;

/** Buzz the phone, where the browser can (Android; iOS Safari has no vibrate). */
export function haptic(name: Haptic) {
  if (!hapticsOn || !hapticsSupported()) return;
  try { navigator.vibrate(PATTERNS[name]); } catch { /* not allowed before a tap */ }
}

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface MoneyPop { id: number; amount: number }

export const useJuice = create<{ pops: MoneyPop[]; confetti: number }>(() => ({ pops: [], confetti: 0 }));

/** How long a pop stays on screen (matches the animation in ui/juice.css). */
export const POP_MS = 1400;
export const CONFETTI_MS = 2200;
/** A win this big gets confetti (the same line sfx.ts rings the cash register at). */
const BIG_WIN = 50_000;
/** Money changes smaller than this aren't worth a pop. */
const POP_MIN = 100;

let popId = 1;
function pop(amount: number) {
  const id = popId++;
  useJuice.setState((s) => ({ pops: [...s.pops, { id, amount }].slice(-4) }));
  setTimeout(() => useJuice.setState((s) => ({ pops: s.pops.filter((p) => p.id !== id) })), POP_MS);
}

/** Throw confetti (big wins, new achievements, a perfect shift). */
export function celebrate() {
  haptic('win');
  if (calm()) return;
  useJuice.setState((s) => ({ confetti: s.confetti + 1 }));
}

let shakeTimer: ReturnType<typeof setTimeout> | null = null;
/** Jolt the 3D scene (not the buttons on top of it). */
export function shake(hard = false) {
  if (calm()) return;
  const el = document.querySelector('.scene-wrap');
  if (!el) return;
  el.classList.remove('juice-shake', 'juice-shake-hard');
  // Restart the animation if one is already playing.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(hard ? 'juice-shake-hard' : 'juice-shake');
  if (shakeTimer) clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => el.classList.remove('juice-shake', 'juice-shake-hard'), 600);
}

/** Wire the effects to the game. Returns a cleanup. */
export function startJuice() {
  let prev = useGame.getState();
  // The first seconds of a session move money around while the save and the server wallet load.
  let liveAt = prev.started ? Date.now() + 5000 : Infinity;
  // Wages land as pay plus tax in one go, but a purchase can be several changes: add them up into one pop.
  let sum = 0;
  let sumTimer: ReturnType<typeof setTimeout> | null = null;

  const unsubGame = useGame.subscribe((s) => {
    const p = prev;
    prev = s;
    if (!s.started) {
      liveAt = Infinity;
      return;
    }
    if (!p.started) liveAt = Date.now() + 5000;
    if (Date.now() < liveAt) return;

    const dm = Math.round(s.money - p.money);
    if (dm) {
      sum += dm;
      if (!sumTimer) {
        sumTimer = setTimeout(() => {
          sumTimer = null;
          const total = sum;
          sum = 0;
          if (Math.abs(total) < POP_MIN) return;
          pop(total);
          if (total >= BIG_WIN) celebrate();
          else if (total > 0) haptic('coin');
        }, 250);
      }
    }
    if (s.achievements.length > p.achievements.length) celebrate();
    if (s.governmentOffice && !p.governmentOffice) celebrate();
    if (s.jailedUntil && !p.jailedUntil) {
      shake(true);
      haptic('arrest');
    }
    if ((s.stats.potholes ?? 0) > (p.stats.potholes ?? 0)) {
      shake();
      haptic('thud');
    }
  });

  const unsubCaught = useCaught.subscribe((s, p) => {
    if (s.active && !p.active) {
      shake(true);
      haptic('miss');
    }
  });

  // driveState.bump jumps to 1 on a pothole behind the wheel (it isn't in the store).
  let lastBump = 0;
  const bumpTimer = setInterval(() => {
    if (driveState.bump > 0.9 && lastBump <= 0.9) {
      shake();
      haptic('thud');
    }
    lastBump = driveState.bump;
  }, 60);

  return () => {
    unsubGame();
    unsubCaught();
    clearInterval(bumpTimer);
    if (sumTimer) clearTimeout(sumTimer);
  };
}
