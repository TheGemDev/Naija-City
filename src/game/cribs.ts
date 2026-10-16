// Cribs: how stylish a house is, and everything built on it (visitor ratings, the Cribs leaderboard and feed, saved
// layouts, style packs, interior designer jobs, the owambe pull). Rules only, shared by the game and the server
// (worker/cribs.ts), which works every score out from the saved house itself so nobody can claim one.

import { CATEGORIES, ITEMS, type Category } from './catalog';
import { arrivalCell, footprint, houseLayout, placementError, type HouseLayout, type HouseRoom, type PlacedItem } from './grid';
import { hexHsl, isColourRef, paintHex, type HousePaint } from './paint';
import { layoutKey } from './exterior';
import { CEILING_BY_ID, FLOOR_BY_ID, LIGHTS, WALL_BY_ID, cleanFinish, type HouseFinish } from './finishes';

/* ---------- Tiers ---------- */

export interface CribTier { id: string; name: string; min: number; icon: string; colour: string }

/** Lowest first. A house is the last tier its score reaches. */
export const CRIB_TIERS: CribTier[] = [
  { id: 'fmify', name: 'Face-me-I-face-you', min: 0, icon: '🚪', colour: '#a8a29e' },
  { id: 'selfcon', name: 'Self-con', min: 15, icon: '🛖', colour: '#d6a35c' },
  { id: 'miniflat', name: 'Mini Flat', min: 30, icon: '🏠', colour: '#60a5fa' },
  { id: 'duplex', name: 'Duplex Vibes', min: 45, icon: '🏡', colour: '#34d399' },
  { id: 'lekki', name: 'Lekki Penthouse', min: 62, icon: '🏙️', colour: '#a78bfa' },
  { id: 'maitama', name: 'Maitama Mansion', min: 78, icon: '🏰', colour: '#f472b6' },
  { id: 'banana', name: 'Banana Island', min: 90, icon: '🏝️', colour: '#fbbf24' },
];
export const CRIB_TIER_BY_ID: Record<string, CribTier> = Object.fromEntries(CRIB_TIERS.map((t) => [t.id, t]));
export const tierOf = (score: number): CribTier => [...CRIB_TIERS].reverse().find((t) => score >= t.min) ?? CRIB_TIERS[0];

/* ---------- What the score reads ---------- */

/** A placed item as the score sees it. Extra fields (wall mounts, stacking, free rotation) are carried through untouched. */
export type CribItem = Omit<Partial<PlacedItem>, 'paint'> & Pick<PlacedItem, 'type' | 'x' | 'z' | 'rot'> & { paint?: (string | null)[] | null };

export interface CribInput {
  items: CribItem[];
  /** The house's layout key or design (game/exterior.ts layoutKey); null is the starter house's bungalow. */
  design?: string | null;
  walls?: string[] | null;
  paint?: HousePaint | null;
  /** The owner's room settings (property.rooms): a room's `type` overrides what its design name says it is. */
  rooms?: Record<string, { type?: string; name?: string }> | null;
  /**
   * Finishes and lighting, whatever shape the house keeps them in (floors, wall finishes, fittings, light settings).
   * The score counts how much of it is filled in; see finishesOf.
   */
  finishes?: unknown;
  lighting?: unknown;
  /** The house's floors, walls, ceilings and mood (game/finishes.ts, save.houseFinish[house]). */
  finish?: HouseFinish | null;
}

/** One line of the breakdown. */
export interface CribPart { key: CribPartKey; label: string; icon: string; got: number; max: number; tip?: string; gain?: number }
export type CribPartKey = 'value' | 'quality' | 'variety' | 'rooms' | 'colour' | 'light' | 'finish';

export interface CribScore {
  /** 0-100, from the house alone. */
  base: number;
  parts: CribPart[];
  /** Furniture value placed in the house (catalogue prices). */
  value: number;
  items: number;
}

/* ---------- Rooms ---------- */

export type RoomRole = 'bedroom' | 'bathroom' | 'kitchen' | 'dining' | 'living' | 'study' | 'prayer';

/** Rooms nobody furnishes: passing through, or outside. */
const SKIP_ROOM = /hall|corridor|compound|side yard|yard|garage|car bay|park/i;

