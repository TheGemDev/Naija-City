// Careers and businesses: skills you train, job promotions earned by working, and the stalls you rent at
// places on the map (a bar at the club, a kiosk in the market). Rules only; the server (worker/career.ts)
// decides every outcome.

import { JOBS } from './catalog';

/* ---------- Skills ---------- */

export type SkillId = 'cooking' | 'mechanic' | 'tailoring' | 'trading';

export interface SkillDef {
  id: SkillId;
  label: string;
  icon: string;
  blurb: string;
}

export const SKILLS: SkillDef[] = [
  { id: 'cooking', label: 'Cooking', icon: '🍢', blurb: 'Suya, jollof and pepper soup. Runs your food spots.' },
  { id: 'mechanic', label: 'Mechanic', icon: '🔧', blurb: 'Keeps keke and okada running. Runs your fleet.' },
  { id: 'tailoring', label: 'Tailoring', icon: '🧵', blurb: 'Agbada, ankara, school uniforms. Runs your boutique.' },
  { id: 'trading', label: 'Trading', icon: '🧺', blurb: 'Buy low, sell high, bargain well. Runs your store.' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;

/** XP needed to reach level 1..10. */
export const SKILL_LEVELS = [0, 100, 250, 500, 900, 1_500, 2_400, 3_600, 5_200, 7_500];
export const MAX_SKILL = SKILL_LEVELS.length;

export const skillLevel = (xp: number) => {
  let lvl = 1;
  for (let i = 1; i < SKILL_LEVELS.length; i++) if (xp >= SKILL_LEVELS[i]) lvl = i + 1;
  return lvl;
};

/** XP of the next level, or null at the top. */
export const nextSkillXp = (xp: number) => SKILL_LEVELS[skillLevel(xp)] ?? null;

/** Set by net/career.ts so finishing a course at the polytechnic trains the skill on the server. */
export const careerHooks: { train?: (skill: SkillId) => void } = {};

export const TRAIN = {
  xp: 40,
  /** Fee per course = base × current level. */
  fee: 8_000,
  cooldownMs: 10 * 60_000,
} as const;

export const trainFee = (xp: number) => TRAIN.fee * skillLevel(xp);

/* ---------- Job promotions ---------- */

export interface JobRank {
  title: string;
  /** Shifts worked at this job to hold the rank. */
  shifts: number;
  /** Multiplier on the job's pay. */
  pay: number;
}

export const JOB_RANKS: JobRank[] = [
  { title: 'Trainee', shifts: 0, pay: 1 },
  { title: 'Junior', shifts: 5, pay: 1.12 },
  { title: 'Senior', shifts: 15, pay: 1.3 },
  { title: 'Supervisor', shifts: 35, pay: 1.55 },
  { title: 'Manager', shifts: 70, pay: 1.85 },
];

export const rankIndex = (shifts: number) => {
  let r = 0;
  for (let i = 1; i < JOB_RANKS.length; i++) if (shifts >= JOB_RANKS[i].shifts) r = i;
  return r;
};

export const rankPay = (shifts: number) => JOB_RANKS[rankIndex(shifts)].pay;

/** Pay multipliers per job, from shifts-per-job counts. Used by the server check and the client. */
export function rankMults(shifts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of JOBS) out[j.id] = rankPay(shifts[j.id] ?? 0);
  return out;
}

/** New in town: the first shifts anyone ever works pay extra, so a fresh life gets going (counted across every job). */
export const NEWCOMER = { shifts: 10, pay: 1.5 } as const;

/** Every multiplier the server allows on a job's pay beyond streak and origin: rank, and the newcomer boost. */
export function payMults(shifts: Record<string, number>): Record<string, number> {
  const out = rankMults(shifts);
  const total = Object.values(shifts).reduce((a, n) => a + n, 0);
  if (total < NEWCOMER.shifts) for (const id of Object.keys(out)) out[id] *= NEWCOMER.pay;
  return out;
}

/** What the client uses to price a shift; kept in step with the server by net/career.ts. */
export const careerState: { mult: Record<string, number> } = { mult: {} };

/* ---------- Businesses ---------- */

export type BusinessType =
  | 'kiosk' | 'pos' | 'fish' | 'suya' | 'souvenir' | 'print' | 'canteen' | 'shop' | 'fashion' | 'salon'
  | 'bar' | 'photo' | 'gadgets' | 'chemist' | 'mechanic' | 'keke';

export interface BusinessDef {
  id: BusinessType;
  name: string;
  icon: string;
  blurb: string;
  skill: SkillId;
  /** Skill level needed to open one. */
  minSkill: number;
  cost: number;
  /** Gross naira per real hour at level 1 with no staff while stocked. */
  hourly: number;
  /** What staff are called here. */
  staffTitle: string;
  /** Places on the map (city.ts ids) that rent stalls to this kind of business. */
  places: string[];
}

/** Cheapest first: roadside stands cost a few hundred thousand, the big outfits at the bottom cost millions. Each kind opens only at the places in its `places` list, so the map decides what you can run where. */
export const BUSINESSES: BusinessDef[] = [
  { id: 'kiosk', name: 'Snack Cart', icon: '🥤', blurb: 'Puff-puff, kunu and groundnut wherever a crowd gathers.', skill: 'cooking', minSkill: 1, cost: 120_000, hourly: 4_500, staffTitle: 'Hawker', places: ['gamji', 'murtala', 'stadium', 'pitch', 'viewing', 'river', 'museum', 'school', 'church', 'mosque', 'polo', 'nda'] },
  { id: 'pos', name: 'POS & Recharge Stand', icon: '🏧', blurb: 'An umbrella, a POS machine and a queue. Airtime, data and cable subs.', skill: 'trading', minSkill: 1, cost: 150_000, hourly: 5_000, staffTitle: 'POS agent', places: ['secretariat', 'bank', 'motorpark', 'market', 'station', 'police', 'hospital', 'poly', 'stadium', 'church', 'mosque'] },
  { id: 'fish', name: 'Fresh Fish Stand', icon: '🐟', blurb: 'Straight from the water: grilled, smoked or in pepper soup.', skill: 'cooking', minSkill: 1, cost: 200_000, hourly: 6_000, staffTitle: 'Fishmonger', places: ['river', 'market', 'buka'] },
  { id: 'suya', name: 'Suya Spot', icon: '🍢', blurb: 'A night-time grill by the roadside. Cheap to open, quick to earn.', skill: 'cooking', minSkill: 1, cost: 250_000, hourly: 7_000, staffTitle: 'Grill boy', places: ['suya', 'club', 'stadium', 'viewing', 'motorpark', 'murtala', 'pitch'] },
  { id: 'souvenir', name: 'Craft & Souvenir Stall', icon: '🏺', blurb: 'Leather, calabash and woven fans for tourists and big men.', skill: 'tailoring', minSkill: 1, cost: 300_000, hourly: 8_000, staffTitle: 'Craftsman', places: ['museum', 'arewa', 'lugard', 'airport', 'hamdala', 'gamji'] },
  { id: 'print', name: 'Business Centre', icon: '🖨️', blurb: 'Photocopy, passport photos and typing. Wherever there is a form to fill.', skill: 'trading', minSkill: 2, cost: 400_000, hourly: 9_000, staffTitle: 'Typist', places: ['secretariat', 'poly', 'school', 'police', 'lugard', 'techhub', 'bank', 'arewa'] },
  { id: 'canteen', name: 'Mama Put Canteen', icon: '🍲', blurb: 'Hot rice and tuwo for workers on break. Lunch hour is war.', skill: 'cooking', minSkill: 2, cost: 600_000, hourly: 10_000, staffTitle: 'Cook', places: ['buka', 'secretariat', 'textile', 'refinery', 'poly', 'school', 'hospital', 'nda', 'station', 'airport'] },
  { id: 'shop', name: 'Provision Store', icon: '🏪', blurb: 'Indomie, Peak milk and recharge cards. Steady money all day.', skill: 'trading', minSkill: 2, cost: 900_000, hourly: 11_000, staffTitle: 'Shop attendant', places: ['market', 'motorpark', 'station', 'poly', 'mall', 'hospital'] },
  { id: 'fashion', name: 'Fashion Stall', icon: '👗', blurb: 'Ankara, kaftans and caps sewn to order. Owambe season pays.', skill: 'tailoring', minSkill: 2, cost: 1_200_000, hourly: 12_000, staffTitle: 'Tailor', places: ['boutique', 'market', 'mall', 'textile'] },
  { id: 'salon', name: 'Barber & Salon', icon: '💈', blurb: 'Fresh cuts, braids and all the gist in town.', skill: 'tailoring', minSkill: 3, cost: 1_500_000, hourly: 13_000, staffTitle: 'Stylist', places: ['mall', 'market', 'boutique', 'poly', 'hamdala', 'nda'] },
  { id: 'bar', name: 'Drinks Bar', icon: '🍹', blurb: 'Chapman, palm wine and bottle service where the big spenders sit.', skill: 'cooking', minSkill: 3, cost: 2_500_000, hourly: 14_000, staffTitle: 'Bartender', places: ['club', 'hamdala', 'polo', 'viewing', 'mall'] },
  { id: 'photo', name: 'Photo Studio', icon: '📸', blurb: 'Portraits, wedding shoots and “oga, one more pose”.', skill: 'trading', minSkill: 3, cost: 3_000_000, hourly: 15_000, staffTitle: 'Photographer', places: ['gamji', 'murtala', 'polo', 'church', 'lugard', 'museum', 'hamdala', 'airport'] },
  { id: 'gadgets', name: 'Gadget Kiosk', icon: '📱', blurb: 'Screen guards, earbuds and quick repairs. Everybody phone don crack.', skill: 'mechanic', minSkill: 2, cost: 5_000_000, hourly: 17_000, staffTitle: 'Technician', places: ['techhub', 'market', 'mall', 'poly'] },
  { id: 'chemist', name: 'Chemist', icon: '💊', blurb: 'Tonics, vitamins and first aid. People always need medicine.', skill: 'trading', minSkill: 4, cost: 8_000_000, hourly: 19_000, staffTitle: 'Pharmacist', places: ['hospital', 'market', 'motorpark', 'nda', 'refinery'] },
  { id: 'mechanic', name: 'Mechanic Workshop', icon: '🔧', blurb: 'Oil changes, vulcanizer and car wash. Naija roads keep you busy.', skill: 'mechanic', minSkill: 3, cost: 12_000_000, hourly: 21_000, staffTitle: 'Apprentice', places: ['motorpark', 'refinery', 'textile', 'airport', 'station'] },
  { id: 'keke', name: 'Keke Fleet', icon: '🛺', blurb: 'Rent keke to drivers by the day. Big money, big repairs.', skill: 'mechanic', minSkill: 3, cost: 20_000_000, hourly: 25_000, staffTitle: 'Fleet driver', places: ['motorpark', 'station', 'airport', 'market'] },
];

export const BUSINESS_BY_ID = Object.fromEntries(BUSINESSES.map((b) => [b.id, b])) as Record<BusinessType, BusinessDef>;

/* ---------- Stalls: where a business sits on the map ---------- */

export interface StallDef {
  /** Businesses the place has room for. */
  slots: number;
  /** Rent per real hour while the business is trading. */
  rent: number;
  /** How busy the place is before any player walks in (1 = an ordinary street). */
  pull: number;
}

const PRIME: StallDef = { slots: 8, rent: 1_200, pull: 1.15 };
const BUSY: StallDef = { slots: 6, rent: 700, pull: 1.05 };
const LOCAL: StallDef = { slots: 6, rent: 300, pull: 1 };

/** Every place that rents stalls. A business type can only open at the places in its `places` list. */
export const STALLS: Record<string, StallDef> = {
  market: { ...PRIME, slots: 12 }, mall: PRIME, club: PRIME, hamdala: PRIME, polo: PRIME, airport: PRIME,
  motorpark: BUSY, station: BUSY, stadium: BUSY, viewing: BUSY, techhub: BUSY, boutique: BUSY,
  secretariat: BUSY, bank: BUSY, hospital: BUSY, gamji: BUSY, poly: { ...BUSY, slots: 8 },
  suya: LOCAL, murtala: LOCAL, nda: LOCAL, church: LOCAL, mosque: LOCAL, police: LOCAL, lugard: LOCAL, arewa: LOCAL,
  museum: LOCAL, river: LOCAL, textile: LOCAL, buka: LOCAL, school: LOCAL, pitch: LOCAL, refinery: LOCAL,
};

/** What an owner can pick for the shop's badge. Any business's own icon is allowed too. */
export const BIZ_ICONS = ['⭐', '👑', '🔥', '💎', '🦁', '🐊', '🌴', '🚀', '🍀', '🧿', '🎯', '💰', '🌙', '☀️', '❤️', '🦅'];
export const BIZ_COLOURS = ['#f97316', '#16a34a', '#2563eb', '#dc2626', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#475569', '#111827'];
export const allowedIcon = (icon: string) => BIZ_ICONS.includes(icon) || BUSINESSES.some((b) => b.icon === icon);

/* ---------- Building size ---------- */

export type BizSize = 'small' | 'medium' | 'large';

/** How big the building is. Bigger costs more to open and rent, holds more of each product and has room for more staff. */
export const BIZ_SIZES: Record<BizSize, { label: string; icon: string; cost: number; rent: number; shelf: number; staff: number }> = {
  small: { label: 'Stall', icon: '⛱️', cost: 1, rent: 1, shelf: 100, staff: 0 },
  medium: { label: 'Shop', icon: '🏪', cost: 2, rent: 1.5, shelf: 250, staff: 2 },
  large: { label: 'Plaza', icon: '🏬', cost: 4, rent: 2.5, shelf: 500, staff: 4 },
};
export const BIZ_SIZE_ORDER: BizSize[] = ['small', 'medium', 'large'];
export const sizeOf = (size: string | null | undefined): BizSize => (size && Object.hasOwn(BIZ_SIZES, size) ? (size as BizSize) : 'small');

/** What it costs to open a business of this size. */
export const openCost = (def: BusinessDef, size: BizSize) => def.cost * BIZ_SIZES[size].cost;
/** Building out to a bigger size costs the difference between the two. */
export const resizeCost = (def: BusinessDef, from: BizSize, to: BizSize) => openCost(def, to) - openCost(def, from);
/** Rent per trading hour at a place for a building of this size. */
export const rentOf = (placeId: string, size: BizSize) => Math.round((STALLS[placeId]?.rent ?? 0) * BIZ_SIZES[size].rent);
/** Units of one product the shelf can hold. */
export const shelfOf = (size: BizSize) => BIZ_SIZES[size].shelf;

/** The share of the opening cost that is CAC registration, paid into the treasury. The rest fits out the building. */
export const registrationFee = (def: BusinessDef, size: BizSize = 'small') => Math.round(openCost(def, size) * BIZ.registrationShare);

/** What opening costs in a state whose registration fee is `bizPct` percent of the standard: the fit-out, plus the fee the state sets. */
export const openTotal = (def: BusinessDef, size: BizSize, bizPct: number) => {
  const base = registrationFee(def, size);
  return openCost(def, size) - base + Math.round((base * bizPct) / 100);
};

/** Business types a place rents stalls to. */
export const typesAt = (placeId: string) => BUSINESSES.filter((b) => b.places.includes(placeId));

/** Share added to a business's trade by players who walked into its place over the last two days. */
export const trafficBoost = (visitors: number) => Math.min(BIZ.trafficCap, Math.max(0, visitors) * BIZ.trafficPerVisitor);

/** How much trade a place sends a stall: its own pull, lifted by recent visitors. */
export const demandAt = (placeId: string, visitors: number) => (STALLS[placeId]?.pull ?? 1) * (1 + trafficBoost(visitors));

/** What a buyer pays on top when ordering from somewhere else instead of walking in. */
export const deliveryFee = (total: number) => Math.max(BIZ.deliveryMin, Math.round(total * BIZ.deliveryShare));

export interface MarketProductDef {
  id: string;
  business: BusinessType;
  name: string;
  icon: string;
  wholesale: number;
  price: number;
  benefit: Partial<Record<'hunger' | 'fun' | 'social' | 'energy' | 'hygiene', number>>;
}

export const MARKET_PRODUCTS: MarketProductDef[] = [
  { id: 'suya-meal', business: 'suya', name: 'Suya meal', icon: '🍢', wholesale: 1_000, price: 2_000, benefit: { hunger: 24, fun: 4 } },
  { id: 'zobo-cup', business: 'suya', name: 'Chilled zobo', icon: '🥤', wholesale: 400, price: 800, benefit: { hunger: 4, fun: 8 } },
  { id: 'kilishi-pack', business: 'suya', name: 'Kilishi pack', icon: '🥩', wholesale: 800, price: 1_500, benefit: { hunger: 18, fun: 3 } },
  { id: 'provisions-bag', business: 'shop', name: 'Provisions bag', icon: '🧺', wholesale: 1_000, price: 1_800, benefit: { hunger: 18 } },
  { id: 'cold-drink', business: 'shop', name: 'Cold drink', icon: '🥤', wholesale: 350, price: 700, benefit: { hunger: 3, fun: 8 } },
  { id: 'fruit-basket', business: 'shop', name: 'Fruit basket', icon: '🍉', wholesale: 700, price: 1_300, benefit: { hunger: 14, fun: 5 } },
  { id: 'short-keke-ride', business: 'keke', name: 'Short keke ride', icon: '🛺', wholesale: 500, price: 900, benefit: { fun: 5, social: 3 } },
  { id: 'town-keke-ride', business: 'keke', name: 'Town keke ride', icon: '🛺', wholesale: 900, price: 1_600, benefit: { fun: 9, social: 5 } },
  { id: 'keke-charter', business: 'keke', name: 'Keke charter', icon: '🚕', wholesale: 1_500, price: 2_600, benefit: { fun: 14, social: 8 } },
  { id: 'chapman', business: 'bar', name: 'Chapman', icon: '🍹', wholesale: 600, price: 1_200, benefit: { fun: 10, social: 6 } },
  { id: 'palm-wine', business: 'bar', name: 'Fresh palm wine', icon: '🥥', wholesale: 500, price: 1_000, benefit: { fun: 9, social: 5 } },
  { id: 'vip-bottle', business: 'bar', name: 'VIP bottle service', icon: '🍾', wholesale: 6_000, price: 12_000, benefit: { fun: 30, social: 30 } },
  { id: 'cap-beads', business: 'fashion', name: 'Cap & beads', icon: '🧢', wholesale: 1_000, price: 2_000, benefit: { fun: 5, social: 8 } },
  { id: 'ankara-fit', business: 'fashion', name: 'Ankara fit', icon: '👗', wholesale: 3_000, price: 6_000, benefit: { fun: 12, social: 14 } },
  { id: 'kaftan', business: 'fashion', name: 'Kaftan', icon: '🥻', wholesale: 5_000, price: 9_000, benefit: { fun: 10, social: 20 } },
  { id: 'screen-guard', business: 'gadgets', name: 'Screen guard', icon: '📱', wholesale: 500, price: 1_000, benefit: { fun: 4 } },
  { id: 'earbuds', business: 'gadgets', name: 'Earbuds', icon: '🎧', wholesale: 2_500, price: 4_500, benefit: { fun: 16 } },
  { id: 'power-bank', business: 'gadgets', name: 'Power bank', icon: '🔋', wholesale: 4_000, price: 7_000, benefit: { fun: 8, social: 6 } },
  { id: 'puff-puff', business: 'kiosk', name: 'Puff-puff', icon: '🍩', wholesale: 200, price: 500, benefit: { hunger: 8, fun: 3 } },
  { id: 'kunu', business: 'kiosk', name: 'Cold kunu', icon: '🥛', wholesale: 250, price: 600, benefit: { hunger: 5, fun: 6 } },
  { id: 'groundnut', business: 'kiosk', name: 'Groundnut & popcorn', icon: '🥜', wholesale: 150, price: 400, benefit: { hunger: 6 } },
  { id: 'recharge-card', business: 'pos', name: 'Recharge card', icon: '📶', wholesale: 400, price: 600, benefit: { social: 6 } },
  { id: 'data-bundle', business: 'pos', name: 'Data bundle', icon: '🌐', wholesale: 1_000, price: 1_500, benefit: { fun: 10, social: 6 } },
  { id: 'cable-sub', business: 'pos', name: 'Cable TV sub', icon: '📺', wholesale: 3_000, price: 4_000, benefit: { fun: 22 } },
  { id: 'smoked-fish', business: 'fish', name: 'Smoked fish pack', icon: '🐠', wholesale: 900, price: 1_600, benefit: { hunger: 16 } },
  { id: 'catfish-soup', business: 'fish', name: 'Catfish pepper soup', icon: '🍲', wholesale: 1_500, price: 2_800, benefit: { hunger: 26, fun: 5 } },
  { id: 'grilled-fish', business: 'fish', name: 'Grilled croaker', icon: '🐟', wholesale: 1_800, price: 3_500, benefit: { hunger: 30, fun: 6 } },
  { id: 'woven-fan', business: 'souvenir', name: 'Woven hand fan', icon: '🪭', wholesale: 500, price: 1_200, benefit: { fun: 5, social: 4 } },
  { id: 'calabash-art', business: 'souvenir', name: 'Carved calabash', icon: '🏺', wholesale: 1_500, price: 3_000, benefit: { fun: 10, social: 6 } },
  { id: 'leather-bag', business: 'souvenir', name: 'Kano leather bag', icon: '👜', wholesale: 3_500, price: 6_500, benefit: { fun: 10, social: 14 } },
  { id: 'photocopy', business: 'print', name: 'Photocopy & binding', icon: '🖨️', wholesale: 200, price: 500, benefit: { fun: 2 } },
  { id: 'passport-photo', business: 'print', name: 'Passport photos', icon: '🪪', wholesale: 300, price: 800, benefit: { social: 5 } },
  { id: 'cv-typing', business: 'print', name: 'CV typing & print', icon: '📄', wholesale: 500, price: 1_500, benefit: { social: 8, fun: 2 } },
  { id: 'moi-moi', business: 'canteen', name: 'Moi-moi wrap', icon: '🫔', wholesale: 400, price: 800, benefit: { hunger: 12 } },
  { id: 'tuwo-miyan', business: 'canteen', name: 'Tuwo da miyan kuka', icon: '🥣', wholesale: 900, price: 1_700, benefit: { hunger: 28 } },
  { id: 'jollof-plate', business: 'canteen', name: 'Jollof & chicken', icon: '🍛', wholesale: 1_200, price: 2_200, benefit: { hunger: 30, fun: 4 } },
  { id: 'haircut', business: 'salon', name: 'Fresh haircut', icon: '💈', wholesale: 600, price: 1_500, benefit: { hygiene: 14, social: 12 } },
  { id: 'mani-pedi', business: 'salon', name: 'Mani-pedi', icon: '💅🏾', wholesale: 1_200, price: 2_500, benefit: { hygiene: 12, fun: 8 } },
  { id: 'braids', business: 'salon', name: 'Braids & beads', icon: '💇🏾', wholesale: 2_500, price: 5_000, benefit: { hygiene: 10, social: 22 } },
  { id: 'portrait', business: 'photo', name: 'Studio portrait', icon: '📸', wholesale: 1_500, price: 3_000, benefit: { fun: 10, social: 12 } },
  { id: 'photo-frame', business: 'photo', name: 'Framed print', icon: '🖼️', wholesale: 2_000, price: 4_000, benefit: { fun: 8, social: 8 } },
  { id: 'event-shoot', business: 'photo', name: 'Event shoot', icon: '🎥', wholesale: 6_000, price: 11_000, benefit: { fun: 20, social: 30 } },
  { id: 'vitamin-c', business: 'chemist', name: 'Vitamin C', icon: '🍊', wholesale: 300, price: 700, benefit: { energy: 6 } },
  { id: 'energy-tonic', business: 'chemist', name: 'Energy tonic', icon: '🧃', wholesale: 800, price: 1_500, benefit: { energy: 14 } },
  { id: 'first-aid', business: 'chemist', name: 'First-aid kit', icon: '🩹', wholesale: 2_000, price: 3_500, benefit: { energy: 10, hygiene: 10 } },
  { id: 'tyre-patch', business: 'mechanic', name: 'Vulcanizer patch', icon: '🛞', wholesale: 400, price: 1_000, benefit: { fun: 3 } },
  { id: 'car-wash', business: 'mechanic', name: 'Car wash', icon: '🚿', wholesale: 700, price: 1_500, benefit: { fun: 8, social: 6 } },
  { id: 'oil-change', business: 'mechanic', name: 'Oil change', icon: '🛢️', wholesale: 3_000, price: 5_000, benefit: { fun: 6 } },
];

export const MARKET_PRODUCT_BY_ID = Object.fromEntries(MARKET_PRODUCTS.map((p) => [p.id, p])) as Record<string, MarketProductDef>;

export const BIZ = {
  maxLevel: 5,
  /** Staff slots = 2 + level, plus the extra room a bigger building has. */
  baseSlots: 2,
  hireFee: 5_000,
  /** Staff wage per stocked hour, as a share of the business's level-1 hourly. */
  wageShare: 0.05,
  staffBoost: 0.12,
  levelBoost: 0.18,
  skillBoost: 0.05,
  maxNameLen: 24,
  /** The most any shelf holds (the biggest building). Each size's own limit is in BIZ_SIZES. */
  maxListingStock: 500,
  maxRestock: 200,
  maxMarketPriceMultiple: 5,
  maxMarketOrder: 10,
  /** A stall stays yours this long after the last unit on the shelf sells; after that the place can rent it to someone else. */
  stallHoldMs: 3 * 24 * 3_600_000,
  /** Permit to move a business to another place. Paid into the treasury. */
  moveFee: 25_000,
  /** Share of the opening cost that is state registration (treasury). */
  registrationShare: 0.2,
  /** Each player who walked into the place in the last two days adds this share of trade, up to the cap. */
  trafficPerVisitor: 0.02,
  trafficCap: 0.4,
  /** Ordering from somewhere else costs this share of the order on top, and never less than the minimum. */
  deliveryShare: 0.15,
  deliveryMin: 500,
} as const;

export const slotsOf = (level: number, size: BizSize = 'small') => BIZ.baseSlots + level + BIZ_SIZES[size].staff;

/** Gross per real hour. `demand` is what the business's place sends it (demandAt). */
export function hourlyOf(def: BusinessDef, level: number, staff: number, skill: number, demand = 1) {
  return Math.round(def.hourly * (1 + BIZ.levelBoost * (level - 1)) * (1 + BIZ.staffBoost * staff) * (1 + BIZ.skillBoost * (skill - 1)) * demand);
}

export const wageOf = (def: BusinessDef, level: number) => Math.round(def.hourly * BIZ.wageShare * (1 + 0.1 * (level - 1)));

export const upgradeCost = (def: BusinessDef, level: number) => Math.round(def.cost * 0.6 * level);

/** Skill XP earned per stocked hour of trading when the owner collects. */
export const OPERATE_XP_PER_HOUR = 4;

/* ---------- Customers who aren't players, and automatic restocking ---------- */

/**
 * Every cron tick (worker/shops.ts) each product on a shelf has its chance of being bought by passers-by. What they
 * would spend an hour at fair prices is a share of the business's hourlyOf (level, staff, the owner's skill and the
 * place's demand), split between the products on the shelf; the building size, the hour of the day and the asking
 * price move it from there. The units are counted out at random, so most ticks a shop sells nothing and now and then
 * it sells several. Auto-restock tops a shelf back up from the owner's wallet when it runs low.
 */
export const NPC_SHOP = {
  /** Share of hourlyOf customers spend at fair prices. A level-1 Suya Spot at a quiet place: ₦3,500 an hour at a normal hour, about 1.75 meals. */
  share: 0.5,
  /** Demand × (normal price ÷ asking price) ^ this: at 1.2× the normal price it sells ~63%, at 2× ~18%, near the 5×-wholesale cap ~10%. */
  elasticity: 2.5,
  /** Selling under the normal price helps, but only up to this many times the fair demand. */
  maxCheapBoost: 1.6,
  /** A plaza draws more walk-ins than a stall. */
  size: { small: 1, medium: 1.25, large: 1.5 } as Record<BizSize, number>,
  /** How busy the street is each hour of a real Nigerian day (WAT, 00 to 23): dead at 3am, peaking after work. Averages ~0.8. */
  dayHours: [0.15, 0.1, 0.05, 0.05, 0.1, 0.25, 0.5, 0.8, 1, 1.1, 1.1, 1.2, 1.3, 1.2, 1.1, 1.1, 1.2, 1.4, 1.5, 1.4, 1.2, 0.9, 0.6, 0.3],
  /** Night spots do their trade after dark instead. Averages ~0.8 too. */
  nightHours: [0.9, 0.7, 0.4, 0.2, 0.1, 0.1, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.7, 0.7, 0.8, 0.9, 1.1, 1.4, 1.7, 1.9, 1.9, 1.7, 1.3],
  nightTypes: ['suya', 'bar'] as BusinessType[],
  /** Most units of one product customers take in one tick. */
  maxUnits: 6,
  /** How often the cron runs: expected sales are worked out per this much time. */
  tickMs: 5 * 60_000,
  /** Bounds on one tick's work over every shop: stocked products looked at, and customer orders written (each is ~6 D1 statements). */
  maxListings: 1_000,
  maxSales: 30,
  /** Who the buyer is on a customer's order. Never a real uid, like NPC tenants' 'npc:<uuid>'. */
  buyer: 'npc:customers',
  /** Auto-restock, when the owner turns it on: refill once a quarter of the shelf is left, up to full. */
  autoMinShare: 0.25,
  autoToShare: 1,
  /** Most products restocked automatically in one tick, across every shop (each is ~10 D1 statements). */
  autoPerTick: 12,
} as const;

/** How busy the street is for this kind of business at real time `now`. Nigeria is UTC+1 all year. */
export const npcHourFactor = (type: BusinessType, now: number) =>
  (NPC_SHOP.nightTypes.includes(type) ? NPC_SHOP.nightHours : NPC_SHOP.dayHours)[(new Date(now).getUTCHours() + 1) % 24];

/** What the asking price does to customers: cheap sells faster (up to a point), dear rarely sells. */
export const npcPriceFactor = (price: number, normal: number) => Math.min(NPC_SHOP.maxCheapBoost, (normal / Math.max(1, price)) ** NPC_SHOP.elasticity);

/**
 * Units of one product customers are expected to buy in one tick. `gross` is the business's hourlyOf, `products` how
 * many products its shelf holds, `normal` the product's normal price and `hour` what npcHourFactor says now.
 */
export const npcExpected = (gross: number, size: BizSize, products: number, normal: number, price: number, hour: number) =>
  (gross * NPC_SHOP.share * NPC_SHOP.size[size] * hour * npcPriceFactor(price, normal) * (NPC_SHOP.tickMs / 3_600_000)) / Math.max(1, products) / normal;

/** Where auto-restock starts when the owner turns it on: the levels for a shelf of this size. */
export const autoDefaults = (shelf: number) => ({ min: Math.round(shelf * NPC_SHOP.autoMinShare), to: Math.round(shelf * NPC_SHOP.autoToShare) });
