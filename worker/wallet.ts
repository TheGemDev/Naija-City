// Server-authoritative money.
//
// The game still moves money locally so it feels instant, but every change is also sent here as an
// event ({ id, at, kind, ref, amount }), along with task start/end events that drive the server
// clock (clock.ts). Spending is always accepted. Earnings are checked against the game catalog and
// that clock: pay for time actually worked, sales of things actually owned.
// The client shows `balance + its not-yet-acknowledged events`, which converges on the server's number.

import { cityNow, homeLaws, stateRevenueSql } from './state';
import type { CivicCity } from '../src/game/civic';
import { ITEMS, JOBS } from '../src/game/catalog';
import { CAR_BY_ID, CAR_RESALE_FACTOR, JET_BY_ID, jetResale } from '../src/game/cars';
import { PHONE_BY_ID, PHONE_RESALE_FACTOR } from '../src/game/phones';
import { currentPrices, tradable } from './market';
import { INVESTMENT_BY_ID, LIQUIDATION_FACTOR, MAX_TRADE_UNITS } from '../src/game/investments';
import { advance, changeUnits, checkWork, loadState, saveStateStmts, taskEnd, taskStart, unitsOf, type PlayerState } from './clock';
import { bookProperty, ownedCounts, propertyBooks, type PropertyBook } from './progress';
import { GAME_MINUTES_PER_REAL_MS_MAX, MAX_PROPERTY_COST, RENT_CAP_PER_DAY, SALE_FACTOR, DAY_MINUTES } from '../src/game/property';
import { firstInstallment, NEW_LIFE_ORIGIN, originOf, ORIGINS, STARTER_INSTALLMENT, starterDay } from '../src/game/origins';
import { REGION_IDS } from '../src/game/regions';
import { GIGS, isGig, maxShiftBonus } from '../src/game/gigs';
import { PARK_BY_ID } from '../src/game/underworld';
import { careerPayMults } from './career';
import { loadPolicy } from './policy';
import { STATE_CUT } from '../src/game/treasury';
import { flightFare } from '../src/game/city';
import { FARE_SUBSIDY, parseFareRef, railFare, subsidise, type FareSubsidy } from '../src/game/transport';

/** A wallet before its life has drawn an origin; the draw then sets the life's own first installment. */
export const START_MONEY = STARTER_INSTALLMENT;
/** Cap when seeding a wallet from a save that predates wallets (or a guest's local progress). */
const MAX_SEED = 500_000;
const SELL_FACTOR = 0.5;
const RESET_COOLDOWN_MS = 24 * 3600_000;
/** How long an origin sticks before a new life can draw again. */
const REDRAW_COOLDOWN_MS = 24 * 3600_000;
const MAX_EVENTS = 100;
/** A sync that loses a race with another write for the same player starts over this many times before giving up. */
const SYNC_TRIES = 4;

/** The fare subsidy as it stands this moment (not the cached policy): the percents, and what the federal treasury holds to pay them. */
async function fareState(db: D1Database) {
  const row = await db.prepare('SELECT treasury, air_subsidy, rail_subsidy FROM civic_policies WHERE id = 1').first<{ treasury: number; air_subsidy: number; rail_subsidy: number }>().catch(() => null);
  return { air: row?.air_subsidy ?? 0, rail: row?.rail_subsidy ?? 0, treasury: row?.treasury ?? 0 };
}

/** What the game shows on the ticket desks (src/game/transport.ts FareSubsidy): paid only while the treasury stays above its reserve. */
export async function fareSubsidy(db: D1Database): Promise<FareSubsidy> {
  const f = await fareState(db);
  return { air: f.air, rail: f.rail, funded: f.treasury >= FARE_SUBSIDY.reserve };
}

/** Largest single money event. Showroom cars and jets may go up to their own price, and payments on a property up to MAX_PROPERTY_COST. */
export const MAX_EVENT_AMOUNT = 500_000_000;