/** What a room is for, from the owner's setting first and its design name after. */
export function roomRoles(room: Pick<HouseRoom, 'name'>, rooms?: CribInput['rooms']): RoomRole[] {
  const set = rooms?.[room.name]?.type;
  if (set === 'parlour') return ['living'];
  if (set === 'bedroom' || set === 'kitchen' || set === 'study' || set === 'prayer') return [set];
  if (SKIP_ROOM.test(room.name)) return [];
  const n = room.name.toLowerCase();
  const out: RoomRole[] = [];
  if (/bed|suite|quarters/.test(n)) out.push('bedroom');
  if (/bath|toilet|wc/.test(n)) out.push('bathroom');
  if (/kitchen/.test(n)) out.push('kitchen');
  if (/dining/.test(n)) out.push('dining');
  if (/living|parlou?r|lounge|sitting/.test(n)) out.push('living');
  if (/study|office|library/.test(n)) out.push('study');
  if (/prayer/.test(n)) out.push('prayer');
  return out;
}

const BEDS = (type: string) => !!ITEMS[type]?.bed;
const ANY = (...types: string[]) => { const s = new Set(types); return (type: string) => s.has(type); };

/** What each kind of room needs to count as done: a list of needs, each met by any one of its items. */
export const ROOM_NEEDS: Record<RoomRole, { label: string; met: (type: string) => boolean; hint: string }[]> = {
  bedroom: [
    { label: 'a bed', met: BEDS, hint: 'bed_foam' },
    { label: 'storage', met: ANY('wardrobe', 'dressing_table', 'nightstand'), hint: 'wardrobe' },
  ],
  bathroom: [
    { label: 'a toilet', met: ANY('toilet', 'bidet_toilet', 'squat_toilet', 'gold_toilet'), hint: 'toilet' },
    { label: 'a shower or bath', met: ANY('shower', 'hot_shower', 'bathtub', 'bucket', 'corner_jacuzzi', 'jacuzzi', 'sauna'), hint: 'shower' },
  ],
  kitchen: [
    { label: 'a cooker', met: ANY('cooker', 'gas_cooker', 'kerosene_stove', 'electric_oven', 'chef_island', 'microwave', 'air_fryer', 'rice_cooker'), hint: 'cooker' },
    { label: 'a fridge', met: ANY('fridge', 'smart_fridge', 'freezer', 'mini_fridge'), hint: 'fridge' },
  ],
  dining: [{ label: 'a dining table', met: ANY('dining', 'chef_island', 'marble_bar'), hint: 'dining' }],
  living: [
    { label: 'seats', met: ANY('sofa', 'armchair', 'leather_sectional', 'recliner', 'rocking_chair', 'massage_chair', 'gold_throne', 'bean_bag', 'plastic_chair', 'leather_pouf', 'cigar_lounge'), hint: 'sofa' },
    { label: 'a TV or centre table', met: ANY('tv', 'home_cinema', 'coffee_table', 'centre_table', 'tv_cabinet', 'speaker'), hint: 'tv' },
  ],
  study: [{ label: 'a desk or books', met: ANY('desk', 'bookshelf', 'chess_table', 'globe'), hint: 'desk' }],
  prayer: [{ label: 'a prayer mat', met: ANY('prayer_mat'), hint: 'prayer_mat' }],
};

/** Items that light a room up. Finishes (light fittings) count too, see finishesOf. */
export const LIGHT_ITEMS = new Set([...Object.keys(LIGHTS), 'floor_lamp', 'chandelier_lamp', 'garden_lamp', 'security_light', 'aquarium', 'fountain']);

const inRoom = (room: HouseRoom, item: CribItem) => {
  if (!ITEMS[item.type]) return false;
  return footprint(item).some((c) => c.x >= room.x0 && c.x < room.x1 && c.z >= room.z0 && c.z < room.z1);
};

/* ---------- Finishes (another part of the game fills these in) ---------- */

/**
 * How much finishing a house has, from whatever per-house data holds it: every chosen value counts once, through
 * objects and lists up to three deep. An empty or missing value counts nothing. Returns [filled, lights] where lights
 * are the values whose key mentions a light (fittings, lamps, bulbs, mood lighting).
 */
