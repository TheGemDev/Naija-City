// Player rentals (House app → For rent). An owner lists a finished house at a weekly price; another
// player rents it and lives there (they walk in like an invited guest, src/net/rentals.ts). Rent moves
// straight from the tenant's wallet to the owner's, a week up front, and is charged lazily the next
// time anyone looks after the week runs out. A tenant who can't pay is evicted.

import type { FirebaseUser } from './auth';
import { handle, naira } from './feed';
import { getBalance } from './wallet';
import { transfer, usernames } from './crime';
import { houseOf } from './social';
import { sendPush } from './push';
import { CONTRACTORS, DESIGN_BY_ID, PLAYER_RENT, REGION_BY_ID, STAGES, costOf, landPrice, remainingStageMaterials, stageLabour, weeklyRentOf, type RentalListing } from '../src/game/property';
import { propertyBooks } from './progress';
import { followHost, notifyPlayer, roomOf } from './shards';


const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const body = async <T>(req: Request) => (await req.json().catch(() => null)) as T | null;

interface RentalRow {
  property_id: string; owner_uid: string; region: string; design: string; weekly: number; listed_at: number;
  tenant_uid: string | null; rented_at: number | null; paid_through: number | null;
}

type SaveProperty = { id?: string; region?: string; design?: string | null; stage?: number; rented?: boolean };


function tell(env: Env, ctx: ExecutionContext, uid: string, title: string, text: string) {
  ctx.waitUntil(notifyPlayer(env, uid, { t: 'rental', text }));
  sendPush(env, ctx, uid, { title, body: text, tag: 'rental', category: 'money' });
}

/** The least a finished house of this design can have cost here: the smallest plot, every material, the cheapest builder. */
function leastCost(design: string, region: string) {
  const d = DESIGN_BY_ID[design];
  const r = REGION_BY_ID[region];
  const labour = Math.min(...CONTRACTORS.map((c) => STAGES.reduce((a, stage) => a + stageLabour(d, stage, c, r.id), 0)));
  return landPrice(r, 'half') + costOf(remainingStageMaterials(d), r.id, d.id) + labour;
}
/** Share of leastCost the ledger must show was paid (prices have moved since older houses went up). */
const PAID_SHARE = 0.5;

/**
 * The owner's finished house as it stands in their save now, or why it can't be rented.
 * With `paidFor`, the ledger must also show the house was paid for: the save alone is only the owner's word. Asked
 * where it counts (listing a house, and taking a tenant's money), not for every row of the market.
 */
async function ownedHouse(db: D1Database, owner: string, propertyId: string, paidFor = false): Promise<SaveProperty | string> {
  const row = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(owner).first<{ data: string }>();
  if (!row) return 'That house is no longer available';
  let save: { properties?: SaveProperty[]; homePropertyId?: string | null };
  try {
    save = JSON.parse(row.data);
  } catch {
    return 'That house is no longer available';
  }
  const p = save.properties?.find((x) => x?.id === propertyId);
  if (!p || (p.stage ?? 0) < STAGES.length || !p.design || !DESIGN_BY_ID[p.design] || !p.region || !REGION_BY_ID[p.region]) {
    return 'That house is no longer available';
  }
  if (save.homePropertyId === propertyId) return 'The owner lives in that house';
  if (p.rented) return 'That house is already let to NPC tenants';
  if (paidFor) {
    const book = (await propertyBooks(db, owner)).get(propertyId);
    if (!book || book.sold || book.spent < leastCost(p.design, p.region) * PAID_SHARE) return 'That house is no longer available';
  }
  return p;
}

/** Give back the unused part of the week (owner → tenant) and end the lease. */
async function endLease(db: D1Database, r: RentalRow, refund: boolean) {
  const now = Date.now();
  if (refund && r.tenant_uid && r.paid_through && r.paid_through > now) {
    const back = Math.floor((r.weekly * (r.paid_through - now)) / PLAYER_RENT.weekMs);
    if (back > 0) await transfer(db, r.owner_uid, r.tenant_uid, back, 'rent_refund_out', 'rent_refund', `lease-refund:${r.property_id}`);
  }
  await db.prepare('UPDATE rentals SET tenant_uid = NULL, rented_at = NULL, paid_through = NULL WHERE property_id = ? AND tenant_uid IS ?')
    .bind(r.property_id, r.tenant_uid).run();
}

