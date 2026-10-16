// Adoption and raising children (Phone → Adopt). Rules and numbers are in src/game/kids.ts.
//
// Server-authoritative throughout: the agency's requirements and fee, the paperwork wait, every care (and what it
// costs), the nanny, Social Welfare's warnings and taking a child back. Needs are never ticked: each row keeps one
// snapshot and simulate() moves it to "now" on every read. The five-minute cron (sweepKids) only visits rows whose
// next_check_at has come, which is when a need is about to cross into an alert, to send a push to a player who is away.
//
// Born again: a new life starts without the old life's children. They are not deleted: any child adopted before the
// wallet's reset_at is marked 'legacy' the next time anything looks, and the Family app lists them under past lives.

import type { FirebaseUser } from './auth';
import { usernames } from './crime';
import { handle, naira, postFeed } from './feed';
import { ownedCounts } from './progress';
import { sendPush } from './push';
import { homeCity } from './state';
import { applyStmts, ensureWallet, getBalance, treasuryStmts } from './wallet';
import { STAGES } from '../src/game/property';
import {
  CARE, KID_ROOM, KIDS, KID_YEAR_MS, GROWN_AGE, SLEEP_GAIN, ageLabel, ageYears, alertsOf, cleanKidName, kidAlert, milestoneText, milestonesBetween,
  offersFor, simulate, stageOf, type CareId, type KidClock, type KidSex, type KidSnap, type KidStatus,
} from '../src/game/kids';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const body = async <T>(req: Request) => (await req.json().catch(() => null)) as T | null;

const DAY = 24 * 3_600_000;
/** A player seen this recently is in the game and gets the alerts there, not as pushes. */
const ONLINE_MS = 5 * 60_000;
/** A snapshot older than this is written back on a read, so the simulation never has far to go. */
const RESNAP_MS = 6 * 3_600_000;
/** The same care can't be paid for twice this close together. */
const CARE_GAP_MS = 20_000;
/** How far ahead the cron looks for the next alert. */
const LOOKAHEAD_MS = 48 * 3_600_000;
const LIVE: KidStatus[] = ['pending', 'home', 'taken'];

export interface ChildRow {
  id: number; uid: string; offer_key: string; name: string; sex: KidSex; look: string; story: string; home: string;
  born_at: number; status: KidStatus; applied_at: number; ready_at: number; adopted_at: number | null;
  hunger: number; sleep: number; hygiene: number; play: number; health: number; sick: number; needs_at: number;
  asleep_until: number; school_until: number; strikes: number; strike_at: number; warned: number; taken_at: number | null;
  milestones: string; push_at: number; pushed: string; cared: string; next_check_at: number | null;
}
interface Milestone { id: string; at: number; seen: number; shared?: number }

const snapOf = (r: ChildRow): KidSnap => ({ hunger: r.hunger, sleep: r.sleep, hygiene: r.hygiene, play: r.play, health: r.health, sick: !!r.sick, at: r.needs_at });
const clockOf = (r: ChildRow, nannyUntil: number): KidClock => ({ bornAt: r.born_at, asleepUntil: r.asleep_until, schoolUntil: r.school_until, nannyUntil });
const putSnap = (r: ChildRow, s: KidSnap) => Object.assign(r, { hunger: s.hunger, sleep: s.sleep, hygiene: s.hygiene, play: s.play, health: s.health, sick: s.sick ? 1 : 0, needs_at: s.at });
const parse = <T>(text: string, fallback: T): T => { try { return JSON.parse(text) as T; } catch { return fallback; } };
const pronoun = (sex: KidSex) => (sex === 'f' ? 'her' : 'him');

/* ---------- Reading and settling ---------- */

/** Marks the children of an earlier life as past (see the top of this file). Returns how many moved. */
async function archivePastLives(db: D1Database, uid: string): Promise<number> {
  const res = await db.prepare(
    `UPDATE children SET status = 'legacy', next_check_at = NULL
     WHERE uid = ?1 AND status IN ('pending', 'home', 'taken') AND applied_at < COALESCE((SELECT reset_at FROM wallets WHERE uid = ?1), 0)`,
  ).bind(uid).run();
  if (res.meta.changes) await db.prepare('DELETE FROM nannies WHERE uid = ?').bind(uid).run();
  return res.meta.changes ?? 0;
}

export const nannyUntilOf = async (db: D1Database, uid: string) =>
  (await db.prepare('SELECT until FROM nannies WHERE uid = ?').bind(uid).first<{ until: number }>())?.until ?? 0;