export function finishesOf(...sources: unknown[]): { filled: number; lights: number } {
  let filled = 0;
  let lights = 0;
  const walk = (v: unknown, key: string, depth: number) => {
    if (v === null || v === undefined || v === false || v === '' || depth > 3) return;
    if (Array.isArray(v)) { v.slice(0, 60).forEach((x) => walk(x, key, depth + 1)); return; }
    if (typeof v === 'object') { Object.entries(v as Record<string, unknown>).slice(0, 60).forEach(([k, x]) => walk(x, `${key}.${k}`, depth + 1)); return; }
    filled++;
    if (/light|lamp|bulb|chandelier|led|fitting/i.test(key)) lights++;
  };
  sources.forEach((s, i) => walk(s, i === 1 ? 'lighting' : 'finish', 0));
  return { filled, lights };
}

/* ---------- Colour ---------- */

/** A colour's family: neutral (greys, whites, creams, near-black), warm (reds to yellows, pinks) or cool. Custom hexes too. */
export function colourFamily(ref: string): 'neutral' | 'warm' | 'cool' | null {
  const hex = paintHex(ref);
  if (!hex) return null;
  const [h, sat, l] = hexHsl(hex);
  // Pale beiges and creams sit with the neutrals; a pale pink is still an accent.
  if (sat < 18 || l > 90 || l < 14 || (h >= 25 && h <= 60 && l > 70)) return 'neutral';
  return h < 70 || h >= 300 ? 'warm' : 'cool';
}

/** 0-10 for how well the paint goes together, and what to change. */
export function colourHarmony(items: CribItem[], paint?: HousePaint | null): { got: number; tip?: string } {
  const used: string[] = [];
  for (const id of [paint?.inner, paint?.outer]) if (isColourRef(id)) used.push(id);
  for (const it of items) for (const id of it.paint ?? []) if (isColourRef(id)) used.push(id);
  if (!used.length) return { got: 4, tip: 'Paint your inside walls and pick a colour or two for the furniture' };
  const accents = [...new Set(used.filter((id) => colourFamily(id) !== 'neutral'))];
  const warm = accents.some((id) => colourFamily(id) === 'warm');
  const cool = accents.some((id) => colourFamily(id) === 'cool');
  let got = 10;
  let tip: string | undefined;
  if (accents.length > 2) { got -= 2 * (accents.length - 2); tip = `Too many colours: keep to two accents (you have ${accents.length})`; }
  if (warm && cool) { got -= 2; tip ??= 'Warm and cool colours are fighting: pick one side'; }
  if (!paint?.inner) { got -= 2; tip ??= 'Paint the inside walls to tie the rooms together'; }
  if (!accents.length && used.length) { got -= 1; tip ??= 'All neutral: one accent colour would lift it'; }
  return { got: Math.max(2, Math.min(10, got)), tip };
}

/* ---------- The score ---------- */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Value points run on a log scale from ₦20k of furniture (nothing) to ₦100m (full marks). */
const VALUE_LOW = 20_000;
const VALUE_HIGH = 100_000_000;
const valuePoints = (v: number) => 30 * clamp01(Math.log10(Math.max(1, v) / VALUE_LOW) / Math.log10(VALUE_HIGH / VALUE_LOW));
/** Quality: the average piece, from ₦10k (cheap) to ₦3m (luxury). */
const qualityPoints = (avg: number) => 10 * clamp01(Math.log10(Math.max(1, avg) / 10_000) / Math.log10(3_000_000 / 10_000));
const VARIETY_FULL = 8;

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** The layout a crib is scored on: its design (with extensions) and wall edits. */
export const cribLayout = (design?: string | null, walls?: string[] | null): HouseLayout => houseLayout(design, walls);

