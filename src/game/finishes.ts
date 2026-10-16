// House finishes: what the floors, walls and ceilings of each room are done in, the night-time mood,
// and the lights you can buy. Pure data and rules only (no three.js, no DOM): the worker imports it to
// clean the finishes it shows visitors. Textures are drawn in src/three/finishTextures.ts.
//
// ── Save format ──────────────────────────────────────────────────────────────────────────────────
// GameState.houseFinish is keyed like wallEdits and housePaint (houseKeyOf: the property id, or
// 'starter'). Each value is a plain JSON object, safe to snapshot into a saved layout or style pack
// and to apply back with `cleanFinish`:
//
//   {
//     floor?:   { [roomName]: FloorId },              e.g. { 'Living room': 'marble_white' }
//     wall?:    { [roomName]: WallId | ColourRef },   a wall finish id, or a paint colour (palette id or '#rrggbb')
//     face?:    { [faceKey]: WallId | ColourRef },    feature walls: one side of one wall edge, see faceKey()
//     ceiling?: { [roomName]: CeilingId },            'pop' / 'pop_gold'; missing = plain
//     mood?:    MoodId                                the house's night lighting; missing = 'warm'
//   }
//
// Room names are the layout's own (game/grid.ts HouseRoom.name), so they stay put through wall edits.
// A face wins over its room's wall finish. Missing keys mean "as built": nothing is stored for them.
//
// Each lamp's own light lives on its placed item: PlacedItem.light = { c?: tone id or ColourRef, b?: 0.15-1 }.

import { isColourRef, paintHex } from './paint';
import type { Cell, HouseLayout, HouseRoom } from './grid';

export interface HouseFinish {
  floor?: Record<string, string>;
  wall?: Record<string, string>;
  face?: Record<string, string>;
  ceiling?: Record<string, string>;
  mood?: string;
}

// ── Catalogue ────────────────────────────────────────────────────────────────────────────────────

export interface FinishDef {
  id: string;
  name: string;
  group: string;
  /** ₦ per square metre of floor or ceiling; ₦ per metre of wall (each 1 m wall face, floor to ceiling). */
  rate: number;
  /** Metres one repeat of the texture covers. */
  scale: number;
  roughness: number;
  /** Main colour: the swatch fallback, and what low mode leans on. */
  base: string;
  luxury?: boolean;
}

