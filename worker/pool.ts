// Eight-ball pool for Street Games. A shot is a direction and a power; the table physics (src/game/pool.ts)
// says where everything ends up, and this file reads the result: fouls, whose turn, who has plain or stripes,
// and what sinking the black means.

import { randInt, type Rules } from './gameKit';
import { POOL_BLACK, POOL_FOOT, POOL_HEAD, poolFreeSpot, poolGroupOf, poolRack, poolShoot } from '../src/game/pool';
import type { PoolBall, PoolGroup, PoolView } from '../src/game/streetGames';

interface PoolState {
  balls: PoolBall[];
  potted: number[];
  turn: number;
  group: (PoolGroup | null)[];
  shots: number;
  shot: PoolView['shot'];
  last: PoolView['last'];
  winner: number | null;
  gone: number | null;
}

/** Two players who cannot finish: called off level. */
const MAX_SHOTS = 300;

/** Has this seat sunk every ball of its kind (so the black is on)? */
const cleared = (s: PoolState, seat: number) => !!s.group[seat] && !s.balls.some((o) => poolGroupOf(o.id) === s.group[seat]);

export const pool: Rules<PoolState> = {
  init: () => ({ balls: poolRack(), potted: [], turn: randInt(2), group: [null, null], shots: 0, shot: null, last: null, winner: null, gone: null }),
  pending: (s) => (s.winner !== null || s.gone !== null || s.shots >= MAX_SHOTS ? [] : [s.turn]),
  move(s, seat, m) {
    if (s.winner !== null) return 'The game is over';
    if (seat !== s.turn) return 'Not your turn';
    const dx = Number(m.dx);
    const dy = Number(m.dy);
    const power = Number(m.power);
    if (![dx, dy, power].every(Number.isFinite) || (dx === 0 && dy === 0) || power <= 0 || power > 1) return 'Aim your shot first';
    const rival = 1 - seat;
    const breaking = s.shots === 0;
    const onBlack = cleared(s, seat);
    const from = s.balls;
    const { balls, potted, firstHit } = poolShoot(from, dx, dy, power);
    s.shot = { n: s.shots + 1, by: seat, from, dx, dy, power };
    s.shots++;
    s.balls = balls;

    let foul: string | null = null;
    const first = firstHit === null ? null : poolGroupOf(firstHit);
    if (potted.includes(0)) foul = 'sank the white';
    else if (firstHit === null) foul = 'hit nothing';
    else if (firstHit === POOL_BLACK ? !onBlack && !breaking : onBlack || (!!s.group[seat] && first !== s.group[seat])) foul = 'hit the wrong ball first';

    if (potted.includes(0)) {
      const [x, y] = poolFreeSpot(s.balls, ...POOL_HEAD);
      s.balls.push({ id: 0, x, y });
    }
    const sunk = potted.filter((id) => id !== 0 && id !== POOL_BLACK);
    s.potted.push(...sunk);
    s.last = { seat, potted: potted.filter((id) => id !== 0), foul };

    if (potted.includes(POOL_BLACK)) {
      if (breaking) {
        // The black going down off the break is nobody's fault: it goes back on its spot.
        const [x, y] = poolFreeSpot(s.balls, ...POOL_FOOT);
        s.balls.push({ id: POOL_BLACK, x, y });
        s.last.potted = sunk;
      } else {
        s.potted.push(POOL_BLACK);
        s.winner = onBlack && !foul ? seat : rival;
        return null;
      }
    }
    // The first ball legally sunk decides who has plain and who has stripes.
    if (!s.group[seat] && !foul && sunk.length) {
      const mine = poolGroupOf(sunk[0])!;
      s.group[seat] = mine;
      s.group[rival] = mine === 'plain' ? 'stripe' : 'plain';
    }
    const scored = sunk.some((id) => poolGroupOf(id) === s.group[seat]);
    if (foul || !scored) s.turn = rival;
    return null;
  },
  drop(s, seat) {
    s.gone = seat;
  },
  result(s) {
    if (s.gone !== null) return [1 - s.gone];
    if (s.winner !== null) return [s.winner];
    return s.shots >= MAX_SHOTS ? [0, 1] : null;
  },
  view: (s): PoolView => ({ balls: s.balls, potted: s.potted, turn: s.turn, group: s.group, shot: s.shot, last: s.last }),
};
