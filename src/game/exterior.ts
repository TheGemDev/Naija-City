// A house's own look and the work done on it after it was built: the name the owner gives it, the outside (fence,
// gate, roof, trim, paving, carport and what stands in the compound), extensions (boys' quarters, a second floor, a
// balcony, a rooftop terrace) and the rooms the owner has named and given a use. All of it is plain data on the
// Property in the save, so the server can check it (worker/index.ts), the Cribs score can read it, and the estate,
// the map home and the house thumbnails draw from it (three/houseKit.tsx). No store or three imports here: the worker
// shares this file.

/* ---------- The house's name ---------- */

/** Longest name for a house: the same as ALIAS_MAX for a nickname (game/store.ts). */
export const HOUSE_NAME_MAX = 24;

/**
 * A house name as stored: control and bidi-override characters out (they can hide or flip text in other people's
 * lists), runs of whitespace as one space, trimmed, at most HOUSE_NAME_MAX characters (emoji count as one). Empty means
 * "no name": the house goes by its design. The worker runs the same function on every save.
 */
export function cleanHouseName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // \p{Cc}: control characters. \p{Cf}: formatting ones (bidi overrides, zero-width spaces), except the zero-width
  // joiner that holds family and flag emoji together.
  const text = raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '‍' ? c : ' ')).replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, HOUSE_NAME_MAX).join('').trim();
}

/* ---------- Outside ---------- */

export type FenceStyle = 'block' | 'railing' | 'stone' | 'hedge';
export type GateStyle = 'swing' | 'sliding' | 'ornate';
export type RoofShape = 'hipped' | 'gable' | 'flat' | 'stepped';
export type RoofFinish = 'aluminium' | 'tile' | 'stone';
export type Paving = 'interlock' | 'herringbone' | 'checker' | 'gravel';
export type CarportStyle = 'curved' | 'sloped' | 'tensile';
export type YardItem = 'lawn' | 'garden' | 'palm' | 'mango' | 'gazebo' | 'carport' | 'security' | 'tank' | 'genhouse' | 'pool' | 'bar' | 'grill';

/** What the owner has chosen. Anything missing is the design's default (EXTERIOR_DEFAULTS). */
export interface HouseExterior {
  fence?: FenceStyle;
  /** A colour id from EXTERIOR_COLOURS. */
  fenceColour?: string;
  gate?: GateStyle;
  gateColour?: string;
  roof?: RoofShape;
  roofFinish?: RoofFinish;
  roofColour?: string;
  /** Window and door surrounds, fascia and pillar caps. */
  trim?: string;
  paving?: Paving;
  carport?: CarportStyle;
  carportColour?: string;
  /** What stands in the compound. Set once the owner changes it; until then the design's default list. */
  items?: YardItem[];
}

