// How much power the house burns, what NEPA charges for it, and whether the cameras still have juice.
// Shared by the client (store.ts, the Light app) and the worker (which decides camera catches).

export const POWER = {
  /** Naira per kWh on NEPA. Deliberately painful: a generator or the sun is cheaper. */
  tariff: 2_500,
  /** Lights, fans and chargers: always on. kW */
  lights: 0.2,
  /** Extra load while you use an appliance (TV, console, shower…). kW */
  active: 1,
  /** Heavy appliances in use. kW */
  activeHeavy: 2,
  /** A tenant living in a house you rent out. kW */
  tenant: 0.6,
  /** NEPA takes the bill from your account at this hour each game day, after a warning at warnHour. */
  billHour: 8,
  warnHour: 5,
  /** Owe NEPA more than this and they cut you off until you pay. */
  cutoff: 250_000,
  /** The load the generator and inverter drain rates were tuned for. kW */
  refLoad: 1,
};

/**
 * Generators, small to big, in kW. `max` is the most a set can carry: an appliance that would take the house over it
 * will not start while the gen is what's carrying the house. `rated` is the load it burns its normal fuel at (more
 * load, faster burn), `burn` the tank percent an hour at that load, `can` what one jerrycan adds to its tank (0–100).
 */
export const GENERATORS: Record<string, { rated: number; max: number; burn: number; can: number }> = {
  generator: { rated: 1, max: 2.5, burn: 9, can: 50 },
  generator_3kva: { rated: 2.5, max: 5, burn: 7, can: 35 },
  generator_10kva: { rated: 5, max: 10, burn: 5, can: 20 },
  generator_silent: { rated: 10, max: 30, burn: 3.5, can: 10 },
};
export const isGenerator = (type: string) => Object.hasOwn(GENERATORS, type);
/** The set wired to the house: the biggest one in it. */
export function generatorOf(items: { type: string }[]): string | null {
  let best: string | null = null;
  for (const i of items) if (isGenerator(i.type) && (!best || GENERATORS[i.type].max > GENERATORS[best].max)) best = i.type;
  return best;
}
/** Tank percent a running generator burns in an hour under this load. */
export const genBurn = (type: string, load: number) => GENERATORS[type].burn * Math.min(3, Math.max(0.5, load / GENERATORS[type].rated));

/** Appliances that stay on all day, in kW. Cameras never sleep. */
export const STANDBY_KW: Record<string, number> = {
  cctv: 0.1,
  fridge: 0.25,
  smart_fridge: 0.4,
  freezer: 0.35,
  aquarium: 0.15,
  /** The tank keeps its water hot all day. */
  water_heater: 0.3,
  wine_cellar: 0.2,
  swimming_pool: 0.4,
  fountain: 0.15,
  chandelier_lamp: 0.08,
  floor_lamp: 0.04,
  /** The dish stays online day and night. */
  starlink: 0.1,
  mini_fridge: 0.1,
  security_light: 0.15,
  garden_lamp: 0.04,
};

/** What each powered activity pulls while you do it, in kW. Anything powered but not listed uses POWER.active. */
export const ACTION_KW: Record<string, number> = {
  // Cooling and fans
  chill_ac: 1.5, cool_fan: 0.08, chill_tower: 2.2, cool_mist: 0.2,
  // Heating: the big draws
  warm_up: 1.8, bake_meat_pie: 2.4, roast_chicken: 2.4, white_rice: 0.7,
  hot_bucket: 2, hot_shower: 2.5, steam: 3, jets: 1.5, tub_chill: 1.5, soak: 1.5, spa_date: 1.5,
  // Kitchen
  reheat: 1.2, zobo: 0.5, smoothie: 0.5, frozen_meal: 1.2, drink_water: 0.2, wash: 0.6,
  // Screens and sound
  blockbuster: 1.2, movie_night: 1.4, champions_league: 1.2, kannywood: 0.15, football: 0.15,
  play_xbox: 0.3, xbox_friends: 0.4, fifa: 0.3, fifa_friends: 0.4, arcade: 0.5,
  sing: 0.3, karaoke_night: 0.6, play_music: 0.3, house_dance: 0.5, pool_party: 1,
  // Work, hobbies, comfort
  course: 0.1, games: 0.2, chat: 0.1, sew: 0.15, massage: 0.4, treadmill_run: 2, watch_fish: 0.15,
  wine_tasting: 0.05, wine_dinner: 0.1, admire: 0.05,
  // Small appliances
  air_fry: 1.4, brew_tea: 1.8, espresso: 1.3, cold_drink: 0.1, popcorn: 0.9, iron_clothes: 1.2,
  mix_set: 0.6, house_party: 1.2, vr_game: 0.25, practise_keys: 0.05,
};

