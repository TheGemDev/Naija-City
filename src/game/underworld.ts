// The crime ladder and the motor parks. Shared by the game and the server (worker/fun.ts), which keeps
// the real crime record: successful thefts and scams that paid off. Climb from small-time thief to
// godfather, then take over a motor park and collect "dues" from every keke and okada fare there.

export interface CrimeTier {
  id: 'clean' | 'thief' | 'areaboy' | 'agbero' | 'godfather';
  title: string;
  icon: string;
  /** Crime score needed. */
  min: number;
}

export const CRIME_TIERS: CrimeTier[] = [
  { id: 'clean', title: 'Clean hands', icon: '😇', min: 0 },
  { id: 'thief', title: 'Small-time thief', icon: '🤏', min: 2 },
  { id: 'areaboy', title: 'Area boy', icon: '😎', min: 5 },
  { id: 'agbero', title: 'Agbero', icon: '🎫', min: 9 },
  { id: 'godfather', title: 'Godfather', icon: '🕴🏾', min: 15 },
];

export const crimeTier = (score: number) => [...CRIME_TIERS].reverse().find((t) => score >= t.min)!;
export const nextCrimeTier = (score: number) => CRIME_TIERS.find((t) => t.min > score) ?? null;

/** Points per thing on the server's record. */
export const CRIME_POINTS = { theft: 2, failedTheft: 0.5, scam: 2, turfWin: 3, checkpointEscape: 0.5 };

export interface MotorPark {
  id: string;
  name: string;
  /** Map place where you stand to claim or collect. */
  place: string;
  /** The city it is in (game/regions.ts). */
  city: string;
}

export const PARKS: MotorPark[] = [
  { id: 'kawo', name: 'Kawo Motor Park', place: 'motorpark', city: 'kaduna' },
  { id: 'utako', name: 'Utako Motor Park', place: 'motorpark', city: 'abuja' },
  { id: 'oshodi', name: 'Oshodi Transport Interchange', place: 'motorpark', city: 'lagos' },
  { id: 'naibawa', name: 'Naibawa Motor Park', place: 'motorpark', city: 'kano' },
];
export const PARK_BY_ID: Record<string, MotorPark> = Object.fromEntries(PARKS.map((p) => [p.id, p]));
/** The motor park of that city (Kawo for a city with none). */
export const parkIn = (city?: string | null) => PARKS.find((p) => p.city === city) ?? PARKS[0];

export const PARK_RULES = {
  /** Tier needed to claim an empty park or challenge its boss. */
  claimTier: 'agbero' as CrimeTier['id'],
  /** "Settle" the elders to take an empty park. */
  claimCost: 50_000,
  /** War chest for a turf war; lost if you lose. */
  warCost: 30_000,
  /** If you lose a turf war, chance the police scoop you up too. */
  warArrestChance: 0.3,
  /** Base dues per real hour of control, plus whatever levies keke/okada drivers paid. */
  duesPerHour: 3_000,
  /** Dues pile up for at most this long between collections. */
  maxDuesHours: 12,
  /** Each collection: chance (scaled by patrols / 50) of a police raid that ends your reign. */
  raidChance: 0.08,
  raidFine: 40_000,
  /** A boss can be challenged again only after this long. */
  shieldMs: 30 * 60_000,
};

export const tierIndex = (id: CrimeTier['id']) => CRIME_TIERS.findIndex((t) => t.id === id);
