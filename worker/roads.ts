// Shared potholes (rules in src/game/roads.ts). New ones break open lazily: whenever anyone asks, the
// server opens however many were due since the last one, city by city. Whoever runs the city (the governor in
// Kaduna, the FCT Minister in Abuja, the Governor of Lagos in Lagos, the Governor of Kano in Kano) fixes them from the city's share of the treasury, or out of their own pocket.

import { potholeCity, potholeOf, potholeSites } from '../src/game/city';
import { CITY_HEAD, CITY_NAME, CIVIC_CITIES, OFFICE_RULES, type CivicCity } from '../src/game/civic';
import { fixCostOf, lampCity, lampOf, LAMPS, lampSites, roadOf, ROADWORK, type RoadsSnapshot } from '../src/game/roads';
import { GOV_RANT, VDM_ROADS_ICON } from '../src/game/news';
import { applyStmts, getBalance } from './wallet';
import { rand } from './crime';
import { feedStmt, handle, naira } from './feed';
import { gazette, official } from './gazette';
import { vdmGov } from './news';
import { capsOf, conditionsOf, loadStates, spendState } from './state';
import { STATE_LAW_KEYS, type StateLaws } from '../src/game/treasury';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

/** Each city's columns in civic_policies: its road funding and when its last pothole broke open. */
const COLUMNS: Record<CivicCity, { funding: string; at: string; lampAt: string }> = {
  kaduna: { funding: 'roads_funding', at: 'pothole_at', lampAt: 'lamp_at' },
  abuja: { funding: 'roads_funding_abuja', at: 'pothole_at_abuja', lampAt: 'lamp_at_abuja' },
  lagos: { funding: 'roads_funding_lagos', at: 'pothole_at_lagos', lampAt: 'lamp_at_lagos' },
  kano: { funding: 'roads_funding_kano', at: 'pothole_at_kano', lampAt: 'lamp_at_kano' },
};
/** "Governor" or "Minister", as VDM says it. */
const headTitle = (city: CivicCity) => (CITY_HEAD[city] === 'minister' ? 'Minister' : 'Governor');

/** Marks VDM's roadwork posts apart from his crime exposés, so they can be spaced out. */
const ROADS_ICON = VDM_ROADS_ICON;

/** What VDM says when a city's government fixes a road. */
function vdmRoads(city: CivicCity, who: string, road: string, cost: number, from: 'pocket' | 'treasury') {
  const title = headTitle(city);
  const lines = from === 'pocket'
    ? [
      `Credit where e due. ${title} ${who} use ${naira(cost)} from own pocket fix pothole for ${road}. I no dey praise politician, but this one I see. 👏🏾`,
      `${title} ${who} carry own money, ${naira(cost)}, go fix ${road}. Election dey come or na good heart? Either way the road smooth. I dey observe. 👀`,
      `So ${title} ${who} fit bring ${naira(cost)} from own pocket fix ${road}? Other politicians, una dey see am? No excuse again. 🎤`,
    ]
    : [
      `I dey watch o. ${title} ${who} don fix pothole for ${road} with ${naira(cost)} of public money. Na your job, no be favour. Ratels, we dey count the rest. 👀`,
      `Road update: ${title} ${who} don patch ${road}. ${naira(cost)} comot from treasury. I go drive pass there myself to confirm. If e open again next week, we go talk. 🚧`,
      `Dem say ${title} ${who} fix pothole for ${road} for ${naira(cost)}. Okay, I see am. One road no be achievement. Plenty still dey spoil people motor. 🕳️`,
      `${title} ${who} don remember say road dey ${CITY_NAME[city]}. ${road} get repair today, ${naira(cost)} from our money. Keep going, I dey here dey monitor. 🔦`,
    ];
  return lines[Math.floor(rand() * lines.length)];
}

/** Open whatever potholes, and put out whatever street lights, have come due in every city. */
export async function spawn(db: D1Database, now: number) {
  const p = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<Record<string, number | null>>();
  if (!p) return;
  // How fast roads break and lights go dark follows how well the state keeps them up (migration 0085).
  const [roads, lights] = await Promise.all([conditionsOf(db, 'roads'), conditionsOf(db, 'lights')]);
  for (const city of CIVIC_CITIES) {
    await spawnIn(db, now, city, p, roads[city] ?? 50);
    await breakLampsIn(db, now, city, p, lights[city] ?? 50);
  }
}