/** Which supply the owner chose: the grid (with backups when it drops), or the grid off and just solar or just the generator. */
export type PowerMode = 'grid' | 'solar' | 'gen';
export const modeOf = (p?: { mode?: PowerMode }): PowerMode => p?.mode ?? 'grid';
/** True when the house is drawing from (and being billed by) NEPA. */
export const onGrid = (p: { grid?: boolean; mode?: PowerMode }) => !!p.grid && modeOf(p) === 'grid';

/** kW an activity pulls while you do it. */
export const actionKw = (action: string) => ACTION_KW[action] ?? POWER.active;

/** A spoilt appliance (game/breakdowns.ts) draws nothing. */
export const standbyOf = (items: { type: string; broken?: boolean }[]) => items.reduce((a, i) => a + (i.broken ? 0 : STANDBY_KW[i.type] ?? 0), 0);
export const cameraCount = (items: { type: string }[]) => items.filter((i) => i.type === 'cctv').length;

/** Total draw in kW; `using` is the appliance action currently running, if it needs power. */
export function houseLoad(items: { type: string }[], using?: string | null) {
  return POWER.lights + standbyOf(items) + (using ? actionKw(using) : 0);
}

/** The inverter drains faster when the house pulls more than it was tuned for. */
export const drainScale = (load: number) => Math.min(3, Math.max(0.5, load / POWER.refLoad));

export type PowerSave = {
  items?: { type: string }[];
  minutes?: number;
  nepaOwed?: number;
  power?: { battery?: number; genFuel?: number; genOn?: boolean; mode?: PowerMode };
};

/**
 * What a house can run on, read from its owner's save: `grid` is NEPA whenever it is up (and the bill is paid),
 * `solar` the panels or the inverter, `gen` the generator that would carry it. Sent to visitors, so their screen
 * lights the house from its owner's supply and not from their own.
 */
export type Supply = { grid: boolean; solar: boolean; gen: string | null };
export function supplyOf(save: PowerSave, items: { type: string }[]): Supply {
  const p = save.power ?? {};
  const mode = modeOf(p);
  const h = ((save.minutes ?? 0) % 1440) / 60;
  return {
    grid: mode === 'grid' && (save.nepaOwed ?? 0) < POWER.cutoff,
    solar: mode !== 'gen' && items.some((i) => i.type === 'solar') && ((h >= 7 && h < 19) || (p.battery ?? 100) > 0),
    gen: mode !== 'solar' && !!p.genOn && (p.genFuel ?? 0) > 0 ? generatorOf(items) : null,
  };
}
/** The house has light: NEPA while the grid is up, or whatever backs it up. */
export const supplied = (s: Supply, gridNow: boolean) => (s.grid && gridNow) || s.solar || !!s.gen;
/** The generator carrying the house because nothing else is, or null. */
export const supplyGen = (s: Supply, gridNow: boolean) => ((s.grid && gridNow) || s.solar ? null : s.gen);

/** Cameras only watch while the house has power: NEPA (and paid up), solar or inverter, or a running generator. */
export const camerasPowered = (save: PowerSave, items: { type: string }[], gridNow: boolean) => supplied(supplyOf(save, items), gridNow);
