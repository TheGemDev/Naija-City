// Edge caching and read replicas for the public read routes (estates, profiles, plots, forbes, stats).
// Hundreds of players loading the same page should cost one D1 read, not hundreds.

/** Serve GET `req` from Cloudflare's edge cache for `seconds`, running `produce` on a miss. The browser itself never caches it. */
export async function edgeCached(req: Request, ctx: ExecutionContext, seconds: number, produce: () => Promise<Response>): Promise<Response> {
  if (req.method !== 'GET') return produce();
  const cache = caches.default;
  const key = new Request(req.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await produce();
  if (res.status !== 200) return res;
  const out = new Response(res.body, res);
  out.headers.set('cache-control', `public, max-age=0, s-maxage=${seconds}`);
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

/**
 * A value every player sees the same (the top of a leaderboard), kept in the edge cache for `seconds` so a busy
 * screen costs one D1 query, not one per player. Only for data that may be that many seconds old.
 */
export async function shared<T>(key: string, seconds: number, produce: () => Promise<T>): Promise<T> {
  const at = new Request(`https://shared.naija.city/${key}`);
  try {
    const hit = await caches.default.match(at);
    if (hit) return await hit.json<T>();
  } catch {
    /* fall through to a fresh read */
  }
  const value = await produce();
  await caches.default
    .put(at, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'cache-control': `public, s-maxage=${seconds}` } }))
    .catch(() => {});
  return value;
}

/**
 * D1 for reads that can be a few seconds old: with read replication on, this talks to the nearest copy of the
 * database instead of the primary. Without replication it is just the normal database. Never use it for a read
 * that must see what the player wrote a moment ago.
 */
export const replica = (env: Env): D1Database => env.DB.withSession('first-unconstrained') as unknown as D1Database;
