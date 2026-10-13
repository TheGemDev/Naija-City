// Player ads bought with real money.
//
//   GET  /api/ads            → live ads for everyone + my own ads + plans
//   POST /api/ads            → create an ad (status 'awaiting_payment') for one billboard; body { board, plan, title, body, link? }
//   POST /api/ads/checkout   → start payment for one of my ads; body { id }
//   POST /api/ads/remove     → discard one of my unpaid ads; body { id }
//
// Payment: startPayment opens a Bachs checkout; the verified webhook (worker/shop.ts) calls `activateAd`.
// Pictures are uploaded first through POST /api/media; the ad stores that URL (checked to be the poster's own upload).
// ADS_TEST_ACTIVATE=1 (local dev only, in .dev.vars) skips payment and activates the ad on checkout.

import type { FirebaseUser } from './auth';
import { bachsReady, createBachsSession } from './bachs';
import { boardPrice, parseSea, SEA_PLANS, seaOverlap, validBoard } from '../src/game/boards';
import { AD_LIMITS, AD_PLAN_BY_ID, AD_PLANS, cleanImage, cleanLink, MAX_OPEN_ADS } from '../src/game/ads';

declare global {
  interface Env {
    ADS_TEST_ACTIVATE?: string;
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

interface AdRow {
  id: string; uid: string; board: string | null; plan_id: string; price: number; title: string; body: string; link: string | null; image: string | null; fill: number;
  status: 'awaiting_payment' | 'active' | 'removed'; created_at: number; ends_at: number | null;
}

/** An unpaid ad holds its board this long, so two people can't pay for the same one. */
const HOLD_MS = 30 * 60_000;

/** Who holds a board right now: a live ad, or someone else's unpaid ad still inside its hold. */
async function boardTaken(db: D1Database, board: string, exceptId: string | null): Promise<boolean> {
  const now = Date.now();
  const sea = parseSea(board);
  if (sea) {
    // A sea block is taken when any live or held sea block overlaps it.
    const { results } = await db
      .prepare(
        `SELECT board FROM ads WHERE board LIKE 'sea:%' AND id != ? AND ((status = 'active' AND ends_at > ?) OR (status = 'awaiting_payment' AND created_at > ?))`,
      )
      .bind(exceptId ?? '', now, now - HOLD_MS)
      .all<{ board: string }>();
    return results.some((o) => { const r = parseSea(o.board); return !!r && seaOverlap(sea, r); });
  }
  const r = await db
    .prepare(
      `SELECT 1 FROM ads WHERE board = ? AND id != ? AND ((status = 'active' AND ends_at > ?) OR (status = 'awaiting_payment' AND created_at > ?)) LIMIT 1`,
    )
    .bind(board, exceptId ?? '', now, now - HOLD_MS)
    .first();
  return !!r;
}

/** Flip a paid ad live, exactly once. Call from the payment webhook after the signature and amount check. */
export async function activateAd(db: D1Database, id: string, eventId: string | null = null): Promise<boolean> {
  const ad = await db.prepare('SELECT plan_id FROM ads WHERE id = ?').bind(id).first<{ plan_id: string }>();
  const plan = ad && AD_PLAN_BY_ID[ad.plan_id];
  if (!plan) return false;
  const now = Date.now();
  const r = await db
    .prepare("UPDATE ads SET status = 'active', paid_at = ?, starts_at = ?, ends_at = ?, event_id = ? WHERE id = ? AND status = 'awaiting_payment'")
    .bind(now, now, now + plan.days * 86_400_000, eventId, id)
    .run();
  return !!r.meta.changes;
}

/** Hosted Bachs checkout for one ad. The `collection.succeeded` webhook (worker/shop.ts) calls activateAd. */
async function startPayment(env: Env, ad: AdRow, user: FirebaseUser, origin: string): Promise<{ url: string; checkoutId?: string } | null> {
  if (!bachsReady(env)) return null;
  const s = await createBachsSession(env, {
    reference: ad.id,
    price: ad.price,
    email: user.email,
    metadata: { ad_id: ad.id, uid: user.uid, plan: ad.plan_id },
    successUrl: `${origin}/?ad=${ad.id}`,
    cancelUrl: `${origin}/?ad=cancelled`,
  });
  return s ? { url: s.url, checkoutId: s.id } : null;
}

/** The ads on show right now. Everyone sees the same ones, signed in or not (GET /api/ads/live is the public copy). */
export async function readLiveAds(db: D1Database, now = Date.now()) {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.board, a.title, a.body, a.link, a.image, a.fill, a.plan_id, a.ends_at, p.username AS by FROM ads a LEFT JOIN players p ON p.uid = a.uid
       WHERE a.status = 'active' AND a.ends_at > ? ORDER BY a.starts_at DESC LIMIT 50`,
    )
    .bind(now)
    .all<{ id: string; board: string | null; title: string; body: string; link: string | null; image: string | null; fill: number; plan_id: string; ends_at: number; by: string | null }>();
  return results.map((a) => ({ id: a.id, board: a.board, title: a.title, body: a.body, link: a.link, image: a.image, fill: !!a.fill, planId: a.plan_id, by: a.by, endsAt: a.ends_at }));
}

export async function handleAds(req: Request, env: Env, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/ads')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  if (path === '/api/ads' && req.method === 'GET') {
    const [live, { results: mine }] = await Promise.all([
      readLiveAds(db, now),
      db.prepare("SELECT * FROM ads WHERE uid = ? AND status != 'removed' ORDER BY created_at DESC LIMIT 20").bind(me).all<AdRow>(),
    ]);
    const { results: held } = await db
      .prepare("SELECT board FROM ads WHERE board IS NOT NULL AND status = 'awaiting_payment' AND created_at > ? AND uid != ?")
      .bind(now - HOLD_MS, me)
      .all<{ board: string }>();
    return json({
      reserved: held.map((h) => h.board),
      plans: AD_PLANS,
      enabled: bachsReady(env) || !!env.ADS_TEST_ACTIVATE,
      live,
      mine: mine.map((a) => ({
        id: a.id, board: a.board, title: a.title, body: a.body, link: a.link, image: a.image, fill: !!a.fill, planId: a.plan_id, price: a.price, status: a.status,
        createdAt: a.created_at, endsAt: a.ends_at,
      })),
    });
  }

  if (path === '/api/ads' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { board?: string; plan?: string; title?: string; body?: string; link?: string; image?: string; fill?: boolean } | null;
    const board = String(b?.board ?? '');
    if (!validBoard(board)) return err(400, 'Pick a billboard');
    const plan = AD_PLANS.find((p) => p.id === b?.plan);
    if (!plan) return err(400, 'Pick an ad plan');
    if (board.startsWith('sea:') && !SEA_PLANS.includes(plan.id)) return err(400, 'The sea takes day or week plans');
    const title = String(b?.title ?? '').trim();
    const body = String(b?.body ?? '').trim();
    if (!title || !body) return err(400, 'Add a title and a message');
    if (title.length > AD_LIMITS.title || body.length > AD_LIMITS.body) return err(400, 'Ad is too long');
    const rawLink = String(b?.link ?? '').trim();
    const link = rawLink ? cleanLink(rawLink) : null;
    if (rawLink && (!link || link.length > AD_LIMITS.link)) return err(400, 'That link does not look right');

    const rawImage = String(b?.image ?? '').trim();
    const image = rawImage ? cleanImage(rawImage, me) : null;
    if (rawImage && !image) return err(400, 'Upload the picture again');
    const fill = image && b?.fill === true ? 1 : 0;

    const open = await db
      .prepare("SELECT COUNT(*) AS n FROM ads WHERE uid = ? AND (status = 'awaiting_payment' OR (status = 'active' AND ends_at > ?))")
      .bind(me, now)
      .first<{ n: number }>();
    if ((open?.n ?? 0) >= MAX_OPEN_ADS) return err(429, 'Too many open ads. Remove one first');

    if (await boardTaken(db, board, null)) return err(409, 'Someone just booked that billboard. Pick another');

    const id = `ad_${crypto.randomUUID().replace(/-/g, '')}`;
    await db
      .prepare("INSERT INTO ads (id, uid, board, plan_id, price, title, body, link, image, fill, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?)")
      .bind(id, me, board, plan.id, boardPrice(plan.price, board), title, body, link, image, fill, now)
      .run();
    return json({ ok: true, id });
  }

  if (path === '/api/ads/checkout' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { id?: string } | null;
    const ad = b?.id ? await db.prepare('SELECT * FROM ads WHERE id = ? AND uid = ?').bind(b.id, me).first<AdRow>() : null;
    if (!ad) return err(404, 'Ad not found');
    if (ad.status !== 'awaiting_payment') return err(409, 'This ad is already paid or removed');

    if (ad.board && (await boardTaken(db, ad.board, ad.id))) return err(409, 'That billboard has been taken. Remove this ad and pick another');

    if (env.ADS_TEST_ACTIVATE === '1') {
      await activateAd(db, ad.id, 'test');
      return json({ ok: true, activated: true });
    }
    const session = await startPayment(env, ad, user, new URL(req.url).origin);
    if (!session) return err(503, 'Ad payments are not open yet. Your ad is saved and will go live once you pay');
    if (session.checkoutId) await db.prepare('UPDATE ads SET checkout_id = ? WHERE id = ?').bind(session.checkoutId, ad.id).run();
    return json({ ok: true, url: session.url });
  }

  if (path === '/api/ads/remove' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { id?: string } | null;
    if (!b?.id) return err(400, 'Missing ad');
    const r = await db.prepare("UPDATE ads SET status = 'removed' WHERE id = ? AND uid = ? AND status = 'awaiting_payment'").bind(b.id, me).run();
    return r.meta.changes ? json({ ok: true }) : err(409, 'Paid ads cannot be removed');
  }

  return err(404, 'Not found');
}
