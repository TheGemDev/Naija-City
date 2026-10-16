// Stealing from other players, and the police.
//
// Pickpocketing needs the thief standing next to the victim (same building, checked against the live
// positions in the Room). Burglary needs the thief at the victim's house in an estate; it takes cash and
// one piece of furniture, which is fenced on the spot. Both can fail (better-funded police catch more).
// Every attempt is recorded, and the victim can report it in the Police app. That puts out a warrant:
// a player with the Police job has to walk up to the thief and arrest them (keeping a share as a
// reward), or the NPC police pick them up once the manhunt runs out. On arrest the thief pays back what
// they took (as far as their wallet allows), pays the fine, and sits in a cell unless someone pays bail.
//
// Players can pay for protection (a bodyguard against pickpockets, a mai-gadi at the house): it cuts the
// thief's odds, and a thief it stops is caught in the act, so the warrant goes out at once. Victims can
// also put a bounty on a wanted thief; then anyone, not just officers, can arrest them to collect it.
//
// A burglary nobody saw is unsolved: the owner isn't told who did it. They can accuse up to three players
// (once per case); if the thief is one of them, the item goes back to the owner and the thief is arrested.

import { POLICE_KEEP_MS } from './prune';
import { stateRevenue } from './state';
import type { FirebaseUser } from './auth';
import { handle, naira, postFeed } from './feed';
import { vdmStatements } from './vdm';
import { vdmPass, type VdmFacts, type VdmTopic } from '../src/game/vdm';
import { searchPhone } from './phoneSearch';
import { applyStmts, ensureWallet, getBalance } from './wallet';
import { ownedCounts } from './progress';
import { ITEMS, JOBS, stealSeconds } from '../src/game/catalog';
import { houseRect } from '../src/game/estate';
import { PLOTS } from '../src/game/property';
import { MAX_GRID_H, MAX_GRID_W, footprint, houseLayout, itemTransform, type PlacedItem } from '../src/game/grid';
import { cleanExtensions, layoutKey } from '../src/game/exterior';
import { cameraSpotting } from '../src/game/security';
import { camerasPowered, type PowerSave } from '../src/game/power';
import { gridOn } from '../src/game/live';
import { sendPush } from './push';
import { FEDERAL_KINDS, STATE_KINDS } from '../src/game/treasury';
import {
  ACCUSE, bailFor, BOUNTY, CATCH, VDM, CRIME, unsolved, DEFAULT_LAWS, POLICE, CATCHERS,
  type CatcherKind, type CrimeKind, type CrimeLaws, type CrimeReport, type Prisoner, type Protection, type WantedPerson,
} from '../src/game/crime';
import { notifyPlayer, whereIs, roomOf } from './shards';
import { loadPolicy } from './policy';


const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

/** Feed kind for a thief caught or arrested: Twitter shows it as a police post with their mugshot (src/game/mugshot.ts). */
const MUGSHOT = 'mugshot';
/** Thefts by one thief from one victim this close together are one visit to the house. */
const SAME_VISIT_MS = 3600_000;

interface CrimeRow {
  id: number;
  /** Done with a gun (migration 0098): at gunpoint, or a shooting. */
  armed?: string | null;
  thief_uid: string;
  victim_uid: string;
  kind: CrimeKind;
  success: number;
  amount: number;
  item: string | null;
  status: 'open' | 'wanted' | 'arrested';
  returned: number;
  created_at: number;
  reported_at: number | null;
  officer_uid: string | null;
  reward: number;
  fine: number;
  bounty: number;
  guard: CatcherKind | null;
  soaped?: number;
  accused?: string | null;
  held?: number;
  recovered?: number;
  origin?: string | null;
  vdm_at?: number | null;
  vdm_asked_at?: number | null;
}

type NamedRow = CrimeRow & { thief: string | null; victim: string | null; officer?: string | null };

/** forVictim: the victim of an unsolved burglary doesn't learn who did it until the arrest. */
const toReport = (r: NamedRow, forVictim = false): CrimeReport => ({
  id: r.id, kind: r.kind, success: !!r.success, amount: r.amount, item: r.item, status: r.status, returned: r.returned,
  fine: r.fine, reportedAt: r.reported_at, officer: r.officer ?? null, bounty: r.bounty, guard: r.guard,
  at: r.created_at, victim: r.victim ?? 'someone',
  thief: forVictim && r.status !== 'arrested' && unsolved({ kind: r.kind, success: !!r.success, guard: r.guard }) ? 'someone' : r.thief ?? 'someone',
  accused: r.accused ? (JSON.parse(r.accused) as string[]) : null,
  recovered: !!r.recovered,
  confiscated: !!r.recovered && !!r.held,
  vdm: !!r.vdm_at,
  vdmAsked: r.vdm_asked_at ?? null,
  armed: r.armed === 'rob' || r.armed === 'shoot' ? r.armed : null,
});

/** Give a stolen piece of furniture back: into the owner's storage, and off the thief if they kept it. */
async function recoverItem(db: D1Database, row: CrimeRow) {
  const type = row.item;
  if (!type || !ITEMS[type] || row.recovered) return false;
  const claimed = await db.prepare('UPDATE crimes SET recovered = 1 WHERE id = ? AND recovered = 0 RETURNING id').bind(row.id).first();
  if (!claimed) return false;
  const now = Date.now();
  const stmts = [
    db.prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) VALUES (?1, ?2, 'stolen_in', ?3, 0, 1, ?4) ON CONFLICT(uid, client_id) DO NOTHING`)
      .bind(row.victim_uid, `crime:${row.id}:recovered`, type, now),
  ];
  if (row.held) {
    stmts.push(db.prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) VALUES (?1, ?2, 'stolen', ?3, 0, 1, ?4) ON CONFLICT(uid, client_id) DO NOTHING`)
      .bind(row.thief_uid, `crime:${row.id}:confiscated`, type, now));
  }
  await db.batch(stmts);
  // saved_at stays as it is in both saves, so neither player's next upload is refused as an old copy.
  type Save = { items?: PlacedItem[]; furnitureInventory?: PlacedItem[]; activeHouseId?: string | null; properties?: { items?: PlacedItem[] }[] };
  const edit = async (uid: string, change: (save: Save) => boolean) => {
    const r = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>();
    if (!r) return;
    let save: Save;
    try {
      save = JSON.parse(r.data);
    } catch {
      return;
    }
    if (change(save)) await db.prepare('UPDATE saves SET data = ? WHERE uid = ? AND data = ?').bind(JSON.stringify(save), uid, r.data).run();
  };
  let origin: { propertyId: string | null; item: PlacedItem } | null = null;
  try {
    origin = row.origin ? JSON.parse(row.origin) : null;
  } catch {
    origin = null;
  }
  await edit(row.victim_uid, (save) => {
    // Back where it stood, if that house still exists and the spot is free; otherwise into storage.
    const o = origin?.item;
    if (o && o.type === type) {
      const list = livedIn(save, origin!.propertyId) ? save.items : save.properties?.find((p) => (p as { id?: string }).id === origin!.propertyId)?.items;
      const free = !!list && Number.isFinite(o.x) && Number.isFinite(o.z) && o.x >= 0 && o.z >= 0 && o.x < MAX_GRID_W && o.z < MAX_GRID_H
        && !list.some((x) => x.id === o.id)
        && !list.some((x) => ITEMS[x.type]?.layer === ITEMS[type].layer && footprint(x).some((a) => footprint(o).some((b) => a.x === b.x && a.z === b.z)));
      if (free) {
        list!.push(o);
        return true;
      }
    }
    save.furnitureInventory = [...(save.furnitureInventory ?? []), { id: `recovered-${row.id}`, type, x: 0, z: 0, rot: 0 }];
    return true;
  });
  if (row.held) {
    await edit(row.thief_uid, (save) => {
      const lists = [save.furnitureInventory, save.items, ...(save.properties ?? []).map((p) => p.items)];
      for (const list of lists) {
        const i = list?.findIndex((x) => x?.type === type) ?? -1;
        if (i >= 0) {
          list!.splice(i, 1);
          return true;
        }
      }
      return false;
    });
  }
  return true;
}

