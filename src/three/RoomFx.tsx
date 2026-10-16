// Life inside a house or a place: steam off the pot, the generator's exhaust, the shower's spray, the TV's light on the
// floor, Zs over the bed, sparkles when you clean, dust turning in the sun by the windows.
//
// Cost: every kind of particle (steam, cold mist, smoke, spray, sparkle, Zs, dust) is ONE Points draw with one ShaderMaterial,
// moved entirely on the GPU from a clock like the rain (three/Weather.tsx). The CPU only eases each emitter's strength
// (a dozen floats into a uniform array) every frame; the particles are rebuilt only when the set of emitters changes
// (a task starts or ends, the gen kicks in). A kind with nothing alive is hidden, so it costs no draw at all. Light
// thrown on things (the burner under a pot, the TV on the floor, the open fridge, the sun through a window) is one
// more instanced mesh of additive glow decals. Low mode keeps only steam, exhaust, spray and Zs, with fewer puffs.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, NormalBlending, Object3D,
  PlaneGeometry, ShaderMaterial, Vector3, type PerspectiveCamera, type Points,
} from 'three';
import type { HouseLayout, PlacedItem } from '../game/grid';
import { itemTransform } from '../game/grid';
import { edgeHasWindow } from '../game/mount';
import { hourOf, useGame } from '../game/store';
import { avatar } from '../game/avatar';
import { sky } from '../game/weather';
import { useLowPerf } from '../game/quality';
import { nightNow } from './HouseLights';

type V3 = [number, number, number];
type Kind = 'steam' | 'mist' | 'smoke' | 'spray' | 'sparkle' | 'zzz' | 'mote';
const KINDS: Kind[] = ['steam', 'mist', 'smoke', 'spray', 'sparkle', 'zzz', 'mote'];
/** Kinds low mode still draws (with half the particles). */
const CORE: Partial<Record<Kind, true>> = { steam: true, smoke: true, spray: true, zzz: true };
/** Emitters one kind can hold at once (the size of its uniform arrays). */
const MAX = 12;

/** One stream of particles, in the item's own space (centred on its footprint, front +z). */
interface Puff {
  kind: Kind;
  at: V3;
  /** Starting speed (m/s) and the start disc's radius. */
  vel?: V3;
  spread?: number;
  /** Height of the start box (dust fills a volume). */
  spreadY?: number;
  /** Outward speed from the middle: a shower head's cone. */
  cone?: number;
  /** m/s², negative falls. */
  gravity?: number;
  life?: number;
  /** Across at birth (m), and how many times that it grows to by the end. */
  size?: number;
  grow?: number;
  /** Sideways wander (m) by the end of its life. */
  curl?: number;
  n?: number;
  k?: number;
  /** Starts at the player instead of the item: 'avatar' at the feet (or seat), 'sleeper' over the head. */
  follow?: 'avatar' | 'sleeper';
}

/** A soft decal of light: flat on the floor or on the item's top, or upright facing the item's front. */
interface Glow {
  at: V3;
  w: number;
  h: number;
  upright?: boolean;
  /** `at[1]` is ignored: it lies on the floor (for wall and table-top pieces). */
  floor?: boolean;
  colour: string;
  k?: number;
  flicker?: 'tv' | 'fire' | 'sun';
}

interface Fx {
  puffs?: Puff[];
  glows?: Glow[];
}

// ── What each piece does ─────────────────────────────────────────────────────────────────────────

const WARM = '#ff8a3d';
const COLD = '#dff3ff';