/** Works out a house's style score from what is in it. The same code runs on the server against the saved house. */
export function scoreCrib(input: CribInput): CribScore {
  const layout = cribLayout(input.design, input.walls);
  const placed = input.items.filter((i) => ITEMS[i.type] && !ITEMS[i.type].fixed && !i.stolen);
  const value = placed.reduce((sum, i) => sum + ITEMS[i.type].price, 0);
  const parts: CribPart[] = [];

  // Value and quality.
  const vp = valuePoints(value);
  const nextValue = Math.max(VALUE_LOW * 5, value * 2);
  parts.push({
    key: 'value', label: 'Furniture value', icon: '💰', got: vp, max: 30,
    ...(vp < 29.5 ? { tip: `Furnish up to ${naira(nextValue)} worth`, gain: valuePoints(nextValue) - vp } : {}),
  });
  const avg = placed.length ? value / placed.length : 0;
  const qp = qualityPoints(avg);
  parts.push({
    key: 'quality', label: 'Quality', icon: '💎', got: qp, max: 10,
    ...(qp < 9.5 ? { tip: placed.length ? 'Swap cheap pieces for better ones (luxury pieces count most)' : 'Buy some furniture', gain: Math.min(10, qp + 2) - qp } : {}),
  });

  // Variety across categories (the gate and power and security gear aside, which nobody decorates with).
  const cats = new Set<Category>(placed.map((i) => ITEMS[i.type].category).filter((c) => c !== 'power' && c !== 'security'));
  const varp = 12 * clamp01(cats.size / VARIETY_FULL);
  const missingCats = CATEGORIES.filter((c) => c.key !== 'power' && c.key !== 'security' && !cats.has(c.key));
  parts.push({
    key: 'variety', label: 'Variety', icon: '🎨', got: varp, max: 12,
    ...(cats.size < VARIETY_FULL ? { tip: `Add something from ${missingCats.slice(0, 2).map((c) => c.label.toLowerCase()).join(' or ')}`, gain: 12 / VARIETY_FULL } : {}),
  });

  // Room completeness: every room furnished for what it is.
  const scored = layout.rooms.map((room) => ({ room, roles: roomRoles(room, input.rooms) })).filter((r) => r.roles.length);
  let need = 0;
  let met = 0;
  let firstGap: { room: string; label: string } | null = null;
  for (const { room, roles } of scored) {
    const here = placed.filter((i) => inRoom(room, i)).map((i) => i.type);
    for (const role of roles) for (const n of ROOM_NEEDS[role]) {
      need++;
      if (here.some(n.met)) met++;
      else firstGap ??= { room: input.rooms?.[room.name]?.name || room.name, label: n.label };
    }
  }
  const rp = need ? 22 * (met / need) : 0;
  parts.push({
    key: 'rooms', label: 'Rooms complete', icon: '🛏️', got: rp, max: 22,
    ...(firstGap ? { tip: `Put ${firstGap.label} in ${firstGap.room}`, gain: 22 / Math.max(1, need) } : {}),
  });

  // Colour harmony.
  const colour = colourHarmony(placed, input.paint);
  parts.push({ key: 'colour', label: 'Colour harmony', icon: '🖌️', got: colour.got * 0.8, max: 8, ...(colour.tip ? { tip: colour.tip, gain: (10 - colour.got) * 0.8 } : {}) });

  // Lighting: rooms with a light in them, plus light fittings from the house's finishes.
  const fin = finishesOf(input.finishes, input.lighting);
  const litRooms = scored.filter(({ room }) => placed.some((i) => LIGHT_ITEMS.has(i.type) && inRoom(room, i))).length;
  const lightShare = scored.length ? clamp01((litRooms + fin.lights) / scored.length) : 0;
  const lp = 10 * lightShare;
  const unlit = scored.find(({ room }) => !placed.some((i) => LIGHT_ITEMS.has(i.type) && inRoom(room, i)));
  parts.push({
    key: 'light', label: 'Lighting', icon: '💡', got: lp, max: 10,
    ...(lightShare < 1 ? { tip: unlit ? `Add lighting to ${input.rooms?.[unlit.room.name]?.name || unlit.room.name}` : 'Add lighting', gain: Math.min(10 - lp, (10 / Math.max(1, scored.length)) * 2) } : {}),
  });

  // Finishing touches: decor pieces, and the house's own finishes: floors and walls done room by room, a POP
  // ceiling, and luxury stone or wallpaper (game/finishes.ts). Other finishing data the house keeps counts too.
  const decor = placed.filter((i) => ITEMS[i.type].category === 'decor' || ['plant', 'gilded_mirror', 'ming_vase', 'bronze_head', 'lion_statue', 'wall_clock', 'ankara_rug', 'rug', 'velvet_rug'].includes(i.type)).length;
  const finish = cleanFinish(input.finish ?? undefined);
  const named = scored.map(({ room }) => room.name);
  const floored = named.filter((n) => FLOOR_BY_ID[finish?.floor?.[n] ?? '']).length;
  const walled = named.filter((n) => finish?.wall?.[n]).length;
  const ceilinged = named.some((n) => (CEILING_BY_ID[finish?.ceiling?.[n] ?? '']?.rate ?? 0) > 0);
  const luxe = named.some((n) => FLOOR_BY_ID[finish?.floor?.[n] ?? '']?.luxury || WALL_BY_ID[finish?.wall?.[n] ?? '']?.luxury || CEILING_BY_ID[finish?.ceiling?.[n] ?? '']?.luxury);
  const coverage = named.length ? (floored + walled * 0.5) / (named.length * 1.5) : 0;
  const finishPts = Math.min(4, coverage * 3 + (ceilinged ? 0.5 : 0) + (luxe ? 0.5 : 0) + Math.min(1, (fin.filled - fin.lights) * 0.25));
  const fp = Math.min(8, Math.min(4, decor) + finishPts);
  const bare = scored.find(({ room }) => !FLOOR_BY_ID[finish?.floor?.[room.name] ?? '']);
  parts.push({
    key: 'finish', label: 'Finishing touches', icon: '🪴', got: fp, max: 8,
    ...(fp < 8 ? {
      tip: decor < 4 ? 'Add rugs, plants or art' : bare ? `Lay a floor finish in ${input.rooms?.[bare.room.name]?.name || bare.room.name}` : !ceilinged ? 'Put up a POP ceiling' : 'Finish the walls',
      gain: Math.min(8 - fp, 2),
    } : {}),
  });

  for (const p of parts) {
    p.got = Math.round(p.got * 10) / 10;
    if (p.gain !== undefined) p.gain = Math.max(1, Math.round(p.gain));
  }
  const base = Math.max(0, Math.min(100, Math.round(parts.reduce((s, p) => s + p.got, 0))));
  return { base, parts, value, items: placed.length };
}