/** Tell the owner about a burglary nobody saw: live if they're online, and a push for when they get back. */
function tellOwner(env: Env, ctx: ExecutionContext, victim: string, crime: CrimeReport) {
  const masked = { ...crime, thief: 'someone' };
  notify(env, ctx, victim, { t: 'robbed', crime: masked });
  const item = crime.item ? ITEMS[crime.item]?.name ?? crime.item : null;
  sendPush(env, ctx, victim, {
    title: '🏚️ Your house was broken into',
    body: `${item ? `Your ${item} was stolen. ` : ''}Open the Police app and accuse up to ${ACCUSE.max} suspects.`,
    tag: `burglary-${crime.id}`,
    category: 'crime', app: 'police',
  });
}


function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}

/** The laws in force right now, set by the IGP and EFCC chair (worker/civic.ts). */
export async function loadLaws(db: D1Database): Promise<CrimeLaws> {
  const p = await loadPolicy(db);
  if (!p) return DEFAULT_LAWS;
  return { policeFunding: p.policeFunding, patrols: p.patrols, jailMinutes: p.jailMinutes, finePct: p.finePct, reportHours: p.reportHours };
}

export const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function houseHasSecurity(
  save: { minutes?: number; properties?: { id?: string; staff?: { role?: string; paidThrough?: number }[] }[] },
  propertyId: string,
) {
  const today = Math.floor((Number(save.minutes) || 0) / 1440);
  return (save.properties?.find((property) => property.id === propertyId)?.staff ?? [])
    .some((staff) => staff?.role === 'security' && (staff.paidThrough ?? -1) >= today);
}

/** Hired, paid household security reports a burglar and triggers the existing arrest flow. */
export async function securityCatch(env: Env, ctx: ExecutionContext, thief: string, victim: string, propertyId: string) {
  const row = await env.DB.prepare('SELECT data FROM saves WHERE uid = ?').bind(victim).first<{ data: string }>();
  if (!row) return false;
  let save: { minutes?: number; properties?: { id?: string; staff?: { role?: string; paidThrough?: number }[] }[] };
  try {
    save = JSON.parse(row.data);
  } catch {
    return false;
  }
  if (!houseHasSecurity(save, propertyId)) return false;
  const now = Date.now();
  const crime = await env.DB.prepare(
    `INSERT INTO crimes (thief_uid, victim_uid, kind, success, status, reported_at, guard, created_at)
     VALUES (?1, ?2, 'burglary', 0, 'wanted', ?3, 'gateman', ?3) RETURNING id`,
  ).bind(thief, victim, now).first<{ id: number }>();
  if (!crime) throw new Error('Could not record the security arrest');
  await markCaught(env.DB, thief, victim, now);
  await settle(env, ctx, thief, null);
  return true;
}

/**
 * Is this the house its owner is living in? That one keeps its furniture in save.items, which is what a visitor is
 * shown (houseOf in worker/social.ts); its property record only holds a copy, and the copy can be behind.
 * Any other house's furniture is in its property record.
 */
const livedIn = (save: { activeHouseId?: string | null }, propertyId: string | null | undefined) => !propertyId || propertyId === (save.activeHouseId ?? null);

type HouseSave = PowerSave & {
  items?: PlacedItem[];
  activeHouseId?: string | null;
  wallEdits?: Record<string, unknown>;
  properties?: { id?: string; design?: string | null; items?: PlacedItem[] }[];
};

/** A camera identifies a burglar at (x, z); the owner can file a report to start the manhunt. */
async function cameraCatch(env: Env, ctx: ExecutionContext, thief: string, victim: string, propertyId: string | null, x: number, z: number) {
  const row = await env.DB.prepare('SELECT data FROM saves WHERE uid = ?').bind(victim).first<{ data: string }>();
  if (!row) return false;
  let save: HouseSave;
  try {
    save = JSON.parse(row.data);
  } catch {
    return false;
  }
  const property = propertyId ? save.properties?.find((p) => p.id === propertyId) : undefined;
  const items = ((livedIn(save, propertyId) ? save.items : property?.items) ?? [])
    .filter((i) => i && typeof i.type === 'string' && Number.isInteger(i.x) && Number.isInteger(i.z) && Number.isInteger(i.rot));
  const walls = save.wallEdits?.[propertyId ?? 'starter'];
  const layout = houseLayout(layoutKey(property?.design, cleanExtensions((property as { extensions?: unknown } | undefined)?.extensions)), Array.isArray(walls) ? walls.filter((k): k is string => typeof k === 'string') : []);
  // Power follows the owner: if they're not at this house, the lights (and cameras) are off.
  const ownerHere = (propertyId ?? 'starter') === (save.activeHouseId ?? 'starter');
  if (!ownerHere) return false;
  // No power, no pictures: the cameras need NEPA, solar or a running generator.
  if (!camerasPowered(save, items, gridOn())) return false;
  if (!cameraSpotting(items, layout, x, z)) return false;
  const existing = await env.DB.prepare(
    `SELECT id, created_at FROM crimes WHERE thief_uid = ?1 AND victim_uid = ?2 AND guard = 'camera' AND status IN ('open', 'wanted')
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(thief, victim).first<{ id: number; created_at: number }>();
  const now = Date.now();
  if (existing) {
    // Still the visit they were filmed on (the lockout keeps them out after it): nothing new to record.
    if (now - existing.created_at < CATCH.lockoutMs) return true;
    // Back at a house that already has their face on film: the police come straight away.
    await env.DB.prepare(`UPDATE crimes SET status = 'wanted', reported_at = ?2 WHERE id = ?1 AND status = 'open'`).bind(existing.id, now).run();
    await markCaught(env.DB, thief, victim, now);
    await settle(env, ctx, thief, null);
    const name = (await usernames(env.DB, [thief])).get(thief) ?? 'someone';
    sendPush(env, ctx, victim, { title: '📹 CCTV caught a burglar', body: `@${name} came back to your house and the police arrested them.`, tag: 'cctv', category: 'crime', app: 'police' });
    return true;
  }
  const crime = await env.DB.prepare(
    `INSERT INTO crimes (thief_uid, victim_uid, kind, success, status, reported_at, guard, created_at)
     VALUES (?1, ?2, 'burglary', 0, 'open', NULL, 'camera', ?3) RETURNING id`,
  ).bind(thief, victim, now).first<{ id: number }>();
  if (!crime) throw new Error('Could not record the camera catch');
  await markCaught(env.DB, thief, victim, now);
  const names = await usernames(env.DB, [thief, victim]);
  const thiefName = names.get(thief) ?? 'someone';
  // The footage goes straight to the police: most of the time they pick the burglar up before they can get away.
  if (rand() < CRIME.cameraArrestChance) {
    await env.DB.prepare(`UPDATE crimes SET status = 'wanted', reported_at = ?2 WHERE id = ?1`).bind(crime.id, now).run();
    await settle(env, ctx, thief, null);
    sendPush(env, ctx, victim, { title: '📹 CCTV caught a burglar', body: `@${thiefName} was filmed in your house and the police arrested them.`, tag: 'cctv', category: 'crime', app: 'police' });
    return true;
  }
  const report: CrimeReport = {
    id: crime.id, kind: 'burglary', success: false, amount: 0, item: null, status: 'open',
    returned: 0, at: now, reportedAt: null, guard: 'camera', bounty: 0, thief: thiefName, victim: names.get(victim) ?? 'someone',
  };
  notify(env, ctx, victim, { t: 'robbed', crime: report });
  sendPush(env, ctx, victim, { title: '📹 CCTV identified a burglar', body: `@${thiefName} was caught on camera. Open Police to file a report.`, tag: 'cctv', category: 'crime', app: 'police' });
  return true;
}

/**
 * Moves up to `amount` from one wallet to another in one transaction (to = null: paid to the state).
 * The payer is never taken below zero: the amount is capped at their balance inside the transaction.
 * Returns what actually moved.
 */
/** Spend one charge of a Baba perk. True if they had one. */
export async function usePerk(db: D1Database, uid: string, perk: string) {
  const r = await db
    .prepare('UPDATE baba_perks SET charges = charges - 1 WHERE uid = ? AND perk = ? AND charges > 0 RETURNING charges')
    .bind(uid, perk)
    .first();
  return !!r;
}

export async function transfer(db: D1Database, from: string, to: string | null, amount: number, kindOut: string, kindIn: string, ref: string): Promise<number> {
  const tx = `${ref}:${crypto.randomUUID()}`;
  const now = Date.now();
  const ok = `EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`;
  const results = await db.batch<{ amount: number }>([
    ensureWallet(db, from),
    ensureWallet(db, to ?? from),
    db
      .prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
         SELECT ?1, ?2, ?3, ?4, -MIN(?5, balance), ?6 FROM wallets WHERE uid = ?1 AND balance > 0`,
      )
      .bind(from, tx, kindOut, to ?? 'state', amount, now),
    db
      .prepare(`UPDATE wallets SET balance = balance + (SELECT amount FROM ledger WHERE uid = ?1 AND client_id = ?2), updated_at = ?3 WHERE uid = ?1 AND ${ok}`)
      .bind(from, tx, now),
    db
      .prepare(`UPDATE wallets SET balance = balance - (SELECT amount FROM ledger WHERE uid = ?1 AND client_id = ?2), updated_at = ?4 WHERE uid = ?3 AND ${ok}`)
      .bind(from, tx, to ?? '', now),
    db
      .prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?3, ?2, ?4, ?1, -amount, 1, ?5 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0 AND ?3 != ''`,
      )
      .bind(from, tx, to ?? '', kindIn, now),
    db.prepare(`UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2`).bind(from, tx),
    db.prepare(`SELECT -amount AS amount FROM ledger WHERE uid = ?1 AND client_id = ?2`).bind(from, tx),
  ]);
  const paid = results[7].results[0]?.amount ?? 0;
  // Fines, bail and the like are paid to nobody: that nobody is the state, so the treasury keeps them.
  if (!to && paid > 0 && STATE_KINDS.has(kindOut)) await stateRevenue(db, from, paid).run();
  else if (!to && paid > 0 && FEDERAL_KINDS.has(kindOut)) await db.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(paid).run();
  return paid;
}

/** When each kind of protection a player paid for runs out (null: none, or expired). */
export async function loadProtection(db: D1Database, uid: string): Promise<Protection> {
  const r = await db.prepare('SELECT bodyguard_until, gateman_until FROM protection WHERE uid = ?').bind(uid).first<{ bodyguard_until: number | null; gateman_until: number | null }>();
  const live = (t: number | null | undefined) => (t && t > Date.now() ? t : null);
  return { bodyguard: live(r?.bodyguard_until), gateman: live(r?.gateman_until) };
}

/** Takes one random piece of furniture from the victim's save, if they own any. Returns its type. */
async function takeItem(db: D1Database, victim: string, crimeId: number): Promise<string | null> {
  const row = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(victim).first<{ data: string }>();
  if (!row) return null;
  const save = JSON.parse(row.data) as { items?: { id: string; type: string }[] };
  const owned = await ownedCounts(db, victim);
  const loot = (save.items ?? []).filter((i) => ITEMS[i.type] && !ITEMS[i.type].fixed && (owned.get(i.type) ?? 0) > 0);
  if (!loot.length) return null;
  const pick = loot[Math.floor(rand() * loot.length)];
  save.items = save.items!.filter((i) => i !== pick);
  // saved_at stays as it is, so the victim's next upload isn't refused as coming from an old copy.
  await db.batch([
    db.prepare('UPDATE saves SET data = ? WHERE uid = ?').bind(JSON.stringify(save), victim),
    db
      .prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) VALUES (?1, ?2, 'stolen', ?3, 0, 1, ?4) ON CONFLICT(uid, client_id) DO NOTHING`)
      .bind(victim, `crime:${crimeId}:item`, pick.type, Date.now()),
  ]);
  return pick.type;
}

