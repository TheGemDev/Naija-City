// Scrabble for Street Games, 2 to 4 players: the standard board, bag and scoring, with every word checked
// against the dictionary (worker/words.ts) the moment it is played. Board and tiles: src/game/scrabble.ts.

import { randInt, shuffle, type Rules } from './gameKit';
import { isWord } from './words';
import { BLANK, SCRABBLE_BINGO, SCRABBLE_CENTRE, SCRABBLE_PREMIUMS, SCRABBLE_RACK, SCRABBLE_SIZE, SCRABBLE_TILES, SCRABBLE_VALUES, scrabbleValue } from '../src/game/scrabble';
import type { ScrabblePlacement, ScrabbleView } from '../src/game/streetGames';

interface ScrabbleState {
  b: string;
  bag: string[];
  racks: string[][];
  scores: number[];
  turn: number;
  out: boolean[];
  /** Turns in a row that scored nothing (passes and swaps). */
  idle: number;
  last: ScrabbleView['last'];
  over: boolean;
}

const N = SCRABBLE_SIZE;
/** Everybody passing or swapping this many rounds running ends the game. */
const IDLE_ROUNDS = 2;
/** Swapping needs at least a rack's worth left in the bag. */
const SWAP_MIN = SCRABBLE_RACK;

const live = (s: ScrabbleState) => s.out.flatMap((o, i) => (o ? [] : [i]));
const rackValue = (rack: string[]) => rack.reduce((sum, t) => sum + SCRABBLE_VALUES[t], 0);

function nextSeat(s: ScrabbleState, from: number): number {
  for (let step = 1; step <= s.racks.length; step++) {
    const seat = (from + step) % s.racks.length;
    if (!s.out[seat]) return seat;
  }
  return from;
}

/** Take `tiles` out of a copy of the rack. Null if the rack does not hold them all. */
function without(rack: string[], tiles: string[]): string[] | null {
  const rest = rack.slice();
  for (const t of tiles) {
    const at = rest.indexOf(t);
    if (at < 0) return null;
    rest.splice(at, 1);
  }
  return rest;
}

/** The squares of the word running through `sq` along (dr, dc). */
function span(b: string[], sq: number, dr: number, dc: number): number[] {
  let r = Math.floor(sq / N);
  let c = sq % N;
  while (r - dr >= 0 && c - dc >= 0 && b[(r - dr) * N + c - dc] !== '.') { r -= dr; c -= dc; }
  const out: number[] = [];
  for (; r < N && c < N && b[r * N + c] !== '.'; r += dr, c += dc) out.push(r * N + c);
  return out;
}

/** Points for one word: premium squares only count under tiles put down this turn. */
function wordScore(b: string[], squares: number[], fresh: Set<number>): number {
  let sum = 0;
  let times = 1;
  for (const sq of squares) {
    const premium = fresh.has(sq) ? SCRABBLE_PREMIUMS[sq] : '.';
    sum += scrabbleValue(b[sq]) * (premium === 'd' ? 2 : premium === 't' ? 3 : 1);
    times *= premium === 'D' ? 2 : premium === 'T' ? 3 : 1;
  }
  return sum * times;
}

/** Check a play and work out what it scores. Returns an error message, or the new board, the words made and the points. */
function layDown(s: ScrabbleState, placed: ScrabblePlacement[]): string | { b: string[]; words: string[]; score: number } {
  const b = [...s.b];
  const opening = !/[^.]/.test(s.b);
  const fresh = new Set<number>();
  for (const p of placed) {
    if (!Number.isInteger(p.sq) || p.sq < 0 || p.sq >= N * N || b[p.sq] !== '.' || fresh.has(p.sq)) return 'Put each tile on its own empty square';
    if (p.tile === BLANK) {
      if (typeof p.as !== 'string' || !/^[A-Z]$/.test(p.as)) return 'Choose a letter for your blank';
      b[p.sq] = p.as.toLowerCase();
    } else b[p.sq] = p.tile;
    fresh.add(p.sq);
  }
  const squares = [...fresh].sort((x, y) => x - y);
  const rows = new Set(squares.map((sq) => Math.floor(sq / N)));
  const cols = new Set(squares.map((sq) => sq % N));
  if (rows.size > 1 && cols.size > 1) return 'All your tiles must go in one row or one column';
  // A single tile reads along whichever way it joins a word.
  const across = squares.length > 1 ? rows.size === 1 : span(b, squares[0], 0, 1).length > 1;
  const [dr, dc] = across ? [0, 1] : [1, 0];
  const main = span(b, squares[0], dr, dc);
  if (!squares.every((sq) => main.includes(sq))) return 'Your tiles must make one unbroken word';
  if (opening) {
    if (!fresh.has(SCRABBLE_CENTRE)) return 'The first word must cross the star in the middle';
    if (squares.length < 2) return 'The first word needs at least two letters';
  }
  const crosses = squares.map((sq) => span(b, sq, dc, dr)).filter((w) => w.length > 1);
  if (!opening && main.length === squares.length && !crosses.length) return 'Your word must join the tiles already on the board';
  const made = [main, ...crosses].filter((w) => w.length > 1);
  if (!made.length) return 'That does not make a word';
  const words = made.map((w) => w.map((sq) => b[sq]).join('').toUpperCase());
  const bad = words.find((w) => !isWord(w));
  if (bad) return `${bad} is not in the dictionary`;
  const score = made.reduce((sum, w) => sum + wordScore(b, w, fresh), 0) + (squares.length === SCRABBLE_RACK ? SCRABBLE_BINGO : 0);
  return { b, words, score };
}