/** Biggest wins first, for the "how to improve" list. */
export const cribTips = (score: CribScore, n = 4) =>
  score.parts.filter((p) => p.tip && p.gain).sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0)).slice(0, n);

/* ---------- Visitor ratings ---------- */

export const RATING = {
  /** Ratings count for this long. */
  windowMs: 30 * 24 * 3600_000,
  /** A rating needs a server-seen visit this recent... */
  visitWithinMs: 24 * 3600_000,
  /** ...that lasted at least this long before rating. */
  minStayMs: 15_000,
  maxComment: 140,
  /** Bayesian prior: this many 3-star votes are mixed in, so a few friends can't swing a house. */
  prior: 3,
  priorWeight: 5,
  /** Points one star above or below average is worth, so ratings move the score by at most ±10. */
  perStar: 5,
} as const;

export const ratedAverage = (sum: number, n: number) => (sum + RATING.prior * RATING.priorWeight) / (n + RATING.priorWeight);
/** The displayed score: the style score moved by what visitors think. */
export function finalScore(base: number, sum: number, n: number): number {
  const adj = n ? Math.round((ratedAverage(sum, n) - RATING.prior) * RATING.perStar) : 0;
  return Math.max(0, Math.min(100, base + adj));
}
export const dayNumber = (at: number) => Math.floor(at / 86_400_000);

/* ---------- Saved layouts ---------- */

export const LAYOUTS = { max: 8, nameMax: 24, maxItems: 400 } as const;

/** Save keys that hold something per house but are not decorating (they are structure, money or other systems). */
const NOT_DECOR = new Set(['wallEdits', 'properties', 'items', 'furnitureInventory', 'carCondition', 'carFuel', 'jetWear', 'investments', 'aliases', 'hotelStays', 'stats', 'needs']);
/** Property fields that are decorating, when they are there (finishes, lighting and the like). */
export const PROPERTY_DECOR_KEYS = ['finishes', 'lighting', 'lights', 'floors', 'decor', 'interior', 'fittings'] as const;

/**
 * A house's arrangement as a layout snapshot: its furniture (every field but theft and breakage marks, so new fields
 * ride along; the ids only to link a piece to the table it stands on), its paint, and every other per-house decorating value in the save. Generic on purpose: data added
 * later by other parts of the game under a house's key is included without changes here.
 */
export interface LayoutSnapshot {
  v: 1;
  design: string | null;
  items: CribItem[];
  paint?: HousePaint;
  /** Top-level save maps keyed by house: { saveKey: valueForThisHouse }. */
  decor?: Record<string, unknown>;
  /** Decorating fields stored on the property itself. */
  prop?: Record<string, unknown>;
}

