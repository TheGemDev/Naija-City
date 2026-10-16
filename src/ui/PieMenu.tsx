// Desktop: click something in a house or a place and its activities fan out in a circle round where you clicked,
// the way The Sims does it, instead of the activities sheet (Sheets.tsx ActionSheet, which phones keep). Same
// actions, same detail line (as a tooltip and a small caption), same start.

import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { useSelectedActions } from './Sheets';

/** A real mouse or trackpad: phones and tablets keep the sheet, which suits a thumb better. */
export const PIE_MENU = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Where the pointer last went down, so the menu opens round the thing that was clicked. */
const last = { x: 0, y: 0 };
if (PIE_MENU) window.addEventListener('pointerdown', (e) => { last.x = e.clientX; last.y = e.clientY; }, { capture: true });

/** Room the labels need past the ring, so a menu near the edge of the window slides in instead of being cut off. */
const EDGE = 90;

export function PieMenu() {
  const sel = useSelectedActions();
  const start = useGame((s) => s.startAction);
  const select = useGame((s) => s.select);
  const id = sel?.selectedId ?? null;
  const [at, setAt] = useState({ x: 0, y: 0 });

  // A new selection opens where it was clicked.
  useEffect(() => {
    if (id) setAt({ x: last.x, y: last.y });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, select]);

  if (!PIE_MENU || !sel) return null;
  const n = sel.rows.length;
  // The ring grows with the number of activities so the labels never overlap.
  const r = Math.min(170, Math.max(84, n * 22));
  const cx = Math.min(window.innerWidth - r - EDGE, Math.max(r + EDGE, at.x));
  const cy = Math.min(window.innerHeight - r - 40, Math.max(r + 40, at.y));

  return (
    <div className="pie" style={{ left: cx, top: cy }} role="menu" aria-label={sel.title}>
      <button type="button" className="pie-hub" title="Close (Esc)" aria-label={`Close the ${sel.title} menu`} onClick={() => select(null)}>
        <span aria-hidden>✕</span>
      </button>
      {n === 0 && <span className="pie-none">Nothing to do with this one ✨</span>}
      {sel.rows.map(({ action: a, sub, dim }, i) => {
        // First activity at the top, the rest clockwise.
        const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
        return (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            className={`pie-item ${dim ? 'dim' : ''}`}
            title={sub || a.label}
            style={{ left: Math.cos(ang) * r, top: Math.sin(ang) * r, ['--i' as string]: i }}
            onClick={() => start(sel.selectedId, a.id)}
          >
            <span className="pie-icon">{a.icon}</span>
            <span className="pie-text">
              <b>{a.label}</b>
              {sub && <small>{sub}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