const steam = (at: V3, o: Partial<Puff> = {}): Puff => ({ kind: 'steam', at, ...o });
/** Cold air: paler and bluer than steam, and it sinks. */
const mist = (at: V3, o: Partial<Puff> = {}): Puff => ({ kind: 'mist', at, ...o });
const burner = (at: V3, w = 0.5): Glow => ({ at, w, h: w, colour: WARM, flicker: 'fire', k: 0.9 });
const kettleSteam = (at: V3): Puff => steam(at, { spread: 0.02, size: 0.12, grow: 3, vel: [0, 0.3, 0], n: 10, life: 1.8 });
/** Cold air spilling out of an open fridge, and its light on the floor and on its front. */
const fridge = (w: number, h: number, front: number): Fx => ({
  puffs: [mist([0, 0.3, front + 0.04], { vel: [0, -0.02, 0.28], spread: w * 0.3, n: 12 })],
  glows: [
    { at: [0, 0, front + 0.5], w: w * 1.7, h: 1.2, floor: true, colour: COLD, k: 0.55 },
    { at: [0, h * 0.55, front + 0.03], w: w * 1.15, h: h * 0.95, upright: true, colour: COLD, k: 0.35 },
  ],
});
/** The AC breathing out cold air: a few mist streams along its vent, blowing forward and down. */
const acMist = (xs: number[], y: number, z: number, down = 0.15): Fx => ({
  puffs: xs.map((x) => mist([x, y, z], { vel: [0, -down, 0.45], spread: 0.18, n: 11 })),
});
/** The screen's light on the room: a flickering pool on the floor in front, and a haze off the glass. */
const screen = (floorZ: number, w: number, haze: V3, hw: number, hh: number): Fx => ({
  glows: [
    { at: [0, 0, floorZ], w, h: w * 0.85, floor: true, colour: '#7fb2ff', flicker: 'tv', k: 1 },
    { at: haze, w: hw, h: hh, upright: true, colour: '#7fb2ff', flicker: 'tv', k: 0.4 },
  ],
});
/** Water poured over you from a bowl, bucket bath style: it falls from over your head and splashes at your feet. */
const pour = (hot = false): Fx => ({
  puffs: [
    { kind: 'spray', at: [0.05, 1.85, 0], vel: [0, -0.4, 0], spread: 0.05, cone: 0.28, gravity: -7, life: 0.62, n: 40, follow: 'avatar' },
    { kind: 'spray', at: [0, 0.05, 0], vel: [0, 0.9, 0], spread: 0.22, cone: 0.5, gravity: -7, life: 0.26, size: 0.04, n: 16, follow: 'avatar' },
    ...(hot ? [steam([0, 0.7, 0], { spread: 0.3, spreadY: 0.4, vel: [0, 0.22, 0], size: 0.35, grow: 2.4, n: 12, k: 0.6, follow: 'avatar' })] : []),
  ],
});
/** A shower head raining down, the splash where it lands, and mist (thick steam on a hot one). */
const shower = (hot: boolean): Fx => ({
  puffs: [
    // The avatar stands in the middle of the cubicle; the head is over to one side, so the spray angles in.
    { kind: 'spray', at: [0.3, 1.83, -0.22], vel: [-0.18, -0.55, 0.12], spread: 0.06, cone: 0.3, gravity: -7, life: 0.64, n: 90 },
    { kind: 'spray', at: [0.12, 0.08, -0.06], vel: [0, 0.9, 0], spread: 0.22, cone: 0.55, gravity: -7, life: 0.26, size: 0.04, n: 18 },
    hot
      ? steam([0.05, 1.45, -0.05], { spread: 0.2, spreadY: 0.3, vel: [0, 0.34, 0], size: 0.18, grow: 3.4, n: 28, k: 1, curl: 0.25 })
      : steam([0.1, 0.4, -0.1], { spread: 0.25, spreadY: 0.2, vel: [0, 0.16, 0], size: 0.35, grow: 2, n: 8, k: 0.35 }),
  ],
});
/** Bubbles breaking on a tub's water and steam off it. */
const tub = (y: number, r: number, bubbles: boolean, steamK: number): Fx => ({
  puffs: [
    ...(bubbles ? [{ kind: 'spray' as const, at: [0, y, 0] as V3, vel: [0, 0.32, 0] as V3, spread: r, gravity: -1.6, life: 0.4, size: 0.05, n: 30 }] : []),
    steam([0, y + 0.05, 0], { spread: r, vel: [0, 0.2, 0], size: 0.45, grow: 2.2, n: 12, k: steamK }),
  ],
});
const sparkles = (at: V3, spread: number, n = 10, follow?: Puff['follow']): Puff => ({ kind: 'sparkle', at, spread, spreadY: spread * 0.6, n, follow });

