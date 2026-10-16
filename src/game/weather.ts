// The sky over each city: clear, cloudy, harmattan haze, rain or a thunderstorm. Like the live events and NEPA
// (game/live.ts) it is a pure function of real time, so every player in a city sees the same weather at the same
// moment without asking the server. The game clock is per player (tasks skip it ahead), so real time is the one
// clock everybody shares.
//
// It follows the real Nigerian seasons: rain from April to October (the south starts earlier and stops later, and
// Lagos gets its "August break"), the harmattan blowing dust down from the Sahara from November to February, worst
// in the far north. A flash flood on the roads brings rain with it, and harmattan dust on the roads or over Kano
// brings the haze, so the sky never contradicts the road news.

import { activeEvent, activeRoadEvent, hash } from './live';
import { daylightHeld } from './theme';

export type WeatherKind = 'clear' | 'cloudy' | 'harmattan' | 'rain' | 'storm';

/** The weather holds for this long (real time: a quarter of a game day, six game hours) before it can change. */
export const WEATHER_SLOT_MS = 15 * 60_000;

export const WEATHER: Record<WeatherKind, { icon: string; night: string; label: string }> = {
  clear: { icon: '☀️', night: '🌙', label: 'Clear' },
  cloudy: { icon: '⛅', night: '☁️', label: 'Cloudy' },
  harmattan: { icon: '🌫️', night: '🌫️', label: 'Harmattan haze' },
  rain: { icon: '🌧️', night: '🌧️', label: 'Rain' },
  storm: { icon: '⛈️', night: '⛈️', label: 'Thunderstorm' },
};

/** How far north a city is (0 the coast, 1 the Sahel): the north is drier, with a shorter rainy season and thicker harmattan. */
const NORTH: Record<string, number> = { lagos: 0, abuja: 0.5, kaduna: 0.7, kano: 1 };

// Chance of rain by month, January first: the coast and the far north. Lagos dips in August (the "August break").
const WET_SOUTH = [0.05, 0.12, 0.35, 0.6, 0.8, 1, 0.8, 0.45, 0.85, 0.7, 0.3, 0.05];
const WET_NORTH = [0, 0, 0.02, 0.08, 0.35, 0.65, 0.9, 1, 0.65, 0.15, 0, 0];
// Harmattan dust by month, strongest in the dry heart of the season.
const DUST = [1, 0.75, 0.3, 0.05, 0, 0, 0, 0, 0, 0.05, 0.4, 0.9];

/** The month (0 to 11) in Nigeria, which is an hour ahead of UTC all year. */
const monthAt = (now: number) => new Date(now + 3600_000).getUTCMonth();

/** The weather the season deals for one slot, before road and city events have their say. */
function dealt(slot: number, city: string): WeatherKind {
  const north = NORTH[city] ?? 0.6;
  const month = monthAt(slot * WEATHER_SLOT_MS);
  const wet = WET_SOUTH[month] * (1 - north) + WET_NORTH[month] * north;
  const dust = DUST[month] * (0.25 + 0.75 * north);
  const weights: [WeatherKind, number][] = [
    ['clear', 3 * (1 - wet * 0.7) * (1 - dust * 0.6)],
    ['cloudy', 1.2 + wet * 1.5],
    ['harmattan', dust * 5],
    ['rain', wet * 2.6],
    ['storm', wet * 1.3],
  ];
  const total = weights.reduce((a, [, w]) => a + w, 0);
  // Each city rolls its own sky, so it can rain in Lagos while Kano is dusty.
  let roll = ((hash(slot * 97 + city.length * 13 + city.charCodeAt(0)) % 10_000) / 10_000) * total;
  for (const [kind, w] of weights) {
    if ((roll -= w) < 0) return kind;
  }
  return 'clear';
}

/** A storm never stops dead: the slot after one stays wet or clouded over. */
function slotWeather(slot: number, city: string): WeatherKind {
  const now = dealt(slot, city);
  const before = dealt(slot - 1, city);
  if (before === 'storm' && (now === 'clear' || now === 'harmattan')) return 'cloudy';
  return now;
}

/** The weather in that city right now: the same answer for every player there. */
export function weatherAt(now = Date.now(), city = 'kaduna'): WeatherKind {
  const road = activeRoadEvent(now);
  const live = activeEvent(now, city);
  if (live === 'lekkiflood') return 'storm';
  const sky = slotWeather(Math.floor(now / WEATHER_SLOT_MS), city);
  if (road === 'flood') return sky === 'storm' ? 'storm' : 'rain';
  if (road === 'harmattan' || live === 'harmattan') return 'harmattan';
  return sky;
}

/** The slot before this one rained: the ground is still drying when a page first opens. */
export const rainedJustNow = (now = Date.now(), city = 'kaduna') => {
  const w = weatherAt(now - WEATHER_SLOT_MS, city);
  return w === 'rain' || w === 'storm';
};

/** Lightning strikes at the same instants for everybody in a storm: a flash this bright (0 to 1) right now. */
export function lightningAt(now = Date.now()) {
  const second = Math.floor(now / 1000);
  // About one strike every forty seconds, each a quick double flicker.
  if (hash(second * 3 + 11) % 40 !== 0) return 0;
  const t = (now % 1000) / 1000;
  const flick = t < 0.08 ? 1 : t < 0.14 ? 0.15 : t < 0.22 ? 0.8 : Math.max(0, 0.8 - (t - 0.22) * 3);
  return flick;
}

