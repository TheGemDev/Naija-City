// Street Games boards for the long games: Ludo, Chess and Draughts. Like GameBoards.tsx, each one only draws
// the view the server sent and sends back what the player tapped; the server decides what is legal.

import { useEffect, useState } from 'react';
import { LUDO_BASE, LUDO_COLORS, LUDO_HOME, LUDO_LAP, LUDO_SAFE, LUDO_START, LUDO_TRACK, ludoCell } from '../game/ludo';
import type { ChessView, DraughtsView, LudoView } from '../game/streetGames';
import { Die, seatName, type BoardProps } from './GameBoards';

/* ---------- Ludo ---------- */

const HOME_TRIANGLES = ['6,6 6,9 7.5,7.5', '6,6 9,6 7.5,7.5', '9,6 9,9 7.5,7.5', '6,9 9,9 7.5,7.5'];

export function LudoBoard({ m, busy, play }: BoardProps) {
  const v = m.view as LudoView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me) && !busy;
  const dice = [...new Set(v.options.map(([die]) => die))];
  const [chosen, setChosen] = useState<number | null>(null);
  // The die being played: the one tapped, as long as it still has a move.
  const die = chosen !== null && dice.includes(chosen) ? chosen : dice[0] ?? null;
  const movable = mine ? v.options.filter(([d]) => d === die).map(([, i]) => i) : [];
  // Seeds sharing a cell are fanned out so each can be seen and tapped.
  const seeds = v.tok.flatMap((list, seat) => (v.out[seat] ? [] : list.map((p, i) => ({ seat, i, p, at: ludoCell(v.colors[seat], p, i) }))));
  const stack = new Map<string, number>();
  for (const s of seeds) stack.set(s.at.join(), (stack.get(s.at.join()) ?? 0) + 1);
  const seen = new Map<string, number>();
  const last = v.last;
  let line: string;
  if (!last) line = 'Roll the dice. You need a six to come out.';
  else {
    const who = seatName(m, last.seat);
    line = `${who} rolled ${last.roll[0]} and ${last.roll[1]}`;
    if (last.captured) line += `, and sent ${last.captured === 1 ? 'a seed' : `${last.captured} seeds`} back to base`;
    if (last.home) line += `, ${last.home === 1 ? 'one seed is' : `${last.home} seeds are`} home`;
    line += last.roll[0] === 6 && last.roll[1] === 6 ? '. Double six: roll again!' : '.';
  }
  return (
    <div className="sg-board sg-ludo">
      <div className="sg-ludo-seats">
        {m.players.map((p, seat) => (
          <span key={p.uid} className={`${v.turn === seat && !over ? 'turn' : ''} ${v.out[seat] ? 'out' : ''}`}>
            <i style={{ background: LUDO_COLORS[v.colors[seat]].fill }} />
            {seatName(m, seat)} · {v.tok[seat].filter((t) => t === LUDO_HOME).length}/4
          </span>
        ))}
      </div>
      <svg viewBox="0 0 15 15" className="sg-ludo-svg" role="img" aria-label="Ludo board">
        <rect width="15" height="15" fill="#f8fafc" />
        {LUDO_BASE.map(([x, y], color) => (
          <g key={color} opacity={v.colors.includes(color) ? 1 : 0.35}>
            <rect x={x} y={y} width="6" height="6" fill={LUDO_COLORS[color].fill} />
            <rect x={x + 0.8} y={y + 0.8} width="4.4" height="4.4" rx="0.5" fill="#f8fafc" />
            {[0, 1, 2, 3].map((i) => {
              const [cx, cy] = ludoCell(color, -1, i);
              return <circle key={i} cx={cx} cy={cy} r="0.6" fill={LUDO_COLORS[color].soft} />;
            })}
          </g>
        ))}
        {LUDO_TRACK.map(([x, y], sq) => {
          const start = LUDO_START.indexOf(sq);
          return (
            <g key={sq}>
              <rect x={x} y={y} width="1" height="1" fill={start >= 0 ? LUDO_COLORS[start].fill : '#fff'} stroke="#94a3b8" strokeWidth="0.04" />
              {start < 0 && LUDO_SAFE.has(sq) && <text x={x + 0.5} y={y + 0.78} textAnchor="middle" fontSize="0.8" fill="#94a3b8">★</text>}
            </g>
          );
        })}
        {LUDO_COLORS.map((c, color) => [1, 2, 3, 4, 5].map((k) => {
          const [cx, cy] = ludoCell(color, LUDO_LAP + k, 0);
          return <rect key={`${color}-${k}`} x={cx - 0.5} y={cy - 0.5} width="1" height="1" fill={c.fill} stroke="#94a3b8" strokeWidth="0.04" />;
        }))}
        {HOME_TRIANGLES.map((points, color) => <polygon key={color} points={points} fill={LUDO_COLORS[color].fill} stroke="#f8fafc" strokeWidth="0.06" />)}
        {seeds.map((s) => {
          const key = s.at.join();
          const n = seen.get(key) ?? 0;
          seen.set(key, n + 1);
          const spread = (stack.get(key) ?? 1) > 1 ? 0.22 : 0;
          const x = s.at[0] + ((n % 2) * 2 - 1) * spread;
          const y = s.at[1] + (Math.floor(n / 2) * 2 - 1) * spread;
          const can = s.seat === me && movable.includes(s.i);
          return (
            <g key={`${s.seat}-${s.i}`} className={`sg-seed ${can ? 'can' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }} onClick={can ? () => play({ die, token: s.i }) : undefined}>
              {can && <circle r="0.85" fill="transparent" />}
              <circle r="0.4" fill={LUDO_COLORS[v.colors[s.seat]].fill} stroke="#fff" strokeWidth="0.09" />
              <circle r="0.15" fill="rgba(255,255,255,0.55)" />
            </g>
          );
        })}
      </svg>
      <p className="sg-line">{line}</p>
      {!over && me >= 0 && !v.out[me] && (
        v.dice.length && v.turn === me ? (
          <div className="sg-ludo-dice">
            {v.dice.map((d, i) => (
              <button key={i} className={d === die ? 'on' : ''} disabled={!mine || !dice.includes(d)} onClick={() => setChosen(d)} aria-label={`Play the ${d}`}>
                <Die n={d} />
              </button>
            ))}
            <small className="muted">{dice.length > 1 ? 'Pick a die, then tap a glowing seed.' : 'Tap a glowing seed.'}</small>
          </div>
        ) : (
          <button className="btn big sg-shake" disabled={!mine} onClick={() => play({})}>
            {v.turn === me ? '🎲 Roll' : `Waiting for ${seatName(m, v.turn)}…`}
          </button>
        )
      )}
    </div>
  );
}

/* ---------- Chess ---------- */

/** The solid chess glyphs, drawn as text (not emoji) so both sides share one shape and CSS colours them. */
const CHESS_GLYPH: Record<string, string> = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
const CHESS_NAME: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
const CHESS_ENDING: Record<NonNullable<ChessView['ending']>, string> = {
  checkmate: 'Checkmate!',
  stalemate: 'Stalemate: no legal move, so it is a draw.',
  repetition: 'Same position three times: draw.',
  fifty: 'Fifty moves with nothing taken: draw.',
  material: 'Not enough pieces left to mate: draw.',
};

export function ChessBoard({ m, busy, play }: BoardProps) {
  const v = m.view as ChessView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me) && !busy;
  // Black sees the board from black's side.
  const flip = me >= 0 && me !== v.white;
  const [sel, setSel] = useState<number | null>(null);
  /** A pawn move waiting for the player to choose what it becomes. */
  const [crown, setCrown] = useState<string | null>(null);
  useEffect(() => {
    setSel(null);
    setCrown(null);
  }, [v.board]);
  const moves = v.legal.map((code) => {
    const [from, rest] = code.split('-');
    return { from: Number(from), to: parseInt(rest, 10), promo: rest.replace(/\d/g, '') };
  });
  const targets = sel === null ? [] : moves.filter((x) => x.from === sel).map((x) => x.to);
  const tap = (sq: number) => {
    if (!mine) return;
    if (sel !== null && targets.includes(sq)) {
      if (moves.some((x) => x.from === sel && x.to === sq && x.promo)) setCrown(`${sel}-${sq}`);
      else play({ move: `${sel}-${sq}` });
      return;
    }
    setSel(moves.some((x) => x.from === sq) ? sq : null);
  };
  const toMove = v.turn === v.white ? 'K' : 'k';
  const side = (seat: number) => `${seatName(m, seat)} · ${seat === v.white ? 'White' : 'Black'}`;
  const top = me < 0 ? 1 - v.white : 1 - me;
  let line: string;
  if (v.ending) line = CHESS_ENDING[v.ending];
  else if (over) line = '';
  else line = `${v.check ? 'Check! ' : ''}${mine ? 'Your move.' : me >= 0 && v.turn === me ? '' : `${seatName(m, v.turn)} to move.`}`;
  return (
    <div className="sg-board sg-chess">
      <div className={`sg-side ${v.turn === top && !over ? 'turn' : ''}`}>{side(top)}</div>
      <div className="sg-grid8">
        {Array.from({ length: 64 }, (_, d) => {
          const sq = flip ? 63 - d : d;
          const p = v.board[sq];
          const dark = ((sq >> 3) + (sq & 7)) % 2 === 1;
          const cls = [dark ? 'dark' : 'light', sel === sq ? 'sel' : '', targets.includes(sq) ? 'to' : '', v.last?.includes(sq) ? 'last' : '', v.check && p === toMove ? 'check' : ''].join(' ');
          return (
            <button key={sq} className={cls} onClick={() => tap(sq)} aria-label={`Square ${'abcdefgh'[sq & 7]}${8 - (sq >> 3)}`}>
              {p !== '.' && <span className={p < 'a' ? 'w' : 'b'}>{CHESS_GLYPH[p.toLowerCase()]}</span>}
            </button>
          );
        })}
      </div>
      <div className={`sg-side ${v.turn === 1 - top && !over ? 'turn' : ''}`}>{side(1 - top)}</div>
      {crown ? (
        <div className="sg-choice sg-crown">
          {Object.entries(CHESS_NAME).map(([letter, name]) => (
            <button key={letter} className="btn" disabled={!mine} onClick={() => play({ move: crown + letter })}>{CHESS_GLYPH[letter]} {name}</button>
          ))}
        </div>
      ) : (
        <p className="sg-line">{line}</p>
      )}
    </div>
  );
}

/* ---------- Draughts ---------- */

export function DraughtsBoard({ m, busy, play }: BoardProps) {
  const v = m.view as DraughtsView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me) && !busy;
  const flip = me >= 0 && me !== v.white;
  /** The squares of the move being built: the seed, then each landing so far. */
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [v.board]);
  const fits = (prefix: number[]) => v.legal.filter((path) => prefix.every((sq, i) => path[i] === sq));
  const next = picked.length ? fits(picked).map((path) => path[picked.length]) : [];
  const starts = v.legal.map((path) => path[0]);
  const tap = (sq: number) => {
    if (!mine) return;
    if (picked.length && next.includes(sq)) {
      const path = [...picked, sq];
      // A long capture is tapped out one landing at a time; it is sent once it is complete.
      if (fits(path).some((p) => p.length === path.length)) play({ path });
      else setPicked(path);
      return;
    }
    setPicked(starts.includes(sq) ? [sq] : []);
  };
  const count = (color: string) => [...v.board].filter((p) => p.toLowerCase() === color).length;
  const side = (seat: number) => `${seatName(m, seat)} · ${seat === v.white ? 'White' : 'Black'} · ${count(seat === v.white ? 'w' : 'b')} left`;
  const top = me < 0 ? 1 - v.white : 1 - me;
  let line = '';
  if (!over) line = mine ? (picked.length > 1 ? 'Keep jumping: tap the next square.' : v.mustTake ? 'You must capture. Tap a glowing seed.' : 'Your move. Tap a seed, then where it goes.') : me >= 0 ? `Waiting for ${seatName(m, v.turn)}…` : `${seatName(m, v.turn)} to move.`;
  return (
    <div className="sg-board sg-draughts">
      <div className={`sg-side ${v.turn === top && !over ? 'turn' : ''}`}>{side(top)}</div>
      <div className="sg-grid10">
        {Array.from({ length: 100 }, (_, d) => {
          const sq = flip ? 99 - d : d;
          const p = v.board[sq];
          const dark = (Math.floor(sq / 10) + (sq % 10)) % 2 === 1;
          const cls = [dark ? 'dark' : 'light', picked.includes(sq) ? 'sel' : '', next.includes(sq) ? 'to' : '', v.last?.includes(sq) ? 'last' : '', mine && !picked.length && starts.includes(sq) ? 'can' : ''].join(' ');
          return (
            <button key={sq} className={cls} disabled={!dark} onClick={() => tap(sq)} aria-label={`Square ${sq}`}>
              {p !== '.' && <span className={`${p.toLowerCase()} ${p < 'a' ? 'king' : ''}`} />}
            </button>
          );
        })}
      </div>
      <div className={`sg-side ${v.turn === 1 - top && !over ? 'turn' : ''}`}>{side(1 - top)}</div>
      <p className="sg-line">{line}</p>
    </div>
  );
}
