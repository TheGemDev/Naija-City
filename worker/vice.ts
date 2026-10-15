// Vice, server side: the Plug app (drugs), police sweeps and drug-driving stops, protection rackets,
// murder/kidnap contracts, dirty work, and jail hustles. Rules and numbers live in src/game/vice.ts.
//
// Money never moves on the client's say-so here: every payment goes through the wallet ledger.

import { conditionOf, homeCity, lawsOf } from './state';
import { hospitalFactor } from '../src/game/treasury';
import type { FirebaseUser } from './auth';
import { MAX_RANSOM_PLEDGE } from './limits';
import { applyStmts, ensureWallet, getBalance } from './wallet';
import { isOfficer, loadLaws, loadProtection, rand, transfer, usernames } from './crime';
import { crimeScore, jail } from './fun';
import { handle, naira, postFeed } from './feed';
import { searchPhone } from './phoneSearch';
import { crimeTier, tierIndex } from '../src/game/underworld';
import { CAR_BY_ID } from '../src/game/cars';
import { normalizeOrigin } from '../src/game/origins';
import { OFFICES } from '../src/game/civic';
import { ownedCounts, } from './progress';
import { activeEvent, activeRoadEvent } from '../src/game/live';
import {
  AIRPORT, AMBUSH, CELL, CONTRACT, DUI, GOODS, GOOD_BY_ID, OP_BY_ID, PLUG, RACKET, SWEEP, isGood, isOp, plugPrice, streetPrice, marketMult,
  type GoodId, type OpDef,
} from '../src/game/vice';
import { notifyPlayer, whereIs } from './shards';

/** A hospital bill, dearer when the state the patient lives in has let its hospital run down. */
const hospitalPrice = async (db: D1Database, uid: string, bill: number) => {
  const city = await homeCity(db, uid);
  // Dearer when the hospital has run down, and by whatever fee the state sets.
  return Math.round(bill * hospitalFactor(await conditionOf(db, city, 'hospital')) * ((await lawsOf(db, city)).hospitalFee / 100));
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const body = async <T>(req: Request) => (await req.json().catch(() => null)) as T | null;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const int = (n: unknown, lo: number, hi: number) => (typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi ? n : null);

function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}
const tell = (env: Env, ctx: ExecutionContext, uid: string, kind: string, text: string, extra: object = {}) =>
  notify(env, ctx, uid, { t: 'vice', kind, text, ...extra });

/** Credit money out of thin air (payouts, escrow releases). Run once per (uid, id). */
async function credit(db: D1Database, uid: string, id: string, kind: string, ref: string, amount: number) {
  if (amount <= 0) return;
  await db.batch([ensureWallet(db, uid), ...applyStmts(db, uid, id, kind, ref, amount)]);
}

const patrolFactor = (patrols: number) => 0.5 + patrols / 100;

/* ---------- State helpers ---------- */

interface PlayerRow { high_until: number | null; held_until: number | null; jailed_until: number | null; dui_at: number | null; dui_pending: number | null; sweep_at: number | null; username: string | null; ambush_at: number | null; ambush_hit_at: number | null }

const playerRow = (db: D1Database, uid: string) =>
  db.prepare('SELECT high_until, held_until, jailed_until, dui_at, dui_pending, sweep_at, username, ambush_at, ambush_hit_at FROM players WHERE uid = ?').bind(uid).first<PlayerRow>();

async function uidOfName(db: D1Database, name: unknown) {
  if (typeof name !== 'string') return null;
  const clean = name.trim().replace(/^@/, '').toLowerCase();
  if (!clean) return null;
  const r = await db.prepare('SELECT uid, username FROM players WHERE username = ?').bind(clean).first<{ uid: string; username: string }>();
  return r ?? null;
}

async function stashOf(db: D1Database, uid: string): Promise<Record<GoodId, number>> {
  const { results } = await db.prepare('SELECT good, qty FROM stash WHERE uid = ? AND qty > 0').bind(uid).all<{ good: string; qty: number }>();
  const out = { cana: 0, colorado: 0, codeine: 0, tramadol: 0 } as Record<GoodId, number>;
  for (const r of results) if (isGood(r.good)) out[r.good] = r.qty;
  return out;
}
const stashTotal = (s: Record<GoodId, number>) => Object.values(s).reduce((a, b) => a + b, 0);
const stashValue = (s: Record<GoodId, number>, now: number) => GOODS.reduce((a, g) => a + s[g.id] * plugPrice(g.id, now), 0);

const addStash = (db: D1Database, uid: string, good: GoodId, qty: number) =>
  db.prepare('INSERT INTO stash (uid, good, qty) VALUES (?1, ?2, ?3) ON CONFLICT(uid, good) DO UPDATE SET qty = qty + ?3').bind(uid, good, qty);

/** Take qty out of a stash, only if they have it. */
async function takeStash(db: D1Database, uid: string, good: GoodId, qty: number) {
  const r = await db.prepare('UPDATE stash SET qty = qty - ?3 WHERE uid = ?1 AND good = ?2 AND qty >= ?3 RETURNING qty').bind(uid, good, qty).first();
  return !!r;
}

/** Can this player take on qty more of a good? */
async function roomFor(db: D1Database, uid: string, good: GoodId, qty: number) {
  const s = await stashOf(db, uid);
  return s[good] + qty <= PLUG.stashCap && stashTotal(s) + qty <= PLUG.stashTotalCap;
}

const bumpVice = (db: D1Database, uid: string, n = 1) =>
  db.prepare('INSERT INTO underworld (uid, vice) VALUES (?1, ?2) ON CONFLICT(uid) DO UPDATE SET vice = vice + ?2').bind(uid, n);

/** Free to act: not in a cell, not kidnapped. */
async function busy(db: D1Database, uid: string): Promise<string | null> {
  const p = await playerRow(db, uid);
  const now = Date.now();
  if (p?.jailed_until && p.jailed_until > now) return 'You are in a cell';
  if (p?.held_until && p.held_until > now) return 'You are being held. Sort out the ransom first';
  return null;
}

/**
 * Police take someone in: a fine (as far as their wallet allows), a cell for `minutes` on `charge`, and a
 * trawl through their phone, where the vice apps do the damage (src/game/phoneSearch.ts).
 */
async function bust(env: Env, ctx: ExecutionContext, uid: string, agency: 'police' | 'efcc', minutes: number, fineBase: number, charge: string, reason: string, feed?: string) {
  const db = env.DB;
  const now = Date.now();
  const mins = Math.max(1, Math.round(minutes));
  const fine = fineBase > 0 ? await transfer(db, uid, null, fineBase, 'fine', '', `vice-fine:${uid}:${now}`) : 0;
  await jail(db, uid, mins, charge);
  const search = await searchPhone(env, uid, agency, mins);
  if (feed) await postFeed(db, uid, 'arrest', agency === 'efcc' ? '🕵🏾' : '🚔', feed);
  notify(env, ctx, uid, { t: 'fun', kind: 'jailed', until: search.until ?? now + mins * 60_000, reason });
  return { fine, until: search.until };
}

/* ---------- Plug: market, stash, use ---------- */

async function plugState(env: Env, uid: string) {
  const db = env.DB;
  const now = Date.now();
  const [p, stash, listings, mine, inc, out] = await Promise.all([
    playerRow(db, uid),
    stashOf(db, uid),
    db.prepare(`SELECT * FROM vice_listings WHERE status = 'listed' ORDER BY listed_at DESC LIMIT 40`).all<ListingRow>(),
    db.prepare(`SELECT * FROM vice_listings WHERE seller_uid = ? AND status = 'listed' ORDER BY listed_at DESC`).bind(uid).all<ListingRow>(),
    db.prepare(`SELECT * FROM vice_offers WHERE to_uid = ? AND status = 'open' ORDER BY created_at DESC LIMIT 20`).bind(uid).all<OfferRow>(),
    db.prepare(`SELECT * FROM vice_offers WHERE from_uid = ? AND status = 'open' ORDER BY created_at DESC LIMIT 20`).bind(uid).all<OfferRow>(),
  ]);
  const names = await usernames(db, [...listings.results.map((l) => l.seller_uid), ...inc.results.map((o) => o.from_uid), ...out.results.map((o) => o.to_uid)]);
  return {
    now,
    prices: Object.fromEntries(GOODS.map((g) => [g.id, { plug: plugPrice(g.id, now), street: streetPrice(g.id, now), mult: marketMult(g.id, now) }])),
    stash,
    highUntil: p?.high_until && p.high_until > now ? p.high_until : null,
    heldUntil: p?.held_until && p.held_until > now ? p.held_until : null,
    jailedUntil: p?.jailed_until && p.jailed_until > now ? p.jailed_until : null,
    listings: listings.results.map((l) => ({ id: l.id, good: l.good, qty: l.qty, price: l.price, seller: names.get(l.seller_uid) ?? 'someone', mine: l.seller_uid === uid, at: l.listed_at })),
    mine: mine.results.map((l) => ({ id: l.id, good: l.good, qty: l.qty, price: l.price, seller: names.get(l.seller_uid) ?? 'me', mine: true, at: l.listed_at })),
    offersIn: inc.results.map((o) => ({ id: o.id, good: o.good, qty: o.qty, price: o.price, other: names.get(o.from_uid) ?? 'someone', at: o.created_at })),
    offersOut: out.results.map((o) => ({ id: o.id, good: o.good, qty: o.qty, price: o.price, other: names.get(o.to_uid) ?? 'someone', at: o.created_at })),
  };
}

interface ListingRow { id: number; seller_uid: string; good: string; qty: number; price: number; status: string; buyer_uid: string | null; listed_at: number }
interface OfferRow { id: number; from_uid: string; to_uid: string; good: string; qty: number; price: number; status: string; created_at: number }

