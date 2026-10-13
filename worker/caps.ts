// Cover Soccer for Street Games: four bottle covers a side and a ball. Each turn is one flick; the table
// physics (src/game/capball.ts) says where everything stops and whether the ball went in. First to 3 goals.

import { randInt, type Rules } from './gameKit';
import { capFlick, capKickoff, capOwner } from '../src/game/capball';
import { CAPS_TARGET, type CapsDisc, type CapsView } from '../src/game/streetGames';

interface CapsState {
  discs: CapsDisc[];
  score: [number, number];
  turn: number;
  flicks: number;
  shot: CapsView['shot'];
  last: CapsView['last'];
  gone: number | null;
}

/** A match nobody can finish ends on the score as it stands. */
const MAX_FLICKS = 240;

const leader = (s: CapsState) => (s.score[0] === s.score[1] ? [0, 1] : [s.score[0] > s.score[1] ? 0 : 1]);
const finished = (s: CapsState) => Math.max(...s.score) >= CAPS_TARGET || s.flicks >= MAX_FLICKS;

export const caps: Rules<CapsState> = {
  init: () => ({ discs: capKickoff(), score: [0, 0], turn: randInt(2), flicks: 0, shot: null, last: null, gone: null }),
  pending: (s) => (s.gone !== null || finished(s) ? [] : [s.turn]),
  move(s, seat, m) {
    if (finished(s)) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    const id = Number(m.cap);
    const dx = Number(m.dx);
    const dy = Number(m.dy);
    const power = Number(m.power);
    if (!Number.isInteger(id) || capOwner(id) !== seat || !s.discs.some((o) => o.id === id)) return 'Pick one of your own covers';
    if (![dx, dy, power].every(Number.isFinite) || (dx === 0 && dy === 0) || power <= 0 || power > 1) return 'Aim your flick first';
    const from = s.discs;
    const { discs, goal } = capFlick(from, id, dx, dy, power);
    s.flicks++;
    s.shot = { n: s.flicks, by: seat, from, id, dx, dy, power };
    s.last = { seat, goal };
    if (goal === null) {
      s.discs = discs;
      s.turn = 1 - seat;
    } else {
      // Own goals count too. Everyone lines up again and the side that conceded kicks off.
      s.score[goal]++;
      s.discs = capKickoff();
      s.turn = 1 - goal;
    }
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    return finished(s) ? leader(s) : null;
  },
  view: (s): CapsView => ({ discs: s.discs, score: s.score, turn: s.turn, shot: s.shot, last: s.last }),
};
