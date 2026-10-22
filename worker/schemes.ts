// The other ways an office holder moves public money into their own pocket (src/game/civic.ts SCHEMES), each with a
// risk of its own: a front company can be raided, Mallam's BDC can vanish with the money, customs can search the jet,
// and ghost workers get likelier to be audited every hour they stay on the payroll. The snake and its EFCC case are
// worker/loot.ts; palliative diversion is part of sharing palliatives (worker/civic.ts). worker/civic.ts checks who
// may run a scheme and its waiting time; this file runs it.

import { CITY_HEAD, CITY_NAME, CIVIC_CITIES, OFFICE_RULES, SCHEMES, suspendedUntil, type CivicCity, type PoliticalOffice } from '../src/game/civic';
import { rand, transfer, usernames } from './crime';
import { feedStmt, naira } from './feed';
import { gazette, official } from './gazette';
import { removeFromOffice } from './loot';
import { fineItem, recordExhibits } from './exhibits';
import { MARKET_PRODUCT_BY_ID } from '../src/game/career';
import { vdmGov } from './news';
import { spendState } from './state';
import { inRange } from '../src/game/treasury';
import { applyStmts, ensureWallet } from './wallet';

type Ctx = ExecutionContext | undefined;
const HOUR = 3600_000;

/** Who is running a scheme: their office, and the treasury they reach (a state's, or null for the federal one). */
export interface Schemer {
  uid: string;
  office: PoliticalOffice;
  city: CivicCity | null;
}
/** `strikes`: caught in office, the strikes against them now (OFFICE_STRIKES); `searched` means it cost them the seat, `searched-struck` that it did not. */
export type SchemeResult = { error: string; status: number } | { outcome: string; amount: number; strikes?: number };

/** Money going back into a treasury: a state's, or the federal one (null). */
export const potStmt = (db: D1Database, city: CivicCity | null, amount: number) =>
  city
    ? db.prepare('UPDATE state_treasuries SET balance = balance + ?1 WHERE city = ?2').bind(amount, city)
    : db.prepare('UPDATE civic_policies SET treasury = treasury + ?1 WHERE id = 1').bind(amount);

/** What a treasury holds right now. */
export const potBalance = async (db: D1Database, city: CivicCity | null) =>
  city
    ? ((await db.prepare('SELECT balance FROM state_treasuries WHERE city = ?').bind(city).first<{ balance: number }>())?.balance ?? 0)
    : ((await db.prepare('SELECT treasury FROM civic_policies WHERE id = 1').first<{ treasury: number }>())?.treasury ?? 0);

/** Take money out of a treasury, all of it or none. */
const takePot = async (db: D1Database, city: CivicCity | null, amount: number) =>
  city
    ? (await spendState(db, city, amount, { allowArrears: true })) !== null
    : !!(await db.prepare('UPDATE civic_policies SET treasury = treasury - ?1 WHERE id = 1 AND treasury >= ?1 RETURNING treasury').bind(amount).first());

const where = (city: CivicCity | null) => (city ? `${CITY_NAME[city]}’s treasury` : 'the federal treasury');

