// Bank loans (rules in src/game/loans.ts). Interest is added lazily, one real day at a time, at the rate the president
// has set; interest paid back goes to the treasury, and so does the loan fee. How much the bank lends depends on what
// it could take back: cash, savings, houses, cars and jets, at what they would sell for today.
//
// A loan still unpaid a day past its due date is in default. The cron (sweepLoans) takes cash, then savings, then cars
// and jets, then houses (the one you live in last), until the debt is covered; anything an asset fetches beyond that is
// paid back to you. Then you go to a cell, and the bank won't lend to you for a week.

import { applyStmts, ensureWallet, getBalance } from './wallet';
import { jailedUntil, transfer } from './crime';
import { feedStmt, naira } from './feed';
import { jail } from './fun';
import { houseIndex } from './market';
import { loadPolicy } from './policy';
import { ownedCounts, propertyBooks } from './progress';
import { sendPush } from './push';
import { notifyPlayer } from './shards';
import { CAR_BY_ID, CAR_RESALE_FACTOR, JET_BY_ID, jetResale } from '../src/game/cars';
import { LOAN, creditLimit, creditShare, type Collateral, type Foreclosure, type LoanRow, type LoanSnapshot, grow } from '../src/game/loans';
import { DESIGN_BY_ID, SALE_FACTOR, STAGES, estateCity, type Property } from '../src/game/property';
import type { CivicCity } from '../src/game/civic';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

interface Row { id: number; uid: string; principal: number; interest: number; borrowed: number; taken_at: number; due_at: number; last_accrual: number }
interface Credit { repaid_on_time: number; banned_until: number | null }

/** Loans repaid on time stop counting up here: the share of collateral is at its most by then. */
const MAX_REPAID = Math.ceil((LOAN.share.max - LOAN.share.base) / LOAN.share.perRepaid);

const rateOf = async (db: D1Database) => (await loadPolicy(db))?.loanRate ?? LOAN.defaultRate;

/** Add the interest that has built up since each open loan was last charged. */
async function accrue(db: D1Database, uid: string, now: number) {
  const rate = await rateOf(db);
  const { results } = await db.prepare(`SELECT * FROM loans WHERE uid = ? AND status = 'open'`).bind(uid).all<Row>();
  for (const l of results) {
    const periods = Math.floor((now - l.last_accrual) / LOAN.periodMs);
    if (periods <= 0) continue;
    const effective = now > l.due_at ? rate * LOAN.overdueFactor : rate;
    const total = grow(l.principal + l.interest, effective, periods);
    await db
      .prepare('UPDATE loans SET interest = ?, last_accrual = last_accrual + ? WHERE id = ? AND last_accrual = ?')
      .bind(Math.max(0, total - l.principal), periods * LOAN.periodMs, l.id, l.last_accrual)
      .run();
  }
}

type SaveJson = { properties?: Property[]; homePropertyId?: string | null; activeHouseId?: string | null; items?: Property['items']; furnitureInventory?: NonNullable<Property['items']>; ownedCars?: string[]; selectedCar?: string | null; ownedJets?: string[] };

/** Something the bank could take, at what it would sell for today. */
interface Asset { kind: 'house' | 'car' | 'jet'; ref: string; label: string; value: number; city?: CivicCity; property?: Property }

/**
 * Everything the bank could take and sell, as the server knows it: finished houses the player paid for (at today's
 * house prices in their state), and cars and jets on the ledger (at resale; the server doesn't track wear).
 */
