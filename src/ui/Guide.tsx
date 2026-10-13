import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GUIDE_STOPS, useGuide } from '../game/guide';
import { Emoji } from './Icons';
import './guide.css';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room left round the lit part, and between it and the card. */
const PAD = 6;
const GAP = 14;

/** Where the stop's part of the screen is right now, or null when it is not on screen. */
function boxOf(target: string | undefined): Box | null {
  const el = target ? document.querySelector(target) : null;
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null;
}

/** The first-time tour: lights up one part of the HUD at a time and says what it is for (game/guide.ts). */
export function Guide() {
  const at = useGuide((s) => s.at);
  const step = useGuide((s) => s.step);
  const close = useGuide((s) => s.close);
  const stop = at === null ? null : GUIDE_STOPS[at];
  const [box, setBox] = useState<Box | null>(null);
  /** The way the tour is going, so a stop that is not on screen is passed over in that direction. */
  const [dir, setDir] = useState(1);

  // Follow the part as the screen settles, turns or resizes. A stop whose part is missing is skipped.
  useEffect(() => {
    if (!stop) return;
    if (stop.target && !boxOf(stop.target)) return step(dir);
    let frame = 0;
    const follow = () => {
      const now = boxOf(stop.target);
      setBox((was) => (was && now && was.x === now.x && was.y === now.y && was.w === now.w && was.h === now.h ? was : now));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [stop, step, dir]);

  const go = (by: number) => {
    setDir(by);
    step(by);
  };
  useEffect(() => {
    if (at === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' || e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft' && at > 0) go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, close]); // eslint-disable-line react-hooks/exhaustive-deps

  if (at === null || !stop) return null;
  const lit = stop.target ? box : null;
  const width = Math.min(330, window.innerWidth - 24);
  // The card goes under a part in the top half of the screen and over one in the bottom half, kept inside the edges.
  const below = lit ? lit.y + lit.h / 2 < window.innerHeight / 2 : false;
  const card = lit
    ? {
        width,
        left: Math.max(12, Math.min(window.innerWidth - width - 12, lit.x + lit.w / 2 - width / 2)),
        ...(below ? { top: lit.y + lit.h + GAP } : { bottom: window.innerHeight - lit.y + GAP }),
      }
    : { width };
  const last = at === GUIDE_STOPS.length - 1;
  return createPortal(
    <div className="guide" role="dialog" aria-modal="true" aria-label="A look round the screen">
      <div className={`guide-hole ${lit ? '' : 'none'}`} style={lit ? { left: lit.x, top: lit.y, width: lit.w, height: lit.h } : { left: '50%', top: '50%', width: 0, height: 0 }} />
      <div key={at} className={`guide-card ${lit ? '' : 'middle'}`} style={card}>
        <div className="guide-head">
          <span className="guide-icon">
            <Emoji char={stop.icon} size={24} />
          </span>
          <div>
            <small>
              {at + 1} of {GUIDE_STOPS.length}
            </small>
            <b>{stop.title}</b>
          </div>
        </div>
        <p>{stop.text}</p>
        <div className="guide-btns">
          {!last && (
            <button type="button" className="skip" onClick={close}>
              Skip
            </button>
          )}
          {at > 0 && !last && (
            <button type="button" className="btn back" onClick={() => go(-1)}>
              Back
            </button>
          )}
          <button type="button" className="btn go" style={last ? { flex: 1 } : undefined} onClick={() => go(1)}>
            {last ? 'Start playing' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The row in Settings that plays the tour again. `onPlay` closes whatever the settings are sitting in first. */
export function GuideSettings({ onPlay }: { onPlay: () => void }) {
  return (
    <label className="settings-option">
      <span>
        <b>Tour of the screen</b>
        <small>What the clock, money, needs, map and phone are for</small>
      </span>
      <button type="button" className="btn sm" onClick={onPlay}>
        Replay
      </button>
    </label>
  );
}