/** Effects that run while you use the piece (any of its activities). */
const IN_USE: Record<string, Fx> = {
  // Cooking: steam off the pot and the burner glowing under it.
  cooker: { puffs: [steam([0.2, 1.09, 0.15])], glows: [burner([0.2, 0.93, 0.15])] },
  gas_cooker: { puffs: [steam([-0.45, 0.95, 0.2]), steam([0.45, 0.95, -0.18], { n: 10, k: 0.7 })], glows: [burner([-0.45, 0.9, 0.2], 0.55), burner([0.45, 0.9, -0.18], 0.55)] },
  chef_island: { puffs: [steam([-0.42, 1.12, 0.12])], glows: [burner([-0.42, 0.975, 0.12])] },
  kerosene_stove: { puffs: [steam([0, 0.66, 0])], glows: [burner([0, 0.445, 0], 0.55)] },
  suya_grill: {
    puffs: [steam([0, 0.9, 0], { spread: 0.2, size: 0.2, grow: 3.4, n: 24, k: 0.8, curl: 0.35, vel: [0, 0.38, 0] })],
    glows: [{ at: [0, 0.83, 0], w: 0.9, h: 0.65, colour: WARM, flicker: 'fire', k: 1 }],
  },
  kettle: { puffs: [kettleSteam([-0.13, 0.9, 0])] },
  coffee_machine: { puffs: [kettleSteam([0, 0.95, 0.16])] },
  microwave: { puffs: [kettleSteam([0, 0.42, -0.12])], glows: [{ at: [-0.1, 0.2, 0.31], w: 0.5, h: 0.36, upright: true, colour: '#ffb347', k: 0.45 }] },
  rice_cooker: { puffs: [steam([0, 1.11, 0], { spread: 0.03, n: 12 })] },
  electric_oven: {
    puffs: [kettleSteam([0, 1.62, 0.1])],
    glows: [{ at: [0, 0.56, 0.38], w: 0.75, h: 0.5, upright: true, colour: WARM, flicker: 'fire', k: 0.55 }],
  },
  air_fryer: { puffs: [kettleSteam([0, 1.16, -0.06])] },
  popcorn_machine: { puffs: [kettleSteam([0, 1.48, 0])] },
  freezer: { puffs: [mist([0, 0.95, 0.15], { vel: [0, -0.04, 0.22], spread: 0.45, n: 12 })] },
  fire_pit: {
    puffs: [{ kind: 'smoke', at: [0, 0.55, 0], vel: [0, 0.5, 0], spread: 0.06, size: 0.18, grow: 3.6, life: 2.6, curl: 0.25, n: 14, k: 0.4 }],
    glows: [{ at: [0, 0.05, 0], w: 1.6, h: 1.6, colour: WARM, flicker: 'fire', k: 0.8 }],
  },
  // Cold: the fridge door open, the AC and cooler blowing.
  fridge: fridge(0.8, 1.62, 0.37),
  smart_fridge: fridge(1.6, 1.9, 0.39),
  mini_fridge: fridge(0.6, 0.8, 0.29),
  aircon: acMist([-0.45, 0.45], 1.86, -0.08),
  split_ac: acMist([-0.25, 0.25], -0.13, -0.16, 0.2),
  standing_ac: acMist([0], 1.58, 0.25, 0.08),
  air_cooler: acMist([-0.1, 0.1], 0.66, 0.23, 0),
  room_heater: { glows: [{ at: [0, 0.5, 0.1], w: 0.6, h: 0.8, upright: true, colour: WARM, flicker: 'fire', k: 0.6 }, { at: [0, 0, 0.7], w: 1.3, h: 1.1, floor: true, colour: WARM, flicker: 'fire', k: 0.5 }] },
  // Screens.
  tv: screen(1.25, 2.4, [0, 1.09, -0.08], 1.9, 1.2),
  wall_tv: screen(1.0, 2.3, [0, 0, -0.3], 1.9, 1.2),
  small_tv: screen(0.9, 1.4, [0, 0.345, 0.06], 0.95, 0.6),
  home_cinema: screen(1.7, 3.6, [0, 1.35, -0.2], 3.1, 1.9),
  // Water.
  shower: shower(false),
  hot_shower: shower(true),
  bucket: pour(),
  water_drum: pour(),
  well: pour(),
  water_heater: pour(true),
  sink: {
    puffs: [
      { kind: 'spray', at: [0, 1.05, -0.16], vel: [0, -0.2, 0.03], spread: 0.008, cone: 0.02, gravity: -6, life: 0.17, size: 0.03, n: 24 },
      { kind: 'spray', at: [0, 0.88, -0.11], vel: [0, 0.5, 0], spread: 0.04, cone: 0.35, gravity: -6, life: 0.17, size: 0.025, n: 8 },
    ],
  },
  bathtub: tub(0.62, 0.55, false, 0.3),
  corner_jacuzzi: tub(0.66, 0.65, true, 0.6),
  jacuzzi: tub(0.67, 0.7, true, 0.6),
  sauna: { puffs: [steam([0, 2.02, 0], { spread: 0.7, vel: [0, 0.22, 0], size: 0.45, grow: 2.4, n: 14, k: 0.7 })] },
  swimming_pool: { puffs: [{ kind: 'spray', at: [0, 0.12, 0], vel: [0, 1.1, 0], spread: 0.3, cone: 0.6, gravity: -6, life: 0.38, size: 0.05, n: 24, follow: 'avatar' }] },
  // Cleaning and grooming.
  washing_machine: { puffs: [sparkles([0, 0.45, 0.42], 0.22, 10)] },
  ironing_board: { puffs: [kettleSteam([-0.3, 0.9, 0]), sparkles([0.3, 0.98, 0], 0.25, 8)] },
  dressing_table: { puffs: [sparkles([0, 1.5, 0], 0.3, 10, 'avatar')] },
  gilded_mirror: { puffs: [sparkles([0, 1.5, 0], 0.3, 10, 'avatar')] },
  baby_bath: { puffs: [sparkles([-0.17, 1.02, 0], 0.2, 8), { kind: 'spray', at: [-0.17, 0.96, 0], vel: [0, 0.6, 0], spread: 0.12, cone: 0.3, gravity: -6, life: 0.25, size: 0.03, n: 10 }] },
  baby_cot: { puffs: [{ kind: 'zzz', at: [0, 1.0, 0], n: 3 }] },
};

/** A running generator: exhaust out of its pipe. */
const EXHAUST: Record<string, Puff> = {
  generator: { kind: 'smoke', at: [0.17, 0.3, -0.25], vel: [0.3, 0.42, 0] },
  generator_3kva: { kind: 'smoke', at: [0.18, 0.44, -0.28], vel: [0.3, 0.42, 0] },
  generator_10kva: { kind: 'smoke', at: [-0.52, 1.58, -0.13], vel: [0, 0.55, 0], size: 0.16, n: 22 },
  generator_silent: { kind: 'smoke', at: [-0.95, 1.98, -0.35], vel: [0, 0.5, 0], size: 0.16, k: 0.55 },
};

