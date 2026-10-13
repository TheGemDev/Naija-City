// Jobs as they are held: one job, at one workplace, in one city. Kaduna, Abuja, Lagos and Kano each have their own bank,
// market and motor park (the cities share place ids), so a Bank Teller hired in Abuja works at Abuja's bank and
// nowhere else. Rules only: the store (game/store.ts) holds the job, game/work.ts gets you to it.

import { JOBS, type Job } from './catalog';
import { CITY_MAPS, type Place } from './city';
import { REGION_IDS } from './regions';
import { GAME_DAY_MINUTES } from './timeRates';

export const jobById = (id: string | null | undefined): Job | undefined => (id ? JOBS.find((j) => j.id === id) : undefined);

/** The cities that hire, in the order the Jobs app lists them. */
export const JOB_CITIES: readonly string[] = REGION_IDS;

/** Where a job is done in a city, if that city has such a place: only Kaduna has a refinery. */
export function workplaceOf(jobId: string | null | undefined, city: string | null | undefined): Place | undefined {
  if (!jobId || !city || !Object.hasOwn(CITY_MAPS, city)) return undefined;
  return CITY_MAPS[city].places.find((p) => p.jobs?.includes(jobId));
}

/** The jobs going in a city. */
export const jobsIn = (city: string) => JOBS.filter((j) => workplaceOf(j.id, city));

export interface Employment {
  job: Job;
  /** The city the workplace is in. */
  city: string;
  place: Place;
}

/** The job you hold and where it is. A job from before jobs had a city is Kaduna's. */
export function employment(s: { jobId: string | null; jobCity: string | null }): Employment | null {
  const job = jobById(s.jobId);
  if (!job) return null;
  const city = workplaceOf(job.id, s.jobCity) ? s.jobCity! : 'kaduna';
  const place = workplaceOf(job.id, city);
  return place ? { job, city, place } : null;
}

/** Game minutes in a job's full shift. */
export const shiftMinutes = (job: Pick<Job, 'start' | 'end'>) => (job.end <= job.start ? 24 - job.start + job.end : job.end - job.start) * 60;

export const SHIFT_TIMES = {
  /** The call to work goes out this many game minutes before the shift starts. */
  soon: 60,
  /** No clocking in with less than this left of the shift. */
  lastCall: 60,
} as const;

export interface ShiftClock {
  /** `on`: you can clock in now. `soon`: it starts within the hour. `off`: neither. */
  phase: 'on' | 'soon' | 'off';
  /** Game minutes left of the shift running now (0 when none is). */
  left: number;
  /** Game minutes until the next shift starts (0 while one is running). */
  startsIn: number;
  /** The day the shift belongs to (the one running, or else the next): a night shift is its evening's, past midnight too. */
  day: number;
}

/** Where a job's shift stands at a minute of the world clock. */
export function shiftClock(job: Pick<Job, 'start' | 'end'>, minutes: number): ShiftClock {
  const length = shiftMinutes(job);
  const since = (((minutes - job.start * 60) % GAME_DAY_MINUTES) + GAME_DAY_MINUTES) % GAME_DAY_MINUTES;
  const dayOf = (m: number) => Math.floor(m / GAME_DAY_MINUTES) + 1;
  if (since < length) {
    const left = length - since;
    // Too late to clock in: the next call is for tomorrow's shift.
    if (left <= SHIFT_TIMES.lastCall) return { phase: 'off', left, startsIn: GAME_DAY_MINUTES - since, day: dayOf(minutes - since) + 1 };
    return { phase: 'on', left, startsIn: 0, day: dayOf(minutes - since) };
  }
  const startsIn = GAME_DAY_MINUTES - since;
  return { phase: startsIn <= SHIFT_TIMES.soon ? 'soon' : 'off', left: 0, startsIn, day: dayOf(minutes + startsIn) };
}

/** Every day worked adds 2% to the wage, up to 40%. */
export const streakPay = (workDays: number) => 1 + Math.min(workDays, 20) * 0.02;

/** The wage for `worked` game minutes of a shift. `mult` is everything that lifts the pay: streak, origin, rank. */
export const wageFor = (job: Pick<Job, 'start' | 'end' | 'pay'>, worked: number, mult: number) =>
  Math.round(job.pay * Math.min(1, Math.max(0, worked) / shiftMinutes(job)) * mult);

/** "8:00 – 18:00" */
export const shiftHours = (job: Pick<Job, 'start' | 'end'>) => `${job.start}:00 – ${job.end}:00`;
