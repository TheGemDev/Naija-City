// Looting a treasury opens a case with the EFCC chair (migration 0086). The looter may offer the chair a share of the loot,
// held out of their wallet until the chair decides. Refuse, and the looter loses the office and goes to a cell with the
// loot taken back. Accept, and the looter walks, but the chair may be found out and lose the job. A chair who does
// nothing leaves it to the old odds when the time runs out.

import { CITY_NAME, LOOT, lootBribe, OFFICE_RULES, TREASURY, type CivicCity, type LootCase, type PoliticalOffice } from '../src/game/civic';
import { loadLaws, rand, transfer, usernames } from './crime';
import { jail } from './fun';
import { feedStmt, handle, naira } from './feed';
import { gazette, official } from './gazette';
import { syncForum } from './groups';
import { vdmGov } from './news';
import { searchPhone } from './phoneSearch';
import { sendCaseNote } from './social';
import { applyStmts, ensureWallet, getBalance } from './wallet';

type Ctx = ExecutionContext | undefined;
interface CaseRow {
  id: number; looter_uid: string; chair_uid: string; office: PoliticalOffice; city: CivicCity | null;
  amount: number; offer: number | null; status: LootCase['status']; created_at: number; expires_at: number; decided_at: number | null;
}

/** Open a case against a looter, and tell the chair. */
export async function openLootCase(env: Env, ctx: Ctx, looter: string, chair: string, office: PoliticalOffice, city: CivicCity | null, amount: number, now: number): Promise<number | null> {
  const row = await env.DB
    .prepare('INSERT INTO loot_cases (looter_uid, chair_uid, office, city, amount, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(looter, chair, office, city, amount, now, now + LOOT.windowMs)
    .first<{ id: number }>();
  if (!row) return null;
  await sendCaseNote(env, ctx, looter, chair, `🐍 I took ${naira(amount)} from the ${city ? `${CITY_NAME[city]} ` : 'federal '}treasury. You have ${Math.round(LOOT.windowMs / 60_000)} minutes. Let’s talk.`);
  return row.id;
}

/** Open and recent cases that involve this player, as the looter or the chair. */
export async function lootBoard(db: D1Database, uid: string, now: number): Promise<LootCase[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT c.*, l.username AS looter, h.username AS chair
         FROM loot_cases c LEFT JOIN players l ON l.uid = c.looter_uid LEFT JOIN players h ON h.uid = c.chair_uid
         WHERE (c.looter_uid = ?1 OR c.chair_uid = ?1) AND (c.status = 'open' OR c.decided_at > ?2) ORDER BY c.id DESC LIMIT 10`,
      )
      .bind(uid, now - 3600_000)
      .all<CaseRow & { looter: string | null; chair: string | null }>();
    return results.map((r) => ({
      id: r.id, looterUid: r.looter_uid, looter: r.looter, chairUid: r.chair_uid, chair: r.chair, office: r.office, city: r.city, amount: r.amount,
      offer: r.offer, status: r.status, expiresAt: r.expires_at, decidedAt: r.decided_at,
    }));
  } catch {
    return [];
  }
}

/** Take a seat away from whoever holds it, lock them up, and tell everyone. Returns the minutes served. */
async function removeFromOffice(env: Env, ctx: Ctx, uid: string, office: PoliticalOffice, why: string, now: number, news: string, amount: number) {
  const db = env.DB;
  const laws = await loadLaws(db);
  const who = (await usernames(db, [uid])).get(uid);
  const fine = await transfer(db, uid, null, TREASURY.embezzle.fine, 'fine', '', `case:${office}:${uid}:${now}`);
  await jail(db, uid, laws.jailMinutes * 2, why);
  await searchPhone(env, uid, 'efcc', laws.jailMinutes * 2);
  await db.batch([
    db.prepare(`UPDATE civic_policies SET ${office}_uid = NULL, ${office}_term_ends = NULL, updated_at = ? WHERE id = 1 AND ${office}_uid = ?`).bind(now, uid),
    feedStmt(db, uid, 'politics', '🐍', news.replace('{who}', handle(who)).replace('{fine}', naira(fine)), OFFICE_RULES[office].city),
    ...vdmGov(db, uid, 'looter', { who: official(office, who), amount: naira(amount) }, OFFICE_RULES[office].city),
  ]);
  await syncForum(db, now).catch((error) => console.error('forum sync failed', error));
  await gazette(env, ctx, [{ uid, office, kind: 'scandal', icon: '🐍', text: `${official(office, who)} is out of office, ${why.toLowerCase()}.` }]);
}

/** The loot goes back where it came from. */
async function returnLoot(env: Env, c: CaseRow, now: number) {
  const back = await transfer(env.DB, c.looter_uid, null, c.amount, 'loot_return', '', `loot-back:${c.id}:${now}`);
  if (back <= 0) return 0;
  await env.DB.prepare(c.city
    ? 'UPDATE state_treasuries SET balance = balance + ?1 WHERE city = ?2'
    : 'UPDATE civic_policies SET treasury = treasury + ?1 WHERE id = 1').bind(back, ...(c.city ? [c.city] : [])).run();
  return back;
}

/** The bribe held from the looter's wallet goes back to them. */
const refund = (env: Env, c: CaseRow) =>
  c.offer ? env.DB.batch([ensureWallet(env.DB, c.looter_uid), ...applyStmts(env.DB, c.looter_uid, `bribe-refund:${c.id}`, 'bribe_refund', String(c.id), c.offer)]) : Promise.resolve([]);

/** The looter goes down: the office, the loot and a cell. */
async function convict(env: Env, ctx: Ctx, c: CaseRow, now: number) {
  await refund(env, c);
  const back = await returnLoot(env, c, now);
  await removeFromOffice(
    env, ctx, c.looter_uid, c.office,
    `Looting ${naira(c.amount)} from the ${c.city ? `${CITY_NAME[c.city]} ` : 'federal '}treasury`, now,
    `SCANDAL: ${OFFICE_RULES[c.office].title} {who} looted ${naira(c.amount)} and the EFCC chair would not look away. Out of office, {fine} fine, ${naira(back)} taken back, and a cell. 🐍`,
    c.amount,
  );
}

export type LootAction = { action: 'lootOffer'; caseId: number; pct: number } | { action: 'lootDecide'; caseId: number; accept: boolean };

/** The looter makes an offer, or the chair decides. Returns an error message, or null when it worked. */
export async function lootAction(env: Env, ctx: Ctx, uid: string, body: LootAction, now: number): Promise<{ error: string; status: number } | { done: string }> {
  const db = env.DB;
  const c = await db.prepare("SELECT * FROM loot_cases WHERE id = ? AND status = 'open'").bind(body.caseId).first<CaseRow>();
  if (!c) return { error: 'That case is closed', status: 409 };
  if (now >= c.expires_at) return { error: 'That case ran out of time', status: 409 };

  if (body.action === 'lootOffer') {
    if (c.looter_uid !== uid) return { error: 'This is not your case', status: 403 };
    if (c.offer) return { error: 'You already made an offer', status: 409 };
    if (!LOOT.shares.includes(body.pct)) return { error: 'Choose a share from the list', status: 400 };
    const offer = lootBribe(c.amount, body.pct);
    if ((await getBalance(db, uid)) < offer) return { error: `You need ${naira(offer)} in your wallet`, status: 402 };
    // Held out of the wallet now; the unique client id means a second tap pays nothing more.
    await db.batch([ensureWallet(db, uid), ...applyStmts(db, uid, `bribe-hold:${c.id}`, 'bribe_hold', String(c.id), -offer)]);
    const held = await db.prepare('UPDATE loot_cases SET offer = ? WHERE id = ? AND status = \'open\' AND offer IS NULL RETURNING id').bind(offer, c.id).first();
    if (!held) return { error: 'You already made an offer', status: 409 };
    await sendCaseNote(env, ctx, uid, c.chair_uid, `💼 ${body.pct}% of it, ${naira(offer)}, is yours if this goes away.`);
    return { done: 'offer' };
  }

  if (c.chair_uid !== uid) return { error: 'Only the EFCC chair decides this', status: 403 };
  const policy = await db.prepare('SELECT efcc_uid FROM civic_policies WHERE id = 1').first<{ efcc_uid: string | null }>();
  if (policy?.efcc_uid !== uid) return { error: 'You are no longer the EFCC chair', status: 403 };

  if (!body.accept) {
    const shut = await db.prepare("UPDATE loot_cases SET status = 'refused', decided_at = ? WHERE id = ? AND status = 'open' RETURNING id").bind(now, c.id).first();
    if (!shut) return { error: 'That case is closed', status: 409 };
    await convict(env, ctx, c, now);
    await sendCaseNote(env, ctx, uid, c.looter_uid, '⚖️ No deal. See you in court.');
    return { done: 'refused' };
  }
  if (!c.offer) return { error: 'There is no offer to take', status: 409 };
  // The chair takes the money; the looter walks.
  const closed = await db.prepare("UPDATE loot_cases SET status = 'accepted', decided_at = ? WHERE id = ? AND status = 'open' RETURNING id").bind(now, c.id).first();
  if (!closed) return { error: 'That case is closed', status: 409 };
  await db.batch([ensureWallet(db, uid), ...applyStmts(db, uid, `bribe:${c.id}`, 'bribe', String(c.id), c.offer)]);
  await sendCaseNote(env, ctx, uid, c.looter_uid, '🤝 Understood. It never happened.');
  if (rand() < LOOT.chairCaught) {
    // Found out: the chair loses the job and the bribe goes to the state.
    await transfer(db, uid, null, c.offer, 'fine', '', `bribe-back:${c.id}:${now}`);
    await removeFromOffice(
      env, ctx, uid, 'efcc', 'Took a bribe to look away from a looted treasury', now,
      `SCANDAL: EFCC chair {who} was caught taking a bribe to look away from a looted treasury. Out of office, {fine} fine, and a cell. 🕵🏾`,
      c.offer,
    );
    return { done: 'accepted-caught' };
  }
  return { done: 'accepted' };
}

/** Cron, and any time the board is opened: cases nobody decided fall back on the old odds of being caught. */
export async function settleLoot(env: Env, ctx: Ctx, now: number) {
  let due: CaseRow[];
  try {
    due = (await env.DB.prepare("SELECT * FROM loot_cases WHERE status = 'open' AND expires_at <= ?").bind(now).all<CaseRow>()).results;
  } catch {
    return;
  }
  for (const c of due) {
    const claimed = await env.DB.prepare("UPDATE loot_cases SET status = 'expired', decided_at = ? WHERE id = ? AND status = 'open' RETURNING id").bind(now, c.id).first();
    if (!claimed) continue;
    if (rand() < TREASURY.embezzle.catchChance) await convict(env, ctx, c, now);
    else await refund(env, c);
  }
}