/** Every colour the outside can take: house paints, roof sheets, steel. */
export const EXTERIOR_COLOURS: { id: string; name: string; hex: string }[] = [
  { id: 'white', name: 'White', hex: '#f4f1ea' },
  { id: 'cream', name: 'Cream', hex: '#e8d5a8' },
  { id: 'sand', name: 'Sand', hex: '#d9c3a0' },
  { id: 'grey', name: 'Grey', hex: '#9ca3af' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3d444d' },
  { id: 'black', name: 'Black', hex: '#1c1f24' },
  { id: 'green', name: 'Green', hex: '#1f6b46' },
  { id: 'blue', name: 'Blue', hex: '#1e4f8a' },
  { id: 'red', name: 'Red', hex: '#a3261f' },
  { id: 'brown', name: 'Brown', hex: '#6b3a1e' },
  { id: 'terracotta', name: 'Terracotta', hex: '#b5532e' },
  { id: 'gold', name: 'Gold', hex: '#c9a227' },
];
export const EXTERIOR_COLOUR: Record<string, string> = Object.fromEntries(EXTERIOR_COLOURS.map((c) => [c.id, c.hex]));
export const exteriorHex = (id: string | undefined, fallback: string) => (id && EXTERIOR_COLOUR[id]) || fallback;

/** A resolved outside: every choice filled in. */
export type Exterior = Required<Omit<HouseExterior, 'items'>> & { items: YardItem[] };

// What each design comes with: the self-con behind a plain block wall with a swing gate and a zinc roof, up to the
// mansion behind a stone wall and an ornate gate under a stepped stone-coated roof.
export const EXTERIOR_DEFAULTS: Record<string, Exterior> = {
  starter: { fence: 'block', fenceColour: 'sand', gate: 'swing', gateColour: 'black', roof: 'hipped', roofFinish: 'aluminium', roofColour: 'green', trim: 'white', paving: 'gravel', carport: 'sloped', carportColour: 'grey', items: ['tank', 'mango'] },
  selfcon: { fence: 'block', fenceColour: 'grey', gate: 'swing', gateColour: 'black', roof: 'gable', roofFinish: 'aluminium', roofColour: 'brown', trim: 'white', paving: 'gravel', carport: 'sloped', carportColour: 'grey', items: ['tank', 'mango'] },
  bungalow: { fence: 'block', fenceColour: 'cream', gate: 'swing', gateColour: 'black', roof: 'hipped', roofFinish: 'aluminium', roofColour: 'green', trim: 'white', paving: 'interlock', carport: 'sloped', carportColour: 'grey', items: ['tank', 'genhouse', 'mango', 'lawn', 'garden'] },
  duplex: { fence: 'block', fenceColour: 'cream', gate: 'sliding', gateColour: 'black', roof: 'hipped', roofFinish: 'stone', roofColour: 'blue', trim: 'white', paving: 'interlock', carport: 'curved', carportColour: 'charcoal', items: ['tank', 'genhouse', 'carport', 'palm', 'lawn', 'garden'] },
  flats: { fence: 'block', fenceColour: 'sand', gate: 'sliding', gateColour: 'black', roof: 'flat', roofFinish: 'aluminium', roofColour: 'grey', trim: 'white', paving: 'interlock', carport: 'sloped', carportColour: 'grey', items: ['tank', 'genhouse', 'security', 'lawn', 'carport'] },
  mansion: { fence: 'stone', fenceColour: 'sand', gate: 'ornate', gateColour: 'black', roof: 'stepped', roofFinish: 'stone', roofColour: 'charcoal', trim: 'gold', paving: 'herringbone', carport: 'tensile', carportColour: 'white', items: ['tank', 'genhouse', 'security', 'palm', 'lawn', 'garden', 'carport', 'pool'] },
};

/** The outside as it stands: the owner's choices over the design's defaults. */
export function exteriorOf(design: string | null | undefined, ext?: HouseExterior | null): Exterior {
  const base = EXTERIOR_DEFAULTS[design ?? 'starter'] ?? EXTERIOR_DEFAULTS.starter;
  const out = { ...base, items: ext?.items ?? base.items } as Exterior;
  if (ext) for (const k of Object.keys(base) as (keyof Exterior)[]) if (k !== 'items' && ext[k] !== undefined) (out as Record<string, unknown>)[k] = ext[k];
  return out;
}

export interface ExteriorChoice<T extends string = string> { id: T; name: string; icon: string; price: number; blurb?: string }

export const FENCES: ExteriorChoice<FenceStyle>[] = [
  { id: 'block', name: 'Block wall', icon: '🧱', price: 350_000, blurb: 'Plastered 9-inch blocks, pillars and coping, spikes on top.' },
  { id: 'railing', name: 'Wall & railings', icon: '🔱', price: 900_000, blurb: 'A low wall with steel railings between the pillars.' },
  { id: 'stone', name: 'Stone-clad wall', icon: '🪨', price: 1_600_000, blurb: 'Tall wall faced in stone, razor wire along the top.' },
  { id: 'hedge', name: 'Hedge', icon: '🌳', price: 200_000, blurb: 'Ixora hedge with a low kerb. Pretty, not much security.' },
];
export const GATES: ExteriorChoice<GateStyle>[] = [
  { id: 'swing', name: 'Swing gate', icon: '🚪', price: 250_000, blurb: 'Two steel leaves on hinges.' },
  { id: 'sliding', name: 'Sliding gate', icon: '↔️', price: 650_000, blurb: 'One leaf on a rail. The gateman thanks you.' },
  { id: 'ornate', name: 'Ornate gate', icon: '⚜️', price: 1_400_000, blurb: 'Wrought scrolls, gold finials and lit pillars.' },
];
export const ROOFS: ExteriorChoice<RoofShape>[] = [
  { id: 'hipped', name: 'Hipped', icon: '🏠', price: 1_200_000, blurb: 'Slopes on all four sides.' },
  { id: 'gable', name: 'Gable', icon: '⛺', price: 1_000_000, blurb: 'Two slopes and a gable end.' },
  { id: 'flat', name: 'Flat', icon: '▭', price: 1_500_000, blurb: 'Concrete deck behind a parapet. Needed for a rooftop terrace.' },
  { id: 'stepped', name: 'Stepped', icon: '🏯', price: 2_200_000, blurb: 'Hips over hips: the big-man roof.' },
];
export const ROOF_FINISHES: ExteriorChoice<RoofFinish>[] = [
  { id: 'aluminium', name: 'Long-span aluminium', icon: '🔩', price: 500_000 },
  { id: 'tile', name: 'Clay tiles', icon: '🧱', price: 1_100_000 },
  { id: 'stone', name: 'Stone-coated steel', icon: '🪨', price: 1_500_000 },
];
export const PAVINGS: ExteriorChoice<Paving>[] = [
  { id: 'gravel', name: 'Laterite & gravel', icon: '🟫', price: 80_000 },
  { id: 'interlock', name: 'Interlocking stones', icon: '🔲', price: 450_000 },
  { id: 'herringbone', name: 'Herringbone pavers', icon: '🧩', price: 700_000 },
  { id: 'checker', name: 'Two-tone checker', icon: '🏁', price: 550_000 },
];
export const CARPORTS: ExteriorChoice<CarportStyle>[] = [
  { id: 'sloped', name: 'Sloped sheet', icon: '📐', price: 400_000, blurb: 'Steel posts, aluminium sheets falling to the back.' },
  { id: 'curved', name: 'Curved canopy', icon: '🌈', price: 750_000, blurb: 'Bent polycarbonate on arched steel.' },
  { id: 'tensile', name: 'Tensile shade', icon: '⛱️', price: 1_100_000, blurb: 'Stretched fabric sails on slim masts.' },
];
export const YARD_ITEMS: (ExteriorChoice<YardItem> & { bigPlot?: boolean })[] = [
  { id: 'lawn', name: 'Lawn', icon: '🌱', price: 150_000, blurb: 'Carpet grass and an edging kerb.' },
  { id: 'garden', name: 'Flower beds', icon: '🌺', price: 200_000, blurb: 'Ixora, hibiscus and bougainvillea.' },
  { id: 'palm', name: 'Palm trees', icon: '🌴', price: 180_000, blurb: 'Royal palms along the drive.' },
  { id: 'mango', name: 'Mango tree', icon: '🥭', price: 90_000, blurb: 'Shade, mangoes and neighbours’ children.' },
  { id: 'gazebo', name: 'Gazebo', icon: '⛩️', price: 800_000, blurb: 'Thatched hut with benches for evening gist.' },
  { id: 'carport', name: 'Carport', icon: '🅿️', price: 400_000, blurb: 'A shade over the cars (pick its style above).' },
  { id: 'security', name: 'Security post & CCTV', icon: '📹', price: 1_500_000, blurb: 'Gatehouse for the mai-gadi, cameras on the corners.' },
  { id: 'tank', name: 'Water tank', icon: '🛢️', price: 350_000, blurb: 'GP tank up on a steel stand.' },
  { id: 'genhouse', name: 'Generator house', icon: '⚡', price: 450_000, blurb: 'A roofed bay so the gen is not under the rain.' },
  { id: 'pool', name: 'Swimming pool', icon: '🏊🏾', price: 9_000_000, blurb: 'Tiled pool and deck. Full or double plots only.', bigPlot: true },
  { id: 'bar', name: 'Outdoor bar', icon: '🍹', price: 1_300_000, blurb: 'A counter, stools and a fridge humming outside.' },
  { id: 'grill', name: 'Suya grill', icon: '🍢', price: 250_000, blurb: 'Charcoal pit and a bench for the mallam.' },
];
export const YARD_ITEM: Record<string, (typeof YARD_ITEMS)[number]> = Object.fromEntries(YARD_ITEMS.map((i) => [i.id, i]));
/** Repainting one part (fence, gate, roof, trim, carport) costs this much, times the house's scale. */
export const REPAINT_PRICE = 90_000;

/** Outside work costs more on a bigger house: there is more wall, more roof and a longer drive. */
export const EXTERIOR_SCALE: Record<string, number> = { starter: 0.6, selfcon: 0.6, bungalow: 1, duplex: 1.6, flats: 2.2, mansion: 3 };
export const exteriorPrice = (base: number, design: string | null | undefined) => Math.round((base * (EXTERIOR_SCALE[design ?? 'starter'] ?? 1)) / 1000) * 1000;

const one = <T extends string>(list: ExteriorChoice<T>[], v: unknown): T | undefined => (list.some((c) => c.id === v) ? (v as T) : undefined);
const colour = (v: unknown) => (typeof v === 'string' && EXTERIOR_COLOUR[v] ? v : undefined);

/** Only known choices survive (the worker runs this on every save); undefined when nothing is left. */
export function cleanExterior(raw: unknown): HouseExterior | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: HouseExterior = {
    fence: one(FENCES, r.fence), fenceColour: colour(r.fenceColour), gate: one(GATES, r.gate), gateColour: colour(r.gateColour),
    roof: one(ROOFS, r.roof), roofFinish: one(ROOF_FINISHES, r.roofFinish), roofColour: colour(r.roofColour), trim: colour(r.trim),
    paving: one(PAVINGS, r.paving), carport: one(CARPORTS, r.carport), carportColour: colour(r.carportColour),
    items: Array.isArray(r.items) ? [...new Set(r.items.filter((i): i is YardItem => typeof i === 'string' && !!YARD_ITEM[i]))] : undefined,
  };
  for (const k of Object.keys(out) as (keyof HouseExterior)[]) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : undefined;
}