/** Street lights going out, on the same pattern as spawnIn: one request wins the race to move the city's clock. */
async function breakLampsIn(db: D1Database, now: number, city: CivicCity, p: Record<string, number | null>, condition: number) {
  const col = COLUMNS[city];
  const at = p[col.lampAt];
  const every = LAMPS.spawnHours(condition) * 3600_000;
  if (at === null || at === undefined) {
    await db.prepare(`UPDATE civic_policies SET ${col.lampAt} = ? WHERE id = 1 AND ${col.lampAt} IS NULL`).bind(now).run();
    return;
  }
  const due = Math.floor((now - at) / every);
  if (due <= 0) return;
  const next = due > LAMPS.maxSpawnBatch ? now : at + due * every;
  const won = await db.prepare(`UPDATE civic_policies SET ${col.lampAt} = ? WHERE id = 1 AND ${col.lampAt} = ?`).bind(next, at).run();
  if (!won.meta.changes) return;
  const { results } = await db.prepare('SELECT site FROM broken_lamps').all<{ site: number }>();
  const out = new Set(results.map((r) => r.site));
  const working = lampSites(city).filter((i) => !out.has(i));
  const picks: number[] = [];
  for (let n = Math.min(due, LAMPS.maxSpawnBatch); n > 0 && working.length; n--) picks.push(working.splice(Math.floor(rand() * working.length), 1)[0]);
  if (!picks.length) return;
  const road = lampOf(picks[0])!.road;
  await db.batch([
    ...picks.map((site) => db.prepare('INSERT OR IGNORE INTO broken_lamps (site, broken_at) VALUES (?, ?)').bind(site, now)),
    feedStmt(db, null, 'roads', '💡', picks.length === 1
      ? `A street light has gone out on ${road}, ${CITY_NAME[city]}. Night walkers, hold your phone torch. 🔦`
      : `${picks.length} street lights have gone out across ${CITY_NAME[city]}, including ${road}. Darkness is taking over the road. 🌑`, city),
  ]);
}

/** Only one request wins the race to move a city's clock. */
async function spawnIn(db: D1Database, now: number, city: CivicCity, p: Record<string, number | null>, condition: number) {
  const col = COLUMNS[city];
  const at = p[col.at];
  const every = ROADWORK.spawnHours(condition) * 3600_000;
  if (at === null || at === undefined) {
    await db.prepare(`UPDATE civic_policies SET ${col.at} = ? WHERE id = 1 AND ${col.at} IS NULL`).bind(now).run();
    return;
  }
  const due = Math.floor((now - at) / every);
  if (due <= 0) return;
  // After a long quiet spell only a few open at once, and the clock restarts from now.
  const next = due > ROADWORK.maxSpawnBatch ? now : at + due * every;
  const won = await db.prepare(`UPDATE civic_policies SET ${col.at} = ? WHERE id = 1 AND ${col.at} = ?`).bind(next, at).run();
  if (!won.meta.changes) return;
  const { results } = await db.prepare('SELECT site FROM potholes').all<{ site: number }>();
  const open = new Set(results.map((r) => r.site));
  const closed = potholeSites(city).filter((i) => !open.has(i));
  const picks: number[] = [];
  for (let n = Math.min(due, ROADWORK.maxSpawnBatch); n > 0 && closed.length; n--) picks.push(closed.splice(Math.floor(rand() * closed.length), 1)[0]);
  if (!picks.length) return;
  // Once enough of a city's roads are open, VDM goes after whoever runs it.
  const openNow = potholeSites(city).length - closed.length;
  const office = CITY_HEAD[city];
  const head = openNow >= GOV_RANT.potholes && p[`${office}_uid`]
    ? await db.prepare('SELECT uid, username FROM players WHERE uid = ?').bind(p[`${office}_uid`]).first<{ uid: string; username: string | null }>().catch(() => null)
    : null;
  await db.batch([
    ...picks.map((site) => db.prepare('INSERT OR IGNORE INTO potholes (site, opened_at) VALUES (?, ?)').bind(site, now)),
    feedStmt(db, null, 'roads', '🕳️', picks.length === 1
      ? `A fresh pothole has opened on ${roadOf(picks[0])}, ${CITY_NAME[city]}. Drivers are already swerving into oncoming traffic. 🚗💨`
      : `${picks.length} new potholes have opened across ${CITY_NAME[city]}, including ${roadOf(picks[0])}. The roads are crying. 😩`, city),
    ...(head ? vdmGov(db, head.uid, 'potholes', { who: official(office, head.username), n: openNow, other: CITY_NAME[city] }, city) : []),
  ]);
}