type SaveLike = Record<string, unknown> & { properties?: { id?: string; [k: string]: unknown }[] };

export function snapshotHouse(save: SaveLike, houseKey: string, items: CribItem[], design: string | null): LayoutSnapshot {
  const decor: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(save)) {
    if (NOT_DECOR.has(k) || k === 'housePaint' || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const mine = (v as Record<string, unknown>)[houseKey];
    if (mine !== undefined && mine !== null && typeof mine === 'object') decor[k] = mine;
  }
  const property = save.properties?.find((p) => p?.id === houseKey);
  const prop: Record<string, unknown> = {};
  for (const k of PROPERTY_DECOR_KEYS) if (property?.[k] !== undefined) prop[k] = property[k];
  const paint = (save.housePaint as Record<string, HousePaint> | undefined)?.[houseKey];
  return {
    v: 1,
    design,
    items: items.filter((i) => ITEMS[i.type] && !ITEMS[i.type].fixed).slice(0, LAYOUTS.maxItems).map(({ stolen: _s, broken: _b, ...rest }) => rest as CribItem),
    ...(paint && Object.keys(paint).length ? { paint } : {}),
    ...(Object.keys(decor).length ? { decor } : {}),
    ...(Object.keys(prop).length ? { prop } : {}),
  };
}

/** What a snapshot's furniture is worth at today's prices, and how many pieces. */
export const snapshotValue = (s: Pick<LayoutSnapshot, 'items'>) => s.items.reduce((sum, i) => sum + (ITEMS[i.type]?.price ?? 0), 0);

/**
 * What has to be bought to lay a snapshot out: the pieces it needs, less those already to hand (in the house or in
 * storage), priced at today's catalogue prices.
 */
export function layoutQuote(wanted: { type: string }[], onHand: { type: string }[]): { missing: { type: string; n: number; price: number }[]; total: number; reused: number } {
  const have = new Map<string, number>();
  for (const i of onHand) if (ITEMS[i.type] && !ITEMS[i.type].fixed) have.set(i.type, (have.get(i.type) ?? 0) + 1);
  const need = new Map<string, number>();
  let reused = 0;
  for (const i of wanted) {
    if (!ITEMS[i.type] || ITEMS[i.type].fixed) continue;
    const left = have.get(i.type) ?? 0;
    if (left > 0) { have.set(i.type, left - 1); reused++; continue; }
    need.set(i.type, (need.get(i.type) ?? 0) + 1);
  }
  const missing = [...need].map(([type, n]) => ({ type, n, price: ITEMS[type].price }));
  return { missing, total: missing.reduce((s, m) => s + m.price * m.n, 0), reused };
}

/* ---------- Placing a set of pieces ---------- */

/** Where pieces would like to go: the room roles they belong in. */
function homeRole(type: string): RoomRole | 'outside' | null {
  const def = ITEMS[type];
  if (!def) return null;
  if (def.outdoorOnly || def.category === 'outdoor') return 'outside';
  for (const role of Object.keys(ROOM_NEEDS) as RoomRole[]) if (ROOM_NEEDS[role].some((n) => n.met(type))) return role;
  if (def.category === 'sleep') return 'bedroom';
  if (def.category === 'kitchen') return 'kitchen';
  if (def.category === 'bath') return 'bathroom';
  if (def.category === 'skills') return 'study';
  return 'living';
}

/**
 * Finds a spot for each piece in turn, in the room it belongs in when there is one, else anywhere it fits. Pieces
 * already placed stay put. Returns the new placements and the pieces that found no room.
 */