export const FLOORS: FinishDef[] = [
  { id: 'screed', name: 'Cement Screed', group: 'Basic', rate: 1_500, scale: 2, roughness: 0.92, base: '#9a948a' },
  { id: 'rubber', name: '"Rubber Carpet" (PVC)', group: 'Basic', rate: 2_500, scale: 1, roughness: 0.6, base: '#8a3b2f' },
  { id: 'tile_white', name: 'White Ceramic 60×60', group: 'Tiles', rate: 5_500, scale: 1.2, roughness: 0.35, base: '#ece9e2' },
  { id: 'tile_cream', name: 'Cream Ceramic 60×60', group: 'Tiles', rate: 5_500, scale: 1.2, roughness: 0.4, base: '#e2d3b4' },
  { id: 'tile_grey', name: 'Grey Porcelain 60×60', group: 'Tiles', rate: 8_000, scale: 1.2, roughness: 0.3, base: '#a8a9a6' },
  { id: 'tile_check', name: 'Black & White Check', group: 'Tiles', rate: 6_500, scale: 0.8, roughness: 0.3, base: '#7a7a7a' },
  { id: 'tile_terracotta', name: 'Terracotta Quarry', group: 'Tiles', rate: 6_000, scale: 1.2, roughness: 0.7, base: '#b8613a' },
  { id: 'tile_mosaic', name: 'Blue Pool Mosaic', group: 'Tiles', rate: 9_000, scale: 0.5, roughness: 0.3, base: '#5b9ac4' },
  { id: 'terrazzo', name: 'Terrazzo', group: 'Stone', rate: 12_000, scale: 1, roughness: 0.3, base: '#d8d2c6' },
  { id: 'concrete', name: 'Polished Concrete', group: 'Stone', rate: 9_500, scale: 3, roughness: 0.25, base: '#8f9294' },
  { id: 'marble_white', name: 'Carrara Marble', group: 'Stone', rate: 35_000, scale: 2, roughness: 0.12, base: '#eeece8', luxury: true },
  { id: 'marble_black', name: 'Nero Marquina (Black & Gold)', group: 'Stone', rate: 48_000, scale: 2, roughness: 0.1, base: '#1f1d1c', luxury: true },
  { id: 'wood_oak', name: 'Oak Planks', group: 'Wood', rate: 16_000, scale: 1.6, roughness: 0.55, base: '#b98a55' },
  { id: 'wood_walnut', name: 'Walnut Planks', group: 'Wood', rate: 19_000, scale: 1.6, roughness: 0.5, base: '#6b4430' },
  { id: 'wood_parquet', name: 'Iroko Parquet', group: 'Wood', rate: 22_000, scale: 0.8, roughness: 0.5, base: '#8f5a32' },
  { id: 'carpet_grey', name: 'Grey Wall-to-Wall Carpet', group: 'Carpet', rate: 7_000, scale: 1, roughness: 1, base: '#7d8087' },
  { id: 'carpet_wine', name: 'Wine Plush Carpet', group: 'Carpet', rate: 8_500, scale: 1, roughness: 1, base: '#6b1f2e' },
  { id: 'carpet_blue', name: 'Royal Blue Carpet', group: 'Carpet', rate: 8_500, scale: 1, roughness: 1, base: '#2b3f7a' },
];

/** Plain paint on a wall, any colour: ₦ per metre of wall. */
export const PAINT_RATE = 1_500;

export const WALLS: FinishDef[] = [
  { id: 'wp_ankara', name: 'Ankara Wallpaper', group: 'Wallpaper', rate: 4_500, scale: 0.6, roughness: 0.8, base: '#d9792b' },
  { id: 'wp_ankara_teal', name: 'Ankara Wallpaper (Teal)', group: 'Wallpaper', rate: 4_500, scale: 0.6, roughness: 0.8, base: '#1f7a7a' },
  { id: 'wp_adire', name: 'Adire Indigo Wallpaper', group: 'Wallpaper', rate: 5_000, scale: 0.6, roughness: 0.8, base: '#283a7a' },
  { id: 'wp_damask', name: 'Gold Damask', group: 'Wallpaper', rate: 5_500, scale: 0.6, roughness: 0.6, base: '#e6d6b0' },
  { id: 'wp_damask_navy', name: 'Navy Damask', group: 'Wallpaper', rate: 5_500, scale: 0.6, roughness: 0.6, base: '#2c3a5c' },
  { id: 'wp_stripes', name: 'Regency Stripes', group: 'Wallpaper', rate: 4_000, scale: 0.5, roughness: 0.8, base: '#a9c2a6' },
  { id: 'wp_geo', name: 'Geometric Wallpaper', group: 'Wallpaper', rate: 4_500, scale: 0.5, roughness: 0.8, base: '#e9e2d4' },
  { id: 'wt_white', name: 'White Wall Tiles', group: 'Tiles', rate: 6_500, scale: 0.6, roughness: 0.25, base: '#f1f2f0' },
  { id: 'wt_green', name: 'Green Glazed Tiles', group: 'Tiles', rate: 7_500, scale: 0.6, roughness: 0.25, base: '#4f8a6a' },
  { id: 'wt_marble', name: 'Marble Wall Slabs', group: 'Tiles', rate: 30_000, scale: 1.2, roughness: 0.15, base: '#ece9e3', luxury: true },
  { id: 'wood_panel', name: 'Wood Panelling', group: 'Wood', rate: 9_000, scale: 1, roughness: 0.55, base: '#8a5a34' },
  { id: 'wood_slat', name: 'Walnut Slat Wall', group: 'Wood', rate: 12_000, scale: 0.6, roughness: 0.5, base: '#5a3a26' },
  { id: 'brick', name: 'Red Brick Feature', group: 'Feature', rate: 14_000, scale: 1, roughness: 0.9, base: '#a2482f' },
  { id: 'stone', name: 'Stacked Stone Feature', group: 'Feature', rate: 18_000, scale: 1, roughness: 0.9, base: '#9a8f80' },
];

