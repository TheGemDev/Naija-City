// The numbers the office holders set (tax, loan rate, police funding from the president's allocation, the crime laws), kept in KV.
// Nearly every money and crime route needs one of them and they change only when an office holder moves a slider,
// so they are read from KV and D1 is asked only when the copy has expired or a policy has just changed.

import { env } from 'cloudflare:workers';
import { CIVIC_CITIES, type CivicCity } from '../src/game/civic';

// STATS_KV is declared on the global Env (worker/cfTraffic.ts), which the generated Cloudflare.Env does not include.
const kv = () => (env as Env).STATS_KV;

export interface Policy {
  taxRate: number;
  loanRate: number;
  policeFunding: number;
  patrols: number;
  jailMinutes: number;
  finePct: number;
  reportHours: number;
  /** Percent of every player-to-player transfer the treasury takes. */
  transferFee: number;
  /** The cities whose government has banned okada. Missing on a copy cached before the ban existed. */
  okadaBan?: CivicCity[];
  /** The President's fare subsidy, percent off airline seats and train tickets (src/game/transport.ts). Missing on an older copy. */
  airSubsidy?: number;
  railSubsidy?: number;
}

const KEY = 'civic:policy';
/** The copy expires on its own, so a value changed outside the game (a migration, the dashboard) still shows up. */
const TTL_SECONDS = 600;

async function fromD1(db: D1Database): Promise<Policy | null> {
  const p = await db
    .prepare('SELECT * FROM civic_policies WHERE id = 1')
    .first<{ tax_rate: number; loan_rate: number; police_funding: number; patrols: number; jail_minutes: number; fine_pct: number; report_hours: number; transfer_fee: number } & Record<string, number | null>>();
  if (!p) return null;
  return {
    taxRate: p.tax_rate, loanRate: p.loan_rate, policeFunding: p.police_funding, patrols: p.patrols,
    jailMinutes: p.jail_minutes, finePct: p.fine_pct, reportHours: p.report_hours, transferFee: p.transfer_fee,
    okadaBan: CIVIC_CITIES.filter((city) => !!p[`okada_ban_${city}`]),
    airSubsidy: Number(p.air_subsidy ?? 0),
    railSubsidy: Number(p.rail_subsidy ?? 0),
  };
}

async function store(policy: Policy) {
  // A failed write only means the next request asks D1 again.
  await kv()?.put(KEY, JSON.stringify(policy), { expirationTtl: TTL_SECONDS }).catch(() => {});
}

/** The policies in force. Can be up to a minute behind a change (KV), which is fine for a rate or a law. */
export async function loadPolicy(db: D1Database): Promise<Policy | null> {
  try {
    const cached = await kv()?.get<Policy>(KEY, 'json');
    if (cached) return cached;
  } catch {
    /* fall through to D1 */
  }
  const policy = await fromD1(db);
  if (policy) await store(policy);
  return policy;
}

/** Call after any change to the policy columns, so KV carries the new numbers. */
export async function refreshPolicy(db: D1Database) {
  const policy = await fromD1(db);
  if (policy) await store(policy);
}
