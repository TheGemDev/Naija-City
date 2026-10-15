// Looting a treasury opens a case with the EFCC chair (migration 0086). The loot is frozen in the case (migration 0094):
// the looter can't spend it until the case closes. The looter may offer the chair a share of it. Refuse, and the looter
// loses the office and goes to a cell, and the loot goes back. Accept, and the looter walks with the rest, but the chair
// may be found out and lose the job. A chair who does nothing, offline or not, leaves it to the old odds when the
// window (hours, so an absent chair has time to come back) runs out.

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
import { fineItem, recordExhibits, type ExhibitItem } from './exhibits';

type Ctx = ExecutionContext | undefined;
interface CaseRow {
  id: number; looter_uid: string; chair_uid: string; office: PoliticalOffice; city: CivicCity | null;
  amount: number; offer: number | null; held?: number; status: LootCase['status']; created_at: number; expires_at: number; decided_at: number | null;
}

/** Open a case against a looter, and tell the chair. */
export async function openLootCase(env: Env, ctx: Ctx, looter: string, chair: string, office: PoliticalOffice, city: CivicCity | null, amount: number, now: number): Promise<number | null> {
  const row = await env.DB
    .prepare('INSERT INTO loot_cases (looter_uid, chair_uid, office, city, amount, created_at, expires_at, held) VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING id')
    .bind(looter, chair, office, city, amount, now, now + LOOT.windowMs)
    .first<{ id: number }>();
  if (!row) return null;
  await sendCaseNote(env, ctx, looter, chair, `🐍 I took ${naira(amount)} from the ${city ? `${CITY_NAME[city]} ` : 'federal '}treasury. You have ${Math.round(LOOT.windowMs / 3_600_000)} hours. Let’s talk.`);
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
      offer: r.offer, held: !!r.held, status: r.status, expiresAt: r.expires_at, decidedAt: r.decided_at,
    }));
  } catch {
    return [];
  }
}

/** Take a seat away from whoever holds it, lock them up, and tell everyone. Returns the minutes served. */
export async function removeFromOffice(env: Env, ctx: Ctx, uid: string, office: PoliticalOffice, why: string, now: number, news: string, amount: number, taken: ExhibitItem[] = []) {
  const db = env.DB;
  const laws = await loadLaws(db);
  const who = (await usernames(db, [uid])).get(uid);
  const fine = await transfer(db, uid, null, TREASURY.embezzle.fine, 'efcc_fine', '', `case:${office}:${uid}:${now}`);
  // The exhibit book: the fine, and whatever the caller took back (the loot, the bags, the ghosts' pay).
  await recordExhibits(db, uid, `office:${office}:${now}`, why, [...taken, fineItem(fine)], now);
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

/** The loot goes back where it came from: straight from the case when it was frozen there, else out of the looter's wallet. */
async function returnLoot(env: Env, c: CaseRow, now: number) {
  const back = c.held ? c.amount : await transfer(env.DB, c.looter_uid, null, c.amount, 'loot_return', '', `loot-back:${c.id}:${now}`);
  if (back <= 0) return 0;
  await env.DB.prepare(c.city
    ? 'UPDATE state_treasuries SET balance = balance + ?1 WHERE city = ?2'
    : 'UPDATE civic_policies SET treasury = treasury + ?1 WHERE id = 1').bind(back, ...(c.city ? [c.city] : [])).run();
  return back;
}

/** The bribe held from the looter's wallet goes back to them. A frozen case's offer never left the loot. */
const refund = (env: Env, c: CaseRow) =>
  c.offer && !c.held ? env.DB.batch([ensureWallet(env.DB, c.looter_uid), ...applyStmts(env.DB, c.looter_uid, `bribe-refund:${c.id}`, 'bribe_refund', String(c.id), c.offer)]) : Promise.resolve([]);

/** The looter walks: a frozen case pays out what is left of the loot once the chair's share is gone. */
const release = (env: Env, c: CaseRow, keep: number) =>
  c.held && keep > 0 ? env.DB.batch([ensureWallet(env.DB, c.looter_uid), ...applyStmts(env.DB, c.looter_uid, `loot-release:${c.id}`, 'embezzle', c.office, keep)]) : Promise.resolve([]);

/** The looter goes down: the office, the loot and a cell. */
async function convict(env: Env, ctx: Ctx, c: CaseRow, now: number) {
  await refund(env, c);
  const back = await returnLoot(env, c, now);
  await removeFromOffice(
    env, ctx, c.looter_uid, c.office,
    `Looting ${naira(c.amount)} from the ${c.city ? `${CITY_NAME[c.city]} ` : 'federal '}treasury`, now,
    `SCANDAL: ${OFFICE_RULES[c.office].title} {who} looted ${naira(c.amount)} and the EFCC chair would not look away. Out of office, {fine} fine, ${naira(back)} taken back, and a cell. 🐍`,
    c.amount,
    [{ kind: 'loot', icon: '🐍', label: c.held ? 'The frozen loot' : 'Loot taken back', value: back }],
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
    // A frozen case's offer comes out of the loot itself. An older case's is held out of the wallet; the unique client
    // id means a second tap pays nothing more.
    if (!c.held) {
      if ((await getBalance(db, uid)) < offer) return { error: `You need ${naira(offer)} in your wallet`, status: 402 };
      await db.batch([ensureWallet(db, uid), ...applyStmts(db, uid, `bribe-hold:${c.id}`, 'bribe_hold', String(c.id), -offer)]);
    }
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
  await release(env, c, c.amount - c.offer);
  await sendCaseNote(env, ctx, uid, c.looter_uid, '🤝 Understood. It never happened.');
  if (rand() < LOOT.chairCaught) {
    // Found out: the chair loses the job and the bribe goes to the state.
    const bribe = await transfer(db, uid, null, c.offer, 'efcc_fine', '', `bribe-back:${c.id}:${now}`);
    await removeFromOffice(
      env, ctx, uid, 'efcc', 'Took a bribe to look away from a looted treasury', now,
      `SCANDAL: EFCC chair {who} was caught taking a bribe to look away from a looted treasury. Out of office, {fine} fine, and a cell. 🕵🏾`,
      c.offer,
      [{ kind: 'loot', icon: '💼', label: 'The bribe, taken back', value: bribe }],
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
    else {
      await refund(env, c);
      await release(env, c, c.amount);
    }
  }
}