export interface CeilingDef { id: string; name: string; rate: number; note: string; trim: string; luxury?: boolean }
export const CEILINGS: CeilingDef[] = [
  { id: 'plain', name: 'Plain Ceiling', rate: 0, note: 'As built', trim: '#f4f1ea' },
  { id: 'pop', name: 'POP Ceiling', rate: 6_500, note: 'Stepped border, cove light, downlights', trim: '#f7f5f0' },
  { id: 'pop_gold', name: 'POP Ceiling, Gold Trim', rate: 9_500, note: 'Stepped border with a gold line', trim: '#f5efe0', luxury: true },
];

export const FLOOR_BY_ID: Record<string, FinishDef> = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
export const WALL_BY_ID: Record<string, FinishDef> = Object.fromEntries(WALLS.map((f) => [f.id, f]));
export const CEILING_BY_ID: Record<string, CeilingDef> = Object.fromEntries(CEILINGS.map((f) => [f.id, f]));

// ── Mood and lights ──────────────────────────────────────────────────────────────────────────────

/** A light colour a lamp can be set to. 'rgb' slowly cycles round the colour wheel. */
export const LIGHT_TONES: { id: string; name: string; hex: string }[] = [
  { id: 'warm', name: 'Warm', hex: '#ffc27a' },
  { id: 'neutral', name: 'Neutral', hex: '#fff0d8' },
  { id: 'cool', name: 'Cool', hex: '#d6e6ff' },
  { id: 'rgb', name: 'RGB', hex: '#ff4fd8' },
];
const TONE_BY_ID = Object.fromEntries(LIGHT_TONES.map((t) => [t.id, t]));

export interface LampSetting { c?: string; b?: number }
export const DEFAULT_LAMP: Required<LampSetting> = { c: 'warm', b: 0.8 };
export const lampTone = (l?: LampSetting | null) => (l?.c && (TONE_BY_ID[l.c] || isColourRef(l.c)) ? l.c : DEFAULT_LAMP.c);
export const lampLevel = (l?: LampSetting | null) => (typeof l?.b === 'number' && Number.isFinite(l.b) ? Math.max(0.15, Math.min(1, l.b)) : DEFAULT_LAMP.b);
/** The hex of a tone or colour ref ('rgb' gives its swatch colour; the renderer cycles it). */
export const toneHex = (c: string) => TONE_BY_ID[c]?.hex ?? paintHex(c) ?? TONE_BY_ID.warm.hex;
export function cleanLamp(raw: unknown): LampSetting | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const l = raw as LampSetting;
  return { c: lampTone(l), b: Math.round(lampLevel(l) * 100) / 100 };
}

