// Chess for Street Games: the whole game (castling, en passant, promotion, check, mate and the usual draws).
// The board is 64 characters from a8 to h1; square = row * 8 + column, row 0 being black's back rank.

import { randInt, type Rules } from './gameKit';
import type { ChessView } from '../src/game/streetGames';

type Color = 'w' | 'b';

interface ChessState {
  b: string;
  /** Seat playing white. */
  white: number;
  turn: Color;
  /** Castling still allowed: any of K Q (white, king and queen side) and k q (black). */
  castle: string;
  /** The square a pawn just skipped over, where it can be taken en passant (-1: none). */
  ep: number;
  /** Half-moves since the last capture or pawn move, for the 50-move rule. */
  half: number;
  /** How often each position has come up since then, for threefold repetition. */
  seen: Record<string, number>;
  last: [number, number] | null;
  ending: ChessView['ending'];
  gone: number | null;
}

interface Mv {
  from: number;
  to: number;
  promo?: string;
  kind?: 'ep' | 'castle' | 'double';
}

const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const ALL = [...DIAG, ...ORTH];
const PROMOS = ['q', 'r', 'b', 'n'];
/** Moving from or onto a corner ends that side's castling there; so does moving the king. */
const CASTLE_LOST: Record<number, string> = { 0: 'q', 7: 'k', 56: 'Q', 63: 'K', 4: 'kq', 60: 'KQ' };

