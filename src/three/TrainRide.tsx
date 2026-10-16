// On the train: the coach you ride in, seen with its roof off, running along the line between two cities. It stands
// in for the station while the trip is under way (game/store.ts flightOf → 'train'), the way FlightCabin does for a
// flight. The land is FlightTerrain's, seen from the ground this time, with the railway laid down the middle of it
// (rail): savanna, villages, farms, a river and its bridge, a halt the train runs through. The coach pulls out of the
// station you board at, runs, and brakes into the station at the other end, swaying a little all the way.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, type Group } from 'three';
import { findAction, taskDurationSeconds, useGame } from '../game/store';
import { useLowPerf } from '../game/quality';
import { regionPlace } from '../game/regions';
import { encodeLook, randomAppearance } from '../game/wardrobe';
import type { RailClass } from '../game/transport';
import type { Clip } from './Person';
import { Baked, Kit, KitMeshes, type Built } from './cabinKit';
import { coach as coachExterior, loco, RAIL_GREEN, RAIL_WHITE, RAIL_YELLOW } from './trainKit';
import { FlightTerrain, RAIL_TOP, type FlightMotion } from './FlightTerrain';
import { Attendant, Seated } from './FlightCabin';
import { Label } from './propKit';

/** The coach, end to end: the camera frames this (three/Scene.tsx). */
export const TRAIN_LENGTH = 16;
const HALF = TRAIN_LENGTH / 2;
/** Half the coach's width, outside. */
const HW = 1.5;
/** Where the tops of the rails are, under the coach's floor (y = 0). */
const RAIL_Y = -1.1;
const SEAT_Y = 0.45;

/* ---------- The seating plan ---------- */

interface Plan {
  /** Table bays along the coach: two rows of seats facing each other over a table. */
  bays: number[];
  /** How far each row of a bay sits from its table. */
  row: number;
  /** Seats across a row. */
  cols: number[];
  /** The middle of the aisle. */
  aisle: number;
  /** Seat width. */
  w: number;
  /** The tables across each bay: their middle and width. */
  tables: [number, number][];
  /** Window centres along the far wall are the bays; this wide. */
  window: number;
}

const PLAN: Record<RailClass, Plan> = {
  // Standard: two and two, six bays.
  standard: { bays: [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5], row: 0.75, cols: [-1.05, -0.47, 0.47, 1.05], aisle: 0, w: 0.56, tables: [[-0.76, 1.12], [0.76, 1.12]], window: 1.7 },
  // Business: a single seat by the far wall, a pair on the near side, five bays, more room.
  business: { bays: [-5.2, -2.6, 0, 2.6, 5.2], row: 0.85, cols: [-1.0, 0.42, 1.02], aisle: -0.29, w: 0.66, tables: [[-1.0, 0.66], [0.72, 1.24]], window: 2.0 },
};

/** Your seat on each class: at the far window, facing forward, so the camera sees you and the land behind you. */
export const TRAIN_SEAT: Record<RailClass, { x: number; z: number }> = {
  standard: { x: -1.05, z: 1.1 - 0.75 },
  business: { x: -1.0, z: -0.85 },
};

/** Which class of ticket the trip under way is on. */
export function rideClass(): RailClass {
  const s = useGame.getState();
  const t = s.task;
  return (t && findAction(t.itemId, t.actionId, s.items, t.placeId)?.cls) ?? 'standard';
}

const FABRIC: Record<RailClass, { seat: string; back: string; finish: 'matte' | 'satin' }> = {
  standard: { seat: '#166534', back: '#475569', finish: 'matte' },
  business: { seat: '#7c4a23', back: '#3f2a1d', finish: 'satin' },
};