export function autoPlace<T extends { type: string; rot?: number }>(pieces: T[], existing: PlacedItem[], layout: HouseLayout, opts: { rooms?: CribInput['rooms']; avoid?: { x: number; z: number } } = {}): { placed: (T & { x: number; z: number; rot: number })[]; left: T[] } {
  const placed: (T & { x: number; z: number; rot: number })[] = [];
  const left: T[] = [];
  const all: PlacedItem[] = [...existing];
  const avoid = opts.avoid ?? arrivalCell(layout);
  const roomCells = (role: RoomRole | 'outside' | null) => {
    if (role === 'outside') return (c: { x: number; z: number }) => c.x >= layout.width || c.z >= layout.depth;
    const rooms = role ? layout.rooms.filter((r) => roomRoles(r, opts.rooms).includes(role)) : [];
    if (!rooms.length) return null;
    return (c: { x: number; z: number }) => rooms.some((r) => c.x >= r.x0 && c.x < r.x1 && c.z >= r.z0 && c.z < r.z1);
  };
  let n = 0;
  for (const piece of pieces) {
    if (!ITEMS[piece.type]) { left.push(piece); continue; }
    const prefer = roomCells(homeRole(piece.type));
    let spot: { x: number; z: number; rot: number } | null = null;
    for (const pass of prefer ? [prefer, null] : [null]) {
      for (let z = 0; z < layout.gridH && !spot; z++) for (let x = 0; x < layout.gridW && !spot; x++) {
        if (pass && !pass({ x, z })) continue;
        for (const rot of [piece.rot ?? 0, 0, 1, 2, 3]) {
          const cand = { type: piece.type, x, z, rot };
          if (pass && !footprint(cand).every(pass)) continue;
          if (!placementError(cand, all, avoid, undefined, layout)) { spot = cand; break; }
        }
      }
      if (spot) break;
    }
    if (!spot) { left.push(piece); continue; }
    const out = { ...piece, ...spot };
    placed.push(out);
    all.push({ id: `__auto${n++}`, type: piece.type, x: spot.x, z: spot.z, rot: spot.rot });
  }
  return { placed, left };
}

/* ---------- Style packs ---------- */

export interface StylePack {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  /** Furniture to buy (or take from storage) and place. */
  items: string[];
  /** Wall paint, and colours for painted parts of the pieces (by item type, slot order). */
  paint: HousePaint;
  itemPaint?: Record<string, (string | null)[]>;
  /** Finishes to choose once the house has them, by finish key (left to the house's own finishes to read). */
  finishes?: Record<string, string>;
  bg: [string, string];
}

export const STYLE_PACKS: StylePack[] = [
  {
    id: 'student', name: 'Student Budget', icon: '🎒', blurb: 'Foam, a fan, a kettle and a prayer. Everything a 100-level needs for under ₦600k.',
    items: ['bed_foam', 'nightstand', 'fan', 'plastic_chair', 'plastic_chair', 'kettle', 'kerosene_stove', 'mini_fridge', 'bookshelf', 'floor_lamp', 'bucket', 'ankara_rug', 'radio'],
    paint: { inner: 'cream' }, itemPaint: { bed_foam: ['sky', null], bookshelf: [null] },
    finishes: { floor: 'tiles_plain' }, bg: ['#fde68a', '#d97706'],
  },
  {
    id: 'minimal', name: 'Minimal Clean', icon: '🤍', blurb: 'White walls, soft greys, one green plant per room. Less is more, abeg.',
    items: ['bed_single', 'wardrobe', 'sofa', 'coffee_table', 'tv', 'tv_cabinet', 'floor_lamp', 'floor_lamp', 'plant', 'plant', 'counter', 'cooker', 'fridge', 'dining', 'toilet', 'shower', 'sink', 'desk'],
    paint: { inner: 'chalk', outer: 'chalk' }, itemPaint: { sofa: ['charcoal', 'chalk'], bed_single: ['chalk'], desk: ['chalk', 'charcoal'] },
    finishes: { floor: 'polished_concrete', walls: 'smooth' }, bg: ['#f8fafc', '#94a3b8'],
  },
  {
    id: 'arewa', name: 'Arewa Royal', icon: '🐎', blurb: 'Kano leather, a throne for the oga, prayer mats, and terracotta like the old city walls.',
    items: ['bed_royal', 'dressing_table', 'gold_throne', 'leather_pouf', 'leather_pouf', 'rug', 'prayer_mat', 'talking_drum', 'clay_pot', 'mortar', 'wall_clock', 'chandelier_lamp', 'dining', 'gas_cooker', 'fridge', 'bidet_toilet', 'hot_shower', 'plant'],
    paint: { inner: 'cream', outer: 'terracotta' }, itemPaint: { bed_royal: ['terracotta', null], gold_throne: [null, 'terracotta'], rug: ['terracotta', 'cream'] },
    finishes: { floor: 'marble', walls: 'arabesque' }, bg: ['#fdba74', '#9a3412'],
  },
  {
    id: 'bigboy', name: 'Lagos Big Boy', icon: '🕶️', blurb: 'Italian leather, a 110-inch screen, a champagne bar and a PS5 for when the boys come round.',
    items: ['leather_sectional', 'home_cinema', 'marble_bar', 'ps5', 'speaker', 'velvet_rug', 'golden_bed', 'gilded_mirror', 'smart_fridge', 'chef_island', 'standing_ac', 'chandelier_lamp', 'floor_lamp', 'corner_jacuzzi', 'bidet_toilet', 'aquarium'],
    paint: { inner: 'charcoal', outer: 'navy' }, itemPaint: { leather_sectional: ['charcoal', null] },
    finishes: { floor: 'marble', walls: 'gold_trim', lighting: 'led_strips' }, bg: ['#a78bfa', '#312e81'],
  },
  {
    id: 'owambe', name: 'Owambe Ready', icon: '🎉', blurb: 'Space for the whole family, speakers that shake the street, and a suya grill outside.',
    items: ['sofa', 'sofa', 'armchair', 'armchair', 'centre_table', 'speaker', 'dj_decks', 'karaoke', 'dining', 'freezer', 'gas_cooker', 'water_dispenser', 'popcorn_machine', 'floor_lamp', 'suya_grill', 'parasol_set', 'garden_lamp'],
    paint: { inner: 'cream', outer: 'blush' }, itemPaint: { sofa: ['blush', 'cream'], parasol_set: ['terracotta', null] },
    finishes: { floor: 'tiles_pattern' }, bg: ['#f9a8d4', '#be185d'],
  },
];
export const STYLE_PACK_BY_ID: Record<string, StylePack> = Object.fromEntries(STYLE_PACKS.map((p) => [p.id, p]));
export const packPrice = (p: StylePack) => p.items.reduce((s, t) => s + (ITEMS[t]?.price ?? 0), 0);

