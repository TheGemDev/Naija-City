// Ludo for Street Games, Naija style: two dice, four seeds each. A six brings a seed out. Each die is played
// on its own (on the same seed or on two), a double six rolls again, and landing on a rival sends that seed
// back to base. First to get all four home wins. Geometry: src/game/ludo.ts.

import { randInt, type Rules } from './gameKit';
import { LUDO_HOME, LUDO_LAP, LUDO_SAFE, ludoColors, ludoSquare } from '../src/game/ludo';
import type { LudoView } from '../src/game/streetGames';

interface LudoState {
  /** Each seat's four seeds (see src/game/ludo.ts for what the numbers mean). */
  tok: number[][];
  turn: number;
  /** Dice still to be played from this roll; empty when the player must roll. */
  dice: number[];
  out: boolean[];
  last: LudoView['last'];
  winner: number | null;
}

const colorOf = (s: LudoState, seat: number) => ludoColors(s.tok.length)[seat];
const canMove = (p: number, die: number) => (p < 0 ? die === 6 : p + die <= LUDO_HOME);

/** Every [die, seed] the seat could play now. */
function options(s: LudoState, seat: number): [number, number][] {
  return [...new Set(s.dice)].flatMap((die) => s.tok[seat].flatMap((p, i): [number, number][] => (canMove(p, die) ? [[die, i]] : [])));
}

function nextSeat(s: LudoState, from: number): number {
  for (let step = 1; step <= s.tok.length; step++) {
    const seat = (from + step) % s.tok.length;
    if (!s.out[seat]) return seat;
  }
  return from;
}

/** Play one die on seed `i` and capture whatever it lands on. */
function advance(s: LudoState, seat: number, die: number, i: number) {
  const to = s.tok[seat][i] < 0 ? 0 : s.tok[seat][i] + die;
  s.tok[seat][i] = to;
  s.dice.splice(s.dice.indexOf(die), 1);
  const square = to <= LUDO_LAP ? ludoSquare(colorOf(s, seat), to) : -1;
  if (square >= 0 && !LUDO_SAFE.has(square)) {
    s.tok.forEach((seeds, rival) => {
      if (rival === seat || s.out[rival]) return;
      seeds.forEach((p, j) => {
        if (p < 0 || p > LUDO_LAP || ludoSquare(colorOf(s, rival), p) !== square) return;
        seeds[j] = -1;
        s.last!.captured++;
      });
    });
  }
  if (to === LUDO_HOME) s.last!.home++;
  if (s.tok[seat].every((p) => p === LUDO_HOME)) s.winner = seat;
}

/** Play every die that leaves no choice, then stop: either the player must choose, or the roll is used up and the turn moves on. */
function settle(s: LudoState, seat: number) {
  while (s.winner === null && s.dice.length) {
    const can = options(s, seat);
    if (!can.length) {
      s.dice = [];
      break;
    }
    // A real choice: different dice, or seeds standing on different spots.
    if (new Set(can.map(([die, i]) => `${die}:${s.tok[seat][i]}`)).size > 1) return;
    advance(s, seat, can[0][0], can[0][1]);
  }
  const [a, b] = s.last!.roll;
  if (s.winner === null && !(a === 6 && b === 6)) s.turn = nextSeat(s, seat);
}

export const ludo: Rules<LudoState> = {
  init: (seats) => ({ tok: Array.from({ length: seats }, () => [-1, -1, -1, -1]), turn: randInt(seats), dice: [], out: Array(seats).fill(false), last: null, winner: null }),
  pending: (s) => (s.winner !== null ? [] : [s.turn]),
  move(s, seat, m) {
    if (s.winner !== null) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    if (!s.dice.length) {
      const roll: [number, number] = [1 + randInt(6), 1 + randInt(6)];
      s.dice = [...roll];
      s.last = { seat, roll, captured: 0, home: 0 };
    } else {
      const die = Number(m.die);
      const i = Number(m.token);
      if (!options(s, seat).some(([d, t]) => d === die && t === i)) return 'That seed cannot move with that die';
      advance(s, seat, die, i);
    }
    settle(s, seat);
    return null;
  },
  drop(s, seat) {
    if (s.winner !== null || s.out[seat]) return;
    s.out[seat] = true;
    s.tok[seat] = [-1, -1, -1, -1];
    const live = s.out.flatMap((o, i) => (o ? [] : [i]));
    if (live.length === 1) s.winner = live[0];
    else if (s.turn === seat) {
      s.dice = [];
      s.turn = nextSeat(s, seat);
    }
  },
  result: (s) => (s.winner === null ? null : [s.winner]),
  view: (s, seat): LudoView => ({
    colors: ludoColors(s.tok.length),
    tok: s.tok,
    turn: s.turn,
    dice: s.dice,
    options: s.winner === null && seat === s.turn ? options(s, seat) : [],
    out: s.out,
    last: s.last,
  }),
};
