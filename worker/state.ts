// Each city's government has a treasury of its own (migration 0085). What players pay in a city lands there; every round
// the president's cut of it goes up to the federal treasury (civic_policies.treasury), the state pays its bills and keeps
// its roads, lights, markets, hospital, stadium and Government House up, and now and then something goes wrong.
// This file has no imports from the rest of the worker, so wallet.ts and everything else can use it.

import {
  ASSET_INFO, driftOf, earningOf, FEE_CHANCE, FEE_MAX_SHARE, fullRound, GOVHOUSE_SHUT, STATE_FEES, STATE_ASSETS, STATE_ROUND_MS, UNPAID_DRIFT, upkeepOf,
  DEFAULT_STATE_CAPS, DEFAULT_STATE_LAWS, STATE_LAWS, STATE_LAW_KEYS, type StateAsset, type StateCaps, type StateLaws,
} from '../src/game/treasury';
import { CIVIC_CITIES, CITY_NAME, type CivicCity } from '../src/game/civic';
import { REGION_BY_ID } from '../src/game/property';
import { whereIs } from './shards';

/** SQL for the city a player's money goes to: the state they live in (where their life began), Kaduna if unknown. `uid` is a bound placeholder. */
export const homeCitySql = (uid: string) =>
  `COALESCE((SELECT w.state FROM wallets w WHERE w.uid = ${uid} AND w.state IN ('kaduna', 'abuja', 'lagos', 'kano')), 'kaduna')`;

/** Credit a state with revenue from a player living in it. `where` is the guard on the statement (a ledger check, `changes() = 1`...). */
export const stateRevenueSql = (amount: string, uid: string, where: string, city?: CivicCity) =>
  // A fee for something done in a state (a stall's registration) goes to that state; anything else to the payer's own.
  `UPDATE state_treasuries SET balance = balance + ${amount}, incoming = incoming + ${amount} WHERE city = ${city && CIVIC_CITIES.includes(city) ? `'${city}'` : homeCitySql(uid)} AND ${where}`;

/** A state's treasury statement for a player's city, for code that has no statement guard of its own. */
export const stateRevenue = (db: D1Database, uid: string, amount: number, city?: CivicCity) =>
  // With the state named the payer isn't in the statement at all: binding them anyway makes D1 refuse it.
  city && CIVIC_CITIES.includes(city) ? db.prepare(stateRevenueSql('?1', '?2', '1', city)).bind(amount) : db.prepare(stateRevenueSql('?1', '?2', '1')).bind(amount, uid);

/**
 * The state a player is standing in right now, from the room they are connected to (it is the server's own record, not
 * something the client says): a street, a place inside it, or an estate. Undefined when they are not connected or the
 * area is not in a state (their money then goes to the state they live in).
 */
export async function cityNow(env: Env, uid: string): Promise<CivicCity | undefined> {
  try {
    const area = (await whereIs(env, uid))?.area ?? '';
    const m = /^(?:city|place):([a-z]+)/.exec(area);
    const estate = /^estate:([a-z0-9_]+):/.exec(area);
    const id = m?.[1] ?? (estate ? REGION_BY_ID[estate[1]]?.city : undefined);
    return CIVIC_CITIES.find((c) => c === id);
  } catch {
    return undefined;
  }
}

/** The city a player's money goes to. */
export async function homeCity(db: D1Database, uid: string): Promise<CivicCity> {
  const row = await db.prepare('SELECT state FROM wallets WHERE uid = ?').bind(uid).first<{ state: string | null }>().catch(() => null);
  return CIVIC_CITIES.find((c) => c === row?.state) ?? 'kaduna';
}

/** What a government spends: out of its own treasury, only if it holds that much. Null if it could not. */
export async function spendState(db: D1Database, city: CivicCity, amount: number, opts: { allowArrears?: boolean } = {}): Promise<number | null> {
  const row = await db
    .prepare(`UPDATE state_treasuries SET balance = balance - ?1 WHERE city = ?2 AND balance >= ?1 ${opts.allowArrears ? '' : 'AND arrears = 0'} RETURNING balance`)
    .bind(amount, city)
    .first<{ balance: number }>();
  return row ? row.balance : null;
}