/* ---------- Interior designer jobs ---------- */

export const DESIGN_JOB = {
  minFee: 5_000,
  maxFee: 50_000_000,
  maxBudget: 200_000_000,
  /** How long the designer has the keys once they accept. */
  hours: [1, 2, 6, 24] as const,
  /** An offer nobody answers is withdrawn after this. */
  offerMs: 24 * 3600_000,
  /** A submitted job the client never answers is approved after this. */
  reviewMs: 72 * 3600_000,
  /** On a revert the designer keeps this share of the fee for their time. */
  calloutShare: 0.25,
  /** Career XP for an approved job (the 'design' skill in the skills table). */
  xp: 60,
  maxOps: 400,
  noteMax: 200,
} as const;

export type DesignJobStatus = 'offered' | 'active' | 'submitted' | 'approved' | 'reverted' | 'declined' | 'cancelled' | 'expired';

/** The draft a designer works on: the house's pieces, what is in storage for them to use, and what they bought. */
export interface DesignDraft {
  items: PlacedItem[];
  /** The client's stored pieces the designer may place. */
  storage: PlacedItem[];
  paint?: HousePaint;
  /** Pieces bought from the budget: their ids, so the client's game adds them once. */
  bought: string[];
}

/* ---------- Owambe ---------- */

/**
 * A well-known crib pulls a crowd: guests who saw it on Cribs come along and spray too. A share of what the party
 * took, from nothing below a score of 40 to 15% at 100, capped.
 */
export const OWAMBE_CRIB = { from: 40, top: 0.15, cap: 300_000, guestsPer10: 2 } as const;
export function owambeCribBonus(score: number, sprayed: number): { bonus: number; guests: number } {
  const share = score <= OWAMBE_CRIB.from ? 0 : OWAMBE_CRIB.top * ((Math.min(100, score) - OWAMBE_CRIB.from) / (100 - OWAMBE_CRIB.from));
  return { bonus: Math.min(OWAMBE_CRIB.cap, Math.round(sprayed * share)), guests: Math.floor(Math.max(0, score - OWAMBE_CRIB.from) / 10) * OWAMBE_CRIB.guestsPer10 };
}

/* ---------- Which layout a property uses ---------- */

/** The layout key a property is laid out by (design plus extensions; the car bay too when the owner has cars). */
export const propertyLayout = (p: { design?: string | null; extensions?: string[] | null } | undefined, cars = false) =>
  layoutKey(p?.design ?? null, (p?.extensions ?? null) as never, cars);