/** Front company, Mallam's BDC or Ghana Must Go bags. `amount` is the invoice or the sum to change; the bags take what they can. */
export async function runScheme(env: Env, ctx: Ctx, s: Schemer, scheme: 'front' | 'bdc' | 'bags', amount: number | undefined, now: number): Promise<SchemeResult> {
  const db = env.DB;
  const pot = await potBalance(db, s.city);
  const who = (await usernames(db, [s.uid])).get(s.uid);
  const me = official(s.office, who);
  const pay = (sum: number, tag: string) => db.batch([ensureWallet(db, s.uid), ...applyStmts(db, s.uid, `${tag}:${s.uid}:${now}`, 'embezzle', s.office, sum)]);

  if (scheme === 'front') {
    const f = SCHEMES.front;
    if (!inRange(amount, f.sizes)) return { error: 'Pick the size of the invoice', status: 400 };
    const biz = await db.prepare('SELECT name FROM businesses WHERE uid = ? ORDER BY id LIMIT 1').bind(s.uid).first<{ name: string }>();
    if (!biz) return { error: 'You need a business to invoice from. Open one in the Business app', status: 409 };
    if (pot < amount) return { error: `${where(s.city)} doesn’t hold ${naira(amount)}`, status: 402 };
    if (!(await takePot(db, s.city, amount))) return { error: 'The treasury changed. Try again', status: 409 };
    await pay(amount, 'front');
    // The cover story goes on record: it is how the EFCC finds it.
    await gazette(env, ctx, [{ uid: s.uid, office: s.office, kind: 'project', icon: '📦', text: `${me} paid ${naira(amount)} from ${where(s.city)} to ${biz.name} for “supplies”.` }]);
    if (rand() >= f.raid(amount)) return { outcome: 'paid', amount };
    // Raided: the money goes back, a fine on top, and every shelf they own is carried off as evidence.
    const back = await transfer(db, s.uid, null, amount, 'loot_return', '', `front-back:${s.uid}:${now}`);
    const fine = await transfer(db, s.uid, null, f.fine, 'efcc_fine', '', `front-fine:${s.uid}:${now}`);
    // Everything on the shelves goes as evidence: written down shelf by shelf before it is carried off and auctioned.
    const { results: shelves } = await db
      .prepare('SELECT b.name AS shop, bp.product, bp.price, bp.stock FROM business_products bp JOIN businesses b ON b.id = bp.business_id WHERE b.uid = ? AND bp.stock > 0')
      .bind(s.uid)
      .all<{ shop: string; product: string; price: number; stock: number }>();
    await recordExhibits(db, s.uid, `front:${now}`, `EFCC raid on ${biz.name}`, [
      { kind: 'loot', icon: '📦', label: '“Supplies” money taken back', value: back },
      ...shelves.map((r) => ({ kind: 'stock' as const, icon: MARKET_PRODUCT_BY_ID[r.product]?.icon ?? '🏷️', label: `${MARKET_PRODUCT_BY_ID[r.product]?.name ?? r.product} · ${r.shop}`, value: r.price * r.stock, qty: r.stock })),
      fineItem(fine),
    ], now);
    const seized = shelves.reduce((sum, r) => sum + r.price * r.stock, 0);
    await db.batch([
      potStmt(db, s.city, back),
      // The seized stock is auctioned and the EFCC remits what it fetches to the federal treasury: valued as the shelves
      // stand at this moment, in the same batch that clears them, so nothing sold meanwhile is counted.
      db.prepare(
        `UPDATE civic_policies SET treasury = treasury + (
           SELECT COALESCE(SUM(bp.price * bp.stock), 0) FROM business_products bp JOIN businesses b ON b.id = bp.business_id WHERE b.uid = ?1 AND bp.stock > 0
         ) WHERE id = 1`,
      ).bind(s.uid),
      db.prepare('UPDATE business_products SET stock = 0 WHERE business_id IN (SELECT id FROM businesses WHERE uid = ?)').bind(s.uid),
      feedStmt(db, s.uid, 'politics', '🚨', `EFCC RAID: operatives stormed ${biz.name}, a company owned by ${me}, over ${naira(amount)} of “supplies” paid from ${where(s.city)}. Shelves emptied, ${naira(back)} recovered, ${naira(fine)} fine.${seized ? ` The seized goods go under the hammer: ${naira(seized)} to the federal treasury.` : ''} 🚨`, s.city),
      ...(await vdmGov(db, s.uid, 'contract', { who: me, amount: naira(amount), other: biz.name }, s.city, true)),
    ]);
    await gazette(env, ctx, [{ uid: s.uid, office: s.office, kind: 'scandal', icon: '🚨', text: `The EFCC raided ${biz.name}, owned by ${me}: ${naira(back)} back to ${where(s.city)}${seized ? `, and the stock seized and auctioned for ${naira(seized)} to the federal treasury` : ''}.` }]);
    return { outcome: 'raided', amount };
  }

  if (scheme === 'bdc') {
    const b = SCHEMES.bdc;
    if (!inRange(amount, b.sizes)) return { error: 'Pick how much to change', status: 400 };
    if (pot < amount) return { error: `${where(s.city)} doesn’t hold ${naira(amount)}`, status: 402 };
    if (!(await takePot(db, s.city, amount))) return { error: 'The treasury changed. Try again', status: 409 };
    // No EFCC, no record. Mallam keeps his cut, and now and then he keeps the lot.
    if (rand() < b.vanish) {
      await feedStmt(db, null, 'politics', '💱', `Mallam’s bureau de change at the airport roundabout is shut this morning. Neighbours say he left at night with “a big Ghana Must Go”. Nobody has reported anything missing. 🤐`, s.city).run().catch(() => {});
      return { outcome: 'vanished', amount: 0 };
    }
    const kept = Math.floor(amount * (1 - b.fee));
    await pay(kept, 'bdc');
    return { outcome: 'washed', amount: kept };
  }

  const g = SCHEMES.bags;
  const haul = Math.min(g.cap, Math.floor(pot * g.share));
  if (haul < 1_000) return { error: 'There is not enough in the treasury to fill a bag', status: 402 };
  if (!(await takePot(db, s.city, haul))) return { error: 'The treasury changed. Try again', status: 409 };
  if (rand() < g.search) {
    // Searched on the tarmac: the bags go back where they came from, and so does the office.
    await db.batch([potStmt(db, s.city, haul)]);
    const hit = await removeFromOffice(
      env, ctx, s.uid, s.office, `Caught at the airport with ${naira(haul)} in Ghana Must Go bags`, now,
      `CAUGHT AT THE AIRPORT: customs opened the “diplomatic baggage” on ${me}’s jet and found ${naira(haul)} from ${where(s.city)} in Ghana Must Go bags. Out of office, {fine} fine, and a cell. 🧳`,
      haul,
      [{ kind: 'loot', icon: '🧳', label: 'Ghana Must Go bags', value: haul }],
    );
    return { outcome: hit.removed ? 'searched' : 'searched-struck', amount: haul, strikes: hit.strikes };
  }
  await pay(haul, 'bags');
  await feedStmt(db, null, 'politics', '🛩️', `A state jet left the airport overnight with “diplomatic baggage”. No passenger list. No flight plan. Customs say they saw nothing. 🛩️`, s.city).run().catch(() => {});
  return { outcome: 'flown', amount: haul };
}

