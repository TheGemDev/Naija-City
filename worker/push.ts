import { isPushCategory, type PushCategory } from '../src/game/push';

declare global {
  interface Env {
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  }
}

interface PushSubscriptionRow {
  uid: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  title: string;
  body: string;
  tag: string;
  /** Which switch in the player's settings turns this off. */
  category: PushCategory;
  chatUid?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const utf8 = new TextEncoder();

function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url value');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encode(value: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < value.length; i += 0x8000) {
    binary += String.fromCharCode(...value.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

async function encryptPayload(subscription: PushSubscriptionRow, payload: PushPayload): Promise<Uint8Array> {
  const userPublicKey = decode(subscription.p256dh);
  const authSecret = decode(subscription.auth);
  if (userPublicKey.length !== 65 || authSecret.length < 16 || authSecret.length > 64) throw new Error('Invalid push subscription keys');

  const userKey = await crypto.subtle.importKey('raw', userPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const exportedPublicKey = await crypto.subtle.exportKey('raw', serverKeys.publicKey);
  if (!(exportedPublicKey instanceof ArrayBuffer)) throw new Error('Could not export ephemeral push key');
  const serverPublicKey = new Uint8Array(exportedPublicKey);
  const ecdhParams = { name: 'ECDH', public: userKey } as SubtleCryptoDeriveKeyAlgorithm;
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, serverKeys.privateKey, 256));

  const authInfo = new Uint8Array(14 + userPublicKey.length + serverPublicKey.length);
  authInfo.set(utf8.encode('WebPush: info\0'));
  authInfo.set(userPublicKey, 14);
  authInfo.set(serverPublicKey, 14 + userPublicKey.length);
  const inputKey = await hkdf(sharedSecret, authSecret, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(inputKey, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(inputKey, salt, utf8.encode('Content-Encoding: nonce\0'), 12);
  const plaintext = new Uint8Array([...utf8.encode(JSON.stringify(payload)), 2]);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  const header = new Uint8Array(16 + 4 + 1 + serverPublicKey.length);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = serverPublicKey.length;
  header.set(serverPublicKey, 21);
  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header);
  body.set(ciphertext, header.length);
  return body;
}

// One signed header per push service (FCM, Mozilla, Apple…), reused until shortly before it expires, so a broadcast signs a handful of times instead of once per device.
const VAPID_TTL_S = 12 * 60 * 60;
const vapidCache = new Map<string, { header: string; freshUntil: number }>();

async function vapidAuthorization(endpoint: string, env: Env): Promise<string> {
  const origin = new URL(endpoint).origin;
  const cached = vapidCache.get(origin);
  if (cached && cached.freshUntil > Date.now()) return cached.header;
  const header = await signVapid(origin, env);
  vapidCache.set(origin, { header, freshUntil: Date.now() + (VAPID_TTL_S - 60 * 60) * 1000 });
  return header;
}

async function signVapid(origin: string, env: Env): Promise<string> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error('Web Push is not configured');
  const rawPublicKey = decode(publicKey);
  const rawPrivateKey = decode(privateKey);
  if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 4 || rawPrivateKey.length !== 32) throw new Error('VAPID keys have invalid lengths');
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) throw new Error('VAPID subject must be a mailto: or https: URL');

  const token = `${encode(utf8.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${encode(utf8.encode(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + VAPID_TTL_S,
    sub: subject,
  })))}`;
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC',
    crv: 'P-256',
    x: encode(rawPublicKey.subarray(1, 33)),
    y: encode(rawPublicKey.subarray(33, 65)),
    d: encode(rawPrivateKey),
    ext: true,
    key_ops: ['sign'],
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8.encode(token)));
  return `vapid t=${token}.${encode(signature)}, k=${publicKey}`;
}

export function pushPublicKey(env: Env): Response {
  return json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });
}