/** Always on in a place: the buka's pots, the tea seller's kettle, the corn roasting. */
const AMBIENT: Record<string, Fx> = {
  pot_counter: { puffs: [-0.6, 0, 0.6].map((x) => steam([x, 1.16, 0], { spread: 0.12, n: 10, k: 0.6 })) },
  kettle_table: { puffs: [kettleSteam([-0.2, 1.0, 0])] },
  corn_roaster: { puffs: [steam([0, 0.6, 0], { spread: 0.2, size: 0.25, grow: 3, n: 14, k: 0.55, vel: [0, 0.4, 0] })] },
  food_stall: { puffs: [steam([0, 1.0, 0], { spread: 0.12, n: 10, k: 0.6 })] },
};

const SLEEP = new Set(['sleep', 'nap', 'recline_nap', 'room_sleep', 'room_nap', 'cell_sleep', 'camp_sleep']);
const ZZZ: Puff = { kind: 'zzz', at: [0, 0, 0], follow: 'sleeper', n: 4 };

/** Settings per kind, and the defaults an emitter leaves out. */
const KIND: Record<Kind, {
  /** Colour, and the colour a puff's thin edge falls to (white steam needs a cool grey rim to show on a cream wall). */
  colour: string; shade?: string; opacity: number; additive?: boolean; shape: 'puff' | 'drop' | 'star' | 'tex';
  fadeIn: number; fadeOut: number;
  def: Required<Pick<Puff, 'vel' | 'spread' | 'gravity' | 'life' | 'size' | 'grow' | 'curl' | 'n' | 'k'>>;
}> = {
  steam: { colour: '#ffffff', shade: '#8e9db0', opacity: 0.34, shape: 'puff', fadeIn: 0.1, fadeOut: 0.35, def: { vel: [0, 0.36, 0], spread: 0.06, gravity: 0, life: 2.6, size: 0.11, grow: 3.6, curl: 0.2, n: 22, k: 1 } },
  mist: { colour: '#f4fbff', shade: '#c4d8ea', opacity: 0.4, shape: 'puff', fadeIn: 0.1, fadeOut: 0.3, def: { vel: [0, -0.05, 0.3], spread: 0.15, gravity: -0.12, life: 1.9, size: 0.16, grow: 3, curl: 0.12, n: 10, k: 0.85 } },
  smoke: { colour: '#55555a', shade: '#26262a', opacity: 0.5, shape: 'puff', fadeIn: 0.06, fadeOut: 0.35, def: { vel: [0, 0.45, 0], spread: 0.02, gravity: 0.14, life: 2.6, size: 0.12, grow: 4.5, curl: 0.2, n: 18, k: 1 } },
  spray: { colour: '#e6f4ff', opacity: 0.8, shape: 'drop', fadeIn: 0.02, fadeOut: 0.8, def: { vel: [0, -0.5, 0], spread: 0.05, gravity: -7, life: 0.6, size: 0.07, grow: 1, curl: 0, n: 30, k: 1 } },
  sparkle: { colour: '#fff4c2', opacity: 1, additive: true, shape: 'star', fadeIn: 0.1, fadeOut: 0.6, def: { vel: [0, 0.12, 0], spread: 0.25, gravity: 0, life: 1.2, size: 0.11, grow: 0.5, curl: 0.04, n: 10, k: 1 } },
  zzz: { colour: '#ffffff', opacity: 0.95, shape: 'tex', fadeIn: 0.15, fadeOut: 0.55, def: { vel: [0.07, 0.24, 0.03], spread: 0.03, gravity: 0, life: 3.2, size: 0.16, grow: 1.9, curl: 0.12, n: 4, k: 1 } },
  mote: { colour: '#ffe7b0', opacity: 0.5, additive: true, shape: 'puff', fadeIn: 0.25, fadeOut: 0.7, def: { vel: [0, -0.02, 0], spread: 0.3, gravity: 0, life: 7, size: 0.024, grow: 1, curl: 0.18, n: 18, k: 1 } },
};

// ── Sources: the pieces in view ──────────────────────────────────────────────────────────────────

/** A piece the effects can come from, placed in house (or place) space. */
export interface FxSource { id: string; type: string; x: number; y: number; z: number; yaw: number; broken?: boolean }

export const itemFxSources = (items: PlacedItem[]): FxSource[] =>
  items.map((i) => {
    const { cx, cy, cz, yaw } = itemTransform(i);
    return { id: i.id, type: i.type, x: cx, y: cy, z: cz, yaw, broken: i.broken };
  });

// ── Working out which emitters are on ────────────────────────────────────────────────────────────