export async function jailedUntil(db: D1Database, uid: string) {
  const r = await db.prepare('SELECT jailed_until FROM players WHERE uid = ?').bind(uid).first<{ jailed_until: number | null }>();
  return r?.jailed_until && r.jailed_until > Date.now() ? r.jailed_until : null;
}

/**
 * SET clause that locks a player up until ?2 (or longer if they already are) and writes ?4, a JSON list of
 * offences, on their charge sheet: added to the sheet if they are still inside at ?3, a fresh sheet otherwise.
 */
export const JAIL_SET = `jail_charge = CASE WHEN COALESCE(jailed_until, 0) > ?3 AND json_valid(jail_charge)
    THEN (SELECT json_group_array(value) FROM (
      SELECT value FROM json_each(players.jail_charge)
      UNION ALL
      SELECT value FROM json_each(?4) WHERE value NOT IN (SELECT value FROM json_each(players.jail_charge))))
    ELSE ?4 END,
  jailed_until = MAX(COALESCE(jailed_until, 0), ?2)`;

/** Every arrest goes through here (or JAIL_SET), so nobody sits in a cell without a charge. */
export const jailStmt = (db: D1Database, uid: string, until: number, charges: string[]) =>
  db.prepare(`UPDATE players SET ${JAIL_SET} WHERE uid = ?1`).bind(uid, until, Date.now(), JSON.stringify(charges));

