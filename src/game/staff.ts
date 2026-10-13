export type StaffRole = 'cook' | 'cleaner' | 'security' | 'driver' | 'nanny' | 'protection';
/** House-based roles stay at the property; personal roles follow the player. */
export type HouseStaffRole = 'cook' | 'cleaner' | 'security';
export type PersonalStaffRole = 'driver' | 'nanny' | 'protection';

export interface HouseholdStaff {
  role: StaffRole;
  paidThrough: number;
  /** Personal staff only: the house they work from (a property id, or STARTER_HOUSE). */
  propertyId?: string;
}

/** The government starter house everyone but a Sapa / Gbese start begins in. */
export const STARTER_HOUSE = 'starter';

export const HOUSEHOLD_STAFF: Record<StaffRole, { name: string; icon: string; wage: number; blurb: string; personal?: boolean }> = {
  cook:       { name: 'Cook',             icon: '👩🏾‍🍳', wage: 2_000,  blurb: 'Keeps you fed while you are at home.' },
  cleaner:    { name: 'Cleaner',          icon: '🧹',    wage: 1_500,  blurb: 'Keeps the house clean and your hygiene up.' },
  security:   { name: 'Security Guard',   icon: '🛡️',   wage: 5_000,  blurb: 'Catches burglars and hands them over to the police.' },
  driver:     { name: 'Driver',           icon: '🚗',    wage: 3_000,  blurb: 'Drives you around town from the house you assign them to.', personal: true },
  nanny:      { name: 'Nanny',            icon: '👶',    wage: 2_500,  blurb: 'Looks after the household at the house you assign them to.', personal: true },
  protection: { name: 'Bodyguard',        icon: '🕵️',   wage: 8_000,  blurb: 'Personal protection, based at the house you assign them to.', personal: true },
};

export const STAFF_ROLES      = Object.keys(HOUSEHOLD_STAFF) as StaffRole[];
export const HOUSE_STAFF_ROLES: HouseStaffRole[]    = ['cook', 'cleaner', 'security'];
export const PERSONAL_STAFF_ROLES: PersonalStaffRole[] = ['driver', 'nanny', 'protection'];

/** Daily chance that a given house staff member steals from the house. Personal staff don't steal. */
export const STAFF_THEFT_CHANCE: Record<HouseStaffRole, number> = { cook: 0.12, cleaner: 0.15, security: 0.10 };
/** A guard on the premises scares the others straight: their chance is multiplied by this. The guard is not deterred, and steals too. */
export const GUARD_DETERRENCE = 0.4;
/** Share of the player's cash a thief can take, and the hard cap (₦). */
export const STAFF_CASH_THEFT = { share: 0.08, cap: 100_000 };

/** Per-day theft probability for `role`, given everyone employed at the same house. */
export function staffTheftChance(role: HouseStaffRole, crew: readonly HouseholdStaff[]): number {
  const base = STAFF_THEFT_CHANCE[role];
  return role !== 'security' && crew.some((m) => m.role === 'security') ? base * GUARD_DETERRENCE : base;
}

export type StaffTheft = { kind: 'cash'; amount: number } | { kind: 'item'; index: number };

/** Roll one day's theft for one staff member. `rand` is injectable for testing. */
export function rollStaffTheft(
  role: HouseStaffRole,
  crew: readonly HouseholdStaff[],
  cash: number,
  itemCount: number,
  rand: () => number = Math.random,
): StaffTheft | null {
  if (rand() >= staffTheftChance(role, crew)) return null;
  const amount = Math.min(STAFF_CASH_THEFT.cap, Math.floor(Math.max(0, cash) * STAFF_CASH_THEFT.share));
  const takeItem = itemCount > 0 && (amount <= 0 || rand() < 0.5);
  if (takeItem) return { kind: 'item', index: Math.floor(rand() * itemCount) };
  return amount > 0 ? { kind: 'cash', amount } : null;
}