async function seizable(db: D1Database, uid: string): Promise<{ assets: Asset[]; save: SaveJson | null; savedAt: number | null }> {
  const [owned, books, index, saveRow] = await Promise.all([
    ownedCounts(db, uid),
    propertyBooks(db, uid),
    houseIndex(db),
    db.prepare('SELECT data, saved_at FROM saves WHERE uid = ?').bind(uid).first<{ data: string; saved_at: number }>(),
  ]);
  let save: SaveJson | null = null;
  try { save = saveRow ? (JSON.parse(saveRow.data) as SaveJson) : null; } catch { save = null; }
  const assets: Asset[] = [];
  for (const p of save?.properties ?? []) {
    const book = p?.id ? books.get(p.id) : undefined;
    if (!book || book.sold || (p.stage ?? 0) < STAGES.length) continue;
    const region = book.region ?? p.region;
    assets.push({
      kind: 'house', ref: p.id, property: p, city: estateCity(region) as CivicCity,
      label: DESIGN_BY_ID[p.design ?? '']?.name ?? 'House',
      value: Math.round(book.spent * SALE_FACTOR.complete * index.of(region)),
    });
  }
  for (const [id, n] of owned) {
    for (let i = 0; i < n; i++) {
      if (CAR_BY_ID[id]) assets.push({ kind: 'car', ref: id, label: CAR_BY_ID[id].name, value: Math.round(CAR_BY_ID[id].price * CAR_RESALE_FACTOR) });
      else if (JET_BY_ID[id]) assets.push({ kind: 'jet', ref: id, label: JET_BY_ID[id].name, value: jetResale(id) });
    }
  }
  return { assets, save, savedAt: saveRow?.saved_at ?? null };
}

const creditOf = (db: D1Database, uid: string) =>
  db.prepare('SELECT repaid_on_time, banned_until FROM bank_credit WHERE uid = ?').bind(uid).first<Credit>();

async function snapshot(db: D1Database, uid: string, now: number): Promise<LoanSnapshot> {
  await accrue(db, uid, now);
  const [rate, { results }, bank, balance, credit, held, taken] = await Promise.all([
    rateOf(db),
    db.prepare(`SELECT * FROM loans WHERE uid = ? AND status = 'open' ORDER BY id`).bind(uid).all<Row>(),
    db.prepare('SELECT savings FROM bank_accounts WHERE uid = ?').bind(uid).first<{ savings: number }>(),
    getBalance(db, uid),
    creditOf(db, uid),
    seizable(db, uid),
    db.prepare(`SELECT id, kind, ref, value FROM foreclosures WHERE uid = ? AND applied = 0 AND kind IN ('house', 'car', 'jet') ORDER BY id LIMIT 50`).bind(uid).all<Foreclosure>(),
  ]);
  const loans: LoanRow[] = results.map((l) => ({
    id: l.id, principal: l.principal, interest: l.interest, owed: l.principal + l.interest, borrowed: l.borrowed,
    takenAt: l.taken_at, dueAt: l.due_at, seizeAt: l.due_at + LOAN.graceMs, overdue: now > l.due_at,
  }));
  const owed = loans.reduce((a, l) => a + l.owed, 0);
  const worth = (kind: Asset['kind']) => held.assets.filter((a) => a.kind === kind).reduce((n, a) => n + a.value, 0);
  const collateral: Collateral = { cash: Math.max(0, balance), savings: bank?.savings ?? 0, houses: worth('house'), cars: worth('car'), jets: worth('jet') };
  const repaidOnTime = credit?.repaid_on_time ?? 0;
  const bannedUntil = credit?.banned_until && credit.banned_until > now ? credit.banned_until : null;
  const limit = creditLimit(collateral, repaidOnTime);
  return {
    rate, limit, available: bannedUntil ? 0 : Math.max(0, limit - owed), owed, overdue: loans.some((l) => l.overdue), loans,
    collateral, share: creditShare(repaidOnTime), repaidOnTime, bannedUntil, foreclosed: taken.results,
  };
}