/** Charge every lease whose week has run out; evict tenants who can't pay. */
export async function settle(env: Env, ctx: ExecutionContext) {
  const db = env.DB;
  const now = Date.now();
  const { results } = await db
    .prepare('SELECT * FROM rentals WHERE tenant_uid IS NOT NULL AND paid_through <= ? LIMIT 25')
    .bind(now)
    .all<RentalRow>();
  for (const r of results) {
    let paidThrough = r.paid_through!;
    while (paidThrough <= now) {
      // Claim the week first so two requests can't both charge it.
      const claimed = await db
        .prepare('UPDATE rentals SET paid_through = ?3 WHERE property_id = ?1 AND paid_through = ?2 AND tenant_uid = ?4')
        .bind(r.property_id, paidThrough, paidThrough + PLAYER_RENT.weekMs, r.tenant_uid)
        .run();
      if (!claimed.meta.changes) break;
      const paid = (await getBalance(db, r.tenant_uid!)) >= r.weekly
        ? await transfer(db, r.tenant_uid!, r.owner_uid, r.weekly, 'rent_out', 'rent_in', `lease:${r.property_id}`)
        : 0;
      if (paid < r.weekly) {
        if (paid > 0) await transfer(db, r.owner_uid, r.tenant_uid!, paid, 'rent_refund_out', 'rent_refund', `lease-refund:${r.property_id}`);
        await endLease(db, { ...r, paid_through: null }, false);
        ctx.waitUntil((await roomOf(env, r.tenant_uid!)).revokeHomeVisit(r.tenant_uid!).catch(() => {}));
        const names = await usernames(db, [r.owner_uid, r.tenant_uid]);
        tell(env, ctx, r.tenant_uid!, '🔑 Evicted', `You couldn't pay ${naira(r.weekly)} rent, so ${handle(names.get(r.owner_uid))} put you out. Your things are safe; find a new place in the House app.`);
        tell(env, ctx, r.owner_uid, '🔑 Tenant evicted', `${handle(names.get(r.tenant_uid!))} couldn't pay rent and has left your house. It's back on the market.`);
        break;
      }
      paidThrough += PLAYER_RENT.weekMs;
    }
  }
}

async function toListings(db: D1Database, rows: RentalRow[]): Promise<RentalListing[]> {
  const names = await usernames(db, rows.flatMap((r) => [r.owner_uid, r.tenant_uid]));
  return rows.map((r) => ({
    propertyId: r.property_id, ownerUid: r.owner_uid, owner: names.get(r.owner_uid) ?? 'someone', design: r.design, region: r.region,
    weekly: r.weekly, tenant: r.tenant_uid ? names.get(r.tenant_uid) ?? 'someone' : null, paidThrough: r.paid_through,
  }));
}

