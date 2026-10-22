// Careers and businesses: train skills, check job promotions, run stalls at places on the map.
//
// Promotions are counted from the work ledger (one row per shift, ref = job id), so they can't be
// claimed. A business is open while its shelf holds something to sell, and stock leaves the shelf only
// when someone buys: a player, or customers who aren't players (worker/shops.ts, from the cron). The owner
// buys units at wholesale (by hand, or by auto-restock), sets a price and is paid per sale. A business
// rents a stall at one place: the place sets how many stalls fit.
// What the state charges (registration, move permits, the delivery levy) lands in the treasury.
//
// Timed stock (stocked_until) is from before shelf-only trading (migration 0064) and can't be bought any
// more. What was already paid for runs out its hours through settled() and is paid when the owner collects.

import type { FirebaseUser } from './auth';
import { handle, naira, postFeed } from './feed';
import { sendPush } from './push';
import { usernames } from './crime';
import { conditionOf, homeCity, lawsOf, stateRevenue, stateRevenueSql } from './state';
import { ORIGIN_OF, restockPrice } from '../src/game/trade';
import { scaledFee, schoolFactor } from '../src/game/treasury';
import { CIVIC_CITIES, type CivicCity } from '../src/game/civic';
import { applyStmts, ensureWallet, getBalance, treasuryStmts } from './wallet';
import { JOBS } from '../src/game/catalog';
import '../src/game/abuja';
import '../src/game/lagos';
import '../src/game/kano';
import { CITY_MAPS, type Place } from '../src/game/city';
import {
  BIZ, BIZ_COLOURS, BIZ_SIZES, BIZ_SIZE_ORDER, BUSINESS_BY_ID, BUSINESSES, JOB_RANKS, MARKET_PRODUCTS, MARKET_PRODUCT_BY_ID, NPC_SHOP, OPERATE_XP_PER_HOUR, SKILLS, SKILL_BY_ID, STALLS, TRAIN, allowedIcon, deliveryFee, demandAt, hourlyOf, nextSkillXp, rankIndex, NEWCOMER, payMults, registrationFee,
  openCost, rentOf, resizeCost, shelfOf, sizeOf, skillLevel, slotsOf, trainFee, upgradeCost, wageOf, type BusinessDef, type SkillId,
} from '../src/game/career';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const body = async <T>(req: Request) => (await req.json().catch(() => null)) as T | null;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ---------- Skills and promotions ---------- */

export async function skillXp(db: D1Database, uid: string): Promise<Record<SkillId, number>> {
  const { results } = await db.prepare('SELECT skill, xp FROM skills WHERE uid = ?').bind(uid).all<{ skill: SkillId; xp: number }>();
  const out = { cooking: 0, mechanic: 0, tailoring: 0, trading: 0 } as Record<SkillId, number>;
  for (const r of results) if (r.skill in out) out[r.skill] = r.xp;
  return out;
}

const addXp = (db: D1Database, uid: string, skill: SkillId, xp: number, trainedAt?: number) =>
  db
    .prepare(
      `INSERT INTO skills (uid, skill, xp, trained_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(uid, skill) DO UPDATE SET xp = xp + ?3, trained_at = MAX(trained_at, ?4)`,
    )
    .bind(uid, skill, xp, trainedAt ?? 0);

/** Shifts worked per job, from the ledger. */
export async function shiftCounts(db: D1Database, uid: string): Promise<Record<string, number>> {
  // Left to itself SQLite takes (uid, ref) to skip sorting the GROUP BY, and reads the player's whole ledger.
  const { results } = await db
    .prepare("SELECT ref, COUNT(*) AS n FROM ledger INDEXED BY ledger_uid_kind WHERE uid = ? AND kind = 'work' AND amount > 0 GROUP BY ref")
    .bind(uid)
    .all<{ ref: string | null; n: number }>();
  const out: Record<string, number> = {};
  for (const r of results) if (r.ref) out[r.ref] = r.n;
  return out;
}

/** Pay multiplier per job for the wallet's work check (worker/wallet.ts). */
export async function careerPayMults(db: D1Database, uid: string) {
  return payMults(await shiftCounts(db, uid));
}

/* ---------- Businesses ---------- */

interface BizRow {
  id: number; uid: string; type: keyof typeof BUSINESS_BY_ID; name: string; level: number; staff: number;
  stocked_until: number; last_settle: number; pending_net: number; pending_ms: number; created_at: number; area: string;
  /** The city the stall is in, and the place there. */
  city: string; place_id: string; icon: string; color: string; pending_rent: number; size: string;
  /** When the shelf last held stock (a restock or a sale), and whether it holds any now (HAS_STOCK). */
  shelf_at: number; stocked: number;
}

const toTreasury = (db: D1Database, uid: string, amount: number) => stateRevenue(db, uid, amount);
const cleanName = (name: string | undefined, fallback: string) => (name ?? '').trim().replace(/\s+/g, ' ').slice(0, BIZ.maxNameLen) || fallback;

interface ProductRow {
  id: number; business_id: number; product: string; price: number; stock: number; sold: number;
}

/** A listing's auto-restock (migrations/0099_npc_shoppers.sql): refill at `min` up to `to`; `short` once the wallet couldn't cover it. */
interface AutoRow { id: number; auto_min: number | null; auto_to: number | null; auto_short: number }

function listingView(row: ProductRow, auto?: AutoRow) {
  const product = MARKET_PRODUCT_BY_ID[row.product];
  return product ? {
    id: row.id, product: row.product, price: row.price, stock: row.stock, sold: row.sold,
    auto: auto?.auto_min != null && auto.auto_to != null ? { min: auto.auto_min, to: auto.auto_to, short: !!auto.auto_short } : null,
  } : null;
}