/** One seat, facing +z, its cushion top at SEAT_Y. */
function seat(k: Kit, cls: RailClass, w: number, aisleSide: number) {
  const f = FABRIC[cls];
  k.box([0.3, SEAT_Y - 0.15, 0.36], [0, (SEAT_Y - 0.15) / 2, -0.05], '#475569', 'metal');
  k.soft([w, 0.16, 0.56], [0, SEAT_Y - 0.08, 0.02], f.seat, f.finish, undefined, 0.06);
  k.push([0, SEAT_Y + 0.5, -0.27], [-0.08, 0, 0]);
  k.soft([w, 1.0, 0.14], [0, 0, 0], f.seat, f.finish, undefined, 0.06);
  k.soft([w + 0.02, 1.02, 0.05], [0, 0, -0.085], f.back, 'satin', undefined, 0.02);
  if (cls === 'business') {
    for (const s of [-1, 1]) k.soft([0.1, 0.32, 0.12], [s * (w / 2 - 0.06), 0.3, 0.07], f.seat, 'satin', undefined, 0.04);
    k.box([w - 0.2, 0.012, 0.012], [0, 0.0, 0.072], '#e7d3b0', 'satin');
  } else {
    k.box([w - 0.1, 0.26, 0.012], [0, 0.33, 0.076], '#f8fafc');
    k.box([w - 0.1, 0.03, 0.013], [0, 0.26, 0.077], RAIL_GREEN);
  }
  k.pop();
  // An armrest on the aisle side
  k.soft([0.07, 0.06, 0.42], [aisleSide * (w / 2 + 0.02), SEAT_Y + 0.2, 0.02], '#334155', 'satin', undefined, 0.025);
  if (cls === 'business') k.soft([0.07, 0.06, 0.42], [-aisleSide * (w / 2 + 0.02), SEAT_Y + 0.2, 0.02], '#334155', 'satin', undefined, 0.025);
}

