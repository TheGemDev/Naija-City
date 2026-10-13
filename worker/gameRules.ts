// The rules of every Street Game. Pure: a state goes in, a move changes it. Nothing here touches the database
// or money (worker/games.ts does that), and a player only ever receives view(), never the state itself.
// The quick games are in this file; the board games have one each (chess.ts, draughts.ts, ludo.ts, pool.ts, dara.ts, snakes.ts, scrabble.ts, caps.ts).

import {
  AYO_TARGET, BELT_TARGET, TENTEN_TARGET, WHOT_SHAPES, isWhot, whotCanPlay, whotNum,
  type AyoView, type BeltView, type DiceView, type GameId, type Side, type TenTenView, type WhotCard, type WhotShape, type WhotView,
} from '../src/game/streetGames';

import { randInt, shuffle, type Rules } from './gameKit';
import { chess } from './chess';
import { draughts } from './draughts';
import { ludo } from './ludo';
import { pool } from './pool';
import { dara } from './dara';
import { snakes } from './snakes';
import { scrabble } from './scrabble';
import { caps } from './caps';

export type { Move, Rules } from './gameKit';

const isSide = (v: unknown): v is Side => v === 'L' || v === 'R';

/* ---------- Belt ---------- */

interface BeltState {
  score: [number, number];
  folder: number;
  hold: Side | null;
  round: number;
  last: BeltView['last'];
  gone: number | null;
}

const belt: Rules<BeltState> = {
  init: () => ({ score: [0, 0], folder: randInt(2), hold: null, round: 1, last: null, gone: null }),
  pending(s) {
    if (this.result(s)) return [];
    return [s.hold === null ? s.folder : 1 - s.folder];
  },
  move(s, seat, m) {
    if (!isSide(m.side)) return 'Choose loop A or loop B';
    if (s.hold === null) {
      if (seat !== s.folder) return 'Wait for the belt to be folded';
      s.hold = m.side;
      return null;
    }
    if (seat === s.folder) return 'Wait for them to pick a loop';
    const caught = m.side === s.hold;
    s.score[caught ? seat : s.folder]++;
    s.last = { round: s.round, folder: s.folder, hold: s.hold, pick: m.side, caught };
    s.folder = 1 - s.folder;
    s.hold = null;
    s.round++;
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    const w = s.score.findIndex((n) => n >= BELT_TARGET);
    return w < 0 ? null : [w];
  },
  view: (s, seat): BeltView => ({
    score: s.score,
    folder: s.folder,
    folded: s.hold !== null,
    hold: seat === s.folder ? s.hold : null,
    round: s.round,
    last: s.last,
  }),
};

/* ---------- Ten-Ten ---------- */

interface TenTenState {
  picks: (Side | null)[];
  score: [number, number];
  round: number;
  last: TenTenView['last'];
  gone: number | null;
}

const tenten: Rules<TenTenState> = {
  init: () => ({ picks: [null, null], score: [0, 0], round: 1, last: null, gone: null }),
  pending(s) {
    if (this.result(s)) return [];
    return [0, 1].filter((i) => s.picks[i] === null);
  },
  move(s, seat, m) {
    if (!isSide(m.side)) return 'Choose a leg';
    if (s.picks[seat] !== null) return 'You have kicked. Wait for the other player';
    s.picks[seat] = m.side;
    const [a, b] = s.picks;
    if (a === null || b === null) return null;
    // Seat 0 scores when the legs match, seat 1 when they cross.
    const point = a === b ? 0 : 1;
    s.score[point]++;
    s.last = { round: s.round, picks: [a, b], point };
    s.picks = [null, null];
    s.round++;
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    const w = s.score.findIndex((n) => n >= TENTEN_TARGET);
    return w < 0 ? null : [w];
  },
  view: (s, seat): TenTenView => ({
    score: s.score,
    ready: s.picks.map((p) => p !== null),
    mine: s.picks[seat] ?? null,
    round: s.round,
    last: s.last,
  }),
};

/* ---------- Street Dice ---------- */

type Roll = [number, number];

interface DiceState {
  alive: boolean[];
  rolls: (Roll | null)[];
  round: number;
  last: DiceView['last'];
  winner: number | null;
}

const aliveSeats = (s: DiceState) => s.alive.flatMap((a, i) => (a ? [i] : []));

/** Everyone still in has rolled: one top roll wins, tied top rolls shake again. */
function settleDice(s: DiceState) {
  const seats = aliveSeats(s);
  if (seats.length === 1) {
    s.winner = seats[0];
    return;
  }
  const total = (i: number) => (s.rolls[i] ? s.rolls[i]![0] + s.rolls[i]![1] : 0);
  const best = Math.max(...seats.map(total));
  const top = seats.filter((i) => total(i) === best);
  if (top.length === 1) {
    s.winner = top[0];
    return;
  }
  s.last = { round: s.round, rolls: s.rolls, tied: top };
  s.alive = s.alive.map((_, i) => top.includes(i));
  s.rolls = s.rolls.map(() => null);
  s.round++;
}

