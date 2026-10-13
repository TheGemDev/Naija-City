// Also activates paid player ads (references starting `ad_`, see worker/ads.ts).
// Selling in-game naira for real money through Bachs (https://docs.bachs.io).
//
//   POST /api/shop/checkout  → creates an order and a Bachs checkout session, returns its hosted URL
//   POST /api/shop/webhook   → Bachs calls this (no sign-in); signature-checked, credits the wallet once
//
// The redirect back to the game is never trusted: only a verified `collection.succeeded` webhook whose
// reference, currency and amount match the order credits the wallet.
// Secrets: BACHS_API_KEY, BACHS_WEBHOOK_SECRET. Optional var: BACHS_BASE_URL (sandbox by default).

import type { FirebaseUser } from './auth';
import { naira } from './feed';
import { activateAd } from './ads';
import { bachsReady, createBachsSession } from './bachs';
import { applyStmts, ensureWallet, getBalance } from './wallet';
import { MAX_ORDERS_PER_DAY, PACKS, PACK_BY_ID } from '../src/game/shop';

declare global {
  interface Env {
    BACHS_API_KEY?: string;
    BACHS_WEBHOOK_SECRET?: string;
    BACHS_BASE_URL?: string;
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

const TOLERANCE_S = 300;
const hexBytes = (hex: string) => {
  if (hex.length % 2 || /[^0-9a-f]/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
};

/** X-Bachs-Signature-V2 is `t={unix},v1={hex}[,v1=…]`; the signed text is `{t}.{raw body}`. */
async function validSignature(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim());
  const t = Number(parts.find((p) => p.startsWith('t='))?.slice(2));
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const data = new TextEncoder().encode(`${t}.${raw}`);
  for (const p of parts) {
    if (!p.startsWith('v1=')) continue;
    const sig = hexBytes(p.slice(3));
    if (sig && (await crypto.subtle.verify('HMAC', key, sig, data))) return true;
  }
  return false;
}

interface OrderRow { id: string; uid: string; pack_id: string; price: number; naira: number; status: 'pending' | 'paid'; created_at: number }

/** Public: no Firebase token. Always answers 200 once the signature checks out so Bachs stops retrying. */
export async function handleShopWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.BACHS_WEBHOOK_SECRET) return err(503, 'Payments are not configured');
  const raw = await req.text();
  const header = req.headers.get('X-Bachs-Signature-V2');
  if (!(await validSignature(raw, header, env.BACHS_WEBHOOK_SECRET))) return err(401, 'Bad signature');

  let event: { id?: string; type?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(raw); } catch { return err(400, 'Bad body'); }
  if (event.type !== 'collection.succeeded' || !event.data) return json({ ok: true, ignored: true });

  const d = event.data as { reference?: string | null; status?: string; amount?: string; currency?: string; checkout_id?: string | null };
  if (d.reference?.startsWith('ad_')) {
    const ad = await env.DB.prepare('SELECT price FROM ads WHERE id = ?').bind(d.reference).first<{ price: number }>();
    if (!ad) return json({ ok: true, ignored: 'unknown ad' });
    if (String(d.status).toUpperCase() !== 'SUCCEEDED' || d.currency !== 'NGN' || Math.round(Number(d.amount)) !== ad.price) {
      return json({ ok: true, ignored: 'mismatch' });
    }
    await activateAd(env.DB, d.reference, event.id ?? null);
    return json({ ok: true });
  }
  const order = d.reference
    ? await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(d.reference).first<OrderRow>()
    : null;
  if (!order) return json({ ok: true, ignored: 'unknown order' });
  if (String(d.status).toUpperCase() !== 'SUCCEEDED' || d.currency !== 'NGN' || Math.round(Number(d.amount)) !== order.price) {
    return json({ ok: true, ignored: 'mismatch' });
  }

  const flipped = await env.DB
    .prepare("UPDATE orders SET status = 'paid', paid_at = ?, event_id = ? WHERE id = ? AND status = 'pending'")
    .bind(Date.now(), event.id ?? null, order.id)
    .run();
  if (flipped.meta.changes) {
    await env.DB.batch([ensureWallet(env.DB, order.uid), ...applyStmts(env.DB, order.uid, `order:${order.id}`, 'purchase', order.pack_id, order.naira)]);
  }
  return json({ ok: true });
}

export async function handleShop(req: Request, env: Env, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/shop')) return null;
  const db = env.DB;
  const me = user.uid;

  if (path === '/api/shop' && req.method === 'GET') {
    const { results } = await db
      .prepare('SELECT id, pack_id, price, naira, status, created_at FROM orders WHERE uid = ? ORDER BY created_at DESC LIMIT 10')
      .bind(me)
      .all();
    return json({ packs: PACKS, orders: results, enabled: bachsReady(env), balance: await getBalance(db, me) });
  }

  if (path === '/api/shop/checkout' && req.method === 'POST') {
    if (!bachsReady(env)) return err(503, 'The shop is not open yet');
    const b = (await req.json().catch(() => null)) as { pack?: string } | null;
    const pack = b?.pack ? PACK_BY_ID[b.pack] : undefined;
    if (!pack) return err(400, 'Unknown pack');
    const today = Date.now() - 86_400_000;
    const recent = await db.prepare('SELECT COUNT(*) AS n FROM orders WHERE uid = ? AND created_at > ?').bind(me, today).first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_ORDERS_PER_DAY) return err(429, 'Daily purchase limit reached');

    const id = `ord_${crypto.randomUUID().replace(/-/g, '')}`;
    await db
      .prepare("INSERT INTO orders (id, uid, pack_id, price, naira, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
      .bind(id, me, pack.id, pack.price, pack.naira, Date.now())
      .run();

    const origin = new URL(req.url).origin;
    const session = await createBachsSession(env, {
      reference: id,
      price: pack.price,
      email: user.email,
      metadata: { order_id: id, uid: me, pack: pack.id },
      successUrl: `${origin}/?paid=${id}`,
      cancelUrl: `${origin}/?paid=cancelled`,
    });
    if (!session) {
      await db.prepare("DELETE FROM orders WHERE id = ? AND status = 'pending'").bind(id).run();
      return err(502, 'Could not start checkout. Try again');
    }
    await db.prepare('UPDATE orders SET checkout_id = ? WHERE id = ?').bind(session.id ?? null, id).run();
    return json({ ok: true, order: id, url: session.url, summary: `${naira(pack.naira)} for ₦${pack.price.toLocaleString('en-NG')}` });
  }

  return err(404, 'Not found');
}
