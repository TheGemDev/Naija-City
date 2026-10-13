// Dara for Street Games: the Hausa game of twelve stones each on a board of 5 rows by 6. Stones are put
// down one at a time, then slid one step at a time; a line of exactly three (across or down, never
// diagonal) removes one of the opponent's stones. The board is 30 characters, top-left first.

import { randInt, type Rules } from './gameKit';
import type { DaraView } from '../src/game/streetGames';

interface DaraState {
  b: string;
  hand: [number, number];
  turn: number;
  /** The player to move has just made three and must remove a stone. */
  take: boolean;
  /** Slides since a stone was last removed. */
  quiet: number;
  last: DaraView['last'];
  /** The seat that won, or 'draw'. */
  over: number | 'draw' | null;
  gone: number | null;
}

const ROWS = 5;
const COLS = 6;
const STONES = 12;
const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
/** Nobody has made three in this many slides: called off level. */
const QUIET_DRAW = 80;

const inside = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

/** The longest line (across or down) through `sq`, were `who` to have a stone there. */
function line(b: string[], sq: number, who: string): number {
  const r0 = Math.floor(sq / COLS);
  const c0 = sq % COLS;
  let best = 0;
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    let n = 1;
    for (const dir of [1, -1]) {
      for (let r = r0 + dr * dir, c = c0 + dc * dir; inside(r, c) && b[r * COLS + c] === who; r += dr * dir, c += dc * dir) n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Holes the seat may put a stone in: empty, and not completing a line of three. */
function drops(s: DaraState, seat: number): number[] {
  const b = [...s.b];
  return b.flatMap((p, sq) => (p === '.' && line(b, sq, String(seat)) < 3 ? [sq] : []));
}

/** Slides open to the seat: one step into an empty hole, never making a line of four or more. */
function slides(s: DaraState, seat: number): [number, number][] {
  const b = [...s.b];
  const who = String(seat);
  const out: [number, number][] = [];
  b.forEach((p, from) => {
    if (p !== who) return;
    for (const [dr, dc] of STEPS) {
      const r = Math.floor(from / COLS) + dr;
      const c = (from % COLS) + dc;
      if (!inside(r, c) || b[r * COLS + c] !== '.') continue;
      b[from] = '.';
      if (line(b, r * COLS + c, who) < 4) out.push([from, r * COLS + c]);
      b[from] = who;
    }
  });
  return out;
}

const count = (s: DaraState, seat: number) => [...s.b].filter((p) => p === String(seat)).length;

/** Make sure whoever is next has something to do; if they do not, skip them (while dropping) or end the game. */
function ready(s: DaraState) {
  for (let guard = 0; guard < 2 * STONES + 2 && s.over === null; guard++) {
    if (s.hand[0] + s.hand[1] > 0) {
      if (s.hand[s.turn] > 0 && drops(s, s.turn).length) return;
      // Nowhere legal to put it: that stone is lost.
      if (s.hand[s.turn] > 0) s.hand[s.turn]--;
      s.turn = 1 - s.turn;
    } else if (count(s, s.turn) < 3 || !slides(s, s.turn).length) s.over = 1 - s.turn;
    else return;
  }
}

export const dara: Rules<DaraState> = {
  init: () => ({ b: '.'.repeat(ROWS * COLS), hand: [STONES, STONES], turn: randInt(2), take: false, quiet: 0, last: null, over: null, gone: null }),
  pending: (s) => (s.over !== null || s.gone !== null ? [] : [s.turn]),
  move(s, seat, m) {
    if (s.over !== null) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    const b = [...s.b];
    const who = String(seat);
    if (s.take) {
      const sq = Number(m.take);
      if (b[sq] !== String(1 - seat)) return 'Tap one of their stones to remove it';
      b[sq] = '.';
      s.b = b.join('');
      s.take = false;
      s.quiet = 0;
      s.last = { ...s.last!, took: sq };
      if (count(s, 1 - seat) < 3) s.over = seat;
      s.turn = 1 - seat;
    } else if (s.hand[0] + s.hand[1] > 0) {
      const sq = Number(m.drop);
      if (!drops(s, seat).includes(sq)) return b[sq] === '.' ? 'No lines of three while you are still putting stones down' : 'Pick an empty hole';
      b[sq] = who;
      s.b = b.join('');
      s.hand[seat]--;
      s.last = { seat, to: sq };
      s.turn = 1 - seat;
    } else {
      const from = Number(m.from);
      const to = Number(m.to);
      if (!slides(s, seat).some(([f, t]) => f === from && t === to)) return 'A stone slides one step into an empty hole, and may not make a line of four';
      b[from] = '.';
      b[to] = who;
      s.b = b.join('');
      s.last = { seat, from, to };
      s.quiet++;
      // Exactly three in a line: the same player now removes a stone before the turn passes.
      if (line(b, to, who) === 3) s.take = true;
      else s.turn = 1 - seat;
      if (!s.take && s.quiet >= QUIET_DRAW) s.over = 'draw';
    }
    if (!s.take) ready(s);
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    if (s.over === null) return null;
    return s.over === 'draw' ? [0, 1] : [s.over];
  },
  view(s, seat): DaraView {
    const mine = s.over === null && s.gone === null && seat === s.turn;
    const phase = s.take ? 'take' : s.hand[0] + s.hand[1] > 0 ? 'drop' : 'move';
    const spots = !mine || phase === 'move' ? [] : phase === 'drop' ? drops(s, seat) : [...s.b].flatMap((p, sq) => (p === String(1 - seat) ? [sq] : []));
    return { board: s.b, hand: s.hand, turn: s.turn, phase, spots, moves: mine && phase === 'move' ? slides(s, seat) : [], last: s.last };
  },
};