/** Money events carry an amount; task events move the server clock. `at` is the client's real time. */
interface GameEvent {
  id: string;
  at?: number;
  kind: 'work' | 'gig' | 'sell' | 'buy' | 'spend' | 'invest' | 'property' | 'debt' | 'task_start' | 'task_end';
  ref?: string;
  amount?: number;
  /** Units traded, on an investment buy or sale. Left out for one (older clients send one event per unit). */
  qty?: number;
  /** Task id: on task events, and on work pay (which shift it was for). */
  task?: string;
  /** Action id, on task_start. */
  action?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * Creates the wallet if missing, seeded from the player's save (capped) or the starting money.
 * Older saves retain their stored balance and their legacy origin key is mapped by the game.
 */
export function ensureWallet(db: D1Database, uid: string) {
  return db
    .prepare(
      `INSERT INTO wallets (uid, balance, updated_at, origin, origin_at)
       VALUES (?1, COALESCE((SELECT MIN(MAX(CAST(json_extract(data, '$.money') AS INTEGER), -?2), ?2) FROM saves WHERE uid = ?1), ?3), ?4,
               (SELECT 'normal' FROM saves WHERE uid = ?1), (SELECT 0 FROM saves WHERE uid = ?1))
       ON CONFLICT(uid) DO NOTHING`,
    )
    .bind(uid, MAX_SEED, START_MONEY, Date.now());
}

export async function getWallet(db: D1Database, uid: string): Promise<{ balance: number; origin: string | null; origin_at: number | null; debt: number }> {
  type Row = { balance: number; origin: string | null; origin_at: number | null; debt: number };
  const read = () => db.prepare('SELECT w.balance, w.origin, w.origin_at, b.debt FROM wallets w JOIN bank_accounts b ON b.uid = w.uid WHERE w.uid = ?').bind(uid);
  // Nearly every call finds the wallet already there, so look first: the two inserts are only run for a new player.
  const found = await read().first<Row>();
  if (found) return found;
  const [, , row] = await db.batch<Row>([
    ensureWallet(db, uid),
    db.prepare('INSERT INTO bank_accounts (uid, savings, updated_at) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, Date.now()),
    read(),
  ]);
  return row.results[0];
}

/**
 * Pays today's installment of the life's starting money, if one is due: one a day, on days the player is online. Returns
 * what this call paid and what is still to come, or null when nothing was due (or another request paid it).
 */
export async function payStarter(db: D1Database, uid: string): Promise<{ paid: number; left: number } | null> {
  const now = Date.now();
  const day = starterDay(now);
  const due = await db.prepare('SELECT starter_left FROM wallets WHERE uid = ? AND starter_left > 0 AND starter_day < ?').bind(uid, day).first();
  if (!due) return null;
  const id = `starter:${day}`;
  const amount = `(SELECT amount FROM ledger WHERE uid = ?1 AND client_id = ?2)`;
  const [, , applied, after] = await db.batch<{ amount?: number; starter_left?: number }>([
    db.prepare(
      `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
       SELECT uid, ?2, 'start', 'installment', MIN(starter_left, ?3), ?4 FROM wallets WHERE uid = ?1 AND starter_left > 0 AND starter_day < ?5
       ON CONFLICT(uid, client_id) DO NOTHING`,
    ).bind(uid, id, STARTER_INSTALLMENT, now, day),
    db.prepare(
      `UPDATE wallets SET balance = balance + ${amount}, starter_left = starter_left - ${amount}, starter_day = ?3, updated_at = ?4
       WHERE uid = ?1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`,
    ).bind(uid, id, day, now),
    db.prepare('UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2 AND applied = 0 RETURNING amount').bind(uid, id),
    db.prepare('SELECT starter_left FROM wallets WHERE uid = ?').bind(uid),
  ]);
  const paid = applied.results[0]?.amount ?? 0;
  return paid > 0 ? { paid, left: after.results[0]?.starter_left ?? 0 } : null;
}

export const getBalance = async (db: D1Database, uid: string) => (await getWallet(db, uid)).balance;

/**
 * Ledger insert + balance change, applied exactly once per (uid, clientId). Run inside a batch.
 * With `gate` (a wallet sync's claim, see applyEvents) nothing happens unless that sync got its claim.
 */
export function applyStmts(db: D1Database, uid: string, clientId: string, kind: string, ref: string | null, amount: number, gate: string | null = null) {
  const now = Date.now();
  const insert = db
    .prepare(
      `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ?7 IS NULL OR EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?7)
       ON CONFLICT(uid, client_id) DO NOTHING`,
    )
    .bind(uid, clientId, kind, ref, amount, now, gate);
  if (kind === 'debt') {
    return [
      db.prepare('INSERT INTO bank_accounts (uid, savings, updated_at) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, now),
      insert,
      db.prepare(
        `UPDATE bank_accounts SET debt = debt + ?3, updated_at = ?4
         WHERE uid = ?1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`,
      ).bind(uid, clientId, amount, now),
      db.prepare('UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2 AND applied = 0').bind(uid, clientId),
    ];
  }
  return [
    insert,
    db
      .prepare(
        `UPDATE wallets SET balance = CASE
           WHEN ?3 > 0 OR ?5 IN ('start', 'reset') THEN balance + ?3
           WHEN balance < 0 THEN balance
           ELSE MAX(0, balance + ?3)
         END, updated_at = ?4
         WHERE uid = ?1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`,
      )
      .bind(uid, clientId, amount, now, kind),
    db.prepare(`UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2`).bind(uid, clientId),
  ];
}

/** The most one of these sells back for, or null if it is not something a player can sell. */
function resaleOf(ref: string): number | null {
  const item = ITEMS[ref];
  if (item && !item.fixed) return Math.round(item.price * SELL_FACTOR);
  const car = CAR_BY_ID[ref];
  if (car) return Math.round(car.price * CAR_RESALE_FACTOR);
  if (JET_BY_ID[ref]) return jetResale(ref);
  const phone = PHONE_BY_ID[ref];
  return phone ? Math.round(phone.price * PHONE_RESALE_FACTOR) : null;
}

/**
 * Per unit: the least a buy must pay and the most a sale pays out. Either of the last two prices will do, so a game a
 * tick behind is not refused. When they are so far apart that buying at one and selling at the other would turn a
 * profit, only the newest price is good.
 */
function tradePrices(inv: { costPerUnit: number }, q: { now: number; prev: number }) {
  const price = (mult: number) => Math.round(inv.costPerUnit * mult);
  const payout = (mult: number) => Math.round(price(mult) * LIQUIDATION_FACTOR);
  const low = Math.min(q.now, q.prev);
  const high = Math.max(q.now, q.prev);
  return payout(high) > price(low) ? { buy: price(q.now), sell: payout(q.now) } : { buy: price(low), sell: payout(high) };
}

/**
 * Applies a batch of client events in order against the player's server state.
 * Task events move the server clock; money events are checked against it. Returns rejected ids.
 * `money` is the wallet as the batch starts; it is followed through the events to tell what the player can pay for.
 * `extra` are statements still to be made, once the claim the batch writes under is known (applyEvents).
 * `paid` is what each spending event really took out of the wallet (less than its amount when the wallet ran dry).
 */
async function process(db: D1Database, uid: string, state: PlayerState, events: GameEvent[], payFactor: number, money: number, taxRate: number, rankPay: Record<string, number> = {}): Promise<{ rejected: Map<string, string>; extra: ((gate: string) => D1PreparedStatement)[]; paid: Map<string, number> }> {
  const rejected = new Map<string, string>();
  const paid = new Map<string, number>();
  const extra: ((gate: string) => D1PreparedStatement)[] = [];
  const owned = await ownedCounts(db, uid);
  const market = await currentPrices(db);
  const books = await propertyBooks(db, uid);
  const now = Date.now();
  // Side-hustle earnings in the last real hour, per gig (src/game/gigs.ts caps them).
  const { results: recentGigs } = await db
    .prepare("SELECT ref, SUM(amount) AS total FROM ledger WHERE uid = ? AND kind = 'gig' AND created_at > ? GROUP BY ref")
    .bind(uid, now - 3600_000)
    .all<{ ref: string; total: number }>();
  const gigHour = new Map(recentGigs.map((r) => [r.ref, r.total]));

  // The job whose wage was just accepted: a shift bonus is only good straight after it, once.
  let paidJob: string | null = null;
  // The fare subsidy and the treasury paying it, read the first time this batch buys a ticket and followed through it.
  let fares: Awaited<ReturnType<typeof fareState>> | null = null;

  for (const e of events) {
    if (typeof e.id !== 'string' || e.id.length > 64) {
      rejected.set(String(e.id), 'Malformed');
      continue;
    }
    advance(state, e.at);

    if (e.kind === 'task_start') {
      if (typeof e.task === 'string' && typeof e.action === 'string') taskStart(state, e.task, e.action);
      continue;
    }
    if (e.kind === 'task_end') {
      if (typeof e.task === 'string') taskEnd(state, e.task);
      continue;
    }

    // The dearest cars and jets cost more than the cap: buying or selling one may go up to its own price.
    const showroom = (e.kind === 'buy' || e.kind === 'sell') && typeof e.ref === 'string' ? (JET_BY_ID[e.ref] ?? CAR_BY_ID[e.ref])?.price ?? 0 : 0;
    // So does land in the big estates, and building on it (a refused land payment leaves the plot unpaid and off the estate).
    const property = typeof e.ref === 'string' && e.ref.startsWith('p:') ? MAX_PROPERTY_COST : 0;
    // A trade in a venture can carry several units, and cost that many times the cap.
    const qty = typeof e.ref === 'string' && INVESTMENT_BY_ID[e.ref] && e.qty !== undefined ? e.qty : 1;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_TRADE_UNITS || !Number.isInteger(e.amount) || Math.abs(e.amount!) > Math.max(MAX_EVENT_AMOUNT * qty, showroom, property)) {
      rejected.set(e.id, 'Malformed');
      continue;
    }
    // A ticket (an airline seat or a train) is priced here, not by the client: the route's fare, less the President's
    // subsidy while the federal treasury can pay it and still keep its reserve. The treasury pays the difference.
    const fare = e.kind === 'spend' && e.amount! <= 0 ? parseFareRef(e.ref) : null;
    if (fare) {
      const real = REGION_IDS.includes(fare.from as never) && REGION_IDS.includes(fare.to as never) && fare.from !== fare.to;
      const base = !real ? 0 : fare.mode === 'air' ? flightFare(fare.from, fare.to) : railFare(fare.from, fare.to, fare.cls);
      if (!base) {
        rejected.set(e.id, 'No such route');
        continue;
      }
      fares ??= await fareState(db);
      let { off, price } = subsidise(base, fares[fare.mode]);
      if (off && fares.treasury - off < FARE_SUBSIDY.reserve) ({ off, price } = { off: 0, price: base });
      fares.treasury -= off;
      e.amount = -price;
      if (off) {
        extra.push((gate) =>
          db
            .prepare('UPDATE civic_policies SET treasury = treasury - ?1 WHERE id = 1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?2 AND client_id = ?3)')
            .bind(off, uid, gate));
      }
    }
    const amount = e.amount!;
    const ref = typeof e.ref === 'string' ? e.ref : undefined;

    if (e.kind === 'debt') {
      if (!Number.isInteger(amount) || amount <= 0) rejected.set(e.id, 'Invalid debt');
      continue;
    }

    if (amount <= 0) {
      // Spending only hurts the player. Purchases are tracked so they can be sold later.
      const venture = ref ? INVESTMENT_BY_ID[ref] : undefined;
      const resale = e.kind === 'buy' && ref ? resaleOf(ref) : null;
      // What can be turned back into money has to be paid for: an empty wallet still "spends" (it just stays at
      // zero), and would otherwise own a car, a unit or a house it could sell.
      if ((resale !== null || venture || ref?.startsWith('p:')) && money < -amount) {
        rejected.set(e.id, 'Not enough money');
        continue;
      }
      // A jet resells for hundreds of millions, so it only counts as owned if the full price was paid.
      if (e.kind === 'buy' && ref && JET_BY_ID[ref] && -amount < JET_BY_ID[ref].price) {
        rejected.set(e.id, 'Wrong price');
        continue;
      }
      // Paid less than it sells back for: the money is spent, but there is nothing to sell afterwards.
      if (resale !== null && -amount < resale) e.kind = 'spend';
      if (e.kind === 'buy' && ref) owned.set(ref, (owned.get(ref) ?? 0) + 1);
      if (venture) {
        // Pay today's market price (or the previous tick's, so a price that just moved doesn't void the buy).
        const q = market[venture.id];
        if (!tradable(venture, q, now)) {
          rejected.set(e.id, 'Market closed');
          continue;
        }
        if (-amount < qty * tradePrices(venture, q).buy) {
          rejected.set(e.id, 'Price moved');
          continue;
        }
        changeUnits(state, venture.id, +qty);
      }
      if (ref?.startsWith('p:')) bookProperty(books, ref, amount, now);
      // Dues paid at a motor park go to whoever runs it (collected in worker/fun.ts).
      const park = ref?.startsWith('levy:') ? PARK_BY_ID[ref.slice(5)] : undefined;
      // The same sum the wallet does (applyStmts): never below zero, and a wallet already in the red stays put.
      const pays = money < 0 ? 0 : Math.min(money, -amount);
      // Only dues the wallet covered: the boss is not paid out of an empty pocket.
      if (park && amount >= -1_000 && pays === -amount) {
        extra.push((gate) =>
          db
            .prepare('UPDATE parks SET levies = levies + ?1 WHERE id = ?2 AND boss_uid IS NOT NULL AND boss_uid != ?3 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?3 AND client_id = ?4)')
            .bind(-amount, park.id, uid, gate));
      }
      paid.set(e.id, pays);
      money -= pays;
      continue;
    }

    let problem: string | null = null;
    if (e.kind === 'work') {
      problem = checkWork(state, ref, e.task, amount, payFactor * (rankPay[ref ?? ''] ?? 1));
      paidJob = problem ? null : ref ?? null;
    } else if (e.kind === 'gig') {
      const rule = isGig(ref) ? GIGS[ref] : null;
      const hour = (ref ? gigHour.get(ref) : undefined) ?? 0;
      if (!rule) problem = 'Unknown gig';
      else if (ref === 'shift_bonus' && !paidJob) problem = 'No shift worked';
      else if (ref === 'shift_bonus' && amount > maxShiftBonus(JOBS.find((j) => j.id === paidJob)?.pay ?? 0)) problem = 'Too much';
      else if (amount > rule.max) problem = 'Too much';
      else if (hour + amount > rule.perHour) problem = 'Hourly limit';
      else gigHour.set(ref!, hour + amount);
      if (ref === 'shift_bonus') paidJob = null;
    } else if (e.kind === 'sell') {
      const item = ref ? ITEMS[ref] : undefined;
      const car = ref ? CAR_BY_ID[ref] : undefined;
      const price = ref ? resaleOf(ref) : null;
      if (price === null) problem = 'Unknown item';
      // A worn car sells for less (src/game/carCare.ts), never for more.
      else if (car && !item ? amount > price : amount !== price) problem = 'Wrong price';
      else if ((owned.get(ref!) ?? 0) <= 0) problem = 'Not owned';
      else owned.set(ref!, (owned.get(ref!) ?? 0) - 1);
    } else if (e.kind === 'invest' && ref) {
      // Liquidating units. Each pays what the client works out: the unit price rounded, then the broker's cut.
      const inv = INVESTMENT_BY_ID[ref];
      if (!inv) problem = 'Unknown investment';
      else if (!tradable(inv, market[ref], now)) problem = 'Market closed';
      else if (amount > qty * tradePrices(inv, market[ref]).sell) problem = 'Wrong price';
      else if (unitsOf(state, ref) < qty) problem = 'Not owned';
      else changeUnits(state, ref, -qty);
    } else if (e.kind === 'property' && ref?.startsWith('p:')) {
      problem = checkProperty(books, ref, amount, now);
      if (!problem) bookProperty(books, ref, amount, now);
    } else {
      problem = 'Not an earning';
    }
    if (problem) rejected.set(e.id, problem);
    else money += amount - (e.kind === 'work' || e.kind === 'gig' ? taxOf(amount, taxRate) : 0);
  }
  return { rejected, extra, paid };
}

/** The president's income tax on wages and side hustles, paid into the state treasury. */
export const taxOf = (amount: number, rate: number) => Math.floor((amount * rate) / 100);

/** A charge the state keeps (fees, permits, levies): debits the player like applyStmts and credits the treasury with it. */
export function treasuryStmts(db: D1Database, uid: string, clientId: string, kind: string, ref: string | null, amount: number, gate: string | null = null, scope: 'state' | 'federal' = 'state', city?: CivicCity) {
  const [insert, debit, done] = applyStmts(db, uid, clientId, kind, ref, -amount, gate);
  const fresh = 'EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)';
  return [
    insert,
    debit,
    // What is paid lands in the state the player lives in; federal charges (election fees) go to the federal treasury.
    scope === 'federal'
      ? db.prepare(`UPDATE civic_policies SET treasury = treasury + ?3 WHERE id = 1 AND ${fresh}`).bind(uid, clientId, amount)
      : db.prepare(stateRevenueSql('?3', '?1', fresh, city)).bind(uid, clientId, amount),
    done,
  ];
}

/** What the state keeps out of the `paid` a player's wallet just gave up: land registration on property, VAT on everyday spending. */
function stateCut(kind: string, ref: unknown, paid: number) {
  if (paid <= 0) return 0;
  if (typeof ref === 'string' && ref.startsWith('p:')) return Math.floor(paid * STATE_CUT.land);
  if (kind !== 'spend' && kind !== 'buy') return 0;
  const vat = Math.floor(paid * STATE_CUT.vat);
  // Something bought can be sold straight back: the state never gets more than the player loses doing that, or buying
  // and selling one car over and over would fill the treasury for nothing.
  const resale = kind === 'buy' && typeof ref === 'string' ? resaleOf(ref) : null;
  return resale === null ? vat : Math.min(vat, Math.max(0, paid - resale));
}

/** applyStmts, with `cut` of the money credited to the treasury while the ledger row is still fresh (so a retry never pays twice). */
function spendStmts(db: D1Database, uid: string, clientId: string, kind: string, ref: string | null, amount: number, cut: number, gate: string, city?: CivicCity) {
  const stmts = applyStmts(db, uid, clientId, kind, ref, amount, gate);
  if (cut <= 0 || kind === 'debt') return stmts;
  const done = stmts.pop()!;
  return [
    ...stmts,
    db
      .prepare(stateRevenueSql('?3', '?1', 'EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)', city))
      .bind(uid, clientId, cut),
    done,
  ];
}

const taxStmts = (db: D1Database, uid: string, eventId: string, tax: number, gate: string, city?: CivicCity) => treasuryStmts(db, uid, `tax:${eventId}`, 'tax', 'state', tax, gate, 'state', city);

/** Rent and sale payouts must come from a property the player actually paid for. */
function checkProperty(books: Map<string, PropertyBook>, ref: string, amount: number, now: number): string | null {
  const [, id, what] = ref.split(':');
  const b = books.get(id);
  if (!b || b.spent <= 0) return 'Not owned';
  if (b.sold) return 'Already sold';
  if (what === 'sell') return amount > Math.ceil(b.spent * SALE_FACTOR.complete) ? 'Wrong price' : null;
  if (what === 'rent') {
    const days = ((now - b.firstAt) * GAME_MINUTES_PER_REAL_MS_MAX) / DAY_MINUTES;
    return b.rent + amount > b.spent * RENT_CAP_PER_DAY * days ? 'Too much rent' : null;
  }
  return 'Not an earning';
}

/** The state this life was born in (src/game/regions.ts). Null for a life drawn before there were states: Kaduna. */
const birthState = (db: D1Database, uid: string) =>
  db.prepare('SELECT state FROM wallets WHERE uid = ?').bind(uid).first<{ state: string | null }>().then((r) => r?.state ?? null).catch(() => null);

/**
 * Applies the events a client sends (up to MAX_EVENTS) and returns what it needs to settle them.
 * A closing tab sends its events inside its save instead (worker/index.ts), so this is shared.
 *
 * What is accepted depends on what was just read (what the player owns, holds and has in the wallet), so the write
 * only goes through if none of that moved meanwhile. The first statement is the claim: a ledger row of this sync's own,
 * made only if the player row is at the version read and the wallet holds the balance read. Every other statement
 * checks for that row, the state write moves the version on, and the last statement takes the row away again.
 * Requests that overlap would otherwise each sell the same car. A sync that loses starts over; null means it kept
 * losing, and the client should send again.
 */
export async function applyEvents(db: D1Database, uid: string, list: unknown, here?: CivicCity) {
  const events = (Array.isArray(list) ? (list as GameEvent[]) : []).filter((e) => e && typeof e === 'object').slice(0, MAX_EVENTS);
  for (let attempt = 0; attempt < SYNC_TRIES; attempt++) {
    const { origin, balance } = await getWallet(db, uid);
    const state = await loadState(db, uid);
    // Events already applied (a retry) must not move the clock or credit twice.
    const ids = events.map((e) => `ev:${e.id}`);
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await db
        .prepare(`SELECT client_id FROM ledger WHERE uid = ? AND client_id IN (${chunk.map(() => '?').join(',')})`)
        .bind(uid, ...chunk)
        .all<{ client_id: string }>();
      results.forEach((r) => seen.add(r.client_id.slice(3)));
    }
    const fresh = events.filter((e) => !seen.has(String(e.id)));
    const policy = await loadPolicy(db);
    const presidentRate = policy?.taxRate ?? 0;
    // The state they live in adds its own wage tax to the president's.
    const stateTax = (await homeLaws(db, uid)).incomeTax;
    const taxRate = presidentRate + stateTax;
    const { rejected, extra, paid } = await process(db, uid, state, fresh, originOf(origin).pay, balance, taxRate, fresh.some((e) => e.kind === 'work') ? await careerPayMults(db, uid) : {});
    const accepted = fresh.filter((e) => !rejected.has(String(e.id)));
    // The version this sync leaves behind: always past the one it read, even when no time has gone by.
    state.eventAt = Math.max((state.rev ?? 0) + 1, state.eventAt);
    const gate = `sync:${crypto.randomUUID()}`;
    const taxes = accepted.flatMap((e) => {
      const tax = (e.kind === 'work' || e.kind === 'gig') && (e.amount ?? 0) > 0 ? taxOf(e.amount!, taxRate) : 0;
      return tax > 0 ? taxStmts(db, uid, String(e.id), tax, gate, here) : [];
    });
    const [claim] = await db.batch([
      db
        .prepare(
          `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
           SELECT p.uid, ?2, 'sync', NULL, 0, ?3 FROM players p JOIN wallets w ON w.uid = p.uid
           WHERE p.uid = ?1 AND p.event_at IS ?4 AND w.balance = ?5`,
        )
        .bind(uid, gate, Date.now(), state.rev, balance),
      // Task events go in the ledger too (amount 0) so retries are recognised.
      ...accepted.flatMap((e) => spendStmts(db, uid, `ev:${e.id}`, e.kind, typeof e.ref === 'string' ? e.ref.slice(0, 40) : (e.action ?? null), e.amount ?? 0, stateCut(e.kind, e.ref, paid.get(String(e.id)) ?? 0), gate, here)),
      ...taxes,
      ...extra.map((make) => make(gate)),
      ...saveStateStmts(db, uid, state, gate),
      db.prepare('DELETE FROM ledger WHERE uid = ?1 AND client_id = ?2').bind(uid, gate),
    ]);
    if (!claim.meta.changes) continue;
    const wallet = await getWallet(db, uid);
    // Asked only while a subsidy is on: what the ticket desks should show.
    const fares = policy?.airSubsidy || policy?.railSubsidy ? await fareSubsidy(db) : { air: 0, rail: 0, funded: false };
    return { balance: wallet.balance, debt: wallet.debt, taxRate: presidentRate, stateTax, okadaBan: policy?.okadaBan ?? [], fares, accepted: [...seen, ...accepted.map((e) => e.id)], rejected: Object.fromEntries(rejected) };
  }
  return null;
}

export async function handleWallet(req: Request, env: Env, uid: string, path: string): Promise<Response | null> {
  const db = env.DB;

  if (path === '/api/wallet' && req.method === 'GET') {
    const w = await getWallet(db, uid);
    const starter = await payStarter(db, uid).catch(() => null);
    return json({ balance: w.balance + (starter?.paid ?? 0), origin: w.origin, debt: w.debt, state: await birthState(db, uid), starter });
  }

  if (path === '/api/wallet/events' && req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as { events?: unknown } | null;
    // Only asked when there is something to settle: where you stand decides which state is paid.
    const here = Array.isArray(body?.events) && body.events.length ? await cityNow(env, uid) : undefined;
    // Playing today pays today's installment of the starting money, before the events so the balance below has it.
    const starter = await payStarter(db, uid).catch(() => null);
    const result = await applyEvents(db, uid, body?.events, here);
    // The client keeps its events and sends them again (src/net/wallet.ts).
    return result ? json({ ...result, starter }) : json({ error: 'Busy. Try again' }, 503);
  }

  if (path === '/api/wallet/reset' && req.method === 'POST') {
    // New life. A new birth state can be drawn once a day; before that the new life keeps the same one, and its
    // starting money. Topping up a nearly empty wallet is limited to once a day too. A life on one of the old draw's
    // starts always moves on to the Fresh Start.
    const w = await getWallet(db, uid);
    const now = Date.now();
    const keepOrigin = w.origin === NEW_LIFE_ORIGIN && now - (w.origin_at ?? 0) < REDRAW_COOLDOWN_MS;
    // A kept origin starts its new life on the first installment, with the rest to come a day at a time.
    const start = keepOrigin ? firstInstallment(originOf(w.origin)) : START_MONEY;
    const r = await db.prepare('SELECT reset_at FROM wallets WHERE uid = ?').bind(uid).first<{ reset_at: number | null }>();
    if (w.balance < start && r?.reset_at && now - r.reset_at < RESET_COOLDOWN_MS) {
      return json({ balance: w.balance, kept: true, origin: w.origin, state: await birthState(db, uid) });
    }
    // The top-up is worked out from the balance as it stands when this runs, and only for the life that was read:
    // of several resets at once, one starts the new life and the others change nothing.
    const id = `reset:${now}`;
    await db.batch([
      db
        .prepare(
          `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
           SELECT uid, ?2, 'reset', NULL, ?3 - balance, ?4 FROM wallets WHERE uid = ?1 AND reset_at IS ?5
           ON CONFLICT(uid, client_id) DO NOTHING`,
        )
        .bind(uid, id, start, now, r?.reset_at ?? null),
      db
        .prepare(
          `UPDATE wallets SET balance = ?3, updated_at = ?4, reset_at = ?4, origin = CASE WHEN ?5 THEN origin ELSE NULL END,
             starter_left = ?6, starter_day = ?7
           WHERE uid = ?1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`,
        )
        .bind(uid, id, start, now, keepOrigin ? 1 : 0, keepOrigin ? originOf(w.origin).money - start : 0, starterDay(now)),
      db.prepare('UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2').bind(uid, id),
    ]);
    // A life that draws a new origin is born in a new state too.
    if (!keepOrigin) await db.prepare('UPDATE wallets SET state = NULL WHERE uid = ? AND origin IS NULL').bind(uid).run().catch(() => {});
    return json({ balance: start, kept: false, origin: keepOrigin ? w.origin : null, state: keepOrigin ? await birthState(db, uid) : null });
  }

  if (path === '/api/origin' && req.method === 'POST') {
    // Birth. Only when the player has no origin yet: everyone gets the Fresh Start, and the server draws the state.
    const w = await getWallet(db, uid);
    if (w.origin) return json({ origin: w.origin, balance: w.balance, already: true, state: await birthState(db, uid) });
    const origin = NEW_LIFE_ORIGIN;
    // Born holding the first installment; the rest comes a day at a time (payStarter).
    const first = firstInstallment(ORIGINS[origin]);
    const life = await db.prepare('SELECT reset_at FROM wallets WHERE uid = ?').bind(uid).first<{ reset_at: number | null }>();
    // One draw per life: the ledger id makes a second, racing request a no-op.
    await db.batch([
      ...applyStmts(db, uid, `origin:${life?.reset_at ?? 0}`, 'start', origin, first - w.balance),
      db.prepare(
        `UPDATE bank_accounts SET debt = debt + ?2, updated_at = ?3
         WHERE uid = ?1 AND EXISTS (SELECT 1 FROM wallets WHERE uid = ?1 AND origin IS NULL)`,
      ).bind(uid, ORIGINS[origin].debt ?? 0, Date.now()),
      db.prepare('UPDATE wallets SET origin = ?2, origin_at = ?3, starter_left = ?4, starter_day = ?5 WHERE uid = ?1 AND origin IS NULL')
        .bind(uid, origin, Date.now(), ORIGINS[origin].money - first, starterDay(Date.now())),
    ]);
    // The state is drawn at birth, every state as likely as the next. Only the request that won the draw sets it.
    const [pick] = crypto.getRandomValues(new Uint32Array(1));
    await db.prepare('UPDATE wallets SET state = ?2 WHERE uid = ?1 AND state IS NULL').bind(uid, REGION_IDS[pick % REGION_IDS.length]).run().catch(() => {});
    const after = await getWallet(db, uid);
    return json({ origin: after.origin, balance: after.balance, debt: after.debt, already: false, state: await birthState(db, uid) });
  }

  return null;
}