/* ---------- Extensions ---------- */

export type ExtensionId = 'bq' | 'floor2' | 'balcony' | 'terrace';

export interface ExtensionDef {
  id: ExtensionId;
  name: string;
  icon: string;
  blurb: string;
  /** Scales materials, labour and time like DesignDef.size (game/property.ts), on top of the house's own grade. */
  size: number;
  /** Designs it can be built on. */
  designs: string[];
  /** Extensions that must be built first. */
  needs?: ExtensionId[];
  /** A roof the house must have (a terrace sits on a flat deck). */
  roof?: RoofShape;
  /** Interior strip it adds to the east of the house grid (game/grid.ts): columns wide, and its rooms. */
  cols: number;
}

// Each one is real building work (game/store.ts startExtension): the same materials, contractor and stages as the
// house, scaled down by `size`. Indoors each adds a strip of rooms beside the house, so the grid only grows sideways
// and furniture already placed never moves.
export const EXTENSIONS: ExtensionDef[] = [
  { id: 'bq', name: 'Boys’ quarters', icon: '🛏️', blurb: 'A room and a shower out back for the driver, the gateman or a relative from the village.', size: 0.3, designs: ['selfcon', 'bungalow', 'duplex', 'mansion'], cols: 5 },
  { id: 'floor2', name: 'Second floor', icon: '🏗️', blurb: 'Go up: two more bedrooms and a lounge over the house. The roof comes off and goes back on top.', size: 0.7, designs: ['selfcon', 'bungalow', 'duplex'], cols: 7 },
  { id: 'balcony', name: 'Balcony', icon: '🌇', blurb: 'A railed balcony off the upstairs lounge. Morning tea, evening breeze.', size: 0.12, designs: ['selfcon', 'bungalow', 'duplex', 'mansion', 'flats'], cols: 3 },
  { id: 'terrace', name: 'Rooftop terrace', icon: '🌆', blurb: 'Tiles, a parapet, chairs and the whole estate at your feet. Needs a flat roof.', size: 0.25, designs: ['selfcon', 'bungalow', 'duplex', 'mansion', 'flats'], roof: 'flat', cols: 5 },
];
export const EXTENSION_BY_ID: Record<string, ExtensionDef> = Object.fromEntries(EXTENSIONS.map((e) => [e.id, e]));
/** Designs that stand two storeys high without a second floor added (the executive house's main block is). */
const TALL_DESIGNS = new Set(['mansion', 'flats', 'duplex']);
/** Storeys the house shows outside. */
export const storeysOf = (design: string | null | undefined, ext?: string[] | null) =>
  design === 'flats' ? 3 : TALL_DESIGNS.has(design ?? '') || ext?.includes('floor2') ? 2 : 1;