/** What customers (worker/shops.ts) and auto-restock did at a player's shops lately, newest first, for the Business app. */
async function shopActivity(db: D1Database, uid: string, now: number) {
  const since = now - DAY;
  const [events, totals] = await Promise.all([
    db.prepare(
      `SELECT bp.business_id, o.product, o.quantity, o.total - o.tax AS amount, o.created_at AS at, 'sale' AS kind
       FROM marketplace_orders o JOIN business_products bp ON bp.id = o.product_id
       WHERE o.seller_uid = ?1 AND o.status = 'paid' AND o.created_at > ?2 AND o.buyer_uid = ?3
       UNION ALL
       SELECT business_id, product, quantity, -cost, created_at, 'restock' FROM business_restock_requests
       WHERE id >= 'auto:' AND id < 'auto;' AND uid = ?1 AND status = 'paid' AND created_at > ?2
       ORDER BY at DESC LIMIT 60`,
    ).bind(uid, since, NPC_SHOP.buyer).all<{ business_id: number; product: string; quantity: number; amount: number; at: number; kind: 'sale' | 'restock' }>(),
    db.prepare(
      `SELECT bp.business_id, SUM(o.quantity) AS units, SUM(o.total - o.tax) AS net
       FROM marketplace_orders o JOIN business_products bp ON bp.id = o.product_id
       WHERE o.seller_uid = ?1 AND o.status = 'paid' AND o.created_at > ?2 AND o.buyer_uid = ?3 GROUP BY bp.business_id`,
    ).bind(uid, since, NPC_SHOP.buyer).all<{ business_id: number; units: number; net: number }>(),
  ]).catch(() => [{ results: [] }, { results: [] }] as const);
  const activity = new Map<number, { kind: 'sale' | 'restock'; product: string; quantity: number; amount: number; at: number }[]>();
  for (const e of events.results) {
    const list = activity.get(e.business_id) ?? [];
    if (list.length < 8) list.push({ kind: e.kind, product: e.product, quantity: e.quantity, amount: e.amount, at: e.at });
    activity.set(e.business_id, list);
  }
  return { activity, customers: new Map(totals.results.map((t) => [t.business_id, { units: t.units, net: t.net }])) };
}

/* ---------- Stalls and foot traffic ---------- */

const today = (now: number) => Math.floor(now / DAY);

/** The city a request names, if there is such a city. A request that names none means Kaduna, as every request did before there was a second one. */
const HOME = 'kaduna';
/** A city that has a government of its own, or undefined (the fee then goes to the payer's home state). */
const civicCity = (id: string | null | undefined): CivicCity | undefined => CIVIC_CITIES.find((c) => c === id);
const cityOf = (id: string | null | undefined): string | null => (id == null || id === '' ? HOME : Object.hasOwn(CITY_MAPS, id) ? id : null);
/** A place as it stands in one city: the airport is a different place in each. */
const placeIn = (city: string, id: string | null | undefined): Place | undefined =>
  (id && Object.hasOwn(CITY_MAPS, city) ? CITY_MAPS[city].placeById[id] : undefined);
/** A stall is one place in one city. */
export const spot = (city: string, place: string) => `${city}:${place}`;

/** Players who walked into each place today or yesterday, by `spot`. */
export async function visitorsAt(db: D1Database, at: { city: string; place_id: string }[], now: number): Promise<Map<string, number>> {
  const ids = [...new Set(at.map((a) => a.place_id).filter((p) => p in STALLS))];
  if (!ids.length) return new Map();
  const { results } = await db
    .prepare(`SELECT city, place_id, COUNT(DISTINCT uid) AS n FROM place_visits WHERE place_id IN (${ids.map(() => '?').join(',')}) AND day >= ? GROUP BY city, place_id`)
    .bind(...ids, today(now) - 1)
    .all<{ city: string; place_id: string; n: number }>();
  return new Map(results.map((r) => [spot(r.city, r.place_id), r.n]));
}

/** SQL for "this business has something on its shelf", which is what makes it open. */
export const HAS_STOCK = 'EXISTS (SELECT 1 FROM business_products bp WHERE bp.business_id = businesses.id AND bp.stock > 0)';
/** SQL for "this business still holds its stall": something on the shelf, or the shelf emptied (or the stall opened) within the hold window. Binds one value: now - BIZ.stallHoldMs. */
const HOLDS_STALL = `(${HAS_STOCK} OR shelf_at > ?1 OR created_at > ?1)`;
export const holdsStall = (row: Pick<BizRow, 'stocked' | 'shelf_at' | 'created_at'>, now: number) => row.stocked > 0 || Math.max(row.shelf_at, row.created_at) > now - BIZ.stallHoldMs;

