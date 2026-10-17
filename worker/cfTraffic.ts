// Visit numbers from Cloudflare Web Analytics: the beacon script Cloudflare adds to every HTML page on naija.city and
// kaduna.life reports each page load from a real browser, so bots, scanners and link previews that never run JS are
// left out. A "visit" is someone arriving from another site or typing the address; reloads and moving around inside the
// game are not new visits. The public numbers are page views (every page load), which is always the larger. The cron
// asks for the last few days every 5 minutes, keeps each day in D1 (web_visits) so the all-time total
// survives Cloudflare dropping old data, and puts today's and the all-time page views in KV.

import { onlineEverywhere } from './shards';

declare global {
  interface Env {
    /** API token with Account > Account Analytics > Read. wrangler secret put CF_API_TOKEN */
    CF_API_TOKEN?: string;
    CF_ACCOUNT_ID?: string;
    STATS_KV?: KVNamespace;
    /** Comma-separated Web Analytics site tags to count (naija.city, kaduna.life). */
    CF_RUM_SITE_TAGS?: string;
    /** First day (YYYY-MM-DD) to count; the all-time total starts here. */
    CF_COUNT_FROM?: string;
  }
}

const KV_KEY = 'cf-visits';
const DAY_MS = 86_400_000;
const REFRESH_DAYS = 30; // Cloudflare can still revise recent days; older ones are settled in D1
const MEMO_MS = 30_000;

interface Stored { date: string; today: number; total: number }
export type CfVisits = { today: number; total: number };

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Ask Web Analytics for each recent day's visits, save the days in D1, and store today's and the all-time total in KV. */
export async function rollupCfTraffic(env: Env, now = Date.now()): Promise<void> {
  const sites = (env.CF_RUM_SITE_TAGS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !sites.length || !env.STATS_KV) return;
  const date = utcDate(now);
  const from = env.CF_COUNT_FROM ?? '2000-01-01';
  const since = [from, utcDate(now - REFRESH_DAYS * DAY_MS)].sort().pop()!;
  const query =
    'query($a:string!,$s:Date!,$t:[string!]){viewer{accounts(filter:{accountTag:$a}){rumPageloadEventsAdaptiveGroups(' +
    'limit:5000,filter:{date_geq:$s,siteTag_in:$t}){count dimensions{date requestHost} sum{visits}}}}}';
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: env.CF_ACCOUNT_ID, s: since, t: sites } }),
  });
  if (!res.ok) throw new Error(`Cloudflare analytics query failed (${res.status})`);
  const body = (await res.json()) as {
    errors?: { message: string }[] | null;
    data?: { viewer?: { accounts?: { rumPageloadEventsAdaptiveGroups?: { count: number; dimensions: { date: string; requestHost: string }; sum: { visits: number } }[] }[] } };
  };
  if (body.errors?.length) throw new Error(`Cloudflare analytics: ${body.errors[0].message}`);
  const days = new Map<string, { visits: number; views: number }>();
  for (const g of body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? []) {
    // The public stats page is not the game.
    if (g.dimensions.requestHost.startsWith('stats.')) continue;
    const d = days.get(g.dimensions.date) ?? { visits: 0, views: 0 };
    d.visits += g.sum.visits;
    d.views += g.count;
    days.set(g.dimensions.date, d);
  }
  if (days.size) {
    await env.DB.batch([...days].map(([day, d]) =>
      env.DB.prepare('INSERT INTO web_visits (day, visits, page_views) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET visits = excluded.visits, page_views = excluded.page_views')
        .bind(day, d.visits, d.views)));
  }
  const sum = await env.DB.prepare('SELECT COALESCE(SUM(page_views), 0) AS n FROM web_visits WHERE day >= ?').bind(from).first<{ n: number }>();
  await env.STATS_KV.put(KV_KEY, JSON.stringify({ date, today: days.get(date)?.views ?? 0, total: sum?.n ?? 0 } satisfies Stored));
}

let memo: { at: number; v: CfVisits | null } | null = null;

/** The current counts, or null when the cron has not stored any yet. */
export async function readCfVisits(env: Env, now = Date.now()): Promise<CfVisits | null> {
  if (memo && now - memo.at < MEMO_MS) return memo.v;
  let v: CfVisits | null = null;
  try {
    const s = await env.STATS_KV?.get<Stored>(KV_KEY, 'json');
    // After midnight UTC the stored "today" belongs to yesterday until the next cron run.
    if (s) v = { today: s.date === utcDate(now) ? s.today : 0, total: s.total };
  } catch {
    /* show nothing until the next cron run */
  }
  memo = { at: now, v };
  return v;
}

/**
 * What /api/stats serves: players online, the visit counts (zero until the cron has stored Cloudflare's numbers), and
 * how many NPC citizens have ever arrived (worker/npcs.ts), which the phone adds to its "plays".
 */
export async function readLiveStats(env: Env): Promise<{ online: number; rooms: number; visitsToday: number; visitsTotal: number; npcs: number }> {
  const [{ online, rooms, visits }, npcs] = await Promise.all([
    onlineEverywhere(env),
    env.DB.prepare('SELECT npc_total AS n FROM civic_policies WHERE id = 1').first<{ n: number }>().then((r) => r?.n ?? 0).catch(() => 0),
  ]);
  return { online, rooms, visitsToday: visits?.today ?? 0, visitsTotal: visits?.total ?? 0, npcs };
}
