// House customising: one shared palette for furniture and walls. Furniture models are
// built from boxes with fixed colours, so a "slot" is just the list of colours in a model that
// belong to one part (the first is the main shade, the rest are lighter / darker variants of it).
// Recolouring swaps those colours for the picked one, keeping the same light and dark variation.
//
// A colour choice ("colour ref") is either a palette id below or a custom '#rrggbb' from the picker.
// The first eight ids are the original palette: saves from before the bigger one still resolve.

export interface PaintColour { id: string; name: string; hex: string }

export const PAINT_COLOURS: PaintColour[] = [
  // The original eight
  { id: 'chalk', name: 'Chalk', hex: '#f4f1ea' },
  { id: 'cream', name: 'Cream', hex: '#e8d5a8' },
  { id: 'sage', name: 'Sage', hex: '#8fb396' },
  { id: 'sky', name: 'Sky', hex: '#7db4dc' },
  { id: 'blush', name: 'Blush', hex: '#e8a5b4' },
  { id: 'terracotta', name: 'Terracotta', hex: '#c4623a' },
  { id: 'navy', name: 'Navy', hex: '#2c4670' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3d444d' },
  // Lights and neutrals
  { id: 'magnolia', name: 'Magnolia', hex: '#f3e9d6' },
  { id: 'sand', name: 'Harmattan Sand', hex: '#d6bf96' },
  { id: 'greige', name: 'Greige', hex: '#b8ad9e' },
  { id: 'mocha', name: 'Mocha', hex: '#7a5a44' },
  // Warm
  { id: 'butter', name: 'Butter', hex: '#f3dc8a' },
  { id: 'mustard', name: 'Mustard', hex: '#d4a017' },
  { id: 'peach', name: 'Peach', hex: '#f2b48c' },
  { id: 'coral', name: 'Coral', hex: '#e8735a' },
  { id: 'oxblood', name: 'Oxblood', hex: '#6e1f24' },
  { id: 'plum', name: 'Plum', hex: '#6b3a5e' },
  // Cool
  { id: 'lilac', name: 'Lilac', hex: '#b9a6d6' },
  { id: 'mint', name: 'Mint', hex: '#b5dfc6' },
  { id: 'eagle', name: 'Super Eagles Green', hex: '#0f7a3d' },
  { id: 'olive', name: 'Olive', hex: '#6f7442' },
  { id: 'teal', name: 'Teal', hex: '#1f7a7a' },
  { id: 'indigo', name: 'Adire Indigo', hex: '#283a7a' },
];
export const PAINT_BY_ID: Record<string, PaintColour> = Object.fromEntries(PAINT_COLOURS.map((c) => [c.id, c]));

export interface PaintSlot { label: string; /** Model colours that make up this part; first is the main one. */ bases: string[] }

export const ITEM_PAINT: Record<string, PaintSlot[]> = {
  bed_foam: [
    { label: 'Blanket', bases: ['#2f6f4f'] },
    { label: 'Frame', bases: ['#6b4426', '#5a371e'] },
  ],
  bed_royal: [
    { label: 'Duvet', bases: ['#7b1f3a'] },
    { label: 'Frame', bases: ['#c9a227', '#4a2a14'] },
  ],
  sofa: [
    { label: 'Sofa', bases: ['#7f1d1d', '#991b1b', '#6b1717'] },
    { label: 'Cushion', bases: ['#fbbf24'] },
  ],
  leather_sectional: [
    { label: 'Leather', bases: ['#e8dcc6', '#f3ead9', '#d9c8a8'] },
    { label: 'Cushions', bases: ['#d4af37'] },
  ],
  gold_throne: [
    { label: 'Frame', bases: ['#d4af37', '#c9a227', '#f6d77a'] },
    { label: 'Velvet', bases: ['#991b1b', '#7b1f3a'] },
  ],
  massage_chair: [{ label: 'Leather', bases: ['#1f1f1f', '#27272a', '#3f3f46', '#52525b'] }],
  plastic_chair: [{ label: 'Chair', bases: ['#f8fafc', '#e2e8f0'] }],
  dining: [
    { label: 'Table', bases: ['#7a4a26', '#5a3418'] },
    { label: 'Chairs', bases: ['#8b5a2b'] },
  ],
  rug: [
    { label: 'Rug', bases: ['#991b1b', '#7f1d1d'] },
    { label: 'Pattern', bases: ['#b45309'] },
  ],
  velvet_rug: [
    { label: 'Velvet', bases: ['#4c0519', '#7f1d1d'] },
    { label: 'Trim', bases: ['#d4af37'] },
  ],
  prayer_mat: [
    { label: 'Mat', bases: ['#166534', '#14532d'] },
    { label: 'Trim', bases: ['#ca8a04'] },
  ],
  desk: [
    { label: 'Top', bases: ['#e5e7eb'] },
    { label: 'Legs', bases: ['#374151'] },
  ],
  bookshelf: [{ label: 'Wood', bases: ['#6b4426'] }],
  counter: [
    { label: 'Cabinet', bases: ['#8b5a2b', '#7a4e24'] },
    { label: 'Worktop', bases: ['#efe8dc'] },
  ],
  tv: [{ label: 'Stand', bases: ['#3b2a1a'] }],
  fridge: [{ label: 'Body', bases: ['#e9edf1'] }],
  smart_fridge: [{ label: 'Body', bases: ['#9ca3af'] }],
  washing_machine: [{ label: 'Body', bases: ['#f1f4f7'] }],
  cooker: [{ label: 'Body', bases: ['#d7dbe0'] }],
  aircon: [{ label: 'Unit', bases: ['#f8fafc'] }],
  standing_ac: [{ label: 'Unit', bases: ['#f8fafc'] }],
  water_drum: [{ label: 'Drum', bases: ['#2563eb', '#1d4ed8'] }],
  gas_cylinder: [{ label: 'Cylinder', bases: ['#ea580c', '#7c2d12'] }],
  fan: [{ label: 'Body', bases: ['#334155', '#64748b'] }],
  toilet: [{ label: 'Ceramic', bases: ['#fafafa', '#f1f1f1'] }],
  bidet_toilet: [{ label: 'Ceramic', bases: ['#fafafa', '#f1f1f1'] }],
  bathtub: [{ label: 'Tub', bases: ['#f8fafc', '#f1f5f9'] }],
  corner_jacuzzi: [{ label: 'Tub', bases: ['#f1f5f9'] }],
  sink: [{ label: 'Cabinet', bases: ['#f1f5f9', '#fafafa'] }],
  bath_mat: [{ label: 'Mat', bases: ['#38bdf8', '#7dd3fc'] }],
  towel_rail: [
    { label: 'Towel 1', bases: ['#f97316'] },
    { label: 'Towel 2', bases: ['#38bdf8'] },
  ],
  plant: [
    { label: 'Pot', bases: ['#c2410c'] },
    { label: 'Leaves', bases: ['#15803d', '#16a34a'] },
  ],
  bean_bag: [{ label: 'Bag', bases: ['#7c3aed', '#6d28d9'] }],
  rocking_chair: [{ label: 'Chair', bases: ['#8b5a2b', '#5a371e'] }],
  leather_pouf: [{ label: 'Leather', bases: ['#92400e'] }],
  bunk_bed: [
    { label: 'Top blanket', bases: ['#b45309'] },
    { label: 'Bottom blanket', bases: ['#0f766e'] },
    { label: 'Frame', bases: ['#8b5a2b', '#6b4426'] },
  ],
  net_bed: [
    { label: 'Blanket', bases: ['#0e7490'] },
    { label: 'Frame', bases: ['#5a371e'] },
  ],
  dressing_table: [
    { label: 'Table', bases: ['#f5e6d3', '#e7d3b8'] },
    { label: 'Stool', bases: ['#be185d'] },
  ],
  yoga_mat: [{ label: 'Mat', bases: ['#7c3aed', '#c4b5fd'] }],
  table_tennis: [{ label: 'Table', bases: ['#1d4ed8'] }],
  parasol_set: [
    { label: 'Parasol', bases: ['#dc2626'] },
    { label: 'Furniture', bases: ['#f8fafc', '#e2e8f0'] },
  ],
  garden_swing: [
    { label: 'Seat', bases: ['#fbbf24'] },
    { label: 'Canopy', bases: ['#0ea5e9'] },
  ],
};

/** House wall parts you can repaint: the outside shell and the walls between rooms. */
export type WallPart = 'outer' | 'inner';
export type HousePaint = Partial<Record<WallPart, string>>;
export const WALL_PARTS: { key: WallPart; label: string; icon: string }[] = [
  { key: 'outer', label: 'Outside walls', icon: '🏠' },
  { key: 'inner', label: 'Inside walls', icon: '🛋️' },
];
export const DEFAULT_INNER_WALL = '#eee7da';

const HEX = /^#[0-9a-f]{6}$/;
/** A palette id or a custom '#rrggbb' (lower case). Anything else is ignored, which keeps saves and visits safe. */
export const isColourRef = (ref: unknown): ref is string => typeof ref === 'string' && (!!PAINT_BY_ID[ref] || HEX.test(ref));
/** The hex for a colour ref: palette ids look up their colour, custom ones are their own. */
export const paintHex = (id: string | null | undefined): string | null => (!id ? null : PAINT_BY_ID[id]?.hex ?? (HEX.test(id) ? id : null));
/** What to call a colour ref in the UI. */
export const colourName = (ref: string | null | undefined) => (!ref ? 'Original' : PAINT_BY_ID[ref]?.name ?? (HEX.test(ref) ? `Custom ${ref.toUpperCase()}` : 'Original'));

/** Hue (0-360), saturation and lightness (0-100) to '#rrggbb', for the custom colour picker. */
export function hslHex(h: number, s: number, l: number): string {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgb2hex([f(0), f(8), f(4)]);
}
/** '#rrggbb' to [hue, saturation, lightness], the inverse of hslHex. */
export function hexHsl(hex: string): [number, number, number] {
  const [r, g, b] = hex2rgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}

const hex2rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const rgb2hex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const lightness = (h: string) => { const [r, g, b] = hex2rgb(h); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2; };

/** The chosen colour at the same relative brightness a variant has next to the main shade. */
function shade(chosen: string, base: string, main: string): string {
  const k = (lightness(base) + 0.15) / (lightness(main) + 0.15);
  return rgb2hex(hex2rgb(chosen).map((v) => v * k));
}

/** Model colour -> replacement colour, for the slots the owner has painted. */
export function paintMap(type: string, paint?: (string | null)[] | null): Record<string, string> | null {
  const slots = ITEM_PAINT[type];
  if (!slots || !paint) return null;
  let out: Record<string, string> | null = null;
  slots.forEach((slot, i) => {
    const chosen = paintHex(paint[i]);
    if (!chosen) return;
    out ??= {};
    slot.bases.forEach((b, j) => { out![b] = j === 0 ? chosen : shade(chosen, b, slot.bases[0]); });
  });
  return out;
}

/** Cache key so a model remounts when its colours change. */
export const paintKey = (paint?: (string | null)[] | null) => (paint ?? []).map((p) => p ?? '').join(',');