const dice: Rules<DiceState> = {
  init: (seats) => ({ alive: Array(seats).fill(true), rolls: Array(seats).fill(null), round: 1, last: null, winner: null }),
  pending: (s) => (s.winner !== null ? [] : aliveSeats(s).filter((i) => !s.rolls[i])),
  move(s, seat) {
    if (!s.alive[seat]) return 'You are out of this one';
    if (s.rolls[seat]) return 'You have shaken. Wait for the others';
    s.rolls[seat] = [1 + randInt(6), 1 + randInt(6)];
    if (!this.pending(s).length) settleDice(s);
    return null;
  },
  drop(s, seat) {
    if (s.winner !== null || !s.alive[seat]) return;
    s.alive[seat] = false;
    s.rolls[seat] = null;
    if (aliveSeats(s).length === 1 || !this.pending(s).length) settleDice(s);
  },
  result: (s) => (s.winner === null ? null : [s.winner]),
  view: (s): DiceView => ({ alive: s.alive, rolls: s.rolls, round: s.round, last: s.last }),
};

/* ---------- Ayo ---------- */

interface AyoState {
  pits: number[];
  store: [number, number];
  turn: number;
  plies: number;
  last: AyoView['last'];
  over: boolean;
  gone: number | null;
}

/** A game that goes round in circles is called off and each side keeps the seeds in front of it. */
const AYO_MAX_PLIES = 300;

const side = (pits: number[], seat: number) => pits.slice(seat * 6, seat * 6 + 6);
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

/** Pits (0-5 on the seat's own side) that may be played: not empty, and feeding a starved opponent when that is possible. */
function ayoLegal(s: AyoState, seat: number): number[] {
  const mine = side(s.pits, seat);
  const filled = mine.flatMap((n, i) => (n > 0 ? [i] : []));
  if (sum(side(s.pits, 1 - seat)) > 0) return filled;
  // From pit i, the seeds cross to the other side only if there are more than the pits left on this side.
  return filled.filter((i) => mine[i] >= 6 - i);
}

function ayoEnd(s: AyoState) {
  for (const seat of [0, 1]) {
    s.store[seat] += sum(side(s.pits, seat));
  }
  s.pits = s.pits.map(() => 0);
  s.over = true;
}

const ayo: Rules<AyoState> = {
  init: () => ({ pits: Array(12).fill(4), store: [0, 0], turn: randInt(2), plies: 0, last: null, over: false, gone: null }),
  pending: (s) => (s.over || s.gone !== null ? [] : [s.turn]),
  move(s, seat, m) {
    if (s.over) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    const pit = Number(m.pit);
    if (!Number.isInteger(pit) || !ayoLegal(s, seat).includes(pit)) {
      return sum(side(s.pits, 1 - seat)) === 0 ? 'Your opponent has no seeds: play a pit that reaches their side' : 'You cannot play that pit';
    }
    const from = seat * 6 + pit;
    let seeds = s.pits[from];
    s.pits[from] = 0;
    let at = from;
    while (seeds > 0) {
      at = (at + 1) % 12;
      // A pit with 12 or more seeds laps the board; it skips the pit it came from.
      if (at === from) continue;
      s.pits[at]++;
      seeds--;
    }
    const theirs = (i: number) => Math.floor(i / 6) === 1 - seat;
    const take: number[] = [];
    for (let i = at; theirs(i) && (s.pits[i] === 2 || s.pits[i] === 3); i--) take.push(i);
    let captured = 0;
    // Taking every seed the opponent has left is not allowed: the move stands but captures nothing.
    const wipeout = take.length > 0 && sum(take.map((i) => s.pits[i])) === sum(side(s.pits, 1 - seat));
    if (!wipeout) {
      for (const i of take) {
        captured += s.pits[i];
        s.pits[i] = 0;
      }
    }
    s.store[seat] += captured;
    s.last = { seat, pit, captured };
    s.turn = 1 - seat;
    s.plies++;
    if (s.store[seat] >= AYO_TARGET) s.over = true;
    else if (!ayoLegal(s, s.turn).length || s.plies >= AYO_MAX_PLIES) ayoEnd(s);
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    if (!s.over) return null;
    if (s.store[0] === s.store[1]) return [0, 1];
    return [s.store[0] > s.store[1] ? 0 : 1];
  },
  view: (s, seat): AyoView => ({
    pits: s.pits,
    store: s.store,
    turn: s.turn,
    legal: !s.over && s.gone === null && seat === s.turn ? ayoLegal(s, seat) : [],
    last: s.last,
  }),
};

/* ---------- Whot ---------- */

interface WhotState {
  hands: WhotCard[][];
  /** Face-down cards; drawn from the end. */
  market: WhotCard[];
  /** Played cards; the last one is on top. */
  pile: WhotCard[];
  call: WhotShape | null;
  turn: number;
  out: boolean[];
  plies: number;
  last: WhotView['last'];
  winners: number[] | null;
}

