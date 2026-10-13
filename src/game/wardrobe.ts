// What your person looks like: body, skin, hair, and the clothes and accessories you own and wear.
// The whole appearance packs into the short `look` string that is saved and sent to other players,
// so remote players render exactly what you are wearing. The low-poly body is in three/Person.tsx.

export type Body = 'm' | 'f';
export type Slot = 'top' | 'bottom' | 'shoes' | 'head' | 'eyes' | 'neck' | 'wrist' | 'bag';

export const SLOTS: { id: Slot; label: string; icon: string }[] = [
  { id: 'top', label: 'Tops', icon: '👕' },
  { id: 'bottom', label: 'Bottoms', icon: '👖' },
  { id: 'shoes', label: 'Shoes', icon: '👟' },
  { id: 'head', label: 'Headwear', icon: '🧢' },
  { id: 'eyes', label: 'Glasses', icon: '🕶️' },
  { id: 'neck', label: 'Chains', icon: '📿' },
  { id: 'wrist', label: 'Watches', icon: '⌚' },
  { id: 'bag', label: 'Bags', icon: '👜' },
];

export const SKINS = ['#f1c9a5', '#d9a273', '#b5774b', '#8d5524', '#6b3e1f', '#4a2912'];
// Natural shades first, then dyes. Saved looks hold an index into this list, so only ever add to the end.
export const HAIR_COLORS = ['#111111', '#3b2414', '#6b4423', '#a16207', '#9ca3af', '#7c2d12', '#e0b354', '#9f1239', '#2563eb', '#db2777'];

export type HairStyle = 'bald' | 'low' | 'fade' | 'dreads' | 'afro' | 'braids' | 'bun' | 'cornrows' | 'curls' | 'mohawk' | 'puffs' | 'ponytail';
export const HAIRS: { id: HairStyle; label: string; body?: Body }[] = [
  { id: 'low', label: 'Low cut' },
  { id: 'fade', label: 'Fade', body: 'm' },
  { id: 'bald', label: 'Bald' },
  { id: 'dreads', label: 'Dreads' },
  { id: 'afro', label: 'Afro' },
  { id: 'braids', label: 'Braids', body: 'f' },
  { id: 'bun', label: 'Bun', body: 'f' },
  { id: 'cornrows', label: 'Cornrows' },
  { id: 'curls', label: 'Curls' },
  { id: 'mohawk', label: 'Mohawk' },
  { id: 'puffs', label: 'Afro puffs', body: 'f' },
  { id: 'ponytail', label: 'Ponytail', body: 'f' },
];

/** How a piece is drawn. Tops change torso/arms, bottoms the legs, and so on (see Person.tsx). */
export type Shape =
  // tops
  | 'tee' | 'polo' | 'shirt' | 'jersey' | 'kaftan' | 'agbada' | 'suit' | 'blouse' | 'dress' | 'abaya' | 'hoodie' | 'tank' | 'bomber' | 'senator'
  // bottoms
  | 'trousers' | 'jeans' | 'shorts' | 'skirt' | 'wrapper' | 'cargo' | 'joggers' | 'bermuda' | 'pleated'
  // shoes
  | 'slippers' | 'sneakers' | 'loafers' | 'heels' | 'boots'
  // head
  | 'cap' | 'zanna' | 'fila' | 'gele' | 'hijab' | 'beanie' | 'turban' | 'bucket' | 'snapback' | 'durag' | 'headtie'
  // eyes / neck / wrist
  | 'glasses' | 'shades' | 'round' | 'aviator' | 'cateye' | 'sport' | 'chain' | 'beads' | 'watch'
  // bags
  | 'handbag' | 'clutch' | 'backpack' | 'crossbody' | 'tote' | 'satchel';

/** Fabric print drawn over the whole garment, in its accent colour. */
export type Pattern = 'stripes' | 'checks' | 'ankara' | 'dots' | 'camo' | 'kente' | 'pinstripe' | 'tiedye';

export interface Garment {
  id: string;
  slot: Slot;
  name: string;
  shape: Shape;
  color: string;
  /** Second colour: pattern, trim, embroidery. */
  accent?: string;
  pattern?: Pattern;
  price: number;
  /** Limit to one body; omit for unisex. */
  body?: Body;
  /** Where it's sold. */
  shops: ShopId[];
}

export type ShopId = 'boutique' | 'market' | 'mall';
export const SHOPS: Record<ShopId, { name: string; blurb: string }> = {
  boutique: { name: 'Malali Boutique', blurb: 'Designer pieces for people wey get money.' },
  market: { name: 'Central Market Stalls', blurb: 'Okrika, ankara and tailor-made. Haggle well.' },
  mall: { name: 'KD Mall Fashion', blurb: 'Brand-new, price tag still dey.' },
};

