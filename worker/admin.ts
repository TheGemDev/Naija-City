// Owner dashboard, served only on the ADMIN_HOST host (dash.naija.city in production). One page plus a small read-only API behind a shared key
// (wrangler secret put ADMIN_KEY). Nothing here writes to D1.

import { readLiveStats } from './cfTraffic';
import { ADMIN_PAGE } from './adminPage';
import { onlinePlayers } from './shards';

declare global {
  interface Env {
    /** Passphrase for the dashboard. wrangler secret put ADMIN_KEY */
    ADMIN_KEY?: string;
    /** Host that serves the dashboard, e.g. dash.naija.city (wrangler.jsonc vars). Unset: no dashboard. */
    ADMIN_HOST?: string;
  }
}

const DAY = 86_400_000;
const PAGE_SIZE = 25;

const headers = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json' } });

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/** Compares hashes of both sides so the check takes the same time whatever the guess. */
async function keyOk(env: Env, req: Request): Promise<boolean> {
  const given = req.headers.get('x-admin-key');
  if (!env.ADMIN_KEY || !given) return false;
  const [a, b] = await Promise.all([digest(given), digest(env.ADMIN_KEY)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const count = async (env: Env, sql: string, ...binds: unknown[]) =>
  (await env.DB.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;

async function overview(env: Env, now: number) {
  const day = (n: number) => now - n * DAY;
  const q = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b);
  const since30 = Math.floor(day(29) / DAY) * DAY;
  const [totals, signups, active, live] = await Promise.all([
    env.DB.batch([
      q('SELECT COUNT(*) AS n FROM players'),
      q('SELECT COUNT(*) AS n FROM players WHERE username IS NOT NULL'),
      q('SELECT COUNT(*) AS n FROM players WHERE email IS NOT NULL'),
      q('SELECT COUNT(*) AS n FROM players WHERE created_at >= ?', day(1)),
      q('SELECT COUNT(*) AS n FROM players WHERE created_at >= ?', day(7)),
      q('SELECT COUNT(*) AS n FROM players WHERE created_at >= ?', day(30)),
      q('SELECT COUNT(*) AS n FROM players WHERE last_seen >= ?', now - 15 * 60_000),
      q('SELECT COUNT(*) AS n FROM players WHERE last_seen >= ?', day(1)),
      q('SELECT COUNT(*) AS n FROM players WHERE last_seen >= ?', day(7)),
      q('SELECT COUNT(*) AS n FROM players WHERE last_seen >= ?', day(30)),
      q('SELECT COALESCE(SUM(balance), 0) AS n FROM wallets'),
      q('SELECT COALESCE(SUM(savings), 0) AS n FROM bank_accounts'),
      q('SELECT COUNT(*) AS n FROM players WHERE jailed_until > ?', now),
      q('SELECT COUNT(*) AS n FROM snaps'),
      q('SELECT COUNT(*) AS n FROM businesses'),
      q('SELECT COUNT(*) AS n FROM crews'),
      q('SELECT COUNT(*) AS n FROM game_matches'),
      q('SELECT COUNT(*) AS n FROM push_subscriptions'),
    ]),
    // Group in UTC days, matching the cron and Cloudflare's own day boundaries.
    q('SELECT created_at / ?1 AS d, COUNT(*) AS n FROM players WHERE created_at >= ?2 GROUP BY d', DAY, since30).all<{ d: number; n: number }>(),
    q('SELECT last_seen / ?1 AS d, COUNT(*) AS n FROM players WHERE last_seen >= ?2 GROUP BY d', DAY, since30).all<{ d: number; n: number }>(),
    readLiveStats(env).catch(() => null),
  ]);
  const t = totals.map((r) => (r.results[0] as { n: number }).n);
  const series = (rows: { d: number; n: number }[]) => {
    const by = new Map(rows.map((r) => [r.d, r.n]));
    const first = Math.floor(since30 / DAY);
    return Array.from({ length: 30 }, (_, i) => ({ day: new Date((first + i) * DAY).toISOString().slice(0, 10), n: by.get(first + i) ?? 0 }));
  };
  return {
    now,
    accounts: { total: t[0], withUsername: t[1], withEmail: t[2], new24h: t[3], new7d: t[4], new30d: t[5] },
    activity: { online15m: t[6], active24h: t[7], active7d: t[8], active30d: t[9] },
    money: { inWallets: t[10], inBanks: t[11] },
    jailed: t[12],
    content: { snaps: t[13], businesses: t[14], crews: t[15], matches: t[16], pushSubscribers: t[17] },
    live: live && { online: live.online, rooms: live.rooms, visitsToday: live.visitsToday, visitsTotal: live.visitsTotal },
    signups: series(signups.results),
    activeByDay: series(active.results),
  };
}

const SORTS: Record<string, string> = {
  joined: 'p.created_at',
  seen: 'p.last_seen',
  balance: 'balance',
  savings: 'savings',
  name: 'COALESCE(p.username, p.name, p.email)',
};

async function listPlayers(env: Env, url: URL) {
  const term = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
  const sort = SORTS[url.searchParams.get('sort') ?? ''] ?? SORTS.joined;
  const dir = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const page = Math.max(0, Math.floor(Number(url.searchParams.get('page')) || 0));
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = term ? "WHERE p.uid = ?1 OR p.username LIKE ?2 ESCAPE '\\' OR p.name LIKE ?2 ESCAPE '\\' OR p.email LIKE ?2 ESCAPE '\\'" : '';
  const binds = term ? [term, like] : [];
  const [rows, total] = await Promise.all([
    env.DB.prepare(`
      SELECT p.uid, p.username, p.name, p.email, p.created_at, p.last_seen, p.jailed_until,
             COALESCE(w.balance, 0) AS balance, COALESCE(b.savings, 0) AS savings
      FROM players p
      LEFT JOIN wallets w ON w.uid = p.uid
      LEFT JOIN bank_accounts b ON b.uid = p.uid
      ${where}
      ORDER BY ${sort} ${dir}, p.uid
      LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`).bind(...binds).all(),
    count(env, `SELECT COUNT(*) AS n FROM players p ${where}`, ...binds),
  ]);
  return { players: rows.results, total, page, pageSize: PAGE_SIZE };
}

async function playerDetail(env: Env, uid: string, now: number) {
  const p = await env.DB.prepare(
    `SELECT uid, username, name, email, birthdate, created_at, last_seen, jailed_until, civic_banned_at, last_arrest_at FROM players WHERE uid = ?`,
  ).bind(uid).first();
  if (!p) return null;
  const [wallet, bank, recent, n] = await Promise.all([
    env.DB.prepare('SELECT balance, updated_at FROM wallets WHERE uid = ?').bind(uid).first(),
    env.DB.prepare('SELECT savings, updated_at FROM bank_accounts WHERE uid = ?').bind(uid).first(),
    env.DB.prepare('SELECT kind, ref, amount, created_at FROM ledger WHERE uid = ? AND applied = 1 ORDER BY id DESC LIMIT 15').bind(uid).all(),
    env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM snaps WHERE uid = ?').bind(uid),
      env.DB.prepare('SELECT COUNT(*) AS n FROM businesses WHERE uid = ?').bind(uid),
      env.DB.prepare('SELECT COUNT(*) AS n FROM ledger WHERE uid = ? AND applied = 1').bind(uid),
      env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE uid = ?').bind(uid),
    ]),
  ]);
  const c = n.map((r) => (r.results[0] as { n: number }).n);
  return { now, player: p, wallet, bank, counts: { snaps: c[0], businesses: c[1], ledger: c[2], pushDevices: c[3] }, recent: recent.results };
}

/** The whole dashboard host. */
export async function handleAdmin(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/' && req.method === 'GET') {
    return new Response(ADMIN_PAGE, {
      headers: {
        ...headers,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    });
  }
  if (!url.pathname.startsWith('/api/admin/') || req.method !== 'GET') return json({ error: 'Not found' }, 404);

  // Wrong guesses are limited per address, so the key cannot be brute-forced.
  const ip = req.headers.get('cf-connecting-ip') ?? 'anon';
  if (!(await keyOk(env, req))) {
    if (env.RL_SENSITIVE && !(await env.RL_SENSITIVE.limit({ key: `admin:${ip}` })).success) return json({ error: 'Too many tries' }, 429);
    return json({ error: env.ADMIN_KEY ? 'Wrong key' : 'ADMIN_KEY is not set on the Worker' }, 401);
  }

  const now = Date.now();
  const route = url.pathname.slice('/api/admin/'.length);
  if (route === 'overview') return json(await overview(env, now));
  if (route === 'players') return json(await listPlayers(env, url));
  if (route === 'online') {
    const players = (await onlinePlayers(env)).sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
    return json({ now, players });
  }
  if (route === 'player') {
    const uid = url.searchParams.get('uid') ?? '';
    const d = uid && uid.length <= 128 ? await playerDetail(env, uid, now) : null;
    return d ? json(d) : json({ error: 'No such player' }, 404);
  }
  return json({ error: 'Not found' }, 404);
}