export interface MoodDef {
  id: string;
  name: string;
  icon: string;
  /** Ceiling light: how much of the room's general bulb light is on, and its colour ('rgb' cycles). */
  ceiling: number;
  colour: string;
  /** Lamps you placed: brightness multiplier. */
  lamps: number;
  /** LED strips and cove lights get their own say: party mode turns them right up. */
  strips: number;
  note: string;
}
export const MOODS: MoodDef[] = [
  { id: 'warm', name: 'Warm', icon: '🕯️', ceiling: 1, colour: '#ffd9a0', lamps: 1, strips: 0.8, note: 'Soft yellow bulbs all round' },
  { id: 'bright', name: 'Bright', icon: '💡', ceiling: 1.15, colour: '#eef3ff', lamps: 1, strips: 0.6, note: 'Cool daylight tubes, everything lit' },
  { id: 'cosy', name: 'Cosy', icon: '🛋️', ceiling: 0.35, colour: '#ffb066', lamps: 1.15, strips: 0.9, note: 'Ceiling low, lamps glowing' },
  { id: 'movie', name: 'Movie Night', icon: '🎬', ceiling: 0.08, colour: '#9fb4ff', lamps: 0.45, strips: 1, note: 'Dark room, just the strips' },
  { id: 'party', name: 'Owambe', icon: '🪩', ceiling: 0.3, colour: 'rgb', lamps: 1, strips: 1.2, note: 'Colours rolling, everything on' },
  { id: 'sleep', name: 'Lights Out', icon: '🌙', ceiling: 0, colour: '#8fa3d6', lamps: 0, strips: 0.15, note: 'Only a night glow' },
];
export const MOOD_BY_ID: Record<string, MoodDef> = Object.fromEntries(MOODS.map((m) => [m.id, m]));
export const moodOf = (f?: HouseFinish | null) => MOOD_BY_ID[f?.mood ?? ''] ?? MOODS[0];

/**
 * Lights you can buy, by item type, and where on the model their light comes from (local, front faces +z).
 * glow: bulbs drawn as small glowing balls; strip: a glowing bar (length along x); pool: radius of the light on
 * the floor; wash: the light thrown up the wall behind it (sconces, strips, floor lamps by a wall).
 */
export interface LightSpec { glow: { p: [number, number, number]; r: number }[]; strip?: { p: [number, number, number]; len: number }; pool: number; wash?: number; strength: number; real: number }
export const LIGHTS: Record<string, LightSpec> = {
  table_lamp: { glow: [{ p: [0, 0.78, 0], r: 0.07 }], pool: 2.2, strength: 0.7, real: 0.9 },
  floor_lamp: { glow: [{ p: [0, 1.58, 0], r: 0.08 }], pool: 3, wash: 1.4, strength: 0.85, real: 1.2 },
  chandelier: {
    glow: [0, 1, 2, 3, 4, 5].map((i) => ({ p: [Math.cos((i / 6) * Math.PI * 2) * 0.42, 2.02, Math.sin((i / 6) * Math.PI * 2) * 0.42] as [number, number, number], r: 0.06 }))
      .concat([{ p: [0, 1.88, 0], r: 0.09 }]),
    pool: 4.4, strength: 1, real: 1.8,
  },
  chandelier_lamp: { glow: [{ p: [0, 1.42, 0], r: 0.16 }], pool: 3.2, strength: 0.9, real: 1.3 },
  pendant_light: { glow: [{ p: [0, 1.72, 0], r: 0.08 }], pool: 2.6, strength: 0.85, real: 1.1 },
  led_strip: { glow: [], strip: { p: [0, 0.05, -0.42], len: 1.9 }, pool: 1.6, wash: 2.2, strength: 0.75, real: 0.6 },
  wall_sconce: { glow: [{ p: [0, 1.7, -0.36], r: 0.07 }], pool: 1.6, wash: 1.6, strength: 0.7, real: 0.8 },
};

// ── Rooms, faces and runs ────────────────────────────────────────────────────────────────────────

/** Rooms under the roof: the ones that take finishes (not the yard or compound). */
export const interiorRooms = (layout: HouseLayout): HouseRoom[] =>
  layout.rooms.filter((r) => r.x1 <= layout.width && r.z1 <= layout.depth);

export function roomAt(layout: HouseLayout, c: Cell): HouseRoom | null {
  if (c.x < 0 || c.z < 0 || c.x >= layout.width || c.z >= layout.depth) return null;
  return interiorRooms(layout).find((r) => c.x >= r.x0 && c.x < r.x1 && c.z >= r.z0 && c.z < r.z1) ?? null;
}

