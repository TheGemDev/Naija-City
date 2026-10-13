// The investment market. Every venture's price is a multiple of its launch price (costPerUnit) that the server moves on
// each 5-minute cron tick and keeps as history, so every player sees the same price and the same chart.
//   GET /api/stocks → each venture's price now and its last 24 hours of history (public, edge-cached)
// The wallet checks buys and sells against these prices (worker/wallet.ts), so a client can't trade at a stale price.
//
// Ventures are made up and wander on their own. Coins (InvestmentDef.symbol) are real: each tick reads the real dollar
// price, and a unit costs exactly that in naira: its share of the coin (lot) at USD_NGN to the dollar. A coin's
// `usd:<id>` row in market_now holds the dollar price its launch price stands for (mult) and the newest one (prev).

import { INVESTMENTS, INVESTMENT_BY_ID, PRICE_BOUNDS, REAL_PRICE_STALE_MS, TICK_MS, USD_NGN, VOLATILITY, type InvestmentDef } from '../src/game/investments';

/** Only the 24-hour chart is shown; keep a little extra so pruning hourly never clips it. */
const KEEP_MS = 26 * 3_600_000;
/** Pull back toward the launch price, so prices wander but don't drift to the walls. */
const REVERSION = 0.004;
/** A rare news-style jolt on top of the usual wobble. */
const SHOCK_CHANCE = 0.006;
/** A coin that moves more than this in one tick is taken as a bad reading and skipped. */
const MAX_REAL_JUMP = 0.3;

const COINS = INVESTMENTS.filter((inv) => inv.symbol);
/** CoinGecko names coins by its own ids; it is only asked when Coinbase did not answer. */
const GECKO_ID: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin' };
const usdRow = (id: string) => `usd:${id}`;
/** The dollar price at which a unit of this coin costs exactly its launch price. Every price is a multiple of it. */
const baseUsd = (inv: InvestmentDef) => inv.costPerUnit / (USD_NGN * (inv.lot ?? 1));

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

/** One step of a mean-reverting random walk, kept inside PRICE_BOUNDS. */
export function nextMult(mult: number, risk: 'Low' | 'Medium' | 'High'): number {
  const vol = VOLATILITY[risk];
  let change = gauss() * vol + (1 - mult) * REVERSION;
  if (Math.random() < SHOCK_CHANCE) change += (Math.random() < 0.5 ? -1 : 1) * vol * (4 + Math.random() * 6);
  return Math.min(PRICE_BOUNDS.max, Math.max(PRICE_BOUNDS.min, Math.round(mult * (1 + change) * 10_000) / 10_000));
}