/** Roll for a police sweep on someone with the Plug app or a stash. Rate-limited per player. */
async function sweep(env: Env, ctx: ExecutionContext, uid: string) {
  const db = env.DB;
  const now = Date.now();
  const p = await playerRow(db, uid);
  if (!p || (p.jailed_until && p.jailed_until > now)) return { caught: false };
  if (p.sweep_at && now - p.sweep_at < SWEEP.minGapMs) return { caught: false };
  const [save, stash, laws] = await Promise.all([
    db.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>(),
    stashOf(db, uid),
    loadLaws(db),
  ]);
  let apps: string[] = [];
  try {
    const parsed = save ? (JSON.parse(save.data) as { apps?: unknown }) : null;
    apps = Array.isArray(parsed?.apps) ? (parsed!.apps as unknown[]).filter((a): a is string => typeof a === 'string') : [];
  } catch { /* unreadable save */ }
  const hasApp = apps.includes('plug');
  const qty = stashTotal(stash);
  if (!hasApp && !qty) return { caught: false };
  await db.prepare('UPDATE players SET sweep_at = ? WHERE uid = ?').bind(now, uid).run();

  const high = !!(p.high_until && p.high_until > now);
  const chance = clamp((hasApp ? SWEEP.appChance : 0) + qty * SWEEP.perUnit, 0, SWEEP.maxChance) * patrolFactor(laws.patrols) * (high ? SWEEP.highFactor : 1) * (activeRoadEvent(now) === 'crackdown' ? 1.5 : 1);
  if (rand() >= Math.min(SWEEP.maxChance, chance)) return { caught: false };

  const who = (await usernames(db, [uid])).get(uid);
  if (qty) {
    const value = stashValue(stash, now);
    const mins = clamp(laws.jailMinutes * (1 + qty / 10), 1, 30);
    await db.prepare('DELETE FROM stash WHERE uid = ?').bind(uid).run();
    await bust(env, ctx, uid, 'police', mins, SWEEP.baseFine + value * SWEEP.finePct, `Possession · ${qty} wrap${qty === 1 ? '' : 's'} found on you`, `Police found ${qty} wrap${qty === 1 ? '' : 's'} on you`,
      `${handle(who)} was picked up with ${qty} wrap${qty === 1 ? '' : 's'} of the good stuff. Police say it was “for personal use”. 🌿🚔`);
    return { caught: true, kind: 'stash', qty };
  }
  await bust(env, ctx, uid, 'police', Math.max(1, laws.jailMinutes * 0.5), 0, 'Drug dealing · the Plug app was on your phone', 'Police checked your phone and found the Plug app',
    `${handle(who)} was stopped on the road and police scrolled through their phone. The Plug app did not help. 📱🚔`);
  return { caught: true, kind: 'app' };
}

/** Boarding a ticketed flight: NDLEA searches every passenger, so a stash is always found. */
async function flightSearch(env: Env, ctx: ExecutionContext, uid: string) {
  const db = env.DB;
  const now = Date.now();
  const p = await playerRow(db, uid);
  if (!p || (p.jailed_until && p.jailed_until > now)) return { caught: false };
  const stash = await stashOf(db, uid);
  const qty = stashTotal(stash);
  if (!qty) return { caught: false };
  const [laws, names] = await Promise.all([loadLaws(db), usernames(db, [uid])]);
  const mins = clamp(laws.jailMinutes * AIRPORT.jailFactor * (1 + qty / 10), 1, 45);
  const value = stashValue(stash, now);
  await db.prepare('DELETE FROM stash WHERE uid = ?').bind(uid).run();
  const r = await bust(env, ctx, uid, 'police', mins, AIRPORT.baseFine + value * AIRPORT.finePct, `Drug trafficking · ${qty} wrap${qty === 1 ? '' : 's'} found at the airport`, `NDLEA found ${qty} wrap${qty === 1 ? '' : 's'} in your bag at the airport`,
    `NDLEA officers pulled ${handle(names.get(uid))} out of the boarding queue with ${qty} wrap${qty === 1 ? '' : 's'} in their hand luggage. The flight left without them. ✈️🚔`);
  return { caught: true, qty, fine: r.fine };
}

/* ---------- Streets: rackets ---------- */

interface RacketRow { id: number; boss_uid: string; payer_uid: string; fee: number; status: string; next_due: number | null; paid_total: number; strikes: number; protector_uid: string | null; created_at: number }

/** Collect what's due, break deals that keep missing payments, and let the police catch the odd boss. */
export async function settleRackets(env: Env, ctx: ExecutionContext, now: number) {
  const db = env.DB;
  const { results } = await db.prepare(`SELECT * FROM rackets WHERE status = 'active' AND next_due <= ? ORDER BY next_due LIMIT 20`).bind(now).all<RacketRow>();
  if (!results.length) return;
  const laws = await loadLaws(db);
  const names = await usernames(db, results.flatMap((r) => [r.boss_uid, r.payer_uid]));
  for (const r of results) {
    const claimed = await db.prepare(`UPDATE rackets SET next_due = ? WHERE id = ? AND status = 'active' AND next_due = ?`).bind(now + RACKET.periodMs, r.id, r.next_due).run();
    if (!claimed.meta.changes) continue;
    const paid = await transfer(db, r.payer_uid, r.boss_uid, r.fee, 'racket_out', 'racket', `racket:${r.id}:${r.next_due}`);
    if (paid >= r.fee) {
      await db.prepare('UPDATE rackets SET paid_total = paid_total + ?, strikes = 0 WHERE id = ?').bind(paid, r.id).run();
      tell(env, ctx, r.payer_uid, 'racket', `💸 Protection money to ${handle(names.get(r.boss_uid))}: ${naira(paid)}. Another week of peace.`);
      tell(env, ctx, r.boss_uid, 'racket', `💰 ${handle(names.get(r.payer_uid))} paid ${naira(paid)} protection.`);
      if (rand() < RACKET.raidChance * patrolFactor(laws.patrols)) {
        await db.prepare(`UPDATE rackets SET status = 'ended' WHERE boss_uid = ? AND status IN ('active', 'demanded')`).bind(r.boss_uid).run();
        await bust(env, ctx, r.boss_uid, 'police', laws.jailMinutes, 40_000, 'Extortion · running a protection racket', 'Police busted your protection racket',
          `POLICE swooped on ${handle(names.get(r.boss_uid))}: running a protection racket across town. Every shop owner is relieved. 🚔`);
      }
      continue;
    }
    // Short: part-payment stays with the boss. Two misses and the boys pay a visit.
    const strikes = r.strikes + 1;
    if (strikes >= RACKET.maxStrikes) {
      const beating = Math.min(RACKET.beating.cap, Math.round((await getBalance(db, r.payer_uid)) * RACKET.beating.pct));
      const taken = beating > 0 ? await transfer(db, r.payer_uid, r.boss_uid, beating, 'racket_out', 'racket', `racket-beat:${r.id}`) : 0;
      await db.prepare(`UPDATE rackets SET status = 'broken', strikes = ? WHERE id = ?`).bind(strikes, r.id).run();
      tell(env, ctx, r.payer_uid, 'racket', `🥊 You missed your protection money twice. ${handle(names.get(r.boss_uid))}'s boys visited: ${naira(taken)} gone.`);
      tell(env, ctx, r.boss_uid, 'racket', `🥊 ${handle(names.get(r.payer_uid))} stopped paying. Your boys collected ${naira(taken)} and ended the deal.`);
    } else {
      await db.prepare('UPDATE rackets SET strikes = ? WHERE id = ?').bind(strikes, r.id).run();
      tell(env, ctx, r.payer_uid, 'racket', `⚠️ You couldn\'t cover ${handle(names.get(r.boss_uid))}'s protection money. Pay up next time, or else.`);
    }
  }
}

async function racketState(db: D1Database, uid: string) {
  const [asBoss, asPayer] = await Promise.all([
    db.prepare(`SELECT * FROM rackets WHERE boss_uid = ? AND status IN ('demanded', 'active') ORDER BY id DESC LIMIT 20`).bind(uid).all<RacketRow>(),
    db.prepare(`SELECT * FROM rackets WHERE payer_uid = ? AND status IN ('demanded', 'active', 'protected') ORDER BY id DESC LIMIT 20`).bind(uid).all<RacketRow>(),
  ]);
  const names = await usernames(db, [...asBoss.results.flatMap((r) => [r.payer_uid]), ...asPayer.results.flatMap((r) => [r.boss_uid, r.protector_uid])]);
  return {
    asBoss: asBoss.results.map((r) => ({ id: r.id, other: names.get(r.payer_uid) ?? 'someone', fee: r.fee, status: r.status, nextDue: r.next_due, paidTotal: r.paid_total, strikes: r.strikes })),
    asPayer: asPayer.results.map((r) => ({ id: r.id, other: names.get(r.boss_uid) ?? 'someone', fee: r.fee, status: r.status, nextDue: r.next_due, paidTotal: r.paid_total, strikes: r.strikes, protector: r.protector_uid ? names.get(r.protector_uid) ?? null : null })),
  };
}

/* ---------- Streets: contracts ---------- */

/** Office holders move with state security: nobody can be sent to kidnap one, and the road gangs leave them alone. */
const OFFICE_COLUMNS = OFFICES.map((o) => `${o}_uid`).join(', ');
const holdsOffice = async (db: D1Database, uid: string) =>
  !!(await db.prepare(`SELECT 1 AS x FROM civic_policies WHERE id = 1 AND ?1 IN (${OFFICE_COLUMNS})`).bind(uid).first());

interface ContractRow { car_id?: string | null; id: number; kind: 'hit' | 'kidnap'; poster_uid: string; target_uid: string; reward: number; ransom: number; status: string; taker_uid: string | null; created_at: number; taken_at: number | null; hold_ends: number | null }