export interface StateRow { city: CivicCity; balance: number; incoming: number; arrears: number; askAmount: number | null; askAt: number | null; incomeTax: number; bizFee: number; moveFee: number; deliveryFee: number; bizTax: number; salesTax: number; hospitalFee: number; exportLevy: number; payShare: number }
export interface AssetRow { city: CivicCity; asset: StateAsset; condition: number; level: number }

export async function loadStates(db: D1Database): Promise<{ states: StateRow[]; assets: AssetRow[] }> {
  const [states, assets] = await db.batch([
    db.prepare('SELECT city, balance, incoming, arrears, ask_amount AS askAmount, ask_at AS askAt, income_tax AS incomeTax, biz_fee AS bizFee, move_fee AS moveFee, delivery_fee AS deliveryFee, biz_tax AS bizTax, sales_tax AS salesTax, hospital_fee AS hospitalFee, export_levy AS exportLevy, pay_share AS payShare FROM state_treasuries'),
    db.prepare('SELECT city, asset, condition, level FROM state_assets'),
  ]);
  return { states: states.results as unknown as StateRow[], assets: assets.results as unknown as AssetRow[] };
}

/** A state's taxes and fees. The standard ones if the books can't be read. */
export async function lawsOf(db: D1Database, city: string): Promise<StateLaws> {
  const row = await db
    .prepare(`SELECT ${STATE_LAW_KEYS.map((k) => `${STATE_LAWS[k].column} AS ${k}`).join(', ')} FROM state_treasuries WHERE city = ?`)
    .bind(city)
    .first<StateLaws>()
    .catch(() => null);
  return row ?? DEFAULT_STATE_LAWS;
}
/** The president's maximum for each state tax and fee. */
export async function capsOf(db: D1Database): Promise<StateCaps> {
  const row = await db
    .prepare(`SELECT ${STATE_LAW_KEYS.map((k) => `${STATE_LAWS[k].capColumn} AS ${k}`).join(', ')} FROM civic_policies WHERE id = 1`)
    .first<StateCaps>()
    .catch(() => null);
  return row ?? DEFAULT_STATE_CAPS;
}
/** The taxes and fees of the state a player lives in. */
export async function homeLaws(db: D1Database, uid: string): Promise<StateLaws> {
  return lawsOf(db, await homeCity(db, uid));
}

/** How one asset of a state is holding up (100 if the migration has not run, so nothing breaks). */
export async function conditionOf(db: D1Database, city: CivicCity, asset: StateAsset): Promise<number> {
  const row = await db.prepare('SELECT condition FROM state_assets WHERE city = ? AND asset = ?').bind(city, asset).first<{ condition: number }>().catch(() => null);
  return row?.condition ?? 100;
}

/** Whether Government House is in a state to let the governor work. */
export async function houseOpen(db: D1Database, city: CivicCity): Promise<boolean> {
  return (await conditionOf(db, city, 'govhouse')) >= GOVHOUSE_SHUT;
}

