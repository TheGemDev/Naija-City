// Phones you can own. The one in your hand changes how the in-game phone looks; better phones are worth more.

export type PhoneOS = 'ios' | 'android';
export type PhoneTier = 'budget' | 'mid' | 'flagship' | 'fold';
/** Home-screen wallpaper design. 'hills' follows the time of day; the rest take the phone's own colours ('dunes': sky → sand → mountains). */
export type WallKind = 'hills' | 'waves' | 'blobs' | 'bloom' | 'shapes' | 'rings' | 'dunes';

/** What is cut out of the top of the screen for the front camera: the old iPhone notch, the Dynamic Island, a punch hole, or a waterdrop. */
export type Cutout = 'notch' | 'notch-wide' | 'island' | 'island-small' | 'punch' | 'drop';
/** How you get home: a swipe bar along the bottom, or Android's three buttons (Samsung keeps Back on the right). */
export type NavStyle = 'bar' | 'buttons' | 'buttons-samsung';

export interface PhoneDef {
  id: string;
  name: string;
  brand: string;
  os: PhoneOS;
  tier: PhoneTier;
  price: number;
  /** Frame gradient, light → dark. */
  frame: [string, string];
  /** Stock wallpaper: design + three colours (sky → mid → accent). */
  wall: { kind: WallKind; colors: [string, string, string] };
  /** Left out, an iPhone has the Dynamic Island and an Android a punch hole. */
  cutout?: Cutout;
  /** Left out, it is what the maker ships: see navOf. */
  nav?: NavStyle;
  /** The black border round the screen: 'thick' all round (LCD iPhones), or a 'chin' under it (cheap Androids). Thin when left out. */
  bezel?: 'thick' | 'chin';
  /** Folds shut top to bottom: a tall, narrow screen with the crease across the middle. */
  flip?: boolean;
  /** Opens wide like a book (bigger screen). */
  fold?: boolean;
  /** The iPhone Duo: a squat cover screen that opens into a landscape one, with iOS's controls in a rail down the right edge (ui/Phone.tsx). */
  duo?: boolean;
  blurb: string;
}