export async function handleLoans(req: Request, env: Env, uid: string, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/loans')) return null;
  const db = env.DB;
  const now = Date.now();
  await db.batch([ensureWallet(db, uid), db.prepare('INSERT INTO bank_accounts (uid, savings, updated_at) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, now)]);

  if (path === '/api/loans' && req.method === 'GET') return json(await snapshot(db, uid, now));
  if (req.method !== 'POST') return err(405, 'Method not allowed');
  const body = (await req.json().catch(() => null)) as { amount?: unknown; id?: unknown; ids?: unknown } | null;

  // The game has applied what the bank took (houses, cars, jets): don't hand it over again.
  if (path === '/api/loans/ack') {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((n): n is number => Number.isSafeInteger(n)).slice(0, 50) : [];
    if (ids.length) await db.prepare(`UPDATE foreclosures SET applied = 1 WHERE uid = ? AND id IN (${ids.map(() => '?').join(', ')})`).bind(uid, ...ids).run();
    return json({ ok: true });
  }

  const amount = body?.amount;
  // Only borrowing is capped: interest takes what is owed far past the biggest loan, and it must still be payable in one go.
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1) return err(400, 'Choose a valid amount');

  if (path === '/api/loans/take') {
    if (amount > LOAN.maxLimit) return err(400, 'Choose a valid amount');
    if (amount < LOAN.min) return err(400, `The smallest loan is ${naira(LOAN.min)}`);
    if (await jailedUntil(db, uid)) return err(403, 'The bank doesn’t lend to people in a cell');
    const snap = await snapshot(db, uid, now);
    if (snap.bannedUntil) return err(403, 'You defaulted on a loan. The bank won’t lend to you yet');
    if (snap.overdue) return err(409, 'Clear your overdue loan before borrowing again');
    if (amount > snap.available) return err(409, `The bank will lend you at most ${naira(snap.available)} right now`);
    const fee = Math.round((amount * LOAN.feePct) / 100);
    const row = await db
      .prepare(`INSERT INTO loans (uid, principal, interest, borrowed, taken_at, due_at, last_accrual, status) VALUES (?, ?, 0, ?, ?, ?, ?, 'open') RETURNING id`)
      .bind(uid, amount, amount, now, now + LOAN.termDays * LOAN.periodMs, now)
      .first<{ id: number }>();
    if (!row) return err(500, 'Could not open the loan');
    await db.batch([
      ...applyStmts(db, uid, `loan:${row.id}`, 'loan', String(row.id), amount - fee),
      db.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(fee),
    ]);
    return json({ snapshot: await snapshot(db, uid, now), balance: await getBalance(db, uid), received: amount - fee, fee });
  }

  if (path === '/api/loans/repay') {
    const id = body?.id;
    if (typeof id !== 'number') return err(400, 'Choose a loan');
    await accrue(db, uid, now);
    const loan = await db.prepare(`SELECT * FROM loans WHERE id = ? AND uid = ? AND status = 'open'`).bind(id, uid).first<Row>();
    if (!loan) return err(404, 'That loan is already repaid');
    const pay = Math.min(amount, loan.principal + loan.interest);
    const paid = await transfer(db, uid, null, pay, 'loan_repay', '', `loan-repay:${loan.id}:${now}`);
    if (paid <= 0) return err(402, 'You don’t have that much cash');
    const toInterest = Math.min(paid, loan.interest);
    const toPrincipal = paid - toInterest;
    const left = loan.principal - toPrincipal;
    const cleared = left <= 0 && loan.interest - toInterest <= 0;
    await db.batch([
      db.prepare(`UPDATE loans SET interest = interest - ?, principal = principal - ?, status = CASE WHEN principal - ? <= 0 AND interest - ? <= 0 THEN 'repaid' ELSE status END WHERE id = ?`).bind(toInterest, toPrincipal, toPrincipal, toInterest, loan.id),
      // The government keeps the interest.
      db.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(toInterest),
      // Cleared by the due date: a better borrower, lent more against the same things next time.
      ...(cleared && now <= loan.due_at
        ? [db.prepare(`INSERT INTO bank_credit (uid, repaid_on_time) VALUES (?1, 1) ON CONFLICT(uid) DO UPDATE SET repaid_on_time = MIN(?2, repaid_on_time + 1)`).bind(uid, MAX_REPAID)]
        : []),
    ]);
    return json({ snapshot: await snapshot(db, uid, now), balance: await getBalance(db, uid), paid, cleared });
  }

  return err(404, 'Not found');
}

/** Tell a borrower, in the game if they are on and on their phone if not. */
function tellBorrower(env: Env, ctx: ExecutionContext, uid: string, kind: 'overdue' | 'default', title: string, text: string) {
  ctx.waitUntil(notifyPlayer(env, uid, { t: 'loan', kind, text }));
  sendPush(env, ctx, uid, { title, body: text, tag: `loan-${kind}`, category: 'money', app: 'bank' });
}

/** Cron: warn borrowers whose loan just fell due, and foreclose on the ones a day past it. */
export async function sweepLoans(env: Env, ctx: ExecutionContext, now: number) {
  const db = env.DB;
  const due = await db
    .prepare(`UPDATE loans SET warned_at = ?1 WHERE status = 'open' AND due_at <= ?1 AND warned_at IS NULL RETURNING id, uid, principal, interest, due_at`)
    .bind(now)
    .all<{ id: number; uid: string; principal: number; interest: number; due_at: number }>();
  for (const l of due.results) {
    tellBorrower(env, ctx, l.uid, 'overdue', '🏦 Your loan is overdue',
      `You owe the bank ${naira(l.principal + l.interest)} and interest has doubled. Pay within 24 hours or the bank takes your cash, cars and houses, and you go to a cell.`);
  }
  const late = await db
    .prepare(`SELECT * FROM loans WHERE status = 'open' AND due_at <= ? ORDER BY due_at LIMIT 10`)
    .bind(now - LOAN.graceMs)
    .all<Row>();
  for (const l of late.results) await foreclose(env, ctx, l.id, l.uid, now).catch((e) => console.error('foreclosure failed', l.id, e));
}

/** Take what a defaulted loan is owed, sell it, jail the borrower and close the loan. Once per loan. */
async function foreclose(env: Env, ctx: ExecutionContext, loanId: number, uid: string, now: number) {
  const db = env.DB;
  await accrue(db, uid, now);
  // Claim it first: whoever gets here first forecloses, once.
  const loan = await db
    .prepare(`UPDATE loans SET status = 'defaulted', defaulted_at = ?2 WHERE id = ?1 AND status = 'open' RETURNING *`)
    .bind(loanId, now)
    .first<Row>();
  if (!loan) return;
  const owed = loan.principal + loan.interest;
  let left = owed;
  const taken: { kind: 'cash' | 'savings' | Asset['kind']; ref: string; label: string; value: number; property?: Property }[] = [];

  // Cash first, then savings: no sale needed, and never more than is owed.
  const cash = await transfer(db, uid, null, left, 'loan_seized', '', `loan-seized:${loan.id}`);
  if (cash > 0) { left -= cash; taken.push({ kind: 'cash', ref: 'cash', label: 'Cash', value: cash }); }
  if (left > 0) {
    const bank = await db.prepare('SELECT savings FROM bank_accounts WHERE uid = ?').bind(uid).first<{ savings: number }>();
    const take = Math.min(left, bank?.savings ?? 0);
    if (take > 0) {
      const done = await db.prepare('UPDATE bank_accounts SET savings = savings - ?2, updated_at = ?3 WHERE uid = ?1 AND savings >= ?2').bind(uid, take, now).run();
      if (done.meta.changes) { left -= take; taken.push({ kind: 'savings', ref: 'savings', label: 'Savings', value: take }); }
    }
  }

  // Then cars and jets, cheapest first, then houses (cheapest first, the one they live in last), until it is covered.
  // Each is sold whole: whatever it fetches beyond the debt is paid back to the borrower.
  let surplus = 0;
  const { assets, save, savedAt } = left > 0 ? await seizable(db, uid) : { assets: [], save: null, savedAt: null };
  const home = save?.homePropertyId ?? null;
  const order = [
    ...assets.filter((a) => a.kind !== 'house').sort((a, b) => a.value - b.value),
    ...assets.filter((a) => a.kind === 'house').sort((a, b) => Number(a.ref === home) - Number(b.ref === home) || a.value - b.value),
  ];
  for (const a of order) {
    if (left <= 0) break;
    taken.push(a);
    const kept = Math.min(left, a.value);
    left -= kept;
    surplus += a.value - kept;
  }
  const sold = taken.filter((t) => t.kind === 'car' || t.kind === 'jet' || t.kind === 'house');
  const houses = new Set(sold.filter((t) => t.kind === 'house').map((t) => t.ref));
  const recovered = owed - left;

  const stmts: D1PreparedStatement[] = [
    // The record, and what the borrower's game has to apply.
    ...taken.map((t) =>
      db.prepare('INSERT INTO foreclosures (uid, loan_id, kind, ref, property_json, value, created_at, applied) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(uid, loan.id, t.kind, t.ref, t.property ? JSON.stringify(t.property) : null, t.value, now, t.kind === 'cash' || t.kind === 'savings' ? 1 : 0)),
    // Cars and jets leave the ledger's count (migrations/0081_owned.sql), so a save that still has them is corrected.
    ...sold.filter((t) => t.kind !== 'house').map((t, i) =>
      db.prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) VALUES (?1, ?2, 'stolen', ?3, 0, 1, ?4) ON CONFLICT(uid, client_id) DO NOTHING`)
        .bind(uid, `foreclosed:${loan.id}:${i}`, t.ref, now)),
    ...[...houses].map((pid) => db.prepare('DELETE FROM estate_plots WHERE uid = ? AND pid = ?').bind(uid, pid)),
    db.prepare('UPDATE loans SET recovered = ?2, written_off = ?3 WHERE id = ?1').bind(loan.id, recovered, left),
    // The government keeps the interest it got back, as on a loan repaid.
    db.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(Math.min(recovered, loan.interest)),
    db.prepare(
      `INSERT INTO bank_credit (uid, repaid_on_time, defaults, banned_until) VALUES (?1, 0, 1, ?2)
       ON CONFLICT(uid) DO UPDATE SET repaid_on_time = 0, defaults = defaults + 1, banned_until = ?2`,
    ).bind(uid, now + LOAN.banMs),
    ...(surplus > 0 ? applyStmts(db, uid, `loan-surplus:${loan.id}`, 'loan_surplus', String(loan.id), surplus) : []),
  ];
  // The stored save, so profiles, cribs and other players see the change now. Only over the copy read above: if the
  // player saved since, their next upload is corrected instead (worker/index.ts), and their game applies `foreclosed`.
  if (save && savedAt !== null && sold.length) {
    const lost = [...sold];
    const takeOne = (list: string[] | undefined, kind: 'car' | 'jet') => (list ?? []).filter((id) => {
      const i = lost.findIndex((t) => t.kind === kind && t.ref === id);
      if (i < 0) return true;
      lost.splice(i, 1);
      return false;
    });
    save.ownedCars = takeOne(save.ownedCars, 'car');
    if (save.selectedCar && !save.ownedCars.includes(save.selectedCar)) save.selectedCar = save.ownedCars[0] ?? null;
    save.ownedJets = takeOne(save.ownedJets, 'jet');
    if (houses.size) {
      const active = save.properties?.find((p) => p.id === save.activeHouseId);
      save.properties = (save.properties ?? []).filter((p) => !houses.has(p.id));
      const fallback = save.properties.find((p) => (p.stage ?? 0) >= STAGES.length) ?? null;
      if (save.homePropertyId && houses.has(save.homePropertyId)) save.homePropertyId = fallback?.id ?? null;
      if (save.activeHouseId && houses.has(save.activeHouseId)) {
        // Furniture is theirs: it goes to storage, as when the EFCC takes a house.
        save.furnitureInventory = [...(save.furnitureInventory ?? []), ...(active?.items ?? save.items ?? [])];
        save.activeHouseId = fallback?.id ?? null;
        save.items = fallback?.items ?? [];
      }
    }
    stmts.push(db.prepare('UPDATE saves SET data = ? WHERE uid = ? AND saved_at = ?').bind(JSON.stringify(save), uid, savedAt));
  }
  await db.batch(stmts);

  const short = left > 0;
  await jail(db, uid, short ? LOAN.shortJailMinutes : LOAN.jailMinutes, `Loan default · ${naira(owed)} owed to the bank`);
  const names = taken.map((t) => (t.kind === 'cash' || t.kind === 'savings' ? `${naira(t.value)} ${t.kind}` : `your ${t.label}`));
  const list = names.length ? names.join(', ') : 'nothing: you had nothing left';
  tellBorrower(env, ctx, uid, 'default', '🏦 The bank has foreclosed',
    `Your loan of ${naira(loan.borrowed)} went unpaid. The bank took ${list}${surplus > 0 ? `, and paid you back ${naira(surplus)} from the sale` : ''}. ${short ? `${naira(left)} was written off. ` : ''}You are in a cell, and the bank won’t lend to you for a week.`);
  const who = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(uid).first<{ username: string | null }>();
  if (who?.username && sold.length) {
    const city = sold.find((t) => t.kind === 'house') ? assets.find((a) => houses.has(a.ref))?.city ?? null : null;
    await feedStmt(db, uid, 'crime', '🏦',
      `FORECLOSED: @${who.username} didn’t pay back a ${naira(loan.borrowed)} bank loan. The bank has taken ${sold.map((t) => `their ${t.label}`).join(', ')}, and the police have taken them. 🚓`,
      city).run().catch(() => {});
  }
}