/* ---------- Temperature ---------- */

// Typical afternoon highs and pre-dawn lows (°C) by month, January first: Lagos on the coast, where the sea keeps it
// muggy and even, and Kano in the Sahel, baking in April and cold on harmattan nights.
const HIGH_SOUTH = [32, 33, 33, 32, 31, 29, 28, 28, 29, 30, 31, 32];
const LOW_SOUTH = [23, 25, 25, 24, 24, 23, 23, 22, 23, 23, 24, 23];
const HIGH_NORTH = [30, 33, 37, 39, 38, 35, 31, 30, 31, 34, 33, 30];
const LOW_NORTH = [13, 16, 20, 24, 25, 23, 22, 21, 21, 19, 16, 13];

/** Roughly how hot it is in that city at that hour (of the game clock) in that weather, in °C. */
export function temperatureAt(city: string, hour: number, kind: WeatherKind, now = Date.now()) {
  const north = NORTH[city] ?? 0.6;
  const month = monthAt(now);
  const high = HIGH_SOUTH[month] * (1 - north) + HIGH_NORTH[month] * north;
  const low = LOW_SOUTH[month] * (1 - north) + LOW_NORTH[month] * north;
  // Hottest at three in the afternoon, coolest at three in the morning.
  const warm = (1 + Math.cos(((hour - 15) / 24) * Math.PI * 2)) / 2;
  let t = low + (high - low) * warm;
  if (kind === 'cloudy') t -= 1.5 * warm;
  if (kind === 'rain') t -= 1 + 5 * warm;
  if (kind === 'storm') t -= 2 + 6 * warm;
  // Dry dusty air loses its heat at night.
  if (kind === 'harmattan') t -= 3 * (1 - warm);
  return Math.round(t);
}

/* ---------- What the scene is showing ---------- */

// The weather above is the target; the scene eases towards it so a change rolls in over a few seconds instead of
// snapping. These numbers are written every frame by three/Weather.tsx and read by anything that draws weather.

export interface Sky {
  /** Cloud cover, 0 to 1. */
  cloud: number;
  /** Dust or mist in the air, 0 to 1. */
  haze: number;
  /** How hard it is raining, 0 to 1. */
  rain: number;
  /** How wet the ground is: it lags the rain and dries off slowly after. */
  wet: number;
  /** Lightning flash right now, 0 to 1. */
  flash: number;
  /** How much of the sun gets through, 0 to 1. */
  sun: number;
}

export const SKY_OF: Record<WeatherKind, Omit<Sky, 'wet' | 'flash'>> = {
  clear: { cloud: 0, haze: 0, rain: 0, sun: 1 },
  cloudy: { cloud: 0.7, haze: 0.08, rain: 0, sun: 0.7 },
  harmattan: { cloud: 0, haze: 1, rain: 0, sun: 0.6 },
  rain: { cloud: 0.9, haze: 0.3, rain: 0.65, sun: 0.42 },
  storm: { cloud: 1, haze: 0.45, rain: 1, sun: 0.28 },
};

export const sky: Sky = { cloud: 0, haze: 0, rain: 0, wet: 0, flash: 0, sun: 1 };

/** Dev and photo tools can pin the weather; null follows the real sky. */
let pinned: WeatherKind | null = null;
export const pinWeather = (kind: WeatherKind | null) => {
  pinned = kind;
};
export const pinnedWeather = () => pinned;

/** The weather the scene draws in that city: a pinned one, a clear sky on a city tour, or the real thing. */
export const sceneWeather = (city: string, now = Date.now()): WeatherKind => pinned ?? (daylightHeld() ? 'clear' : weatherAt(now, city));

/** Seconds for the sky to settle on new weather, for the ground to get soaked, and for it to dry off again. */
const SETTLE = 6;
const SOAK = 12;
const DRY = 150;
let settled: string | null = null;

/** Eases `sky` a frame towards the weather in that city. Called once a frame by the scene's lighting (three/Scene.tsx). */
export function stepSky(dt: number, city: string, now = Date.now()) {
  const kind = sceneWeather(city, now);
  const want = SKY_OF[kind];
  // A city just landed in (or the page just opened) starts on its own weather, wet ground and all.
  if (settled !== city) {
    settled = city;
    Object.assign(sky, want);
    sky.wet = want.rain > 0.3 || (!pinned && !daylightHeld() && rainedJustNow(now, city)) ? 1 : 0;
  }
  const k = 1 - Math.exp(-dt / SETTLE);
  sky.cloud += (want.cloud - sky.cloud) * k;
  sky.haze += (want.haze - sky.haze) * k;
  sky.rain += (want.rain - sky.rain) * k;
  sky.sun += (want.sun - sky.sun) * k;
  const soaking = want.rain > 0.3;
  sky.wet += ((soaking ? 1 : 0) - sky.wet) * (1 - Math.exp(-dt / (soaking ? SOAK : DRY)));
  sky.flash = kind === 'storm' ? lightningAt(now) : 0;
  return kind;
}