export const PHONES: PhoneDef[] = [
  // Budget
  { id: 'itel_a70', name: 'itel A70', brand: 'itel', os: 'android', tier: 'budget', price: 95_000, frame: ['#93c5fd', '#1e3a8a'], wall: { kind: 'hills', colors: ['#0ea5e9', '#7dd3fc', '#15803d'] }, cutout: 'drop', bezel: 'chin', blurb: 'Battery wey no dey die. Calls, WhatsApp, finish.' },
  { id: 'tecno_spark', name: 'Tecno Spark 30', brand: 'Tecno', os: 'android', tier: 'budget', price: 210_000, frame: ['#a5b4fc', '#312e81'], wall: { kind: 'waves', colors: ['#1e1b4b', '#6366f1', '#22d3ee'] }, bezel: 'chin', blurb: 'The people’s phone. Big screen, fine camera, small money.' },
  { id: 'infinix_hot', name: 'Infinix Hot 50', brand: 'Infinix', os: 'android', tier: 'budget', price: 260_000, frame: ['#86efac', '#14532d'], wall: { kind: 'waves', colors: ['#052e16', '#16a34a', '#a3e635'] }, bezel: 'chin', blurb: 'Slim, fast charging, and e dey play games well.' },
  { id: 'galaxy_a16', name: 'Samsung Galaxy A16', brand: 'Samsung', os: 'android', tier: 'budget', price: 300_000, frame: ['#cbd5e1', '#334155'], wall: { kind: 'blobs', colors: ['#0f172a', '#475569', '#38bdf8'] }, cutout: 'drop', bezel: 'chin', blurb: 'Samsung quality without Samsung wahala price.' },
  { id: 'redmi_note', name: 'Redmi Note 14', brand: 'Xiaomi', os: 'android', tier: 'budget', price: 380_000, frame: ['#c4b5fd', '#4c1d95'], wall: { kind: 'rings', colors: ['#2e1065', '#7c3aed', '#f0abfc'] }, blurb: 'Big specs for the price. Banex boys swear by am.' },
  { id: 'iphone_xr', name: 'iPhone XR (UK used)', brand: 'Apple', os: 'ios', tier: 'budget', price: 320_000, frame: ['#fca5a5', '#991b1b'], wall: { kind: 'bloom', colors: ['#450a0a', '#dc2626', '#fecaca'] }, cutout: 'notch-wide', bezel: 'thick', blurb: 'London used. Battery health 79%, but na iPhone.' },
  // Mid range
  { id: 'galaxy_a56', name: 'Samsung Galaxy A56', brand: 'Samsung', os: 'android', tier: 'mid', price: 750_000, frame: ['#fbcfe8', '#831843'], wall: { kind: 'blobs', colors: ['#500724', '#db2777', '#fbcfe8'] }, blurb: 'Glass back, sharp camera, updates for years.' },
  { id: 'tecno_camon', name: 'Tecno Camon 40', brand: 'Tecno', os: 'android', tier: 'mid', price: 520_000, frame: ['#99f6e4', '#115e59'], wall: { kind: 'waves', colors: ['#042f2e', '#0d9488', '#99f6e4'] }, blurb: 'Camera wey sabi dark skin. Owambe photographer in your pocket.' },
  { id: 'iphone_13', name: 'iPhone 13', brand: 'Apple', os: 'ios', tier: 'mid', price: 680_000, frame: ['#fbcfe8', '#9d174d'], wall: { kind: 'bloom', colors: ['#500724', '#be185d', '#fbcfe8'] }, cutout: 'notch', blurb: 'Old but gold. Still dey snap fine for Instagram.' },
  { id: 'nothing_phone', name: 'Nothing Phone (3)', brand: 'Nothing', os: 'android', tier: 'mid', price: 1_100_000, frame: ['#f8fafc', '#475569'], wall: { kind: 'rings', colors: ['#0f172a', '#334155', '#f8fafc'] }, blurb: 'Lights for back like disco. Nobody else get am.' },
  { id: 'iphone_16', name: 'iPhone 16', brand: 'Apple', os: 'ios', tier: 'mid', price: 1_350_000, frame: ['#bae6fd', '#0c4a6e'], wall: { kind: 'bloom', colors: ['#082f49', '#0284c7', '#7dd3fc'] }, blurb: 'Clean iOS, Dynamic Island, and the blue bubbles.' },
  { id: 'pixel_10', name: 'Google Pixel 10', brand: 'Google', os: 'android', tier: 'mid', price: 1_400_000, frame: ['#e2e8f0', '#1e293b'], wall: { kind: 'shapes', colors: ['#1e293b', '#64748b', '#fbbf24'] }, blurb: 'The best camera brain for night shots in Kaduna light.' },
  { id: 'iphone_17', name: 'iPhone 17', brand: 'Apple', os: 'ios', tier: 'mid', price: 1_650_000, frame: ['#ddd6fe', '#5b21b6'], wall: { kind: 'bloom', colors: ['#2e1065', '#7c3aed', '#ddd6fe'] }, blurb: 'Smooth screen, sharp selfie camera. The sensible iPhone.' },
  // Flagship
  { id: 'oneplus_13', name: 'OnePlus 13', brand: 'OnePlus', os: 'android', tier: 'flagship', price: 1_700_000, frame: ['#bfdbfe', '#1e3a8a'], wall: { kind: 'waves', colors: ['#172554', '#2563eb', '#bfdbfe'] }, blurb: 'Charges full before your tea is ready.' },
  { id: 'pixel_10_pro', name: 'Google Pixel 10 Pro', brand: 'Google', os: 'android', tier: 'flagship', price: 2_000_000, frame: ['#d9f99d', '#3f6212'], wall: { kind: 'shapes', colors: ['#1a2e05', '#65a30d', '#fde047'] }, blurb: 'Zoom reach your neighbour’s compound. AI everything.' },
  { id: 'iphone_air', name: 'iPhone Air', brand: 'Apple', os: 'ios', tier: 'flagship', price: 2_100_000, frame: ['#e0f2fe', '#0369a1'], wall: { kind: 'bloom', colors: ['#0c4a6e', '#38bdf8', '#e0f2fe'] }, blurb: 'Thin like wafer. Hold am well, breeze fit carry am.' },
  { id: 'galaxy_s26_ultra', name: 'Samsung Galaxy S26 Ultra', brand: 'Samsung', os: 'android', tier: 'flagship', price: 2_400_000, frame: ['#d6d3d1', '#292524'], wall: { kind: 'blobs', colors: ['#0c0a09', '#57534e', '#fbbf24'] }, blurb: 'S Pen, 200MP zoom. Oga at the top energy.' },
  { id: 'iphone_17_pro_max', name: 'iPhone 17 Pro Max', brand: 'Apple', os: 'ios', tier: 'flagship', price: 2_700_000, frame: ['#fdba74', '#9a3412'], wall: { kind: 'bloom', colors: ['#431407', '#ea580c', '#fed7aa'] }, blurb: 'Cosmic orange. Everybody go know say you don land.' },
  { id: 'iphone_18_pro', name: 'iPhone 18 Pro', brand: 'Apple', os: 'ios', tier: 'flagship', price: 3_000_000, frame: ['#e7e5e4', '#44403c'], wall: { kind: 'bloom', colors: ['#1c1917', '#78716c', '#fde68a'] }, cutout: 'island-small', blurb: 'The newest one. Your old iPhone just became “the small one”.' },
  { id: 'iphone_18_pro_max', name: 'iPhone 18 Pro Max', brand: 'Apple', os: 'ios', tier: 'flagship', price: 3_500_000, frame: ['#a5b4fc', '#1e1b4b'], wall: { kind: 'bloom', colors: ['#0f0a2e', '#4338ca', '#c7d2fe'] }, cutout: 'island-small', blurb: 'Latest and biggest. Drop am for table make everybody see.' },
  // Foldables
  { id: 'tecno_fold', name: 'Tecno Phantom V Fold2', brand: 'Tecno', os: 'android', tier: 'fold', price: 1_600_000, frame: ['#fde68a', '#78350f'], wall: { kind: 'rings', colors: ['#451a03', '#b45309', '#fde68a'] }, fold: true, blurb: 'Folding screen at a Naija-friendly price.' },
  { id: 'galaxy_z_flip', name: 'Samsung Galaxy Z Flip7', brand: 'Samsung', os: 'android', tier: 'fold', price: 1_800_000, frame: ['#a7f3d0', '#064e3b'], wall: { kind: 'blobs', colors: ['#022c22', '#059669', '#a7f3d0'] }, flip: true, blurb: 'Flips shut like compact powder. Very stylish.' },
  { id: 'galaxy_z_fold', name: 'Samsung Galaxy Z Fold7', brand: 'Samsung', os: 'android', tier: 'fold', price: 3_200_000, frame: ['#cbd5e1', '#0f172a'], wall: { kind: 'waves', colors: ['#020617', '#1e40af', '#93c5fd'] }, fold: true, blurb: 'Phone outside, tablet inside. Work and Netflix together.' },
  // The id is from before it had a name: saves hold it.
  { id: 'iphone_fold', name: 'iPhone Duo', brand: 'Apple', os: 'ios', tier: 'fold', price: 4_800_000, frame: ['#fafaf9', '#a8a29e'], wall: { kind: 'dunes', colors: ['#9db3c9', '#cdb48c', '#8b7b68'] }, fold: true, duo: true, blurb: 'Apple’s first fold. A passport when closed, a tablet when open. Only Alhaji and big boys get am.' },
];

