// Natural disasters on the server (rules in src/game/disasters.ts, migration 0100). The cron rolls one now and then,
// warns the city, deals the damage once when the warning runs out, catches whoever is standing in it while it lasts,
// and has the state's emergency agency pay relief (or the governor take the blame).
//
// Everything is safe to run twice. A roll is keyed by its cron slot. Every hit is a disaster_hits row and every naira a
// ledger row with an id made from the disaster, the player and what happened, so a second tick (or two at once) finds
// the work done. Money moves in one D1 batch with the record of it, so it all happens or none of it does.

import { CIVIC_CITIES, CITY_HEAD, CITY_NAME, type CivicCity } from '../src/game/civic';
import {
  assetHit, DISASTER_KINDS, DISASTER_RULES, DISASTERS, estatesIn, headline, hospitalBillOf, houseBill, inZone, intensityOf, lampsIn, phaseOf,
  placesIn, potholesIn, rollDisaster, timesOf, warningText, placeDisaster, type Disaster, type DisasterKind, type DisasterSpot, type DisasterToll,
} from '../src/game/disasters';
import { CAR_BY_ID } from '../src/game/cars';
import { conditionOf, damage, repairCost, type CarCondition } from '../src/game/carCare';
import { MARKET_PRODUCT_BY_ID } from '../src/game/career';
import { hash } from '../src/game/live';
import { VDM_GOV_ICON } from '../src/game/news';
import { REGION_BY_ID } from '../src/game/property';
import { feedStmt, naira } from './feed';
import { gazette, official } from './gazette';
import { sendPush } from './push';
import { announceAll, notifyPlayer, onlinePlayers, whereIs } from './shards';
import { applyStmts, getBalance } from './wallet';

