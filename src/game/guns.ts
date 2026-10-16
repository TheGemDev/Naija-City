// Guns: illegal. The only way to get one is off the books from the Fixer's dealer. With one you can rob a player at
// gunpoint, shoot one, or stick up a passer-by or a shop. Rules here; the server plays them out (worker/guns.ts).
//
// Nobody dies. Someone shot wakes up in hospital with a bill and stays hurt for a while. Gunshots bring the police,
// most of the time. Victims can fight back: an armed victim shoots back, a bulletproof vest stops a bullet or two, an
// armed bodyguard stops most robbers. Get arrested for anything with a gun on you and the police take it, along with
// a huge fine (worker/phoneSearch.ts).

export type GunId = 'danegun' | 'pistol' | 'pump' | 'ak47';

export interface GunDef {
  id: GunId;
  name: string;
  icon: string;
  blurb: string;
  /** From the Fixer's dealer. */
  price: number;
  /** What the police fine you when they catch you with it, and they keep the gun. */
  fine: number;
  /** The chance a shot hits. */
  aim: number;
  /** How long someone it hits stays hurt (real minutes). */
  hurtMin: number;
  /** Rounds it uses for one robbery or shooting. */
  rounds: number;
}

export const GUNS: Record<GunId, GunDef> = {
  danegun: { id: 'danegun', name: 'Dane gun', icon: '🪵', blurb: 'Locally made, loads from the front. Sometimes it just goes click.', price: 90_000, fine: 1_000_000, aim: 0.35, hurtMin: 12, rounds: 1 },
  pistol: { id: 'pistol', name: 'Pistol', icon: '🔫', blurb: 'Small, quiet enough, fits under a shirt.', price: 650_000, fine: 2_500_000, aim: 0.55, hurtMin: 20, rounds: 1 },
  pump: { id: 'pump', name: 'Pump-action', icon: '💥', blurb: 'What the mai-gadi at the bank carries. Nobody argues with it.', price: 1_600_000, fine: 4_000_000, aim: 0.65, hurtMin: 30, rounds: 2 },
  ak47: { id: 'ak47', name: 'AK-47', icon: '🪖', blurb: 'Not for sale to civilians. Which is why the Fixer has one.', price: 4_500_000, fine: 8_000_000, aim: 0.78, hurtMin: 40, rounds: 3 },
};
export const GUN_LIST = Object.values(GUNS);
export const isGun = (id: unknown): id is GunId => typeof id === 'string' && id in GUNS;

export const GUN_RULES = {
  /** A new gun comes with this many rounds, and a box adds this many. */
  startRounds: 6,
  box: { rounds: 10, price: 30_000 },
  /** A bulletproof vest stops this many hits before it is done. */
  vest: { price: 400_000, hits: 2 },
  /** An armed bodyguard walks with you for this long and stops this share of robberies and shootings. */
  escort: { price: 150_000, hours: 2, stops: 0.75, aim: 0.6 },
  /** You have to be this close (tiles) to someone, in the same place, to rob or shoot them. */
  reach: 4,
  /** Between one armed job and the next. */
  cooldownMs: 5 * 60_000,
  /** Someone robbed or shot can't be again for this long. */
  victimShieldMs: 10 * 60_000,
  /** At gunpoint most people hand it over: this share of their cash, up to the cap. */
  rob: { min: 0.25, max: 0.5, cap: 750_000, works: 0.85 },
  /** Shot: what the shooter grabs off them as they go down, and the hospital bill. */
  shoot: { grab: 0.2, grabCap: 300_000, bill: 25_000, billPct: 0.1, billCap: 150_000 },
  /** An armed victim draws first this often, scaled by how good their gun is. */
  shootBack: 0.6,
  /** The police come for a shooter this often. */
  traced: 0.7,
};

/** Sticking up someone who isn't a player: a passer-by on the street, or a shop's till. */
export type HoldupKind = 'passerby' | 'shop';
export const HOLDUPS: Record<HoldupKind, { label: string; icon: string; blurb: string; loot: [number, number]; works: number; police: number; shotBack: number }> = {
  passerby: { label: 'Rob a passer-by', icon: '🚶🏾', blurb: 'Small money, quick. Somebody always calls the police.', loot: [15_000, 80_000], works: 0.8, police: 0.25, shotBack: 0 },
  shop: { label: 'Hold up a shop', icon: '🏪', blurb: 'The till and the POS cash. The shopkeeper might have a gun under the counter.', loot: [120_000, 600_000], works: 0.6, police: 0.45, shotBack: 0.3 },
};

/** What I carry, as the server tells it (GET /api/guns). */
export interface GunState {
  gun: { id: GunId; ammo: number } | null;
  /** Hits my vest can still stop. */
  vest: number;
  /** My armed bodyguard is with me until then. */
  escortUntil: number | null;
  /** My next armed job can be from then. */
  readyAt: number;
  /** The police took my gun, and fined me, when I was last arrested. */
  seized?: GunSeizure | null;
}

/** A gun the police found on someone they arrested: which, and the fine they paid (as much of it as they had). */
export interface GunSeizure {
  gun: GunId;
  fine: number;
}

/** The outcome of an armed job, for the one who did it. */
export interface GunResult {
  outcome: 'robbed' | 'shot' | 'missed' | 'shotBack' | 'escort' | 'vest' | 'empty' | 'arrested' | 'failed';
  amount: number;
  /** I was hit: I'm hurt until then, and paid this at the hospital. */
  hurtUntil?: number | null;
  bill?: number;
  /** The police are after me now. */
  wanted?: boolean;
  /** Jailed on the spot (a hold-up gone wrong) until then. */
  jailedUntil?: number | null;
  /** …and the police took the gun, with a fine. */
  seized?: GunSeizure | null;
}

/** Someone shot me (or held me up at gunpoint), pushed to me (worker/guns.ts). */
export type ShotEvent = { t: 'shot'; by: string; gun: GunId; hurt: boolean; until: number | null; bill: number; took: number; vest: boolean };