/** An emitter placed in house space, ready to build. */
interface Emitter {
  key: string;
  kind: Kind;
  origin: V3;
  vel: V3;
  spread: number; spreadY: number; cone: number; gravity: number; life: number; size: number; grow: number; curl: number;
  n: number; k: number;
  follow?: Puff['follow'];
  sun?: boolean;
}
interface Decal { key: string; pos: V3; rot: V3; w: number; h: number; colour: Color; k: number; flicker?: Glow['flicker']; matrix?: Matrix4 }

function place(src: FxSource, p: V3): V3 {
  const c = Math.cos(src.yaw), s = Math.sin(src.yaw);
  return [src.x + p[0] * c + p[2] * s, src.y + p[1], src.z - p[0] * s + p[2] * c];
}
function turn(yaw: number, v: V3): V3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function emitterOf(key: string, puff: Puff, src: FxSource | null, low: boolean): Emitter {
  const d = KIND[puff.kind].def;
  const yaw = src && !puff.follow ? src.yaw : 0;
  const n = puff.n ?? d.n;
  return {
    key, kind: puff.kind,
    origin: src && !puff.follow ? place(src, puff.at) : puff.at,
    vel: turn(yaw, puff.vel ?? d.vel),
    spread: puff.spread ?? d.spread, spreadY: puff.spreadY ?? 0, cone: puff.cone ?? 0, gravity: puff.gravity ?? d.gravity,
    life: puff.life ?? d.life, size: puff.size ?? d.size, grow: puff.grow ?? d.grow, curl: puff.curl ?? d.curl,
    n: low ? Math.max(2, Math.ceil(n * 0.5)) : n, k: puff.k ?? d.k, follow: puff.follow,
  };
}

function decalOf(key: string, g: Glow, src: FxSource): Decal {
  const at = place(src, g.at);
  if (g.floor) at[1] = 0.03;
  return {
    key, pos: at, rot: g.upright ? [0, src.yaw, 0] : [-Math.PI / 2, 0, src.yaw], w: g.w, h: g.h,
    colour: new Color(g.colour), k: g.k ?? 1, flicker: g.flicker,
  };
}

interface Wanted { emitters: Emitter[]; decals: Decal[]; sig: string }

function wantedOf(sources: FxSource[], using: string | null, action: string | null, gen: string | null, ambient: boolean, low: boolean, layout: HouseLayout | undefined, pm: boolean): Wanted {
  const emitters: Emitter[] = [];
  const decals: Decal[] = [];
  const add = (fx: Fx, src: FxSource, tag: string) => {
    fx.puffs?.forEach((p, i) => {
      if (!low || CORE[p.kind]) emitters.push(emitterOf(`${src.id}:${tag}${i}`, p, src, low));
    });
    if (!low) fx.glows?.forEach((g, i) => decals.push(decalOf(`${src.id}:${tag}g${i}`, g, src)));
  };
  for (const src of sources) {
    if (src.broken) continue;
    if (src.id === using && IN_USE[src.type]) add(IN_USE[src.type], src, 'u');
    if (gen && src.type === gen && EXHAUST[src.type]) add({ puffs: [EXHAUST[src.type]] }, src, 'x');
    if (ambient && !low && AMBIENT[src.type]) add(AMBIENT[src.type], src, 'a');
  }
  if (action && SLEEP.has(action)) emitters.push(emitterOf('sleeper:z', ZZZ, null, low));

  // Sun through the windows on the sunny side (east in the morning, west after noon): a warm patch on the floor and
  // dust turning in it. Drawn by day only, faded by the sky in useFrame.
  if (layout && !low) {
    const side = pm ? 0 : layout.width;
    const into = pm ? 1 : -1;
    layout.edges
      .filter((e) => e.dir === 'v' && e.x === side && edgeHasWindow(e, layout))
      .slice(0, 6)
      .forEach((e, i) => {
        const z = e.z + 0.5;
        const x = side + into * 0.6;
        emitters.push({ ...emitterOf(`sun:${i}`, { kind: 'mote', at: [x, 0.9, z], spreadY: 0.45 }, null, low), sun: true });
        decals.push({ key: `sun:${i}`, pos: [side + into * 1.05, 0.031, z], rot: [-Math.PI / 2, 0, 0], w: 1.25, h: 0.95, colour: new Color('#ffd79a'), k: 0.38, flicker: 'sun' });
        // The shaft itself: a long soft blade of light from the window down to that patch, as wide as the window.
        const top = new Vector3(side + into * 0.1, 1.5, z), foot = new Vector3(side + into * 1.05, 0.05, z);
        const along = foot.clone().sub(top);
        const len = along.length();
        along.normalize();
        const across = new Vector3(0, 0, 1);
        const m = new Matrix4().makeBasis(across, along, new Vector3().crossVectors(across, along));
        m.scale(new Vector3(0.75, len * 1.15, 1)).setPosition(top.clone().add(foot).multiplyScalar(0.5));
        decals.push({ key: `shaft:${i}`, pos: [0, 0, 0], rot: [0, 0, 0], w: 1, h: 1, colour: new Color('#ffe2ad'), k: 0.24, flicker: 'sun', matrix: m });
      });
  }

  const r = (v: number) => Math.round(v * 100);
  const sig = [...emitters.map((e) => `${e.key}@${e.n}|${r(e.origin[0])},${r(e.origin[1])},${r(e.origin[2])}`), ...decals.map((d) => `${d.key}@${r(d.pos[0])},${r(d.pos[2])}`)].join(';');
  return { emitters, decals, sig };
}