/** Stalls taken at a place, not counting business `except`. */
async function stallsTaken(db: D1Database, city: string, place: string, now: number, except = 0) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM businesses WHERE ${HOLDS_STALL} AND place_id = ?2 AND id != ?3 AND city = ?4`)
    .bind(now - BIZ.stallHoldMs, place, except, city)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Rows as they would be if settled at `now` (no write). `visitors` is the foot traffic at the business's place. */
function settled(row: BizRow, skill: number, now: number, visitors: number): BizRow {
  const def = BUSINESS_BY_ID[row.type];
  const to = Math.min(now, row.stocked_until);
  const ms = Math.max(0, to - row.last_settle);
  if (!ms) return { ...row, last_settle: Math.max(row.last_settle, now) };
  const hours = ms / HOUR;
  const gross = hourlyOf(def, row.level, row.staff, skill, demandAt(row.place_id, visitors)) * hours;
  const rent = rentOf(row.place_id, sizeOf(row.size)) * hours;
  const wages = wageOf(def, row.level) * row.staff * hours;
  return {
    ...row, last_settle: now, pending_net: row.pending_net + Math.round(gross - wages - rent),
    pending_ms: row.pending_ms + ms, pending_rent: row.pending_rent + Math.round(rent),
  };
}

/** Writes a settled row back, only if nobody changed it meanwhile. */
const saveSettled = (db: D1Database, before: BizRow, after: BizRow, extra: Partial<BizRow> = {}) => {
  const next = { ...after, ...extra };
  return db
    .prepare(
      `UPDATE businesses SET level = ?, staff = ?, stocked_until = ?, last_settle = ?, pending_net = ?, pending_ms = ?, pending_rent = ?,
              name = ?, icon = ?, color = ?, place_id = ?, area = ?, city = ?
       WHERE id = ? AND uid = ? AND last_settle = ?`,
    )
    .bind(next.level, next.staff, next.stocked_until, next.last_settle, next.pending_net, next.pending_ms, next.pending_rent,
      next.name, next.icon, next.color, next.place_id, next.area, next.city, before.id, before.uid, before.last_settle);
};

function bizView(row: BizRow, skill: number, now: number, visitors: number) {
  const def = BUSINESS_BY_ID[row.type];
  const s = settled(row, skill, now, visitors);
  return {
    id: row.id, type: row.type, name: row.name, level: row.level, staff: row.staff, slots: slotsOf(row.level, sizeOf(row.size)),
    size: sizeOf(row.size), shelf: shelfOf(sizeOf(row.size)),
    icon: row.icon || def.icon, color: row.color || BIZ_COLOURS[0],
    area: row.area, city: row.city, place: row.place_id, hasStall: row.place_id in STALLS && holdsStall(row, now),
    open: row.stocked > 0,
    pending: Math.max(0, s.pending_net),
    upgrade: row.level < BIZ.maxLevel ? upgradeCost(def, row.level) : null,
  };
}

const owned = (db: D1Database, uid: string, id: number) =>
  db.prepare(`SELECT *, ${HAS_STOCK} AS stocked FROM businesses WHERE id = ? AND uid = ?`).bind(id, uid).first<BizRow>();

/* ---------- Restocks and sales, whoever starts them ---------- */

export interface Restock {
  /** Unique per restock: the client's request id, or 'auto:<tick>:<listing>' for an automatic one. */
  requestId: string;
  uid: string; businessId: number; listingId: number; product: string;
  quantity: number;
  /** The shelf price the listing keeps (the owner's restock can change it at the same time). */
  price: number;
  /** What the units cost all in, and the part of that which is the origin state's export levy. */
  cost: number; levy: number; origin: CivicCity | null | undefined;
  /** Units of one product the shelf holds. */
  shelf: number;
}

/**
 * Buying stock at wholesale from the owner's wallet: the owner's own restock (/api/business/listing) and the
 * automatic one (worker/shops.ts) both run these. Each statement checks the request itself, so one batch can hold
 * several restocks; afterwards the request is 'paid' or 'failed', and a request id that was used already does nothing.
 */
export function restockStmts(db: D1Database, r: Restock, now: number) {
  return [
    ensureWallet(db, r.uid),
    db.prepare(
      "INSERT OR IGNORE INTO business_restock_requests (id, business_id, uid, product, quantity, cost, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    ).bind(r.requestId, r.businessId, r.uid, r.product, r.quantity, r.cost, now),
    db.prepare(
      `UPDATE wallets SET balance = balance - ?3, updated_at = ?4
       WHERE uid = ?1 AND balance >= ?3
         AND EXISTS (SELECT 1 FROM business_restock_requests WHERE id = ?2 AND uid = ?1 AND business_id = ?5 AND product = ?6
                     AND quantity = ?7 AND cost = ?3 AND status = 'pending')
         AND EXISTS (SELECT 1 FROM business_products WHERE id = ?8 AND business_id = ?5 AND stock + ?7 <= ?9)`,
    ).bind(r.uid, r.requestId, r.cost, now, r.businessId, r.product, r.quantity, r.listingId, r.shelf),
    db.prepare(
      `UPDATE business_products SET price = ?3, stock = stock + ?4
       WHERE id = ?1 AND business_id = ?2 AND stock + ?4 <= ?5
         AND EXISTS (SELECT 1 FROM business_restock_requests WHERE id = ?6 AND uid = ?7 AND business_id = ?2
                     AND product = ?8 AND quantity = ?4 AND cost = ?9 AND status = 'pending')
         AND changes() = 1`,
    ).bind(r.listingId, r.businessId, r.price, r.quantity, r.shelf, r.requestId, r.uid, r.product, r.cost),
    db.prepare(
      `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
       SELECT ?1, ?2, 'spend', ?3, ?4, 1, ?5
       WHERE changes() = 1 AND EXISTS (SELECT 1 FROM business_restock_requests WHERE id = ?6 AND status = 'pending')`,
    ).bind(r.uid, `market-stock:${r.requestId}`, `market-stock:${r.product}`, -r.cost, now, r.requestId),
    db.prepare("UPDATE business_restock_requests SET status = 'paid' WHERE id = ? AND status = 'pending' AND changes() = 1")
      .bind(r.requestId),
    // The levy goes to the state the goods come from, only when this very batch marked the request paid.
    // With the state named the shop owner isn't in the statement at all: binding them anyway makes D1 refuse the whole batch.
    ...(r.levy > 0 && r.origin ? [db.prepare(stateRevenueSql('?1', '?2', 'changes() = 1', r.origin)).bind(r.levy)] : []),
    db.prepare("UPDATE business_restock_requests SET status = 'failed' WHERE id = ? AND status = 'pending'")
      .bind(r.requestId),
    db.prepare("UPDATE businesses SET shelf_at = ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM business_restock_requests WHERE id = ?3 AND status = 'paid')")
      .bind(now, r.businessId, r.requestId),
  ];
}

export interface Sale {
  /** The marketplace_orders row, already written as 'pending'. */
  orderId: string;
  listingId: number; seller: string; quantity: number;
  /** The shelf price times the units: what the seller is paid before the sales tax the order row holds. */
  total: number;
  /** What the state gets out of the order: the sales tax, plus any delivery levy. */
  stateTake: number;
  /** The shop's city, and whose home state takes the money if that city has no government of its own. */
  city: string; payer: string;
}

/**
 * The seller's side of an order, the same whoever the buyer is (a player at /api/market/buy, or customers from
 * worker/shops.ts): the units leave the shelf, the seller is paid the shelf price less sales tax, the order is marked
 * paid and the state gets its take. The first statement only goes ahead if the one just before it in the batch changed
 * a row (the buyer paying, or the customers' order being written), and each one after only if the one before did.
 */
export function saleStmts(db: D1Database, o: Sale, now: number) {
  const state = civicCity(o.city);
  return [
    db.prepare(
      `UPDATE business_products SET stock = stock - ?2 WHERE id = ?1 AND stock >= ?2 AND changes() = 1
         AND EXISTS (SELECT 1 FROM marketplace_orders WHERE id = ?3 AND product_id = ?1 AND quantity = ?2 AND status = 'pending')`,
    ).bind(o.listingId, o.quantity, o.orderId),
    db.prepare(
      `UPDATE wallets SET balance = balance + ?2 - (SELECT tax FROM marketplace_orders WHERE id = ?4), updated_at = ?3 WHERE uid = ?1 AND changes() = 1
         AND EXISTS (SELECT 1 FROM marketplace_orders WHERE id = ?4 AND seller_uid = ?1 AND total = ?2 AND status = 'pending')`,
    ).bind(o.seller, o.total, now, o.orderId),
    db.prepare("UPDATE marketplace_orders SET status = 'paid' WHERE id = ? AND status = 'pending' AND changes() = 1")
      .bind(o.orderId),
    // Only when this very batch marked the order paid. With the shop's own state named, the payer isn't in the
    // statement at all: binding them anyway makes D1 refuse the whole batch.
    ...(o.stateTake > 0 ? [db.prepare(stateRevenueSql('?1', '?2', 'changes() = 1', state)).bind(...(state ? [o.stateTake] : [o.stateTake, o.payer]))] : []),
    db.prepare(
      `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
       SELECT seller_uid, 'market-sale:' || id, 'market_sale', product, total - tax, 1, ?2
       FROM marketplace_orders WHERE id = ?1 AND status = 'paid'
       ON CONFLICT(uid, client_id) DO NOTHING`,
    ).bind(o.orderId, now),
  ];
}

/* ---------- Router ---------- */

export async function handleCareer(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/career') && !path.startsWith('/api/business') && !path.startsWith('/api/market')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();
  const post = req.method === 'POST';

  if (path === '/api/market' && req.method === 'GET') {
    const url = new URL(req.url);
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 40);
    const type = url.searchParams.get('type') ?? '';
    const place = url.searchParams.get('place') ?? '';
    const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get('page')) || 1));
    const filters = ['bp.stock > 0'];
    const values: (string | number)[] = [];
    if (type && Object.hasOwn(BUSINESS_BY_ID, type)) {
      filters.push('b.type = ?');
      values.push(type);
    }
    if (place && place in STALLS) {
      filters.push('b.place_id = ?');
      values.push(place);
    }
    const shop = Number(url.searchParams.get('shop'));
    if (Number.isInteger(shop) && shop > 0) {
      filters.push('b.id = ?');
      values.push(shop);
    } else {
      // Shops are listed for one city: the one the player is in. A shared shop is shown wherever it is.
      const city = cityOf(url.searchParams.get('city'));
      if (!city) return err(400, 'Unknown city');
      filters.push('b.city = ?');
      values.push(city);
    }
    if (query) {
      const productIds = MARKET_PRODUCTS.filter((product) => product.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((product) => product.id);
      const productSearch = productIds.length ? ` OR bp.product IN (${productIds.map(() => '?').join(',')})` : '';
      filters.push(`(b.name LIKE ? COLLATE NOCASE OR p.username LIKE ? COLLATE NOCASE OR bp.product LIKE ? COLLATE NOCASE${productSearch})`);
      values.push(`%${query}%`, `%${query}%`, `%${query}%`, ...productIds);
    }
    // Friends only: shops owned by players I am friends with.
    if (url.searchParams.get('scope') === 'friends') {
      filters.push("b.uid IN (SELECT CASE WHEN f.a = ? THEN f.b ELSE f.a END FROM friendships f WHERE f.status = 'accepted' AND (f.a = ? OR f.b = ?))");
      values.push(me, me, me);
    }
    const where = filters.join(' AND ');
    const from = 'FROM business_products bp JOIN businesses b ON b.id = bp.business_id JOIN players p ON p.uid = b.uid';
    // A page is twelve shops, each with its whole shelf, so one business is never split across pages.
    const count = await db.prepare(`SELECT COUNT(DISTINCT b.id) AS total ${from} WHERE ${where}`).bind(...values).first<{ total: number }>();
    const total = count?.total ?? 0;
    const offset = (page - 1) * 12;
    const rotate = Math.floor(now / (5 * 60_000)) % Math.max(1, total);
    const { results: shops } = await db.prepare(
      `SELECT b.id ${from} WHERE ${where} GROUP BY b.id ORDER BY ((b.id - ? + ?) % ?), b.id LIMIT 12 OFFSET ?`,
    ).bind(...values, rotate, Math.max(1, total), Math.max(1, total), offset).all<{ id: number }>();
    const order = new Map(shops.map((shop, i) => [shop.id, i]));
    const { results: rows } = shops.length ? await db.prepare(
      `SELECT bp.id, bp.product, bp.price, bp.stock, b.id AS business_id, b.type AS business_type,
              b.name AS business_name, b.icon AS business_icon, b.color AS business_color, b.area, b.city, b.place_id, p.username AS seller,
              COALESCE((SELECT SUM(o.quantity) FROM marketplace_orders o WHERE o.product_id = bp.id AND o.status = 'paid'), 0) AS sold
       ${from} WHERE ${where} AND b.id IN (${shops.map(() => '?').join(',')}) ORDER BY bp.id`,
    ).bind(...values, ...shops.map((shop) => shop.id)).all<{
      id: number; product: string; price: number; stock: number; business_id: number; business_type: string;
      business_name: string; business_icon: string; business_color: string; area: string; city: string; place_id: string; seller: string; sold: number;
    }>() : { results: [] };
    const results = [...rows].sort((x, y) => (order.get(x.business_id) ?? 0) - (order.get(y.business_id) ?? 0));
    return json({
      items: results.flatMap((r) => {
        const product = MARKET_PRODUCT_BY_ID[r.product];
        if (!product) return [];
        return [{
          id: r.id, product: r.product, price: r.price, stock: r.stock, sold: r.sold,
          businessId: r.business_id, businessType: r.business_type, businessName: r.business_name,
          businessIcon: r.business_icon || BUSINESS_BY_ID[r.business_type as keyof typeof BUSINESS_BY_ID]?.icon || '🏪', businessColor: r.business_color || BIZ_COLOURS[0],
          area: r.area, city: r.city, place: r.place_id, seller: r.seller, open: r.stock > 0, icon: product.icon, name: product.name,
        }];
      }),
      page, total, pages: Math.ceil(total / 12),
    });
  }

  // Every place in one city that rents stalls: how many are taken, how many shops are trading and how busy it has been.
  if (path === '/api/market/places' && req.method === 'GET') {
    const city = cityOf(new URL(req.url).searchParams.get('city'));
    if (!city) return err(400, 'Unknown city');
    const ids = Object.keys(STALLS).filter((id) => placeIn(city, id));
    const [{ results: stalls }, { results: shops }, visitors] = await Promise.all([
      db.prepare(`SELECT place_id, COUNT(*) AS taken FROM businesses WHERE ${HOLDS_STALL} AND place_id != '' AND city = ?2 GROUP BY place_id`)
        .bind(now - BIZ.stallHoldMs, city).all<{ place_id: string; taken: number }>(),
      db.prepare(
        `SELECT b.place_id, b.name FROM businesses b
         WHERE b.city = ? AND EXISTS (SELECT 1 FROM business_products bp WHERE bp.business_id = b.id AND bp.stock > 0)
         ORDER BY b.level DESC, b.id LIMIT 500`,
      ).bind(city).all<{ place_id: string; name: string }>(),
      visitorsAt(db, ids.map((place_id) => ({ city, place_id })), now),
    ]);
    const taken = new Map(stalls.map((r) => [r.place_id, r.taken]));
    return json({
      city,
      places: Object.fromEntries(ids.map((id) => {
        const stall = STALLS[id];
        const here = shops.filter((s) => s.place_id === id);
        return [id, { slots: stall.slots, taken: Math.min(stall.slots, taken.get(id) ?? 0), open: here.length, top: here[0]?.name ?? null, visitors: visitors.get(spot(city, id)) ?? 0 }];
      })),
    });
  }

  // Walking into a place counts once a day towards its foot traffic.
  if (path === '/api/market/visit' && post) {
    const b = await body<{ place?: string; city?: string }>(req);
    const city = cityOf(b?.city);
    if (!b?.place || !city || !(b.place in STALLS) || !placeIn(city, b.place)) return json({ ok: true });
    await db.prepare('INSERT OR IGNORE INTO place_visits (city, place_id, day, uid) VALUES (?, ?, ?, ?)').bind(city, b.place, today(now), me).run();
    return json({ ok: true });
  }

  if (path === '/api/career' && req.method === 'GET') {
    const [xp, shifts, { results: rows }] = await Promise.all([
      skillXp(db, me),
      shiftCounts(db, me),
      db.prepare(`SELECT *, ${HAS_STOCK} AS stocked FROM businesses WHERE uid = ? ORDER BY id`).bind(me).all<BizRow>(),
    ]);
    const products = rows.length
      ? await db.prepare(
        `SELECT bp.id, bp.business_id, bp.product, bp.price, bp.stock,
                COALESCE((SELECT SUM(o.quantity) FROM marketplace_orders o WHERE o.product_id = bp.id AND o.status = 'paid'), 0) AS sold
         FROM business_products bp WHERE bp.business_id IN (${rows.map(() => '?').join(',')}) ORDER BY bp.id`,
      ).bind(...rows.map((r) => r.id)).all<ProductRow>()
      : { results: [] as ProductRow[] };
    // Read on their own, so the Business app still loads before migrations/0099_npc_shoppers.sql has run.
    const [autos, recent] = await Promise.all([
      rows.length
        ? db.prepare(`SELECT id, auto_min, auto_to, auto_short FROM business_products WHERE business_id IN (${rows.map(() => '?').join(',')})`)
          .bind(...rows.map((r) => r.id)).all<AutoRow>().then((r) => r.results).catch(() => [] as AutoRow[])
        : [] as AutoRow[],
      shopActivity(db, me, now),
    ]);
    const autoById = new Map(autos.map((a) => [a.id, a]));
    const listingsByBusiness = new Map<number, NonNullable<ReturnType<typeof listingView>>[]>();
    for (const p of products.results) {
      const listing = listingView(p, autoById.get(p.id));
      if (listing) listingsByBusiness.set(p.business_id, [...(listingsByBusiness.get(p.business_id) ?? []), listing]);
    }
    const trained = await db.prepare('SELECT skill, trained_at FROM skills WHERE uid = ?').bind(me).all<{ skill: string; trained_at: number }>();
    const visitors = await visitorsAt(db, rows, now);
    const last = new Map(trained.results.map((t) => [t.skill, t.trained_at]));
    const courses = schoolFactor(await conditionOf(db, await homeCity(db, me), 'schools'));
    return json({
      skills: SKILLS.map((s) => ({
        id: s.id, xp: xp[s.id], level: skillLevel(xp[s.id]), next: nextSkillXp(xp[s.id]),
        fee: Math.round(trainFee(xp[s.id]) * courses), readyAt: (last.get(s.id) ?? 0) + TRAIN.cooldownMs,
      })),
      jobs: JOBS.filter((j) => shifts[j.id]).map((j) => {
        const n = shifts[j.id];
        const r = rankIndex(n);
        return { id: j.id, shifts: n, rank: r, title: JOB_RANKS[r].title, mult: JOB_RANKS[r].pay, nextAt: JOB_RANKS[r + 1]?.shifts ?? null };
      }),
      mults: payMults(shifts),
      newcomer: Math.max(0, NEWCOMER.shifts - Object.values(shifts).reduce((a, n) => a + n, 0)),
      businesses: rows.map((r) => ({
        ...bizView(r, skillLevel(xp[BUSINESS_BY_ID[r.type].skill]), now, visitors.get(spot(r.city, r.place_id)) ?? 0),
        listings: listingsByBusiness.get(r.id) ?? [],
        customers: recent.customers.get(r.id) ?? { units: 0, net: 0 },
        activity: recent.activity.get(r.id) ?? [],
      })),
    });
  }

  if (path === '/api/career/train' && post) {
    const b = await body<{ skill?: string }>(req);
    const skill = b?.skill && b.skill in SKILL_BY_ID ? (b.skill as SkillId) : null;
    if (!skill) return err(400, 'Unknown skill');
    const xp = (await skillXp(db, me))[skill];
    if (skillLevel(xp) >= 10) return err(409, 'You have mastered this');
    const row = await db.prepare('SELECT trained_at FROM skills WHERE uid = ? AND skill = ?').bind(me, skill).first<{ trained_at: number }>();
    if (row && row.trained_at + TRAIN.cooldownMs > now) return err(429, 'Rest a little before the next course');
    const fee = Math.round(trainFee(xp) * schoolFactor(await conditionOf(db, await homeCity(db, me), 'schools')));
    if ((await getBalance(db, me)) < fee) return err(402, `The course costs ${naira(fee)}`);
    await db.batch([ensureWallet(db, me), ...applyStmts(db, me, `train:${skill}:${now}`, 'spend', `train:${skill}`, -fee), addXp(db, me, skill, TRAIN.xp, now)]);
    return json({ ok: true, xp: xp + TRAIN.xp, level: skillLevel(xp + TRAIN.xp), balance: await getBalance(db, me) });
  }

  if (path === '/api/business/buy' && post) {
    const b = await body<{ type?: string; name?: string; place?: string; city?: string; icon?: string; color?: string; size?: string }>(req);
    const def: BusinessDef | undefined = BUSINESSES.find((x) => x.id === b?.type);
    if (!def) return err(400, 'Unknown business');
    const icon = b?.icon && allowedIcon(b.icon) ? b.icon : def.icon;
    const color = b?.color && BIZ_COLOURS.includes(b.color) ? b.color : BIZ_COLOURS[0];
    // The stall is in the city the player opened it from.
    const city = cityOf(b?.city);
    const place = city && b?.place && def.places.includes(b.place) ? placeIn(city, b.place) : undefined;
    const stall = place && STALLS[place.id];
    if (!city || !place || !stall) return err(400, `Choose where to open your ${def.name}`);
    const xp = await skillXp(db, me);
    if (skillLevel(xp[def.skill]) < def.minSkill) return err(403, `Needs ${SKILL_BY_ID[def.skill].label} level ${def.minSkill}`);
    const size = sizeOf(b?.size);
    // The state sets the registration fee: the fit-out costs what it always did, and the fee moves with the state's law.
    const base = registrationFee(def, size);
    const registration = scaledFee(base, (await lawsOf(db, city)).bizFee);
    const fitOut = openCost(def, size) - base;
    const cost = fitOut + registration;
    if ((await getBalance(db, me)) < cost) return err(402, `That costs ${naira(cost)}`);
    if (await db.prepare('SELECT 1 FROM businesses WHERE uid = ? AND type = ?').bind(me, def.id).first()) return err(409, `You already run a ${def.name}`);
    const name = cleanName(b?.name, def.name);
    // The stall count is checked in the same statement as the insert, so two players can't take the last stall.
    const made = await db
      .prepare(
        `INSERT OR IGNORE INTO businesses (uid, type, name, last_settle, created_at, place_id, area, icon, color, size, city)
         SELECT ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?9, ?10, ?11, ?12
         WHERE (SELECT COUNT(*) FROM businesses WHERE ${HOLDS_STALL} AND place_id = ?6 AND city = ?12) < ?8
         RETURNING id`,
      )
      .bind(now - BIZ.stallHoldMs, me, def.id, name, now, place.id, place.area, stall.slots, icon, color, size, city)
      .first<{ id: number }>();
    if (!made) return err(409, `Every stall at ${place.name} is taken. Try another place`);
    // Fitting out the building is spent; the registration is the state's, the one the stall is in.
    await db.batch([
      ensureWallet(db, me),
      ...applyStmts(db, me, `biz-buy:${made.id}`, 'buy', `biz:${def.id}`, -fitOut),
      ...treasuryStmts(db, me, `biz-reg:${made.id}`, 'fee', `biz-reg:${def.id}`, registration, null, 'state', city as CivicCity),
    ]);
    await postFeed(db, me, 'business', def.icon, `${handle((await usernames(db, [me])).get(me))} opened "${name}" (${def.name}) at ${place.name}.`);
    return json({ ok: true, id: made.id, balance: await getBalance(db, me) });
  }

  if (path === '/api/business/listing' && post) {
    const b = await body<{ id?: number; product?: string; price?: number; quantity?: number; requestId?: string }>(req);
    const product = b?.product && Object.hasOwn(MARKET_PRODUCT_BY_ID, b.product) ? MARKET_PRODUCT_BY_ID[b.product] : undefined;
    if (!Number.isInteger(b?.id) || !product || !Number.isInteger(b?.price) || !Number.isInteger(b?.quantity) ||
        !b?.requestId || !/^[\w-]{16,64}$/.test(b.requestId)) return err(400, 'Check the listing details');
    const row = await owned(db, me, b.id!);
    if (!row) return err(404, 'No such business');
    if (row.type !== product.business) return err(403, 'That product does not belong in this business');
    if (b.price! < product.wholesale || b.price! > product.wholesale * BIZ.maxMarketPriceMultiple) {
      return err(400, `Set a price from ${naira(product.wholesale)} to ${naira(product.wholesale * BIZ.maxMarketPriceMultiple)}`);
    }
    if (b.quantity! < 0 || b.quantity! > BIZ.maxRestock) return err(400, `Restock between 0 and ${BIZ.maxRestock} units`);

    let listing = await db.prepare('SELECT id, stock FROM business_products WHERE business_id = ? AND product = ?')
      .bind(row.id, product.id).first<{ id: number; stock: number }>();
    if (!listing && b.quantity === 0) return err(400, 'Add stock to create a listing');
    if (!listing) {
      await db.prepare('INSERT OR IGNORE INTO business_products (business_id, product, price) VALUES (?, ?, ?)')
        .bind(row.id, product.id, b.price).run();
      listing = await db.prepare('SELECT id, stock FROM business_products WHERE business_id = ? AND product = ?')
        .bind(row.id, product.id).first<{ id: number; stock: number }>();
    }
    if (!listing) throw new Error('Business listing could not be created');
    const shelf = shelfOf(sizeOf(row.size));
    if (listing.stock + b.quantity! > shelf) return err(400, `A ${BIZ_SIZES[sizeOf(row.size)].label.toLowerCase()} shelf holds up to ${shelf} of each product. Build bigger to hold more`);

    if (b.quantity === 0) {
      await db.prepare('UPDATE business_products SET price = ? WHERE id = ? AND business_id = ?')
        .bind(b.price, listing.id, row.id).run();
      return json({ ok: true, balance: await getBalance(db, me) });
    }

    const stall = STALLS[row.place_id];
    if (!stall) return err(409, 'Pick a place for this business first');
    // Shelf empty for too long and the stall went back to the place: it has to be free to reopen.
    if (!holdsStall(row, now) && (await stallsTaken(db, row.city, row.place_id, now, row.id)) >= stall.slots) {
      return err(409, `Your stall at ${placeIn(row.city, row.place_id)?.name ?? 'that place'} was given away. Move the business to reopen`);
    }

    const prior = await db.prepare('SELECT business_id, uid, product, quantity, cost, status FROM business_restock_requests WHERE id = ?')
      .bind(b.requestId).first<{ business_id: number; uid: string; product: string; quantity: number; cost: number; status: string }>();
    // Goods made in the shop's own state are a little cheaper; goods from another state carry that state's export levy.
    const origin = ORIGIN_OF[product.id];
    const price = restockPrice(product.wholesale, product.id, row.city, origin && origin !== row.city ? (await lawsOf(db, origin)).exportLevy : 0);
    const cost = b.quantity! * price.unit;
    const levy = b.quantity! * price.levy;
    if (prior) {
      if (prior.business_id !== row.id || prior.uid !== me || prior.product !== product.id || prior.quantity !== b.quantity) {
        return err(409, 'This restock request was already used');
      }
      if (prior.status !== 'paid') return err(409, 'That restock request could not be completed');
      return json({ ok: true, balance: await getBalance(db, me) });
    }

    await db.batch(restockStmts(db, {
      requestId: b.requestId, uid: me, businessId: row.id, listingId: listing.id, product: product.id,
      quantity: b.quantity!, price: b.price!, cost, levy, origin, shelf,
    }, now));
    const request = await db.prepare('SELECT status FROM business_restock_requests WHERE id = ?').bind(b.requestId).first<{ status: string }>();
    if (request?.status !== 'paid') {
      const balance = await getBalance(db, me);
      return err(402, balance < cost ? `You need ${naira(cost)} to restock` : 'The stock changed. Try again.');
    }
    return json({ ok: true, balance: await getBalance(db, me) });
  }

  if (path === '/api/market/buy' && post) {
    const b = await body<{ listingId?: number; quantity?: number; requestId?: string; at?: string; city?: string }>(req);
    if (!Number.isInteger(b?.listingId) || !Number.isInteger(b?.quantity) || b!.quantity! < 1 ||
        b!.quantity! > BIZ.maxMarketOrder || !b?.requestId || !/^[\w-]{16,64}$/.test(b.requestId)) {
      return err(400, 'Check the order details');
    }
    const existing = await db.prepare(
      'SELECT product_id, quantity, status FROM marketplace_orders WHERE buyer_uid = ? AND id = ?',
    ).bind(me, b.requestId).first<{ product_id: number; quantity: number; status: string }>();
    if (existing) {
      if (existing.product_id !== b.listingId || existing.quantity !== b.quantity) return err(409, 'This order request was already used');
      if (existing.status !== 'paid') return err(409, 'That order could not be completed');
      const priorOrder = await db.prepare('SELECT product, total, fee FROM marketplace_orders WHERE id = ?').bind(b.requestId).first<{ product: string; total: number; fee: number }>();
      return json({ ok: true, product: priorOrder?.product, quantity: existing.quantity, total: priorOrder?.total, fee: priorOrder?.fee ?? 0, balance: await getBalance(db, me) });
    }
    const listing = await db.prepare(
      `SELECT bp.id, bp.business_id, bp.product, bp.price, bp.stock, b.uid AS seller_uid, b.city, b.place_id, b.name AS business_name
       FROM business_products bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id = ?`,
    ).bind(b.listingId).first<{ id: number; business_id: number; product: string; price: number; stock: number; seller_uid: string; city: string; place_id: string; business_name: string }>();
    if (!listing || !MARKET_PRODUCT_BY_ID[listing.product]) return err(404, 'That listing is no longer available');
    if (listing.seller_uid === me) return err(403, 'You cannot buy from your own business');
    if (listing.stock < b.quantity!) return err(409, 'Not enough stock left');
    const product = Object.hasOwn(MARKET_PRODUCT_BY_ID, listing.product) ? MARKET_PRODUCT_BY_ID[listing.product] : undefined;
    if (!product) return err(404, 'That listing is no longer available');
    const total = listing.price * b.quantity!;
    // Walk in and you pay the shelf price; order from anywhere else and delivery is added. The seller gets the shelf price either way.
    const fee = b.at && b.at === listing.place_id && cityOf(b.city) === listing.city ? 0 : scaledFee(deliveryFee(total), (await lawsOf(db, listing.city)).deliveryFee);
    const charge = total + fee;
    // The shop's state takes its sales tax from the seller.
    const salesTax = scaledFee(total, (await lawsOf(db, listing.city)).salesTax);
    await db.batch([
      ensureWallet(db, me),
      ensureWallet(db, listing.seller_uid),
      db.prepare(
        `INSERT OR IGNORE INTO marketplace_orders (id, buyer_uid, seller_uid, product_id, product, quantity, unit_price, total, fee, status, created_at, tax)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ).bind(b.requestId, me, listing.seller_uid, listing.id, product.id, b.quantity, listing.price, total, fee, now, salesTax),
      db.prepare(
        `UPDATE wallets SET balance = balance - ?9, updated_at = ?4
         WHERE uid = ?1 AND balance >= ?9
           AND EXISTS (SELECT 1 FROM marketplace_orders WHERE id = ?2 AND buyer_uid = ?1 AND seller_uid = ?7
                       AND product_id = ?5 AND quantity = ?6 AND total = ?3 AND total + fee = ?9 AND status = 'pending')
           AND EXISTS (SELECT 1 FROM business_products WHERE id = ?5 AND business_id = ?8 AND stock >= ?6)`,
      ).bind(me, b.requestId, total, now, listing.id, b.quantity, listing.seller_uid, listing.business_id, charge),
      // The delivery levy and the sales tax both go to the state; the buyer's home state if the shop's city has no government.
      ...saleStmts(db, { orderId: b.requestId, listingId: listing.id, seller: listing.seller_uid, quantity: b.quantity!, total, stateTake: fee + salesTax, city: listing.city, payer: me }, now),
      db.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT buyer_uid, 'market-buy:' || id, 'market_buy', product, -(total + fee), 1, ?2
         FROM marketplace_orders WHERE id = ?1 AND status = 'paid'`,
      ).bind(b.requestId, now),
      // The shelf held stock up to this sale: if that was the last unit, the hold on the stall runs from here.
      db.prepare("UPDATE businesses SET shelf_at = ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM marketplace_orders WHERE id = ?3 AND status = 'paid')")
        .bind(now, listing.business_id, b.requestId),
      db.prepare("UPDATE marketplace_orders SET status = 'failed' WHERE id = ? AND status = 'pending'")
        .bind(b.requestId),
    ]);
    const order = await db.prepare('SELECT status FROM marketplace_orders WHERE id = ?').bind(b.requestId).first<{ status: string }>();
    if (order?.status !== 'paid') {
      const [balance, current] = await Promise.all([
        getBalance(db, me),
        db.prepare('SELECT stock FROM business_products WHERE id = ?').bind(listing.id).first<{ stock: number }>(),
      ]);
      if (balance < charge) return err(402, `You need ${naira(charge)} for this order`);
      return err(409, (current?.stock ?? 0) < b.quantity! ? 'Not enough stock left' : 'This listing just changed. Refresh and try again.');
    }
    const buyer = (await usernames(db, [me])).get(me);
    sendPush(env, ctx, listing.seller_uid, {
      title: `🛍️ Sale at ${listing.business_name}`,
      body: `${handle(buyer)} bought ${b.quantity} × ${product.name}. ${naira(total - salesTax)} is in your wallet${salesTax ? ` after ${naira(salesTax)} sales tax` : ''}.`,
      tag: `shop-sale-${listing.business_id}`,
      category: 'money', app: 'business',
    });
    return json({ ok: true, product: product.id, quantity: b.quantity, total, fee, balance: await getBalance(db, me) });
  }

  // Everything below acts on one of your businesses.
  const id = Number((await body<{ id?: number }>(req.clone()))?.id);
  if (!post || !Number.isInteger(id)) return err(404, 'Not found');
  const row = await owned(db, me, id);
  if (!row) return err(404, 'No such business');
  const def = BUSINESS_BY_ID[row.type];
  const skill = skillLevel((await skillXp(db, me))[def.skill]);
  const after = settled(row, skill, now, (await visitorsAt(db, [row], now)).get(spot(row.city, row.place_id)) ?? 0);
  const clash = () => err(409, 'Busy, try again');
  const balance = () => getBalance(db, me);

  if (path === '/api/business/collect') {
    const pay = Math.max(0, after.pending_net);
    const xp = Math.floor((after.pending_ms / HOUR) * OPERATE_XP_PER_HOUR);
    if (pay <= 0 && xp <= 0) return err(409, 'Nothing to collect yet');
    // Rent comes out of what the stall took in; a stall that lost money can't pay more than it made.
    const rent = Math.min(after.pending_rent, Math.max(0, after.pending_net + after.pending_rent));
    const res = await saveSettled(db, row, after, { pending_net: 0, pending_ms: 0, pending_rent: 0 }).run();
    if (!res.meta.changes) return clash();
    // The state the stall is in takes its business tax out of the income.
    const bizTax = pay > 0 ? scaledFee(pay, (await lawsOf(db, row.city)).bizTax) : 0;
    await db.batch([
      ensureWallet(db, me),
      ...(rent > 0 ? [toTreasury(db, me, rent)] : []),
      ...(bizTax > 0 ? [stateRevenue(db, me, bizTax, civicCity(row.city))] : []),
      ...(pay > 0 ? applyStmts(db, me, `biz-collect:${id}:${after.last_settle}`, 'biz_income', `biz:${row.type}`, pay - bizTax) : []),
      ...(xp > 0 ? [addXp(db, me, def.skill, xp)] : []),
    ]);
    return json({ ok: true, paid: pay - bizTax, tax: bizTax, xp, rent, balance: await balance() });
  }

  if (path === '/api/business/move') {
    // A move is to another place in the business's own city.
    const b = await body<{ place?: string }>(req);
    const place = b?.place && def.places.includes(b.place) ? placeIn(row.city, b.place) : undefined;
    const stall = place && STALLS[place.id];
    if (!place || !stall) return err(400, `A ${def.name} can't open there`);
    if (place.id === row.place_id && holdsStall(row, now)) return err(409, `Already at ${place.name}`);
    if ((await stallsTaken(db, row.city, place.id, now, id)) >= stall.slots) return err(409, `Every stall at ${place.name} is taken`);
    const permit = scaledFee(BIZ.moveFee, (await lawsOf(db, row.city)).moveFee);
    if ((await balance()) < permit) return err(402, `Moving costs ${naira(permit)}`);
    // A fresh created_at restarts the hold on the new stall.
    const res = await saveSettled(db, row, after, { place_id: place.id, area: place.area }).run();
    if (!res.meta.changes) return clash();
    await db.batch([
      db.prepare('UPDATE businesses SET created_at = ? WHERE id = ? AND uid = ?').bind(now, id, me),
      ensureWallet(db, me),
      ...treasuryStmts(db, me, `biz-move:${id}:${after.last_settle}`, 'fee', `biz-move:${row.type}`, permit, null, 'state', civicCity(row.city)),
    ]);
    return json({ ok: true, place: place.id, balance: await balance() });
  }

  if (path === '/api/business/brand') {
    const b = await body<{ name?: string; icon?: string; color?: string }>(req);
    const res = await saveSettled(db, row, after, {
      name: cleanName(b?.name, row.name),
      icon: b?.icon && allowedIcon(b.icon) ? b.icon : row.icon,
      color: b?.color && BIZ_COLOURS.includes(b.color) ? b.color : row.color,
    }).run();
    return res.meta.changes ? json({ ok: true }) : clash();
  }

  // Auto-restock for one product on the shelf: worker/shops.ts refills it to `to` from the wallet once it drops to `min`.
  if (path === '/api/business/auto') {
    const b = await body<{ product?: string; on?: boolean; min?: number; to?: number }>(req);
    const product = b?.product && Object.hasOwn(MARKET_PRODUCT_BY_ID, b.product) ? MARKET_PRODUCT_BY_ID[b.product] : undefined;
    if (!product || product.business !== row.type) return err(400, 'That product does not belong in this business');
    const listing = await db.prepare('SELECT id FROM business_products WHERE business_id = ? AND product = ?').bind(id, product.id).first<{ id: number }>();
    if (!listing) return err(400, 'Stock it once yourself, then turn on auto-restock');
    const shelf = shelfOf(sizeOf(row.size));
    const on = b?.on === true;
    if (on && (!Number.isInteger(b?.min) || !Number.isInteger(b?.to) || b!.min! < 0 || b!.to! > shelf || b!.min! >= b!.to!)) {
      return err(400, `Refill below the top level, and fill to at most ${shelf}`);
    }
    // A fresh setting forgets an old "couldn't pay": the next shortfall is told again.
    const res = await db.prepare('UPDATE business_products SET auto_min = ?1, auto_to = ?2, auto_short = 0 WHERE id = ?3 AND business_id = ?4')
      .bind(on ? b!.min : null, on ? b!.to : null, listing.id, id).run().catch(() => null);
    if (!res) return err(503, 'Auto-restock is not open yet. Try again later');
    return json({ ok: true });
  }

  if (path === '/api/business/hire') {
    if (row.staff >= slotsOf(row.level, sizeOf(row.size))) return err(409, 'No free staff slots. Upgrade or build bigger first');
    if ((await balance()) < BIZ.hireFee) return err(402, `Hiring costs ${naira(BIZ.hireFee)}`);
    const res = await saveSettled(db, row, after, { staff: row.staff + 1 }).run();
    if (!res.meta.changes) return clash();
    await db.batch([ensureWallet(db, me), ...applyStmts(db, me, `biz-hire:${id}:${after.last_settle}`, 'spend', `biz-hire:${row.type}`, -BIZ.hireFee)]);
    return json({ ok: true, balance: await balance() });
  }

  if (path === '/api/business/fire') {
    if (row.staff <= 0) return err(409, 'No staff to let go');
    const res = await saveSettled(db, row, after, { staff: row.staff - 1 }).run();
    return res.meta.changes ? json({ ok: true }) : clash();
  }

  if (path === '/api/business/upgrade') {
    if (row.level >= BIZ.maxLevel) return err(409, 'Already top level');
    const cost = upgradeCost(def, row.level);
    if ((await balance()) < cost) return err(402, `The upgrade costs ${naira(cost)}`);
    const res = await saveSettled(db, row, after, { level: row.level + 1 }).run();
    if (!res.meta.changes) return clash();
    await db.batch([ensureWallet(db, me), ...applyStmts(db, me, `biz-up:${id}:${row.level + 1}`, 'spend', `biz-up:${row.type}`, -cost)]);
    return json({ ok: true, level: row.level + 1, balance: await balance() });
  }

  // Build out to a bigger size: pay the difference. A building never shrinks.
  if (path === '/api/business/resize') {
    const b = await body<{ size?: string }>(req);
    const from = sizeOf(row.size);
    const to = sizeOf(b?.size);
    if (b?.size !== to || BIZ_SIZE_ORDER.indexOf(to) <= BIZ_SIZE_ORDER.indexOf(from)) return err(400, 'Pick a bigger size');
    const cost = resizeCost(def, from, to);
    if ((await balance()) < cost) return err(402, `Building a ${BIZ_SIZES[to].label.toLowerCase()} costs ${naira(cost)}`);
    // Settle first so the hours already traded are charged the old rent.
    const res = await saveSettled(db, row, after).run();
    if (!res.meta.changes) return clash();
    const grown = await db.prepare('UPDATE businesses SET size = ?1 WHERE id = ?2 AND uid = ?3 AND size = ?4').bind(to, id, me, row.size).run();
    if (!grown.meta.changes) return clash();
    await db.batch([ensureWallet(db, me), ...applyStmts(db, me, `biz-size:${id}:${to}`, 'spend', `biz-size:${row.type}`, -cost)]);
    return json({ ok: true, size: to, balance: await balance() });
  }

  return err(404, 'Not found');
}
