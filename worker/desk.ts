// The governor's desk on the server (rules in src/game/desk.ts, migration 0124). The cron lands a crazy matter on whoever
// runs a state now and then, decides it for them when their clock runs out, and reveals the twists choices carry. The
// governor answers through the Civic app (worker/civic.ts, action 'desk').
//
// Every step is claimed with a conditional UPDATE first, so two ticks (or a tick and a tap) never apply one twice.

import { CITY_HEAD, CITY_NAME, CIVIC_CITIES, suspendedUntil, type CivicCity, type PoliticalOffice } from '../src/game/civic';
import { DESK, DILEMMA_BY_ID, DILEMMAS, deskAmount, deskText, type DeskEffect, type Dilemma } from '../src/game/desk';
import { NPC_CRAZES } from '../src/game/npcs';
import { STATE_ASSETS } from '../src/game/treasury';
import { rand, usernames } from './crime';
import { feedStmt, naira } from './feed';
import { gazette, official } from './gazette';
import { removeFromOffice } from './loot';
import { sendPush } from './push';
import { notifyPlayer } from './shards';
import { applyStmts, ensureWallet } from './wallet';

type Ctx = ExecutionContext | undefined;

interface DeskRow {
  id: number; city: CivicCity; dilemma: string; uid: string; created_at: number; due_at: number;
  choice: string | null; decided_at: number | null; twist_at: number | null; twist_done: number;
}

/** What the Civic app shows the governor: the open matter, and how the last one went. */
export interface DeskView {
  open: { id: number; dilemma: string; due: number } | null;
  last: { id: number; dilemma: string; choice: string; at: number; twistPending: boolean } | null;
}

/** The open matter on this player's desk and the last one settled, if they run a state. */
export async function deskOf(db: D1Database, uid: string, city: CivicCity | undefined, now: number): Promise<DeskView | null> {
  if (!city) return null;
  const [open, last] = await Promise.all([
    db.prepare('SELECT id, dilemma, due_at FROM gov_desk WHERE city = ? AND uid = ? AND choice IS NULL AND due_at > ? ORDER BY id DESC LIMIT 1')
      .bind(city, uid, now).first<{ id: number; dilemma: string; due_at: number }>(),
    db.prepare('SELECT id, dilemma, choice, decided_at, twist_at, twist_done FROM gov_desk WHERE city = ? AND choice IS NOT NULL AND decided_at > ? ORDER BY decided_at DESC LIMIT 1')
      .bind(city, now - 6 * 3_600_000).first<Pick<DeskRow, 'id' | 'dilemma' | 'choice' | 'decided_at' | 'twist_at' | 'twist_done'>>(),
  ]).catch(() => [null, null] as const);
  return {
    open: open && DILEMMA_BY_ID[open.dilemma] ? { id: open.id, dilemma: open.dilemma, due: open.due_at } : null,
    last: last?.choice && DILEMMA_BY_ID[last.dilemma]
      ? { id: last.id, dilemma: last.dilemma, choice: last.choice, at: last.decided_at ?? 0, twistPending: !!last.twist_at && !last.twist_done }
      : null,
  };
}

/** The governor's name for a headline: "Lagos Governor @ada". */
async function govName(db: D1Database, city: CivicCity, uid: string) {
  return official(CITY_HEAD[city], (await usernames(db, [uid])).get(uid));
}

/**
 * Does what an effect says to a state (and its governor). Money the state has to pay that it doesn't have becomes
 * arrears. Pocket money, and anything the EFCC may look into, is the governor's own risk.
 */