/** What someone in a cell is charged with, one line per offence (empty if they are free). */
export async function chargeSheet(db: D1Database, uid: string): Promise<string[]> {
  const r = await db.prepare('SELECT jail_charge FROM players WHERE uid = ? AND jailed_until > ?').bind(uid, Date.now()).first<{ jail_charge: string | null }>();
  try {
    const lines: unknown = JSON.parse(r?.jail_charge ?? '[]');
    return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

/** A theft as it reads on the charge sheet. */
const theftCharge = (c: CrimeReport) => {
  const loot = c.amount ? ` · ${naira(c.amount)}` : '';
  const item = c.item ? `, took the ${ITEMS[c.item]?.name ?? c.item}` : '';
  return c.kind === 'burglary' ? `Burglary at ${handle(c.victim)}'s house${item}${loot}` : `Pickpocketing ${handle(c.victim)}${loot}`;
};

/** When a beaten burglar recovers (ms), or null. */
export async function injuredUntil(db: D1Database, uid: string) {
  const r = await db.prepare('SELECT injured_until FROM players WHERE uid = ?').bind(uid).first<{ injured_until: number | null }>();
  return r?.injured_until && r.injured_until > Date.now() ? r.injured_until : null;
}

/**
 * A burglar was caught at this owner's house: note when, so they can't break in there again for a while.
 * A zero-naira ledger line (like the 'stolen' ones), so every kind of catch counts, with or without a police case.
 */
export const markCaught = (db: D1Database, thief: string, victim: string, now = Date.now()) =>
  db.prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) VALUES (?1, ?2, 'caught', ?3, 0, 1, ?4)`)
    .bind(thief, `caught:${crypto.randomUUID()}`, victim, now)
    .run();

/** When a burglar who was caught at this owner's house may break in there again (ms), or null. */
export async function lockedOutUntil(db: D1Database, thief: string, victim: string) {
  const r = await db
    .prepare(`SELECT MAX(created_at) AS at FROM ledger WHERE uid = ?1 AND kind = 'caught' AND ref = ?2 AND created_at > ?3`)
    .bind(thief, victim, Date.now() - CATCH.lockoutMs)
    .first<{ at: number | null }>();
  return r?.at ? r.at + CATCH.lockoutMs : null;
}

/** A burglar just got in. If the owner is home in that very house, tell them so they can catch the thief. */
export async function alertOwner(env: Env, ctx: ExecutionContext, thief: string, owner: string, propertyId: string | null) {
  const [there, row] = await Promise.all([
    whereIs(env, owner),
    env.DB.prepare('SELECT data FROM saves WHERE uid = ?').bind(owner).first<{ data: string }>(),
  ]);
  if (there?.area !== 'home' || !row) return;
  let save: { activeHouseId?: string | null; homePropertyId?: string | null };
  try {
    save = JSON.parse(row.data);
  } catch {
    return;
  }
  if (propertyId && (save.activeHouseId ?? save.homePropertyId ?? null) !== propertyId) return;
  const names = await usernames(env.DB, [thief]);
  notify(env, ctx, owner, { t: 'intruder', thief, username: names.get(thief) ?? 'someone', until: Date.now() + CATCH.promptMs });
}

/** Is the thief close enough? Pickpockets: next to the victim. Burglars: at the victim's house. */
async function checkScene(env: Env, me: string, target: string, kind: CrimeKind, slot: unknown): Promise<string | null> {
  const here = await whereIs(env, me);
  if (!here) return 'Go online in the game first';
  if (kind === 'pickpocket') {
    const there = await whereIs(env, target);
    if (!there || there.area !== here.area || !here.area.startsWith('place:')) return 'They are not here';
    if (Math.hypot(there.x - here.x, there.z - here.z) > CRIME.reach) return 'Get closer first';
    return null;
  }
  const m = here.area.match(/^estate:([\w-]+):(\d+)$/);
  if (!m || !Number.isInteger(slot)) return 'Go to their house first';
  const plot = await env.DB.prepare('SELECT plot, stage FROM estate_plots WHERE region = ? AND slot = ? AND uid = ?')
    .bind(m[1], slot, target)
    .first<{ plot: keyof typeof PLOTS; stage: number }>();
  if (!plot) return 'That isn’t their house';
  if (plot.stage < 2) return 'There’s nothing to break into yet';
  const r = houseRect(slot as number, plot.plot);
  const dx = Math.max(r.x0 - here.x, 0, here.x - r.x1);
  const dz = Math.max(r.z0 - here.z, 0, here.z - r.z1);
  if (Math.hypot(dx, dz) > CRIME.houseReach) return 'Walk up to the house first';
  return null;
}

/** The furniture a burglar is trying to take: checks they are inside that house, next to the item. */
async function stealTarget(env: Env, me: string, itemId: string) {
  const db = env.DB;
  const thiefPos = await whereIs(env, me);
  const visit = thiefPos?.area.match(/^home:([\w-]{1,128})$/);
  const victim = visit?.[1];
  if (!victim || victim === me || !await (await roomOf(env, me)).homeAccess(me, victim)) return err(403, 'You are not inside a house you can steal from');
  const propertyId = await (await roomOf(env, me)).homeProperty(me);
  const row = await db.prepare('SELECT data, saved_at FROM saves WHERE uid = ?').bind(victim).first<{ data: string; saved_at: number }>();
  if (!row) return err(404, 'That house is no longer available');
  let save: {
    items?: PlacedItem[];
    minutes?: number;
    activeHouseId?: string | null;
    properties?: { id?: string; items?: PlacedItem[]; staff?: { role?: string; paidThrough?: number }[] }[];
  };
  try {
    save = JSON.parse(row.data);
  } catch {
    return err(422, 'That house save is unavailable');
  }
  const propertyItems = propertyId
    ? save.properties?.find((property) => property.id === propertyId)?.items
    : undefined;
  // Look where the visitor was shown it: looking in the copy said 'no longer there' for things standing in the room.
  const lived = livedIn(save, propertyId);
  const items = (lived ? save.items : propertyItems) ?? [];
  const item = items.find((placed) =>
    placed?.id === itemId &&
    !!ITEMS[placed.type] &&
    !ITEMS[placed.type].fixed &&
    Number.isInteger(placed.x) && placed.x >= 0 && placed.x < MAX_GRID_W &&
    Number.isInteger(placed.z) && placed.z >= 0 && placed.z < MAX_GRID_H &&
    Number.isInteger(placed.rot) && placed.rot >= 0 && placed.rot <= 3,
  );
  if (!item) return err(409, 'That item is no longer there');
  const transform = itemTransform(item);
  if (Math.hypot(thiefPos!.x - transform.cx, thiefPos!.z - transform.cz) > 2.5) return err(409, 'Move closer to the item first');
  return { thiefPos: thiefPos!, victim, propertyId, row, save, propertyItems, lived, item };
}

/**
 * What VDM says about a crime: the matter his post is built from (src/game/vdm.ts). Burglaries nobody saw get a call
 * for information without a name; the rest name the thief.
 */
function vdmRant(row: CrimeRow, thief: string | undefined, victim: string | undefined): { topic: VdmTopic; facts: VdmFacts } {
  const item = row.item ? ITEMS[row.item]?.name ?? row.item : null;
  const loot = [row.amount ? naira(row.amount) : '', item ? `their ${item}` : ''].filter(Boolean).join(' and ');
  const v = handle(victim);
  const money = row.amount ?? 0;
  if (unsolved({ kind: row.kind, success: !!row.success, guard: row.guard }) && row.status !== 'arrested') {
    return { topic: 'exposeUnsolved', facts: { victim: v, loot: loot || 'their things', money } };
  }
  const did = row.success
    ? row.kind === 'burglary' ? `broke into ${v}'s house and carried ${loot || 'their property'}` : `dipped hand inside ${v}'s pocket and took ${loot || 'their money'}`
    : row.kind === 'burglary' ? `tried to break into ${v}'s house` : `tried to pick ${v}'s pocket`;
  return { topic: 'exposeNamed', facts: { who: handle(thief), victim: v, did, money } };
}

export async function handleCrime(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  const db = env.DB;
  const me = user.uid;

  /** The burglar's game thinks a camera can see them; the server decides from where it last saw them. */
  if (path === '/api/break-in/spotted' && req.method === 'POST') {
    const pos = await whereIs(env, me);
    const victim = pos?.area.match(/^home:([\w-]{1,128})$/)?.[1];
    if (!victim || victim === me || (await (await roomOf(env, me)).homeAccess(me, victim)) !== 'burglary') return json({ caught: false });
    const caught = await cameraCatch(env, ctx, me, victim, await (await roomOf(env, me)).homeProperty(me), pos!.x, pos!.z);
    return json({ caught });
  }

  if (path === '/api/break-in/steal/start' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { itemId?: string } | null;
    if (!b || typeof b.itemId !== 'string' || b.itemId.length > 128) return err(400, 'Choose an item to steal');
    if (await jailedUntil(db, me)) return err(403, 'You are in a police cell');
    if (await injuredUntil(db, me)) return err(403, 'You are still hurting from the beating. Rest first');
    const target = await stealTarget(env, me, b.itemId);
    if (target instanceof Response) return target;
    await (await roomOf(env, me)).startStealing(me, b.itemId);
    return json({ seconds: stealSeconds(target.item.type) });
  }

  if (path === '/api/break-in/steal/cancel' && req.method === 'POST') {
    await (await roomOf(env, me)).stopStealing(me);
    return json({ ok: true });
  }

  if (path === '/api/break-in/steal' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { itemId?: string } | null;
    if (!b || typeof b.itemId !== 'string' || b.itemId.length > 128) return err(400, 'Choose an item to steal');
    if (await jailedUntil(db, me)) return err(403, 'You are in a police cell');
    if (await injuredUntil(db, me)) return err(403, 'You are still hurting from the beating. Rest first');
    const target = await stealTarget(env, me, b.itemId);
    if (target instanceof Response) return target;
    const { thiefPos, victim, propertyId, row, save, propertyItems, lived, item } = target;
    const since = await (await roomOf(env, me)).stealingSince(me, item.id);
    // A little slack for network lag; the client waits the full time.
    if (since === null || Date.now() - since < stealSeconds(item.type) * 1000 - 750) return err(409, 'You have not finished carrying it out yet');
    await (await roomOf(env, me)).stopStealing(me);

    if (await cameraCatch(env, ctx, me, victim, propertyId, thiefPos!.x, thiefPos!.z)) return json({ stolen: false, caught: true, camera: true });
    const guarded = propertyId ? houseHasSecurity(save, propertyId) : false;

    const victimName = await usernames(db, [me, victim]);
    const thiefName = victimName.get(me) ?? 'someone';
    const ownerName = victimName.get(victim) ?? 'someone';
    const now = Date.now();

    if (guarded) {
      await securityCatch(env, ctx, me, victim, propertyId!);
      return json({ stolen: false, caught: true });
    }

    const without = (list: PlacedItem[]) => list.filter((placed) => placed.id !== item.id);
    const newSave = { ...save };
    // Out of the list the house is shown from and out of the property's copy of it, so it cannot come back.
    if (lived) newSave.items = without(save.items ?? []);
    if (propertyItems && propertyId) {
      newSave.properties = save.properties!.map((property) => (property.id === propertyId ? { ...property, items: without(propertyItems) } : property));
    }
    // saved_at stays as it is (like the other server-side edits): bumping it made the owner's game refuse its
    // own next upload, reload the whole cloud save and lose recent progress. Their game removes the item itself
    // when told (src/net/crime.ts), and if it misses that, the save check drops the unowned item anyway.
    const savedAt = row.saved_at;
    const newData = JSON.stringify(newSave);
    const clientId = `break-in:${crypto.randomUUID()}`;
    await db.batch([
      db.prepare('UPDATE saves SET data = ?1 WHERE uid = ?2 AND saved_at = ?3 AND data = ?4')
        .bind(newData, victim, row.saved_at, row.data),
      db.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?1, ?2, 'stolen', ?3, 0, 1, ?4 WHERE EXISTS (SELECT 1 FROM saves WHERE uid = ?5 AND saved_at = ?6 AND data = ?7)`,
      ).bind(victim, `${clientId}:out`, item.type, now, victim, savedAt, newData),
      db.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?1, ?2, 'stolen_in', ?3, 0, 1, ?4 WHERE EXISTS (SELECT 1 FROM saves WHERE uid = ?5 AND saved_at = ?6 AND data = ?7)`,
      ).bind(me, `${clientId}:in`, item.type, now, victim, savedAt, newData),
    ]);
    const transfer = await db.prepare('SELECT 1 AS ok FROM ledger WHERE uid = ? AND client_id = ?').bind(me, `${clientId}:in`).first();
    if (!transfer) return err(409, 'The house changed; try again');
    const crime = await db.prepare(
      `INSERT INTO crimes (thief_uid, victim_uid, kind, success, status, created_at, item, held, origin)
       VALUES (?1, ?2, 'burglary', 1, 'open', ?3, ?4, 1, ?5) RETURNING id`,
    ).bind(me, victim, now, item.type, JSON.stringify({ propertyId: propertyId ?? null, item })).first<{ id: number }>();
    if (!crime) return err(500, 'The item was taken but the police record could not be written');
    const report: CrimeReport = {
      id: crime.id, kind: 'burglary', success: true, amount: 0, item: item.type, status: 'open',
      returned: 0, at: now, reportedAt: null, guard: null, bounty: 0, thief: thiefName, victim: ownerName,
      itemId: item.id, propertyId: propertyId ?? null,
    };
    tellOwner(env, ctx, victim, report);
    return json({ stolen: true, caught: false, item: { ...item, id: crypto.randomUUID() } });
  }

  /** The owner, at home, deals with a burglar in their house: beat them and let them go, or hand them to the police. */
  if (path === '/api/break-in/catch' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { thief?: string; action?: string } | null;
    const thief = b?.thief;
    const action = b?.action;
    if (typeof thief !== 'string' || !thief || thief.length > 128 || thief === me || (action !== 'beat' && action !== 'police')) return err(400, 'Choose what to do with the intruder');
    // Only a real break-in counts (never a guest the owner invited), and only while the thief is still in this house.
    const room = await roomOf(env, thief);
    if ((await room.homeAccess(thief, me)) !== 'burglary') return err(409, 'They are not breaking into your house');
    const [mine, theirs] = await Promise.all([whereIs(env, me), whereIs(env, thief)]);
    if (mine?.area !== 'home') return err(409, 'You have to be in your house to catch them');
    if (theirs?.area !== `home:${me}`) return err(409, 'They already ran off');
    if (await jailedUntil(db, thief)) return err(409, 'They are already in a cell');
    const now = Date.now();
    // Claim the thief first so two clicks (or two answers) can't both punish them.
    const claimed = await db
      .prepare('UPDATE players SET injured_until = ?1 WHERE uid = ?2 AND COALESCE(injured_until, 0) < ?3 RETURNING uid')
      .bind(action === 'beat' ? now + CATCH.injuredMs : now + 15_000, thief, now)
      .first();
    if (!claimed) return err(409, 'They have already been dealt with');
    await room.revokeHomeVisit(thief);
    await markCaught(db, thief, me, now);

    // Whatever they carried out of this house in the last while goes back, and the cases name them: caught in the act.
    const { results: loot } = await db
      .prepare(
        `UPDATE crimes SET guard = 'owner' WHERE thief_uid = ?1 AND victim_uid = ?2 AND kind = 'burglary' AND success = 1 AND status = 'open'
           AND guard IS NULL AND created_at > ?3 RETURNING *`,
      )
      .bind(thief, me, now - CATCH.lootWindowMs)
      .all<CrimeRow>();
    const items: string[] = [];
    const ids: number[] = [];
    for (const row of loot) {
      if (await recoverItem(db, row) && row.item) {
        items.push(row.item);
        ids.push(row.id);
      }
    }
    const recovered = items.length;
    const names = await usernames(db, [thief, me]);
    const [thiefName, ownerName] = [names.get(thief) ?? 'someone', names.get(me) ?? 'someone'];

    if (action === 'police') {
      if (!loot.length) {
        await db.prepare(`INSERT INTO crimes (thief_uid, victim_uid, kind, success, status, reported_at, guard, created_at) VALUES (?1, ?2, 'burglary', 0, 'wanted', ?3, 'owner', ?3)`)
          .bind(thief, me, now).run();
      } else {
        await db.prepare(`UPDATE crimes SET status = 'wanted', reported_at = ?3 WHERE thief_uid = ?1 AND victim_uid = ?2 AND guard = 'owner' AND status = 'open'`).bind(thief, me, now).run();
      }
      await db.prepare('UPDATE players SET injured_until = NULL WHERE uid = ?').bind(thief).run();
      await settle(env, ctx, thief, null);
      return json({ ok: true, action, items, ids, amount: 0 });
    }

    // Beat and release: a share of their wallet goes to the owner as compensation.
    const want = Math.min(CATCH.cashCap, Math.floor((await getBalance(db, thief)) * CATCH.cashPct));
    const amount = want > 0 ? await transfer(db, thief, me, want, 'beating_out', 'beating_in', `beat:${thief}`) : 0;
    const until = now + CATCH.injuredMs;
    notify(env, ctx, thief, { t: 'beaten', by: ownerName, until, amount, items });
    await postFeed(
      db, thief, 'crime', '🏠',
      `${handle(ownerName)} was at home when ${handle(thiefName)} broke in. ${handle(thiefName)} left with a swollen face${recovered ? ' and without the loot' : ''}. 🥊`,
    );
    return json({ ok: true, action, items, ids, amount, balance: await getBalance(db, me) });
  }

  if (path === '/api/steal' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { target?: string; kind?: string; slot?: number } | null;
    const kind = b?.kind === 'burglary' ? 'burglary' : b?.kind === 'pickpocket' ? 'pickpocket' : null;
    const target = b?.target;
    if (!kind || typeof target !== 'string') return err(400, 'Pick someone to rob');
    if (target === me) return err(400, 'You can’t rob yourself');
    const [thief, victim] = await Promise.all([
      db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>(),
      db.prepare('SELECT username FROM players WHERE uid = ?').bind(target).first<{ username: string | null }>(),
    ]);
    if (!thief?.username) return err(403, 'Pick a username first');
    if (!victim?.username) return err(404, 'No such player');
    if (await jailedUntil(db, me)) return err(403, 'You are in a police cell');
    if (await injuredUntil(db, me)) return err(403, 'You are still hurting from the beating. Rest first');

    const now = Date.now();
    const recent = await db
      .prepare(
        `SELECT (SELECT MAX(created_at) FROM crimes WHERE thief_uid = ?1) AS mine,
                (SELECT MAX(created_at) FROM crimes WHERE victim_uid = ?2 AND success = 1) AS theirs`,
      )
      .bind(me, target)
      .first<{ mine: number | null; theirs: number | null }>();
    if (recent?.mine && now - recent.mine < CRIME.cooldownMs) return err(429, 'Lie low for a bit before trying again');
    if (recent?.theirs && now - recent.theirs < CRIME.victimShieldMs) return err(429, 'They were robbed just now and are watching their back');

    const scene = await checkScene(env, me, target, kind, b?.slot);
    if (scene) return err(409, scene);

    // Better-funded police and more patrols make thieves more likely to be spotted, and so does the
    // victim's bodyguard or gateman, who catches the thief in the act if they fail.
    // Baba's soap makes the thief invisible to guards (and, below, to the warrant).
    const soap = await usePerk(db, me, 'soap');
    const guarded = null as CatcherKind | null; // paid protection was removed
    const success = rand() < CRIME.successChance(await loadLaws(db));
    const caught = !success && guarded ? guarded : null;

    const crime = await db
      .prepare(
        `INSERT INTO crimes (thief_uid, victim_uid, kind, success, status, reported_at, guard, created_at, soaped)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING id`,
      )
      .bind(me, target, kind, success ? 1 : 0, caught ? 'wanted' : 'open', caught ? now : null, caught, now, soap ? 1 : 0)
      .first<{ id: number }>();
    const id = crime!.id;

    let amount = 0;
    let item: string | null = null;
    if (success) {
      const cfg = CRIME[kind];
      const victimBalance = await getBalance(db, target);
      const want = Math.min(cfg.cap, Math.floor(victimBalance * (cfg.min + rand() * (cfg.max - cfg.min))));
      if (want > 0) amount = await transfer(db, target, me, want, 'theft_out', 'theft_in', `crime:${id}`);
      if (kind === 'burglary') {
        item = await takeItem(db, target, id);
        // Fenced on the spot: the thief gets cash for it, not the furniture.
        const fence = item ? Math.round(ITEMS[item].price * CRIME.fenceFactor) : 0;
        if (fence > 0) {
          await db.batch(applyFence(db, me, `crime:${id}:fence`, item!, fence));
          amount += fence;
        }
      }
      await db.prepare('UPDATE crimes SET amount = ?, item = ? WHERE id = ?').bind(amount, item, id).run();
    }

    const report: CrimeReport = {
      id, kind, success, amount, item, status: caught ? 'wanted' : 'open', returned: 0, at: now,
      reportedAt: caught ? now : null, guard: caught, bounty: 0,
      thief: thief.username, victim: victim.username,
    };
    if (unsolved(report)) tellOwner(env, ctx, target, report);
    else notify(env, ctx, target, { t: 'robbed', crime: report });
    if (success && amount > 0) {
      await postFeed(
        db, target, 'crime', kind === 'burglary' ? '🥷🏾' : '🤏',
        kind === 'burglary'
          ? `${handle(victim.username)}’s house was burgled! Thieves made off with ${naira(amount)}${item ? ` and the ${ITEMS[item]?.name ?? item}` : ''}. Neighbours say they “heard nothing”. 🫣`
          : `Pickpocket alert! ${handle(victim.username)} just lost ${naira(amount)} without feeling a thing. Hold your pockets, everybody. 👀`,
      );
    } else if (caught) {
      await postFeed(
        db, me, MUGSHOT, CATCHERS[caught].icon,
        caught === 'bodyguard'
          ? `${handle(thief.username)} reached for ${handle(victim.username)}’s pocket and met their bodyguard instead. Held for the police. 💪🏾`
          : `${handle(victim.username)}’s mai-gadi caught ${handle(thief.username)} climbing the fence at night. Torch, stick, warrant. 🔦`,
      );
    } else if (!success && !soap) {
      await postFeed(db, me, MUGSHOT, '😂', `${handle(thief.username)} tried to ${kind === 'burglary' ? 'break into' : 'pick the pocket of'} ${handle(victim.username)} and got caught in the act.`);
    }
    return json({ crime: report, soap, balance: await getBalance(db, me) });
  }

  if (path === '/api/police' && req.method === 'GET') {
    await sweep(env, ctx);
    const { results } = await db
      .prepare(
        `SELECT c.*, t.username AS thief, v.username AS victim, o.username AS officer FROM crimes c
         LEFT JOIN players t ON t.uid = c.thief_uid LEFT JOIN players v ON v.uid = c.victim_uid LEFT JOIN players o ON o.uid = c.officer_uid
         WHERE (c.victim_uid = ?1 OR c.thief_uid = ?1) AND (c.created_at > ?2 OR c.status = 'wanted') ORDER BY c.id DESC LIMIT 60`,
      )
      .bind(me, Date.now() - POLICE_KEEP_MS)
      .all<NamedRow>();
    const [wanted, custody, officer, protection] = await Promise.all([loadWanted(env, me), loadCustody(db), isOfficer(db, me), loadProtection(db, me)]);
    return json({
      against: results.filter((r) => r.victim_uid === me).map((r) => toReport(r, true)),
      by: results.filter((r) => r.thief_uid === me).map((r) => toReport(r)),
      jailedUntil: await jailedUntil(db, me),
      jailCharge: await chargeSheet(db, me),
      injuredUntil: await injuredUntil(db, me),
      laws: await loadLaws(db),
      // Everyone sees the most-wanted board; only officers see where the suspects are, unless there's a
      // bounty on them, which brings out the bounty hunters.
      wanted: wanted.map(({ seen, x, z, ...w }) => (officer || w.bounty > 0 ? { ...w, seen, x, z } : { ...w, seen: null })),
      custody,
      protection,
    });
  }

  if (path === '/api/protect') return err(410, 'Paid protection is no longer offered');

  const vdm = path.match(/^\/api\/police\/vdm\/(\d+)$/);
  if (vdm && req.method === 'POST') {
    const id = Number(vdm[1]);
    const row = await db.prepare('SELECT * FROM crimes WHERE id = ? AND victim_uid = ?').bind(id, me).first<CrimeRow>();
    if (!row) return err(404, 'That case is not yours');
    if (row.vdm_at) return err(409, 'VDM has already talked about this one');
    const now = Date.now();
    // Telling him is free, so the wait is what stops a victim asking until he says yes.
    const claimed = await db.prepare('UPDATE crimes SET vdm_asked_at = ?1 WHERE id = ?2 AND vdm_at IS NULL AND (vdm_asked_at IS NULL OR vdm_asked_at <= ?3) RETURNING *')
      .bind(now, id, now - VDM.retryMs).first<CrimeRow>();
    if (!claimed) return err(409, 'VDM has heard this one already. Give him time before you call again');
    const names = await usernames(db, [row.thief_uid, me]);
    const report = (r: CrimeRow) => toReport({ ...r, thief: names.get(row.thief_uid) ?? null, victim: names.get(me) ?? null }, true);
    if (Math.random() >= VDM.odds({ kind: row.kind, success: !!row.success, guard: row.guard, status: row.status, amount: row.amount })) {
      return json({ crime: report(claimed), posted: false, said: vdmPass(`crime:${id}:${now}`) });
    }
    // He drags a break-in once, not once for every item carried out of it.
    await db.prepare('UPDATE crimes SET vdm_at = ?1 WHERE vdm_at IS NULL AND (id = ?2 OR (victim_uid = ?3 AND thief_uid = ?4 AND kind = ?5 AND ABS(created_at - ?6) <= ?7))')
      .bind(now, id, me, row.thief_uid, row.kind, row.created_at, SAME_VISIT_MS).run();
    const named = !(unsolved({ kind: row.kind, success: !!row.success, guard: row.guard }) && row.status !== 'arrested');
    // In his own words each time (src/game/vdm.ts), seeded by the case, and remembered against the thief.
    const expose = await vdmStatements(db, { ...vdmRant(row, names.get(row.thief_uid), names.get(me)), uid: named ? row.thief_uid : null, icon: VDM.icon, seed: `crime:${id}`, now }).catch(() => []);
    if (expose.length) await db.batch(expose).catch(() => {});
    if (named) notify(env, ctx, row.thief_uid, { t: 'vdm', victim: names.get(me) ?? 'someone' });
    return json({ crime: report({ ...claimed, vdm_at: now }), posted: true });
  }

  const bounty = path.match(/^\/api\/police\/bounty\/(\d+)$/);
  if (bounty && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { amount?: number } | null;
    const amount = b?.amount;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < BOUNTY.min || amount > BOUNTY.max) {
      return err(400, `A bounty is between ${naira(BOUNTY.min)} and ${naira(BOUNTY.max)}`);
    }
    const id = Number(bounty[1]);
    const row = await db.prepare(`SELECT * FROM crimes WHERE id = ? AND victim_uid = ? AND status = 'wanted'`).bind(id, me).first<CrimeRow>();
    if (!row) return err(409, 'Only a reported case with the thief still at large can carry a bounty');
    if ((await getBalance(db, me)) < amount) return err(402, 'Not enough money');
    // The state holds the money until someone makes the arrest.
    const paid = await transfer(db, me, null, amount, 'bounty_out', '', `bounty:${id}`);
    const added = await db
      .prepare(`UPDATE crimes SET bounty = bounty + ?2 WHERE id = ?1 AND status = 'wanted' AND ?2 > 0 RETURNING *`)
      .bind(id, paid)
      .first<CrimeRow>();
    if (!added) {
      // Arrested in the meantime: give it back.
      if (paid > 0) await db.batch(applyStmts(db, me, `bounty-refund:${id}:${crypto.randomUUID()}`, 'bounty_refund', String(id), paid));
      return err(409, 'They were just arrested');
    }
    const names = await usernames(db, [row.thief_uid, me]);
    const crime = toReport({ ...added, thief: names.get(row.thief_uid) ?? null, victim: names.get(me) ?? null });
    await postFeed(
      db, me, 'bounty', '💰',
      `WANTED: ${handle(names.get(row.thief_uid))}. ${handle(names.get(me))} just put ${naira(added.bounty)} on their head. Anyone who brings them in collects. 🤠`,
    );
    notify(env, ctx, row.thief_uid, { t: 'bounty', crime, amount: paid });
    return json({ crime, balance: await getBalance(db, me) });
  }

  const report = path.match(/^\/api\/police\/report\/(\d+)$/);
  if (report && req.method === 'POST') {
    const laws = await loadLaws(db);
    const hidden = await db.prepare(`SELECT 1 FROM crimes WHERE id = ? AND victim_uid = ? AND kind = 'burglary' AND success = 1 AND guard IS NULL`).bind(Number(report[1]), me).first();
    if (hidden) return err(409, 'Nobody saw the burglar. Accuse who you think did it instead');
    const slick = await db.prepare('SELECT 1 FROM crimes WHERE id = ? AND victim_uid = ? AND status = \'open\' AND soaped = 1').bind(Number(report[1]), me).first();
    if (slick) return err(409, 'The police tried, but the thief left no trace. Even the CCTV shows only a smell of soap. 🧼');
    // Lock the case first so it can only be reported once. Nobody is jailed yet: this puts out a warrant.
    const now = Date.now();
    const row = await db
      .prepare(`UPDATE crimes SET status = 'wanted', reported_at = ?4 WHERE id = ?1 AND victim_uid = ?2 AND status = 'open' AND created_at > ?3 RETURNING *`)
      .bind(Number(report[1]), me, now - laws.reportHours * 3600_000, now)
      .first<CrimeRow>();
    if (!row) return err(409, 'That case is closed or too old to report');
    const names = await usernames(db, [row.thief_uid, me]);
    const crime = toReport({ ...row, thief: names.get(row.thief_uid) ?? null, victim: names.get(me) ?? null });
    notify(env, ctx, row.thief_uid, { t: 'wanted', crime, autoAt: now + POLICE.manhuntMs });
    return json({ crime, balance: await getBalance(db, me) });
  }

  const accuse = path.match(/^\/api\/police\/accuse\/(\d+)$/);
  if (accuse && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { usernames?: unknown } | null;
    const list = Array.isArray(b?.usernames) ? b!.usernames : [];
    const names = [...new Set(list.filter((u): u is string => typeof u === 'string').map((u) => u.trim().replace(/^@/, '').toLowerCase()).filter(Boolean))];
    if (!names.length || names.length > ACCUSE.max || names.some((n) => n.length > 32)) return err(400, `Name between 1 and ${ACCUSE.max} suspects`);
    const { results: found } = await db
      .prepare(`SELECT uid, username FROM players WHERE LOWER(username) IN (${names.map(() => '?').join(',')})`)
      .bind(...names)
      .all<{ uid: string; username: string }>();
    if (found.length !== names.length) {
      const known = new Set(found.map((p) => p.username.toLowerCase()));
      return err(404, `No player called @${names.find((n) => !known.has(n))}`);
    }
    if (found.some((p) => p.uid === me)) return err(400, 'You can’t accuse yourself');
    const laws = await loadLaws(db);
    const now = Date.now();
    const id = Number(accuse[1]);
    // One accusation per case: lock it in before anything else.
    const row = await db
      .prepare(
        `UPDATE crimes SET accused = ?3 WHERE id = ?1 AND victim_uid = ?2 AND status = 'open' AND accused IS NULL
           AND kind = 'burglary' AND success = 1 AND guard IS NULL AND created_at > ?4 RETURNING *`,
      )
      .bind(id, me, JSON.stringify(found.map((p) => p.username)), now - laws.reportHours * 3600_000)
      .first<CrimeRow>();
    if (!row) return err(409, 'That case is closed, already has suspects, or is too old');
    const victimName = (await usernames(db, [me])).get(me) ?? 'someone';
    // Baba's soap leaves no evidence, even against the right name.
    const hit = found.some((p) => p.uid === row.thief_uid) && !row.soaped;
    for (const p of found) {
      if (p.uid !== row.thief_uid || !hit) notify(env, ctx, p.uid, { t: 'accused', by: victimName, cleared: true });
    }
    if (!hit) {
      const crime = toReport({ ...row, thief: null, victim: victimName }, true);
      return json({ crime, caught: false, balance: await getBalance(db, me) });
    }
    // Got them. Each thing they carried out of my house is a case of its own, but it is one burglar and one arrest:
    // the rest are solved along with this one, so it's one trip to the cell and one post, not one for every item.
    const { results: rest } = await db
      .prepare(
        `UPDATE crimes SET accused = ?4 WHERE id != ?1 AND victim_uid = ?2 AND thief_uid = ?3 AND status = 'open' AND accused IS NULL
           AND kind = 'burglary' AND success = 1 AND guard IS NULL AND soaped = 0 AND created_at > ?5 RETURNING *`,
      )
      .bind(id, me, row.thief_uid, row.accused ?? null, now - laws.reportHours * 3600_000)
      .all<CrimeRow>();
    const ids = [id, ...rest.map((r) => r.id)];
    const marks = ids.map(() => '?').join(',');
    // The things come back, and the police arrest the thief on the spot.
    for (const c of [row, ...rest]) await recoverItem(db, c);
    await db.prepare(`UPDATE crimes SET status = 'wanted', reported_at = ? WHERE id IN (${marks}) AND status = 'open'`).bind(now, ...ids).run();
    await settle(env, ctx, row.thief_uid, null, false, false);
    const { results: done } = await db
      .prepare(
        `SELECT c.*, t.username AS thief, v.username AS victim, o.username AS officer FROM crimes c
         LEFT JOIN players t ON t.uid = c.thief_uid LEFT JOIN players v ON v.uid = c.victim_uid LEFT JOIN players o ON o.uid = c.officer_uid
         WHERE c.id IN (${marks})`,
      )
      .bind(...ids)
      .all<NamedRow>();
    const solved = done.map((r) => toReport(r, true));
    const crime = solved.find((c) => c.id === id)!;
    const back = solved.filter((c) => c.item).map((c) => ITEMS[c.item!]?.name ?? c.item!);
    const loot = back.length > 3 ? `${back.slice(0, 2).join(', ')} and ${back.length - 2} more things` : [back.slice(0, -1).join(', '), back.at(-1)].filter(Boolean).join(' and ');
    await postFeed(
      db, row.thief_uid, MUGSHOT, '🕵🏾',
      `${handle(victimName)} named the burglar who robbed their house: ${handle(crime.thief)}. ${back.length ? `The ${loot} ${back.length > 1 ? 'are' : 'is'} back home, and t` : 'T'}he thief is in a cell. 🔎`,
    );
    return json({ crime, others: solved.filter((c) => c.id !== id), caught: true, balance: await getBalance(db, me) });
  }

  if (path === '/api/police/arrest' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { target?: string } | null;
    const target = b?.target;
    if (typeof target !== 'string') return err(400, 'Pick someone to arrest');
    if (target === me) return err(400, 'You can’t arrest yourself');
    if (await jailedUntil(db, me)) return err(403, 'You are in a police cell');
    const wanted = await db
      .prepare(`SELECT COUNT(*) AS n, SUM(bounty) AS bounty FROM crimes WHERE thief_uid = ? AND status = 'wanted'`)
      .bind(target)
      .first<{ n: number; bounty: number | null }>();
    if (!wanted?.n) return err(409, 'They are not wanted');
    // Officers can arrest anyone wanted; anyone else only a thief with a bounty on them.
    const cop = await isOfficer(db, me);
    if (!cop && !wanted.bounty) return err(403, 'Only police officers can make arrests (unless there’s a bounty). Join the force in Phone → Jobs');
    const [here, there] = await Promise.all([whereIs(env, me), whereIs(env, target)]);
    if (!here) return err(409, 'Go online in the game first');
    if (!there) return err(409, 'They are not around right now');
    if (there.area === 'home' || there.area !== here.area || Math.hypot(there.x - here.x, there.z - here.z) > POLICE.arrestReach) {
      return err(409, 'Get closer to them first');
    }
    const done = await settle(env, ctx, target, me, cop);
    if (!done) return err(409, 'Someone else got there first');
    return json({ crimes: done.crimes, reward: done.reward, bounty: done.bounty, balance: await getBalance(db, me) });
  }

  if (path === '/api/police/bail' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { target?: string } | null;
    const who = typeof b?.target === 'string' ? b.target : me;
    const until = await jailedUntil(db, who);
    if (!until) return err(409, who === me ? 'You are not in a cell' : 'They are not in a cell');
    const amount = bailFor(until);
    if ((await getBalance(db, me)) < amount) return err(402, `Bail is ${amount.toLocaleString('en-NG')} naira. Not enough money`);
    const paid = await transfer(db, me, null, amount, 'bail', '', `bail:${who}`);
    if (paid < amount) return err(402, 'Not enough money');
    await db.prepare('UPDATE players SET jailed_until = NULL WHERE uid = ?').bind(who).run();
    const names = await usernames(db, [me]);
    notify(env, ctx, who, { t: 'released', by: who === me ? null : names.get(me) ?? 'someone', amount });
    return json({ amount, balance: await getBalance(db, me) });
  }

  return null;
}

/** Credit the thief for fenced goods (once per crime). */
function applyFence(db: D1Database, uid: string, clientId: string, item: string, amount: number) {
  const now = Date.now();
  return [
    db
      .prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at) VALUES (?1, ?2, 'fence', ?3, ?4, ?5) ON CONFLICT(uid, client_id) DO NOTHING`)
      .bind(uid, clientId, item, amount, now),
    db
      .prepare(`UPDATE wallets SET balance = balance + ?3, updated_at = ?4 WHERE uid = ?1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`)
      .bind(uid, clientId, amount, now),
    db.prepare(`UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2`).bind(uid, clientId),
  ];
}

