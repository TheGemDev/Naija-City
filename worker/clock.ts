// Server-side game clock and the per-player state that hangs off it.
//
// The client reports when tasks start and end (plus money events), each stamped with its real time.
// Stamps are clamped so they only move forward and never pass "now", so the time between events
// really elapsed. The clock advances at the game's normal rate, or the skip rate inside tasks long
// enough to skip. Work pay and study credit are judged against this clock.

import { ITEMS, JOBS, PHONE_ACTIONS, type ActionDef } from '../src/game/catalog';
import '../src/game/abuja';
import '../src/game/lagos';
import '../src/game/kano';
import { CITY_MAPS } from '../src/game/city';

import { SKIP_MIN_TASK, SKIP_RATE, TASK_RATE, TIME_RATE } from '../src/game/timeRates';

const START_MINUTES = 7 * 60;

/** Every action the game offers in any city, by id. Ids can repeat across places and cities; keep the most generous values. */
const ACTIONS = new Map<string, { minutes: number; knowledgePerHour: number }>();
for (const a of [...Object.values(ITEMS).flatMap((i) => i.actions), ...PHONE_ACTIONS, ...Object.values(CITY_MAPS).flatMap((m) => m.places).flatMap((p) => p.actions ?? [])] as ActionDef[]) {
  const prev = ACTIONS.get(a.id);
  ACTIONS.set(a.id, {
    minutes: Math.max(prev?.minutes ?? 0, a.minutes),
    knowledgePerHour: Math.max(prev?.knowledgePerHour ?? 0, a.knowledgePerHour ?? 0),
  });
}

const isLong = (action: string) => action === 'work' || (ACTIONS.get(action)?.minutes ?? 0) >= SKIP_MIN_TASK;

export interface Holding {
  units: number;
  accrued: number;
}

export interface PlayerState {
  /** event_at as the row holds it. Every wallet sync moves it forward, so it doubles as the row's version: a sync writes only if it is unchanged. */
  rev: number | null;
  eventAt: number;
  clock: number;
  task: { id: string; action: string; clock: number } | null;
  knowledge: number;
  knowledgeCredit: number;
  knowledgeAt: number | null;
  lastWorkDay: number | null;
  holdings: Map<string, Holding>;
  changedHoldings: Set<string>;
}

interface PlayerRow {
  event_at: number | null;
  clock: number | null;
  task_id: string | null;
  task_action: string | null;
  task_clock: number | null;
  knowledge: number;
  knowledge_credit: number;
  knowledge_at: number | null;
  last_work_day: number | null;
}

export async function loadState(db: D1Database, uid: string): Promise<PlayerState> {
  const now = Date.now();
  const [p, saved, holdings] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT * FROM players WHERE uid = ?').bind(uid),
    db.prepare(`SELECT json_extract(data, '$.minutes') AS minutes FROM saves WHERE uid = ?`).bind(uid),
    db.prepare('SELECT inv_id, units, accrued_clock FROM holdings WHERE uid = ?').bind(uid),
  ]);
  // State is stored on the player row, so make sure there is one. A new row holds nothing yet, so what was read still stands.
  if (!p.results.length) await db.prepare('INSERT INTO players (uid, created_at, last_seen) VALUES (?1, ?2, ?2) ON CONFLICT(uid) DO NOTHING').bind(uid, now).run();
  const row = (p.results[0] ?? {}) as Partial<PlayerRow>;
  const savedMinutes = Number((saved.results[0] as { minutes?: number } | undefined)?.minutes) || START_MINUTES;
  return {
    rev: row.event_at ?? null,
    // First contact: the clock starts where their save is, right now.
    eventAt: row.event_at ?? now,
    clock: row.clock ?? savedMinutes,
    task: row.task_id ? { id: row.task_id, action: row.task_action!, clock: row.task_clock! } : null,
    knowledge: row.knowledge ?? 0,
    knowledgeCredit: row.knowledge_credit ?? 0,
    knowledgeAt: row.knowledge_at ?? null,
    lastWorkDay: row.last_work_day ?? null,
    holdings: new Map(
      (holdings.results as { inv_id: string; units: number; accrued_clock: number }[]).map((h) => [h.inv_id, { units: h.units, accrued: h.accrued_clock }]),
    ),
    changedHoldings: new Set(),
  };
}

/** With `gate` (a wallet sync's claim, worker/wallet.ts applyEvents), the state is only written if that sync got its claim. */
export function saveStateStmts(db: D1Database, uid: string, s: PlayerState, gate: string | null = null) {
  return [
    db
      .prepare(
        `UPDATE players SET event_at = ?2, clock = ?3, task_id = ?4, task_action = ?5, task_clock = ?6,
           knowledge_credit = ?7, last_work_day = ?8, knowledge = ?9, knowledge_at = ?10
         WHERE uid = ?1 AND (?11 IS NULL OR EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?11))`,
      )
      .bind(uid, s.eventAt, s.clock, s.task?.id ?? null, s.task?.action ?? null, s.task?.clock ?? null, s.knowledgeCredit, s.lastWorkDay, s.knowledge, s.knowledgeAt, gate),
    ...[...s.changedHoldings].map((id) => {
      const h = s.holdings.get(id)!;
      return db
        .prepare(
          `INSERT INTO holdings (uid, inv_id, units, accrued_clock)
           SELECT ?1, ?2, ?3, ?4 WHERE ?5 IS NULL OR EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?5)
           ON CONFLICT(uid, inv_id) DO UPDATE SET units = ?3, accrued_clock = ?4`,
        )
        .bind(uid, id, h.units, h.accrued, gate);
    }),
  ];
}