export async function handleRentals(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/rentals')) return null;
  const db = env.DB;
  const me = user.uid;
  const post = req.method === 'POST';

  if (path === '/api/rentals' && req.method === 'GET') {
    await settle(env, ctx);
    const { results: open } = await db
      .prepare('SELECT * FROM rentals WHERE tenant_uid IS NULL AND owner_uid != ? ORDER BY weekly ASC LIMIT 40')
      .bind(me)
      .all<RentalRow>();
    // Drop listings whose house was sold, seized or moved into since.
    const live: RentalRow[] = [];
    for (const r of open) {
      if (typeof (await ownedHouse(db, r.owner_uid, r.property_id)) === 'string') {
        await db.prepare('DELETE FROM rentals WHERE property_id = ? AND tenant_uid IS NULL').bind(r.property_id).run();
      } else live.push(r);
    }
    const { results: mine } = await db.prepare('SELECT * FROM rentals WHERE owner_uid = ?').bind(me).all<RentalRow>();
    const lease = await db.prepare('SELECT * FROM rentals WHERE tenant_uid = ?').bind(me).first<RentalRow>();
    return json({
      listings: await toListings(db, live),
      mine: await toListings(db, mine),
      lease: lease ? (await toListings(db, [lease]))[0] : null,
    });
  }

  /** List one of my finished houses (or change its price while it's empty). */
  if (path === '/api/rentals/list' && post) {
    const b = await body<{ propertyId?: string; weekly?: number }>(req);
    if (!b || typeof b.propertyId !== 'string' || b.propertyId.length > 128) return err(400, 'Choose a house');
    const house = await ownedHouse(db, me, b.propertyId, true);
    if (typeof house === 'string') return err(409, house);
    const base = weeklyRentOf(house.design!, house.region!);
    const min = Math.round(base * PLAYER_RENT.minFactor);
    const max = Math.round(base * PLAYER_RENT.maxFactor);
    const weekly = b.weekly;
    if (typeof weekly !== 'number' || !Number.isInteger(weekly) || weekly < min || weekly > max) {
      return err(400, `Set the rent between ${naira(min)} and ${naira(max)} a week`);
    }
    const existing = await db.prepare('SELECT * FROM rentals WHERE property_id = ?').bind(b.propertyId).first<RentalRow>();
    if (existing && existing.owner_uid !== me) return err(409, 'That house is already listed');
    if (existing?.tenant_uid) return err(409, 'You can’t change the rent while someone lives there');
    await db
      .prepare(
        `INSERT INTO rentals (property_id, owner_uid, region, design, weekly, listed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(property_id) DO UPDATE SET weekly = ?5, region = ?3, design = ?4 WHERE tenant_uid IS NULL`,
      )
      .bind(b.propertyId, me, house.region, house.design, weekly, Date.now())
      .run();
    return json({ ok: true });
  }

  /** Take my house off the market. If someone lives there they're put out with the unused rent back. */
  if (path === '/api/rentals/unlist' && post) {
    const b = await body<{ propertyId?: string }>(req);
    const r = b?.propertyId
      ? await db.prepare('SELECT * FROM rentals WHERE property_id = ? AND owner_uid = ?').bind(b.propertyId, me).first<RentalRow>()
      : null;
    if (!r) return err(404, 'That house is not listed');
    if (r.tenant_uid) {
      await endLease(db, r, true);
      ctx.waitUntil((await roomOf(env, r.tenant_uid)).revokeHomeVisit(r.tenant_uid).catch(() => {}));
      const names = await usernames(db, [me]);
      tell(env, ctx, r.tenant_uid, '🔑 Lease ended', `${handle(names.get(me))} took their house back. The unused rent has been refunded.`);
    }
    await db.prepare('DELETE FROM rentals WHERE property_id = ? AND owner_uid = ?').bind(r.property_id, me).run();
    return json({ ok: true });
  }

  /** Rent a listed house: the first week is paid up front, straight to the owner. */
  if (path === '/api/rentals/rent' && post) {
    const b = await body<{ propertyId?: string }>(req);
    const r = b?.propertyId ? await db.prepare('SELECT * FROM rentals WHERE property_id = ?').bind(b.propertyId).first<RentalRow>() : null;
    if (!r) return err(404, 'That house is no longer for rent');
    if (r.owner_uid === me) return err(400, 'That’s your own house');
    if (r.tenant_uid) return err(409, 'Someone just rented it');
    if (await db.prepare('SELECT 1 AS x FROM rentals WHERE tenant_uid = ?').bind(me).first()) return err(409, 'You already rent a house. Leave it first');
    const house = await ownedHouse(db, r.owner_uid, r.property_id, true);
    if (typeof house === 'string') {
      await db.prepare('DELETE FROM rentals WHERE property_id = ? AND tenant_uid IS NULL').bind(r.property_id).run();
      return err(409, house);
    }
    if ((await getBalance(db, me)) < r.weekly) return err(402, `The first week’s rent is ${naira(r.weekly)}`);
    const now = Date.now();
    const taken = await db
      .prepare('UPDATE rentals SET tenant_uid = ?2, rented_at = ?3, paid_through = ?4 WHERE property_id = ?1 AND tenant_uid IS NULL')
      .bind(r.property_id, me, now, now + PLAYER_RENT.weekMs)
      .run()
      .catch(() => null);
    if (!taken?.meta.changes) return err(409, 'Someone just rented it');
    const paid = await transfer(db, me, r.owner_uid, r.weekly, 'rent_out', 'rent_in', `lease:${r.property_id}`);
    if (paid < r.weekly) {
      if (paid > 0) await transfer(db, r.owner_uid, me, paid, 'rent_refund_out', 'rent_refund', `lease-refund:${r.property_id}`);
      await endLease(db, { ...r, tenant_uid: me }, false);
      return err(402, `The first week’s rent is ${naira(r.weekly)}`);
    }
    const names = await usernames(db, [me]);
    tell(env, ctx, r.owner_uid, '🔑 New tenant', `${handle(names.get(me))} rented your ${DESIGN_BY_ID[r.design]?.name ?? 'house'} in ${REGION_BY_ID[r.region]?.name ?? 'Kaduna'}. ${naira(r.weekly)} is in your account.`);
    const lease = (await toListings(db, [{ ...r, tenant_uid: me, rented_at: now, paid_through: now + PLAYER_RENT.weekMs }]))[0];
    return json({ lease, balance: await getBalance(db, me) });
  }

  /** Move out. Rent already paid isn't refunded. */
  if (path === '/api/rentals/leave' && post) {
    const r = await db.prepare('SELECT * FROM rentals WHERE tenant_uid = ?').bind(me).first<RentalRow>();
    if (!r) return err(404, 'You are not renting anywhere');
    await endLease(db, r, false);
    await (await roomOf(env, me)).revokeHomeVisit(me).catch(() => {});
    const names = await usernames(db, [me]);
    tell(env, ctx, r.owner_uid, '🔑 Tenant moved out', `${handle(names.get(me))} moved out of your house. It's back on the market.`);
    return json({ ok: true });
  }

  /** Go home to the house I rent. */
  if (path === '/api/rentals/enter' && post) {
    const r = await db.prepare('SELECT * FROM rentals WHERE tenant_uid = ?').bind(me).first<RentalRow>();
    if (!r) return err(404, 'You are not renting anywhere');
    if ((r.paid_through ?? 0) <= Date.now()) {
      await settle(env, ctx);
      if (!(await db.prepare('SELECT 1 AS x FROM rentals WHERE tenant_uid = ?').bind(me).first())) return err(402, 'You were evicted for unpaid rent');
    }
    const loaded = await houseOf(db, r.owner_uid, r.property_id);
    if ('error' in loaded) return err(loaded.status, loaded.error);
    await followHost(env, me, r.owner_uid);
    await (await roomOf(env, me)).allowHomeVisit(me, r.owner_uid, 'invited', r.property_id);
    return json({ home: loaded.home });
  }

  return err(404, 'Not found');
}
