// Pool table physics, shared by the rules (worker/pool.ts) and the board that replays each shot
// (src/ui/PoolBoard.tsx). The server decides where the balls end up; the client runs the same code on the same
// numbers to animate it. To keep the two identical on every phone, the simulation only adds, multiplies,
// divides and takes square roots (exact everywhere), never sin or cos (which differ between browsers).

import type { PoolBall, PoolGroup } from './streetGames';

export const POOL = {
  /** Playing surface, in table units. The table stands upright: the rack is at the top, the white starts at the bottom. */
  W: 100,
  H: 200,
  /** Ball radius. */
  R: 3.4,
  /** How close a ball's centre must come to a pocket to drop. */
  CORNER: 6.5,
  SIDE: 6,
  /** Speed of the white at full power, table units per second. */
  MAX_SPEED: 300,
  /** Cloth friction: speed lost per second. */
  DECEL: 60,
  /** Speed kept when bouncing off a cushion, and when two balls collide. */
  CUSHION: 0.75,
  BALLS: 0.96,
  STEP: 1 / 240,
  /** Simulation steps per animation frame (60 frames a second). */
  FRAME: 4,
  MAX_STEPS: 240 * 12,
};

export const POOL_POCKETS: [number, number, number][] = [
  [0, 0, POOL.CORNER], [POOL.W, 0, POOL.CORNER],
  [0, POOL.H / 2, POOL.SIDE], [POOL.W, POOL.H / 2, POOL.SIDE],
  [0, POOL.H, POOL.CORNER], [POOL.W, POOL.H, POOL.CORNER],
];

/** Where the white starts, and where the front ball of the rack sits. */
export const POOL_HEAD: [number, number] = [50, 150];
export const POOL_FOOT: [number, number] = [50, 62];

export const POOL_BLACK = 8;
export const poolGroupOf = (id: number): PoolGroup | null => (id === 0 || id === POOL_BLACK ? null : id < POOL_BLACK ? 'plain' : 'stripe');

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The opening layout: a triangle with the black in the middle and one of each kind on the back corners. */
export function poolRack(): PoolBall[] {
  const rows = [[1], [9, 2], [3, 8, 10], [11, 4, 5, 12], [6, 13, 14, 7, 15]];
  const gap = 2 * POOL.R + 0.05;
  const rise = (gap * Math.sqrt(3)) / 2;
  const balls: PoolBall[] = [{ id: 0, x: POOL_HEAD[0], y: POOL_HEAD[1] }];
  rows.forEach((row, k) => row.forEach((id, j) => balls.push({ id, x: round(POOL_FOOT[0] + (j - k / 2) * gap), y: round(POOL_FOOT[1] - k * rise) })));
  return balls;
}

export interface PoolShot {
  /** Balls left on the table, at rest. */
  balls: PoolBall[];
  /** Balls that dropped, in the order they fell. */
  potted: number[];
  /** The first ball the white touched. */
  firstHit: number | null;
}

/**
 * Hit the white along (dx, dy) at `power` (0-1) and run the table until everything stops.
 * `onFrame` is called 60 times per simulated second with the balls still on the table.
 */
export function poolShoot(from: PoolBall[], dx: number, dy: number, power: number, onFrame?: (balls: PoolBall[]) => void): PoolShot {
  const { W, H, R, STEP } = POOL;
  const b = from.map((o) => ({ id: o.id, x: o.x, y: o.y, vx: 0, vy: 0, on: true }));
  const potted: number[] = [];
  let firstHit: number | null = null;
  const cue = b.find((o) => o.id === 0);
  const aim = Math.sqrt(dx * dx + dy * dy);
  if (cue && aim > 0) {
    const speed = Math.min(1, Math.max(0.05, power)) * POOL.MAX_SPEED;
    cue.vx = (dx / aim) * speed;
    cue.vy = (dy / aim) * speed;
  }
  const slow = POOL.DECEL * STEP;
  for (let step = 0; step < POOL.MAX_STEPS; step++) {
    let moving = false;
    for (const p of b) {
      if (!p.on || (p.vx === 0 && p.vy === 0)) continue;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed <= slow) {
        p.vx = p.vy = 0;
        continue;
      }
      const keep = (speed - slow) / speed;
      p.vx *= keep;
      p.vy *= keep;
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;
      moving = true;
    }
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (!p.on) continue;
      for (let j = i + 1; j < b.length; j++) {
        const q = b[j];
        if (!q.on) continue;
        const nx = q.x - p.x;
        const ny = q.y - p.y;
        const d2 = nx * nx + ny * ny;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const ux = nx / d;
        const uy = ny / d;
        // Push the two apart, then swap the speed they have towards each other (equal weights).
        const overlap = (2 * R - d) / 2;
        p.x -= ux * overlap;
        p.y -= uy * overlap;
        q.x += ux * overlap;
        q.y += uy * overlap;
        const closing = (p.vx - q.vx) * ux + (p.vy - q.vy) * uy;
        if (closing <= 0) continue;
        const push = ((1 + POOL.BALLS) / 2) * closing;
        p.vx -= push * ux;
        p.vy -= push * uy;
        q.vx += push * ux;
        q.vy += push * uy;
        if (firstHit === null && (p.id === 0 || q.id === 0)) firstHit = p.id === 0 ? q.id : p.id;
      }
    }
    for (const p of b) {
      if (!p.on) continue;
      if (POOL_POCKETS.some(([px, py, pr]) => (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py) < pr * pr)) {
        p.on = false;
        p.vx = p.vy = 0;
        potted.push(p.id);
        continue;
      }
      if (p.x < R) { p.x = R; p.vx = -p.vx * POOL.CUSHION; }
      else if (p.x > W - R) { p.x = W - R; p.vx = -p.vx * POOL.CUSHION; }
      if (p.y < R) { p.y = R; p.vy = -p.vy * POOL.CUSHION; }
      else if (p.y > H - R) { p.y = H - R; p.vy = -p.vy * POOL.CUSHION; }
    }
    if (onFrame && step % POOL.FRAME === 0) onFrame(b.filter((p) => p.on).map((p) => ({ id: p.id, x: p.x, y: p.y })));
    if (!moving) break;
  }
  return { balls: b.filter((p) => p.on).map((p) => ({ id: p.id, x: round(p.x), y: round(p.y) })), potted, firstHit };
}

/** The nearest spot to (x, y), stepping along the table, where a ball can be put down without touching another. */
export function poolFreeSpot(balls: PoolBall[], x: number, y: number): [number, number] {
  const clear = (yy: number) => balls.every((o) => (o.x - x) * (o.x - x) + (o.y - yy) * (o.y - yy) > 4.1 * POOL.R * POOL.R);
  for (let k = 0; k < 60; k++) {
    for (const yy of [y + k * POOL.R, y - k * POOL.R]) if (yy > POOL.R && yy < POOL.H - POOL.R && clear(yy)) return [x, yy];
  }
  return [x, y];
}