/** Everything inside the coach and its shell: floor, walls, windows' frames, racks, seats, tables, the doors at each end. */
function interior(cls: RailClass, low: boolean): { kit: Built; glass: Built } {
  const k = new Kit(low);
  const g = new Kit(low);
  const plan = PLAN[cls];
  const IN = HW - 0.08;
  // Underneath: the underframe, its boxes, and two bogies with their wheels on the rails
  k.box([HW * 2 - 0.3, 0.5, TRAIN_LENGTH - 0.6], [0, -0.3, 0], '#1f2937', 'satin');
  for (const z of [-HALF + 2.6, HALF - 2.6]) {
    k.box([1.4, 0.3, 2.4], [0, -0.68, z], '#111827', 'satin');
    for (const dz of [-0.65, 0.65]) for (const x of [-0.75, 0.75]) k.cyl(0.38, 0.38, 0.1, [x, RAIL_Y + 0.38, z + dz], '#374151', 'metal', [0, 0, Math.PI / 2], 16);
  }
  for (const z of [-2.5, 2.5]) k.box([1.8, 0.4, 2.4], [0, -0.55, z], '#374151', 'satin');
  // Floor: grey, a green runner down the aisle, and little lights along it
  k.box([HW * 2 - 0.02, 0.1, TRAIN_LENGTH], [0, -0.05, 0], '#475569', 'satin');
  k.box([IN * 2, 0.01, TRAIN_LENGTH - 0.3], [0, 0.002, 0], '#6b7280');
  k.box([0.55, 0.012, TRAIN_LENGTH - 1.4], [plan.aisle, 0.006, 0], RAIL_GREEN);
  plan.bays.forEach((z) => { for (const dz of [-1.1, 1.1]) for (const s of [-1, 1]) k.box([0.03, 0.014, 0.12], [plan.aisle + s * 0.3, 0.008, z + dz], '#fde68a', 'glow'); });
  // The near side wall, cut down to the sills so you see in: livery outside, a panel inside, a rounded cap on top
  k.box([0.08, 0.88, TRAIN_LENGTH], [HW - 0.04, 0.41, 0], RAIL_WHITE, 'satin');
  k.box([0.09, 0.36, TRAIN_LENGTH], [HW - 0.035, 0.15, 0], RAIL_GREEN, 'satin');
  k.box([0.095, 0.05, TRAIN_LENGTH], [HW - 0.03, 0.42, 0], RAIL_YELLOW, 'satin');
  k.box([0.02, 0.8, TRAIN_LENGTH - 0.2], [HW - 0.09, 0.42, 0], '#e2e8f0', 'satin');
  k.soft([0.16, 0.06, TRAIN_LENGTH], [HW - 0.06, 0.86, 0], '#cbd5e1', 'satin', undefined, 0.025);
  // The far wall: a panel below the windows, pillars between them, the wall above, and the green band outside
  const W = plan.window;
  k.box([0.08, 0.8, TRAIN_LENGTH], [-HW + 0.04, 0.4, 0], '#e2e8f0', 'satin');
  k.box([0.14, 0.05, TRAIN_LENGTH], [-HW + 0.1, 0.82, 0], '#94a3b8', 'satin');
  k.box([0.08, 0.7, TRAIN_LENGTH], [-HW + 0.04, 2.1, 0], '#e2e8f0', 'satin');
  const edges = [-HALF, ...plan.bays.flatMap((z) => [z - W / 2, z + W / 2]), HALF];
  for (let i = 0; i < edges.length; i += 2) {
    const z0 = edges[i], z1 = edges[i + 1];
    if (z1 - z0 > 0.01) k.box([0.08, 0.95, z1 - z0], [-HW + 0.04, 1.275, (z0 + z1) / 2], '#e2e8f0', 'satin');
  }
  plan.bays.forEach((z, i) => {
    // The window: a dark frame, the glass (its own see-through mesh), and a curtain tied back each side
    for (const s of [-1, 1]) k.box([0.1, 0.99, 0.05], [-HW + 0.08, 1.275, z + s * (W / 2 - 0.02)], '#334155', 'satin');
    for (const y of [0.8, 1.75]) k.box([0.1, 0.05, W], [-HW + 0.08, y, z], '#334155', 'satin');
    g.box([0.02, 0.92, W - 0.06], [-HW + 0.03, 1.275, z], '#000000', 'satin');
    const curtain = cls === 'business' ? '#e7d3b0' : i % 2 ? '#14532d' : '#166534';
    for (const s of [-1, 1]) k.soft([0.07, 0.95, 0.16], [-HW + 0.14, 1.27, z + s * (W / 2 + 0.06)], curtain, 'matte', undefined, 0.03);
  });
  // The luggage rack along the far wall, a strip of light under it, and bags on it
  k.box([0.4, 0.03, TRAIN_LENGTH - 0.6], [-HW + 0.28, 2.02, 0], '#cbd5e1', 'metal');
  k.box([0.03, 0.06, TRAIN_LENGTH - 0.6], [-HW + 0.47, 2.06, 0], '#94a3b8', 'metal');
  k.box([0.03, 0.025, TRAIN_LENGTH - 0.6], [-HW + 0.46, 1.98, 0], '#fff1d6', 'glow');
  for (let z = -HALF + 1; z < HALF - 1; z += 1.6) k.box([0.3, 0.12, 0.05], [-HW + 0.2, 1.96, z], '#94a3b8', 'metal');
  const bags = ['#1e3a8a', '#7c2d12', '#0f172a', '#a16207', '#4d7c0f', '#6b21a8', '#be123c'];
  for (let i = 0, z = -HALF + 1.2; z < HALF - 1.2; i++, z += 0.9 + ((i * 37) % 5) * 0.12) {
    if ((i * 13) % 4 === 3) continue;
    const h = 0.18 + ((i * 7) % 3) * 0.05;
    k.soft([0.32, h, 0.42 + ((i * 11) % 3) * 0.1], [-HW + 0.28, 2.035 + h / 2, z], bags[i % bags.length], 'satin', undefined, 0.04);
  }
  // The roof's edge over the far wall, outside
  k.soft([0.6, 0.18, TRAIN_LENGTH], [-HW + 0.25, 2.5, 0], '#cbd5e1', 'satin', undefined, 0.06);
  k.box([0.1, 0.1, TRAIN_LENGTH], [-HW - 0.01, 2.4, 0], RAIL_WHITE, 'satin');
  // The end walls, high on the far side and down to the sills on the near, a sliding glass door between
  for (const s of [-1, 1]) {
    const z = s * (HALF - 0.04);
    k.box([HW - 0.5, 2.45, 0.08], [-(HW + 0.5) / 2, 1.225, z], '#e2e8f0', 'satin');
    k.box([HW - 0.5, 0.88, 0.08], [(HW + 0.5) / 2, 0.44, z], '#e2e8f0', 'satin');
    for (const x of [-0.5, 0.5]) k.box([0.06, 2.1, 0.1], [x, 1.05, z], '#94a3b8', 'metal');
    k.box([1.06, 0.06, 0.1], [0, 2.1, z], '#94a3b8', 'metal');
    g.box([0.94, 2.0, 0.02], [0, 1.0, z], '#000000', 'satin');
    // The gangway to the next coach
    k.box([1.3, 2.2, 0.5], [0, 1.1, s * (HALF + 0.3)], '#111827');
    k.box([1.2, 0.04, 0.6], [0, 0.0, s * (HALF + 0.3)], '#374151', 'metal');
  }
  // Seats, in bays facing each other over a table
  plan.bays.forEach((bz) => {
    for (const dir of [1, -1]) {
      const z = bz - dir * plan.row;
      plan.cols.forEach((x) => {
        k.push([x, 0, z], [0, dir > 0 ? 0 : Math.PI, 0]);
        seat(k, cls, plan.w, (x > plan.aisle ? -1 : 1) * dir);
        k.pop();
      });
    }
    for (const [x, w] of plan.tables) {
      const wood = cls === 'business';
      k.soft([w, 0.05, 0.5], [x, 0.74, bz], wood ? '#5b3a1e' : '#e5e7eb', 'satin', undefined, 0.02);
      k.box([w + 0.02, 0.02, 0.52], [x, 0.71, bz], wood ? '#d4af37' : '#64748b', wood ? 'metal' : 'satin');
      k.cyl(0.04, 0.04, 0.7, [x, 0.36, bz], '#94a3b8', 'metal', undefined, 8);
      if (wood && x < 0) {
        k.cyl(0.03, 0.06, 0.18, [x - 0.15, 0.86, bz], '#d4af37', 'metal', undefined, 10);
        k.cyl(0.07, 0.1, 0.12, [x - 0.15, 1.0, bz], '#fff7e0', 'glow', undefined, 12);
      }
    }
  });
  // A bottle of water and a newspaper on some tables
  plan.bays.forEach((bz, i) => {
    if (i % 2) k.cyl(0.035, 0.035, 0.2, [plan.tables[1][0] + 0.2, 0.86, bz + 0.1], '#bae6fd', 'satin', undefined, 8);
    if (i % 3 === 1) k.box([0.3, 0.015, 0.22], [plan.tables[0][0], 0.775, bz - 0.05], '#f5f5f4', 'matte', [0, 0.4, 0]);
  });
  return { kit: k.build(), glass: g.build() };
}