async function apply(env: Env, ctx: Ctx, city: CivicCity, uid: string, office: PoliticalOffice, effect: DeskEffect, key: string, headline: string, now: number, paid = false) {
  const db = env.DB;
  const stmts: D1PreparedStatement[] = [];
  // `paid`: the governor's choice already paid its bill up front (decideDesk).
  if (effect.money && !paid) {
    const amount = deskAmount(Math.abs(effect.money), city);
    stmts.push(
      effect.money > 0
        ? db.prepare('UPDATE state_treasuries SET balance = balance + ?1, incoming = incoming + ?1 WHERE city = ?2').bind(amount, city)
        : db.prepare('UPDATE state_treasuries SET arrears = arrears + MAX(0, ?1 - balance), balance = MAX(0, balance - ?1) WHERE city = ?2').bind(amount, city),
    );
  }
  if (effect.mood) stmts.push(db.prepare('UPDATE npcs SET mood = MAX(0, MIN(100, mood + ?1)) WHERE city = ?2').bind(effect.mood, city));
  for (const [asset, d] of Object.entries(effect.assets ?? {})) {
    if (!STATE_ASSETS.includes(asset as never) || !d) continue;
    stmts.push(db.prepare('UPDATE state_assets SET condition = MAX(0, MIN(100, condition + ?1)) WHERE city = ?2 AND asset = ?3').bind(d, city, asset));
  }
  if (effect.craze) {
    const c = NPC_CRAZES[effect.craze];
    const hours = c.hours[0] + rand() * (c.hours[1] - c.hours[0]);
    stmts.push(db.prepare('INSERT OR REPLACE INTO npc_crazes (city, craze, started_at, until) VALUES (?, ?, ?, ?)').bind(city, effect.craze, now, now + Math.round(hours * 3_600_000)));
  }
  // The mood and craze tables arrive with the NPC citizens (migrations 0116 and 0117): a desk before them still works.
  if (stmts.length) await db.batch(stmts).catch(() => Promise.all(stmts.map((s) => s.run().catch(() => null))));

  if (!effect.pocket && !effect.efcc) return;
  const pocket = effect.pocket ? deskAmount(effect.pocket, city) : 0;
  if (effect.efcc && rand() < effect.efcc) {
    const cost = pocket || deskAmount(Math.abs(effect.money ?? 0), city);
    await removeFromOffice(
      env, ctx, uid, office, `Caught by the EFCC over “${headline}”`, now,
      `EFCC: ${await govName(db, city, uid)} has been caught over ${naira(cost)} in ${CITY_NAME[city]}: “${headline}”. {fine} fine. 🕵🏾`,
      cost,
      [{ kind: 'loot', icon: '🕵🏾', label: headline, value: cost }],
    );
    return;
  }
  if (pocket) await db.batch([ensureWallet(db, uid), ...applyStmts(db, uid, key, 'embezzle', office, pocket)]);
}

/** The headline, VDM's word, and the gazette line for what a governor did. */
async function announce(env: Env, ctx: Ctx, city: CivicCity, uid: string, d: Dilemma, news: string, vdm: string | undefined, notice: boolean) {
  const db = env.DB;
  const gov = await govName(db, city, uid);
  const text = deskText(news, CITY_NAME[city], gov);
  const stmts = [feedStmt(db, uid, 'politics', d.icon, text, city)];
  if (vdm) stmts.push(db.prepare(`INSERT INTO feed (uid, kind, icon, text, created_at, city) VALUES (?, 'vdm', '🎤', ?, ?, ?)`).bind(uid, deskText(vdm, CITY_NAME[city], gov), Date.now(), city));
  await db.batch(stmts).catch(() => {});
  if (notice) await gazette(env, ctx, [{ uid, office: CITY_HEAD[city], kind: 'law', icon: d.icon, text }]);
}

/** The governor answers. Paying for it comes first: no money, no choice. */
export async function decideDesk(env: Env, ctx: Ctx, uid: string, city: CivicCity, id: number, choice: string, now: number): Promise<{ error: string; status: number } | { ok: true }> {
  const db = env.DB;
  const row = await db.prepare('SELECT * FROM gov_desk WHERE id = ? AND city = ?').bind(id, city).first<DeskRow>();
  if (!row || row.uid !== uid) return { error: 'That is not on your desk', status: 404 };
  if (row.choice) return { error: 'You already decided that one', status: 409 };
  if (row.due_at <= now) return { error: 'Too late: the clock ran out', status: 409 };
  const d = DILEMMA_BY_ID[row.dilemma];
  const option = d?.options.find((o) => o.id === choice);
  if (!d || !option) return { error: 'Pick one of the options', status: 400 };

  const cost = option.effect.money && option.effect.money < 0 ? deskAmount(-option.effect.money, city) : 0;
  if (cost) {
    const paid = await db.prepare('UPDATE state_treasuries SET balance = balance - ?1 WHERE city = ?2 AND balance >= ?1 RETURNING balance').bind(cost, city).first();
    if (!paid) return { error: `${CITY_NAME[city]} doesn’t have ${naira(cost)} for that`, status: 402 };
  }
  const twistAt = option.twist && rand() < option.twist.chance
    ? now + Math.round((DESK.twistMin[0] + rand() * (DESK.twistMin[1] - DESK.twistMin[0])) * 60_000)
    : null;
  const claimed = await db
    .prepare('UPDATE gov_desk SET choice = ?1, decided_at = ?2, twist_at = ?3 WHERE id = ?4 AND choice IS NULL RETURNING id')
    .bind(choice, now, twistAt, id)
    .first();
  if (!claimed) {
    if (cost) await db.prepare('UPDATE state_treasuries SET balance = balance + ? WHERE city = ?').bind(cost, city).run();
    return { error: 'You already decided that one', status: 409 };
  }
  // The money was paid above; everything else happens now.
  await apply(env, ctx, city, uid, CITY_HEAD[city], option.effect, `desk:${id}`, option.label, now, !!cost);
  await announce(env, ctx, city, uid, d, option.news, option.vdm, true);
  return { ok: true };
}