const liveKids = async (db: D1Database, uid: string) =>
  (await db.prepare(`SELECT * FROM children WHERE uid = ? AND status IN ('pending', 'home', 'taken') ORDER BY applied_at`).bind(uid).all<ChildRow>()).results;

export interface Settled {
  changed: boolean;
  warned: boolean;
  taken: boolean;
  grown: boolean;
  rehomed: boolean;
  milestones: string[];
}

/**
 * Moves one child's row to `now` in memory: needs, Social Welfare's warnings and visits, milestones and growing up.
 * Health only falls once a child is sick (src/game/kids.ts), and stays down until the clinic, so judging the
 * warning by where it ends up is the same as judging it hour by hour.
 */
export function settle(r: ChildRow, nannyUntil: number, now: number): Settled {
  const out: Settled = { changed: false, warned: false, taken: false, grown: false, rehomed: false, milestones: [] };
  if (r.status === 'taken') {
    if (r.taken_at !== null && now >= r.taken_at + KIDS.reclaimMs) {
      r.status = 'rehomed';
      r.next_check_at = null;
      out.rehomed = out.changed = true;
    }
    return out;
  }
  if (r.status !== 'home') return out;
  const before = r.needs_at;
  const s = simulate(snapOf(r), clockOf(r, nannyUntil), now);
  putSnap(r, s);
  // Old warnings are forgiven one at a time.
  if (r.strikes > 0 && now - r.strike_at >= KIDS.strikeForgiveMs) {
    const n = Math.min(r.strikes, Math.floor((now - r.strike_at) / KIDS.strikeForgiveMs));
    r.strikes -= n;
    r.strike_at += n * KIDS.strikeForgiveMs;
    out.changed = true;
  }
  if (r.warned && s.health >= KIDS.rearmAt) { r.warned = 0; out.changed = true; }
  if (s.health < KIDS.warnAt && !r.warned) {
    r.warned = 1;
    r.strikes += 1;
    r.strike_at = now;
    out.warned = out.changed = true;
  }
  if (s.health <= 0 || r.strikes >= KIDS.strikesToTake) {
    r.status = 'taken';
    r.taken_at = now;
    // In care, Social Welfare looks after them properly.
    putSnap(r, { hunger: 90, sleep: 90, hygiene: 90, play: 70, health: Math.max(60, s.health), sick: false, at: now });
    r.asleep_until = 0;
    r.next_check_at = now + KIDS.reclaimMs;
    out.taken = out.changed = true;
    return out;
  }
  // Milestones from the last snapshot to now, never before they came home.
  const have = parse<Milestone[]>(r.milestones, []);
  const ids = new Set(have.map((m) => m.id));
  for (const m of milestonesBetween(r.born_at, Math.max(before, r.adopted_at ?? before), now)) {
    if (ids.has(m.id)) continue;
    have.push({ id: m.id, at: m.at, seen: 0 });
    ids.add(m.id);
    out.milestones.push(m.id);
  }
  if (out.milestones.length) {
    r.milestones = JSON.stringify(have.slice(-30));
    out.changed = true;
  }
  if (ageYears(r.born_at, now) >= GROWN_AGE) {
    r.status = 'grown';
    r.next_check_at = null;
    out.grown = out.changed = true;
  }
  // An alert that has cleared can be pushed again next time.
  const pushed = r.pushed ? r.pushed.split(',') : [];
  const still = pushed.filter((k) => (k === 'sick' ? s.sick : (s as unknown as Record<string, number>)[k] < KIDS.alertAt));
  if (still.length !== pushed.length) { r.pushed = still.join(','); out.changed = true; }
  return out;
}

/** What the cron should look at next: the first time a new alert would start, or when Social Welfare's hold runs out. */
export function nextCheckAt(r: ChildRow, nannyUntil: number, now: number): number | null {
  if (r.status === 'taken') return (r.taken_at ?? now) + KIDS.reclaimMs;
  if (r.status !== 'home') return null;
  const pushed = new Set(r.pushed ? r.pushed.split(',') : []);
  const fresh = (s: KidSnap) => {
    if (s.sick && !pushed.has('sick')) return true;
    if (s.health < KIDS.warnAt && !r.warned) return true;
    // Social Welfare comes for them when health runs out.
    if (s.health <= 0) return true;
    return alertsOf(s).some((k) => !pushed.has(k));
  };
  let s = simulate(snapOf(r), clockOf(r, nannyUntil), now);
  // Something already wants saying (the player was online when it began): look again shortly.
  if (fresh(s)) return now + 15 * 60_000;
  const clock = clockOf(r, nannyUntil);
  for (let t = now + 30 * 60_000; t <= now + LOOKAHEAD_MS; t += 30 * 60_000) {
    s = simulate(s, clock, t);
    if (fresh(s)) return t;
  }
  return now + LOOKAHEAD_MS;
}