export const PHONE_BY_ID: Record<string, PhoneDef> = Object.fromEntries(PHONES.map((p) => [p.id, p]));

export const cutoutOf = (p: PhoneDef): Cutout => p.cutout ?? (p.os === 'ios' ? 'island' : 'punch');
/** Samsung, Tecno, Infinix and itel ship with the three buttons on; everybody else swipes. */
const BUTTON_BRANDS = new Set(['Tecno', 'Infinix', 'itel']);
export const navOf = (p: PhoneDef): NavStyle => p.nav ?? (p.brand === 'Samsung' ? 'buttons-samsung' : BUTTON_BRANDS.has(p.brand) ? 'buttons' : 'bar');

export const PHONE_TIERS: { key: PhoneTier; label: string }[] = [
  { key: 'budget', label: 'Cheap & strong' },
  { key: 'mid', label: 'Mid range' },
  { key: 'flagship', label: 'Top phones' },
  { key: 'fold', label: 'Fold & flip' },
];

/** The free network phone: what a save from before phones holds, and what you fall back to when your last phone is seized. A new life starts with its origin's phone (game/origins.ts). */
export const STARTER_ANDROID = 'tecno_spark';

/** Used phones sell for this much of the new price. */
export const PHONE_RESALE_FACTOR = 0.45;