/** A governor puts ghost workers on their state's payroll, or quietly takes them off (keeping what they paid). */
export async function setGhosts(db: D1Database, uid: string, city: CivicCity, on: boolean, now: number): Promise<SchemeResult> {
  if (on) {
    const row = await db
      .prepare('UPDATE state_treasuries SET ghost_uid = ?1, ghost_at = ?2, ghost_rounds = 0, ghost_taken = 0 WHERE city = ?3 AND ghost_uid IS NULL RETURNING city')
      .bind(uid, now, city)
      .first();
    return row ? { outcome: 'ghosts', amount: 0 } : { error: 'The payroll already has its ghosts', status: 409 };
  }
  const row = await db.prepare('UPDATE state_treasuries SET ghost_uid = NULL WHERE city = ?1 AND ghost_uid = ?2 RETURNING ghost_taken').bind(city, uid).first<{ ghost_taken: number }>();
  return row ? { outcome: 'noGhosts', amount: row.ghost_taken } : { error: 'There are no ghosts on the payroll', status: 409 };
}

/** The ghost workers I run, if any: where, for how many rounds, and what they have paid me. Empty until migration 0094. */
export async function myGhosts(db: D1Database, uid: string) {
  try {
    const row = await db.prepare('SELECT city, ghost_rounds, ghost_taken FROM state_treasuries WHERE ghost_uid = ?').bind(uid).first<{ city: CivicCity; ghost_rounds: number; ghost_taken: number }>();
    return row ? { city: row.city, rounds: row.ghost_rounds, taken: row.ghost_taken } : null;
  } catch {
    return null;
  }
}