const saveStmt = (db: D1Database, r: ChildRow, oldNeedsAt: number, oldStatus: KidStatus) =>
  db.prepare(
    `UPDATE children SET status = ?, hunger = ?, sleep = ?, hygiene = ?, play = ?, health = ?, sick = ?, needs_at = ?, asleep_until = ?,
       school_until = ?, strikes = ?, strike_at = ?, warned = ?, taken_at = ?, milestones = ?, push_at = ?, pushed = ?, cared = ?,
       next_check_at = ?, adopted_at = ?
     WHERE id = ? AND needs_at = ? AND status = ?`,
  ).bind(
    r.status, r.hunger, r.sleep, r.hygiene, r.play, r.health, r.sick, r.needs_at, r.asleep_until,
    r.school_until, r.strikes, r.strike_at, r.warned, r.taken_at, r.milestones, r.push_at, r.pushed, r.cared,
    r.next_check_at, r.adopted_at, r.id, oldNeedsAt, oldStatus,
  );

/** Feed lines for what settling a child turned up. */
async function announce(db: D1Database, r: ChildRow, ev: Settled) {
  if (!ev.taken && !ev.grown) return;
  const parent = (await usernames(db, [r.uid])).get(r.uid);
  if (ev.taken) await postFeed(db, r.uid, 'family', '🏛️', `Social Welfare took ${r.name} back from ${handle(parent)}'s house after finding ${pronoun(r.sex)} neglected. Children are not decoration.`);
  if (ev.grown) await postFeed(db, r.uid, 'family', '🎓', `${r.name}, raised by ${handle(parent)}, is all grown up and has moved out to start ${pronoun(r.sex)} own life.`);
}

/**
 * Every live child of a player, settled to now and written back where something happened. `stored` is what the
 * database row holds afterwards (its needs_at and status), which a later write must name to land.
 */
async function loadSettled(db: D1Database, uid: string, now: number) {
  await archivePastLives(db, uid);
  const [rows, nannyUntil] = await Promise.all([liveKids(db, uid), nannyUntilOf(db, uid)]);
  const stored = new Map<number, { at: number; status: KidStatus }>(rows.map((r) => [r.id, { at: r.needs_at, status: r.status }]));
  const stmts: D1PreparedStatement[] = [];
  const events: [ChildRow, Settled][] = [];
  for (const r of rows) {
    const oldAt = r.needs_at;
    const oldStatus = r.status;
    const ev = settle(r, nannyUntil, now);
    if (ev.changed || (r.status === 'home' && now - oldAt > RESNAP_MS)) {
      r.next_check_at = nextCheckAt(r, nannyUntil, now);
      stmts.push(saveStmt(db, r, oldAt, oldStatus));
      events.push([r, ev]);
    }
  }
  if (stmts.length) {
    const res = await db.batch(stmts);
    // Only announce what this request actually wrote (another one may have got there first).
    for (let i = 0; i < events.length; i++) {
      if (!res[i].meta.changes) continue;
      const [r, ev] = events[i];
      stored.set(r.id, { at: r.needs_at, status: r.status });
      await announce(db, r, ev);
    }
  }
  return { rows, nannyUntil, stored };
}

/* ---------- Requirements ---------- */

interface Check { ok: boolean; label: string }
interface Eligibility { home: Check; arrest: Check; savings: Check; slots: Check; room: number; ok: boolean }

/** How many children the player's homes have room for: the roomiest finished house they own, or the one they rent. */
async function roomFor(db: D1Database, uid: string, now: number): Promise<{ room: number; label: string }> {
  const [owned, lease] = await Promise.all([
    db.prepare('SELECT design FROM estate_plots WHERE uid = ? AND stage >= ?').bind(uid, STAGES.length).all<{ design: string | null }>(),
    db.prepare('SELECT design FROM rentals WHERE tenant_uid = ? AND COALESCE(paid_through, 0) > ?').bind(uid, now).first<{ design: string }>(),
  ]);
  let room = 0;
  let label = 'You need your own house or a rented one';
  for (const { design } of owned.results) {
    const n = KID_ROOM[design ?? ''] ?? 0;
    if (n > room) { room = n; label = 'Your own house'; }
  }
  const leased = KID_ROOM[lease?.design ?? ''] ?? 0;
  if (leased > room) { room = leased; label = 'The house you rent'; }
  return { room, label };
}