async function pledgedOf(db: D1Database, id: number) {
  const r = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM ransom_pledges WHERE contract_id = ?').bind(id).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Refund everyone who chipped in towards a ransom that will not now be paid. */
async function refundPledges(db: D1Database, id: number) {
  const { results } = await db.prepare('SELECT uid, amount FROM ransom_pledges WHERE contract_id = ?').bind(id).all<{ uid: string; amount: number }>();
  for (const p of results) await credit(db, p.uid, `ransom-refund:${id}:${p.uid}`, 'ransom_refund', String(id), p.amount);
  await db.prepare('DELETE FROM ransom_pledges WHERE contract_id = ?').bind(id).run();
}

/** The ransom wasn\'t met: friends get their chip-ins back, but whatever the victim put in themselves goes to the kidnapper. Returns that amount. */
async function settlePledgesUnpaid(db: D1Database, c: ContractRow) {
  const { results } = await db.prepare('SELECT uid, amount FROM ransom_pledges WHERE contract_id = ?').bind(c.id).all<{ uid: string; amount: number }>();
  let forfeited = 0;
  for (const p of results) {
    if (p.uid === c.target_uid) {
      forfeited += p.amount;
      if (c.taker_uid) await credit(db, c.taker_uid, `ransom-kept:${c.id}`, 'ransom', String(c.id), p.amount);
    } else {
      await credit(db, p.uid, `ransom-refund:${c.id}:${p.uid}`, 'ransom_refund', String(c.id), p.amount);
    }
  }
  await db.prepare('DELETE FROM ransom_pledges WHERE contract_id = ?').bind(c.id).run();
  return forfeited;
}

const freeVictim = (db: D1Database, uid: string) => db.prepare('UPDATE players SET held_until = NULL WHERE uid = ?').bind(uid).run();

/** Lapse stale contracts and let go of victims whose time is up. */
export async function settleContracts(env: Env, ctx: ExecutionContext, now: number) {
  const db = env.DB;
  const old = await db.prepare(`SELECT * FROM contracts WHERE status = 'open' AND created_at < ? LIMIT 20`).bind(now - CONTRACT.expiresMs).all<ContractRow>();
  for (const c of old.results) {
    const won = await db.prepare(`UPDATE contracts SET status = 'expired' WHERE id = ? AND status = 'open'`).bind(c.id).run();
    if (!won.meta.changes) continue;
    await credit(db, c.poster_uid, `contract-refund:${c.id}`, 'contract_refund', String(c.id), c.reward);
    tell(env, ctx, c.poster_uid, 'contract', `📜 Nobody took your ${c.kind === 'hit' ? 'hit' : 'kidnap'} contract. ${naira(c.reward)} returned.`);
  }
  const held = await db.prepare(`SELECT * FROM contracts WHERE status = 'ransom' AND hold_ends <= ? LIMIT 20`).bind(now).all<ContractRow>();
  for (const c of held.results) {
    const won = await db.prepare(`UPDATE contracts SET status = 'expired' WHERE id = ? AND status = 'ransom'`).bind(c.id).run();
    if (!won.meta.changes) continue;
    const forfeited = await settlePledgesUnpaid(db, c);
    await freeVictim(db, c.target_uid);
    // They keep what the victim put in, and strip them: phone, accessories and the car they were snatched in.
    await db.prepare('INSERT INTO seizures (uid, contract_id, car_id, forfeited, created_at) VALUES (?, ?, ?, ?, ?)').bind(c.target_uid, c.id, c.car_id ?? null, forfeited, now).run();
    if (c.car_id) {
      await db
        .prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) VALUES (?1, ?2, 'stolen', ?3, 0, 1, ?4) ON CONFLICT(uid, client_id) DO NOTHING`)
        .bind(c.target_uid, `seized:${c.id}`, c.car_id, now)
        .run();
    }
    const lost = [forfeited ? `the ${naira(forfeited)} you put in` : null, 'your phone', 'your accessories', c.car_id && CAR_BY_ID[c.car_id] ? `your ${CAR_BY_ID[c.car_id].name}` : null].filter(Boolean).join(', ');
    tell(env, ctx, c.target_uid, 'released', `🥾 Time up. The kidnappers dumped you by the road and took ${lost}. You are free, but broke and bare.`, { seized: true });
    if (c.taker_uid) tell(env, ctx, c.taker_uid, 'contract', '🪤 The ransom never came in time. You let your hostage go and kept what they put in.');
  }
}

async function contractState(env: Env, uid: string) {
  const db = env.DB;
  const now = Date.now();
  const [open, mine, taking, onMe] = await Promise.all([
    db.prepare(`SELECT * FROM contracts WHERE status = 'open' AND poster_uid != ?1 AND target_uid != ?1 ORDER BY reward DESC LIMIT 25`).bind(uid).all<ContractRow>(),
    db.prepare(`SELECT * FROM contracts WHERE poster_uid = ? AND status IN ('open', 'taken', 'ransom') ORDER BY id DESC LIMIT 20`).bind(uid).all<ContractRow>(),
    db.prepare(`SELECT * FROM contracts WHERE taker_uid = ? AND status IN ('taken', 'ransom') ORDER BY id DESC LIMIT 10`).bind(uid).all<ContractRow>(),
    db.prepare(`SELECT * FROM contracts WHERE target_uid = ? AND status = 'ransom'`).bind(uid).all<ContractRow>(),
  ]);
  // Ransoms I can help with: my friends'.
  const friends = await db
    .prepare(`SELECT CASE WHEN a = ?1 THEN b ELSE a END AS f FROM friendships WHERE status = 'accepted' AND (a = ?1 OR b = ?1)`)
    .bind(uid)
    .all<{ f: string }>();
  const fr = new Set(friends.results.map((r) => r.f));
  const ransoms = await db.prepare(`SELECT * FROM contracts WHERE status = 'ransom' AND hold_ends > ? ORDER BY hold_ends LIMIT 25`).bind(now).all<ContractRow>();
  const all = [...open.results, ...mine.results, ...taking.results, ...onMe.results, ...ransoms.results];
  const names = await usernames(db, all.flatMap((c) => [c.poster_uid, c.target_uid, c.taker_uid]));
  const shape = async (c: ContractRow) => ({
    id: c.id, kind: c.kind, reward: c.reward, ransom: c.ransom, status: c.status,
    target: names.get(c.target_uid) ?? 'someone', targetUid: c.target_uid,
    poster: c.poster_uid === uid ? 'you' : null,
    taker: c.taker_uid ? (c.taker_uid === uid ? 'you' : null) : null,
    at: c.created_at, holdEnds: c.hold_ends,
    pledged: c.status === 'ransom' ? await pledgedOf(db, c.id) : 0,
    friend: fr.has(c.target_uid), mineTarget: c.target_uid === uid,
  });
  return {
    open: await Promise.all(open.results.map(shape)),
    mine: await Promise.all(mine.results.map(shape)),
    taking: await Promise.all(taking.results.map(shape)),
    onMe: await Promise.all(onMe.results.map(shape)),
    ransoms: await Promise.all(ransoms.results.filter((c) => c.target_uid !== uid).map(shape)),
  };
}

/** Both players online, in the same place, close enough. */
async function closeTo(env: Env, a: string, b: string, reach: number): Promise<string | null> {
  const [x, y] = await Promise.all([whereIs(env, a), whereIs(env, b)]);
  if (!x) return 'Go online in the game first';
  if (!y) return 'They are not around right now';
  if (x.area === 'home' || x.area !== y.area) return 'They are not in the same place as you';
  if (Math.hypot(x.x - y.x, x.z - y.z) > reach) return 'Get closer to them first';
  return null;
}

/* ---------- Streets: dirty work ---------- */

async function opsState(db: D1Database, uid: string) {
  const { results } = await db.prepare('SELECT kind, started_at, ready_at FROM ops WHERE uid = ?').bind(uid).all<{ kind: string; started_at: number; ready_at: number }>();
  return results.filter((r) => isOp(r.kind)).map((r) => ({ kind: r.kind, startedAt: r.started_at, readyAt: r.ready_at }));
}

const OP_KIND: Record<string, string> = { forgery: 'forgery', counterfeit: 'counterfeit', bunker: 'bunkering', pirate: 'pirate_ads', betting: 'betting_shop' };

async function collectOp(env: Env, ctx: ExecutionContext, uid: string, def: OpDef, row: { started_at: number; ready_at: number }, now: number) {
  const db = env.DB;
  const laws = await loadLaws(db);
  const who = (await usernames(db, [uid])).get(uid);
  const factor = def.agency === 'police' ? patrolFactor(laws.patrols) : clamp(0.5 + laws.finePct / 50, 0.5, 2.5);
  if (rand() < def.bust * factor) {
    await db.prepare('DELETE FROM ops WHERE uid = ? AND kind = ?').bind(uid, def.id).run();
    const mins = def.agency === 'efcc' ? laws.jailMinutes * 1.5 : laws.jailMinutes;
    const line = {
      forgery: `${handle(who)} was caught forging “certificates” in a Sabon Gari print shop. Prints seized. 📄🚔`,
      counterfeit: `EFCC raided ${handle(who)}'s printer: fresh naira with the same serial number on every note. 💵🕵🏾`,
      bunker: `Police caught ${handle(who)} siphoning fuel from the depot at night. The jerrycans were still warm. 🛢️🚔`,
      pirate: `NBC and police pulled down ${handle(who)}'s pirate radio mast. Radio KD is smiling. 📡🚔`,
      betting: `EFCC shut down ${handle(who)}'s backstreet betting shop. The punters are crying. 🎰🕵🏾`,
    }[def.id];
    const charge = {
      forgery: 'Forgery · fake certificates and land papers',
      counterfeit: 'Counterfeiting · printing naira',
      bunker: 'Oil bunkering · siphoning fuel from the depot',
      pirate: 'Unlicensed broadcasting · a pirate radio mast',
      betting: 'Illegal gambling · a backstreet betting shop',
    }[def.id];
    const r = await bust(env, ctx, uid, def.agency, mins, def.fine, charge, `${def.name}: busted`, line);
    return { busted: true as const, fine: r.fine };
  }
  const periods = def.persistent ? Math.min(3, 1 + Math.floor((now - row.ready_at) / (def.mins * 60_000))) : 1;
  const pay = def.payout * periods;
  await db.batch([
    def.persistent
      ? db.prepare('UPDATE ops SET started_at = ? WHERE uid = ? AND kind = ?').bind(now, uid, def.id)
      : db.prepare('DELETE FROM ops WHERE uid = ? AND kind = ?').bind(uid, def.id),
    bumpVice(db, uid),
  ]);
  await credit(db, uid, `op:${def.id}:${now}`, OP_KIND[def.id], def.id, pay);
  return { busted: false as const, pay };
}

/* ---------- Streets: jail ---------- */

async function cellState(db: D1Database, uid: string, now: number) {
  const p = await playerRow(db, uid);
  const jailed = !!(p?.jailed_until && p.jailed_until > now);
  const { results } = await db.prepare(`SELECT * FROM breakouts WHERE status = 'open' ORDER BY created_at DESC LIMIT 20`).all<{ id: number; inmate_uid: string; price: number; created_at: number }>();
  const live = [];
  for (const b of results) {
    const q = await playerRow(db, b.inmate_uid);
    if (q?.jailed_until && q.jailed_until > now) live.push(b);
    else await db.prepare(`UPDATE breakouts SET status = 'cancelled' WHERE id = ?`).bind(b.id).run();
  }
  const names = await usernames(db, live.map((b) => b.inmate_uid));
  return {
    jailed,
    jailedUntil: jailed ? p!.jailed_until : null,
    bribeCost: jailed ? Math.max(CELL.bribeMin, Math.round(((p!.jailed_until! - now) / 60_000) * CELL.bribePerMin)) : null,
    breakouts: live.map((b) => ({ id: b.id, inmate: names.get(b.inmate_uid) ?? 'someone', price: b.price, mine: b.inmate_uid === uid, at: b.created_at })),
  };
}

/* ---------- Router ---------- */