export async function usernames(db: D1Database, uids: (string | null)[]) {
  const list = [...new Set(uids.filter((u): u is string => !!u))];
  if (!list.length) return new Map<string, string>();
  const { results } = await db
    .prepare(`SELECT uid, username FROM players WHERE uid IN (${list.map(() => '?').join(',')})`)
    .bind(...list)
    .all<{ uid: string; username: string | null }>();
  return new Map(results.map((r) => [r.uid, r.username ?? 'someone']));
}

/**
 * Police officers are players whose (cloud-saved) job is the police job. The save is only their word, so they must
 * also have the knowledge the job asks for, as the server has verified it (worker/clock.ts).
 */
export async function isOfficer(db: D1Database, uid: string) {
  const row = await db
    .prepare('SELECT s.data, p.knowledge + p.knowledge_credit AS knowledge FROM saves s JOIN players p ON p.uid = s.uid WHERE s.uid = ?')
    .bind(uid)
    .first<{ data: string; knowledge: number | null }>();
  if (!row) return false;
  try {
    if ((row.knowledge ?? 0) < (JOBS.find((j) => j.id === POLICE.job)?.minKnowledge ?? 0)) return false;
    return (JSON.parse(row.data) as { jobId?: string }).jobId === POLICE.job;
  } catch {
    return false;
  }
}

