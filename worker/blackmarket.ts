// Black Market app: fence furniture you stole in a burglary (rules in src/game/blackmarket.ts).
//
// Only items you actually stole (a successful burglary that wasn't recovered) can be listed, one listing
// per stolen piece. Listing costs a fee and takes the item off you (ledger 'stolen', so the save check
// drops it); buying moves the money to the seller as fence income (the EFCC counts it as illicit) and
// gives the buyer the item (ledger 'stolen_in': they're handling stolen goods). Cancelling hands it back.

import { notifyPlayer } from './shards';
import type { FirebaseUser } from './auth';
import { handle, naira, postFeed } from './feed';
import { applyStmts, ensureWallet, getBalance } from './wallet';
import { ownedCounts } from './progress';
import { transfer, usernames } from './crime';
import { ITEMS } from '../src/game/catalog';
import { blackMarketFee, blackMarketPrice, type BlackMarketListing } from '../src/game/blackmarket';


const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const body = async <T>(req: Request) => (await req.json().catch(() => null)) as T | null;

interface Row {
  id: number; seller_uid: string; item: string; price: number; fee: number; status: BlackMarketListing['status'];
  buyer_uid: string | null; listed_at: number; sold_at: number | null;
}

/** A furniture ledger line with no money attached: moves one item in or out of a player's ownership. */
const itemMove = (db: D1Database, uid: string, kind: 'stolen' | 'stolen_in', type: string, clientId: string) =>
  db
    .prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) VALUES (?1, ?2, ?3, ?4, 0, 1, ?5) ON CONFLICT(uid, client_id) DO NOTHING`)
    .bind(uid, clientId, kind, type, Date.now());

/**
 * How many of each item type I stole and haven't already put on the black market. Only burglaries where
 * the thief kept the item count (held = 1); older break-ins sold it for cash on the spot.
 */
async function sellable(db: D1Database, me: string): Promise<Record<string, number>> {
  const [stolen, listed, owned] = await Promise.all([
    db.prepare(`SELECT item, COUNT(*) AS n FROM crimes WHERE thief_uid = ? AND kind = 'burglary' AND success = 1 AND item IS NOT NULL AND held = 1 AND COALESCE(recovered, 0) = 0 GROUP BY item`)
      .bind(me).all<{ item: string; n: number }>(),
    db.prepare(`SELECT item, COUNT(*) AS n FROM black_market WHERE seller_uid = ? AND status != 'cancelled' GROUP BY item`)
      .bind(me).all<{ item: string; n: number }>(),
    ownedCounts(db, me),
  ]);
  const out: Record<string, number> = {};
  const used = new Map(listed.results.map((r) => [r.item, r.n]));
  for (const r of stolen.results) {
    if (!ITEMS[r.item]) continue;
    const n = Math.min(r.n - (used.get(r.item) ?? 0), owned.get(r.item) ?? 0);
    if (n > 0) out[r.item] = n;
  }
  return out;
}

async function toListings(db: D1Database, rows: Row[]): Promise<BlackMarketListing[]> {
  const names = await usernames(db, rows.flatMap((r) => [r.seller_uid, r.buyer_uid]));
  return rows.map((r) => ({
    id: r.id, item: r.item, price: r.price, seller: names.get(r.seller_uid) ?? 'someone', sellerUid: r.seller_uid,
    status: r.status, buyer: r.buyer_uid ? names.get(r.buyer_uid) ?? 'someone' : null, at: r.listed_at,
  }));
}

export async function handleBlackMarket(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/blackmarket')) return null;
  const db = env.DB;
  const me = user.uid;
  const post = req.method === 'POST';

  if (path === '/api/blackmarket' && req.method === 'GET') {
    const [open, mine, canSell, history] = await Promise.all([
      db.prepare(`SELECT * FROM black_market WHERE status = 'listed' ORDER BY listed_at DESC LIMIT 60`).all<Row>(),
      db.prepare(`SELECT * FROM black_market WHERE seller_uid = ? ORDER BY listed_at DESC LIMIT 20`).bind(me).all<Row>(),
      sellable(db, me),
      // Everything I've ever taken in a burglary, so the app can say why something can't be listed.
      db.prepare(
        `SELECT c.id, c.item, c.held, COALESCE(c.recovered, 0) AS recovered, c.created_at AS at, v.username AS victim,
                EXISTS (SELECT 1 FROM black_market b WHERE b.seller_uid = c.thief_uid AND b.item = c.item AND b.status != 'cancelled') AS listed
         FROM crimes c LEFT JOIN players v ON v.uid = c.victim_uid
         WHERE c.thief_uid = ? AND c.kind = 'burglary' AND c.success = 1 AND c.item IS NOT NULL ORDER BY c.id DESC LIMIT 30`,
      ).bind(me).all<{ id: number; item: string; held: number; recovered: number; at: number; victim: string | null; listed: number }>(),
    ]);
    return json({
      listings: await toListings(db, open.results), mine: await toListings(db, mine.results), sellable: canSell,
      stolen: history.results.map((r) => ({
        id: r.id, item: r.item, at: r.at, victim: r.victim ?? 'someone',
        fate: !r.held ? 'fenced' : r.recovered ? 'recovered' : 'kept',
      })),
    });
  }

  /** Put one stolen item up for sale. The fee is paid now and isn't refunded. */
  if (path === '/api/blackmarket/list' && post) {
    const b = await body<{ item?: string }>(req);
    const type = b?.item;
    if (typeof type !== 'string' || !ITEMS[type] || ITEMS[type].fixed) return err(400, 'Choose a stolen item to sell');
    if (!((await sellable(db, me))[type] > 0)) return err(409, 'You don’t have a stolen one of those to sell');
    const fee = blackMarketFee(type);
    const price = blackMarketPrice(type);
    if ((await getBalance(db, me)) < fee) return err(402, `Listing costs ${naira(fee)}`);
    const now = Date.now();
    const made = await db
      .prepare(`INSERT INTO black_market (seller_uid, item, price, fee, status, listed_at) VALUES (?, ?, ?, ?, 'listed', ?) RETURNING *`)
      .bind(me, type, price, fee, now)
      .first<Row>();
    if (!made) return err(500, 'Could not list it');
    await db.batch([
      ensureWallet(db, me),
      ...applyStmts(db, me, `bm-fee:${made.id}`, 'spend', 'blackmarket_fee', -fee),
      itemMove(db, me, 'stolen', type, `bm-list:${made.id}`),
    ]);
    return json({ listing: (await toListings(db, [made]))[0], balance: await getBalance(db, me) });
  }

  /** Buy a listing: the money goes to the seller, the item into my storage. */
  if (path === '/api/blackmarket/buy' && post) {
    const b = await body<{ id?: number }>(req);
    const row = typeof b?.id === 'number' ? await db.prepare('SELECT * FROM black_market WHERE id = ?').bind(b.id).first<Row>() : null;
    if (!row || row.status !== 'listed') return err(404, 'Somebody already bought it');
    if (row.seller_uid === me) return err(400, 'That’s your own listing');
    if ((await getBalance(db, me)) < row.price) return err(402, `It costs ${naira(row.price)}`);
    const now = Date.now();
    const claimed = await db
      .prepare(`UPDATE black_market SET status = 'sold', buyer_uid = ?2, sold_at = ?3 WHERE id = ?1 AND status = 'listed'`)
      .bind(row.id, me, now)
      .run();
    if (!claimed.meta.changes) return err(409, 'Somebody already bought it');
    const paid = await transfer(db, me, row.seller_uid, row.price, 'blackmarket_buy', 'fence', `bm:${row.id}`);
    if (paid < row.price) {
      if (paid > 0) await transfer(db, row.seller_uid, me, paid, 'blackmarket_refund_out', 'blackmarket_refund', `bm-refund:${row.id}`);
      await db.prepare(`UPDATE black_market SET status = 'listed', buyer_uid = NULL, sold_at = NULL WHERE id = ?`).bind(row.id).run();
      return err(402, `It costs ${naira(row.price)}`);
    }
    await itemMove(db, me, 'stolen_in', row.item, `bm-buy:${row.id}`).run();
    const names = await usernames(db, [row.seller_uid]);
    const name = ITEMS[row.item]?.name ?? row.item;
    ctx.waitUntil(notifyPlayer(env, row.seller_uid, { t: 'blackmarket', text: `Your hot ${name} sold for ${naira(row.price)}. Money don land.` }));
    await postFeed(db, row.seller_uid, 'underworld', '🕶️', `${handle(names.get(row.seller_uid))} just moved a “slightly used” ${name} on the Black Market. Anybody missing a ${name}? 👀`);
    return json({ item: row.item, balance: await getBalance(db, me) });
  }

  /**
   * Report a house whose meter is bypassed (rules in src/game/meterBypass.ts). The server only checks the owner's
   * save really shows a bypass; the owner's game then sends the inspectors. Nothing happens if they're offline.
   */
  if (path === '/api/blackmarket/report-meter' && post) {
    const b = await body<{ uid?: string }>(req);
    if (typeof b?.uid !== 'string' || b.uid === me) return err(400, 'Pick another house');
    const row = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(b.uid).first<{ data: string }>();
    const level = row ? (JSON.parse(row.data) as { meter?: { level?: string } }).meter?.level : undefined;
    if (level !== 'tamper' && level !== 'bypass') return err(409, 'The meter looks fine now');
    const names = await usernames(db, [me]);
    ctx.waitUntil(notifyPlayer(env, b.uid, { t: 'meter-report', by: names.get(me) ?? 'someone' }));
    return json({ ok: true });
  }

  /** Take my listing down: the item comes back, the fee doesn't. */
  if (path === '/api/blackmarket/cancel' && post) {
    const b = await body<{ id?: number }>(req);
    const row = typeof b?.id === 'number'
      ? await db.prepare(`UPDATE black_market SET status = 'cancelled' WHERE id = ? AND seller_uid = ? AND status = 'listed' RETURNING *`).bind(b.id, me).first<Row>()
      : null;
    if (!row) return err(404, 'That listing is already gone');
    await itemMove(db, me, 'stolen_in', row.item, `bm-cancel:${row.id}`).run();
    return json({ item: row.item });
  }

  return err(404, 'Not found');
}