const g = (id: string, slot: Slot, name: string, shape: Shape, color: string, price: number, shops: ShopId[], extra: Partial<Garment> = {}): Garment => ({
  id, slot, name, shape, color, price, shops, ...extra,
});

export const GARMENTS: Garment[] = [
  // Starter pieces: everyone owns these.
  g('tee_white', 'top', 'Plain white tee', 'tee', '#f8fafc', 2_000, ['market']),
  g('blouse_yellow', 'top', 'Yellow blouse', 'blouse', '#facc15', 3_000, ['market'], { body: 'f' }),
  g('jeans_blue', 'bottom', 'Blue jeans', 'jeans', '#1e3a8a', 4_000, ['market', 'mall']),
  g('skirt_navy', 'bottom', 'Navy skirt', 'skirt', '#1e293b', 3_500, ['market'], { body: 'f' }),
  g('slippers_black', 'shoes', 'Black slippers', 'slippers', '#1f2937', 1_000, ['market']),

  // Market: cheap, local
  g('tee_green', 'top', 'Super Eagles green tee', 'tee', '#15803d', 2_500, ['market']),
  g('jersey_kdu', 'top', 'Kaduna United jersey', 'jersey', '#dc2626', 6_000, ['market', 'mall'], { accent: '#fde047' }),
  g('kaftan_white', 'top', 'White kaftan', 'kaftan', '#f1f5f9', 12_000, ['market'], { accent: '#cbd5e1', body: 'm' }),
  g('kaftan_brown', 'top', 'Brown kaftan', 'kaftan', '#78350f', 14_000, ['market'], { accent: '#d97706', body: 'm' }),
  g('ankara_dress', 'top', 'Ankara dress', 'dress', '#ea580c', 15_000, ['market'], { accent: '#1d4ed8', body: 'f' }),
  g('abaya_black', 'top', 'Black abaya', 'abaya', '#111827', 18_000, ['market', 'boutique'], { accent: '#a16207', body: 'f' }),
  g('wrapper_ankara', 'bottom', 'Ankara wrapper', 'wrapper', '#7c3aed', 6_000, ['market'], { accent: '#f59e0b', body: 'f' }),
  g('shorts_khaki', 'bottom', 'Khaki shorts', 'shorts', '#a8a29e', 3_000, ['market']),
  g('trousers_black', 'bottom', 'Black trousers', 'trousers', '#111827', 5_000, ['market', 'mall']),
  g('slippers_palm', 'shoes', 'Leather palm slippers', 'slippers', '#92400e', 4_000, ['market']),
  g('zanna_cap', 'head', 'Zanna cap', 'zanna', '#f8fafc', 3_000, ['market'], { accent: '#b91c1c', body: 'm' }),
  g('fila_red', 'head', 'Fila cap', 'fila', '#991b1b', 3_500, ['market'], { body: 'm' }),
  g('hijab_cream', 'head', 'Cream hijab', 'hijab', '#f5f5dc', 4_000, ['market', 'mall'], { body: 'f' }),
  g('gele_gold', 'head', 'Gold gele', 'gele', '#eab308', 9_000, ['market', 'boutique'], { body: 'f' }),
  g('beads_coral', 'neck', 'Coral beads', 'beads', '#ef4444', 8_000, ['market', 'boutique']),

  // Mall: brand-new, mid-range
  g('polo_navy', 'top', 'Navy polo', 'polo', '#1e3a8a', 9_000, ['mall'], { accent: '#f8fafc' }),
  g('shirt_check', 'top', 'Checked shirt', 'shirt', '#0f766e', 11_000, ['mall'], { accent: '#f8fafc' }),
  g('hoodie_grey', 'top', 'Grey hoodie', 'hoodie', '#6b7280', 15_000, ['mall']),
  g('jeans_black', 'bottom', 'Black skinny jeans', 'jeans', '#0f172a', 9_000, ['mall']),
  g('sneakers_white', 'shoes', 'White sneakers', 'sneakers', '#f8fafc', 25_000, ['mall'], { accent: '#ef4444' }),
  g('sneakers_red', 'shoes', 'Red runners', 'sneakers', '#dc2626', 22_000, ['mall'], { accent: '#f8fafc' }),
  g('cap_black', 'head', 'Black face cap', 'cap', '#111827', 4_000, ['mall', 'market']),
  g('beanie_orange', 'head', 'Orange beanie', 'beanie', '#ea580c', 5_000, ['mall']),
  g('glasses_reading', 'eyes', 'Reading glasses', 'glasses', '#1f2937', 6_000, ['mall', 'market']),
  g('shades_black', 'eyes', 'Black shades', 'shades', '#0f172a', 9_000, ['mall', 'boutique']),
  g('watch_steel', 'wrist', 'Steel watch', 'watch', '#9ca3af', 18_000, ['mall']),

  // Boutique: big money
  g('agbada_royal', 'top', 'Royal blue agbada', 'agbada', '#1d4ed8', 120_000, ['boutique'], { accent: '#fbbf24', body: 'm' }),
  g('agbada_white', 'top', 'Wedding white agbada', 'agbada', '#f8fafc', 150_000, ['boutique'], { accent: '#d4af37', body: 'm' }),
  g('suit_black', 'top', 'Black suit', 'suit', '#111827', 180_000, ['boutique'], { accent: '#f8fafc' }),
  g('suit_cream', 'top', 'Cream linen suit', 'suit', '#e7dcc6', 160_000, ['boutique'], { accent: '#1e3a8a' }),
  g('gown_lace', 'top', 'Emerald lace gown', 'dress', '#047857', 140_000, ['boutique'], { accent: '#fde68a', body: 'f' }),
  g('gown_red', 'top', 'Red owambe gown', 'dress', '#be123c', 110_000, ['boutique'], { accent: '#fcd34d', body: 'f' }),
  g('trousers_white', 'bottom', 'White linen trousers', 'trousers', '#f8fafc', 35_000, ['boutique']),
  g('loafers_brown', 'shoes', 'Italian loafers', 'loafers', '#78350f', 85_000, ['boutique']),
  g('heels_gold', 'shoes', 'Gold heels', 'heels', '#d4af37', 70_000, ['boutique'], { body: 'f' }),
  g('boots_tan', 'shoes', 'Tan boots', 'boots', '#a16207', 60_000, ['boutique', 'mall']),
  g('turban_white', 'head', 'Emir-style turban', 'turban', '#f8fafc', 45_000, ['boutique'], { body: 'm' }),
  g('chain_gold', 'neck', 'Gold chain', 'chain', '#d4af37', 250_000, ['boutique']),
  g('watch_gold', 'wrist', 'Gold Rolex (no be fake)', 'watch', '#d4af37', 900_000, ['boutique']),

  // More tops
  g('tank_black', 'top', 'Black tank top', 'tank', '#111827', 2_500, ['market', 'mall']),
  g('tank_white', 'top', 'White singlet', 'tank', '#f8fafc', 1_500, ['market']),
  g('tee_stripe', 'top', 'Striped tee', 'tee', '#f8fafc', 4_500, ['market', 'mall'], { accent: '#1e3a8a', pattern: 'stripes' }),
  g('tee_tiedye', 'top', 'Tie-dye tee', 'tee', '#a78bfa', 5_500, ['market'], { accent: '#38bdf8', pattern: 'tiedye' }),
  g('tee_camo', 'top', 'Army camo tee', 'tee', '#4d5a32', 5_000, ['market'], { accent: '#2b3319', pattern: 'camo' }),
  g('polo_stripe', 'top', 'Striped polo', 'polo', '#be123c', 10_000, ['mall'], { accent: '#f8fafc', pattern: 'stripes' }),
  g('shirt_plaid', 'top', 'Red plaid shirt', 'shirt', '#b91c1c', 12_000, ['mall'], { accent: '#111827', pattern: 'checks' }),
  g('shirt_denim', 'top', 'Denim shirt', 'shirt', '#3b6aa8', 13_000, ['mall'], { accent: '#e2e8f0' }),
  g('shirt_pin', 'top', 'Pinstripe shirt', 'shirt', '#e2e8f0', 16_000, ['mall', 'boutique'], { accent: '#1e293b', pattern: 'pinstripe' }),
  g('hoodie_black', 'top', 'Black hoodie', 'hoodie', '#111827', 16_000, ['mall']),
  g('hoodie_camo', 'top', 'Camo hoodie', 'hoodie', '#4d5a32', 18_000, ['mall'], { accent: '#2b3319', pattern: 'camo' }),
  g('bomber_green', 'top', 'Olive bomber jacket', 'bomber', '#4d5a32', 28_000, ['mall']),
  g('bomber_black', 'top', 'Black bomber jacket', 'bomber', '#111827', 30_000, ['mall', 'boutique'], { accent: '#dc2626' }),
  g('jersey_arsenal', 'top', 'Gunners jersey', 'jersey', '#dc2626', 8_000, ['market', 'mall'], { accent: '#f8fafc' }),
  g('jersey_eagles', 'top', 'Super Eagles jersey', 'jersey', '#15803d', 9_000, ['market', 'mall'], { accent: '#f8fafc', pattern: 'stripes' }),
  g('blouse_ankara', 'top', 'Ankara peplum blouse', 'blouse', '#f97316', 9_000, ['market'], { accent: '#1d4ed8', pattern: 'ankara', body: 'f' }),
  g('blouse_white', 'top', 'White lace blouse', 'blouse', '#f8fafc', 8_000, ['market', 'mall'], { accent: '#e2e8f0', body: 'f' }),
  g('blouse_pink', 'top', 'Pink satin blouse', 'blouse', '#f472b6', 12_000, ['mall'], { body: 'f' }),
  g('kaftan_ankara', 'top', 'Ankara kaftan', 'kaftan', '#0f766e', 20_000, ['market'], { accent: '#facc15', pattern: 'ankara' }),
  g('kaftan_navy', 'top', 'Navy kaftan', 'kaftan', '#1e293b', 16_000, ['market', 'boutique'], { accent: '#94a3b8', body: 'm' }),
  g('senator_grey', 'top', 'Grey senator wear', 'senator', '#6b7280', 40_000, ['market', 'boutique'], { accent: '#e5e7eb', body: 'm' }),
  g('senator_wine', 'top', 'Wine senator wear', 'senator', '#7f1d1d', 45_000, ['boutique'], { accent: '#fcd34d', body: 'm' }),
  g('dress_ankara_blue', 'top', 'Blue ankara gown', 'dress', '#1d4ed8', 22_000, ['market'], { accent: '#fde047', pattern: 'ankara', body: 'f' }),
  g('dress_kente', 'top', 'Kente wrap dress', 'dress', '#dc2626', 35_000, ['market', 'boutique'], { accent: '#16a34a', pattern: 'kente', body: 'f' }),
  g('dress_polka', 'top', 'Polka dot dress', 'dress', '#f8fafc', 18_000, ['mall'], { accent: '#111827', pattern: 'dots', body: 'f' }),
  g('dress_black', 'top', 'Little black dress', 'dress', '#0f172a', 30_000, ['mall', 'boutique'], { body: 'f' }),
  g('abaya_navy', 'top', 'Navy abaya', 'abaya', '#1e3a8a', 20_000, ['market', 'boutique'], { accent: '#e2e8f0', body: 'f' }),
  g('abaya_cream', 'top', 'Cream abaya', 'abaya', '#e7dcc6', 22_000, ['boutique'], { accent: '#a16207', body: 'f' }),
  g('agbada_green', 'top', 'Emerald agbada', 'agbada', '#065f46', 130_000, ['boutique'], { accent: '#fde68a', body: 'm' }),
  g('agbada_kente', 'top', 'Kente agbada', 'agbada', '#b91c1c', 160_000, ['boutique'], { accent: '#facc15', pattern: 'kente', body: 'm' }),
  g('suit_navy', 'top', 'Navy pinstripe suit', 'suit', '#1e293b', 200_000, ['boutique'], { accent: '#f8fafc', pattern: 'pinstripe' }),
  g('suit_grey', 'top', 'Charcoal suit', 'suit', '#374151', 170_000, ['boutique'], { accent: '#f8fafc' }),

  // More bottoms
  g('jeans_light', 'bottom', 'Light wash jeans', 'jeans', '#6b8fc7', 8_000, ['market', 'mall']),
  g('jeans_ripped', 'bottom', 'Ripped jeans', 'jeans', '#334155', 11_000, ['mall'], { accent: '#94a3b8' }),
  g('cargo_khaki', 'bottom', 'Khaki cargo pants', 'cargo', '#a8956a', 9_500, ['market', 'mall']),
  g('cargo_camo', 'bottom', 'Camo cargo pants', 'cargo', '#4d5a32', 11_000, ['mall'], { accent: '#2b3319', pattern: 'camo' }),
  g('joggers_grey', 'bottom', 'Grey joggers', 'joggers', '#6b7280', 7_000, ['market', 'mall']),
  g('joggers_black', 'bottom', 'Black joggers', 'joggers', '#111827', 7_500, ['mall'], { accent: '#f8fafc', pattern: 'stripes' }),
  g('chinos_beige', 'bottom', 'Beige chinos', 'trousers', '#d6c7a1', 10_000, ['mall']),
  g('trousers_check', 'bottom', 'Checked trousers', 'trousers', '#334155', 14_000, ['mall', 'boutique'], { accent: '#94a3b8', pattern: 'checks' }),
  g('trousers_pin', 'bottom', 'Pinstripe trousers', 'trousers', '#1e293b', 25_000, ['boutique'], { accent: '#cbd5e1', pattern: 'pinstripe' }),
  g('trousers_ankara', 'bottom', 'Ankara trousers', 'trousers', '#0e7490', 12_000, ['market'], { accent: '#fbbf24', pattern: 'ankara' }),
  g('shorts_denim', 'bottom', 'Denim shorts', 'shorts', '#3b6aa8', 4_500, ['market', 'mall']),
  g('shorts_ankara', 'bottom', 'Ankara shorts', 'shorts', '#dc2626', 5_000, ['market'], { accent: '#fde047', pattern: 'ankara' }),
  g('bermuda_navy', 'bottom', 'Navy bermudas', 'bermuda', '#1e3a8a', 6_000, ['mall']),
  g('skirt_ankara', 'bottom', 'Ankara skirt', 'skirt', '#7c3aed', 8_000, ['market'], { accent: '#fbbf24', pattern: 'ankara', body: 'f' }),
  g('skirt_pleated', 'bottom', 'Pleated skirt', 'pleated', '#be185d', 9_000, ['mall'], { accent: '#fbcfe8', body: 'f' }),
  g('skirt_plaid', 'bottom', 'Plaid skirt', 'skirt', '#166534', 8_500, ['mall'], { accent: '#fde047', pattern: 'checks', body: 'f' }),
  g('skirt_denim', 'bottom', 'Denim skirt', 'skirt', '#3b6aa8', 7_000, ['market', 'mall'], { body: 'f' }),
  g('wrapper_kente', 'bottom', 'Kente wrapper', 'wrapper', '#b91c1c', 14_000, ['market', 'boutique'], { accent: '#16a34a', pattern: 'kente', body: 'f' }),
  g('wrapper_adire', 'bottom', 'Adire tie-dye wrapper', 'wrapper', '#1e3a8a', 10_000, ['market'], { accent: '#e2e8f0', pattern: 'tiedye', body: 'f' }),
  g('wrapper_green', 'bottom', 'Green ankara wrapper', 'wrapper', '#15803d', 7_500, ['market'], { accent: '#fde047', pattern: 'ankara', body: 'f' }),

  // More shoes
  g('sneakers_black', 'shoes', 'Black sneakers', 'sneakers', '#111827', 24_000, ['mall'], { accent: '#f8fafc' }),
  g('sneakers_blue', 'shoes', 'Royal blue kicks', 'sneakers', '#1d4ed8', 27_000, ['mall'], { accent: '#fde047' }),
  g('loafers_black', 'shoes', 'Black oxford shoes', 'loafers', '#111827', 45_000, ['mall', 'boutique']),
  g('heels_red', 'shoes', 'Red heels', 'heels', '#be123c', 40_000, ['mall', 'boutique'], { body: 'f' }),
  g('heels_nude', 'shoes', 'Nude block heels', 'heels', '#d6b89a', 30_000, ['mall'], { body: 'f' }),
  g('boots_black', 'shoes', 'Black combat boots', 'boots', '#111827', 38_000, ['mall']),
  g('slippers_pink', 'shoes', 'Pink sandals', 'slippers', '#f472b6', 3_500, ['market'], { body: 'f' }),

  // More headwear
  g('cap_white', 'head', 'White face cap', 'cap', '#f8fafc', 4_000, ['mall', 'market']),
  g('cap_red', 'head', 'Red face cap', 'cap', '#dc2626', 4_000, ['mall', 'market']),
  g('cap_camo', 'head', 'Camo cap', 'cap', '#4d5a32', 5_000, ['market'], { accent: '#2b3319', pattern: 'camo' }),
  g('snapback_black', 'head', 'Black snapback', 'snapback', '#111827', 7_000, ['mall'], { accent: '#fde047' }),
  g('snapback_green', 'head', 'Naija green snapback', 'snapback', '#15803d', 7_000, ['mall', 'market'], { accent: '#f8fafc' }),
  g('bucket_khaki', 'head', 'Khaki bucket hat', 'bucket', '#c2b280', 6_000, ['mall', 'market']),
  g('bucket_ankara', 'head', 'Ankara bucket hat', 'bucket', '#ea580c', 6_500, ['market'], { accent: '#1d4ed8', pattern: 'ankara' }),
  g('beanie_black', 'head', 'Black beanie', 'beanie', '#111827', 4_500, ['mall']),
  g('durag_black', 'head', 'Black durag', 'durag', '#111827', 1_500, ['market'], { body: 'm' }),
  g('durag_blue', 'head', 'Navy silk durag', 'durag', '#1e3a8a', 2_000, ['market'], { body: 'm' }),
  g('zanna_blue', 'head', 'Blue zanna cap', 'zanna', '#1d4ed8', 3_500, ['market'], { accent: '#fde047', body: 'm' }),
  g('fila_green', 'head', 'Green fila cap', 'fila', '#166534', 3_500, ['market'], { body: 'm' }),
  g('fila_kente', 'head', 'Kente fila cap', 'fila', '#b91c1c', 6_000, ['market'], { accent: '#16a34a', pattern: 'kente', body: 'm' }),
  g('headtie_ankara', 'head', 'Ankara head tie', 'headtie', '#ea580c', 3_500, ['market'], { accent: '#1d4ed8', pattern: 'ankara', body: 'f' }),
  g('gele_pink', 'head', 'Pink gele', 'gele', '#ec4899', 9_000, ['market', 'boutique'], { body: 'f' }),
  g('gele_teal', 'head', 'Teal gele', 'gele', '#0f766e', 9_000, ['market'], { body: 'f' }),
  g('hijab_black', 'head', 'Black hijab', 'hijab', '#111827', 4_000, ['market', 'mall'], { body: 'f' }),
  g('hijab_navy', 'head', 'Navy hijab', 'hijab', '#1e3a8a', 4_000, ['market', 'mall'], { body: 'f' }),
  g('turban_cream', 'head', 'Cream turban', 'turban', '#e7dcc6', 40_000, ['boutique'], { body: 'm' }),

  // Eyes, necks, wrists
  g('shades_gold', 'eyes', 'Gold-frame shades', 'shades', '#d4af37', 22_000, ['boutique']),
  g('glasses_round', 'eyes', 'Round specs', 'round', '#a16207', 8_000, ['mall']),
  g('glasses_round_black', 'eyes', 'Black round specs', 'round', '#111827', 5_000, ['market', 'mall']),
  g('glasses_round_gold', 'eyes', 'Gold round specs', 'round', '#d4af37', 10_000, ['market', 'boutique']),
  g('glasses_blue', 'eyes', 'Blue-frame glasses', 'glasses', '#2563eb', 5_000, ['market']),
  g('glasses_cateye', 'eyes', 'Red cat-eye glasses', 'cateye', '#be123c', 9_000, ['market', 'mall'], { body: 'f' }),
  g('glasses_cateye_black', 'eyes', 'Black cat-eye glasses', 'cateye', '#111827', 9_000, ['mall'], { body: 'f' }),
  g('shades_okrika', 'eyes', 'Okrika shades', 'shades', '#1f2937', 3_000, ['market']),
  g('shades_aviator', 'eyes', 'Gold aviators', 'aviator', '#d4af37', 12_000, ['market', 'mall']),
  g('shades_aviator_silver', 'eyes', 'Silver aviators', 'aviator', '#cbd5e1', 14_000, ['mall']),
  g('shades_sport_red', 'eyes', 'Red sport shades', 'sport', '#dc2626', 7_000, ['market']),
  g('shades_sport_white', 'eyes', 'White sport shades', 'sport', '#f8fafc', 7_500, ['market', 'mall']),
  g('chain_silver', 'neck', 'Silver chain', 'chain', '#cbd5e1', 60_000, ['mall', 'boutique']),
  g('beads_blue', 'neck', 'Blue beads', 'beads', '#2563eb', 7_000, ['market']),
  g('beads_gold', 'neck', 'Gold beads', 'beads', '#eab308', 10_000, ['market', 'boutique']),
  g('watch_black', 'wrist', 'Black digital watch', 'watch', '#111827', 8_000, ['market', 'mall']),
  g('watch_silver', 'wrist', 'Silver wristwatch', 'watch', '#cbd5e1', 120_000, ['boutique']),

  // Bags
  g('bag_clutch_gold', 'bag', 'Gold clutch', 'clutch', '#d4af37', 25_000, ['mall', 'boutique'], { body: 'f' }),
  g('bag_clutch_black', 'bag', 'Black clutch', 'clutch', '#111827', 15_000, ['mall'], { body: 'f' }),
  g('bag_hand_red', 'bag', 'Red handbag', 'handbag', '#dc2626', 30_000, ['mall'], { body: 'f' }),
  g('bag_hand_tan', 'bag', 'Tan leather handbag', 'handbag', '#a16207', 45_000, ['mall', 'boutique'], { body: 'f' }),
  g('bag_hand_ankara', 'bag', 'Ankara handbag', 'handbag', '#ea580c', 14_000, ['market'], { accent: '#1d4ed8', pattern: 'ankara', body: 'f' }),
  g('bag_hand_designer', 'bag', 'Designer handbag', 'handbag', '#f5f5dc', 450_000, ['boutique'], { accent: '#92400e', pattern: 'checks', body: 'f' }),
  g('bag_tote_canvas', 'bag', 'Canvas tote', 'tote', '#e7dcc6', 6_000, ['market', 'mall']),
  g('bag_tote_black', 'bag', 'Black tote bag', 'tote', '#111827', 20_000, ['mall'], { body: 'f' }),
  g('bag_cross_black', 'bag', 'Black crossbody bag', 'crossbody', '#111827', 12_000, ['market', 'mall']),
  g('bag_cross_brown', 'bag', 'Brown crossbody bag', 'crossbody', '#78350f', 14_000, ['market', 'mall']),
  g('bag_back_black', 'bag', 'Black backpack', 'backpack', '#111827', 15_000, ['market', 'mall']),
  g('bag_back_blue', 'bag', 'Blue school backpack', 'backpack', '#1d4ed8', 9_000, ['market']),
  g('bag_back_camo', 'bag', 'Camo backpack', 'backpack', '#4d5a32', 12_000, ['market'], { accent: '#2b3319', pattern: 'camo' }),
  g('bag_satchel', 'bag', 'Leather satchel', 'satchel', '#78350f', 55_000, ['boutique', 'mall'], { body: 'm' }),
  g('bag_satchel_black', 'bag', 'Black office satchel', 'satchel', '#111827', 40_000, ['mall'], { body: 'm' }),
];