export const roomArea = (r: HouseRoom) => (r.x1 - r.x0) * (r.z1 - r.z0);

/** One side of one wall edge: 'h:x:z:a' faces the cell on the low side (z-1 for h, x-1 for v), 'b' the high side. */
export interface Face { dir: 'h' | 'v'; x: number; z: number; side: 'a' | 'b' }
export const faceKey = (f: Face) => `${f.dir}:${f.x}:${f.z}:${f.side}`;
export function parseFace(k: string): Face | null {
  const m = /^([hv]):(\d{1,2}):(\d{1,2}):([ab])$/.exec(k);
  return m ? { dir: m[1] as 'h' | 'v', x: +m[2], z: +m[3], side: m[4] as 'a' | 'b' } : null;
}
/** The cell a face looks into. */
export const faceCell = (f: Face): Cell =>
  f.dir === 'h' ? { x: f.x, z: f.side === 'a' ? f.z - 1 : f.z } : { x: f.side === 'a' ? f.x - 1 : f.x, z: f.z };

/** Every wall face looking into a room, as built now (knocked-down walls have none, new ones do). */
export function roomFaces(layout: HouseLayout, room: HouseRoom): Face[] {
  const out: Face[] = [];
  const has = (k: string) => layout.edgeSet.has(k);
  for (let x = room.x0; x < room.x1; x++)
    for (let z = room.z0; z < room.z1; z++) {
      if (has(`h:${x}:${z}`)) out.push({ dir: 'h', x, z, side: 'b' });
      if (has(`h:${x}:${z + 1}`)) out.push({ dir: 'h', x, z: z + 1, side: 'a' });
      if (has(`v:${x}:${z}`)) out.push({ dir: 'v', x, z, side: 'b' });
      if (has(`v:${x + 1}:${z}`)) out.push({ dir: 'v', x: x + 1, z, side: 'a' });
    }
  return out;
}

/** Faces inside the house on wall edges: what a feature wall can go on. */
export function isInteriorFace(layout: HouseLayout, f: Face) {
  return layout.edgeSet.has(`${f.dir}:${f.x}:${f.z}`) && !!roomAt(layout, faceCell(f));
}

/** The straight stretch of wall a tapped face belongs to: neighbours in line, same side, same room, no gap. */
export function wallRun(layout: HouseLayout, f: Face): Face[] {
  if (!isInteriorFace(layout, f)) return [];
  const room = roomAt(layout, faceCell(f));
  const ok = (g: Face) => isInteriorFace(layout, g) && roomAt(layout, faceCell(g)) === room;
  const step = (g: Face, d: number): Face => (g.dir === 'h' ? { ...g, x: g.x + d } : { ...g, z: g.z + d });
  const run = [f];
  for (let g = step(f, -1); ok(g); g = step(g, -1)) run.unshift(g);
  for (let g = step(f, 1); ok(g); g = step(g, 1)) run.push(g);
  return run;
}

// ── Changes and prices ───────────────────────────────────────────────────────────────────────────

/** One purchase in the Finishes tab. `value` null takes the finish off (back to as built, free). */
export type FinishChange =
  | { part: 'floor' | 'wall' | 'ceiling'; rooms: string[]; value: string | null }
  | { part: 'face'; faces: string[]; value: string | null }
  | { part: 'mood'; value: string };

export function validValue(part: FinishChange['part'], value: string | null): boolean {
  if (value === null) return part !== 'mood';
  if (part === 'floor') return !!FLOOR_BY_ID[value];
  if (part === 'wall' || part === 'face') return !!WALL_BY_ID[value] || isColourRef(value);
  if (part === 'ceiling') return !!CEILING_BY_ID[value];
  return !!MOOD_BY_ID[value];
}

/** ₦ for a wall value per metre: a finish's rate, or paint. */
const wallRate = (v: string) => WALL_BY_ID[v]?.rate ?? PAINT_RATE;