/** Every city's conditions at once, for the road and light clocks. */
export async function conditionsOf(db: D1Database, asset: StateAsset): Promise<Record<string, number>> {
  const { results } = await db.prepare('SELECT city, condition FROM state_assets WHERE asset = ?').bind(asset).all<{ city: string; condition: number }>().catch(() => ({ results: [] as { city: string; condition: number }[] }));
  return Object.fromEntries(results.map((r) => [r.city, r.condition]));
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const pickOf = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export interface RoundNotice { icon: string; text: string; city: CivicCity }

/**
 * Cron: one round, once an hour. Per state: the federal cut goes up, arrears are paid first, a surprise bill may land,
 * every asset is paid for (or not) and moves in condition, and markets and the stadium bring their money in.
 * Returns what the Gazette should say.
 */
export async function runStateRound(db: D1Database, now: number): Promise<RoundNotice[]> {
  const claim = await db
    .prepare('UPDATE civic_policies SET state_round_at = ?1 WHERE id = 1 AND COALESCE(state_round_at, 0) <= ?2 RETURNING federal_cut')
    .bind(now, now - STATE_ROUND_MS)
    .first<{ federal_cut: number }>()
    .catch(() => null);
  if (!claim) return [];
  const { states, assets } = await loadStates(db);
  const notices: RoundNotice[] = [];

  for (const city of CIVIC_CITIES) {
    const state = states.find((s) => s.city === city);
    if (!state) continue;
    const mine = new Map(assets.filter((a) => a.city === city).map((a) => [a.asset, a]));
    const stmts: D1PreparedStatement[] = [];

    // 1. The federal cut of what came in since the last round goes up to the federal treasury.
    const sent = Math.floor((state.incoming * claim.federal_cut) / 100);
    stmts.push(db.prepare('UPDATE state_treasuries SET balance = balance - ?1, incoming = incoming - ?2 WHERE city = ?3 AND incoming >= ?2 AND balance >= ?1').bind(sent, state.incoming, city));
    stmts.push(db.prepare('UPDATE civic_policies SET treasury = treasury + ?1 WHERE id = 1 AND changes() = 1').bind(sent));
    let cash = state.balance - sent;
    let owed = state.arrears;

    // 2. Arrears first.
    const clear = Math.min(cash, owed);
    cash -= clear;
    owed -= clear;

    // 3. A bill nobody planned for.
    const damage = new Map<StateAsset, number>();
    if (Math.random() < FEE_CHANCE) {
      const fee = pickOf(STATE_FEES);
      const bill = Math.round((fullRound(city) * fee.rounds) / 1000) * 1000;
      const pay = Math.min(bill, Math.floor(cash * FEE_MAX_SHARE));
      cash -= pay;
      owed += bill - pay;
      if (fee.hits) damage.set(fee.hits.asset, fee.hits.condition);
      notices.push({ icon: fee.icon, city, text: `${fee.label} in ${CITY_NAME[city]}: a bill of ${naira(bill)}.${pay < bill ? ` ${naira(bill - pay)} of it is now in arrears.` : ''}` });
    }

    // 4. Upkeep, asset by asset, and what the dear ones earn.
    let earned = 0;
    const dark: string[] = [];
    for (const asset of STATE_ASSETS) {
      const row = mine.get(asset);
      if (!row) continue;
      const cost = upkeepOf(asset, city, row.level);
      const paid = cost <= cash;
      if (paid) cash -= cost;
      else owed += cost;
      const drift = paid ? driftOf(row.level) : UNPAID_DRIFT;
      const next = Math.max(0, Math.min(100, row.condition + drift - (damage.get(asset) ?? 0)));
      if (next !== row.condition) stmts.push(db.prepare('UPDATE state_assets SET condition = ?1 WHERE city = ?2 AND asset = ?3').bind(next, city, asset));
      if (next === 0 && row.condition > 0) dark.push(ASSET_INFO[asset].label);
      earned += earningOf(asset, city, next);
    }
    if (dark.length) notices.push({ icon: '🏚️', city, text: `${dark.join(' and ')} in ${CITY_NAME[city]} ${dark.length === 1 ? 'has' : 'have'} collapsed. The state could not keep ${dark.length === 1 ? 'it' : 'them'} up.` });
    cash += earned;

    // 5. Write it down. The balance is moved by what this round did, so money that arrived meanwhile is kept.
    const delta = cash - (state.balance - sent);
    stmts.push(
      db.prepare('UPDATE state_treasuries SET balance = MAX(0, balance + ?1), arrears = ?2 WHERE city = ?3').bind(delta, owed, city),
    );
    if (owed > 0 && state.arrears === 0) notices.push({ icon: '📉', city, text: `${CITY_NAME[city]} cannot pay its bills: ${naira(owed)} in arrears. The governor’s spending is frozen.` });
    await db.batch(stmts);
  }
  return notices;
}