export const GARMENT_BY_ID: Record<string, Garment> = Object.fromEntries(GARMENTS.map((x) => [x.id, x]));

export const fits = (gm: Garment, body: Body) => !gm.body || gm.body === body;

export type Outfit = Partial<Record<Slot, string>>;

export interface Appearance {
  body: Body;
  skin: number;
  hair: HairStyle;
  hairColor: number;
  outfit: Outfit;
}

export const STARTER_WARDROBE = ['tee_white', 'blouse_yellow', 'jeans_blue', 'skirt_navy', 'slippers_black'];

export function defaultAppearance(body: Body = 'm'): Appearance {
  return body === 'm'
    ? { body, skin: 3, hair: 'low', hairColor: 0, outfit: { top: 'tee_white', bottom: 'jeans_blue', shoes: 'slippers_black' } }
    : { body, skin: 3, hair: 'braids', hairColor: 0, outfit: { top: 'blouse_yellow', bottom: 'skirt_navy', shoes: 'slippers_black' } };
}

/**
 * `look` string: "p1|m|3|low|0|tee_white,jeans_blue,...". Old saves used GLB ids like
 * "man-casual"; those (and anything unreadable) become the default man.
 */
export function encodeLook(a: Appearance): string {
  const items = SLOTS.map((s) => a.outfit[s.id]).filter(Boolean);
  return ['p1', a.body, a.skin, a.hair, a.hairColor, items.join(',')].join('|');
}