/** The cars either side of yours, and the diesel at the head: outside only, in the railway's colours. */
function neighbours(low: boolean): Built {
  const k = new Kit(low);
  const s = 1.13;
  const len = TRAIN_LENGTH / s;
  const opts = { w: (HW * 2) / s, gauge: 0.75 / s };
  const gap = 0.6;
  for (const z of [-(TRAIN_LENGTH + gap), TRAIN_LENGTH + gap]) {
    k.push([0, RAIL_Y, z], [0, 0, 0], [s, s, s]);
    coachExterior(k, len, opts);
    k.pop();
  }
  const locoLen = 9;
  k.push([0, RAIL_Y, TRAIN_LENGTH * 1.5 + gap * 2 + (locoLen * s) / 2], [0, 0, 0], [s, s, s]);
  loco(k, locoLen, opts);
  k.pop();
  return k.build();
}

/** A station's platform beside the line: paving on the near side, a canopy and the hall across on the far side. */
function platform(low: boolean): Built {
  const k = new Kit(low);
  const L = 70;
  k.box([5, RAIL_Y * -1 - 0.02, L], [HW + 0.4 + 2.5, RAIL_Y / 2 - 0.01, 0], '#d6d3d1');
  k.box([0.25, 0.012, L], [HW + 0.75, -0.02, 0], '#facc15');
  k.box([0.12, 0.012, L], [HW + 0.47, -0.02, 0], RAIL_WHITE);
  for (let z = -L / 2 + 6; z < L / 2; z += 12) {
    k.box([0.1, 2.4, 0.1], [HW + 3.4, 1.2, z], '#64748b', 'metal');
    k.box([0.5, 0.07, 1.4], [HW + 3.0, 0.5, z + 3], '#92400e', 'satin');
    k.box([0.18, 0.08, 0.18], [HW + 3.4, 2.42, z], '#fef9c3', 'glow');
  }
  // Across the line: another platform, under a long canopy with a green fascia, and the hall behind it
  k.box([4, -RAIL_Y - 0.02, L], [-HW - 0.5 - 2, RAIL_Y / 2 - 0.01, 0], '#cfcac4');
  k.box([5, 0.12, L - 4], [-HW - 3.2, 4.2, 0], '#e5e7eb', 'satin');
  k.box([0.12, 0.4, L - 4], [-HW - 0.75, 4.1, 0], RAIL_GREEN, 'satin');
  for (let z = -L / 2 + 4; z < L / 2 - 2; z += 8) k.box([0.16, 4.2, 0.16], [-HW - 4.8, 2.1, z], '#94a3b8', 'metal');
  k.box([1.2, 5.4, L], [-HW - 6.5, 2.0, 0], '#f5f5f4', 'satin');
  k.box([1.25, 0.6, L], [-HW - 6.5, 4.4, 0], RAIL_GREEN, 'satin');
  for (let z = -L / 2 + 3; z < L / 2; z += 3) k.box([0.04, 1.4, 2.2], [-HW - 5.88, 1.6, z], '#7dd3fc', 'satin');
  return k.build();
}