async function snapshot(db: D1Database): Promise<RoadsSnapshot> {
  const [open, policy, recent, lamps] = await db.batch([
    db.prepare('SELECT site FROM potholes ORDER BY site'),
    db.prepare('SELECT * FROM civic_policies WHERE id = 1'),
    db.prepare(
      `SELECT f.site, p.username AS by, f.cost, f.paid_from AS paidFrom, f.created_at AS at
       FROM pothole_fixes f LEFT JOIN players p ON p.uid = f.uid ORDER BY f.id DESC LIMIT 10`,
    ),
    db.prepare('SELECT site FROM broken_lamps ORDER BY site'),
  ]);
  const p = (policy.results[0] ?? {}) as Record<string, number | null>;
  const [{ states, assets: assetRows }, roads, lights] = await Promise.all([loadStates(db), conditionsOf(db, 'roads'), conditionsOf(db, 'lights')]);
  const laws = Object.fromEntries(states.map((s) => [s.city, Object.fromEntries(STATE_LAW_KEYS.map((k) => [k, s[k]])) as unknown as StateLaws]));
  const caps = await capsOf(db);
  const assets: Record<string, Record<string, number>> = {};
  for (const a of assetRows) (assets[a.city] ??= {})[a.asset] = a.condition;
  const balanceOf = (city: CivicCity) => states.find((s) => s.city === city)?.balance ?? 0;
  const cities = Object.fromEntries(CIVIC_CITIES.map((city) => [city, {
    nextAt: (p[COLUMNS[city].at] ?? Date.now()) + ROADWORK.spawnHours(roads[city] ?? 50) * 3600_000,
    // A city's government repairs its roads out of that city's own treasury.
    budget: balanceOf(city),
    lampNextAt: (p[COLUMNS[city].lampAt] ?? Date.now()) + LAMPS.spawnHours(lights[city] ?? 50) * 3600_000,
  }]));
  return {
    // A site the game no longer has (one removed from a city's list) is nobody's to fix: leave it out.
    open: (open.results as { site: number }[]).map((r) => r.site).filter((site) => potholeOf(site)),
    nextAt: cities.kaduna.nextAt,
    treasury: p.treasury ?? 0,
    budget: cities.kaduna.budget,
    cities,
    recent: recent.results as RoadsSnapshot['recent'],
    assets,
    laws,
    caps,
    lamps: (lamps.results as { site: number }[]).map((r) => r.site).filter((site) => lampOf(site)),
  };
}