export async function handlePushApi(req: Request, env: Env, uid: string, path: string): Promise<Response | null> {
  // Which categories this player has switched off, and switching one on or off.
  if (path === '/api/push/prefs') {
    if (req.method === 'PUT') {
      const body = (await req.json().catch(() => null)) as { category?: unknown; on?: unknown } | null;
      if (!isPushCategory(body?.category) || typeof body.on !== 'boolean') return err(400, 'Invalid notification setting');
      await env.DB.prepare(body.on ? 'DELETE FROM push_muted WHERE uid = ? AND category = ?' : 'INSERT OR IGNORE INTO push_muted (uid, category) VALUES (?, ?)')
        .bind(uid, body.category).run();
    } else if (req.method !== 'GET') return err(405, 'Method not allowed');
    const { results } = await env.DB.prepare('SELECT category FROM push_muted WHERE uid = ?').bind(uid).all<{ category: string }>();
    return json({ muted: results.map((r) => r.category) });
  }
  // "Send a test" in Settings: a push to each of this player's devices right now, and what each push service answered,
  // so a player (and we) can see whether notifications reach them and why not.
  if (path === '/api/push/test') {
    if (req.method !== 'POST') return err(405, 'Method not allowed');
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return err(503, 'Push notifications are not configured yet');
    if (env.RL_SENSITIVE && !(await env.RL_SENSITIVE.limit({ key: `pushtest:${uid}` })).success) return err(429, 'Wait a moment before sending another test');
    const { results } = await env.DB.prepare('SELECT uid, endpoint, p256dh, auth FROM push_subscriptions WHERE uid = ?').bind(uid).all<PushSubscriptionRow>();
    const devices = await Promise.all(results.map((s) => sendOne(env, s, { title: '🔔 Test from Naija City', body: 'Notifications are working on this device.', tag: 'push-test', category: 'messages' })));
    return json({ devices });
  }
  if (path !== '/api/push/subscribe') return null;
  if (req.method === 'PUT') {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return err(503, 'Push notifications are not configured yet');
    let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    try {
      body = await req.json();
    } catch {
      return err(400, 'Invalid subscription JSON');
    }
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (typeof endpoint !== 'string' || endpoint.length > 2048 ||
      typeof p256dh !== 'string' || p256dh.length !== 87 ||
      typeof auth !== 'string' || auth.length < 22 || auth.length > 86) {
      return err(400, 'Invalid push subscription');
    }
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        decode(p256dh).length !== 65 || decode(auth).length < 16 || decode(auth).length > 64) {
        return err(400, 'Invalid push subscription');
      }
    } catch {
      return err(400, 'Invalid push subscription');
    }

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE uid = ? AND endpoint != ?')
      .bind(uid, endpoint).first<{ n: number }>();
    if ((count?.n ?? 0) >= 5) return err(429, 'You can enable notifications on up to five devices');
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, uid, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at`,
    ).bind(endpoint, uid, p256dh, auth, now, now).run();
    return json({ ok: true });
  }

  if (req.method === 'DELETE') {
    let body: { endpoint?: unknown };
    try {
      body = await req.json();
    } catch {
      return err(400, 'Invalid subscription JSON');
    }
    if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048) return err(400, 'Invalid push endpoint');
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE uid = ? AND endpoint = ?').bind(uid, body.endpoint).run();
    return json({ ok: true });
  }
  return err(405, 'Method not allowed');
}

/** Queue a web push for `uid`. The queue consumer (deliverPush) does the encrypting and sending, off the request path. */
export function sendPush(env: Env, ctx: ExecutionContext, uid: string, payload: PushPayload): void {
  const job: PushJob = { type: 'push', uid, payload };
  ctx.waitUntil(
    env.JOBS.send(job).catch((error: unknown) => {
      // Queue unavailable: fall back to sending right here rather than dropping the notification.
      console.error('Push queue failed, sending directly', error);
      return deliverPush(env, [uid], payload);
    }),
  );
}

/** Players per broadcast queue message. Each can have five devices, and a consumer batch is 25 messages, so this bounds the fetches one invocation makes. */
const BROADCAST_CHUNK = 10;
/** Messages per sendBatch call (the Queues limit). */
const SEND_BATCH = 100;

/** Queue a web push for every subscribed player who has not switched its category off: a few queue writes for the lot, not one per player. */
export async function broadcastPush(env: Env, payload: PushPayload): Promise<void> {
  try {
    const { results } = await env.DB.prepare(
      'SELECT DISTINCT uid FROM push_subscriptions WHERE uid NOT IN (SELECT uid FROM push_muted WHERE category = ?)',
    ).bind(payload.category).all<{ uid: string }>();
    const jobs: { body: PushJob }[] = [];
    for (let i = 0; i < results.length; i += BROADCAST_CHUNK) {
      jobs.push({ body: { type: 'broadcast', uids: results.slice(i, i + BROADCAST_CHUNK).map((r) => r.uid), payload } });
    }
    for (let i = 0; i < jobs.length; i += SEND_BATCH) await env.JOBS.sendBatch(jobs.slice(i, i + SEND_BATCH));
  } catch (error) {
    console.error('Push broadcast failed', error);
  }
}

export type PushJob =
  | { type: 'push'; uid: string; payload: PushPayload }
  | { type: 'broadcast'; uids: string[]; payload: PushPayload };

/** Send one push to one device. A device the push service says is gone (404/410) is forgotten. Never throws. */
async function sendOne(env: Env, subscription: PushSubscriptionRow, payload: PushPayload): Promise<{ endpoint: string; service: string; status: number; detail?: string }> {
  const service = new URL(subscription.endpoint).hostname;
  try {
    const authorization = await vapidAuthorization(subscription.endpoint, env);
    const body = await encryptPayload(subscription, payload);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'high',
      },
      body,
    });
    if (response.status === 404 || response.status === 410) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND uid = ?').bind(subscription.endpoint, subscription.uid).run();
    }
    const detail = response.ok ? undefined : (await response.text().catch(() => '')).slice(0, 200);
    if (!response.ok) console.error(`Web Push delivery failed (${response.status}) ${service}: ${detail}`);
    return { endpoint: subscription.endpoint, service, status: response.status, detail };
  } catch (error) {
    console.error('Web Push delivery failed', error);
    return { endpoint: subscription.endpoint, service, status: 0, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Encrypt and send a push to every device these players have subscribed, unless they switched its category off. Throws only if the subscription lookup fails (so the queue retries). */
export async function deliverPush(env: Env, uids: string[], payload: PushPayload): Promise<void> {
  if (!uids.length) return;
  const { results } = await env.DB.prepare(
    `SELECT s.uid, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s
     WHERE s.uid IN (${uids.map(() => '?').join(',')}) AND NOT EXISTS (SELECT 1 FROM push_muted m WHERE m.uid = s.uid AND m.category = ?)`,
  ).bind(...uids, payload.category ?? '').all<PushSubscriptionRow>();
  await Promise.all(results.map((subscription) => sendOne(env, subscription, payload)));
}