async function eligibility(db: D1Database, uid: string, now: number, count: number): Promise<Eligibility> {
  const [{ room, label }, player, balance] = await Promise.all([
    roomFor(db, uid, now),
    db.prepare('SELECT last_arrest_at, jailed_until FROM players WHERE uid = ?').bind(uid).first<{ last_arrest_at: number | null; jailed_until: number | null }>(),
    getBalance(db, uid),
  ]);
  const clean = (player?.jailed_until ?? 0) <= now && (player?.last_arrest_at ?? 0) < now - KIDS.arrestFreeMs;
  const need = KIDS.fee + KIDS.savings;
  const cap = Math.min(KIDS.max, room);
  const e = {
    home: { ok: room > 0, label: room > 0 ? `${label}: room for ${room} child${room > 1 ? 'ren' : ''}` : label },
    arrest: { ok: clean, label: clean ? 'No arrest in the last 3 days' : 'Arrested in the last 3 days: come back with a clean record' },
    savings: { ok: balance >= need, label: balance >= need ? `Fee plus ${naira(KIDS.savings)} in savings` : `You need ${naira(need)}: the fee plus ${naira(KIDS.savings)} savings` },
    slots: { ok: count < cap, label: count < KIDS.max ? (count < cap ? `${count} of ${cap} places taken` : `No more room at home (${count} of ${cap})`) : `You have ${KIDS.max} children already` },
    room,
  };
  return { ...e, ok: e.home.ok && e.arrest.ok && e.savings.ok && e.slots.ok };
}

/* ---------- Views ---------- */

function kidView(r: ChildRow) {
  return {
    id: r.id, name: r.name, sex: r.sex, look: r.look, story: r.story, home: r.home, bornAt: r.born_at, status: r.status,
    readyAt: r.ready_at, adoptedAt: r.adopted_at, takenAt: r.taken_at,
    snap: snapOf(r), asleepUntil: r.asleep_until, schoolUntil: r.school_until, strikes: r.strikes,
    milestones: parse<Milestone[]>(r.milestones, []),
  };
}
export type KidView = ReturnType<typeof kidView>;

/** Names of the children at home, for the public profile (worker/share.ts). */
export const profileKidsSql = `(SELECT json_group_array(json_object('name', c.name, 'sex', c.sex, 'bornAt', c.born_at)) FROM children c WHERE c.uid = p.uid AND c.status = 'home')`;

/* ---------- Router ---------- */