declare global {
  interface Env {
    /** '1' turns on POST /api/disasters/dev, which starts a disaster on demand (local development only). */
    DISASTER_DEV?: string;
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

interface Row {
  id: number; slot: number; city: string; kind: DisasterKind; x: number; z: number; r: number; place: string | null; area: string;
  created_at: number; strikes_at: number; ends_at: number; clear_at: number; struck_at: number | null; toll: string | null;
  relief: number | null; relief_paid: number;
}

function toDisaster(r: Row): Disaster {
  let toll: DisasterToll | null = null;
  try {
    toll = r.toll ? JSON.parse(r.toll) : null;
  } catch {
    toll = null;
  }
  return {
    id: r.id, city: r.city, kind: r.kind, x: r.x, z: r.z, r: r.r, place: r.place, area: r.area,
    at: r.created_at, strikesAt: r.strikes_at, endsAt: r.ends_at, clearAt: r.clear_at, toll,
  };
}

/** A string's stable number, to roll the same dice for the same player twice. */
const strHash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const roll = (...parts: number[]) => hash(parts.reduce((a, p) => Math.imul(a ^ p, 0x01000193) >>> 0, 0x811c9dc5)) / 4294967296;

const tell = (env: Env, ctx: ExecutionContext, uid: string, event: object) => ctx.waitUntil(notifyPlayer(env, uid, { t: 'disaster', ...event }));

/** Where it is, as one line: "the flood at Barnawa, Kaduna". */
const named = (d: Pick<Disaster, 'kind' | 'area' | 'city'>) => `the ${DISASTERS[d.kind].title.toLowerCase()} in ${d.area}, ${CITY_NAME[d.city as CivicCity] ?? d.city}`;

/* ---------- Starting one ---------- */

/** Every disaster that is still to be seen somewhere (warning, on, or leaving its traces). */
export async function liveDisasters(db: D1Database, now = Date.now()): Promise<Disaster[]> {
  const { results } = await db.prepare('SELECT * FROM disasters WHERE clear_at > ? ORDER BY created_at').bind(now).all<Row>();
  return results.map(toDisaster);
}

/** Put a disaster on the map: warn its city, and the owners of the houses in its way. Null if it could not start. */
async function begin(env: Env, ctx: ExecutionContext | undefined, spot: DisasterSpot, slot: number, now: number, times = timesOf(spot.kind, now)): Promise<Disaster | null> {
  const db = env.DB;
  const row = await db.prepare(
    `INSERT INTO disasters (slot, city, kind, x, z, r, place, area, created_at, strikes_at, ends_at, clear_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(slot) DO NOTHING RETURNING *`,
  ).bind(slot, spot.city, spot.kind, spot.x, spot.z, spot.r, spot.place ?? null, spot.area, times.at, times.strikesAt, times.endsAt, times.clearAt).first<Row>();
  if (!row) return null;
  const d = toDisaster(row);
  const minutes = Math.max(1, Math.round((d.strikesAt - now) / 60_000));
  const def = DISASTERS[d.kind];
  await feedStmt(db, null, 'disaster', '⚠️', `${def.icon} ${warningText(d, minutes)}`, d.city as CivicCity).run().catch(() => {});
  if (ctx) {
    ctx.waitUntil(announceAll(env, { t: 'disaster', what: 'news', id: d.id }));
    // Owners of the houses in its way hear it first, while there is still time to sandbag.
    const estates = estatesIn(d);
    if (estates.length) {
      const { results } = await db.prepare(`SELECT DISTINCT uid FROM estate_plots WHERE region IN (${estates.map(() => '?').join(',')}) AND stage > 0 LIMIT ?`)
        .bind(...estates, DISASTER_RULES.maxVictims).all<{ uid: string }>();
      for (const { uid } of results) {
        sendPush(env, ctx, uid, { title: `${def.icon} ${def.agency}: ${headline(d, 'warning')}`, body: `${warningText(d, minutes)} Your house is in its path.`.slice(0, 240), tag: `disaster-${d.id}`, category: 'news' });
      }
    }
  }
  return d;
}

/** The cron's roll for this slot: maybe a new disaster, if the city is quiet and the last one was a while ago. */
async function rollNew(env: Env, ctx: ExecutionContext, now: number) {
  const slot = Math.floor(now / DISASTER_RULES.tickMs);
  const spot = rollDisaster(slot, CIVIC_CITIES, now);
  if (!spot) return null;
  const busy = await env.DB.prepare('SELECT MAX(created_at) AS last, SUM(CASE WHEN city = ? AND ends_at > ? THEN 1 ELSE 0 END) AS here FROM disasters WHERE slot >= 0')
    .bind(spot.city, now).first<{ last: number | null; here: number | null }>();
  if ((busy?.here ?? 0) > 0 || now - (busy?.last ?? 0) < DISASTER_RULES.minGapMs) return null;
  return begin(env, ctx, spot, slot, now);
}

/* ---------- Damage, once ---------- */

/** The city's own losses: new potholes, dead street lights, and a state building knocked down a notch. One batch. */
function cityStmts(db: D1Database, d: Disaster, now: number, openSites: Set<number>, deadLamps: Set<number>) {
  const def = DISASTERS[d.kind];
  const done = (what: string) => `NOT EXISTS (SELECT 1 FROM disaster_hits WHERE disaster_id = ${d.id} AND uid = '' AND what = '${what}')`;
  const stmts: D1PreparedStatement[] = [];
  const holes = potholesIn(d).filter((s) => !openSites.has(s)).slice(0, def.potholes);
  for (const site of holes) stmts.push(db.prepare(`INSERT OR IGNORE INTO potholes (site, opened_at) SELECT ?, ? WHERE ${done('roads')}`).bind(site, now));
  const lamps = lampsIn(d).filter((s) => !deadLamps.has(s)).slice(0, def.lamps);
  for (const site of lamps) stmts.push(db.prepare(`INSERT OR IGNORE INTO broken_lamps (site, broken_at) SELECT ?, ? WHERE ${done('lamps')}`).bind(site, now));
  const hit = assetHit(d);
  if (hit && CIVIC_CITIES.includes(d.city as CivicCity)) {
    stmts.push(db.prepare(`UPDATE state_assets SET condition = MAX(0, condition - ?) WHERE city = ? AND asset = ? AND ${done('asset')}`).bind(hit.condition, d.city, hit.asset));
  }
  // The markers last, after the statements they guard.
  stmts.push(
    db.prepare("INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) VALUES (?, '', 'roads', ?, ?)").bind(d.id, holes.length, now),
    db.prepare("INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) VALUES (?, '', 'lamps', ?, ?)").bind(d.id, lamps.length, now),
    db.prepare("INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) VALUES (?, '', 'asset', ?, ?)").bind(d.id, hit?.condition ?? 0, now),
  );
  return stmts;
}

/**
 * Take `cost` from a player, but never more than `share` of what they hold, under a ledger id that can only be used once.
 * The statements after the debit are guarded by the same ledger row, so the whole thing happens at most once.
 */
function chargeStmts(db: D1Database, uid: string, clientId: string, kind: string, ref: string, cost: number, share: number, now: number) {
  const fresh = 'EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)';
  return {
    debit: [
      db.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
         SELECT ?1, ?2, ?3, ?4, -MIN(?5, CAST(MAX(balance, 0) * ?6 AS INTEGER)), ?7 FROM wallets WHERE uid = ?1
         ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(uid, clientId, kind, ref, cost, share, now),
      db.prepare(`UPDATE wallets SET balance = balance + (SELECT amount FROM ledger WHERE uid = ?1 AND client_id = ?2), updated_at = ?3 WHERE uid = ?1 AND ${fresh}`)
        .bind(uid, clientId, now),
    ],
    /** A disaster_hits row holding what was actually paid, written only the first time. */
    record: (disasterId: number, what: string) => db.prepare(
      `INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at)
       SELECT ?3, ?1, ?4, -amount, ?5 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0`,
    ).bind(uid, clientId, disasterId, what, now),
    guard: fresh,
    done: db.prepare('UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2 AND applied = 0').bind(uid, clientId),
  };
}

/** Houses in the estates it reached: one repair bill per owner (their houses added up, capped by what they hold). */
async function hitHouses(env: Env, ctx: ExecutionContext, d: Disaster, now: number): Promise<string[]> {
  const db = env.DB;
  const estates = estatesIn(d);
  if (!estates.length) return [];
  const def = DISASTERS[d.kind];
  const [{ results: plots }, { results: preps }] = await db.batch([
    db.prepare(`SELECT uid, pid, region, design, stage FROM estate_plots WHERE region IN (${estates.map(() => '?').join(',')}) AND stage > 0 ORDER BY updated_at DESC LIMIT ?`)
      .bind(...estates, DISASTER_RULES.maxVictims * 3),
    db.prepare("SELECT uid FROM disaster_hits WHERE disaster_id = ? AND what = 'prep'").bind(d.id),
  ]) as [D1Result<{ uid: string; pid: string; region: string; design: string | null; stage: number }>, D1Result<{ uid: string }>];
  const prepared = new Set(preps.map((p) => p.uid));
  const owners = new Map<string, { pid: string; region: string; bill: number }[]>();
  for (const p of plots) {
    const bill = houseBill(d.kind, p.region, p.design, p.stage, prepared.has(p.uid));
    if (bill <= 0) continue;
    const list = owners.get(p.uid) ?? [];
    if (!list.length && owners.size >= DISASTER_RULES.maxVictims) continue;
    list.push({ pid: p.pid, region: p.region, bill });
    owners.set(p.uid, list);
  }
  const hitUids: string[] = [];
  for (const [uid, houses] of owners) {
    const total = houses.reduce((a, h) => a + h.bill, 0);
    const c = chargeStmts(db, uid, `disaster:${d.id}:repairs`, 'disaster', `disaster:${d.id}:${d.kind}`, total, DISASTER_RULES.maxBillShare, now);
    try {
      const res = await db.batch([
        ...c.debit,
        c.record(d.id, 'bill'),
        ...houses.map((h) => db.prepare('INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) VALUES (?, ?, ?, ?, ?)').bind(d.id, uid, `house:${h.pid}`, h.bill, now)),
        c.done,
        db.prepare("SELECT cost FROM disaster_hits WHERE disaster_id = ? AND uid = ? AND what = 'bill'").bind(d.id, uid),
      ]);
      hitUids.push(uid);
      // Only the run that wrote the bill tells them about it.
      if (!res[2].meta.changes) continue;
      const paid = (res[res.length - 1].results[0] as { cost: number } | undefined)?.cost ?? 0;
      const where = REGION_BY_ID[houses[0].region]?.name ?? d.area;
      const what = d.kind === 'windstorm' ? 'tore the roof off' : d.kind === 'fire' || d.kind === 'bushfire' ? 'burnt part of' : 'flooded';
      const text = `${def.icon} The ${def.title.toLowerCase()} ${what} your house${houses.length > 1 ? `s (${houses.length})` : ''} in ${where}. Repairs: ${naira(total)}.`
        + (paid < total ? ` You paid ${naira(paid)}; the contractor will take no more than ${Math.round(DISASTER_RULES.maxBillShare * 100)}% of what you have.` : ` Paid from your wallet.`)
        + (prepared.has(uid) ? ' Your preparation halved the damage.' : '');
      tell(env, ctx, uid, { id: d.id, kind: d.kind, what: 'house', text, paid });
      sendPush(env, ctx, uid, { title: `${def.icon} ${headline(d, 'active')}`, body: text.slice(0, 240), tag: `disaster-${d.id}`, category: 'money' });
    } catch (error) {
      console.error('disaster house bill failed', error);
    }
  }
  return hitUids;
}

/** Shops at the places in the area lose a share of their shelf. The stall stays theirs: the hold restarts from now. */
async function hitShops(env: Env, ctx: ExecutionContext, d: Disaster, now: number) {
  const db = env.DB;
  const places = placesIn(d);
  if (!places.length) return;
  const def = DISASTERS[d.kind];
  const { results } = await db.prepare(
    `SELECT b.id, b.uid, b.name, bp.product, bp.stock FROM businesses b JOIN business_products bp ON bp.business_id = b.id
     WHERE b.city = ? AND b.place_id IN (${places.map(() => '?').join(',')}) AND bp.stock > 0 LIMIT 600`,
  ).bind(d.city, ...places).all<{ id: number; uid: string; name: string; product: string; stock: number }>();
  const shops = new Map<number, { uid: string; name: string; value: number }>();
  for (const r of results) {
    const shop = shops.get(r.id) ?? { uid: r.uid, name: r.name, value: 0 };
    shop.value += Math.floor(r.stock * def.stock) * (MARKET_PRODUCT_BY_ID[r.product]?.wholesale ?? 0);
    shops.set(r.id, shop);
  }
  for (const [id, shop] of [...shops].slice(0, DISASTER_RULES.maxVictims)) {
    const what = `biz:${id}`;
    const fresh = `NOT EXISTS (SELECT 1 FROM disaster_hits WHERE disaster_id = ${d.id} AND what = '${what}')`;
    try {
      const res = await db.batch([
        db.prepare(`UPDATE business_products SET stock = stock - CAST(stock * ? AS INTEGER) WHERE business_id = ? AND stock > 0 AND ${fresh}`).bind(def.stock, id),
        db.prepare(`UPDATE businesses SET shelf_at = MAX(shelf_at, ?) WHERE id = ? AND ${fresh}`).bind(now, id),
        db.prepare('INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) VALUES (?, ?, ?, ?, ?)').bind(d.id, shop.uid, what, shop.value, now),
      ]);
      if (!res[2].meta.changes) continue;
      const verb = d.kind === 'fire' || d.kind === 'bushfire' ? 'burnt' : d.kind === 'windstorm' ? 'blew away' : 'washed away';
      const text = `${def.icon} The ${def.title.toLowerCase()} ${verb} ${Math.round(def.stock * 100)}% of the stock at ${shop.name} (about ${naira(shop.value)} at wholesale). Restock to open again.`;
      tell(env, ctx, shop.uid, { id: d.id, kind: d.kind, what: 'shop', text });
      sendPush(env, ctx, shop.uid, { title: `${def.icon} ${headline(d, 'active')}`, body: text.slice(0, 240), tag: `disaster-${d.id}-shop`, category: 'money' });
    } catch (error) {
      console.error('disaster shop hit failed', error);
    }
  }
}

type CarSave = { ownedCars?: string[]; selectedCar?: string | null; carCondition?: Record<string, CarCondition> };

/**
 * A car parked in it takes a hit. Car condition lives in the save, so the server edits the save (for when they next
 * load it) and tells the game if it is open, which applies the same damage to what it holds and saves that.
 */
async function hitCar(env: Env, ctx: ExecutionContext, d: Disaster, uid: string, now: number) {
  const db = env.DB;
  const row = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>();
  if (!row) return false;
  let save: CarSave;
  try {
    save = JSON.parse(row.data);
  } catch {
    return false;
  }
  const carId = save.selectedCar ?? save.ownedCars?.[0];
  if (!carId || !CAR_BY_ID[carId] || !save.ownedCars?.includes(carId)) return false;
  const claimed = await db.prepare("INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) VALUES (?, ?, 'car', 0, ?) RETURNING uid").bind(d.id, uid, now).first();
  if (!claimed) return false;
  const def = DISASTERS[d.kind];
  let cond = conditionOf(save.carCondition, carId);
  for (const { part, amount } of def.car) cond = damage(cond, part, amount);
  const bill = def.car.reduce((a, { part }) => a + repairCost(carId, cond, part), 0);
  save.carCondition = { ...save.carCondition, [carId]: cond };
  // saved_at stays as it is, so the next upload from an open game is not refused as an old copy.
  await db.batch([
    db.prepare('UPDATE saves SET data = ? WHERE uid = ? AND data = ?').bind(JSON.stringify(save), uid, row.data),
    db.prepare("UPDATE disaster_hits SET cost = ? WHERE disaster_id = ? AND uid = ? AND what = 'car'").bind(bill, d.id, uid),
  ]);
  const car = CAR_BY_ID[carId].name;
  const how = d.kind === 'flood' || d.kind === 'flashflood' ? 'Water got into the engine' : d.kind === 'windstorm' ? 'A roofing sheet landed on it' : 'The heat cooked it';
  const text = `${def.icon} Your ${car} was caught in ${named(d)}. ${how}: the mechanic wants about ${naira(bill)}.`;
  tell(env, ctx, uid, { id: d.id, kind: d.kind, what: 'car', text, car: { id: carId, parts: def.car } });
  return true;
}

/** Whoever is standing in it may get hurt: hospital, a bill to the federal treasury (as every hospital bill), and a while to heal. */
async function hurt(env: Env, ctx: ExecutionContext, d: Disaster, uid: string, now: number) {
  const db = env.DB;
  const clientId = `disaster:${d.id}:hospital`;
  const due = hospitalBillOf(await getBalance(db, uid).catch(() => 0));
  const until = now + DISASTER_RULES.hurtMinutes * 60_000;
  const c = chargeStmts(db, uid, clientId, 'hospital', `disaster:${d.id}`, due, 1, now);
  const res = await db.batch([
    ...c.debit,
    db.prepare(`UPDATE civic_policies SET treasury = treasury - (SELECT amount FROM ledger WHERE uid = ?1 AND client_id = ?2) WHERE id = 1 AND ${c.guard}`).bind(uid, clientId),
    db.prepare(`UPDATE players SET injured_until = MAX(COALESCE(injured_until, 0), ?3) WHERE uid = ?1 AND ${c.guard}`).bind(uid, clientId, until),
    c.record(d.id, 'hurt'),
    c.done,
    db.prepare("SELECT cost FROM disaster_hits WHERE disaster_id = ? AND uid = ? AND what = 'hurt'").bind(d.id, uid),
  ]);
  if (!res[4].meta.changes) return false;
  const paid = (res[res.length - 1].results[0] as { cost: number } | undefined)?.cost ?? 0;
  const def = DISASTERS[d.kind];
  const how = d.kind === 'flood' || d.kind === 'flashflood' ? 'The water swept you off your feet' : d.kind === 'windstorm' ? 'Flying zinc caught you' : 'The smoke and heat got to you';
  const bill = paid ? `a ${naira(paid)} bill` : 'they treated you for free';
  const text = `${def.icon} ${how} in ${named(d)}. You woke up in hospital (${bill}) and you are hurt for ${DISASTER_RULES.hurtMinutes} minutes.`;
  tell(env, ctx, uid, { id: d.id, kind: d.kind, what: 'hurt', text, until, paid });
  sendPush(env, ctx, uid, { title: `${def.icon} You were hurt`, body: text.slice(0, 240), tag: `disaster-${d.id}-hurt`, category: 'money' });
  return true;
}

/** What it did, counted from its records (so a strike that was finished by a second tick still adds up). */
async function tollOf(db: D1Database, d: Disaster, relief = 0): Promise<DisasterToll> {
  const r = await db.prepare(
    `SELECT
       SUM(CASE WHEN what LIKE 'house:%' THEN 1 ELSE 0 END) AS houses,
       SUM(CASE WHEN what LIKE 'biz:%' THEN 1 ELSE 0 END) AS shops,
       SUM(CASE WHEN what = 'car' THEN 1 ELSE 0 END) AS cars,
       SUM(CASE WHEN what = 'hurt' THEN 1 ELSE 0 END) AS hurt,
       SUM(CASE WHEN uid = '' AND what = 'roads' THEN cost ELSE 0 END) AS potholes,
       SUM(CASE WHEN uid = '' AND what = 'lamps' THEN cost ELSE 0 END) AS lamps,
       SUM(CASE WHEN what = 'bill' THEN cost ELSE 0 END) AS repairs
     FROM disaster_hits WHERE disaster_id = ?`,
  ).bind(d.id).first<Record<string, number | null>>();
  const n = (k: string) => r?.[k] ?? 0;
  return { houses: n('houses'), shops: n('shops'), cars: n('cars'), hurt: n('hurt'), potholes: n('potholes'), lamps: n('lamps'), repairs: n('repairs'), relief };
}

/** The government's response: the state's emergency agency pays part of the victims' repairs back, or the governor gets dragged. */
async function relief(env: Env, ctx: ExecutionContext, d: Disaster, now: number): Promise<number> {
  const db = env.DB;
  const city = d.city as CivicCity;
  if (!CIVIC_CITIES.includes(city)) return 0;
  const { results: victims } = await db.prepare("SELECT uid, cost FROM disaster_hits WHERE disaster_id = ? AND what = 'bill' AND cost > 0 ORDER BY cost DESC").bind(d.id).all<{ uid: string; cost: number }>();
  const total = victims.reduce((a, v) => a + v.cost, 0);
  if (!total) return 0;
  const office = CITY_HEAD[city];
  const [state, policy] = await Promise.all([
    db.prepare('SELECT balance FROM state_treasuries WHERE city = ?').bind(city).first<{ balance: number }>(),
    db.prepare(`SELECT ${office}_uid AS head FROM civic_policies WHERE id = 1`).first<{ head: string | null }>(),
  ]);
  const head = policy?.head ? await db.prepare('SELECT username FROM players WHERE uid = ?').bind(policy.head).first<{ username: string | null }>() : null;
  const who = head ? official(office, head.username) : `the ${CITY_NAME[city]} government`;
  const pot = Math.floor(Math.min(total * DISASTER_RULES.reliefShare, (state?.balance ?? 0) * DISASTER_RULES.reliefTreasuryShare) / 1000) * 1000;
  if (pot < DISASTER_RULES.reliefMin) {
    const claimed = await db.prepare('UPDATE disasters SET relief = 0 WHERE id = ? AND relief IS NULL RETURNING id').bind(d.id).first();
    if (!claimed) return 0;
    const rants = [
      `${CITY_NAME[city]} don suffer ${named(d)}. ${victims.length} families dey count loss, ${naira(total)} for repairs. ${who}, where SEMA dey? Not one mattress, not one bag of rice. Una dey wait make water dry before una come snap picture? 🤬`,
      (state?.balance ?? 0) > 0
        ? `After ${named(d)}, people dey sleep for church. ${who} never show face. Treasury dey there but relief no dey. Na only campaign season una dey find road to ${d.area}? 😤`
        : `After ${named(d)}, the ${CITY_NAME[city]} treasury is empty. Empty! ${who}, who chop the money wey for be emergency fund? Victims dey on their own again. 🤬`,
    ];
    await db.prepare(
      `INSERT INTO feed (uid, kind, icon, text, created_at, city) VALUES (?, 'vdm', ?, ?, ?, ?)`,
    ).bind(policy?.head ?? null, VDM_GOV_ICON, rants[hash(d.id) % rants.length].slice(0, 280), now, city).run().catch(() => {});
    return 0;
  }
  // Each victim's share of the pot, by what they paid; the remainder goes to the biggest loss so the books balance.
  const shares = victims.map((v) => Math.floor((pot * v.cost) / total));
  shares[0] += pot - shares.reduce((a, s) => a + s, 0);
  const paid = `EXISTS (SELECT 1 FROM disasters WHERE id = ${d.id} AND relief_paid = 1)`;
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE disasters SET relief = ? WHERE id = ? AND relief IS NULL').bind(pot, d.id),
    db.prepare('UPDATE state_treasuries SET balance = balance - ?1 WHERE city = ?2 AND balance >= ?1 AND changes() = 1').bind(pot, city),
    db.prepare('UPDATE disasters SET relief_paid = 1 WHERE id = ? AND changes() = 1').bind(d.id),
  ];
  victims.forEach((v, i) => {
    const clientId = `disaster:${d.id}:relief`;
    const fresh = 'EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)';
    stmts.push(
      db.prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at) SELECT ?1, ?2, 'relief', ?3, ?4, ?5 WHERE ${paid} ON CONFLICT(uid, client_id) DO NOTHING`)
        .bind(v.uid, clientId, `disaster:${d.id}`, shares[i], now),
      db.prepare(`UPDATE wallets SET balance = balance + ?3, updated_at = ?4 WHERE uid = ?1 AND ${fresh}`).bind(v.uid, clientId, shares[i], now),
      db.prepare(`INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) SELECT ?3, ?1, 'relief', ?4, ?5 WHERE ${fresh}`).bind(v.uid, clientId, d.id, shares[i], now),
      db.prepare('UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2 AND applied = 0').bind(v.uid, clientId),
    );
  });
  await db.batch(stmts);
  const done = await db.prepare('SELECT relief, relief_paid FROM disasters WHERE id = ?').bind(d.id).first<{ relief: number | null; relief_paid: number }>();
  if (!done?.relief_paid) return 0;
  const def = DISASTERS[d.kind];
  await db.prepare('INSERT INTO feed (uid, kind, icon, text, created_at, city) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(policy?.head ?? null, 'politics', '🏛️', `${who} has sent SEMA with ${naira(pot)} in relief for the ${victims.length} households hit by ${named(d)}. Each family gets back part of their repair bill.`.slice(0, 280), now, city).run().catch(() => {});
  await gazette(env, ctx, [{ uid: policy?.head ?? null, office, kind: 'palliative', icon: def.icon, text: `${who} paid ${naira(pot)} in disaster relief to ${victims.length} households after ${named(d)}.` }], false);
  victims.forEach((v, i) => tell(env, ctx, v.uid, { id: d.id, kind: d.kind, what: 'relief', text: `🏛️ SEMA relief: ${naira(shares[i])} towards your repairs after ${named(d)}.`, paid: shares[i] }));
  return pot;
}

/** The moment it hits: everything in its way is damaged, once. Then the news, and the government's response. */
async function strike(env: Env, ctx: ExecutionContext, row: Row, now: number) {
  const db = env.DB;
  const d = toDisaster(row);
  // A tick that comes after it is all over (the cron was down) deals no damage: nobody saw it happen.
  if (now < d.clearAt) {
    const [open, dead] = await db.batch([db.prepare('SELECT site FROM potholes'), db.prepare('SELECT site FROM broken_lamps')]);
    await db.batch(cityStmts(db, d, now, new Set((open.results as { site: number }[]).map((r) => r.site)), new Set((dead.results as { site: number }[]).map((r) => r.site))));
    const owners = await hitHouses(env, ctx, d, now);
    await hitShops(env, ctx, d, now);
    // Cars parked at the houses it reached. A flash flood is in the street, not the compound.
    if (d.kind !== 'flashflood') for (const uid of owners.slice(0, DISASTER_RULES.maxVictims)) await hitCar(env, ctx, d, uid, now).catch(() => false);
  }
  const claimed = await db.prepare('UPDATE disasters SET struck_at = ? WHERE id = ? AND struck_at IS NULL RETURNING id').bind(now, d.id).first();
  if (!claimed) return;
  const pot = now < d.clearAt ? await relief(env, ctx, d, now).catch((e) => (console.error('disaster relief failed', e), 0)) : 0;
  const toll = await tollOf(db, d, pot);
  await db.prepare('UPDATE disasters SET toll = ? WHERE id = ?').bind(JSON.stringify(toll), d.id).run();
  if (now >= d.clearAt) return;
  const def = DISASTERS[d.kind];
  const bits = [
    toll.houses && `${toll.houses} house${toll.houses === 1 ? '' : 's'} damaged`,
    toll.shops && `${toll.shops} shop${toll.shops === 1 ? '' : 's'} lost stock`,
    toll.potholes && `${toll.potholes} new pothole${toll.potholes === 1 ? '' : 's'}`,
    toll.lamps && `${toll.lamps} street light${toll.lamps === 1 ? '' : 's'} down`,
  ].filter(Boolean);
  const advice = d.kind === 'fire' || d.kind === 'bushfire' ? 'Keep away and let the fire service work.' : 'Stay off the street until it passes.';
  await feedStmt(db, null, 'disaster', def.icon, `${headline(d, 'active')}, ${CITY_NAME[d.city as CivicCity] ?? d.city}. ${bits.length ? `${bits.join(', ')}. ` : ''}${advice}`, d.city as CivicCity).run().catch(() => {});
  ctx.waitUntil(announceAll(env, { t: 'disaster', what: 'news', id: d.id }));
}

/** While it is on, anyone standing in it (on the street, in a building in it, or in an estate it reached) may get hurt, and their car with them. */
async function catchPeople(env: Env, ctx: ExecutionContext, row: Row, now: number) {
  const d = toDisaster(row);
  const def = DISASTERS[d.kind];
  const level = intensityOf(d, now);
  if (level <= 0) return;
  const places = new Set(placesIn(d));
  const estates = new Set(estatesIn(d));
  const slot = Math.floor(now / DISASTER_RULES.tickMs);
  const people = (await onlinePlayers(env)).filter((p) => p.area && !p.uid.startsWith('npc:')).slice(0, DISASTER_RULES.maxOnline * 4);
  let looked = 0;
  let changed = false;
  for (const p of people) {
    const area = (p.area ?? '').split('#')[0];
    const [kind, a, b] = area.split(':');
    let caught = false;
    let street = false;
    if (kind === 'city' && a === d.city) {
      if (++looked > DISASTER_RULES.maxOnline) continue;
      const at = await whereIs(env, p.uid).catch(() => null);
      caught = !!at && at.area.split('#')[0] === area && inZone(d, at.x, at.z);
      street = true;
    } else if (kind === 'place' && a === d.city) {
      caught = places.has(b);
    } else if (kind === 'estate') {
      caught = estates.has(a);
    }
    if (!caught) continue;
    // Every tick in it is another chance to get hurt, and the same chance for the same tick however often it runs.
    if (roll(d.id, strHash(p.uid), slot) < def.hurt * level && await hurt(env, ctx, d, p.uid, now).catch((e) => (console.error('disaster hurt failed', e), false))) changed = true;
    // A car out on the street or at a building in it is parked in it.
    if ((street || kind === 'place') && await hitCar(env, ctx, d, p.uid, now).catch(() => false)) changed = true;
  }
  // The count of people hurt and cars hit keeps going up while it lasts.
  if (changed) {
    const fresh = await env.DB.prepare('SELECT struck_at, relief, relief_paid FROM disasters WHERE id = ?').bind(d.id).first<Pick<Row, 'struck_at' | 'relief' | 'relief_paid'>>();
    if (fresh?.struck_at) await env.DB.prepare('UPDATE disasters SET toll = ? WHERE id = ?').bind(JSON.stringify(await tollOf(env.DB, d, fresh.relief_paid ? fresh.relief ?? 0 : 0)), d.id).run();
  }
}

/** The cron's job: maybe start one, deal the damage of any that just struck, and catch whoever is standing in one that is on. */
export async function runDisasters(env: Env, ctx: ExecutionContext, now = Date.now()) {
  await rollNew(env, ctx, now);
  const { results } = await env.DB.prepare('SELECT * FROM disasters WHERE clear_at > ? OR struck_at IS NULL').bind(now - 3600_000).all<Row>();
  for (const row of results) {
    if (row.struck_at === null && now >= row.strikes_at) await strike(env, ctx, row, now);
    if (now >= row.strikes_at && now < row.ends_at) await catchPeople(env, ctx, row, now);
  }
}

/* ---------- API ---------- */

/** GET /api/disasters (public, edge-cached): every disaster still to be seen, in every city. */
export async function readDisasters(db: D1Database): Promise<Response> {
  const now = Date.now();
  return json({ now, list: await liveDisasters(db, now) });
}

/** The signed-in routes: what hit me, what threatens my houses, sandbagging, and (locally) starting one on demand. */
export async function handleDisasters(req: Request, env: Env, ctx: ExecutionContext, uid: string, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/disasters/')) return null;
  const db = env.DB;
  const now = Date.now();

  if (path === '/api/disasters/mine' && req.method === 'GET') {
    const list = await liveDisasters(db, now);
    if (!list.length) return json({ hits: [], threatened: [], prepared: [] });
    const ids = list.map((d) => d.id);
    const [{ results: hits }, { results: mine }] = await db.batch([
      db.prepare(`SELECT disaster_id AS id, what, cost FROM disaster_hits WHERE uid = ? AND disaster_id IN (${ids.map(() => '?').join(',')})`).bind(uid, ...ids),
      db.prepare('SELECT DISTINCT region FROM estate_plots WHERE uid = ? AND stage > 0').bind(uid),
    ]) as [D1Result<{ id: number; what: string; cost: number }>, D1Result<{ region: string }>];
    const regions = new Set(mine.map((r) => r.region));
    const threatened = list.filter((d) => phaseOf(d, now) === 'warning' && estatesIn(d).some((e) => regions.has(e))).map((d) => d.id);
    return json({ hits, threatened, prepared: hits.filter((h) => h.what === 'prep').map((h) => h.id) });
  }

  if (path === '/api/disasters/prepare' && req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as { id?: number } | null;
    const row = Number.isInteger(body?.id) ? await db.prepare('SELECT * FROM disasters WHERE id = ?').bind(body!.id).first<Row>() : null;
    if (!row) return err(404, 'No such disaster');
    const d = toDisaster(row);
    if (phaseOf(d, now) !== 'warning') return err(409, 'Too late to prepare: it is already here');
    const estates = estatesIn(d);
    const owns = estates.length && await db.prepare(`SELECT 1 AS x FROM estate_plots WHERE uid = ? AND stage > 0 AND region IN (${estates.map(() => '?').join(',')}) LIMIT 1`).bind(uid, ...estates).first();
    if (!owns) return err(403, 'None of your houses is in its path');
    const cost = DISASTER_RULES.prepCost;
    if ((await getBalance(db, uid)) < cost) return err(402, `You need ${naira(cost)} for that`);
    const clientId = `disaster:${d.id}:prep`;
    await db.batch([
      ...applyStmts(db, uid, clientId, 'spend', `disaster:${d.id}:prep`, -cost),
      db.prepare(
        `INSERT OR IGNORE INTO disaster_hits (disaster_id, uid, what, cost, created_at) SELECT ?1, ?2, 'prep', ?3, ?4
         WHERE EXISTS (SELECT 1 FROM ledger WHERE uid = ?2 AND client_id = ?5)`,
      ).bind(d.id, uid, cost, now, clientId),
    ]);
    return json({ ok: true, balance: await getBalance(db, uid) });
  }

  // Local development only: start one now, with a short warning, and run the cron's disaster job on demand.
  if (path === '/api/disasters/dev' && req.method === 'POST') {
    if (env.DISASTER_DEV !== '1') return err(404, 'Not found');
    const body = (await req.json().catch(() => null)) as { kind?: DisasterKind; city?: string; warnSec?: number; activeSec?: number; afterSec?: number; seed?: number } | null;
    const kind = DISASTER_KINDS.includes(body?.kind as DisasterKind) ? body!.kind! : 'flood';
    const city = CIVIC_CITIES.includes(body?.city as CivicCity) ? body!.city! : 'kaduna';
    const def = DISASTERS[kind];
    const strikesAt = now + (body?.warnSec ?? 20) * 1000;
    const endsAt = strikesAt + (body?.activeSec ?? def.activeMs / 1000) * 1000;
    const times = { at: now, strikesAt, endsAt, clearAt: endsAt + (body?.afterSec ?? def.afterMs / 1000) * 1000 };
    const d = await begin(env, ctx, placeDisaster(kind, city, body?.seed ?? now), -now, now, times);
    return json({ disaster: d });
  }
  if (path === '/api/disasters/dev/tick' && req.method === 'POST') {
    if (env.DISASTER_DEV !== '1') return err(404, 'Not found');
    await runDisasters(env, ctx, now);
    return json({ ok: true, list: await liveDisasters(db, now) });
  }

  return err(404, 'Not found');
}
