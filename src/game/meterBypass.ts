// "Light connect": pay a NEPA boy off the Black Market app to bypass your meter so the light is cheap or free.
// Nothing stops it working, but NEPA's task force and the police can turn up for a random check, a neighbour
// can snitch, and any player who visits your house can report the dodgy wire. Get caught and you pay a fine
// (added to the NEPA bill), lose the bypass, and the plug won't touch you again for a while.
// Rules are shared by the client (store.ts, BlackMarket.tsx) and the worker.

import { POWER } from './power';

export type MeterLevel = 'off' | 'tamper' | 'bypass';
export type InspectionReason = 'audit' | 'tip' | 'report';

export interface MeterEvent {
  /** Game minute it happened. */
  at: number;
  reason: InspectionReason;
  /** Who reported it, for a player report. */
  by?: string;
  found: boolean;
  fine: number;
}

export interface MeterState {
  level: MeterLevel;
  /** Naira of electricity you haven't paid since the current connect. Feeds the fine. */
  saved: number;
  /** Times you've been caught. Every strike raises the fine and the chance of another check. */
  strikes: number;
  /** Game minute until which the plug won't connect you again. */
  banUntil: number;
  /** A player report waiting to be looked into (game minute it came in), if any. */
  reported: number | null;
  log: MeterEvent[];
}

export const NO_METER: MeterState = { level: 'off', saved: 0, strikes: 0, banUntil: 0, reported: null, log: [] };

export const METER = {
  tamper: {
    label: 'Slow the meter',
    icon: '🪛',
    blurb: 'The boy tampers with the meter so it spins slow. You pay about a third of the bill.',
    cost: 30_000,
    /** Share of the real bill you still pay. */
    billShare: 0.35,
    /** Chance per game hour of a random check / a neighbour snitching, before multipliers. */
    audit: 0.0015,
    tip: 0.001,
    /** Chance an inspector actually spots it. */
    detect: 0.6,
  },
  bypass: {
    label: 'Full bypass',
    icon: '🔌',
    blurb: 'The boy hooks you straight to the pole. Free light, but the wire is easy to spot.',
    cost: 80_000,
    billShare: 0,
    audit: 0.004,
    tip: 0.002,
    detect: 0.85,
  },
} as const;

/** A report from a visitor: the inspectors come straight away, and they know where to look. */
export const REPORT_DETECT = 0.95;
/** Heavy users stand out: the chance of a check grows with what you've saved, up to this multiple. */
const SAVED_PER_STEP = 200_000;
const MAX_SAVED_MULT = 3;
/** Each earlier strike makes the task force watch you closer. */
const STRIKE_MULT = 0.5;

export const FINE = {
  /** Back-billing: the fine is this multiple of the electricity you didn't pay for. */
  multiple: 2.5,
  min: 100_000,
  /** Added per earlier strike. */
  perStrike: 50_000,
  /** Days the plug refuses to touch you after you're caught. */
  banDays: 3,
};

export const meterOn = (m: MeterState | undefined) => !!m && m.level !== 'off';

/** The share of the real bill you still pay while connected. */
export const billShare = (level: MeterLevel) => (level === 'off' ? 1 : METER[level].billShare);

export const meterFine = (m: MeterState) =>
  Math.max(FINE.min, Math.round((m.saved * FINE.multiple) / 1000) * 1000) + m.strikes * FINE.perStrike;

const riskMult = (m: MeterState) =>
  Math.min(MAX_SAVED_MULT, 1 + m.saved / SAVED_PER_STEP) * (1 + m.strikes * STRIKE_MULT);

/**
 * Does somebody come knocking over `hours` of game time? `rnd` returns [0,1). Only a running meter can be
 * checked, so a house with nothing drawing power isn't at risk.
 */
export function rollInspection(m: MeterState, hours: number, rnd: () => number = Math.random): InspectionReason | null {
  if (!meterOn(m) || hours <= 0) return null;
  const cfg = METER[m.level as 'tamper' | 'bypass'];
  const mult = riskMult(m);
  const hit = (perHour: number) => rnd() < 1 - Math.pow(1 - Math.min(0.5, perHour * mult), hours);
  if (hit(cfg.audit)) return 'audit';
  if (hit(cfg.tip)) return 'tip';
  return null;
}

/** An inspector looks at the meter. Caught: the fine, the meter restored, the plug blacklists you. */
export function inspect(m: MeterState, reason: InspectionReason, now: number, by?: string, rnd: () => number = Math.random) {
  if (!meterOn(m)) return { meter: m, event: null as MeterEvent | null };
  const cfg = METER[m.level as 'tamper' | 'bypass'];
  const found = rnd() < (reason === 'report' ? REPORT_DETECT : cfg.detect);
  const fine = found ? meterFine(m) : 0;
  const event: MeterEvent = { at: now, reason, found, fine, ...(by ? { by } : {}) };
  const log = [event, ...m.log].slice(0, 8);
  const meter: MeterState = found
    ? { level: 'off', saved: 0, strikes: m.strikes + 1, banUntil: now + FINE.banDays * 1440, reported: null, log }
    : { ...m, reported: null, log };
  return { meter, event };
}

/** Whether `fine` on top of what's owed will get the house cut off. */
export const fineCutsPower = (owed: number, fine: number) => owed + fine >= POWER.cutoff;

export const REASON_TEXT: Record<InspectionReason, string> = {
  audit: 'Random NEPA & police check',
  tip: 'Neighbour tipped them off',
  report: 'Reported by a visitor',
};

/** Normalise whatever a save holds. */
export function loadMeter(raw: Partial<MeterState> | undefined | null): MeterState {
  const level = raw?.level === 'tamper' || raw?.level === 'bypass' ? raw.level : 'off';
  return {
    level,
    saved: Math.max(0, Number(raw?.saved) || 0),
    strikes: Math.max(0, Math.floor(Number(raw?.strikes) || 0)),
    banUntil: Math.max(0, Number(raw?.banUntil) || 0),
    reported: typeof raw?.reported === 'number' ? raw.reported : null,
    log: Array.isArray(raw?.log) ? raw.log.slice(0, 8) : [],
  };
}