/** Move the clock to real time `at` (clamped to [last event, now]). Returns the clamped time. */
export function advance(s: PlayerState, at: unknown): number {
  const now = Date.now();
  const t = Math.min(now, Math.max(s.eventAt, typeof at === 'number' && Number.isFinite(at) ? at : now));
  const rate = !s.task ? TIME_RATE : isLong(s.task.action) ? SKIP_RATE : TASK_RATE;
  s.clock += ((t - s.eventAt) / 1000) * rate;
  s.eventAt = t;
  return t;
}

/** Close the open task, crediting any study it contained. */
function endTask(s: PlayerState) {
  const t = s.task;
  if (!t) return;
  const def = ACTIONS.get(t.action);
  if (def?.knowledgePerHour) s.knowledgeCredit += (def.knowledgePerHour * Math.min(s.clock - t.clock, def.minutes || Infinity)) / 60;
  s.task = null;
}

export function taskStart(s: PlayerState, id: string, action: string) {
  endTask(s);
  s.task = { id: id.slice(0, 64), action: action.slice(0, 40), clock: s.clock };
}

export function taskEnd(s: PlayerState, id: string) {
  if (s.task?.id === id) endTask(s);
}

/** Study credit from the task still running (knowledge grows during it, not just at the end). */
function openStudyCredit(s: PlayerState) {
  const def = s.task && ACTIONS.get(s.task.action);
  return def?.knowledgePerHour ? (def.knowledgePerHour * Math.min(s.clock - s.task!.clock, def.minutes || Infinity)) / 60 : 0;
}

/** Most knowledge the player can have proven: verified + study credit since. */
export const knowledgeNow = (s: PlayerState) => Math.min(10, s.knowledge + s.knowledgeCredit + openStudyCredit(s));

/** Knowledge accepted from a first upload with no history (e.g. a guest signing in). */
const SEED_KNOWLEDGE = 3;

/** Accept the save's knowledge up to what study proves, and fold the credit into the verified value. */
export function verifyKnowledge(s: PlayerState, claimed: unknown): number {
  const want = typeof claimed === 'number' && Number.isFinite(claimed) ? Math.max(0, claimed) : 0;
  const bound = s.knowledgeAt === null ? Math.min(10, SEED_KNOWLEDGE + s.knowledgeCredit + openStudyCredit(s)) : knowledgeNow(s);
  const verified = Math.min(want, bound);
  s.knowledge = verified;
  s.knowledgeCredit = 0;
  s.knowledgeAt = Date.now();
  // The running study task's credit so far is now counted; only count from here on.
  if (s.task && ACTIONS.get(s.task.action)?.knowledgePerHour) {
    const def = ACTIONS.get(s.task.action)!;
    const used = Math.min(s.clock - s.task.clock, def.minutes || Infinity);
    s.task.clock += used;
  }
  return verified;
}

/** Most a shift may pay right now, or a reason it can't pay at all. */
/** `payFactor` is the player's origin pay multiplier (src/game/origins.ts). */
export function checkWork(s: PlayerState, jobId: string | undefined, taskId: string | undefined, amount: number, payFactor = 1): string | null {
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) return 'Unknown job';
  if (!s.task || s.task.action !== 'work' || s.task.id !== taskId) return 'Not at work';
  if (knowledgeNow(s) < job.minKnowledge) return 'Not qualified';
  const day = Math.floor(s.task.clock / 1440);
  if (s.lastWorkDay !== null && day <= s.lastWorkDay) return 'Already worked today';
  const shift = (job.end <= job.start ? 24 - job.start + job.end : job.end - job.start) * 60;
  const worked = s.clock - s.task.clock;
  const max = Math.round(job.pay * 1.4 * payFactor * Math.min(1, worked / shift)) + 1;
  if (amount > max) return 'Pay too high for time worked';
  s.lastWorkDay = day;
  return null;
}

export function changeUnits(s: PlayerState, id: string, delta: number) {
  const h = s.holdings.get(id) ?? { units: 0, accrued: s.clock };
  if (h.units <= 0) h.accrued = s.clock;
  h.units = Math.max(0, h.units + delta);
  s.holdings.set(id, h);
  s.changedHoldings.add(id);
}

export const unitsOf = (s: PlayerState, id: string) => s.holdings.get(id)?.units ?? 0;