/* ---------- The run ---------- */

const smooth = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Top speed, in land units a second: a coach length every two thirds of a second. */
const V_MAX = 24;

/** The ride in real seconds: how long it is, how long the train takes to get up to speed, and to brake to a stop. */
function ride() {
  const t = useGame.getState().task;
  const T = t && t.total > 0 ? taskDurationSeconds(t.total, t.total, t.fast) : 30;
  return { T, up: clamp(T * 0.14, 3, 7), down: clamp(T * 0.16, 4, 8) };
}
/** Speed `t` seconds into a ride: picking up, running, braking to a stop at the other end. */
function speedAt(t: number, r = ride()) {
  if (t <= 0 || t >= r.T) return 0;
  return V_MAX * Math.min(smooth(t / r.up), 1 - smooth((t - (r.T - r.down)) / r.down));
}
/** How far the train has come `t` seconds in: the speed, added up. */
function distance(t: number, r = ride()) {
  const n = 40;
  const to = clamp(t, 0, r.T);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += speedAt(((i + 0.5) / n) * to, r);
  return (sum / n) * to;
}

const ticked = () => {
  const t = useGame.getState().task;
  return t && t.total > 0 ? 1 - t.remaining / t.total : 0;
};
/**
 * The game ticks ten times a second, so the progress it gives moves in steps: run it on between ticks at the pace the
 * ticks set (as three/FlightCabin.tsx does for a flight), worked out once a frame so the land and the platforms agree.
 */
const glide = { frame: -1, p: 0, tickP: -1, tickAt: 0, rate: 0 };
function progress(now: number) {
  if (now === glide.frame) return glide.p;
  const p = ticked();
  if (p < glide.tickP || now < glide.frame) {
    glide.tickP = -1;
    glide.rate = 0;
  }
  const fresh = glide.tickP < 0;
  if (p !== glide.tickP) {
    const dt = now - glide.tickAt;
    glide.rate = !fresh && dt > 0 ? (p - glide.tickP) / dt : 1 / ride().T;
    glide.tickP = p;
    glide.tickAt = now;
  }
  glide.frame = now;
  const next = Math.min(1, p + glide.rate * Math.min(now - glide.tickAt, 0.15));
  glide.p = fresh ? next : Math.max(glide.p, next);
  return glide.p;
}

/** Who else is on board: most seats taken, a few with a laptop or a phone call. */
function usePassengers(cls: RailClass, low: boolean) {
  return useMemo(() => {
    const plan = PLAN[cls];
    const me = TRAIN_SEAT[cls];
    const clips: Clip[] = ['sit', 'sit', 'sit', 'talk', 'type'];
    return plan.bays.flatMap((bz) => [1, -1].flatMap((dir) => plan.cols.map((x) => ({ x, z: bz - dir * plan.row, yaw: dir > 0 ? 0 : Math.PI }))))
      .filter((s) => !(Math.abs(s.x - me.x) < 0.01 && Math.abs(s.z - me.z) < 0.01) && Math.random() < (low ? 0.2 : 0.42))
      .map((s) => ({ ...s, look: encodeLook(randomAppearance()), clip: clips[Math.floor(Math.random() * clips.length)] }));
  }, [cls, low]);
}

const GLASS = new MeshStandardMaterial({ color: '#b6e3ff', transparent: true, opacity: 0.18, roughness: 0.08, metalness: 0.1, depthWrite: false });

