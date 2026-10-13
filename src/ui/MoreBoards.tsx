// Street Games boards: Dara, Snakes & Ladders and Scrabble. As with the other board files, these draw the
// view the server sent and send back taps; the server checks everything (including every Scrabble word).

import { useEffect, useState } from 'react';
import { LUDO_COLORS } from '../game/ludo';
import { LADDERS, SNAKES, snakeCell } from '../game/snakes';
import { BLANK, SCRABBLE_PREMIUMS, SCRABBLE_CENTRE, SCRABBLE_RACK, SCRABBLE_VALUES } from '../game/scrabble';
import type { DaraView, ScrabblePlacement, ScrabbleView, SnakesView } from '../game/streetGames';
import { Die, seatName, type BoardProps } from './GameBoards';

/* ---------- Dara ---------- */

export function DaraBoard({ m, busy, play }: BoardProps) {
  const v = m.view as DaraView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me) && !busy;
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [v.board, v.phase]);
  const targets = sel === null ? [] : v.moves.filter(([from]) => from === sel).map(([, to]) => to);
  const tap = (sq: number) => {
    if (!mine) return;
    if (v.phase === 'drop') { if (v.spots.includes(sq)) play({ drop: sq }); return; }
    if (v.phase === 'take') { if (v.spots.includes(sq)) play({ take: sq }); return; }
    if (sel !== null && targets.includes(sq)) play({ from: sel, to: sq });
    else setSel(v.moves.some(([from]) => from === sq) ? sq : null);
  };
  const other = seatName(m, me === 0 ? 1 : 0);
  let line = '';
  if (!over) {
    if (me < 0) line = v.phase === 'drop' ? 'They are putting their stones down.' : 'They are sliding stones, looking for three in a line.';
    else if (!mine) line = v.phase === 'take' ? `${other} made three and is choosing a stone to remove!` : `Waiting for ${other}…`;
    else if (v.phase === 'drop') line = `Put a stone down. ${v.hand[me]} left. No lines of three yet.`;
    else if (v.phase === 'take') line = 'Three in a line! Tap one of their stones to remove it.';
    else line = sel === null ? 'Slide a stone one step. Make exactly three in a line.' : 'Now tap the hole next to it.';
  }
  const stones = (seat: number) => [...v.board].filter((p) => p === String(seat)).length;
  return (
    <div className="sg-board sg-dara">
      <div className="sg-scores">
        {[0, 1].map((seat) => (
          <div key={seat} className={v.turn === seat && !over ? 'turn' : ''}>
            <b><i className={`sg-stone s${seat}`} /> {seatName(m, seat)}</b>
            <small>{stones(seat)} on the board{v.hand[seat] ? ` · ${v.hand[seat]} in hand` : ''}</small>
          </div>
        ))}
      </div>
      <div className="sg-dara-sand">
        {[...v.board].map((p, sq) => {
          const can = mine && (v.phase === 'move' ? (sel === null ? v.moves.some(([from]) => from === sq) : targets.includes(sq)) : v.spots.includes(sq));
          const cls = [can ? 'can' : '', sel === sq ? 'sel' : '', v.last?.to === sq ? 'last' : '', v.last?.took === sq ? 'took' : '', mine && v.phase === 'take' && can ? 'kill' : ''].join(' ');
          return (
            <button key={sq} className={cls} disabled={!mine} onClick={() => tap(sq)} aria-label={`Hole ${sq + 1}${p === '.' ? '' : p === String(me) ? ', your stone' : ', their stone'}`}>
              {p !== '.' && <i className={`sg-stone s${p}`} />}
            </button>
          );
        })}
      </div>
      <p className="sg-line">{line}</p>
    </div>
  );
}

/* ---------- Snakes & Ladders ---------- */