/** Why this extension can't be started on the house, or null. */
export function extensionBlock(def: ExtensionDef, design: string | null | undefined, built: string[], roof: RoofShape): string | null {
  if (built.includes(def.id)) return 'Already built';
  if (!def.designs.includes(design ?? '')) return 'Not on this design';
  if (def.id === 'balcony' && storeysOf(design, built) < 2) return 'Needs a second floor first';
  if (def.roof && roof !== def.roof) return 'Needs a flat roof (change it under Outside)';
  const missing = def.needs?.find((n) => !built.includes(n));
  return missing ? `Build the ${EXTENSION_BY_ID[missing].name.toLowerCase()} first` : null;
}

/** Built extensions in a fixed order, unknown ones dropped (the worker runs this on every save). */
export const cleanExtensions = (raw: unknown): ExtensionId[] =>
  Array.isArray(raw) ? EXTENSIONS.map((e) => e.id).filter((id) => raw.includes(id)) : [];

/**
 * What the house grid is built from (game/grid.ts houseLayoutForDesign): the design, then each extension and `park`
 * when cars stand in the compound, joined by '+'. Every place that only needs a layout passes this instead of the
 * design, so the extra rooms and the car bay follow the house everywhere (the scene, pathing, visits, break-ins).
 */
export function layoutKey(design: string | null | undefined, ext?: string[] | null, cars: number | boolean = 0) {
  const n = cars === true ? 1 : cars === false ? 0 : cars;
  const parts = [design ?? '', ...cleanExtensions(ext ?? []), ...(n > 0 ? [`park${Math.min(3, n)}`] : [])];
  return parts.length > 1 ? parts.join('+') : design ?? null;
}
/** The same key with a car bay for `cars` cars (none: taken off). Idempotent. */
export function withPark(key: string | null | undefined, cars: number) {
  const parts = (key ?? '').split('+').filter((x, i) => i === 0 || (x && !x.startsWith('park')));
  if (cars > 0) parts.push(`park${Math.min(3, cars)}`);
  return parts.length > 1 ? parts.join('+') : parts[0] || null;
}
/** The extensions a layout key carries. */
export const extensionsOfKey = (key: string | null | undefined) => cleanExtensions((key ?? '').split('+').slice(1));
/** The design a layout key was made from. */
export const designOfKey = (key: string | null | undefined) => (key ? key.split('+')[0] || null : null);