export function TrainRide() {
  const low = useLowPerf();
  const cls = useMemo(rideClass, []);
  const myLook = useGame((s) => s.look);
  const { from, to } = useMemo(() => {
    const s = useGame.getState();
    const dest = s.task ? findAction(s.task.itemId, s.task.actionId, s.items, s.task.placeId)?.destination : undefined;
    const name = (city: string | undefined) => (city ? regionPlace(city, 'station')?.name.replace(/ (Train|Railway) Station$/, '').toUpperCase() : null) ?? 'STATION';
    return { from: name(s.destinationId), to: name(dest) };
  }, []);
  const { kit, glass } = useMemo(() => interior(cls, low), [cls, low]);
  const others = useMemo(() => neighbours(low), [low]);
  const stations = useMemo(() => platform(low), [low]);
  const passengers = usePassengers(cls, low);
  const coach = useRef<Group>(null!);
  const leaving = useRef<Group>(null!);
  const arriving = useRef<Group>(null!);
  const motion = useRef<FlightMotion>({ travel: 0, alt: 0, progress: 0 });
  const seatAt = TRAIN_SEAT[cls];
  const plan = PLAN[cls];

  useFrame(({ clock }) => {
    const p = progress(clock.elapsedTime);
    const r = ride();
    const t = p * r.T;
    const d = distance(t, r);
    const total = distance(r.T, r);
    const v = speedAt(t, r);
    const vk = v / V_MAX;
    motion.current.travel = d;
    motion.current.progress = p;
    // The station you left slides away behind; the one you are going to comes up and stops beside you.
    leaving.current.position.z = -d;
    leaving.current.visible = d < 110;
    arriving.current.position.z = total - d;
    arriving.current.visible = total - d < 110;
    // The coach sways on the rails and knocks over the joints in them, more the faster it goes; it leans back as it
    // picks up speed and forward as it brakes.
    const T = clock.elapsedTime;
    const joint = (d % 13) < 0.35 || ((d + 9.6) % 13) < 0.35 ? -0.012 * vk : 0;
    const accel = (speedAt(t + 0.1, r) - speedAt(t - 0.1, r)) / 0.2;
    coach.current.rotation.z = (Math.sin(T * 1.7) * 0.006 + Math.sin(T * 4.3) * 0.0025) * vk;
    coach.current.rotation.x = clamp(accel * 0.0012, -0.01, 0.01);
    coach.current.position.x = Math.sin(T * 0.9) * 0.02 * vk;
    coach.current.position.y = joint + Math.sin(T * 23) * 0.002 * vk;
  });

  return (
    <>
      {/* The land, from the ground, the railway laid down its middle (FlightTerrain rail) */}
      <group position-y={RAIL_Y - RAIL_TOP}>
        <FlightTerrain motion={motion} rail />
      </group>
      <group ref={leaving}>
        <KitMeshes kit={stations} />
        <Label p={[HW + 3.4, 2.0, 0]} w={2.6} h={0.5} text={from} bg="#14532d" ry={Math.PI / 2} />
      </group>
      <group ref={arriving}>
        <KitMeshes kit={stations} />
        <Label p={[HW + 3.4, 2.0, 0]} w={2.6} h={0.5} text={to} bg="#14532d" ry={Math.PI / 2} />
      </group>
      <group ref={coach}>
        <KitMeshes kit={kit} />
        {glass.satin && <mesh geometry={glass.satin} material={GLASS} />}
        <KitMeshes kit={others} />
        {/* Everyone else stays in their seat the whole way: baked into a few meshes (cabinKit Baked), no shadows. */}
        <Baked key={`${cls}:${low}`} shadows={false}>
          {passengers.map((o) => <Seated key={`${o.x}:${o.z}`} x={o.x} z={o.z} yaw={o.yaw} look={o.look} clip={o.clip} />)}
        </Baked>
        <Seated x={seatAt.x} z={seatAt.z} look={myLook} me />
        <group position-x={plan.aisle}>
          <Attendant length={TRAIN_LENGTH - 2} />
        </group>
        {/* The display over the back door: where this train is going */}
        <Label p={[-0.95, 2.15, -HALF + 0.03]} w={1.0} h={0.22} text={`→ ${to}`} fg="#fbbf24" bg="#0f172a" glow={0.8} />
        <pointLight position={[0, 2.3, HALF / 2]} color="#ffe8c2" intensity={4} distance={10} decay={1.4} />
        <pointLight position={[0, 2.3, -HALF / 2]} color="#ffe8c2" intensity={4} distance={10} decay={1.4} />
      </group>
    </>
  );
}