/**
 * Arrest a thief on every warrant out for them: they pay each victim back, pay the arresting officer
 * their reward and the state its fine, then go to a cell. officer = null: the NPC police caught them.
 * Whoever makes the arrest also collects any bounties (cop = false: a bounty hunter, who gets only that);
 * if the NPC police get there first, the bounties go back to the victims.
 * announce = false: whoever called has its own post about this arrest, so Twitter hears of it once.
 */
async function settle(env: Env, ctx: ExecutionContext, thief: string, officer: string | null, cop = !!officer, announce = true) {
  const db = env.DB;
  const laws = await loadLaws(db);
  const now = Date.now();
  // Lock the warrants first so two officers can't both cash in.
  const { results: rows } = await db
    .prepare(`UPDATE crimes SET status = 'arrested', arrested_at = ?2, officer_uid = ?3 WHERE thief_uid = ?1 AND status = 'wanted' RETURNING *`)
    .bind(thief, now, officer)
    .all<CrimeRow>();
  if (!rows.length) return null;
  const until = now + laws.jailMinutes * 60_000;
  const names = await usernames(db, [thief, officer, ...rows.map((r) => r.victim_uid)]);
  const crimes: CrimeReport[] = [];
  let reward = 0;
  let bounty = 0;
  for (const row of rows) {
    // Restitution first, then the officer's reward, then the EFCC fine, as far as the wallet goes.
    const returned = row.amount > 0 ? await transfer(db, thief, row.victim_uid, row.amount, 'restitution_out', 'restitution_in', `arrest:${row.id}`) : 0;
    const rewardDue = officer && cop ? Math.max(POLICE.rewardMin, Math.round(row.amount * POLICE.rewardPct)) : 0;
    const paid = rewardDue > 0 ? await transfer(db, thief, officer!, rewardDue, 'arrest_reward_out', 'arrest_reward', `reward:${row.id}`) : 0;
    const fineDue = Math.round((row.amount || 5_000) * (laws.finePct / 100));
    const fine = fineDue > 0 ? await transfer(db, thief, null, fineDue, 'fine', '', `fine:${row.id}`) : 0;
    await db.prepare('UPDATE crimes SET returned = ?, reward = ?, fine = ? WHERE id = ?').bind(returned, paid, fine, row.id).run();
    if (row.bounty > 0) {
      await db.batch(
        officer
          ? applyStmts(db, officer, `bounty:${row.id}`, 'bounty_in', thief, row.bounty)
          : applyStmts(db, row.victim_uid, `bounty:${row.id}`, 'bounty_refund', String(row.id), row.bounty),
      );
      if (officer) bounty += row.bounty;
    }
    reward += paid;
    const crime = toReport({
      ...row, status: 'arrested', returned, reward: paid, fine,
      thief: names.get(thief) ?? null, victim: names.get(row.victim_uid) ?? null, officer: officer ? names.get(officer) ?? null : null,
    });
    crimes.push(crime);
    notify(env, ctx, row.victim_uid, { t: 'case', crime });
  }
  await jailStmt(db, thief, until, crimes.map(theftCharge)).run();
  const search = await searchPhone(env, thief, 'police', laws.jailMinutes);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  if (announce) await postFeed(
    db, thief, MUGSHOT, '🚔',
    `${officer ? `${cop ? 'Officer' : 'Bounty hunter'} ${handle(names.get(officer))}` : 'Police'} just arrested ${handle(names.get(thief))} on ${rows.length} warrant${rows.length > 1 ? 's' : ''}${total ? ` (${naira(total)} stolen)` : ''}. Straight to prison. ⛓️`,
  );
  notify(env, ctx, thief, { t: 'arrested', crime: crimes[0], crimes, charges: await chargeSheet(db, thief), until: search.until ?? until, jailMinutes: laws.jailMinutes, officer: officer ? names.get(officer) ?? null : null });
  return { crimes, reward, bounty, until: search.until ?? until };
}