export function decodeLook(look: string | undefined | null): Appearance {
  const parts = (look ?? '').split('|');
  if (parts[0] !== 'p1') return defaultAppearance(look?.startsWith('woman') ? 'f' : 'm');
  const body: Body = parts[1] === 'f' ? 'f' : 'm';
  const skin = Math.min(SKINS.length - 1, Math.max(0, Number(parts[2]) | 0));
  const hair = (HAIRS.find((h) => h.id === parts[3])?.id ?? 'low') as HairStyle;
  const hairColor = Math.min(HAIR_COLORS.length - 1, Math.max(0, Number(parts[4]) | 0));
  const outfit: Outfit = {};
  for (const id of (parts[5] ?? '').split(',')) {
    const gm = GARMENT_BY_ID[id];
    if (gm && fits(gm, body)) outfit[gm.slot] = gm.id;
  }
  return { body, skin, hair, hairColor, outfit };
}

/** Dresses and abayas are full outfits: no separate bottom is worn with them. */
export const isFullOutfit = (top?: string) => {
  const s = top ? GARMENT_BY_ID[top]?.shape : undefined;
  return s === 'dress' || s === 'abaya';
};

/** Black, white, grey, khaki, navy and denim: plain colours that go with anything. */
function isNeutral(gm: Garment): boolean {
  if (gm.pattern) return false;
  const n = parseInt(gm.color.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  if (sat < 0.4 || light < 0.2 || light > 0.9) return true;
  const blue = b === max && g >= r;
  return blue && (light < 0.36 || sat < 0.55);
}

const CASUAL_TOPS = new Set<Shape>(['tee', 'tank', 'jersey', 'polo', 'shirt', 'hoodie', 'bomber']);
const NATIVE_TOPS = new Set<Shape>(['kaftan', 'senator', 'agbada']);
/** Which tops each kind of headwear goes with; anything not listed goes with casual tops. */
const HEAD_GOES_WITH: Partial<Record<Shape, (top: Shape) => boolean>> = {
  zanna: (top) => NATIVE_TOPS.has(top),
  fila: (top) => NATIVE_TOPS.has(top),
  turban: (top) => NATIVE_TOPS.has(top),
  hijab: (top) => top === 'abaya' || top === 'dress' || top === 'kaftan',
  gele: (top) => top === 'dress' || top === 'blouse',
  headtie: (top) => top === 'dress' || top === 'blouse',
};
/** What a new person may start in, free on the create-your-person screen: anything cheap from the market or the mall. */
export const starterGarments = (body: Body) => GARMENTS.filter((g) => (g.shops.includes('market') || g.shops.includes('mall')) && g.price <= 30_000 && fits(g, body));

/** What each kind of piece is called where you choose one by kind and then by colour. Tops are named for the style they make. */
export const SHAPE_LABELS: Record<Shape, string> = {
  tee: 'Casual', tank: 'Chill', jersey: 'Match day', polo: 'Polo', shirt: 'Office', hoodie: 'Hoodie', bomber: 'Jacket', blouse: 'Blouse',
  kaftan: 'Native', senator: 'Senator', agbada: 'Agbada', suit: 'Suit', dress: 'Gown', abaya: 'Abaya',
  jeans: 'Jeans', trousers: 'Trousers', shorts: 'Shorts', bermuda: 'Bermudas', cargo: 'Cargo', joggers: 'Joggers', skirt: 'Skirt', pleated: 'Pleated skirt', wrapper: 'Wrapper',
  slippers: 'Slippers', sneakers: 'Sneakers', loafers: 'Shoes', heels: 'Heels', boots: 'Boots',
  cap: 'Face cap', snapback: 'Snapback', bucket: 'Bucket hat', beanie: 'Beanie', durag: 'Durag', zanna: 'Zanna', fila: 'Fila', turban: 'Turban', hijab: 'Hijab', gele: 'Gele', headtie: 'Head tie',
  glasses: 'Glasses', round: 'Round specs', cateye: 'Cat-eye', shades: 'Shades', aviator: 'Aviators', sport: 'Sport shades',
  chain: 'Chain', beads: 'Beads', watch: 'Watch',
  handbag: 'Handbag', clutch: 'Clutch', tote: 'Tote', crossbody: 'Crossbody', backpack: 'Backpack', satchel: 'Satchel',
};

// Darker skin and black hair are the most common; grey and dyed hair are rare.
const SKIN_ODDS = [0.04, 0.1, 0.22, 0.28, 0.22, 0.14];
const HAIR_COLOR_ODDS = [0.6, 0.2, 0.09, 0.02, 0.03, 0.02, 0.01, 0.01, 0.01, 0.01];

/** A random person in cheap clothes that go together: one loud piece at most, and headwear that suits the top. */
export function randomAppearance(random = Math.random): Appearance {
  const pick = <T,>(items: T[]): T | undefined => items[Math.floor(random() * items.length)];
  const weighted = (odds: number[]) => {
    let roll = random();
    const i = odds.findIndex((p) => (roll -= p) < 0);
    return i < 0 ? odds.length - 1 : i;
  };
  const body: Body = random() < 0.5 ? 'm' : 'f';
  const outfit: Outfit = {};
  const starterClothes = starterGarments(body);
  const inSlot = (slot: Slot) => starterClothes.filter((g) => g.slot === slot);

  const top = pick(inSlot('top'))!;
  outfit.top = top.id;
  const native = NATIVE_TOPS.has(top.shape);
  let bottom: Garment | undefined;
  if (!isFullOutfit(top.id)) {
    const bottoms = inSlot('bottom');
    // A kaftan goes over plain trousers; a bright or printed top needs a plain bottom.
    const matching = bottoms.filter((g) => (native ? isNeutral(g) && (g.shape === 'trousers' || g.shape === 'jeans') : isNeutral(top) || isNeutral(g)));
    bottom = pick(matching.length ? matching : bottoms);
    if (bottom) outfit.bottom = bottom.id;
  }
  const shoes = pick(inSlot('shoes'));
  if (shoes) outfit.shoes = shoes.id;

  // Accessories: a few, and never a second print on top of a printed outfit.
  const printed = !!top.pattern || !!bottom?.pattern;
  const extras = (slot: Slot) => inSlot(slot).filter((g) => !(printed && g.pattern));
  const hats = extras('head').filter((g) => (HEAD_GOES_WITH[g.shape] ?? ((shape: Shape) => CASUAL_TOPS.has(shape)))(top.shape));
  const hat = random() < (top.shape === 'abaya' ? 0.8 : native ? 0.5 : 0.3) ? pick(hats) : undefined;
  if (hat) outfit.head = hat.id;
  const odds: [Slot, number][] = [['eyes', 0.15], ['neck', 0.15], ['wrist', 0.3], ['bag', 0.22]];
  for (const [slot, chance] of odds) {
    const item = random() < chance ? pick(extras(slot)) : undefined;
    if (item) outfit[slot] = item.id;
  }

  return {
    body,
    skin: weighted(SKIN_ODDS),
    hair: pick(HAIRS.filter((h) => !h.body || h.body === body))!.id,
    hairColor: weighted(HAIR_COLOR_ODDS),
    outfit,
  };
}