/** A snake's body: a curve from head to tail that bends one way then the other. */
function snakePath([x1, y1]: [number, number], [x2, y2]: [number, number]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const bend = Math.min(0.9, len * 0.22);
  const px = (-dy / len) * bend;
  const py = (dx / len) * bend;
  return `M${x1} ${y1} C${x1 + dx * 0.25 + px} ${y1 + dy * 0.25 + py} ${x1 + dx * 0.4 - px} ${y1 + dy * 0.4 - py} ${x1 + dx * 0.5} ${y1 + dy * 0.5} S${x1 + dx * 0.8 + px} ${y1 + dy * 0.8 + py} ${x2} ${y2}`;
}

const SNAKE_COLORS = ['#b91c1c', '#7e22ce', '#be185d', '#c2410c', '#0f766e'];

export function SnakesBoard({ m, busy, play }: BoardProps) {
  const v = m.view as SnakesView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me) && !busy;
  const crowd = new Map<number, number>();
  const last = v.last;
  let line = 'Roll to start. First to 100 wins.';
  if (last) {
    const who = seatName(m, last.seat);
    line = `${who} rolled ${last.die}`;
    if (last.from === last.to) line += ' but needs the exact number';
    else if (last.jump === 'ladder') line += `, climbed a ladder to ${last.to}! 🪜`;
    else if (last.jump === 'snake') line += `, and a snake swallowed ${last.seat === me ? 'you' : 'them'} down to ${last.to} 🐍`;
    else line += ` and moved to ${last.to}`;
    line += last.die === 6 && last.to !== 100 ? '. Six: roll again!' : '.';
  }
  return (
    <div className="sg-board sg-snakes">
      <div className="sg-ludo-seats">
        {m.players.map((p, seat) => (
          <span key={p.uid} className={`${v.turn === seat && !over ? 'turn' : ''} ${v.out[seat] ? 'out' : ''}`}>
            <i style={{ background: LUDO_COLORS[seat].fill }} />
            {seatName(m, seat)} · {v.pos[seat]}
          </span>
        ))}
      </div>
      <svg viewBox="-1 0 11 10" className="sg-snakes-svg" role="img" aria-label="Snakes and ladders board">
        <rect x="-1" width="1" height="10" fill="#e2e8f0" />
        {Array.from({ length: 100 }, (_, i) => {
          const [x, y] = snakeCell(i + 1);
          return (
            <g key={i}>
              <rect x={x - 0.5} y={y - 0.5} width="1" height="1" fill={(Math.floor(x) + Math.floor(y)) % 2 ? '#fef9c3' : '#fde68a'} />
              <text x={x - 0.42} y={y - 0.16} fontSize="0.3" fill="#92400e">{i + 1}</text>
            </g>
          );
        })}
        {Object.entries(LADDERS).map(([from, to]) => {
          const [x1, y1] = snakeCell(Number(from));
          const [x2, y2] = snakeCell(to);
          const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          const nx = (-(y2 - y1) / len) * 0.2;
          const ny = ((x2 - x1) / len) * 0.2;
          const rungs = Math.max(2, Math.round(len / 0.7));
          return (
            <g key={from} stroke="#78350f" strokeWidth="0.09" strokeLinecap="round">
              <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} />
              <line x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny} />
              {Array.from({ length: rungs - 1 }, (_, k) => {
                const t = (k + 1) / rungs;
                const cx = x1 + (x2 - x1) * t;
                const cy = y1 + (y2 - y1) * t;
                return <line key={k} x1={cx + nx} y1={cy + ny} x2={cx - nx} y2={cy - ny} strokeWidth="0.07" />;
              })}
            </g>
          );
        })}
        {Object.entries(SNAKES).map(([from, to], i) => {
          const head = snakeCell(Number(from));
          const color = SNAKE_COLORS[i % SNAKE_COLORS.length];
          return (
            <g key={from}>
              <path d={snakePath(head, snakeCell(to))} fill="none" stroke={color} strokeWidth="0.26" strokeLinecap="round" />
              <path d={snakePath(head, snakeCell(to))} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.07" strokeDasharray="0.12 0.3" strokeLinecap="round" />
              <circle cx={head[0]} cy={head[1]} r="0.24" fill={color} />
              <circle cx={head[0] - 0.08} cy={head[1] - 0.06} r="0.05" fill="#fff" />
              <circle cx={head[0] + 0.08} cy={head[1] - 0.06} r="0.05" fill="#fff" />
            </g>
          );
        })}
        {v.pos.map((square, seat) => {
          if (v.out[seat]) return null;
          const n = crowd.get(square) ?? 0;
          crowd.set(square, n + 1);
          const [x, y] = snakeCell(square);
          return (
            <g key={seat} className="sg-seed" style={{ transform: `translate(${x + ((n % 2) * 2 - 1) * (n || square === 0 ? 0.14 : 0)}px, ${y - (square === 0 ? seat * 0.75 : Math.floor(n / 2) * 0.28)}px)` }}>
              <circle r="0.3" fill={LUDO_COLORS[seat].fill} stroke="#fff" strokeWidth="0.08" />
              <circle r="0.1" fill="rgba(255,255,255,0.6)" />
            </g>
          );
        })}
      </svg>
      <p className="sg-line">{line}</p>
      {!over && me >= 0 && !v.out[me] && (
        <div className="sg-snakes-roll">
          {last && <Die n={last.die} />}
          <button className="btn big sg-shake" disabled={!mine} onClick={() => play({})}>
            {v.turn === me ? '🎲 Roll' : `Waiting for ${seatName(m, v.turn)}…`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Scrabble ---------- */

/** A tile put on the board this turn but not played yet, and which rack slot it came from. */
interface Tentative extends ScrabblePlacement {
  slot: number;
}

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const PREMIUM_NAME: Record<string, string> = { T: 'triple word', D: 'double word', t: 'triple letter', d: 'double letter' };

export function ScrabbleBoard({ m, busy, play }: BoardProps) {
  const v = m.view as ScrabbleView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me) && !busy;
  const [placed, setPlaced] = useState<Tentative[]>([]);
  /** Rack slot picked up, waiting for a square. */
  const [held, setHeld] = useState<number | null>(null);
  /** A blank was put on this square and still needs its letter. */
  const [blank, setBlank] = useState<{ sq: number; slot: number } | null>(null);
  /** Rack slots marked for swapping; null when not swapping. */
  const [swap, setSwap] = useState<number[] | null>(null);
  const [sure, setSure] = useState(false);
  const rackKey = v.rack.join('');
  useEffect(() => {
    setPlaced([]);
    setHeld(null);
    setBlank(null);
    setSwap(null);
    setSure(false);
  }, [v.board, rackKey]);
  // A pass changes neither the board nor the rack, so the "Sure?" on the Pass button is cleared by the turn moving on.
  useEffect(() => setSure(false), [v.turn]);
  const used = new Set(placed.map((p) => p.slot));
  const tapSquare = (sq: number) => {
    if (!mine || swap) return;
    if (placed.some((p) => p.sq === sq)) return setPlaced((cur) => cur.filter((p) => p.sq !== sq));
    if (v.board[sq] !== '.' || held === null) return;
    if (v.rack[held] === BLANK) setBlank({ sq, slot: held });
    else setPlaced((cur) => [...cur, { sq, tile: v.rack[held], slot: held }]);
    setHeld(null);
  };
  const tapRack = (slot: number) => {
    if (!mine || used.has(slot)) return;
    if (swap) setSwap((cur) => (!cur ? cur : cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot]));
    else setHeld(held === slot ? null : slot);
  };
  const last = v.last;
  let line = 'The first word must cross the star.';
  if (last) {
    const who = seatName(m, last.seat);
    line = last.kind === 'play' ? `${who} played ${last.words?.join(', ')} for ${last.score}.` : last.kind === 'swap' ? `${who} swapped tiles.` : `${who} passed.`;
  }
  if (!over && me >= 0) line += mine ? (held !== null ? ' Now tap a square.' : placed.length ? '' : ' Tap a tile, then a square.') : ` Waiting for ${seatName(m, v.turn)}…`;
  return (
    <div className="sg-board sg-scrabble">
      <div className="sg-ludo-seats">
        {m.players.map((p, seat) => (
          <span key={p.uid} className={`${v.turn === seat && !over ? 'turn' : ''} ${v.out[seat] ? 'out' : ''}`}>
            {seatName(m, seat)} · <b>{v.scores[seat]}</b>
          </span>
        ))}
        <span>Bag {v.bag}</span>
      </div>
      <div className="sg-grid15">
        {[...v.board].map((letter, sq) => {
          const mineHere = placed.find((p) => p.sq === sq);
          const shown = mineHere ? (mineHere.as ?? mineHere.tile) : letter === '.' ? '' : letter.toUpperCase();
          const premium = SCRABBLE_PREMIUMS[sq];
          const cls = [shown ? 'lt' : premium !== '.' ? `p${premium}` : '', mineHere ? 'new' : '', last?.squares?.includes(sq) ? 'last' : '', (mineHere ? mineHere.tile === BLANK : letter >= 'a') && shown ? 'blank' : ''].join(' ');
          return (
            <button key={sq} className={cls} onClick={() => tapSquare(sq)} aria-label={shown ? `${shown}` : `Empty square${premium !== '.' ? `, ${PREMIUM_NAME[premium]}` : ''}`}>
              {shown || (sq === SCRABBLE_CENTRE ? '★' : '')}
            </button>
          );
        })}
      </div>
      <p className="sg-line">{line}</p>
      {me >= 0 && !v.out[me] && (
        blank ? (
          <div className="sg-letters">
            <b>What letter is your blank?</b>
            <div>
              {LETTERS.map((letter) => (
                <button key={letter} onClick={() => { setPlaced((cur) => [...cur, { sq: blank.sq, tile: BLANK, as: letter, slot: blank.slot }]); setBlank(null); }}>{letter}</button>
              ))}
            </div>
            <button className="btn sm ghost" onClick={() => setBlank(null)}>Back</button>
          </div>
        ) : (
          <>
            <div className="sg-rack">
              {Array.from({ length: SCRABBLE_RACK }, (_, slot) => {
                const tile = v.rack[slot];
                if (!tile || used.has(slot)) return <span key={slot} />;
                return (
                  <button key={slot} className={`${held === slot ? 'held' : ''} ${swap?.includes(slot) ? 'swap' : ''}`} disabled={!mine} onClick={() => tapRack(slot)} aria-label={tile === BLANK ? 'Blank tile' : `${tile}, ${SCRABBLE_VALUES[tile]} points`}>
                    {tile === BLANK ? '' : tile}
                    <i>{SCRABBLE_VALUES[tile] || ''}</i>
                  </button>
                );
              })}
            </div>
            {!over && (swap ? (
              <div className="row-btns sg-scrabble-btns">
                <button className="btn go" disabled={!mine || !swap.length} onClick={() => play({ swap: swap.map((slot) => v.rack[slot]) })}>Swap {swap.length || ''} tile{swap.length === 1 ? '' : 's'}</button>
                <button className="btn ghost" onClick={() => setSwap(null)}>Cancel</button>
              </div>
            ) : (
              <div className="row-btns sg-scrabble-btns">
                <button className="btn go" disabled={!mine || !placed.length} onClick={() => play({ tiles: placed.map(({ sq, tile, as }) => ({ sq, tile, as })) })}>Play</button>
                <button className="btn ghost" disabled={!placed.length} onClick={() => setPlaced([])}>Clear</button>
                <button className="btn ghost" disabled={!mine || v.bag < SCRABBLE_RACK} onClick={() => { setPlaced([]); setHeld(null); setSwap([]); }}>Swap</button>
                <button className={`btn ${sure ? 'danger' : 'ghost'}`} disabled={!mine} onClick={() => (sure ? play({ pass: true }) : setSure(true))} onBlur={() => setSure(false)}>{sure ? 'Sure?' : 'Pass'}</button>
              </div>
            ))}
          </>
        )
      )}
    </div>
  );
}
