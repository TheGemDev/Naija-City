// Players' shops between player visits, once per cron tick. Customers who aren't players walk in and buy (each stocked
// product has its chance, from NPC_SHOP in src/game/career.ts), and shelves with auto-restock on are topped back up
// from the owner's wallet. Both go through the same statements as a player's purchase and the owner's own restock
// (saleStmts, restockStmts in worker/career.ts), so the owner is paid, taxed and charged exactly as they would be.
//
// Customers buy under one made-up uid (NPC_SHOP.buyer) that has no wallet: their money comes from nowhere, like an NPC
// tenant's rent. Their orders are ids 'npc:<tick>:<listing>' and the automatic restocks 'auto:<tick>:<listing>', which a
// client's request id can never be (no colons), so a tick that runs twice does nothing the second time.

import {
  BUSINESSES, BUSINESS_BY_ID, MARKET_PRODUCT_BY_ID, NPC_SHOP, STALLS, demandAt, hourlyOf, npcExpected, npcHourFactor, shelfOf, sizeOf, skillLevel,
} from '../src/game/career';
import { restockPrice, ORIGIN_OF } from '../src/game/trade';
import { scaledFee, type StateLaws } from '../src/game/treasury';
import { HAS_STOCK, holdsStall, restockStmts, saleStmts, spot, visitorsAt, type Restock, type Sale } from './career';
import { rand } from './crime';
import { naira } from './feed';
import { sendPush } from './push';
import { lawsOf } from './state';

/** Orders (or restocks) per D1 batch: one bad row then only loses its own few. */
const CHUNK = 8;

/** A whole number of units drawn around `mean` (Poisson): usually 0 when the mean is small, now and then more. */
function poisson(mean: number) {
  const floor = Math.exp(-Math.min(mean, NPC_SHOP.maxUnits * 2));
  let k = 0;
  for (let p = rand(); p > floor; p *= rand()) k++;
  return k;
}

/** The state laws of each city asked for, read once per tick. */
function lawCache(db: D1Database) {
  const seen = new Map<string, Promise<StateLaws>>();
  return (city: string) => {
    if (!seen.has(city)) seen.set(city, lawsOf(db, city));
    return seen.get(city)!;
  };
}

/** Which skill runs each kind of business, as SQL: the owner's skill level is part of what a shop sells. */
const SKILL_OF_TYPE = `CASE b.type ${BUSINESSES.map((d) => `WHEN '${d.id}' THEN '${d.skill}'`).join(' ')} END`;

interface StockedRow {
  id: number; business_id: number; product: string; price: number; stock: number;
  uid: string; type: string; level: number; staff: number; size: string; city: string; place_id: string;
  /** Products on this business's shelf, and the owner's XP in the skill that runs it. */
  lines: number; xp: number;
}