/**
 * Cron, every tick: decide what ran out of time (badly), reveal the twists that are due, and land a new matter on each
 * state whose governor has had a break.
 */
export async function runDesk(env: Env, ctx: Ctx, now: number) {
  const db = env.DB;
  const ok = await db.prepare('SELECT 1 FROM gov_desk LIMIT 1').first().then(() => true).catch(() => false);
  if (!ok) return; // before migration 0124

  // 1. Out of time: decided for them.
  const { results: late } = await db.prepare('SELECT * FROM gov_desk WHERE choice IS NULL AND due_at <= ? LIMIT 10').bind(now).all<DeskRow>();
  for (const row of late) {
    const claimed = await db.prepare("UPDATE gov_desk SET choice = 'ignored', decided_at = ?1 WHERE id = ?2 AND choice IS NULL RETURNING id").bind(now, row.id).first();
    const d = DILEMMA_BY_ID[row.dilemma];
    if (!claimed || !d) continue;
    await apply(env, ctx, row.city, row.uid, CITY_HEAD[row.city], d.ignored.effect, `desk:${row.id}`, d.title, now);
    await announce(env, ctx, row.city, row.uid, d, d.ignored.news, undefined, true);
  }

  // 2. Twists that are due.
  const { results: twists } = await db.prepare('SELECT * FROM gov_desk WHERE twist_at IS NOT NULL AND twist_done = 0 AND twist_at <= ? LIMIT 10').bind(now).all<DeskRow>();
  for (const row of twists) {
    const claimed = await db.prepare('UPDATE gov_desk SET twist_done = 1 WHERE id = ? AND twist_done = 0 RETURNING id').bind(row.id).first();
    const d = DILEMMA_BY_ID[row.dilemma];
    const twist = d?.options.find((o) => o.id === row.choice)?.twist;
    if (!claimed || !d || !twist) continue;
    await apply(env, ctx, row.city, row.uid, CITY_HEAD[row.city], twist.effect, `desk-twist:${row.id}`, d.title, now);
    await announce(env, ctx, row.city, row.uid, d, twist.news, undefined, false);
    await notifyPlayer(env, row.uid, { t: 'desk', city: row.city, title: d.title, twist: true }).catch(() => {});
  }

  // 3. New matters.
  const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<Record<string, unknown>>();
  if (!policy) return;
  for (const city of CIVIC_CITIES) {
    const office = CITY_HEAD[city];
    const uid = policy[`${office}_uid`] as string | null;
    if (!uid || suspendedUntil(policy, office, now)) continue;
    const recent = await db.prepare('SELECT dilemma, created_at, choice FROM gov_desk WHERE city = ? ORDER BY id DESC LIMIT ?').bind(city, DESK.noRepeat).all<{ dilemma: string; created_at: number; choice: string | null }>();
    const newest = recent.results[0];
    if (newest && (!newest.choice || now - newest.created_at < DESK.gapMs)) continue;
    if (rand() >= DESK.chance) continue;
    const used = new Set(recent.results.map((r) => r.dilemma));
    const pool = DILEMMAS.filter((d) => !used.has(d.id));
    const d = (pool.length ? pool : DILEMMAS)[Math.floor(rand() * (pool.length || DILEMMAS.length))];
    const due = now + DESK.windowMs;
    // Only one open matter per state, even with two ticks at once.
    const made = await db
      .prepare(
        `INSERT INTO gov_desk (city, dilemma, uid, created_at, due_at) SELECT ?1, ?2, ?3, ?4, ?5
         WHERE NOT EXISTS (SELECT 1 FROM gov_desk WHERE city = ?1 AND (choice IS NULL OR created_at > ?6)) RETURNING id`,
      )
      .bind(city, d.id, uid, now, due, now - DESK.gapMs)
      .first();
    if (!made) continue;
    await notifyPlayer(env, uid, { t: 'desk', city, title: d.title }).catch(() => {});
    if (ctx) sendPush(env, ctx, uid, { title: `${d.icon} On your desk: ${d.title}`, body: `${deskText(d.body, CITY_NAME[city], 'you')} You have ${Math.round(DESK.windowMs / 60_000)} minutes to decide.`, tag: `desk-${city}`, category: 'news', app: 'civic' });
  }
}
