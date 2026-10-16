// Shared maths for what hangs under a city's island (IslandBase): the coast resampled evenly with its outward
// normals, and a cheap repeatable noise so every city builds the same rock on every phone.

import type { Color } from 'three';
import type { P2 } from '../game/city';

/** A cheap repeatable "random": the same island every time, and the same on every phone. */
export const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Smooth 1D value noise: neighbouring samples agree, so ridges run down the rock instead of speckling it. */
export const vnoise = (x: number, seed: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return noise(seed + i) * (1 - u) + noise(seed + i + 1) * u;
};

export interface Rim {
  /** The coast, resampled to evenly spaced points. */
  pts: P2[];
  /** Outward unit normal at each point, in the ground plane. */
  normals: P2[];
  cx: number;
  cz: number;
  /** Furthest coast point from the middle. */
  radius: number;
}

/** The coast as `n` evenly spaced points with outward normals: the hand-drawn outlines bunch points up at the bends. */
export function rimOf(outline: P2[], n: number): Rim {
  const lens: number[] = [0];
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i];
    const [bx, bz] = outline[(i + 1) % outline.length];
    lens.push(lens[i] + Math.hypot(bx - ax, bz - az));
  }
  const total = lens[outline.length];
  const pts: P2[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / n) * total;
    while (lens[seg + 1] < want) seg++;
    const t = (want - lens[seg]) / (lens[seg + 1] - lens[seg] || 1);
    const [ax, az] = outline[seg];
    const [bx, bz] = outline[(seg + 1) % outline.length];
    pts.push([ax + (bx - ax) * t, az + (bz - az) * t]);
  }
  let area = 0, cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % n];
    area += ax * bz - bx * az;
    cx += ax;
    cz += az;
  }
  cx /= n;
  cz /= n;
  // The winding decides which side of the tangent is "out".
  const flip = area > 0 ? 1 : -1;
  const raw = pts.map((_, i): P2 => {
    const [ax, az] = pts[(i - 2 + n) % n];
    const [bx, bz] = pts[(i + 2) % n];
    const tx = bx - ax, tz = bz - az;
    const len = Math.hypot(tx, tz) || 1;
    return [(flip * tz) / len, (-flip * tx) / len];
  });
  // Averaged with the neighbours, so a kink in the coast doesn't fold the rock over itself.
  const normals = raw.map((_, i): P2 => {
    let x = 0, z = 0;
    for (let d = -2; d <= 2; d++) {
      x += raw[(i + d + n) % n][0];
      z += raw[(i + d + n) % n][1];
    }
    const len = Math.hypot(x, z) || 1;
    return [x / len, z / len];
  });
  const radius = Math.max(...pts.map(([x, z]) => Math.hypot(x - cx, z - cz)));
  return { pts, normals, cx, cz, radius };
}

/** 0 at night, 1 in daylight, read off the sky colour (three/Scene.tsx), so it follows the weather's greying too. */
export function skyLight(bg: Color) {
  const m = Math.max(bg.r, bg.g, bg.b);
  const t = Math.min(1, Math.max(0, (m - 0.03) / 0.55));
  return t * t * (3 - 2 * t);
}