/** One tick of customers: every stocked product rolls for its sales, then the orders are written in small batches. */
async function npcSales(env: Env, ctx: ExecutionContext, now: number) {
  const db = env.DB;
  const tick = Math.floor(now / NPC_SHOP.tickMs);
  // A random slice when there are more than we look at, so no shop is always left out. Owners without a wallet row
  // couldn't be paid (the units would leave the shelf and the order fail), so they aren't drawn.
  const { results } = await db.prepare(
    `SELECT bp.id, bp.business_id, bp.product, bp.price, bp.stock, b.uid, b.type, b.level, b.staff, b.size, b.city, b.place_id,
            (SELECT COUNT(*) FROM business_products x WHERE x.business_id = b.id AND x.stock > 0) AS lines,
            COALESCE((SELECT s.xp FROM skills s WHERE s.uid = b.uid AND s.skill = ${SKILL_OF_TYPE}), 0) AS xp
     FROM business_products bp JOIN businesses b ON b.id = bp.business_id JOIN wallets w ON w.uid = b.uid
     WHERE bp.stock > 0 ORDER BY RANDOM() LIMIT ?`,
  ).bind(NPC_SHOP.maxListings).all<StockedRow>();
  if (!results.length) return;
  const visitors = await visitorsAt(db, results, now);
  const laws = lawCache(db);

  const sales: (Sale & { businessId: number; product: string; unit: number; tax: number })[] = [];
  for (const r of results) {
    const def = Object.hasOwn(BUSINESS_BY_ID, r.type) ? BUSINESS_BY_ID[r.type as keyof typeof BUSINESS_BY_ID] : undefined;
    const product = MARKET_PRODUCT_BY_ID[r.product];
    if (!def || !product || product.business !== def.id || !(r.place_id in STALLS)) continue;
    const gross = hourlyOf(def, r.level, r.staff, skillLevel(r.xp), demandAt(r.place_id, visitors.get(spot(r.city, r.place_id)) ?? 0));
    const quantity = Math.min(r.stock, NPC_SHOP.maxUnits, poisson(npcExpected(gross, sizeOf(r.size), r.lines, product.price, r.price, npcHourFactor(def.id, now))));
    if (quantity < 1) continue;
    const total = r.price * quantity;
    // Customers walk in, so there is no delivery fee: only the shop's state sales tax, taken from the seller as for a player.
    const tax = scaledFee(total, (await laws(r.city)).salesTax);
    sales.push({
      orderId: `npc:${tick}:${r.id}`, listingId: r.id, seller: r.uid, quantity, total, stateTake: tax, city: r.city, payer: r.uid,
      businessId: r.business_id, product: product.id, unit: r.price, tax,
    });
    if (sales.length >= NPC_SHOP.maxSales) break;
  }

  for (let i = 0; i < sales.length; i += CHUNK) {
    const chunk = sales.slice(i, i + CHUNK);
    try {
      await db.batch([
        ...chunk.flatMap((s) => [
          // Written fresh or not at all: a tick run twice finds the order there, and saleStmts then does nothing.
          db.prepare(
            `INSERT OR IGNORE INTO marketplace_orders (id, buyer_uid, seller_uid, product_id, product, quantity, unit_price, total, fee, status, created_at, tax)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
          ).bind(s.orderId, NPC_SHOP.buyer, s.seller, s.listingId, s.product, s.quantity, s.unit, s.total, now, s.tax),
          ...saleStmts(db, s, now),
        ]),
        // As for a player's purchase: the shelf held stock up to this sale, so the hold on the stall runs from here.
        db.prepare(
          `UPDATE businesses SET shelf_at = ?1 WHERE id IN (
             SELECT bp.business_id FROM marketplace_orders o JOIN business_products bp ON bp.id = o.product_id
             WHERE o.id >= ?2 AND o.id < ?3 AND o.status = 'paid')`,
        ).bind(now, `npc:${tick}:`, `npc:${tick};`),
        // Whatever this tick couldn't sell (a player bought the last units first) is left failed, as a player's would be.
        db.prepare("UPDATE marketplace_orders SET status = 'failed' WHERE id >= ? AND id < ? AND status = 'pending'").bind(`npc:${tick}:`, `npc:${tick};`),
      ]);
    } catch (error) {
      console.error('npc sales batch failed', error);
    }
  }

  // One note an hour to each owner, not one a sale: what customers bought across all their shops in the last hour.
  if (new Date(now).getUTCMinutes() < 5) {
    const from = tick - Math.round(3_600_000 / NPC_SHOP.tickMs) + 1;
    const { results: owners } = await db.prepare(
      `SELECT seller_uid, SUM(quantity) AS units, SUM(total - tax) AS net FROM marketplace_orders
       WHERE id >= ? AND id < ? AND status = 'paid' GROUP BY seller_uid LIMIT 500`,
    ).bind(`npc:${from}:`, `npc:${tick};`).all<{ seller_uid: string; units: number; net: number }>();
    for (const o of owners) {
      sendPush(env, ctx, o.seller_uid, {
        title: '🛍️ Customers at your shop',
        body: `Customers bought ${o.units} item${o.units === 1 ? '' : 's'} in the last hour. ${naira(o.net)} is in your wallet after sales tax.`,
        tag: 'shop-customers',
        category: 'money',
      });
    }
  }
}

interface AutoCandidate {
  id: number; business_id: number; product: string; price: number; stock: number; auto_min: number; auto_to: number; auto_short: number;
  uid: string; city: string; place_id: string; size: string; name: string; shelf_at: number; created_at: number; stocked: number; balance: number;
}

/**
 * Auto-restock: every product at or below the level its owner set is refilled to their target, capped by the shelf,
 * at the price the owner's own restock would pay. A wallet that can't cover it is
 * skipped and the owner told once (auto_short), until a restock goes through or they change the setting.
 */
async function autoRestock(env: Env, ctx: ExecutionContext, now: number) {
  const db = env.DB;
  const tick = Math.floor(now / NPC_SHOP.tickMs);
  // Not yet told about a shortfall first, so shelves that can be paid for aren't crowded out by ones that can't.
  const found = await db.prepare(
    `SELECT p.id, p.business_id, p.product, p.price, p.stock, p.auto_min, p.auto_to, p.auto_short,
            businesses.uid, businesses.city, businesses.place_id, businesses.size, businesses.name, businesses.shelf_at, businesses.created_at,
            ${HAS_STOCK} AS stocked, w.balance
     FROM business_products p JOIN businesses ON businesses.id = p.business_id JOIN wallets w ON w.uid = businesses.uid
     WHERE p.auto_min IS NOT NULL AND p.stock <= p.auto_min AND p.stock < p.auto_to
     ORDER BY p.auto_short, RANDOM() LIMIT ?`,
  ).bind(NPC_SHOP.autoPerTick * 3).all<AutoCandidate>().catch(() => null);
  // No auto_min column: migrations/0099_npc_shoppers.sql hasn't been applied yet.
  if (!found?.results.length) return;
  const laws = lawCache(db);
  const spent = new Map<string, number>();
  const restocks: Restock[] = [];
  const short: AutoCandidate[] = [];

  for (const r of found.results) {
    if (restocks.length >= NPC_SHOP.autoPerTick) break;
    const product = MARKET_PRODUCT_BY_ID[r.product];
    // A stall that lapsed may have gone to someone else: the owner takes it back by restocking by hand.
    if (!product || !(r.place_id in STALLS) || !holdsStall(r, now)) continue;
    const shelf = shelfOf(sizeOf(r.size));
    // The whole gap in one go: BIZ.maxRestock bounds what one tap buys by hand, not what the shelf holds.
    const quantity = Math.min(r.auto_to, shelf) - r.stock;
    if (quantity < 1) continue;
    const origin = ORIGIN_OF[product.id];
    const price = restockPrice(product.wholesale, product.id, r.city, origin && origin !== r.city ? (await laws(origin)).exportLevy : 0);
    const cost = quantity * price.unit;
    const left = r.balance - (spent.get(r.uid) ?? 0);
    if (left < cost) {
      if (!r.auto_short) short.push(r);
      continue;
    }
    spent.set(r.uid, (spent.get(r.uid) ?? 0) + cost);
    restocks.push({
      requestId: `auto:${tick}:${r.id}`, uid: r.uid, businessId: r.business_id, listingId: r.id, product: product.id,
      quantity, price: r.price, cost, levy: quantity * price.levy, origin, shelf,
    });
  }

  for (let i = 0; i < restocks.length; i += CHUNK / 2) {
    const chunk = restocks.slice(i, i + CHUNK / 2);
    try {
      await db.batch(chunk.flatMap((r) => [
        ...restockStmts(db, r, now),
        // Paid for: the next shortfall is told again.
        db.prepare(
          "UPDATE business_products SET auto_short = 0 WHERE id = ?1 AND auto_short = 1 AND EXISTS (SELECT 1 FROM business_restock_requests WHERE id = ?2 AND status = 'paid')",
        ).bind(r.listingId, r.requestId),
      ]));
    } catch (error) {
      console.error('auto restock batch failed', error);
    }
  }

  if (!short.length) return;
  await db.prepare(`UPDATE business_products SET auto_short = 1 WHERE id IN (${short.map(() => '?').join(',')})`).bind(...short.map((r) => r.id)).run();
  // One note per owner, however many shelves ran short.
  const byOwner = new Map<string, AutoCandidate[]>();
  for (const r of short) byOwner.set(r.uid, [...(byOwner.get(r.uid) ?? []), r]);
  for (const [uid, rows] of byOwner) {
    const what = rows.map((r) => `${MARKET_PRODUCT_BY_ID[r.product]?.name ?? r.product} at ${r.name}`);
    sendPush(env, ctx, uid, {
      title: '📦 Auto-restock paused',
      body: `Not enough money in your wallet to restock ${what.slice(0, 3).join(', ')}${what.length > 3 ? ` and ${what.length - 3} more` : ''}. It carries on by itself once you can pay.`,
      tag: 'shop-restock',
      category: 'money',
    });
  }
}

/** The cron's shop round: customers buy first, so a shelf they empty can be refilled in the same tick. */
export async function runShops(env: Env, ctx: ExecutionContext, now: number) {
  try {
    await npcSales(env, ctx, now);
  } catch (error) {
    console.error('npc sales failed', error);
  }
  await autoRestock(env, ctx, now);
}