export async function handleRoads(req: Request, db: D1Database, uid: string, path: string, env?: Env, ctx?: ExecutionContext): Promise<Response | null> {
  if (path === '/api/roads' && req.method === 'GET') {
    await spawn(db, Date.now());
    return json(await snapshot(db));
  }

  if (path === '/api/roads/fix' && req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as { site?: number; from?: string } | null;
    const site = body?.site;
    const city = Number.isInteger(site) ? (potholeCity(site!) as CivicCity | undefined) : undefined;
    if (!city || !CIVIC_CITIES.includes(city)) return err(400, 'Unknown pothole');
    const from = body?.from === 'pocket' ? 'pocket' : 'treasury';
    const office = CITY_HEAD[city];
    const gov = await db.prepare(`SELECT ${office}_uid AS head, president_uid AS president FROM civic_policies WHERE id = 1`).first<{ head: string | null; president: string | null }>();
    // A state without a government is managed by the president.
    if (!(gov?.head === uid || (!gov?.head && gov?.president === uid))) return err(403, `Only the ${OFFICE_RULES[office].title} can fix potholes in ${CITY_NAME[city]}`);
    const cost = fixCostOf(site!);
    if (from === 'pocket' && (await getBalance(db, uid)) < cost) return err(402, `You need ${naira(cost)} to fix it yourself`);

    // Claim the pothole first so two fixes can't both be paid for.
    const claimed = await db.prepare('DELETE FROM potholes WHERE site = ? RETURNING opened_at').bind(site).first<{ opened_at: number }>();
    if (!claimed) return err(409, 'That pothole is already fixed');
    const now = Date.now();
    if (from === 'treasury') {
      // Only the city's share of the treasury (the president's allocation) is its government's to spend.
      const paid = await spendState(db, city, cost, { allowArrears: true });
      if (!paid) {
        await db.prepare('INSERT OR IGNORE INTO potholes (site, opened_at) VALUES (?, ?)').bind(site, claimed.opened_at).run();
        return err(402, `${CITY_NAME[city]}’s budget needs ${naira(cost)} to fix this one`);
      }
    }
    const who = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(uid).first<{ username: string | null }>();
    await db.batch([
      ...(from === 'pocket' ? applyStmts(db, uid, `pothole:${site}:${now}`, 'civic', 'pothole', -cost) : []),
      db.prepare('INSERT INTO pothole_fixes (site, uid, cost, paid_from, created_at) VALUES (?, ?, ?, ?, ?)').bind(site, uid, cost, from, now),
      // Twitter gets one VDM post per spell of roadwork, not one per pothole: the rest are in the Gazette.
      db.prepare(
        `INSERT INTO feed (uid, kind, icon, text, created_at, city) SELECT ?1, 'vdm', ?2, ?3, ?4, ?6
         WHERE NOT EXISTS (SELECT 1 FROM feed WHERE kind = 'vdm' AND icon = ?2 AND created_at > ?5)`,
      ).bind(uid, ROADS_ICON, vdmRoads(city, handle(who?.username), roadOf(site!), cost, from).slice(0, 280), now, now - ROADWORK.fixPostMs, city),
    ]);
    if (env) {
      await gazette(env, ctx, [{ uid, office, kind: 'project', icon: '🚧', text: from === 'pocket'
        ? `${official(office, who?.username)} fixed a pothole on ${roadOf(site!)} from their own pocket (${naira(cost)}).`
        : `${official(office, who?.username)} fixed a pothole on ${roadOf(site!)} with ${naira(cost)} from the treasury.` }]);
    }
    return json({ snapshot: await snapshot(db), balance: await getBalance(db, uid) });
  }

  // A street light, fixed the same way as a pothole: by whoever runs its city, from the city's budget or their pocket.
  if (path === '/api/roads/lamp' && req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as { site?: number; from?: string } | null;
    const site = body?.site;
    const city = Number.isInteger(site) ? (lampCity(site!) as CivicCity | undefined) : undefined;
    if (!city || !CIVIC_CITIES.includes(city)) return err(400, 'Unknown street light');
    const from = body?.from === 'pocket' ? 'pocket' : 'treasury';
    const office = CITY_HEAD[city];
    const gov = await db.prepare(`SELECT ${office}_uid AS head, president_uid AS president FROM civic_policies WHERE id = 1`).first<{ head: string | null; president: string | null }>();
    // A state without a government is managed by the president.
    if (!(gov?.head === uid || (!gov?.head && gov?.president === uid))) return err(403, `Only the ${OFFICE_RULES[office].title} can fix street lights in ${CITY_NAME[city]}`);
    const cost = LAMPS.fixCost;
    if (from === 'pocket' && (await getBalance(db, uid)) < cost) return err(402, `You need ${naira(cost)} to fix it yourself`);

    const claimed = await db.prepare('DELETE FROM broken_lamps WHERE site = ? RETURNING broken_at').bind(site).first<{ broken_at: number }>();
    if (!claimed) return err(409, 'That street light is already working');
    const now = Date.now();
    if (from === 'treasury') {
      const paid = await spendState(db, city, cost, { allowArrears: true });
      if (!paid) {
        await db.prepare('INSERT OR IGNORE INTO broken_lamps (site, broken_at) VALUES (?, ?)').bind(site, claimed.broken_at).run();
        return err(402, `${CITY_NAME[city]}’s budget needs ${naira(cost)} to fix this one`);
      }
    } else {
      await db.batch(applyStmts(db, uid, `lamp:${site}:${now}`, 'civic', 'lamp', -cost));
    }
    if (env) {
      const who = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(uid).first<{ username: string | null }>();
      const road = lampOf(site!)!.road;
      await gazette(env, ctx, [{ uid, office, kind: 'project', icon: '💡', text: from === 'pocket'
        ? `${official(office, who?.username)} fixed a street light on ${road} from their own pocket (${naira(cost)}).`
        : `${official(office, who?.username)} fixed a street light on ${road} with ${naira(cost)} from the treasury.` }]);
    }
    return json({ snapshot: await snapshot(db), balance: await getBalance(db, uid) });
  }

  return null;
}