/* ---------- Rooms ---------- */

export type RoomType = 'bedroom' | 'study' | 'kitchen' | 'parlour' | 'prayer';

/**
 * What a room is used for, and the small edge it gives what you do in it (game/store.ts tick): the needs that fill
 * faster and by how much, Knowledge from study, cooking skill in a kitchen.
 */
export const ROOM_TYPES: { id: RoomType; name: string; icon: string; bonus: string; needs?: Partial<Record<'energy' | 'hunger' | 'hygiene' | 'fun' | 'social', number>>; knowledge?: number; cooking?: number }[] = [
  { id: 'bedroom', name: 'Bedroom', icon: '🛏️', bonus: 'Sleep and rest fill energy 15% faster', needs: { energy: 0.15 } },
  { id: 'study', name: 'Study', icon: '📚', bonus: 'Reading and study earn 20% more Knowledge', knowledge: 0.2 },
  { id: 'kitchen', name: 'Kitchen', icon: '🍳', bonus: 'Cooking fills hunger 15% faster and teaches 20% more', needs: { hunger: 0.15 }, cooking: 0.2 },
  { id: 'parlour', name: 'Parlour', icon: '🛋️', bonus: 'Fun and gist with visitors go 10% further', needs: { fun: 0.1, social: 0.1 } },
  { id: 'prayer', name: 'Prayer room', icon: '🕌', bonus: 'A quiet corner: fun and energy 10% better while you pray or rest', needs: { fun: 0.1, energy: 0.1 } },
];
export const ROOM_TYPE: Record<string, (typeof ROOM_TYPES)[number]> = Object.fromEntries(ROOM_TYPES.map((r) => [r.id, r]));
export const ROOM_NAME_MAX = 20;

