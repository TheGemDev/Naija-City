// The train station on the city map (cityModels.tsx 'station'), built like the place models (placeKit.tsx): a glass-
// fronted hall in the railway's green and white with a clock tower, a platform under a long canopy behind it, two
// tracks, and the train itself (trainKit.tsx) pulling in, standing and pulling out again.
//
// The tracks don't stop at the plot. Each city's station is looked at where it stands on its map: the line runs on
// either way until it would meet a building, a house, a tree, a landmark, water or the edge of the land (it may cross a
// road: rails only there, like a level crossing), up to RUN_MAX. The train comes in from the far end of one run and
// leaves to the far end of the other, thinning out over the last stretch (trainKit PassingTrain) instead of vanishing
// at the plot's edge. It runs out the side with the longer clear run.

import { useMemo } from 'react';
import { activeMap, placeYaw } from '../game/city';
import { useLowPerf } from '../game/quality';
import { Glow, Kit, KitModel, type Built } from './placeKit';
import { buildTrain, PassingTrain, RAIL_GREEN, RAIL_WHITE } from './trainKit';

/** The train at the map's scale: a diesel and a coach, as long as the platform. */
const MAP_SCALE = 0.4;
/** How far past the plot the line may run, either way. */
const RUN_MAX = 14;
/** The stretch at each far end over which the train thins out. */
const FADE = 1.6;

const BALLAST = '#8a8178';
const SLEEPER = '#5b4636';
const RAIL = '#6b7078';
const PAVING = '#d6d3d1';
const EDGE = '#f8fafc';
const LINE = '#facc15';
const HALL = '#f5f5f4';
const STEEL = '#94a3b8';
const ROOF = '#e5e7eb';
const BENCH = '#92400e';
const DARK = '#1f2937';

/** Where the two tracks run, across the plot's depth: the near one (the train's) and the far one. */
const tracks = (d: number) => ({ near: -d / 2 + 0.45, far: -d / 2 + 1.05 });

/**
 * How far the near track can run on past each end of the plot (in its own x): clear of every other building, house,
 * tree and landmark, on dry land, and stopping short of any road: the line never crosses the tarmac.
 */
function clearRuns(w: number, d: number) {
  const m = activeMap();
  const st = m.placeById?.station;
  if (!st) return { minus: 3, plus: 3 };
  const yaw = placeYaw(st);
  const cx = st.x + st.w / 2, cz = st.z + st.d / 2;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const world = (x: number, z: number) => [cx + x * cos + z * sin, cz - x * sin + z * cos] as const;
  const inside = (r: { x: number; z: number; w: number; d: number }, x: number, z: number, pad: number) => x >= r.x - pad && x <= r.x + r.w + pad && z >= r.z - pad && z <= r.z + r.d + pad;
  const blocked = (x: number, z: number) =>
    !m.isLand(x, z) || m.isWater(x, z) || m.isBridge(x, z) || m.isRoad(x, z)
    || m.places.some((p) => p !== st && inside(p, x, z, 0.15))
    || m.landmarks.some((l) => inside(l, x, z, 0.15))
    || m.houses.some((h) => inside(h, x, z, 0.1))
    || m.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 0.35 + t.s * 0.4);
  const { near } = tracks(d);
  const run = (dir: number) => {
    let free = 0;
    // A step past the last clear sample stays clear of what stopped it: a gap of a quarter cell before the road.
    for (let s = w / 2 + 0.25; s <= w / 2 + RUN_MAX + 1e-6; s += 0.25) {
      const cells = [near - 0.42, near, near + 0.42].map((z) => world(dir * s, z));
      if (cells.some(([x, z]) => blocked(x, z))) break;
      free = s - 0.25 - w / 2;
    }
    return Math.max(0, free);
  };
  return { minus: run(-1), plus: run(1) };
}