const colorOf = (p: string): Color | null => (p === '.' ? null : p < 'a' ? 'w' : 'b');
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Is `sq` attacked by any piece of colour `by`? */
function attacked(b: string[], sq: number, by: Color): boolean {
  const r = sq >> 3;
  const c = sq & 7;
  const mine = (p: string) => (by === 'w' ? p.toUpperCase() : p);
  // A pawn attacks diagonally forward, so the attacker stands one row "behind" the square from its own side.
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (inside(pr, c + dc) && b[pr * 8 + c + dc] === mine('p')) return true;
  for (const [dr, dc] of KNIGHT) if (inside(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === mine('n')) return true;
  for (const [dr, dc] of ALL) if (inside(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === mine('k')) return true;
  for (const [dirs, slider] of [[DIAG, 'b'], [ORTH, 'r']] as const) {
    for (const [dr, dc] of dirs) {
      for (let rr = r + dr, cc = c + dc; inside(rr, cc); rr += dr, cc += dc) {
        const p = b[rr * 8 + cc];
        if (p === '.') continue;
        if (p === mine(slider) || p === mine('q')) return true;
        break;
      }
    }
  }
  return false;
}

const kingOf = (b: string[], color: Color) => b.indexOf(color === 'w' ? 'K' : 'k');
const inCheck = (b: string[], color: Color) => attacked(b, kingOf(b, color), other(color));

function play(b: string[], mv: Mv, turn: Color): string[] {
  const next = b.slice();
  const piece = next[mv.from];
  next[mv.to] = mv.promo ? (turn === 'w' ? mv.promo.toUpperCase() : mv.promo) : piece;
  next[mv.from] = '.';
  if (mv.kind === 'ep') next[mv.to + (turn === 'w' ? 8 : -8)] = '.';
  if (mv.kind === 'castle') {
    // The rook hops to the other side of the king.
    const [rookFrom, rookTo] = mv.to > mv.from ? [mv.to + 1, mv.to - 1] : [mv.to - 2, mv.to + 1];
    next[rookTo] = next[rookFrom];
    next[rookFrom] = '.';
  }
  return next;
}

/** Every move that follows how the pieces move; some may still leave the mover's own king in check. */
function candidates(b: string[], turn: Color, castle: string, ep: number): Mv[] {
  const out: Mv[] = [];
  const foe = other(turn);
  for (let from = 0; from < 64; from++) {
    const p = b[from];
    if (colorOf(p) !== turn) continue;
    const r = from >> 3;
    const c = from & 7;
    const kind = p.toLowerCase();
    if (kind === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const lastRow = turn === 'w' ? 0 : 7;
      const add = (to: number, k?: Mv['kind']) => {
        if (to >> 3 === lastRow) for (const promo of PROMOS) out.push({ from, to, promo });
        else out.push({ from, to, kind: k });
      };
      const one = from + dir * 8;
      if (b[one] === '.') {
        add(one);
        const two = one + dir * 8;
        if (r === (turn === 'w' ? 6 : 1) && b[two] === '.') add(two, 'double');
      }
      for (const dc of [-1, 1]) {
        if (!inside(r + dir, c + dc)) continue;
        const to = one + dc;
        if (colorOf(b[to]) === foe) add(to);
        else if (to === ep) add(to, 'ep');
      }
      continue;
    }
    const step = (dirs: number[][], slide: boolean) => {
      for (const [dr, dc] of dirs) {
        for (let rr = r + dr, cc = c + dc; inside(rr, cc); rr += dr, cc += dc) {
          const to = rr * 8 + cc;
          if (colorOf(b[to]) === turn) break;
          out.push({ from, to });
          if (b[to] !== '.' || !slide) break;
        }
      }
    };
    if (kind === 'n') step(KNIGHT, false);
    else if (kind === 'b') step(DIAG, true);
    else if (kind === 'r') step(ORTH, true);
    else if (kind === 'q') step(ALL, true);
    else {
      step(ALL, false);
      // Castling: the squares between king and rook are empty, and the king is not in, passing through or landing in check.
      const home = turn === 'w' ? 60 : 4;
      if (from !== home) continue;
      const clear = (squares: number[]) => squares.every((sq) => b[sq] === '.');
      const safe = (squares: number[]) => squares.every((sq) => !attacked(b, sq, foe));
      const rook = turn === 'w' ? 'R' : 'r';
      if (castle.includes(turn === 'w' ? 'K' : 'k') && b[home + 3] === rook && clear([home + 1, home + 2]) && safe([home, home + 1, home + 2])) {
        out.push({ from, to: home + 2, kind: 'castle' });
      }
      if (castle.includes(turn === 'w' ? 'Q' : 'q') && b[home - 4] === rook && clear([home - 1, home - 2, home - 3]) && safe([home, home - 1, home - 2])) {
        out.push({ from, to: home - 2, kind: 'castle' });
      }
    }
  }
  return out;
}

function legalMoves(s: ChessState): Mv[] {
  const b = [...s.b];
  return candidates(b, s.turn, s.castle, s.ep).filter((mv) => !inCheck(play(b, mv, s.turn), s.turn));
}

const code = (mv: Mv) => `${mv.from}-${mv.to}${mv.promo ?? ''}`;
const seatOf = (s: ChessState, color: Color) => (color === 'w' ? s.white : 1 - s.white);

/** Neither side can ever mate: bare kings, or a single knight or bishop between them. */
function deadPosition(b: string) {
  const rest = b.replace(/[.Kk]/g, '');
  return rest.length === 0 || (rest.length === 1 && 'NnBb'.includes(rest));
}

export const chess: Rules<ChessState> = {
  init: () => ({ b: START, white: randInt(2), turn: 'w', castle: 'KQkq', ep: -1, half: 0, seen: {}, last: null, ending: null, gone: null }),
  pending: (s) => (s.ending || s.gone !== null ? [] : [seatOf(s, s.turn)]),
  move(s, seat, m) {
    if (s.ending) return 'The game is over';
    if (seat !== seatOf(s, s.turn)) return 'Not your turn';
    const mv = legalMoves(s).find((x) => code(x) === m.move);
    if (!mv) return 'That move is not allowed';
    const b = [...s.b];
    const quiet = b[mv.from].toLowerCase() !== 'p' && b[mv.to] === '.';
    s.b = play(b, mv, s.turn).join('');
    for (const sq of [mv.from, mv.to]) for (const right of CASTLE_LOST[sq] ?? '') s.castle = s.castle.replace(right, '');
    s.ep = mv.kind === 'double' ? (mv.from + mv.to) / 2 : -1;
    s.last = [mv.from, mv.to];
    s.turn = other(s.turn);
    // A capture or pawn move can never be undone, so earlier positions cannot come back.
    if (!quiet) s.seen = {};
    s.half = quiet ? s.half + 1 : 0;
    const key = `${s.b}${s.turn}${s.castle}${s.ep}`;
    s.seen[key] = (s.seen[key] ?? 0) + 1;
    if (!legalMoves(s).length) s.ending = inCheck([...s.b], s.turn) ? 'checkmate' : 'stalemate';
    else if (deadPosition(s.b)) s.ending = 'material';
    else if (s.seen[key] >= 3) s.ending = 'repetition';
    else if (s.half >= 100) s.ending = 'fifty';
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    if (!s.ending) return null;
    // On checkmate it is the mated side's turn.
    return s.ending === 'checkmate' ? [seatOf(s, other(s.turn))] : [0, 1];
  },
  view: (s, seat): ChessView => ({
    board: s.b,
    white: s.white,
    turn: seatOf(s, s.turn),
    legal: !s.ending && s.gone === null && seat === seatOf(s, s.turn) ? legalMoves(s).map(code) : [],
    last: s.last,
    check: inCheck([...s.b], s.turn),
    ending: s.ending,
  }),
};
