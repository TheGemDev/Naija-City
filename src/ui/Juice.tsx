import { useEffect, useMemo, useState } from 'react';
import { CONFETTI_MS, useJuice } from '../game/juice';
import { naira } from '../game/store';
import './juice.css';

const COLOURS = ['#16a34a', '#facc15', '#f97316', '#38bdf8', '#f472b6', '#ffffff'];
const PIECES = 36;

/** Where the wallet sits on screen, so money pops come off it. */
function walletSpot() {
  const r = document.querySelector('.money-card-top')?.getBoundingClientRect();
  return r ? { left: r.left + r.width / 2, top: r.bottom } : { left: window.innerWidth / 2, top: 70 };
}

function Confetti({ burst }: { burst: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        fall: 1.3 + Math.random() * 0.8,
        drift: (Math.random() - 0.5) * 160,
        spin: (Math.random() - 0.5) * 1080,
        colour: COLOURS[i % COLOURS.length],
        wide: Math.random() < 0.5,
      })),
    // New pieces for each burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst],
  );
  return (
    <div className="juice-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          className={p.wide ? 'wide' : ''}
          style={{
            left: `${p.left}%`,
            background: p.colour,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.fall}s`,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}

/** Money pops and confetti, drawn over everything and never in the way of a tap. */
export function Juice() {
  const pops = useJuice((s) => s.pops);
  const confetti = useJuice((s) => s.confetti);
  const [showing, setShowing] = useState(0);

  useEffect(() => {
    if (!confetti) return;
    setShowing(confetti);
    const id = setTimeout(() => setShowing(0), CONFETTI_MS);
    return () => clearTimeout(id);
  }, [confetti]);

  const spot = pops.length ? walletSpot() : null;
  return (
    <div className="juice-layer" aria-hidden="true">
      {spot &&
        pops.map((p, i) => (
          <b key={p.id} className={`juice-pop ${p.amount > 0 ? 'gain' : 'loss'}`} style={{ left: spot.left, top: spot.top + i * 4 }}>
            {p.amount > 0 ? '+' : '−'}
            {naira(Math.abs(p.amount))}
          </b>
        ))}
      {showing > 0 && <Confetti burst={showing} />}
    </div>
  );
}