export async function handleVice(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/vice')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();
  const post = req.method === 'POST';

  /* ----- reads ----- */

  if (path === '/api/vice' && req.method === 'GET') {
    return json(await plugState(env, me));
  }

  // Tiny poll for the "you've been kidnapped" screen and the high effect.
  if (path === '/api/vice/me' && req.method === 'GET') {
    await settleContracts(env, ctx, now);
    const p = await playerRow(db, me);
    const held = p?.held_until && p.held_until > now ? p.held_until : null;
    let ransom: { id: number; amount: number; pledged: number; endsAt: number } | null = null;
    if (held) {
      const c = await db.prepare(`SELECT * FROM contracts WHERE target_uid = ? AND status = 'ransom' ORDER BY id DESC LIMIT 1`).bind(me).first<ContractRow>();
      if (c) ransom = { id: c.id, amount: c.ransom, pledged: await pledgedOf(db, c.id), endsAt: c.hold_ends ?? held };
    }
    return json({ highUntil: p?.high_until && p.high_until > now ? p.high_until : null, heldUntil: held, ransom });
  }

  if (path === '/api/vice/streets' && req.method === 'GET') {
    await Promise.all([settleRackets(env, ctx, now), settleContracts(env, ctx, now)]);
    const score = await crimeScore(db, me);
    const [rackets, contracts, ops, cell] = await Promise.all([racketState(db, me), contractState(env, me), opsState(db, me), cellState(db, me, now)]);
    return json({ score, tier: crimeTier(score).id, rackets, contracts, ops, cell, fuelEvent: activeEvent(now) === 'fuel' });
  }

  // What kidnappers took when a ransom ran out, waiting for the game to apply it.
  if (path === '/api/vice/seizures' && req.method === 'GET') {
    const { results } = await db.prepare('SELECT id, car_id, forfeited FROM seizures WHERE uid = ? AND applied = 0 ORDER BY id LIMIT 5').bind(me).all<{ id: number; car_id: string | null; forfeited: number }>();
    return json({ seizures: results.map((r) => ({ id: r.id, carId: r.car_id, forfeited: r.forfeited })) });
  }

  if (!post) return err(404, 'Not found');
  const b = (await body<Record<string, unknown>>(req)) ?? {};

  /* ----- Plug ----- */

  if (path === '/api/vice/sweep') {
    return json(await sweep(env, ctx, me));
  }

  if (path === '/api/vice/flight') {
    return json(await flightSearch(env, ctx, me));
  }

  if (path === '/api/vice/buy') {
    const good = b.good, qty = int(b.qty, 1, PLUG.stashCap);
    if (!isGood(good) || !qty) return err(400, 'Pick something and how many');
    const stop = await busy(db, me);
    if (stop) return err(403, stop);
    if (!(await roomFor(db, me, good, qty))) return err(409, 'You can\'t carry that much');
    const price = plugPrice(good, now) * qty;
    const paid = await transfer(db, me, null, price, 'vice_buy', '', `plug:${me}:${now}`);
    if (paid < price) {
      if (paid > 0) await credit(db, me, `plug-refund:${me}:${now}`, 'vice_refund', good, paid);
      return err(402, `That costs ${naira(price)}`);
    }
    const ripped = rand() < PLUG.rippedChance;
    const got = ripped ? Math.max(1, Math.floor(qty / 2)) : qty;
    await addStash(db, me, good, got).run();
    return json({ got, ripped, price, balance: await getBalance(db, me), stash: await stashOf(db, me) });
  }

  if (path === '/api/vice/sell') {
    const good = b.good, qty = int(b.qty, 1, PLUG.stashCap);
    if (!isGood(good) || !qty) return err(400, 'Pick something and how many');
    const stop = await busy(db, me);
    if (stop) return err(403, stop);
    if (!(await takeStash(db, me, good, qty))) return err(409, 'You don\'t have that many');
    const laws = await loadLaws(db);
    if (rand() < PLUG.stingChance * patrolFactor(laws.patrols)) {
      const who = (await usernames(db, [me])).get(me);
      const r = await bust(env, ctx, me, 'police', laws.jailMinutes * (1 + qty / 10), 15_000 + plugPrice(good, now) * qty * 0.5, `Drug dealing · sold ${qty} wrap${qty === 1 ? '' : 's'} to an undercover officer`, 'Your “customer” was an undercover officer',
        `Undercover officers arrested ${handle(who)} mid-sale on the street. “Customer” had a badge under his agbada. 🕵🏾🚔`);
      return json({ sting: true, fine: r.fine, balance: await getBalance(db, me), stash: await stashOf(db, me) });
    }
    const earn = streetPrice(good, now) * qty;
    await Promise.all([credit(db, me, `plug-sale:${me}:${now}:${good}`, 'vice_sale', good, earn), bumpVice(db, me, qty).run()]);
    return json({ sting: false, earned: earn, balance: await getBalance(db, me), stash: await stashOf(db, me) });
  }

  if (path === '/api/vice/use') {
    const good = b.good;
    if (!isGood(good)) return err(400, 'Use what?');
    const stop = await busy(db, me);
    if (stop) return err(403, stop);
    if (!(await takeStash(db, me, good, 1))) return err(409, 'You have none left');
    const p = await playerRow(db, me);
    const before = p?.high_until && p.high_until > now ? p.high_until : now;
    const until = before + GOOD_BY_ID[good].highMin * 60_000;
    await db.prepare('UPDATE players SET high_until = ? WHERE uid = ?').bind(until, me).run();
    if ((before - now) / 60_000 > PLUG.overdoseAtMin && rand() < PLUG.overdoseChance) {
      const bill = await transfer(db, me, null, await hospitalPrice(db, me, PLUG.hospitalBill), 'hospital', '', `od:${me}:${now}`);
      await db.prepare('UPDATE players SET high_until = NULL WHERE uid = ?').bind(me).run();
      const who = (await usernames(db, [me])).get(me);
      await postFeed(db, me, 'vice', '🚑', `${handle(who)} passed out on the street and was rushed to hospital. Too much of a good thing. 🚑`);
      return json({ overdose: true, bill, highUntil: null, balance: await getBalance(db, me), stash: await stashOf(db, me) });
    }
    return json({ overdose: false, highUntil: until, balance: await getBalance(db, me), stash: await stashOf(db, me) });
  }

  if (path === '/api/vice/list') {
    const good = b.good, qty = int(b.qty, 1, PLUG.stashCap), price = int(b.price, 500, 1_000_000);
    if (!isGood(good) || !qty || !price) return err(400, 'Pick something, how many and your price');
    const stop = await busy(db, me);
    if (stop) return err(403, stop);
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM vice_listings WHERE seller_uid = ? AND status = 'listed'`).bind(me).first<{ n: number }>();
    if ((n?.n ?? 0) >= PLUG.maxListings) return err(409, `You can only run ${PLUG.maxListings} ads at a time`);
    if ((await getBalance(db, me)) < PLUG.adFee) return err(402, `An ad costs ${naira(PLUG.adFee)}`);
    if (!(await takeStash(db, me, good, qty))) return err(409, 'You don\'t have that many');
    await transfer(db, me, null, PLUG.adFee, 'vice_ad', '', `ad:${me}:${now}`);
    await db.prepare(`INSERT INTO vice_listings (seller_uid, good, qty, price, status, listed_at) VALUES (?, ?, ?, ?, 'listed', ?)`).bind(me, good, qty, price, now).run();
    return json({ ok: true, balance: await getBalance(db, me) });
  }

  if (path === '/api/vice/cancel-listing') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`UPDATE vice_listings SET status = 'cancelled' WHERE id = ? AND seller_uid = ? AND status = 'listed' RETURNING *`).bind(id, me).first<ListingRow>() : null;
    if (!row || !isGood(row.good)) return err(404, 'That ad is gone');
    await addStash(db, me, row.good, row.qty).run();
    return json({ ok: true });
  }

  if (path === '/api/vice/buy-listing') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare('SELECT * FROM vice_listings WHERE id = ?').bind(id).first<ListingRow>() : null;
    if (!row || row.status !== 'listed' || !isGood(row.good)) return err(404, 'Somebody already bought it');
    if (row.seller_uid === me) return err(400, 'That\'s your own ad');
    const stop = await busy(db, me);
    if (stop) return err(403, stop);
    if (!(await roomFor(db, me, row.good, row.qty))) return err(409, 'You can\'t carry that much');
    const total = row.price * row.qty;
    if ((await getBalance(db, me)) < total) return err(402, `That costs ${naira(total)}`);
    const claimed = await db.prepare(`UPDATE vice_listings SET status = 'sold', buyer_uid = ?, sold_at = ? WHERE id = ? AND status = 'listed'`).bind(me, now, row.id).run();
    if (!claimed.meta.changes) return err(409, 'Somebody already bought it');
    const paid = await transfer(db, me, row.seller_uid, total, 'vice_buy', 'vice_sale', `plug-ad:${row.id}`);
    if (paid < total) {
      if (paid > 0) await transfer(db, row.seller_uid, me, paid, 'vice_refund_out', 'vice_refund', `plug-ad-refund:${row.id}`);
      await db.prepare(`UPDATE vice_listings SET status = 'listed', buyer_uid = NULL, sold_at = NULL WHERE id = ?`).bind(row.id).run();
      return err(402, `That costs ${naira(total)}`);
    }
    await Promise.all([addStash(db, me, row.good, row.qty).run(), bumpVice(db, row.seller_uid, row.qty).run()]);
    tell(env, ctx, row.seller_uid, 'plug', `🌿 Your ${GOOD_BY_ID[row.good].name} ad sold: ${naira(total)}.`);
    return json({ ok: true, balance: await getBalance(db, me), stash: await stashOf(db, me) });
  }

  if (path === '/api/vice/offer') {
    const target = await uidOfName(db, b.to);
    const good = b.good, qty = int(b.qty, 1, PLUG.stashCap), price = int(b.price, 0, 1_000_000);
    if (!target || !isGood(good) || !qty || price === null) return err(400, 'Who, what, how many and your price');
    if (target.uid === me) return err(400, 'Deal with someone else');
    const stop = await busy(db, me);
    if (stop) return err(403, stop);
    if ((await stashOf(db, me))[good] < qty) return err(409, 'You don\'t have that many');
    const open = await db.prepare(`SELECT COUNT(*) AS n FROM vice_offers WHERE from_uid = ? AND status = 'open'`).bind(me).first<{ n: number }>();
    if ((open?.n ?? 0) >= 5) return err(409, 'Too many open offers');
    await db.prepare(`INSERT INTO vice_offers (from_uid, to_uid, good, qty, price, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)`).bind(me, target.uid, good, qty, price, now).run();
    const who = (await usernames(db, [me])).get(me);
    tell(env, ctx, target.uid, 'plug', `🤫 ${handle(who)} wants to sell you ${qty} ${GOOD_BY_ID[good].name} for ${naira(price)}. Check the Plug app.`);
    return json({ ok: true });
  }

  if (path === '/api/vice/offer-answer') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`SELECT * FROM vice_offers WHERE id = ? AND status = 'open'`).bind(id).first<OfferRow>() : null;
    if (!row || !isGood(row.good)) return err(404, 'That offer is gone');
    const names = await usernames(db, [row.from_uid, row.to_uid]);
    if (b.accept === 'cancel') {
      if (row.from_uid !== me) return err(403, 'Not your offer');
      await db.prepare(`UPDATE vice_offers SET status = 'cancelled' WHERE id = ?`).bind(row.id).run();
      return json({ ok: true });
    }
    if (row.to_uid !== me) return err(403, 'That offer isn\'t for you');
    if (!b.accept) {
      await db.prepare(`UPDATE vice_offers SET status = 'declined' WHERE id = ?`).bind(row.id).run();
      tell(env, ctx, row.from_uid, 'plug', `🙅🏾 ${handle(names.get(me))} turned down your offer.`);
      return json({ ok: true });
    }
    const stop = await busy(db, me);
    if (stop) return err(403, stop);
    if (!(await roomFor(db, me, row.good, row.qty))) return err(409, 'You can\'t carry that much');
    if ((await getBalance(db, me)) < row.price) return err(402, `That costs ${naira(row.price)}`);
    const claimed = await db.prepare(`UPDATE vice_offers SET status = 'accepted' WHERE id = ? AND status = 'open'`).bind(row.id).run();
    if (!claimed.meta.changes) return err(409, 'That offer is gone');
    if (!(await takeStash(db, row.from_uid, row.good, row.qty))) {
      await db.prepare(`UPDATE vice_offers SET status = 'cancelled' WHERE id = ?`).bind(row.id).run();
      return err(409, 'They no longer have the goods');
    }
    if (row.price > 0) {
      const paid = await transfer(db, me, row.from_uid, row.price, 'vice_buy', 'vice_sale', `plug-offer:${row.id}`);
      if (paid < row.price) {
        if (paid > 0) await transfer(db, row.from_uid, me, paid, 'vice_refund_out', 'vice_refund', `plug-offer-refund:${row.id}`);
        await addStash(db, row.from_uid, row.good, row.qty).run();
        await db.prepare(`UPDATE vice_offers SET status = 'open' WHERE id = ?`).bind(row.id).run();
        return err(402, `That costs ${naira(row.price)}`);
      }
    }
    await Promise.all([addStash(db, me, row.good, row.qty).run(), bumpVice(db, row.from_uid, row.qty).run()]);
    tell(env, ctx, row.from_uid, 'plug', `🤝 ${handle(names.get(me))} took your ${row.qty} ${GOOD_BY_ID[row.good].name}: ${naira(row.price)}.`);
    return json({ ok: true, balance: await getBalance(db, me), stash: await stashOf(db, me) });
  }

  /* ----- Driving high ----- */

  if (path === '/api/vice/dui') {
    const p = await playerRow(db, me);
    if (!p) return json({ stop: false });
    const high = !!(p.high_until && p.high_until > now);
    const laws = await loadLaws(db);
    if (b.choice === undefined) {
      if (!high || (p.dui_at && now - p.dui_at < DUI.everyMs * 0.8) || (p.dui_pending && p.dui_pending > now)) return json({ stop: false });
      await db.prepare('UPDATE players SET dui_at = ? WHERE uid = ?').bind(now, me).run();
      if (rand() >= DUI.chance * patrolFactor(laws.patrols) * (activeRoadEvent(now) === 'crackdown' ? 1.8 : 1)) return json({ stop: false });
      await db.prepare('UPDATE players SET dui_pending = ? WHERE uid = ?').bind(now + 90_000, me).run();
      return json({ stop: true, bribe: DUI.bribe });
    }
    if (!p.dui_pending || p.dui_pending < now) return err(409, 'There is no stop to answer');
    await db.prepare('UPDATE players SET dui_pending = NULL WHERE uid = ?').bind(me).run();
    const who = (await usernames(db, [me])).get(me);
    const caught = async (why: string, factor = 1, also = '') => {
      const stash = await stashOf(db, me);
      const qty = stashTotal(stash);
      if (qty) await db.prepare('DELETE FROM stash WHERE uid = ?').bind(me).run();
      const r = await bust(env, ctx, me, 'police', laws.jailMinutes * DUI.jailFactor * factor, DUI.fine + stashValue(stash, now) * SWEEP.finePct, `Driving high${also}${qty ? ` · ${qty} wrap${qty === 1 ? '' : 's'} in the car` : ''}`, why,
        `${handle(who)} was arrested driving high${qty ? ` with ${qty} wraps in the glove box` : ''}. “I only had one” is not a defence. 🚓🌿`);
      return { result: 'arrested' as const, fine: r.fine };
    };
    if (b.choice === 'bribe') {
      const bribePaid = await transfer(db, me, null, DUI.bribe, 'bribe', '', `dui-bribe:${me}:${now}`);
      if (bribePaid < DUI.bribe) {
        // Couldn't cover the bribe — refund any partial and arrest.
        if (bribePaid > 0) await credit(db, me, `dui-bribe-short:${me}:${now}`, 'vice_refund', 'bribe', bribePaid);
        return json(await caught('Police stopped you driving high and you couldn\'t pay'));
      }
      if (rand() < DUI.bribeWorks) {
        return json({ result: 'bribed', balance: await getBalance(db, me) });
      }
      return json({ ...(await caught('You offered the officer a bribe and he arrested you for it', 1.3, ' and offering the officer a bribe')), bribeLost: true });
    }
    if (b.choice === 'flee') {
      if (rand() < DUI.fleeWorks) return json({ result: 'fled' });
      return json(await caught('Police chased you down for driving high', 1.2, ' and running from the police'));
    }
    return json(await caught('Police arrested you for driving high'));
  }

  /* ----- everything below is "the streets" ----- */

  const free = path.startsWith('/api/vice/cell/') || ['/api/vice/breakout/post', '/api/vice/contract/struggle', '/api/vice/contract/pledge'].includes(path);
  const blocked = free ? null : await busy(db, me);
  if (blocked) return err(403, blocked);

  /* ----- Protection rackets ----- */

  if (path === '/api/vice/racket/demand') {
    const target = await uidOfName(db, b.target);
    const fee = int(b.fee, 1, 1e9);
    if (!target || !fee || !RACKET.fees.includes(fee)) return err(400, 'Pick someone and a fee');
    if (target.uid === me) return err(400, 'Even you can\'t extort yourself');
    const score = await crimeScore(db, me);
    if (tierIndex(crimeTier(score).id) < tierIndex(RACKET.tier)) return err(403, 'The boys don\'t know you. Climb to Area boy first');
    const [active, existing, cool, shielded] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM rackets WHERE boss_uid = ? AND status IN ('demanded', 'active')`).bind(me).first<{ n: number }>(),
      db.prepare(`SELECT id FROM rackets WHERE boss_uid = ? AND payer_uid = ? AND status IN ('demanded', 'active')`).bind(me, target.uid).first(),
      db.prepare(`SELECT id FROM rackets WHERE boss_uid = ? AND payer_uid = ? AND status = 'refused' AND created_at > ?`).bind(me, target.uid, now - RACKET.cooldownMs).first(),
      db.prepare(`SELECT id FROM rackets WHERE boss_uid = ? AND payer_uid = ? AND status = 'protected' AND created_at > ?`).bind(me, target.uid, now - RACKET.shieldMs).first(),
    ]);
    if ((active?.n ?? 0) >= RACKET.maxVictims) return err(409, `You can only squeeze ${RACKET.maxVictims} people at once`);
    if (existing) return err(409, 'You already have a deal with them');
    if (cool) return err(429, 'They just told you no. Give it an hour');
    if (shielded) return err(403, 'Another gang is protecting them');
    const row = await db.prepare(`INSERT INTO rackets (boss_uid, payer_uid, fee, status, created_at) VALUES (?, ?, ?, 'demanded', ?) RETURNING id`).bind(me, target.uid, fee, now).first<{ id: number }>();
    const who = (await usernames(db, [me])).get(me);
    tell(env, ctx, target.uid, 'racket', `🕴🏾 ${handle(who)} says your area needs “protection”: ${naira(fee)} every week. Open Fixer → Protection to answer.`);
    return json({ id: row?.id });
  }

  if (path === '/api/vice/racket/answer') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`SELECT * FROM rackets WHERE id = ? AND payer_uid = ? AND status = 'demanded'`).bind(id, me).first<RacketRow>() : null;
    if (!row) return err(404, 'That demand is gone');
    const names = await usernames(db, [row.boss_uid, me]);
    if (b.choice === 'pay') {
      const paid = await transfer(db, me, row.boss_uid, row.fee, 'racket_out', 'racket', `racket:${row.id}:0`);
      if (paid < row.fee) {
        if (paid > 0) await transfer(db, row.boss_uid, me, paid, 'racket_out', 'racket', `racket-refund:${row.id}`);
        return err(402, `You need ${naira(row.fee)} for the first week`);
      }
      const updated = await db.prepare(`UPDATE rackets SET status = 'active', next_due = ?, paid_total = ? WHERE id = ? AND status = 'demanded'`).bind(now + RACKET.periodMs, paid, row.id).run();
      if (!updated.meta.changes) {
        // Lost race — another concurrent answer already resolved this. Refund.
        await transfer(db, row.boss_uid, me, paid, 'racket_out', 'racket', `racket-dup-refund:${row.id}`);
        return json({ ok: true, balance: await getBalance(db, me) });
      }
      tell(env, ctx, row.boss_uid, 'racket', `🤝 ${handle(names.get(me))} agreed to pay ${naira(row.fee)} a week. First week: paid.`);
      return json({ ok: true, balance: await getBalance(db, me) });
    }
    if (b.choice === 'refuse') {
      const updated = await db.prepare(`UPDATE rackets SET status = 'refused', created_at = ? WHERE id = ? AND status = 'demanded'`).bind(now, row.id).run();
      if (!updated.meta.changes) return json({ ok: true, leaned: 0, balance: await getBalance(db, me) });
      const lean = await transfer(db, me, row.boss_uid, Math.round(row.fee * RACKET.leanPct), 'racket_out', 'racket', `racket-lean:${row.id}`);
      tell(env, ctx, row.boss_uid, 'racket', `🥊 ${handle(names.get(me))} refused. Your boys leaned on them: ${naira(lean)}.`);
      return json({ ok: true, leaned: lean, balance: await getBalance(db, me) });
    }
    if (b.choice === 'hire') {
      const rival = await uidOfName(db, b.rival);
      if (!rival || rival.uid === row.boss_uid || rival.uid === me) return err(400, 'Pick a rival gang boss');
      const [rs, bs] = await Promise.all([crimeScore(db, rival.uid), crimeScore(db, row.boss_uid)]);
      if (tierIndex(crimeTier(rs).id) < tierIndex(RACKET.tier)) return err(403, 'That person isn\'t a real gang boss yet');
      if ((await playerRow(db, rival.uid))?.jailed_until! > now) return err(409, 'Your rival boss is in a cell');
      const paid = await transfer(db, me, rival.uid, row.fee, 'racket_out', 'racket', `racket-hire:${row.id}`);
      if (paid < row.fee) {
        if (paid > 0) await transfer(db, rival.uid, me, paid, 'racket_out', 'racket', `racket-hire-refund:${row.id}`);
        return err(402, `Hiring a gang costs ${naira(row.fee)}`);
      }
      // Claim the demanded status atomically before resolving the gang war.
      const updated = await db.prepare(`UPDATE rackets SET status = 'hiring' WHERE id = ? AND status = 'demanded'`).bind(row.id).run();
      if (!updated.meta.changes) {
        // Lost race — refund the hire payment.
        await transfer(db, rival.uid, me, paid, 'racket_out', 'racket', `racket-hire-dup-refund:${row.id}`);
        return json({ result: 'won', balance: await getBalance(db, me) });
      }
      const win = rand() < clamp(rs / (rs + Math.max(1, bs)), 0.15, 0.85);
      if (win) {
        await db.prepare(`UPDATE rackets SET status = 'protected', protector_uid = ?, created_at = ? WHERE id = ?`).bind(rival.uid, now, row.id).run();
        const lost = await transfer(db, row.boss_uid, rival.uid, Math.round(row.fee * 0.5), 'racket_out', 'racket', `racket-war:${row.id}`);
        await postFeed(db, rival.uid, 'underworld', '⚔️', `GANG WAR: ${handle(names.get(rival.uid) ?? rival.username)}'s boys sent ${handle(names.get(row.boss_uid))}'s boys packing. ${handle(names.get(me))} sleeps well tonight. 🛡️`);
        tell(env, ctx, row.boss_uid, 'racket', `⚔️ ${handle(rival.username)}'s gang beat yours over ${handle(names.get(me))}. You paid ${naira(lost)}.`);
        tell(env, ctx, rival.uid, 'racket', `⚔️ You won a gang war for ${handle(names.get(me))}. Paid ${naira(paid)}.`);
        return json({ result: 'won', balance: await getBalance(db, me) });
      }
      const first = await transfer(db, me, row.boss_uid, Math.round(row.fee * 1.5), 'racket_out', 'racket', `racket:${row.id}:0`);
      await db.prepare(`UPDATE rackets SET status = 'active', next_due = ?, paid_total = ? WHERE id = ?`).bind(now + RACKET.periodMs, first, row.id).run();
      tell(env, ctx, row.boss_uid, 'racket', `⚔️ You crushed ${handle(rival.username)}'s gang. ${handle(names.get(me))} paid ${naira(first)} and is now yours.`);
      return json({ result: 'lost', paid: first, balance: await getBalance(db, me) });
    }
    return err(400, 'Pay, refuse or hire a gang');
  }

  if (path === '/api/vice/racket/end') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`SELECT * FROM rackets WHERE id = ? AND status = 'active' AND (boss_uid = ? OR payer_uid = ?)`).bind(id, me, me).first<RacketRow>() : null;
    if (!row) return err(404, 'No such deal');
    await db.prepare(`UPDATE rackets SET status = 'ended' WHERE id = ?`).bind(row.id).run();
    const names = await usernames(db, [row.boss_uid, row.payer_uid]);
    if (row.payer_uid === me) {
      const got = await transfer(db, me, row.boss_uid, Math.round(row.fee * 1.5), 'racket_out', 'racket', `racket-quit:${row.id}`);
      tell(env, ctx, row.boss_uid, 'racket', `🥊 ${handle(names.get(me))} quit paying. The boys took ${naira(got)} on the way out.`);
      return json({ ok: true, paid: got, balance: await getBalance(db, me) });
    }
    tell(env, ctx, row.payer_uid, 'racket', `🕊️ ${handle(names.get(me))} dropped your protection deal. You\'re free.`);
    return json({ ok: true });
  }

  if (path === '/api/vice/racket/report') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`SELECT * FROM rackets WHERE id = ? AND payer_uid = ? AND status IN ('demanded', 'active')`).bind(id, me).first<RacketRow>() : null;
    if (!row) return err(404, 'No such deal');
    const laws = await loadLaws(db);
    const names = await usernames(db, [row.boss_uid, me]);
    if (rand() < RACKET.reportArrest * patrolFactor(laws.patrols)) {
      await db.prepare(`UPDATE rackets SET status = 'ended' WHERE boss_uid = ? AND status IN ('demanded', 'active')`).bind(row.boss_uid).run();
      await bust(env, ctx, row.boss_uid, 'police', laws.jailMinutes * 1.5, 40_000, `Extortion · ${handle(names.get(me))} reported your protection racket`, `${handle(names.get(me))} reported your racket and police picked you up`,
        `${handle(names.get(me))} reported ${handle(names.get(row.boss_uid))}'s protection racket. The police actually came. The whole town is shocked. 🚔`);
      return json({ result: 'arrested' });
    }
    await db.prepare(`UPDATE rackets SET status = 'ended' WHERE id = ?`).bind(row.id).run();
    const hit = await transfer(db, me, row.boss_uid, row.fee * 2, 'racket_out', 'racket', `racket-snitch:${row.id}`);
    tell(env, ctx, row.boss_uid, 'racket', `🐀 ${handle(names.get(me))} snitched but the police didn't act. They paid ${naira(hit)} for it.`);
    return json({ result: 'ignored', paid: hit, balance: await getBalance(db, me) });
  }

  /* ----- Contracts ----- */

  if (path === '/api/vice/contract/post') {
    const kind = b.kind === 'hit' || b.kind === 'kidnap' ? b.kind : null;
    const target = await uidOfName(db, b.target);
    const reward = int(b.reward, 1, 1e12);
    if (!kind || !reward) return err(400, 'Pick the job, the target and the money');
    if (!target) return err(400, 'Nobody goes by that username. Pick them from the list');
    if (reward > CONTRACT.maxReward) return err(400, `Nobody pays more than ${naira(CONTRACT.maxReward)} for a job`);
    if (reward < CONTRACT.minReward[kind]) return err(400, `Nobody takes that job for less than ${naira(CONTRACT.minReward[kind])}`);
    const ransom = kind === 'kidnap' ? int(b.ransom, 1, 1e9) : 0;
    if (kind === 'kidnap' && (!ransom || !CONTRACT.ransoms.includes(ransom))) return err(400, 'Pick a ransom');
    if (target.uid === me) return err(400, 'Hit yourself? Talk to someone');
    if (kind === 'kidnap' && (await holdsOffice(db, target.uid))) return err(403, 'They hold public office. Nobody will touch a job on somebody with state security');
    const dup = await db.prepare(`SELECT id FROM contracts WHERE poster_uid = ? AND target_uid = ? AND status IN ('open', 'taken', 'ransom')`).bind(me, target.uid).first();
    if (dup) return err(409, 'You already have a contract on them');
    const paid = await transfer(db, me, null, reward, 'contract_out', '', `contract:${me}:${now}`);
    if (paid < reward) {
      if (paid > 0) await credit(db, me, `contract-short:${me}:${now}`, 'contract_refund', 'short', paid);
      return err(402, `You need ${naira(reward)} up front`);
    }
    const row = await db.prepare(`INSERT INTO contracts (kind, poster_uid, target_uid, reward, ransom, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?) RETURNING id`).bind(kind, me, target.uid, reward, ransom, now).first<{ id: number }>();
    return json({ id: row?.id, balance: await getBalance(db, me) });
  }

  if (path === '/api/vice/contract/cancel') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`UPDATE contracts SET status = 'cancelled' WHERE id = ? AND poster_uid = ? AND status = 'open' RETURNING *`).bind(id, me).first<ContractRow>() : null;
    if (!row) return err(404, 'Can only cancel a contract nobody has taken');
    await credit(db, me, `contract-refund:${row.id}`, 'contract_refund', String(row.id), row.reward);
    return json({ ok: true, balance: await getBalance(db, me) });
  }

  if (path === '/api/vice/contract/take') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare('SELECT * FROM contracts WHERE id = ?').bind(id).first<ContractRow>() : null;
    if (!row || row.status !== 'open') return err(404, 'Somebody already took that');
    if (row.poster_uid === me || row.target_uid === me) return err(400, 'Not that one');
    const already = await db.prepare(`SELECT id FROM contracts WHERE taker_uid = ? AND status IN ('taken', 'ransom')`).bind(me).first();
    if (already) return err(409, 'Finish your current job first');
    const claimed = await db.prepare(`UPDATE contracts SET status = 'taken', taker_uid = ?, taken_at = ? WHERE id = ? AND status = 'open'`).bind(me, now, row.id).run();
    if (!claimed.meta.changes) {
      // Idempotent: if we already took it (e.g. network retry), that's fine.
      const current = await db.prepare('SELECT taker_uid FROM contracts WHERE id = ?').bind(row.id).first<{ taker_uid: string | null }>();
      if (current?.taker_uid === me) return json({ ok: true });
      return err(409, 'Somebody already took that');
    }
    return json({ ok: true });
  }

  if (path === '/api/vice/contract/drop') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`UPDATE contracts SET status = 'open', taker_uid = NULL, taken_at = NULL WHERE id = ? AND taker_uid = ? AND status = 'taken' RETURNING id`).bind(id, me).first() : null;
    if (!row) return err(404, 'You are not on that job');
    return json({ ok: true });
  }

  if (path === '/api/vice/contract/strike') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`SELECT * FROM contracts WHERE id = ? AND taker_uid = ? AND status = 'taken'`).bind(id, me).first<ContractRow>() : null;
    if (!row) return err(404, 'You are not on that job');
    const tp = await playerRow(db, row.target_uid);
    if ((tp?.jailed_until ?? 0) > now) return err(409, 'They are in a cell. Wait for them to come out');
    if ((tp?.held_until ?? 0) > now) return err(409, 'They are already being held');
    // Elected since the contract went up: the convoy is in the way now.
    if (row.kind === 'kidnap' && (await holdsOffice(db, row.target_uid))) return err(409, 'They hold public office now. You cannot get past the security detail');
    const near = await closeTo(env, me, row.target_uid, CONTRACT.reach);
    if (near) return err(409, near);
    const score = await crimeScore(db, me);
    const chance = clamp(CONTRACT.hitBase + Math.min(0.3, score * 0.02) - (row.kind === 'kidnap' ? 0.1 : 0), 0.2, 0.8);
    const names = await usernames(db, [me, row.target_uid, row.poster_uid]);
    const laws = await loadLaws(db);
    if (rand() >= chance) {
      await db.prepare(`UPDATE contracts SET status = 'open', taker_uid = NULL, taken_at = NULL WHERE id = ?`).bind(row.id).run();
      tell(env, ctx, row.target_uid, 'attack', `😰 Somebody tried to ${row.kind === 'hit' ? 'jump' : 'snatch'} you in the street. You got away. Watch your back.`);
      if (rand() < CONTRACT.failArrest * patrolFactor(laws.patrols)) {
        await bust(env, ctx, me, 'police', laws.jailMinutes * 1.5, 30_000, `Attempted ${row.kind === 'hit' ? 'assault' : 'kidnapping'} · a contract on ${handle(names.get(row.target_uid))}`, 'You botched the job and police grabbed you',
          `${handle(names.get(me))} was arrested for attempted ${row.kind === 'hit' ? 'assault' : 'abduction'}. Rumours of a contract. 🚔`);
        return json({ result: 'arrested' });
      }
      return json({ result: 'failed' });
    }
    const cut = Math.round(row.reward * CONTRACT.cutPct);
    const pay = row.reward - cut;
    if (row.kind === 'hit') {
      await db.prepare(`UPDATE contracts SET status = 'done' WHERE id = ? AND status = 'taken'`).bind(row.id).run();
      const bill = await hospitalPrice(db, row.target_uid, Math.min(CONTRACT.hospitalCap, Math.round((await getBalance(db, row.target_uid)) * CONTRACT.hospitalPct)));
      const paid = bill > 0 ? await transfer(db, row.target_uid, null, bill, 'hospital', '', `hit:${row.id}`) : 0;
      await Promise.all([credit(db, me, `contract-pay:${row.id}`, 'contract', String(row.id), pay), bumpVice(db, me, 2).run()]);
      tell(env, ctx, row.target_uid, 'hurt', `🤕 You were jumped by thugs and beaten badly. Hospital bill: ${naira(paid)}.`, { bill: paid });
      await postFeed(db, row.target_uid, 'vice', '🚑', `${handle(names.get(row.target_uid))} was beaten up by unknown thugs and rushed to hospital. Police are “looking into it”. 👀`);
      return json({ result: 'done', pay, balance: await getBalance(db, me) });
    }
    const ends = now + CONTRACT.holdMs;
    await db.batch([
      db.prepare(`UPDATE contracts SET status = 'ransom', hold_ends = ? WHERE id = ? AND status = 'taken'`).bind(ends, row.id),
      db.prepare('UPDATE players SET held_until = ? WHERE uid = ?').bind(ends, row.target_uid),
      bumpVice(db, me, 3),
    ]);
    await credit(db, me, `contract-pay:${row.id}`, 'contract', String(row.id), pay);
    tell(env, ctx, row.target_uid, 'held', `🚨 You've been KIDNAPPED. The kidnappers want ${naira(row.ransom)}. Beg your friends!`, { until: ends, contract: row.id, ransom: row.ransom });
    const friends = await db
      .prepare(`SELECT CASE WHEN a = ?1 THEN b ELSE a END AS f FROM friendships WHERE status = 'accepted' AND (a = ?1 OR b = ?1)`)
      .bind(row.target_uid)
      .all<{ f: string }>();
    for (const f of friends.results) tell(env, ctx, f.f, 'ransom', `🆘 ${handle(names.get(row.target_uid))} has been kidnapped! Ransom: ${naira(row.ransom)}. Open Fixer → Ransoms to chip in.`, { contract: row.id });
    await postFeed(db, row.target_uid, 'vice', '🚨', `${handle(names.get(row.target_uid))} has been KIDNAPPED. The ransom is ${naira(row.ransom)}. Friends and family, check your phones! 🙏🏾`);
    return json({ result: 'held', pay, balance: await getBalance(db, me) });
  }

  if (path === '/api/vice/seizures/ack') {
    if (Number.isSafeInteger(b.id)) await db.prepare('UPDATE seizures SET applied = 1 WHERE id = ? AND uid = ?').bind(b.id, me).run();
    return json({ ok: true });
  }

  // A random snatch on the road: no contract, the NPC gangs just pick someone. Rare, rolled on the server only.
  if (path === '/api/vice/ambush') {
    const p = await playerRow(db, me);
    if ((p?.jailed_until ?? 0) > now || (p?.held_until ?? 0) > now) return json({ result: 'none' });
    if (await holdsOffice(db, me)) return json({ result: 'none' });
    // One roll per gap, and a long rest after one lands, whatever the client says.
    if (p?.ambush_at && now - p.ambush_at < AMBUSH.everyMs * 0.9) return json({ result: 'none' });
    await db.prepare('UPDATE players SET ambush_at = ? WHERE uid = ?').bind(now, me).run();
    if (p?.ambush_hit_at && now - p.ambush_hit_at < AMBUSH.cooldownMs) return json({ result: 'none' });
    const at = await whereIs(env, me);
    if (!at?.area.startsWith('city:')) return json({ result: 'none' });
    const driving = b.mode === 'drive';
    let chance = driving ? AMBUSH.driveChance : AMBUSH.walkChance;
    if ((await loadProtection(db, me)).bodyguard) chance *= AMBUSH.bodyguardCut;
    if (rand() >= chance) return json({ result: 'none' });

    // The price on your head: your status, your wallet, and the car you were driving.
    const balance = Math.max(0, await getBalance(db, me));
    const wallet = await db.prepare('SELECT origin FROM wallets WHERE uid = ?').bind(me).first<{ origin: string | null }>();
    const range = AMBUSH.ransomRange[normalizeOrigin(wallet?.origin)];
    const carId = typeof b.carId === 'string' && b.driving !== false && (await ownedCounts(db, me)).get(b.carId) ? b.carId : null;
    const carPrice = carId && CAR_BY_ID[carId] ? CAR_BY_ID[carId].price : 0;
    const raw = balance * AMBUSH.ransomShare + carPrice * AMBUSH.carShare;
    // Origin sets the floor (and the usual ceiling), but a fat wallet lifts the ceiling: the richer you are, the more they ask.
    const ceiling = Math.max(range.max, balance * AMBUSH.ransomWealthCap);
    const ransom = Math.round(Math.min(ceiling, Math.max(range.min, raw)) / AMBUSH.ransomRound) * AMBUSH.ransomRound;
    const ends = now + CONTRACT.holdMs;
    const row = await db
      .prepare(`INSERT INTO contracts (kind, poster_uid, target_uid, reward, ransom, status, created_at, hold_ends, car_id) VALUES ('kidnap', 'npc', ?, 0, ?, 'ransom', ?, ?, ?) RETURNING id`)
      .bind(me, ransom, now, ends, driving ? carId : null)
      .first<{ id: number }>();
    if (!row) return json({ result: 'none' });
    await db.batch([
      db.prepare('UPDATE players SET held_until = ?, ambush_hit_at = ? WHERE uid = ?').bind(ends, now, me),
    ]);
    const names = await usernames(db, [me]);
    const how = driving ? 'Gunmen blocked the road and dragged you out of your ride' : 'A van pulled up beside you, a bag went over your head';
    tell(env, ctx, me, 'held', `🚨 ${how}. You've been KIDNAPPED. They want ${naira(ransom)}. Beg your friends!`, { until: ends, contract: row.id, ransom });
    const friends = await db
      .prepare(`SELECT CASE WHEN a = ?1 THEN b ELSE a END AS f FROM friendships WHERE status = 'accepted' AND (a = ?1 OR b = ?1)`)
      .bind(me)
      .all<{ f: string }>();
    for (const f of friends.results) tell(env, ctx, f.f, 'ransom', `🆘 ${handle(names.get(me))} has been kidnapped! Ransom: ${naira(ransom)}. Open Fixer → Ransoms to chip in.`, { contract: row.id });
    await postFeed(db, me, 'vice', '🚨', `${handle(names.get(me))} has been KIDNAPPED on the road. The ransom is ${naira(ransom)}. Friends and family, check your phones! 🙏🏾`);
    return json({ result: 'held', ransom, until: ends });
  }

  if (path === '/api/vice/contract/pledge') {
    const id = int(b.id, 1, 1e12), amount = int(b.amount, 500, MAX_RANSOM_PLEDGE);
    if (!id || !amount) return err(400, 'How much?');
    const row = await db.prepare(`SELECT * FROM contracts WHERE id = ? AND status = 'ransom' AND hold_ends > ?`).bind(id, now).first<ContractRow>();
    if (!row) return err(404, 'That ransom is over');
    // Atomically read pledged total and compute what to give — re-read inside the transfer window to close the race.
    const have = await pledgedOf(db, row.id);
    const give = Math.min(amount, row.ransom - have);
    if (give <= 0) return err(409, 'The ransom is already met');
    const paid = await transfer(db, me, null, give, 'ransom_out', '', `ransom:${row.id}:${me}:${now}`);
    if (paid <= 0) return err(402, 'You don\'t have that');
    await db.prepare(`INSERT INTO ransom_pledges (contract_id, uid, amount) VALUES (?1, ?2, ?3) ON CONFLICT(contract_id, uid) DO UPDATE SET amount = amount + ?3`).bind(row.id, me, paid).run();
    // Atomic completion: only one concurrent request can flip status, using the DB total — not a stale JS variable.
    const done = await db.prepare(
      `UPDATE contracts SET status = 'done' WHERE id = ? AND status = 'ransom' AND (SELECT COALESCE(SUM(amount), 0) FROM ransom_pledges WHERE contract_id = ?) >= ransom`
    ).bind(row.id, row.id).run();
    const names = await usernames(db, [me, row.target_uid]);
    if (done.meta.changes) {
      await db.prepare('DELETE FROM ransom_pledges WHERE contract_id = ?').bind(row.id).run();
      await freeVictim(db, row.target_uid);
      if (row.taker_uid) {
        await credit(db, row.taker_uid, `ransom-pay:${row.id}`, 'ransom', String(row.id), row.ransom);
        tell(env, ctx, row.taker_uid, 'contract', `💰 The ransom was paid: ${naira(row.ransom)}. You let the hostage go.`);
      }
      tell(env, ctx, row.target_uid, 'released', '🕊️ The ransom was paid. You are free!');
      await postFeed(db, row.target_uid, 'vice', '🕊️', `${handle(names.get(row.target_uid))} is FREE. Friends and family pooled ${naira(row.ransom)}. Love dey. ❤️`);
      return json({ result: 'paid', balance: await getBalance(db, me) });
    }
    const total = await pledgedOf(db, row.id);
    tell(env, ctx, row.target_uid, 'ransom', `🙏🏾 ${handle(names.get(me))} chipped in ${naira(paid)}. ${naira(total)} of ${naira(row.ransom)}.`);
    return json({ result: 'pledged', pledged: total, balance: await getBalance(db, me) });
  }

  if (path === '/api/vice/contract/struggle') {
    const p = await playerRow(db, me);
    if (!p?.held_until || p.held_until <= now) return err(409, 'You are not being held');
    const row = await db.prepare(`SELECT * FROM contracts WHERE target_uid = ? AND status = 'ransom' ORDER BY id DESC LIMIT 1`).bind(me).first<ContractRow & { }>();
    if (!row) return err(409, 'You are not being held');
    // dui_at doubles as "last struggle" while held: a kidnapped player can\'t be driving.
    if (p.dui_at && now - p.dui_at < CONTRACT.struggleEveryMs) return err(429, 'You\'re still tired from the last try');
    await db.prepare('UPDATE players SET dui_at = ? WHERE uid = ?').bind(now, me).run();
    if (rand() >= CONTRACT.struggleChance) return json({ result: 'failed' });
    const done = await db.prepare(`UPDATE contracts SET status = 'expired' WHERE id = ? AND status = 'ransom'`).bind(row.id).run();
    if (done.meta.changes) {
      await refundPledges(db, row.id);
      await freeVictim(db, me);
      if (row.taker_uid) tell(env, ctx, row.taker_uid, 'contract', '😤 Your hostage escaped!');
    }
    return json({ result: 'escaped' });
  }

  if (path === '/api/vice/contract/rescue') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`SELECT * FROM contracts WHERE id = ? AND status = 'ransom'`).bind(id).first<ContractRow>() : null;
    if (!row || !row.taker_uid) return err(404, 'That hostage is already free');
    if (!(await isOfficer(db, me))) return err(403, 'Only police officers can raid a kidnapper\'s den');
    const near = await closeTo(env, me, row.taker_uid, CONTRACT.reach * 2);
    if (near) return err(409, near.replace('They are', 'The kidnapper is'));
    const laws = await loadLaws(db);
    const names = await usernames(db, [me, row.taker_uid, row.target_uid]);
    if (rand() >= 0.8) return json({ result: 'failed' });
    const done = await db.prepare(`UPDATE contracts SET status = 'rescued' WHERE id = ? AND status = 'ransom'`).bind(row.id).run();
    if (!done.meta.changes) return err(409, 'Somebody else got there first');
    await refundPledges(db, row.id);
    await freeVictim(db, row.target_uid);
    await credit(db, me, `rescue-bonus:${row.id}`, 'bounty', String(row.id), CONTRACT.rescueBonus);
    tell(env, ctx, row.target_uid, 'released', `🚔 Officer ${handle(names.get(me))} rescued you! The kidnappers are in handcuffs.`);
    await bust(env, ctx, row.taker_uid, 'police', laws.jailMinutes * 2, 60_000, `Kidnapping · holding ${handle(names.get(row.target_uid))} for ransom`, `Officer ${handle(names.get(me))} raided your hideout`,
      `Officer ${handle(names.get(me))} RESCUED ${handle(names.get(row.target_uid))} from kidnappers and arrested ${handle(names.get(row.taker_uid))}. Hero of the day. 🦸🏾🚔`);
    return json({ result: 'rescued', bonus: CONTRACT.rescueBonus, balance: await getBalance(db, me) });
  }

  /* ----- Dirty work ----- */

  if (path === '/api/vice/op/start') {
    const kind = b.kind;
    if (!isOp(kind)) return err(400, 'Unknown job');
    const def = OP_BY_ID[kind];
    if (def.event && activeEvent(now) !== def.event) return err(409, 'This only pays during a fuel scarcity');
    if (await db.prepare('SELECT 1 AS x FROM ops WHERE uid = ? AND kind = ?').bind(me, kind).first()) return err(409, 'You\'re already running that');
    const paid = await transfer(db, me, null, def.cost, 'op_cost', '', `op:${me}:${kind}:${now}`);
    if (paid < def.cost) {
      if (paid > 0) await credit(db, me, `op-short:${me}:${now}`, 'vice_refund', kind, paid);
      return err(402, `Setting up costs ${naira(def.cost)}`);
    }
    await db.prepare('INSERT INTO ops (uid, kind, started_at, ready_at) VALUES (?, ?, ?, ?)').bind(me, kind, now, now + def.mins * 60_000).run();
    return json({ ok: true, balance: await getBalance(db, me) });
  }

  if (path === '/api/vice/op/collect') {
    const kind = b.kind;
    if (!isOp(kind)) return err(400, 'Unknown job');
    const row = await db.prepare('SELECT started_at, ready_at FROM ops WHERE uid = ? AND kind = ?').bind(me, kind).first<{ started_at: number; ready_at: number }>();
    if (!row) return err(404, 'You\'re not running that');
    if (row.ready_at > now) return err(409, 'Not ready yet');
    // Claim this collection by moving the clock on, so a double tap can\'t pay twice.
    const claimed = await db
      .prepare('UPDATE ops SET ready_at = ? WHERE uid = ? AND kind = ? AND ready_at = ? RETURNING kind')
      .bind(now + OP_BY_ID[kind].mins * 60_000, me, kind, row.ready_at)
      .first();
    if (!claimed) return err(409, 'Already collected');
    const result = await collectOp(env, ctx, me, OP_BY_ID[kind], row, now);
    return json({ ...result, balance: await getBalance(db, me) });
  }

  /* ----- Jail hustles ----- */

  if (path === '/api/vice/cell/bribe') {
    const p = await playerRow(db, me);
    if (!p?.jailed_until || p.jailed_until <= now) return err(409, 'You are not in a cell');
    const left = p.jailed_until - now;
    const cost = Math.max(CELL.bribeMin, Math.round((left / 60_000) * CELL.bribePerMin));
    const paid = await transfer(db, me, null, cost, 'bribe', '', `guard:${me}:${now}`);
    if (paid < cost) {
      if (paid > 0) await credit(db, me, `guard-short:${me}:${now}`, 'vice_refund', 'guard', paid);
      return err(402, `The guard wants ${naira(cost)}`);
    }
    if (rand() < CELL.snitchChance) {
      const fine = await transfer(db, me, null, CELL.snitchFine, 'fine', '', `snitch:${me}:${now}`);
      await db.prepare('UPDATE players SET jailed_until = jailed_until + ? WHERE uid = ?').bind(Math.round(left * CELL.snitchExtraPct), me).run();
      return json({ result: 'snitched', fine, balance: await getBalance(db, me), jailedUntil: (await playerRow(db, me))?.jailed_until });
    }
    await db.prepare('UPDATE players SET jailed_until = jailed_until - ? WHERE uid = ?').bind(Math.round(left * CELL.cutPct), me).run();
    return json({ result: 'cut', balance: await getBalance(db, me), jailedUntil: (await playerRow(db, me))?.jailed_until });
  }

  if (path === '/api/vice/cell/sell') {
    const p = await playerRow(db, me);
    if (!p?.jailed_until || p.jailed_until <= now) return err(409, 'You are not in a cell');
    const good = b.good, qty = int(b.qty, 1, PLUG.stashCap);
    if (!isGood(good) || !qty) return err(400, 'Pick something and how many');
    if (!(await takeStash(db, me, good, qty))) return err(409, 'You don\'t have that many');
    if (rand() < CELL.guardCatch) {
      await db.prepare('UPDATE players SET jailed_until = jailed_until + ? WHERE uid = ?').bind(Math.round((p.jailed_until - now) * 0.3), me).run();
      return json({ result: 'caught', balance: await getBalance(db, me), jailedUntil: (await playerRow(db, me))?.jailed_until });
    }
    const earn = Math.round(streetPrice(good, now) * CELL.insideMarkup) * qty;
    await Promise.all([credit(db, me, `cell-sale:${me}:${now}`, 'vice_sale', good, earn), bumpVice(db, me, qty).run()]);
    return json({ result: 'sold', earned: earn, balance: await getBalance(db, me), stash: await stashOf(db, me) });
  }

  if (path === '/api/vice/breakout/post') {
    const p = await playerRow(db, me);
    if (!p?.jailed_until || p.jailed_until <= now) return err(409, 'You are not in a cell');
    const price = int(b.price, CELL.breakoutMin, CELL.breakoutMax);
    if (!price) return err(400, `Offer between ${naira(CELL.breakoutMin)} and ${naira(CELL.breakoutMax)}`);
    if (await db.prepare(`SELECT id FROM breakouts WHERE inmate_uid = ? AND status = 'open'`).bind(me).first()) return err(409, 'You already have a plan out');
    await db.prepare(`INSERT INTO breakouts (inmate_uid, price, status, created_at) VALUES (?, ?, 'open', ?)`).bind(me, price, now).run();
    return json({ ok: true });
  }

  if (path === '/api/vice/breakout/cancel') {
    const id = int(b.id, 1, 1e12);
    if (!id) return err(400, 'Which plan?');
    await db.prepare(`UPDATE breakouts SET status = 'cancelled' WHERE id = ? AND inmate_uid = ? AND status = 'open'`).bind(id, me).run();
    return json({ ok: true });
  }

  if (path === '/api/vice/breakout/assist') {
    const id = int(b.id, 1, 1e12);
    const row = id ? await db.prepare(`SELECT * FROM breakouts WHERE id = ? AND status = 'open'`).bind(id).first<{ id: number; inmate_uid: string; price: number }>() : null;
    if (!row) return err(404, 'That plan is gone');
    if (row.inmate_uid === me) return err(400, 'You can\'t break yourself out');
    const inmate = await playerRow(db, row.inmate_uid);
    if (!inmate?.jailed_until || inmate.jailed_until <= now) {
      await db.prepare(`UPDATE breakouts SET status = 'cancelled' WHERE id = ?`).bind(row.id).run();
      return err(409, 'They are already out');
    }
    const cost = await transfer(db, me, null, CELL.helperCost, 'op_cost', '', `breakout-kit:${me}:${now}`);
    if (cost < CELL.helperCost) {
      if (cost > 0) await credit(db, me, `breakout-short:${me}:${now}`, 'vice_refund', 'breakout', cost);
      return err(402, `Tools and a getaway car cost ${naira(CELL.helperCost)}`);
    }
    const claimed = await db.prepare(`UPDATE breakouts SET status = 'done', helper_uid = ? WHERE id = ? AND status = 'open'`).bind(me, row.id).run();
    if (!claimed.meta.changes) return err(409, 'Somebody else got there first');
    const names = await usernames(db, [me, row.inmate_uid]);
    const laws = await loadLaws(db);
    if (rand() < CELL.breakoutChance) {
      await db.prepare('UPDATE players SET jailed_until = NULL WHERE uid = ?').bind(row.inmate_uid).run();
      const paid = await transfer(db, row.inmate_uid, me, row.price, 'breakout_out', 'breakout', `breakout:${row.id}`);
      await Promise.all([bumpVice(db, me, 3).run(), bumpVice(db, row.inmate_uid, 1).run()]);
      notify(env, ctx, row.inmate_uid, { t: 'released', by: names.get(me) ?? 'a friend', amount: 0 });
      tell(env, ctx, row.inmate_uid, 'breakout', `🏃🏾 ${handle(names.get(me))} broke you out! You paid ${naira(paid)}. Keep your head down.`);
      await postFeed(db, me, 'underworld', '🔓', `JAILBREAK! ${handle(names.get(row.inmate_uid))} walked out of prison with a little help from ${handle(names.get(me))}. Somebody is going to lose a job. 🏃🏾`);
      return json({ result: 'freed', paid, balance: await getBalance(db, me) });
    }
    await db.prepare(`UPDATE breakouts SET status = 'failed' WHERE id = ?`).bind(row.id).run();
    await bust(env, ctx, me, 'police', laws.jailMinutes * CELL.helperJailFactor, 25_000, `Aiding a jailbreak · trying to spring ${handle(names.get(row.inmate_uid))}`, 'You got caught trying to break someone out',
      `${handle(names.get(me))} was caught trying to spring ${handle(names.get(row.inmate_uid))} from prison. Now they are cellmates. 😂`);
    return json({ result: 'caught' });
  }

  return err(404, 'Not found');
}