/** What a change costs in this layout. Taking a finish off and changing the mood are free. */
export function finishCost(change: FinishChange, layout: HouseLayout): number {
  if (change.part === 'mood' || change.value === null) return 0;
  const v = change.value;
  if (change.part === 'face') return wallRate(v) * change.faces.length;
  const rooms = interiorRooms(layout).filter((r) => change.rooms.includes(r.name));
  let total = 0;
  for (const r of rooms) {
    if (change.part === 'floor') total += (FLOOR_BY_ID[v]?.rate ?? 0) * roomArea(r);
    else if (change.part === 'ceiling') total += (CEILING_BY_ID[v]?.rate ?? 0) * roomArea(r);
    else total += wallRate(v) * roomFaces(layout, r).length;
  }
  return Math.round(total / 100) * 100;
}

/** The finish with a change made. Clears empty maps so a reset house stores nothing. */
export function applyFinish(f: HouseFinish | undefined, change: FinishChange, layout?: HouseLayout): HouseFinish {
  const next: HouseFinish = { ...f };
  if (change.part === 'mood') {
    if (change.value === 'warm') delete next.mood;
    else next.mood = change.value;
    return next;
  }
  const key = change.part;
  const map = { ...next[key] };
  const ids = change.part === 'face' ? change.faces : change.rooms;
  for (const id of ids) {
    // A plain ceiling is the as-built one: stored as nothing.
    if (change.value === null || (key === 'ceiling' && change.value === 'plain')) delete map[id];
    else map[id] = change.value;
  }
  // Painting a whole room's walls takes the feature walls in it with it.
  if (change.part === 'wall' && next.face && layout) {
    const face = { ...next.face };
    for (const k of Object.keys(face)) {
      const g = parseFace(k);
      const room = g && roomAt(layout, faceCell(g));
      if (room && change.rooms.includes(room.name)) delete face[k];
    }
    next.face = face;
  }
  if (Object.keys(map).length) next[key] = map;
  else delete next[key];
  if (next.face && !Object.keys(next.face).length) delete next.face;
  return next;
}

/** A finish read from a save, a visit or a style pack, with anything unknown dropped. */
export function cleanFinish(raw: unknown): HouseFinish | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: HouseFinish = {};
  const map = (v: unknown, ok: (k: string, x: string) => boolean) => {
    if (!v || typeof v !== 'object') return undefined;
    const m: Record<string, string> = {};
    let n = 0;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x !== 'string' || k.length > 40 || !ok(k, x) || ++n > 400) continue;
      m[k] = x;
    }
    return n ? m : undefined;
  };
  const floor = map(r.floor, (_, x) => !!FLOOR_BY_ID[x]);
  const wall = map(r.wall, (_, x) => validValue('wall', x));
  const face = map(r.face, (k, x) => !!parseFace(k) && validValue('face', x));
  const ceiling = map(r.ceiling, (_, x) => !!CEILING_BY_ID[x] && x !== 'plain');
  if (floor) out.floor = floor;
  if (wall) out.wall = wall;
  if (face) out.face = face;
  if (ceiling) out.ceiling = ceiling;
  if (typeof r.mood === 'string' && MOOD_BY_ID[r.mood] && r.mood !== 'warm') out.mood = r.mood;
  return Object.keys(out).length ? out : undefined;
}

/** Every house's finishes from a save, cleaned. */
export function cleanFinishes(raw: unknown): Record<string, HouseFinish> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, HouseFinish> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = cleanFinish(v);
    if (f) out[k] = f;
  }
  return out;
}

/** The wall value a face shows: its own, else its room's, else nothing (the wall's own colour). */
export function faceValue(layout: HouseLayout, f: HouseFinish | undefined, face: Face): string | null {
  if (!f) return null;
  const own = f.face?.[faceKey(face)];
  if (own) return own;
  const room = roomAt(layout, faceCell(face));
  return (room && f.wall?.[room.name]) || null;
}
