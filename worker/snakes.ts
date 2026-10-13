// Snakes & Ladders for Street Games: roll, move, climb or slide. A six rolls again; you need the exact
// number to land on 100. Board: src/game/snakes.ts.

import { randInt, type Rules } from './gameKit';
import { LADDERS, SNAKES, SNAKES_END } from '../src/game/snakes';
import type { SnakesView } from '../src/game/streetGames';

interface SnakesState {
  pos: number[];
  turn: number;
  out: boolean[];
  last: SnakesView['last'];
  winner: number | null;
}

function nextSeat(s: SnakesState, from: number): number {
  for (let step = 1; step <= s.pos.length; step++) {
    const seat = (from + step) % s.pos.length;
    if (!s.out[seat]) return seat;
  }
  return from;
}

export const snakes: Rules<SnakesState> = {
  init: (seats) => ({ pos: Array(seats).fill(0), turn: randInt(seats), out: Array(seats).fill(false), last: null, winner: null }),
  pending: (s) => (s.winner !== null ? [] : [s.turn]),
  move(s, seat) {
    if (s.winner !== null) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    const die = 1 + randInt(6);
    const from = s.pos[seat];
    // Too big a roll near the end and you stay where you are.
    const landed = from + die > SNAKES_END ? from : from + die;
    const to = LADDERS[landed] ?? SNAKES[landed] ?? landed;
    s.pos[seat] = to;
    s.last = { seat, die, from, to, jump: to > landed ? 'ladder' : to < landed ? 'snake' : null };
    if (to === SNAKES_END) s.winner = seat;
    else if (die !== 6) s.turn = nextSeat(s, seat);
    return null;
  },
  drop(s, seat) {
    if (s.winner !== null || s.out[seat]) return;
    s.out[seat] = true;
    const live = s.out.flatMap((o, i) => (o ? [] : [i]));
    if (live.length === 1) s.winner = live[0];
    else if (s.turn === seat) s.turn = nextSeat(s, seat);
  },
  result: (s) => (s.winner === null ? null : [s.winner]),
  view: (s): SnakesView => ({ pos: s.pos, turn: s.turn, out: s.out, last: s.last }),
};