export async function handleKids(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/kids')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();
  const post = req.method === 'POST';

  if (path === '/api/kids' && req.method === 'GET') {
    const { rows, nannyUntil } = await loadSettled(db, me, now);
    const count = rows.filter((r) => LIVE.includes(r.status)).length;
    const [elig, city, past] = await Promise.all([
      eligibility(db, me, now, count),
      homeCity(db, me),
      db.prepare(`SELECT * FROM children WHERE uid = ? AND status IN ('rehomed', 'grown', 'legacy') ORDER BY applied_at DESC LIMIT 12`).bind(me).all<ChildRow>(),
    ]);
    const taken = new Set((await db.prepare('SELECT offer_key FROM children WHERE uid = ?').bind(me).all<{ offer_key: string }>()).results.map((r) => r.offer_key));
    return json({
      kids: rows.filter((r) => LIVE.includes(r.status)).map(kidView),
      past: past.results.map((r) => ({ id: r.id, name: r.name, sex: r.sex, look: r.look, status: r.status, bornAt: r.born_at, adoptedAt: r.adopted_at })),
      offers: offersFor(me, city, now).filter((o) => !taken.has(o.key)),
      nannyUntil,
      eligibility: elig,
      now,
    });
  }

  if (path === '/api/kids/apply' && post) {
    const b = await body<{ key?: string; name?: string }>(req);
    const key = typeof b?.key === 'string' ? b.key : '';
    const day = Number(key.split(':')[0]);
    const today = Math.floor(now / DAY);
    // Yesterday's list still counts, so a player who opened it before midnight is not turned away.
    if (!(day === today || day === today - 1)) return err(410, 'That listing has closed. Look again.');
    const city = await homeCity(db, me);
    const offer = offersFor(me, city, day * DAY).find((o) => o.key === key);
    if (!offer) return err(404, 'No child by that listing');
    const name = b?.name === undefined || b.name === '' ? offer.name : cleanKidName(b.name);
    if (!name) return err(400, 'Give a name of 2 to 16 letters');
    await archivePastLives(db, me);
    const rows = await liveKids(db, me);
    if (rows.some((r) => r.offer_key === key)) return err(409, `You already applied for ${offer.name}`);
    if ((await db.prepare('SELECT 1 AS x FROM children WHERE uid = ? AND offer_key = ?').bind(me, key).first())) return err(409, `${offer.name} has found a home already`);
    const e = await eligibility(db, me, now, rows.length);
    if (!e.ok) return err(409, [e.home, e.arrest, e.savings, e.slots].find((c) => !c.ok)!.label);
    const made = await db.prepare(
      `INSERT INTO children (uid, offer_key, name, sex, look, story, home, born_at, status, applied_at, ready_at, needs_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?10, ?9
       WHERE (SELECT COUNT(*) FROM children WHERE uid = ?1 AND status IN ('pending', 'home', 'taken')) < ?11
         AND NOT EXISTS (SELECT 1 FROM children WHERE uid = ?1 AND offer_key = ?2)
       RETURNING id`,
    ).bind(me, key, name, offer.sex, offer.look, offer.story, offer.home, now - offer.age * KID_YEAR_MS, now, now + KIDS.paperworkMs, Math.min(KIDS.max, e.room))
      .first<{ id: number }>();
    if (!made) return err(409, 'Busy, try again');
    // The fee goes to the state's Social Welfare, through the ledger like every other government fee.
    await db.batch([ensureWallet(db, me), ...treasuryStmts(db, me, `adopt:${me}:${key}`, 'spend', 'adoption', KIDS.fee)]);
    return json({ ok: true, id: made.id, readyAt: now + KIDS.paperworkMs, balance: await getBalance(db, me) });
  }

  // Everything below is about one of my children.
  const b = post ? await body<{ id?: number; care?: string; item?: string; days?: number; milestone?: string; share?: boolean }>(req) : null;

  if (path === '/api/kids/nanny' && post) {
    const days = Math.floor(Number(b?.days));
    if (!(days >= 1 && days <= KIDS.nannyMaxDays)) return err(400, `Book 1 to ${KIDS.nannyMaxDays} days`);
    const { rows } = await loadSettled(db, me, now);
    if (!rows.some((r) => r.status === 'home' || r.status === 'pending')) return err(409, 'A nanny needs a child to look after');
    const until = await nannyUntilOf(db, me);
    const from = Math.max(now, until);
    if (from + days * DAY > now + KIDS.nannyMaxDays * DAY) return err(409, `You can book the nanny ${KIDS.nannyMaxDays} days ahead at most`);
    const cost = days * KIDS.nannyPerDay;
    if ((await getBalance(db, me)) < cost) return err(402, `${days} day${days > 1 ? 's' : ''} of the nanny costs ${naira(cost)}`);
    await db.batch([
      ensureWallet(db, me),
      ...applyStmts(db, me, `nanny:${me}:${now}`, 'spend', 'nanny', -cost),
      db.prepare('INSERT INTO nannies (uid, until) VALUES (?1, ?2) ON CONFLICT(uid) DO UPDATE SET until = ?2').bind(me, from + days * DAY),
      // Her hours change what is coming: let the cron work it out again.
      db.prepare("UPDATE children SET next_check_at = ? WHERE uid = ? AND status = 'home'").bind(now, me),
    ]);
    return json({ ok: true, nannyUntil: from + days * DAY, balance: await getBalance(db, me) });
  }

  const id = Math.floor(Number(b?.id));

  if (path === '/api/kids/collect' && post) {
    const r = await db.prepare("SELECT * FROM children WHERE id = ? AND uid = ? AND status = 'pending'").bind(id, me).first<ChildRow>();
    if (!r) return err(404, 'Nothing waiting to collect');
    if (r.ready_at > now) return err(425, 'The paperwork is not done yet');
    const nannyUntil = await nannyUntilOf(db, me);
    const old = { at: r.needs_at, status: r.status };
    Object.assign(r, { status: 'home', adopted_at: now, asleep_until: 0, milestones: JSON.stringify([{ id: 'home', at: now, seen: 0 }]) });
    putSnap(r, { hunger: 100, sleep: 100, hygiene: 100, play: 100, health: 100, sick: false, at: now });
    r.next_check_at = nextCheckAt(r, nannyUntil, now);
    const res = await saveStmt(db, r, old.at, old.status).run();
    if (!res.meta.changes) return err(409, 'Busy, try again');
    const parent = (await usernames(db, [me])).get(me);
    await postFeed(db, me, 'family', '👶🏾', `${handle(parent)} just adopted ${r.name} (${ageLabel(ageYears(r.born_at, now))}) from ${r.home}. Welcome home, ${r.name}! 🎉`);
    return json({ ok: true, kid: kidView(r) });
  }

  if (path === '/api/kids/reclaim' && post) {
    const r = await db.prepare("SELECT * FROM children WHERE id = ? AND uid = ? AND status = 'taken'").bind(id, me).first<ChildRow>();
    if (!r) return err(404, 'No child of yours is with Social Welfare');
    if (now >= (r.taken_at ?? 0) + KIDS.reclaimMs) return err(410, `${r.name} has been placed with another family`);
    if ((await getBalance(db, me)) < KIDS.reclaimFine) return err(402, `Getting ${r.name} back costs ${naira(KIDS.reclaimFine)}`);
    const old = { at: r.needs_at, status: r.status };
    // Back on probation: one warning stands.
    Object.assign(r, { status: 'home', taken_at: null, strikes: 1, strike_at: now, warned: 0, asleep_until: 0, pushed: '' });
    putSnap(r, { hunger: 90, sleep: 90, hygiene: 90, play: 80, health: 90, sick: false, at: now });
    r.next_check_at = nextCheckAt(r, await nannyUntilOf(db, me), now);
    const res = await saveStmt(db, r, old.at, old.status).run();
    if (!res.meta.changes) return err(409, 'Busy, try again');
    await db.batch([ensureWallet(db, me), ...treasuryStmts(db, me, `kid-reclaim:${r.id}:${r.taken_at ?? old.at}:${now}`, 'spend', 'kid_reclaim', KIDS.reclaimFine)]);
    return json({ ok: true, kid: kidView(r), balance: await getBalance(db, me) });
  }

  if (path === '/api/kids/milestone' && post) {
    const r = await db.prepare('SELECT * FROM children WHERE id = ? AND uid = ?').bind(id, me).first<ChildRow>();
    if (!r) return err(404, 'Not your child');
    const list = parse<Milestone[]>(r.milestones, []);
    const m = list.find((x) => x.id === b?.milestone);
    if (!m) return err(404, 'No such milestone');
    const first = !m.seen;
    m.seen = 1;
    let posted = false;
    if (b?.share && !m.shared) {
      m.shared = 1;
      posted = true;
    }
    const res = await db.prepare('UPDATE children SET milestones = ? WHERE id = ? AND milestones = ?').bind(JSON.stringify(list), r.id, r.milestones).run();
    if (!res.meta.changes) return err(409, 'Busy, try again');
    if (posted) {
      const parent = (await usernames(db, [me])).get(me);
      const t = milestoneText(m.id, r.name, r.sex);
      await postFeed(db, me, 'family', t.icon, `${t.text} Proud parent: ${handle(parent)}`);
    }
    return json({ ok: true, joy: first, posted });
  }

  if ((path === '/api/kids/care' || path === '/api/kids/school') && post) {
    const care = (path === '/api/kids/school' ? 'school' : b?.care) as CareId | 'school';
    if (care !== 'school' && !CARE[care as CareId]) return err(400, 'Unknown care');
    const { rows, nannyUntil, stored } = await loadSettled(db, me, now);
    const home = rows.filter((r) => r.status === 'home');
    if (!home.length) return err(409, rows.some((r) => r.status === 'taken') ? 'Social Welfare has your child. Get them back first.' : 'No child at home');
    let r: ChildRow | undefined;
    if (id) r = home.find((x) => x.id === id);
    else if (care !== 'school') {
      // No child named: the one who needs it most.
      const def = CARE[care];
      const ok = home.filter((x) => def.stages.includes(stageOf(x.born_at, now)));
      r = def.need ? ok.sort((x, y) => x[def.need!] - y[def.need!])[0] : ok.sort((x, y) => x.health - y.health)[0];
    }
    if (!r) return err(404, id ? 'Not your child, or not at home' : 'Nobody needs that right now');
    const stage = stageOf(r.born_at, now);
    const cared = parse<Record<string, number>>(r.cared, {});
    if ((cared[care] ?? 0) > now - CARE_GAP_MS) return err(429, 'Just did that');
    const old = stored.get(r.id)!;
    let cost = 0;
    let toState = false;
    let note = '';
    if (care === 'school') {
      if (ageYears(r.born_at, now) < KIDS.schoolAge) return err(409, `${r.name} is too young for school`);
      if (r.school_until > now + DAY) return err(409, `${r.name}'s fees are paid for this term`);
      cost = KIDS.schoolFee;
      toState = true;
      r.school_until = Math.max(now, r.school_until) + KIDS.schoolTermMs;
      const list = parse<Milestone[]>(r.milestones, []);
      if (!list.some((m) => m.id === 'school')) { list.push({ id: 'school', at: now, seen: 0 }); r.milestones = JSON.stringify(list); }
      note = `${r.name} is in school this term 🎒`;
    } else {
      const def = CARE[care];
      if (!def.stages.includes(stage)) return err(409, `${r.name} is past nappies`);
      cost = def.cost(stage);
      toState = !!def.state;
      const owned = typeof b?.item === 'string' && def.items.includes(b.item) ? ((await ownedCounts(db, me)).get(b.item) ?? 0) > 0 : false;
      const bonus = owned ? KIDS.furnitureBonus : 1;
      const her = pronoun(r.sex);
      if (care === 'clinic') {
        if (!r.sick && r.health >= 80) return err(409, `${r.name} is well. The doctor says go home`);
        r.health = 100;
        r.sick = 0;
        note = `🏥 The doctor treated ${r.name}. ${her === 'her' ? 'She' : 'He'} is well again`;
      } else if (care === 'sleep') {
        if (r.asleep_until > now) return err(409, `${r.name} is already asleep. Shhh`);
        if (r.sleep >= 85) return err(409, `${r.name} is not sleepy`);
        // Asleep until rested, at least an hour: in a cot they drop off quicker.
        const hours = Math.min(10, Math.max(1, (100 - r.sleep) / SLEEP_GAIN));
        r.asleep_until = now + hours * 3_600_000;
        if (owned) r.sleep = Math.min(100, r.sleep + 10);
        note = `😴 ${r.name} is asleep${owned ? ' in the cot' : ''}`;
      } else {
        const need = def.need!;
        if (r[need] >= KIDS.fullAt) return err(409, need === 'hunger' ? `${r.name} is not hungry` : need === 'hygiene' ? `${r.name} is clean already` : `${r.name} has played enough for now`);
        // A sleeping child is woken for food or a nappy, not for games.
        if (care === 'play' && r.asleep_until > now) return err(409, `${r.name} is asleep. Let ${her} sleep`);
        r[need] = Math.min(100, r[need] + def.gain * bonus);
        if (care === 'feed' || care === 'change' || care === 'bathe') r.asleep_until = Math.min(r.asleep_until, now);
        note = care === 'feed' ? `🍼 ${r.name} is fed and happy` : care === 'change' ? `🧷 Fresh nappy for ${r.name}` : care === 'bathe' ? `🛁 ${r.name} is clean and smelling nice` : `🧸 ${r.name} had fun with you`;
      }
    }
    if (cost > 0 && (await getBalance(db, me)) < cost) return err(402, `That costs ${naira(cost)}`);
    cared[care] = now;
    r.cared = JSON.stringify(cared);
    if (r.warned && r.health >= KIDS.rearmAt) r.warned = 0;
    const pushed = r.pushed ? r.pushed.split(',') : [];
    r.pushed = pushed.filter((k) => (k === 'sick' ? !!r!.sick : (r as unknown as Record<string, number>)[k] < KIDS.alertAt)).join(',');
    r.next_check_at = nextCheckAt(r, nannyUntil, now);
    // The child's row first: if another tap or the cron moved it on meanwhile, nothing is charged.
    const saved = await saveStmt(db, r, old.at, old.status).run();
    if (!saved.meta.changes) return err(409, 'Busy, try again');
    if (cost > 0) {
      const clientId = `kid:${r.id}:${care}:${now}`;
      const ref = `kid:${care}`;
      // Clinic visits and school fees are the state's; formula, nappies and soap are a shop's.
      await db.batch([ensureWallet(db, me), ...(toState ? treasuryStmts(db, me, clientId, 'spend', ref, cost) : applyStmts(db, me, clientId, 'spend', ref, -cost))]);
    }
    return json({ ok: true, kid: kidView(r), note, cost, balance: await getBalance(db, me) });
  }

  return err(404, 'Not found');
}