/**
 * Cron: every hour each state's ghost workers are paid, into the governor's wallet, unless the auditors look first.
 * Each round they are likelier to: caught, everything the ghosts took goes back and the governor is out.
 */
export async function settleGhosts(env: Env, ctx: Ctx, now: number) {
  const db = env.DB;
  let due: { city: CivicCity; ghost_uid: string; ghost_at: number; ghost_rounds: number; ghost_taken: number; balance: number }[];
  try {
    due = (await db
      .prepare('SELECT city, ghost_uid, ghost_at, ghost_rounds, ghost_taken, balance FROM state_treasuries WHERE ghost_uid IS NOT NULL AND ghost_at <= ?')
      .bind(now - HOUR)
      .all<(typeof due)[number]>()).results;
  } catch {
    return;
  }
  if (!due.length) return;
  const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<Record<string, unknown>>();
  for (const g of due) {
    if (!CIVIC_CITIES.includes(g.city)) continue;
    // Claim the round first: whoever gets here first pays it, once.
    const claimed = await db.prepare('UPDATE state_treasuries SET ghost_at = ?1 WHERE city = ?2 AND ghost_uid = ?3 AND ghost_at = ?4 RETURNING city').bind(now, g.city, g.ghost_uid, g.ghost_at).first();
    if (!claimed) continue;
    const office = CITY_HEAD[g.city];
    // The ghosts leave with the governor who hired them, and stay quiet while the president runs the state.
    if (policy?.[`${office}_uid`] !== g.ghost_uid) {
      await db.prepare('UPDATE state_treasuries SET ghost_uid = NULL WHERE city = ? AND ghost_uid = ?').bind(g.city, g.ghost_uid).run();
      continue;
    }
    if (suspendedUntil(policy, office, now)) continue;
    if (rand() < SCHEMES.ghost.audit(g.ghost_rounds)) {
      const back = await transfer(db, g.ghost_uid, null, g.ghost_taken, 'loot_return', '', `ghost-back:${g.city}:${now}`);
      await db.batch([
        db.prepare('UPDATE state_treasuries SET ghost_uid = NULL WHERE city = ?').bind(g.city),
        potStmt(db, g.city, back),
      ]);
      await removeFromOffice(
        env, ctx, g.ghost_uid, office, `Ran ghost workers on the ${CITY_NAME[g.city]} payroll`, now,
        `PAYROLL AUDIT: ${CITY_NAME[g.city]}’s payroll had workers nobody has ever met, and every one of them was paid into ${OFFICE_RULES[office].title} {who}’s account. ${naira(back)} recovered. Out of office, {fine} fine, and a cell. 👻`,
        g.ghost_taken,
        [{ kind: 'loot', icon: '👻', label: 'Ghost workers’ pay taken back', value: back }],
      );
      continue;
    }
    const pay = Math.min(SCHEMES.ghost.cap, Math.floor(g.balance * SCHEMES.ghost.share));
    if (pay <= 0 || (await spendState(db, g.city, pay, { allowArrears: true })) === null) continue;
    await db.batch([
      ensureWallet(db, g.ghost_uid),
      ...applyStmts(db, g.ghost_uid, `ghost:${g.city}:${now}`, 'embezzle', office, pay),
      db.prepare('UPDATE state_treasuries SET ghost_rounds = ghost_rounds + 1, ghost_taken = ghost_taken + ?1 WHERE city = ?2').bind(pay, g.city),
    ]);
  }
}
