// Cars wear out. Each car has parts that lose health with every trip and cruise, and now and then
// something just breaks (a tyre bursts, the battery dies). A spoilt engine, battery or tyre means the
// car won't move until the mechanic fixes it. The worse the condition, the less the car is worth.

import { CAR_BY_ID, CAR_RESALE_FACTOR } from './cars';

export type CarPart = 'engine' | 'battery' | 'tyres' | 'brakes' | 'suspension' | 'ac';

export interface PartRule {
  label: string;
  icon: string;
  /** Share of the car's price that a full rebuild of this part costs. */
  costShare: number;
  /** Health lost per trip (a random amount up to this). */
  wear: number;
  /** How much this part counts towards the car's overall condition. */
  weight: number;
  /** Spoilt (0): the car can't be driven. */
  critical: boolean;
  /** What breaking sounds like. */
  breaks: string;
}

export const PARTS: Record<CarPart, PartRule> = {
  engine: { label: 'Engine', icon: '⚙️', costShare: 0.18, wear: 2, weight: 0.35, critical: true, breaks: 'The engine knocked and died. Smoke everywhere' },
  battery: { label: 'Battery', icon: '🔋', costShare: 0.015, wear: 3, weight: 0.05, critical: true, breaks: 'Battery is dead. The car no gree start' },
  tyres: { label: 'Tyres', icon: '🛞', costShare: 0.03, wear: 4, weight: 0.15, critical: true, breaks: 'Tyre burst! You are on the rim now' },
  brakes: { label: 'Brakes', icon: '🛑', costShare: 0.025, wear: 3, weight: 0.15, critical: false, breaks: 'The brakes are screaming. Pedal goes to the floor' },
  suspension: { label: 'Suspension', icon: '🔩', costShare: 0.04, wear: 3, weight: 0.2, critical: false, breaks: 'Shock absorber gone. Every bump shakes your teeth' },
  ac: { label: 'AC', icon: '❄️', costShare: 0.02, wear: 2, weight: 0.1, critical: false, breaks: 'AC is blowing hot air. Welcome to Naija heat' },
};

export const PART_IDS = Object.keys(PARTS) as CarPart[];

export interface CarCondition {
  parts: Record<CarPart, number>;
  /** Trips driven. Mileage keeps knocking the value down even after repairs. */
  trips: number;
}

export const CAR_CARE = {
  /** Chance per trip that something suddenly breaks badly. */
  breakdownChance: 0.04,
  /** A sudden break takes this much off a part. */
  breakdownHit: [35, 70] as const,
  /** Value lost per trip, down to `mileageFloor` of the price. */
  mileagePerTrip: 0.002,
  mileageFloor: 0.7,
  /** Below this, a part warns you. */
  warnAt: 30,
};

export const newCondition = (): CarCondition => ({ parts: { engine: 100, battery: 100, tyres: 100, brakes: 100, suspension: 100, ac: 100 }, trips: 0 });

export const conditionOf = (all: Record<string, CarCondition> | undefined, carId: string): CarCondition => {
  const c = all?.[carId];
  return c ? { trips: c.trips ?? 0, parts: { ...newCondition().parts, ...c.parts } } : newCondition();
};

/** 0–1, weighted across the parts. */
export const healthOf = (c: CarCondition) => PART_IDS.reduce((sum, p) => sum + (c.parts[p] / 100) * PARTS[p].weight, 0);

/** The part stopping the car from moving, if any. */
export const blockerOf = (c: CarCondition): CarPart | null => PART_IDS.find((p) => PARTS[p].critical && c.parts[p] <= 0) ?? null;

/** What the car is worth to you: a wreck still fetches 35% of what a perfect one does. */
export function valueOf(carId: string, c: CarCondition) {
  const car = CAR_BY_ID[carId];
  if (!car) return 0;
  const mileage = Math.max(CAR_CARE.mileageFloor, 1 - c.trips * CAR_CARE.mileagePerTrip);
  return Math.round(car.price * mileage * (0.35 + 0.65 * healthOf(c)));
}

export const resaleOf = (carId: string, c: CarCondition) => Math.round(valueOf(carId, c) * CAR_RESALE_FACTOR);

/** The mechanic's bill to bring one part back to 100. */
export function repairCost(carId: string, c: CarCondition, part: CarPart) {
  const car = CAR_BY_ID[carId];
  if (!car) return 0;
  const damage = 100 - c.parts[part];
  return damage <= 0 ? 0 : Math.max(2_000, Math.round((car.price * PARTS[part].costShare * damage) / 100 / 500) * 500);
}

export const repairAllCost = (carId: string, c: CarCondition) => PART_IDS.reduce((sum, p) => sum + repairCost(carId, c, p), 0);

/** Wear from one trip (rough roads wear the tyres and suspension faster). Returns what broke, if anything. */
export function wear(c: CarCondition, roughness = 1, rand = Math.random): { next: CarCondition; broke: CarPart | null } {
  const parts = { ...c.parts };
  for (const p of PART_IDS) {
    const rough = p === 'tyres' || p === 'suspension' ? roughness : 1;
    parts[p] = Math.max(0, parts[p] - rand() * PARTS[p].wear * rough);
  }
  // Worn parts are the ones that give out.
  let broke: CarPart | null = null;
  const weakest = Math.min(...PART_IDS.map((p) => parts[p]));
  if (rand() < CAR_CARE.breakdownChance * (1 + (100 - weakest) / 50)) {
    const odds = PART_IDS.map((p) => 101 - parts[p]);
    let pick = rand() * odds.reduce((a, b) => a + b, 0);
    broke = PART_IDS.find((_, i) => (pick -= odds[i]) < 0) ?? 'tyres';
    const [lo, hi] = CAR_CARE.breakdownHit;
    parts[broke] = Math.max(0, parts[broke] - (lo + rand() * (hi - lo)));
  }
  for (const p of PART_IDS) parts[p] = Math.round(parts[p]);
  return { next: { parts, trips: c.trips + 1 }, broke };
}

/** One hit to one part (a pothole, a crash). */
export function damage(c: CarCondition, part: CarPart, amount: number): CarCondition {
  return { ...c, parts: { ...c.parts, [part]: Math.max(0, Math.round(c.parts[part] - amount)) } };
}