/* ---------- Cron ---------- */

/**
 * Children whose next check has come: settle them, and tell a parent who is away what is wrong. One push per child
 * per alert (a need that drops, recovers and drops again is a new one), never closer than pushGapMs apart unless it is
 * urgent (sick, a Social Welfare warning or visit). Players who are in the game see it there instead. The
 * category is 'family', so the switch in the profile sheet turns these off.
 */
export async function sweepKids(env: Env, ctx: ExecutionContext, now: number) {
  const db = env.DB;
  const { results } = await db.prepare(
    `SELECT c.*, COALESCE(n.until, 0) AS nanny_until, COALESCE(p.last_seen, 0) AS last_seen, COALESCE(w.reset_at, 0) AS reset_at
     FROM children c
     LEFT JOIN nannies n ON n.uid = c.uid
     LEFT JOIN players p ON p.uid = c.uid
     LEFT JOIN wallets w ON w.uid = c.uid
     WHERE c.next_check_at IS NOT NULL AND c.next_check_at <= ? AND c.status IN ('home', 'taken')
     ORDER BY c.next_check_at LIMIT 50`,
  ).bind(now).all<ChildRow & { nanny_until: number; last_seen: number; reset_at: number }>();
  for (const r of results) {
    if (r.applied_at < r.reset_at) {
      await archivePastLives(db, r.uid);
      continue;
    }
    const old = { at: r.needs_at, status: r.status };
    const ev = settle(r, r.nanny_until, now);
    // In the game they see all of this on screen (the HUD chip, toasts, the Adopt app): pushes are for when they are away.
    const away = now - r.last_seen > ONLINE_MS;
    let push: { title: string; body: string; tag: string } | null = null;
    let heldUntil = 0;
    if (away && ev.taken) {
      push = { title: `💔 Social Welfare took ${r.name}`, body: `An officer found ${pronoun(r.sex)} neglected. You have ${Math.round(KIDS.reclaimMs / DAY)} days to get ${pronoun(r.sex)} back in Phone → Adopt.`, tag: `kid-${r.id}-taken` };
    } else if (away && ev.warned) {
      push = { title: '⚠️ Social Welfare warning', body: `An officer found ${r.name} neglected (warning ${r.strikes} of ${KIDS.strikesToTake}). Go home and care for ${pronoun(r.sex)}.`, tag: `kid-${r.id}-warn` };
    } else if (away && r.status === 'home') {
      const snap = snapOf(r);
      const pushed = new Set(r.pushed ? r.pushed.split(',') : []);
      const fresh = [...alertsOf(snap), ...(snap.sick ? ['sick'] : [])].filter((k) => !pushed.has(k));
      const a = kidAlert(r.name, r.sex, stageOf(r.born_at, now), snap, fresh);
      if (a && fresh.length) {
        const gap = a.urgent || snap.sick ? KIDS.urgentGapMs : KIDS.pushGapMs;
        if (now - r.push_at >= gap) {
          push = { title: a.title, body: a.body, tag: `kid-${r.id}` };
          for (const k of fresh) pushed.add(k);
          r.pushed = [...pushed].join(',');
        } else heldUntil = r.push_at + gap;
      }
    }
    // Even a warning waits out the short urgent gap: two in a row would be one too many.
    if (push && now - r.push_at < KIDS.urgentGapMs) {
      heldUntil = r.push_at + KIDS.urgentGapMs;
      push = null;
    }
    if (push) r.push_at = now;
    r.next_check_at = nextCheckAt(r, r.nanny_until, now);
    if (heldUntil && r.status === 'home') r.next_check_at = Math.max(r.next_check_at ?? now, heldUntil);
    if (r.next_check_at !== null && r.next_check_at <= now) r.next_check_at = now + 15 * 60_000;
    const res = await saveStmt(db, r, old.at, old.status).run();
    if (!res.meta.changes) continue;
    await announce(db, r, ev);
    if (push) sendPush(env, ctx, r.uid, { ...push, category: 'family' });
  }
}