/** Nobody can go on: everyone loses what is left on their rack, and whoever went out collects it. */
function finish(s: ScrabbleState, wentOut: number | null) {
  for (const seat of live(s)) {
    const left = rackValue(s.racks[seat]);
    s.scores[seat] -= left;
    if (wentOut !== null) s.scores[wentOut] += left;
  }
  s.over = true;
}

export const scrabble: Rules<ScrabbleState> = {
  init(seats) {
    const bag = shuffle(Object.entries(SCRABBLE_TILES).flatMap(([tile, n]) => Array<string>(n).fill(tile)));
    const racks = Array.from({ length: seats }, () => bag.splice(-SCRABBLE_RACK));
    return { b: '.'.repeat(N * N), bag, racks, scores: Array(seats).fill(0), turn: randInt(seats), out: Array(seats).fill(false), idle: 0, last: null, over: false };
  },
  pending: (s) => (s.over ? [] : [s.turn]),
  move(s, seat, m) {
    if (s.over) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    const rack = s.racks[seat];
    if (Array.isArray(m.tiles) && m.tiles.length) {
      const placed = (m.tiles as ScrabblePlacement[]).filter((p) => p && typeof p === 'object');
      if (placed.length !== m.tiles.length || placed.length > SCRABBLE_RACK) return 'Put down between one and seven tiles';
      const rest = without(rack, placed.map((p) => String(p.tile)));
      if (!rest) return 'You do not hold those tiles';
      const played = layDown(s, placed);
      if (typeof played === 'string') return played;
      s.b = played.b.join('');
      s.racks[seat] = [...rest, ...s.bag.splice(-(SCRABBLE_RACK - rest.length), SCRABBLE_RACK - rest.length)];
      s.scores[seat] += played.score;
      s.idle = 0;
      s.last = { seat, kind: 'play', words: played.words, score: played.score, squares: placed.map((p) => p.sq) };
      if (!s.racks[seat].length) {
        finish(s, seat);
        return null;
      }
    } else if (Array.isArray(m.swap) && m.swap.length) {
      if (s.bag.length < SWAP_MIN) return 'Not enough tiles left in the bag to swap';
      const back = m.swap.map(String);
      const rest = without(rack, back);
      if (!rest) return 'You do not hold those tiles';
      s.racks[seat] = [...rest, ...s.bag.splice(-back.length)];
      s.bag = shuffle([...s.bag, ...back]);
      s.idle++;
      s.last = { seat, kind: 'swap' };
    } else if (m.pass) {
      s.idle++;
      s.last = { seat, kind: 'pass' };
    } else return 'Put down some tiles, swap, or pass';
    if (s.idle >= IDLE_ROUNDS * live(s).length) finish(s, null);
    else s.turn = nextSeat(s, seat);
    return null;
  },
  drop(s, seat) {
    if (s.over || s.out[seat]) return;
    s.out[seat] = true;
    // Their tiles go back in the bag for the others.
    s.bag = shuffle([...s.bag, ...s.racks[seat]]);
    s.racks[seat] = [];
    if (live(s).length === 1) s.over = true;
    else if (s.turn === seat) s.turn = nextSeat(s, seat);
  },
  result(s) {
    if (!s.over) return null;
    const seats = live(s);
    const best = Math.max(...seats.map((i) => s.scores[i]));
    return seats.filter((i) => s.scores[i] === best);
  },
  view: (s, seat): ScrabbleView => ({
    board: s.b,
    rack: s.racks[seat] ?? [],
    counts: s.racks.map((r) => r.length),
    bag: s.bag.length,
    scores: s.scores,
    turn: s.turn,
    out: s.out,
    last: s.last,
  }),
};