async function getJson<T>(url: string): Promise<T> {
  // Coinbase refuses requests with no User-Agent.
  const res = await fetch(url, { headers: { 'User-Agent': 'naija-city', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

const realPrice = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/** Today's real dollar price per coin id. A coin is left out when neither source gave one. */
async function realPrices(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(COINS.map(async (inv) => {
    try {
      const d = await getJson<{ data?: { amount?: string } }>(`https://api.coinbase.com/v2/prices/${inv.symbol}-USD/spot`);
      const price = realPrice(Number(d.data?.amount));
      if (price) out[inv.id] = price;
    } catch { /* the other source is asked below */ }
  }));
  const missing = COINS.filter((inv) => !out[inv.id] && GECKO_ID[inv.symbol!]);
  if (missing.length) {
    try {
      const d = await getJson<Record<string, { usd?: number }>>(`https://api.coingecko.com/api/v3/simple/price?ids=${missing.map((inv) => GECKO_ID[inv.symbol!]).join(',')}&vs_currencies=usd`);
      for (const inv of missing) {
        const price = realPrice(d[GECKO_ID[inv.symbol!]]?.usd);
        if (price) out[inv.id] = price;
      }
    } catch (error) {
      console.error('No real price for', missing.map((inv) => inv.symbol).join(', '), error);
    }
  }
  return out;
}

/** The real last day of a coin as [time, dollar price] on the 5-minute beat, oldest first. Empty when it can't be had. */
async function realDay(inv: InvestmentDef, until: number): Promise<[number, number][]> {
  try {
    // Rows are [start in seconds, low, high, open, close, volume]; the close is the price at the end of the 5 minutes.
    const rows = await getJson<number[][]>(`https://api.exchange.coinbase.com/products/${inv.symbol}-USD/candles?granularity=${TICK_MS / 1000}`);
    return rows
      .map((r): [number, number] => [r[0] * 1000 + TICK_MS, r[4]])
      .filter(([at, price]) => at < until && at >= until - 86_400_000 && at % TICK_MS === 0 && realPrice(price))
      .sort((a, b) => a[0] - b[0]);
  } catch {
    return [];
  }
}

const roundMult = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/** Cron: add this tick's price for every venture, and keep `market_now` (the newest two prices) in step.
 *  A venture with no history yet is back-filled with a day so its chart isn't empty on day one: simulated, or the real day for a coin. */
export async function tickMarket(db: D1Database, now: number): Promise<void> {
  const t = Math.floor(now / TICK_MS) * TICK_MS;
  const latest = await currentPrices(db);
  const known = new Set((await db.prepare('SELECT inv_id FROM market_now').all<{ inv_id: string }>()).results.map((r) => r.inv_id));
  const usd = COINS.length ? await realPrices() : {};
  const listed = COINS.length ? await listedAt(db) : {};
  const stmts: D1PreparedStatement[] = [];
  for (const inv of INVESTMENTS) {
    const insert = (at: number, mult: number) => stmts.push(db.prepare('INSERT OR IGNORE INTO market_ticks (inv_id, t, mult) VALUES (?, ?, ?)').bind(inv.id, at, mult));
    const setNow = (mult: number) =>
      // `t < ?` so a cron that runs twice in one tick can't step the price twice.
      stmts.push(db.prepare('UPDATE market_now SET prev = mult, mult = ?2, t = ?3 WHERE inv_id = ?1 AND t < ?3').bind(inv.id, mult, t));
    if (inv.symbol) {
      // No price this tick: nothing is written, and the coin stops trading once its last price is REAL_PRICE_STALE_MS old.
      const price = usd[inv.id];
      if (!price) continue;
      const base = baseUsd(inv);
      const next = roundMult(price / base);
      if (!known.has(inv.id) || !listed[inv.id]) {
        // Listing day: the chart is the coin's real last day.
        let prev = next;
        for (const [at, was] of await realDay(inv, t)) { prev = roundMult(was / base); insert(at, prev); }
        insert(t, next);
        stmts.push(db.prepare('INSERT OR REPLACE INTO market_now (inv_id, mult, prev, t) VALUES (?, ?, ?, ?)').bind(inv.id, next, prev, t));
        stmts.push(db.prepare('INSERT OR REPLACE INTO market_now (inv_id, mult, prev, t) VALUES (?, ?, ?, ?)').bind(usdRow(inv.id), base, price, t));
        continue;
      }
      // The rate, the size of a unit or the launch price changed since the last tick (or the coin was listed before
      // prices were tied to the dollar): move its chart and its last two prices onto today's scale before stepping on.
      const rescale = listed[inv.id] / base;
      if (Math.abs(rescale - 1) > 1e-9) {
        stmts.push(db.prepare('UPDATE market_ticks SET mult = ROUND(mult * ?2, 6) WHERE inv_id = ?1').bind(inv.id, rescale));
        stmts.push(db.prepare('UPDATE market_now SET mult = ROUND(mult * ?2, 6), prev = ROUND(prev * ?2, 6) WHERE inv_id = ?1').bind(inv.id, rescale));
        stmts.push(db.prepare('UPDATE market_now SET mult = ?2 WHERE inv_id = ?1').bind(usdRow(inv.id), base));
      }
      const q = latest[inv.id];
      if (t - q.t < REAL_PRICE_STALE_MS && Math.abs(next / (q.now * rescale) - 1) > MAX_REAL_JUMP) {
        console.error('Skipped a wild price for', inv.symbol, price);
        continue;
      }
      insert(t, next);
      // Back after a gap: the price from before it is no longer one to trade at, so it is not kept as the previous one.
      if (t - q.t < REAL_PRICE_STALE_MS) setNow(next);
      else stmts.push(db.prepare('UPDATE market_now SET prev = ?2, mult = ?2, t = ?3 WHERE inv_id = ?1 AND t < ?3').bind(inv.id, next, t));
      stmts.push(db.prepare('UPDATE market_now SET prev = ?2, t = ?3 WHERE inv_id = ?1').bind(usdRow(inv.id), price, t));
    } else if (!known.has(inv.id)) {
      let mult = 1;
      let prev = 1;
      for (let i = 288; i >= 0; i--) { prev = mult; mult = nextMult(mult, inv.risk); insert(t - i * TICK_MS, mult); }
      stmts.push(db.prepare('INSERT OR IGNORE INTO market_now (inv_id, mult, prev, t) VALUES (?, ?, ?, ?)').bind(inv.id, mult, prev, t));
    } else {
      const next = nextMult(latest[inv.id].now, inv.risk);
      insert(t, next);
      setNow(next);
    }
  }
  // Pruning scans the old end of the table; once an hour is plenty.
  if (t % 3_600_000 === 0) stmts.push(db.prepare('DELETE FROM market_ticks WHERE t < ?').bind(t - KEEP_MS));
  // D1 batches stay small; a first-run back-fill of several new ventures is a couple of thousand statements.
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
}

/** Per coin id: the dollar price its stored prices are multiples of (baseUsd when they were written). */
async function listedAt(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT inv_id, mult FROM market_now WHERE inv_id LIKE 'usd:%'").all<{ inv_id: string; mult: number }>();
  return Object.fromEntries(results.map((r) => [r.inv_id.slice(4), r.mult]));
}

/** The newest two price multiples per venture (1 for a venture with no history yet), and when the newest came in. */
export async function currentPrices(db: D1Database): Promise<Record<string, { now: number; prev: number; t: number }>> {
  const { results } = await db.prepare('SELECT inv_id, mult, prev, t FROM market_now').all<{ inv_id: string; mult: number; prev: number; t: number }>();
  const out: Record<string, { now: number; prev: number; t: number }> = {};
  for (const inv of INVESTMENTS) out[inv.id] = { now: 1, prev: 1, t: 0 };
  for (const r of results) if (out[r.inv_id]) out[r.inv_id] = { now: r.mult, prev: r.prev, t: r.t };
  return out;
}

/** Whether a venture can be traded right now. Only a real coin can be shut: not listed yet, or its price is too old to trust. */
export const tradable = (inv: InvestmentDef, q: { t: number }, now: number) => !inv.symbol || now - q.t < REAL_PRICE_STALE_MS;

/** History for the charts: the last 24 hours at full resolution. */
export async function readMarket(db: D1Database) {
  const at = Date.now();
  const since = at - 86_400_000;
  const { results } = await db
    .prepare('SELECT inv_id, t, mult FROM market_ticks WHERE t > ? ORDER BY t ASC')
    .bind(since)
    .all<{ inv_id: string; t: number; mult: number }>();
  const points: Record<string, [number, number][]> = {};
  for (const inv of INVESTMENTS) points[inv.id] = [];
  for (const r of results) points[r.inv_id]?.push([r.t, Math.round(INVESTMENT_BY_ID[r.inv_id].costPerUnit * r.mult)]);
  const now = await currentPrices(db);
  const usd = COINS.length
    ? Object.fromEntries((await db.prepare("SELECT inv_id, prev FROM market_now WHERE inv_id LIKE 'usd:%'").all<{ inv_id: string; prev: number }>()).results.map((r) => [r.inv_id.slice(4), r.prev]))
    : {};
  return {
    tickMs: TICK_MS,
    ventures: Object.fromEntries(INVESTMENTS.map((inv) => [inv.id, {
      mult: now[inv.id].now,
      price: Math.round(inv.costPerUnit * now[inv.id].now),
      points: points[inv.id],
      // Coins only: the real dollar price, and whether trading is shut because that price stopped coming in.
      ...(inv.symbol ? { usd: usd[inv.id] ?? null, closed: !tradable(inv, now[inv.id], at) } : {}),
    }])),
  };
}