// ── Drawing ──────────────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  #define MAX ${MAX}
  uniform float uTime;
  uniform float uScale;
  uniform float uK[MAX];
  uniform vec3 uO[MAX];
  uniform float uFadeIn;
  uniform float uFadeOut;
  attribute vec4 vel;   // starting speed, start disc radius
  attribute vec4 prm;   // gravity, life, size, curl
  attribute vec4 seed;
  attribute vec4 more;  // emitter slot, start box height, growth, cone
  varying float vA;
  varying float vAge;
  varying float vSeed;
  void main() {
    int e = int(more.x + 0.5);
    float k = uK[e];
    float life = prm.y;
    float age = fract(uTime / life + seed.x);
    float t = age * life;
    float ang = seed.y * 6.2832;
    float rad = sqrt(seed.z);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec3 p = position + uO[e] + vec3(dir.x * rad * vel.w, (seed.w - 0.5) * 2.0 * more.y, dir.y * rad * vel.w);
    // Each particle a little faster or slower than the next, and pushed out from the middle by the cone.
    vec3 v = vel.xyz * (0.8 + 0.4 * fract(seed.w * 7.31)) + vec3(dir.x, 0.0, dir.y) * rad * more.w;
    p += v * t;
    p.y += 0.5 * prm.x * t * t;
    float c = prm.w * age;
    p.x += sin(uTime * 1.3 + seed.y * 40.0 + age * 5.0) * c;
    p.z += cos(uTime * 1.1 + seed.z * 40.0 + age * 4.0) * c;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = prm.z * mix(1.0, more.z, age);
    vA = k * smoothstep(0.0, uFadeIn, age) * (1.0 - smoothstep(uFadeOut, 1.0, age));
    vAge = age;
    vSeed = seed.y;
    gl_PointSize = k > 0.003 ? min(256.0, size * uScale / max(0.2, -mv.z)) : 0.0;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform float uOpacity;
  uniform sampler2D uMap;
  varying float vA;
  varying float vAge;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r = dot(c, c);
    vec3 col = uColor;
  #if defined(SHAPE_STAR)
    float core = max(0.0, 1.0 - sqrt(r) * 2.2);
    float rays = max(0.0, 1.0 - abs(c.x) * 9.0) * max(0.0, 1.0 - abs(c.y)) + max(0.0, 1.0 - abs(c.y) * 9.0) * max(0.0, 1.0 - abs(c.x));
    float a = (core * core * 1.5 + rays) * sin(vAge * 3.1416);
  #elif defined(SHAPE_TEX)
    vec4 tx = texture2D(uMap, gl_PointCoord);
    col *= tx.rgb;
    float a = tx.a;
  #elif defined(SHAPE_DROP)
    // A falling drop is a short streak: a thin upright ellipse in the sprite (the camera always looks down at a slant).
    float q = c.x * c.x * 9.0 + c.y * c.y;
    if (q > 1.0) discard;
    float a = 1.0 - smoothstep(0.2, 1.0, q);
  #else
    if (r > 1.0) discard;
    float a = (1.0 - r) * (1.0 - r);
    // Break the disc up a little so a column of puffs reads as billowing, not as balls.
    a *= 0.75 + 0.25 * sin(c.x * 4.0 + vSeed * 30.0) * sin(c.y * 3.5 + vSeed * 17.0);
    // Lit on top, a shade underneath and round the rim: reads as a puff of something, not a flat disc.
    col = mix(uShade, uColor, clamp(1.0 - r * 0.9 - c.y * 0.35, 0.0, 1.0));
  #endif
    gl_FragColor = vec4(col, a * uOpacity * vA);
    #include <colorspace_fragment>
  }
