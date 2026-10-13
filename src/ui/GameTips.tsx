import { useEffect, useRef } from 'react';
import { dayOf, useGame } from '../game/store';
import { TIPS, tipToast, useHelp } from '../game/tips';

/** Show a random tip via the toast system every few game-minutes. */
export function GameTips() {
  const started = useGame((s) => s.started);
  const minutes = useGame((s) => Math.floor(s.minutes));
  const tipsOn = useHelp((s) => s.tipsOn);
  const shownRef = useRef<Set<number>>(new Set());
  const lastTipAt = useRef(0);

  useEffect(() => {
    if (!started || !tipsOn) return;
    const day = dayOf(minutes);
    // Wait until at least mid-Day 1 before the first tip
    if (day < 1 || (day === 1 && minutes % 1440 < 300)) return;
    // Show a tip roughly every 2 game-hours (120 game-minutes)
    if (minutes - lastTipAt.current < 120) return;
    // Don't show tips when the player is busy with a task
    if (useGame.getState().task) return;

    // Pick a random unseen tip
    const unseen = TIPS.map((_, i) => i).filter((i) => !shownRef.current.has(i));
    if (unseen.length === 0) shownRef.current.clear(); // reset once all shown
    const pool = unseen.length > 0 ? unseen : TIPS.map((_, i) => i);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    shownRef.current.add(pick);
    lastTipAt.current = minutes;

    useGame.getState().toast(tipToast(TIPS[pick]));
  }, [started, minutes, tipsOn]);

  return null;
}