const WHOT_HAND = 5;
/** Nobody can finish: the smallest hand wins. */
const WHOT_MAX_PLIES = 400;
const WHOT_DECK: Record<WhotShape, number[]> = {
  c: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  t: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  x: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  s: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  r: [1, 2, 3, 4, 5, 7, 8],
};
const WHOT_SPECIAL = new Set([1, 2, 5, 8, 14, 20]);

function whotDeck(): WhotCard[] {
  const cards: WhotCard[] = [];
  for (const [shape, nums] of Object.entries(WHOT_DECK)) for (const n of nums) cards.push(`${shape}${n}`);
  for (let i = 0; i < 5; i++) cards.push('w20');
  return shuffle(cards);
}

function whotNext(s: WhotState, from: number): number {
  const n = s.hands.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (!s.out[seat]) return seat;
  }
  return from;
}

/** Take up to `count` cards from the market; when it runs dry the played pile (all but its top card) is shuffled back in. */
function whotDraw(s: WhotState, seat: number, count: number) {
  for (let i = 0; i < count; i++) {
    if (!s.market.length && s.pile.length > 1) {
      const top = s.pile.pop()!;
      s.market = shuffle(s.pile);
      s.pile = [top];
    }
    const card = s.market.pop();
    if (!card) return;
    s.hands[seat].push(card);
  }
}

const whot: Rules<WhotState> = {
  init(seats) {
    const market = whotDeck();
    const hands = Array.from({ length: seats }, () => market.splice(-WHOT_HAND));
    // The first card on the table is always a plain one, so nobody is hit before they have played.
    const start = market.findIndex((c) => !WHOT_SPECIAL.has(whotNum(c)));
    const [top] = market.splice(start, 1);
    return { hands, market, pile: [top], call: null, turn: randInt(seats), out: Array(seats).fill(false), plies: 0, last: null, winners: null };
  },
  pending: (s) => (s.winners ? [] : [s.turn]),
  move(s, seat, m) {
    if (s.winners) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    if (m.draw) {
      whotDraw(s, seat, 1);
      s.last = { seat, market: true };
      s.turn = whotNext(s, seat);
    } else {
      const card = String(m.card ?? '');
      const at = s.hands[seat].indexOf(card);
      if (at < 0) return 'You do not hold that card';
      const top = s.pile[s.pile.length - 1];
      if (!whotCanPlay(top, s.call, card)) return 'That card does not match. Play the same shape or number, or go to market';
      const call = m.call as WhotShape;
      if (isWhot(card) && !(typeof call === 'string' && call in WHOT_SHAPES)) return 'Call a shape for your Whot';
      s.hands[seat].splice(at, 1);
      s.pile.push(card);
      s.call = isWhot(card) ? call : null;
      s.last = { seat, card, ...(isWhot(card) ? { call } : {}) };
      if (!s.hands[seat].length) {
        s.winners = [seat];
        return null;
      }
      const next = whotNext(s, seat);
      const num = isWhot(card) ? 20 : whotNum(card);
      if (num === 1) {
        s.last.again = true;
      } else if (num === 2 || num === 5) {
        const n = num === 2 ? 2 : 3;
        whotDraw(s, next, n);
        s.last.picked = { seats: [next], n };
        s.turn = whotNext(s, next);
      } else if (num === 8) {
        s.last.skipped = next;
        s.turn = whotNext(s, next);
      } else if (num === 14) {
        const others = s.hands.flatMap((_, i) => (i !== seat && !s.out[i] ? [i] : []));
        for (const i of others) whotDraw(s, i, 1);
        s.last.picked = { seats: others, n: 1 };
        s.last.again = true;
      } else {
        s.turn = next;
      }
    }
    if (++s.plies >= WHOT_MAX_PLIES) {
      const live = s.hands.flatMap((_, i) => (s.out[i] ? [] : [i]));
      const least = Math.min(...live.map((i) => s.hands[i].length));
      s.winners = live.filter((i) => s.hands[i].length === least);
    }
    return null;
  },
  drop(s, seat) {
    if (s.winners || s.out[seat]) return;
    s.out[seat] = true;
    // Their cards go back under the market.
    s.market.unshift(...s.hands[seat]);
    s.hands[seat] = [];
    const live = s.out.flatMap((o, i) => (o ? [] : [i]));
    if (live.length === 1) s.winners = live;
    else if (s.turn === seat) s.turn = whotNext(s, seat);
  },
  result: (s) => s.winners,
  view: (s, seat): WhotView => ({
    hand: s.hands[seat] ?? [],
    counts: s.hands.map((h) => h.length),
    out: s.out,
    top: s.pile[s.pile.length - 1],
    call: s.call,
    market: s.market.length,
    turn: s.turn,
    last: s.last,
  }),
};

export const RULES: Record<GameId, Rules<any>> = { belt, tenten, dice, ayo, whot, ludo, chess, draughts, pool, dara, snakes, scrabble, caps };
