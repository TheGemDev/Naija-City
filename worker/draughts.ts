// Draughts for Street Games, the way it is played at the junction: the 10 by 10 board, seeds that capture
// backwards as well as forwards, flying kings, and you must capture when you can. A seed that starts jumping
// has to finish its run, but when several captures are open the player chooses which one.
// The board is 100 characters, top-left first; square = row * 10 + column. White starts at the bottom.

import { randInt, type Rules } from './gameKit';
import type { DraughtsView } from '../src/game/streetGames';

type Color = 'w' | 'b';

interface DraughtsState {
  b: string;
  /** Seat playing white (white moves first). */
  white: number;
  turn: Color;
  /** Moves in a row with no capture and no ordinary seed moved. */
  quiet: number;
  plies: number;
  last: number[] | null;
  /** The colour that won, or 'draw'. */
  over: Color | 'draw' | null;
  gone: number | null;
}

/** A move: the squares the piece stands on in turn, and the pieces it jumps. */
interface Path {
  sq: number[];
  taken: number[];
}

const SIZE = 10;
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
/** Kings shuffling about with nothing taken: after this many moves it is a draw. */
const QUIET_DRAW = 50;
const MAX_PLIES = 500;

const START = Array.from({ length: SIZE * SIZE }, (_, i) => {
  const r = Math.floor(i / SIZE);
  if ((r + (i % SIZE)) % 2 === 0) return '.';
  return r < 4 ? 'b' : r > 5 ? 'w' : '.';
}).join('');

const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Every complete capturing run open to the piece on `from`. Jumped pieces stay on the board until the run ends, and none can be jumped twice. */
function captures(b: string[], from: number): Path[] {
  const me = b[from].toLowerCase();
  const king = b[from] !== me;
  const out: Path[] = [];
  const free = (sq: number) => b[sq] === '.' || sq === from;
  const walk = (at: number, sq: number[], taken: number[]) => {
    let more = false;
    for (const [dr, dc] of DIAG) {
      let r = Math.floor(at / SIZE) + dr;
      let c = (at % SIZE) + dc;
      if (king) for (; inside(r, c) && free(r * SIZE + c); r += dr, c += dc);
      if (!inside(r, c)) continue;
      const mid = r * SIZE + c;
      if (free(mid) || b[mid].toLowerCase() === me || taken.includes(mid)) continue;
      // A seed lands right behind the piece it jumps; a king may land on any free square beyond it.
      for (r += dr, c += dc; inside(r, c) && free(r * SIZE + c); r += dr, c += dc) {
        more = true;
        walk(r * SIZE + c, [...sq, r * SIZE + c], [...taken, mid]);
        if (!king) break;
      }
    }
    if (!more && taken.length) out.push({ sq, taken });
  };
  walk(from, [from], []);
  return out;
}

function steps(b: string[], from: number): Path[] {
  const me = b[from].toLowerCase();
  const king = b[from] !== me;
  const out: Path[] = [];
  for (const [dr, dc] of DIAG) {
    // Seeds only step forward: up the board for white, down for black.
    if (!king && dr !== (me === 'w' ? -1 : 1)) continue;
    for (let r = Math.floor(from / SIZE) + dr, c = (from % SIZE) + dc; inside(r, c) && b[r * SIZE + c] === '.'; r += dr, c += dc) {
      out.push({ sq: [from, r * SIZE + c], taken: [] });
      if (!king) break;
    }
  }
  return out;
}

function legalMoves(s: DraughtsState): Path[] {
  const b = [...s.b];
  const mine = b.flatMap((p, i) => (p.toLowerCase() === s.turn ? [i] : []));
  const jumps = mine.flatMap((i) => captures(b, i));
  return jumps.length ? jumps : mine.flatMap((i) => steps(b, i));
}

const seatOf = (s: DraughtsState, color: Color) => (color === 'w' ? s.white : 1 - s.white);

export const draughts: Rules<DraughtsState> = {
  init: () => ({ b: START, white: randInt(2), turn: 'w', quiet: 0, plies: 0, last: null, over: null, gone: null }),
  pending: (s) => (s.over || s.gone !== null ? [] : [seatOf(s, s.turn)]),
  move(s, seat, m) {
    if (s.over) return 'The game is over';
    if (seat !== seatOf(s, s.turn)) return 'Not your turn';
    const want = JSON.stringify(m.path);
    const all = legalMoves(s);
    const path = all.find((p) => JSON.stringify(p.sq) === want);
    if (!path) return all[0]?.taken.length ? 'You must capture' : 'That move is not allowed';
    const b = [...s.b];
    const from = path.sq[0];
    const to = path.sq[path.sq.length - 1];
    const piece = b[from];
    const seed = piece === s.turn;
    b[from] = '.';
    for (const sq of path.taken) b[sq] = '.';
    // Crowned only if the move ends on the far row; passing through it mid-run does not count.
    b[to] = seed && Math.floor(to / SIZE) === (s.turn === 'w' ? 0 : SIZE - 1) ? piece.toUpperCase() : piece;
    s.b = b.join('');
    s.quiet = seed || path.taken.length ? 0 : s.quiet + 1;
    s.plies++;
    s.last = path.sq;
    s.turn = other(s.turn);
    if (!legalMoves(s).length) s.over = other(s.turn);
    else if (s.quiet >= QUIET_DRAW || s.plies >= MAX_PLIES) s.over = 'draw';
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    if (!s.over) return null;
    return s.over === 'draw' ? [0, 1] : [seatOf(s, s.over)];
  },
  view(s, seat): DraughtsView {
    const moves = !s.over && s.gone === null && seat === seatOf(s, s.turn) ? legalMoves(s) : [];
    return { board: s.b, white: s.white, turn: seatOf(s, s.turn), legal: moves.map((p) => p.sq), mustTake: !!moves[0]?.taken.length, last: s.last };
  },
};
