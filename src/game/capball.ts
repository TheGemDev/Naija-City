// Cover Soccer physics: bottle covers and a ball on a table, shared by the rules (worker/caps.ts) and the board
// that replays each flick (src/ui/CapsBoard.tsx). As with pool (src/game/pool.ts), the server decides and the
// client re-runs the same sums to animate, so this only adds, multiplies, divides and takes square roots.

import type { CapsDisc } from './streetGames';

export const PITCH = {
  W: 100,
  H: 160,
  /** Radius of a bottle cover and of the ball. */
  CAP: 4.4,
  BALL: 2.5,
  /** The goal mouth, left post to right post. Seat 0 defends the bottom goal and shoots up the screen. */
  GOAL: [33, 67] as [number, number],
  /** Speed of a cover flicked at full power, units per second. */
  MAX_SPEED: 240,
  /** Speed lost per second: covers drag on the table, the ball rolls on. */
  CAP_DRAG: 120,
  BALL_DRAG: 36,
  CAP_MASS: 1,
  BALL_MASS: 0.3,
  /** Speed kept bouncing off the boards, and when two things collide. */
  WALL: 0.55,
  HIT: 0.9,
  STEP: 1 / 240,
  FRAME: 4,
  MAX_STEPS: 240 * 10,
};

export const CAPS_PER_SIDE = 4;
/** Which seat a disc belongs to (-1 for the ball). */
export const capOwner = (id: number) => (id === 0 ? -1 : id <= CAPS_PER_SIDE ? 0 : 1);

/** Everything back in place for a kick-off: keeper, two at the back, one up front. */
export function capKickoff(): CapsDisc[] {
  const { W, H } = PITCH;
  const side = [[W / 2, 12], [W * 0.28, 38], [W * 0.72, 38], [W / 2, 60]];
  return [
    { id: 0, x: W / 2, y: H / 2 },
    ...side.map(([x, y], i) => ({ id: 1 + i, x, y: H - y })),
    ...side.map(([x, y], i) => ({ id: 1 + CAPS_PER_SIDE + i, x, y })),
  ];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface CapsFlick {
  discs: CapsDisc[];
  /** The seat that scored, if the ball went in. */
  goal: number | null;
}

/** Flick cover `id` along (dx, dy) at `power` (0-1) and run the table until everything stops or the ball goes in. */
export function capFlick(from: CapsDisc[], id: number, dx: number, dy: number, power: number, onFrame?: (discs: CapsDisc[]) => void): CapsFlick {
  const { W, H, STEP } = PITCH;
  const d = from.map((o) => ({
    id: o.id, x: o.x, y: o.y, vx: 0, vy: 0,
    r: o.id === 0 ? PITCH.BALL : PITCH.CAP,
    m: o.id === 0 ? PITCH.BALL_MASS : PITCH.CAP_MASS,
    slow: (o.id === 0 ? PITCH.BALL_DRAG : PITCH.CAP_DRAG) * STEP,
  }));
  const hit = d.find((o) => o.id === id);
  const aim = Math.sqrt(dx * dx + dy * dy);
  if (hit && aim > 0) {
    const speed = Math.min(1, Math.max(0.05, power)) * PITCH.MAX_SPEED;
    hit.vx = (dx / aim) * speed;
    hit.vy = (dy / aim) * speed;
  }
  let goal: number | null = null;
  for (let step = 0; step < PITCH.MAX_STEPS && goal === null; step++) {
    let moving = false;
    for (const p of d) {
      if (p.vx === 0 && p.vy === 0) continue;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed <= p.slow) {
        p.vx = p.vy = 0;
        continue;
      }
      const keep = (speed - p.slow) / speed;
      p.vx *= keep;
      p.vy *= keep;
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;
      moving = true;
    }
    for (let i = 0; i < d.length; i++) {
      for (let j = i + 1; j < d.length; j++) {
        const p = d[i];
        const q = d[j];
        const nx = q.x - p.x;
        const ny = q.y - p.y;
        const reach = p.r + q.r;
        const d2 = nx * nx + ny * ny;
        if (d2 >= reach * reach || d2 === 0) continue;
        const dist = Math.sqrt(d2);
        const ux = nx / dist;
        const uy = ny / dist;
        // Push them apart (the lighter one gives way more), then share out the speed they have towards each other.
        const total = p.m + q.m;
        const overlap = reach - dist;
        p.x -= ux * overlap * (q.m / total);
        p.y -= uy * overlap * (q.m / total);
        q.x += ux * overlap * (p.m / total);
        q.y += uy * overlap * (p.m / total);
        const closing = (p.vx - q.vx) * ux + (p.vy - q.vy) * uy;
        if (closing <= 0) continue;
        const push = ((1 + PITCH.HIT) * closing) / (1 / p.m + 1 / q.m);
        p.vx -= (push / p.m) * ux;
        p.vy -= (push / p.m) * uy;
        q.vx += (push / q.m) * ux;
        q.vy += (push / q.m) * uy;
      }
    }
    for (const p of d) {
      if (p.x < p.r) { p.x = p.r; p.vx = -p.vx * PITCH.WALL; }
      else if (p.x > W - p.r) { p.x = W - p.r; p.vx = -p.vx * PITCH.WALL; }
      // The ball passes between the posts; covers never do.
      const open = p.id === 0 && p.x > PITCH.GOAL[0] && p.x < PITCH.GOAL[1];
      if (open && p.y < 0) goal = 0;
      else if (open && p.y > H) goal = 1;
      else if (!open && p.y < p.r) { p.y = p.r; p.vy = -p.vy * PITCH.WALL; }
      else if (!open && p.y > H - p.r) { p.y = H - p.r; p.vy = -p.vy * PITCH.WALL; }
    }
    if (onFrame && step % PITCH.FRAME === 0) onFrame(d.map((p) => ({ id: p.id, x: p.x, y: p.y })));
    if (!moving) break;
  }
  return { discs: d.map((p) => ({ id: p.id, x: round(p.x), y: round(p.y) })), goal };
}
