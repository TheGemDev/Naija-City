// Which accounts share a device. The browser sends a device id (random, kept in its storage) and a fingerprint of its
// hardware with every call (src/net/device.ts); the worker keeps salted hashes of those and of the IP address, never the
// raw values (migrations/0111_player_links.sql). The EFCC reads them: money passed between linked accounts, and votes
// from a candidate's own accounts (worker/efcc.ts).
//
// Linked means the same device id, or the same fingerprint seen from the same IP address. A fingerprint alone is not
// enough (plenty of players have the same phone model), and neither is an IP (homes, campuses and mobile networks share them).

declare global {
  interface Env {
    /** Salt for the hashes (npx wrangler secret put LINK_SECRET). Without it IP addresses are not recorded at all. */
    LINK_SECRET?: string;
  }
}

/** One write per account and device this often, per worker instance. */
const RECORD_EVERY_MS = 60 * 60_000;
const recent = new Map<string, number>();
const VALUE_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Device ids and fingerprints are random or opaque already, so they are still salted when no secret is set. */
const FALLBACK_SALT = 'naija-city-links';

let cachedKey: { secret: string; key: CryptoKey } | null = null;
async function hmacKey(secret: string) {
  if (cachedKey?.secret !== secret) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    cachedKey = { secret, key };
  }
  return cachedKey.key;
}

async function digest(secret: string, kind: string, value: string) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(`${kind}:${value}`));
  return [...new Uint8Array(sig).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Notes the device, fingerprint and IP this request came from. Off the request path, and at most hourly per combination. */
export function recordDevice(env: Env, ctx: ExecutionContext, uid: string, req: Request) {
  const device = req.headers.get('x-nc-device');
  const print = req.headers.get('x-nc-print');
  const ip = env.LINK_SECRET ? req.headers.get('cf-connecting-ip') : null;
  const values = [
    ['device', device && VALUE_RE.test(device) ? device : null],
    ['print', print && VALUE_RE.test(print) ? print : null],
    ['ip', ip && ip.length <= 64 ? ip : null],
  ].filter((v): v is [string, string] => !!v[1]);
  if (!values.length) return;
  const now = Date.now();
  const key = `${uid}|${values.map((v) => v[1]).join('|')}`;
  if ((recent.get(key) ?? 0) > now - RECORD_EVERY_MS) return;
  if (recent.size > 5000) recent.clear();
  recent.set(key, now);
  const secret = env.LINK_SECRET || FALLBACK_SALT;
  ctx.waitUntil((async () => {
    const stmts = await Promise.all(values.map(async ([kind, value]) =>
      env.DB.prepare(
        `INSERT INTO player_links (uid, kind, hash, first_seen, last_seen) VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(uid, kind, hash) DO UPDATE SET last_seen = excluded.last_seen`,
      ).bind(uid, kind, await digest(secret, kind, value), now)));
    await env.DB.batch(stmts);
  })().catch(() => {}));
}

/** SQL: accounts a and b have both been seen with the same `kind` of value. */
const shares = (a: string, b: string, kind: string) =>
  `EXISTS (SELECT 1 FROM player_links la JOIN player_links lb ON lb.kind = la.kind AND lb.hash = la.hash AND lb.uid = ${b}
           WHERE la.uid = ${a} AND la.kind = '${kind}')`;

/** SQL: a and b are two accounts on one device (the same device id, or the same fingerprint from the same IP). */
export const linkedSql = (a: string, b: string) =>
  `(${a} != ${b} AND (${shares(a, b, 'device')} OR (${shares(a, b, 'print')} AND ${shares(a, b, 'ip')})))`;

/** SQL: a and b have used the same IP address. Weak on its own: only ever evidence alongside something else. */
export const sharedIpSql = (a: string, b: string) => `(${a} != ${b} AND ${shares(a, b, 'ip')})`;