function buildStation(w: number, d: number, runs: ReturnType<typeof clearRuns>, low: boolean): Built {
  const k = new Kit();
  const glow = new Glow();
  const { near, far } = tracks(d);
  const back = -d / 2;
  const platform = back + 1.75;
  // The line: ballast, sleepers and rails on the plot and out along the clear runs.
  const x0 = -w / 2 - runs.minus, x1 = w / 2 + runs.plus;
  k.box(BALLAST, [0, 0.02, back + 0.8], [w, 0.04, 1.6]);
  for (const [a, b] of [[x0, -w / 2], [w / 2, x1]] as const) if (b - a > 0.01) k.box(BALLAST, [(a + b) / 2, 0.02, near], [b - a, 0.04, 0.95]);
  for (const z of [near, far]) {
    const [a, b] = z === near ? [x0, x1] : [-w / 2, w / 2];
    for (let x = a + 0.15; x < b; x += 0.3) k.box(SLEEPER, [x, 0.05, z], [0.08, 0.03, 0.8]);
    for (const dz of [-0.3, 0.3]) k.box(RAIL, [(a + b) / 2, 0.08, z + dz], [b - a, 0.04, 0.05]);
  }
  // A buffer stop where the far track ends, and a signal at each end of the platform
  k.box('#b91c1c', [-w / 2 + 0.12, 0.2, far], [0.12, 0.3, 0.7]);
  for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) {
    k.post(DARK, [sx, 0, back + 0.1], 0.03, 1.1, 6);
    k.box(DARK, [sx, 1.15, back + 0.1], [0.14, 0.26, 0.12]);
    k.box('lamp', [sx, 1.2, back + 0.17], [0.06, 0.06, 0.02]);
  }
  // The platform: paving, the yellow line and white edge, lamps and benches, under a canopy on slim columns
  k.box(PAVING, [0, 0.18, platform], [w - 0.2, 0.36, 0.7]);
  k.box(LINE, [0, 0.365, platform - 0.2], [w - 0.2, 0.012, 0.06]);
  k.box(EDGE, [0, 0.365, platform - 0.33], [w - 0.2, 0.012, 0.05]);
  for (let x = -w / 2 + 0.6; x <= w / 2 - 0.5; x += 1.2) k.post(STEEL, [x, 0.36, platform + 0.2], 0.035, 1.08, 6);
  k.box(ROOF, [0, 1.47, platform - 0.1], [w - 0.4, 0.06, 1.0], [0.06, 0, 0]);
  k.box(RAIL_GREEN, [0, 1.45, platform - 0.6], [w - 0.4, 0.14, 0.05]);
  for (const x of [-w / 4, w / 4]) {
    k.box(BENCH, [x, 0.55, platform + 0.15], [0.5, 0.05, 0.16]);
    k.post(STEEL, [x + 0.6, 0.36, platform + 0.25], 0.02, 0.6, 5);
    k.box('lamp', [x + 0.6, 0.98, platform + 0.25], [0.12, 0.05, 0.12]);
    glow.quad([x + 0.2, 0.37, platform - 0.3], [x + 1.0, 0.37, platform - 0.3], [x + 1.0, 0.37, platform + 0.3], [x + 0.2, 0.37, platform + 0.3], [0.5, 0.4, 0.22], [0.5, 0.4, 0.22], [0, 0, 0], [0, 0, 0]);
  }
  // The hall: white walls, glass all along the front in panes, a green band and roof, the entrance canopy. All of it
  // stays inside the plot: the canopy's front edge is the plot's, so nothing stands out over the street at the door.
  const hall0 = platform + 0.45, hall1 = d / 2 - 0.55;
  const hd = hall1 - hall0;
  const hz = (hall0 + hall1) / 2;
  k.box(HALL, [0, 0.75, hz], [w - 0.5, 1.5, hd]);
  const panes = Math.max(4, Math.round((w - 0.9) / 0.6));
  for (let i = 0; i < panes; i++) {
    const px = -(w - 0.9) / 2 + (i + 0.5) * ((w - 0.9) / panes);
    k.box('glass', [px, 0.72, hz + hd / 2 + 0.012], [(w - 0.9) / panes - 0.06, 0.95, 0.03]);
  }
  k.box(RAIL_WHITE, [0, 1.22, hz + hd / 2 + 0.02], [w - 0.9, 0.05, 0.05]);
  k.box(RAIL_GREEN, [0, 1.58, hz], [w - 0.3, 0.16, hd + 0.3]);
  k.box(ROOF, [0, 1.69, hz], [w - 0.6, 0.06, hd + 0.1]);
  if (!low) for (let x = -w / 2 + 0.8; x < w / 2 - 1; x += 1.1) k.box('#cbd5e1', [x, 1.78, hz], [0.6, 0.12, 0.5]);
  k.box(RAIL_GREEN, [0, 1.25, hz + hd / 2 + 0.06], [1.6, 0.28, 0.05]);
  k.box('lamp', [0, 1.25, hz + hd / 2 + 0.09], [1.4, 0.16, 0.02]);
  k.box(RAIL_GREEN, [0, 1.0, hall1 + 0.25], [1.4, 0.05, 0.5]);
  for (const x of [-0.6, 0.6]) k.post(STEEL, [x, 0, hall1 + 0.42], 0.03, 1.0, 6);
  // The clock tower at one end
  const tx = w / 2 - 0.65;
  k.box(HALL, [tx, 1.2, hz], [0.6, 2.4, 0.6]);
  k.box(RAIL_GREEN, [tx, 2.3, hz], [0.66, 0.2, 0.66]);
  k.box(RAIL_GREEN, [tx, 2.5, hz], [0.4, 0.2, 0.4]);
  k.box('lamp', [tx, 1.95, hz + 0.31], [0.34, 0.34, 0.02]);
  for (const r of [0, Math.PI / 2]) k.box(DARK, [tx, 1.95, hz + 0.325], [0.03, 0.14, 0.01], [0, 0, r + 0.6]);
  return { parts: k.build(), glow: glow.build() };
}

export function TrainStation({ w, d }: { w: number; d: number }) {
  const low = useLowPerf();
  const runs = useMemo(() => clearRuns(w, d), [w, d]);
  const train = useMemo(() => buildTrain(1, { low, glow: true }), [low]);
  const { near } = tracks(d);
  // Out the side with the longer clear run; in from the other.
  const dir = runs.plus >= runs.minus ? 1 : -1;
  return (
    <group>
      <KitModel build={(l) => buildStation(w, d, runs, l)} deps={[w, d, runs]} />
      <PassingTrain train={train} from={-w / 2 - runs.minus} to={w / 2 + runs.plus} stop={dir * (w / 2 - 0.3)} dir={dir} at={[0, 0.1, near]} scale={MAP_SCALE} fade={FADE} cycle={46} />
    </group>
  );
}