/** The NPC police pick up anyone whose manhunt has run out. Runs whenever someone checks the police. */
export async function sweep(env: Env, ctx: ExecutionContext) {
  const { results } = await env.DB
    .prepare(`SELECT DISTINCT thief_uid FROM crimes WHERE status = 'wanted' AND reported_at < ? LIMIT 10`)
    .bind(Date.now() - POLICE.manhuntMs)
    .all<{ thief_uid: string }>();
  for (const r of results) await settle(env, ctx, r.thief_uid, null);
}

/** The most-wanted board, with where each suspect is right now. */
async function loadWanted(env: Env, me: string): Promise<WantedPerson[]> {
  const { results } = await env.DB
    .prepare(
      `SELECT c.thief_uid AS uid, p.username, SUM(c.amount) AS amount, SUM(c.bounty) AS bounty, COUNT(*) AS cases, MIN(c.reported_at) AS first
       FROM crimes c JOIN players p ON p.uid = c.thief_uid
       WHERE c.status = 'wanted' AND c.thief_uid != ? GROUP BY c.thief_uid ORDER BY bounty DESC, amount DESC LIMIT 15`,
    )
    .bind(me)
    .all<{ uid: string; username: string | null; amount: number; bounty: number; cases: number; first: number }>();
  return Promise.all(
    results.map(async (r) => {
      const at = await whereIs(env, r.uid).catch(() => null);
      return {
        uid: r.uid, username: r.username ?? 'someone', amount: r.amount, bounty: r.bounty ?? 0, cases: r.cases, autoAt: r.first + POLICE.manhuntMs,
        seen: at?.area ?? null, x: at?.x, z: at?.z,
      };
    }),
  );
}

async function loadCustody(db: D1Database): Promise<Prisoner[]> {
  const { results } = await db
    .prepare(`SELECT uid, username, jailed_until, (SELECT json_extract(s.data, '$.look') FROM saves s WHERE s.uid = players.uid) AS look
              FROM players WHERE jailed_until > ? ORDER BY jailed_until LIMIT 20`)
    .bind(Date.now())
    .all<{ uid: string; username: string | null; jailed_until: number; look: string | null }>();
  return results.map((r) => ({ uid: r.uid, username: r.username ?? 'someone', until: r.jailed_until, look: typeof r.look === 'string' ? r.look : null }));
}