/** The owner's name and use for one room, keyed by the room's design name ("Bedroom 2", "Boys’ quarters"). */
export interface RoomSetting { name?: string; type?: RoomType }

/** Room settings with names cleaned and unknown types dropped (the worker runs this on every save). */
export function cleanRooms(raw: unknown): Record<string, RoomSetting> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, RoomSetting> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (typeof k !== 'string' || k.length > 40 || !v || typeof v !== 'object') continue;
    const name = Array.from(cleanHouseName((v as RoomSetting).name)).slice(0, ROOM_NAME_MAX).join('').trim();
    const type = ROOM_TYPE[(v as RoomSetting).type ?? ''] ? (v as RoomSetting).type : undefined;
    if (name || type) out[k] = { ...(name ? { name } : {}), ...(type ? { type } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * What a change to the outside costs, from the outside as it stands: each style picked is its price, each part
 * repainted REPAINT_PRICE, each compound item added its price (taking one away is free), all times the house's scale.
 * Picking what is already there costs nothing.
 */
export function exteriorChangeCost(design: string | null | undefined, now: Exterior, patch: HouseExterior): number {
  const price = (list: ExteriorChoice[], id: string | undefined, was: string) => (id && id !== was ? list.find((c) => c.id === id)?.price ?? 0 : 0);
  const paint = (id: string | undefined, was: string) => (id && id !== was ? REPAINT_PRICE : 0);
  let base =
    price(FENCES, patch.fence, now.fence) + price(GATES, patch.gate, now.gate) + price(ROOFS, patch.roof, now.roof) +
    price(ROOF_FINISHES, patch.roofFinish, now.roofFinish) + price(PAVINGS, patch.paving, now.paving) + price(CARPORTS, patch.carport, now.carport) +
    paint(patch.fenceColour, now.fenceColour) + paint(patch.gateColour, now.gateColour) + paint(patch.roofColour, now.roofColour) +
    paint(patch.trim, now.trim) + paint(patch.carportColour, now.carportColour);
  for (const id of patch.items ?? []) if (!now.items.includes(id)) base += YARD_ITEM[id]?.price ?? 0;
  return exteriorPrice(base, design);
}