`;

/** A white Z with a dark rim, for the sleeper. */
function zTexture() {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.font = '900 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(30,41,90,0.85)';
  g.strokeText('Z', size / 2, size / 2 + 2);
  g.fillStyle = '#ffffff';
  g.fillText('Z', size / 2, size / 2 + 2);
  return new CanvasTexture(cv);
}

/** A round fall-off of light, white so instance colours tint it (the decals). */
function glowTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(cv);
}

function materialOf(kind: Kind, map: CanvasTexture | null) {
  const spec = KIND[kind];
  const shape = { puff: 'SHAPE_PUFF', drop: 'SHAPE_DROP', star: 'SHAPE_STAR', tex: 'SHAPE_TEX' }[spec.shape];
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { [shape]: '' },
    transparent: true,
    depthWrite: false,
    blending: spec.additive ? AdditiveBlending : NormalBlending,
    uniforms: {
      uTime: { value: 0 }, uScale: { value: 600 },
      uK: { value: new Float32Array(MAX) }, uO: { value: Array.from({ length: MAX }, () => new Vector3()) },
      uFadeIn: { value: spec.fadeIn }, uFadeOut: { value: spec.fadeOut },
      uColor: { value: new Color(spec.colour) }, uShade: { value: new Color(spec.shade ?? spec.colour) }, uOpacity: { value: spec.opacity }, uMap: { value: map },
    },
  });
}

/** Lays one kind's emitters out as particles: every attribute fixed, the shader moves them. */
function buildGeometry(list: Emitter[]) {
  const total = list.reduce((a, e) => a + e.n, 0);
  const pos = new Float32Array(total * 3), vel = new Float32Array(total * 4), prm = new Float32Array(total * 4);
  const seed = new Float32Array(total * 4), more = new Float32Array(total * 4);
  let j = 0;
  list.forEach((e, slot) => {
    for (let i = 0; i < e.n; i++, j++) {
      pos.set(e.origin, j * 3);
      vel.set([e.vel[0], e.vel[1], e.vel[2], e.spread], j * 4);
      prm.set([e.gravity, e.life, e.size, e.curl], j * 4);
      // Ages spread evenly with a little jitter, so a stream never comes in clumps.
      seed.set([(i + Math.random() * 0.6) / e.n, Math.random(), Math.random(), Math.random()], j * 4);
      more.set([slot, e.spreadY, e.grow, e.cone], j * 4);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('vel', new Float32BufferAttribute(vel, 4));
  g.setAttribute('prm', new Float32BufferAttribute(prm, 4));
  g.setAttribute('seed', new Float32BufferAttribute(seed, 4));
  g.setAttribute('more', new Float32BufferAttribute(more, 4));
  return g;
}

/** An emitter or decal on screen: its strength eases to the target, so effects fade in and out. */
interface Live<T> { item: T; k: number; on: boolean }

const TV_COLOURS = ['#7fb2ff', '#c9dcff', '#8fe3ff', '#b49bff', '#ffffff', '#6f9cff'].map((c) => new Color(c));
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const o = new Object3D();
const tmp = new Color();
const tvA = new Color();
const flatGeo = new PlaneGeometry(1, 1);

/**
 * The effects for a set of pieces. `powered`: the house has light; `gen`: the generator type carrying it, if any;
 * `ambient`: a place whose stalls cook all day; `layout`: a house, for the sun through its windows.
 */
export function RoomFx({ sources, gen = null, ambient = false, layout }: { sources: FxSource[]; gen?: string | null; ambient?: boolean; layout?: HouseLayout }) {
  const low = useLowPerf();
  const using = useGame((s) => (s.task?.phase === 'doing' ? s.task.itemId : null));
  const action = useGame((s) => (s.task?.phase === 'doing' ? s.task.actionId : null));
  const pm = useGame((s) => hourOf(s.minutes) >= 12);
  const wanted = wantedOf(sources, using, action, gen, ambient, low, layout, pm);

  const zMap = useMemo(() => zTexture(), []);
  const glowMap = useMemo(() => glowTexture(), []);
  const mats = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, materialOf(k, k === 'zzz' ? zMap : null)])) as Record<Kind, ShaderMaterial>, [zMap]);
  const decalMat = useMemo(() => new MeshBasicMaterial({
    map: glowMap, transparent: true, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }), [glowMap]);
  useLayoutEffect(() => () => { zMap.dispose(); glowMap.dispose(); decalMat.dispose(); Object.values(mats).forEach((m) => m.dispose()); }, [zMap, glowMap, decalMat, mats]);

  const points = useRef<Partial<Record<Kind, Points | null>>>({});
  const decalMesh = useRef<InstancedMesh>(null);
  // What is on screen per kind, in slot order (the slot is the particle's index into uK / uO).
  const live = useRef<Record<Kind, Live<Emitter>[]>>({ steam: [], mist: [], smoke: [], spray: [], sparkle: [], zzz: [], mote: [] });
  const decals = useRef<Live<Decal>[]>([]);
  const built = useRef('');

  // Rebuild only when the set changes: anything new fades in, anything gone fades out from where it is.
  useLayoutEffect(() => {
    if (built.current === wanted.sig) return;
    built.current = wanted.sig;
    const keep = <T extends { key: string }>(old: Live<T>[], fresh: T[]): Live<T>[] => {
      const next: Live<T>[] = fresh.map((item) => {
        const was = old.find((l) => l.item.key === item.key);
        return { item, k: was?.k ?? 0, on: true };
      });
      for (const l of old) if (l.k > 0.02 && !fresh.some((f) => f.key === l.item.key)) next.push({ ...l, on: false });
      return next;
    };
    for (const kind of KINDS) {
      const list = keep(live.current[kind], wanted.emitters.filter((e) => e.kind === kind)).slice(0, MAX);
      live.current[kind] = list;
      const pts = points.current[kind];
      if (!pts) continue;
      pts.geometry.dispose();
      pts.geometry = buildGeometry(list.map((l) => l.item));
      pts.visible = list.length > 0;
    }
    decals.current = keep(decals.current, wanted.decals).slice(0, 16);
    const mesh = decalMesh.current;
    if (mesh) {
      mesh.count = decals.current.length;
      decals.current.forEach((d, i) => {
        if (d.item.matrix) mesh.setMatrixAt(i, d.item.matrix);
        else {
          o.position.set(...d.item.pos);
          o.rotation.set(...d.item.rot, 'YXZ');
          o.scale.set(d.item.w, d.item.h, 1);
          o.updateMatrix();
          mesh.setMatrixAt(i, o.matrix);
        }
        mesh.setColorAt(i, tmp.setRGB(0, 0, 0));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = decals.current.length > 0;
    }
  });
  useLayoutEffect(() => () => {
    for (const k of KINDS) points.current[k]?.geometry.dispose();
    built.current = '';
  }, []);

  useFrame(({ clock, camera, gl }, dt) => {
    const t = clock.elapsedTime;
    const step = Math.min(dt, 0.1);
    const s = useGame.getState();
    const day = (1 - nightNow(s)) * (0.25 + 0.75 * sky.sun) * (1 - sky.rain * 0.8);
    const night = 1 - Math.min(1, day * 1.5);
    const fov = (camera as PerspectiveCamera).fov ?? 50;
    const scale = gl.domElement.height / (2 * Math.tan((fov * Math.PI) / 360));
    const snap = avatar.snap;
    for (const kind of KINDS) {
      const pts = points.current[kind];
      const list = live.current[kind];
      if (!pts || !list.length) continue;
      const u = mats[kind].uniforms;
      u.uTime.value = t;
      u.uScale.value = scale;
      let any = false;
      list.forEach((l, i) => {
        const target = l.on ? l.item.k * (l.item.sun ? day : 1) : 0;
        // Quick to start, a little slower to die away.
        l.k += (target - l.k) * Math.min(1, step * (target > l.k ? 2.5 : 1.6));
        if (l.k < 0.003 && !l.on) l.k = 0;
        u.uK.value[i] = l.k;
        if (l.k > 0.003) any = true;
        const f = l.item.follow;
        // Over the head: towards the pillows, the bed's back (-z), from where the body lies.
        if (f === 'sleeper') u.uO.value[i].set(snap ? snap.x - Math.sin(snap.yaw) * 0.85 : avatar.x, snap ? snap.y + 0.45 : 1.75, snap ? snap.z - Math.cos(snap.yaw) * 0.85 : avatar.z);
        else if (f === 'avatar') u.uO.value[i].set(snap ? snap.x : avatar.x, snap ? snap.y : 0, snap ? snap.z : avatar.z);
        else u.uO.value[i].set(0, 0, 0);
      });
      pts.visible = any;
    }
    const mesh = decalMesh.current;
    if (mesh && decals.current.length) {
      let any = false;
      // The TV's picture changes every few frames: hop between a few screen colours, easing a little between them.
      const beat = Math.floor(t * 5);
      tvA.copy(TV_COLOURS[Math.floor(hash(beat) * TV_COLOURS.length)]).lerp(TV_COLOURS[Math.floor(hash(beat + 1) * TV_COLOURS.length)], t * 5 - beat);
      const tvK = (0.55 + 0.45 * hash(beat * 3.1)) * (0.35 + 0.65 * night);
      decals.current.forEach((d, i) => {
        const fl = d.item.flicker;
        const target = d.on ? d.item.k * (fl === 'sun' ? day : 1) : 0;
        d.k += (target - d.k) * Math.min(1, step * (target > d.k ? 2.5 : 1.6));
        if (d.k > 0.003) any = true;
        if (fl === 'tv') tmp.copy(tvA).multiplyScalar(d.k * tvK * 0.6);
        else if (fl === 'fire') tmp.copy(d.item.colour).multiplyScalar(d.k * 0.55 * (0.85 + Math.sin(t * 17 + i) * 0.08 + Math.sin(t * 29.3 + i * 2) * 0.07));
        else tmp.copy(d.item.colour).multiplyScalar(d.k * 0.5);
        mesh.setColorAt(i, tmp);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = any;
    }
  });

  return (
    <group name="room-fx" userData={{ dynamic: true }}>
      {KINDS.map((kind) => (
        <points
          key={kind}
          ref={(p) => { points.current[kind] = p as Points | null; }}
          material={mats[kind]}
          frustumCulled={false}
          visible={false}
          // Before the other see-through things (a shower's glass writes depth), so spray behind glass shows through it.
          renderOrder={kind === 'zzz' || kind === 'sparkle' ? 6 : -1}
          raycast={() => null}
        />
      ))}
      <instancedMesh ref={decalMesh} args={[flatGeo, decalMat, 16]} frustumCulled={false} visible={false} renderOrder={2} raycast={() => null} />
    </group>
  );
}
