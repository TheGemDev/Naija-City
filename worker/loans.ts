// Bank loans (rules in src/game/loans.ts). Interest is added lazily, one game week at a time, at the rate the
// president has set; interest paid back goes to the treasury, and so does the loan fee.

import { applyStmts, ensureWallet, getBalance } from './wallet';
import { jailedUntil, transfer } from './crime';
import { naira } from './feed';
import { loadPolicy } from './policy';
import { LOAN, grow, type LoanRow, type LoanSnapshot } from '../src/game/loans';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

interface Row { id: number; principal: number; interest: number; borrowed: number; taken_at: number; due_at: number; last_accrual: number }

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

async function snapshot(db: D1Database, uid: string, now: number): Promise<LoanSnapshot> {
  await accrue(db, uid, now);
  const [rate, { results }, bank, balance] = await Promise.all([
    rateOf(db),
    db.prepare(`SELECT * FROM loans WHERE uid = ? AND status = 'open' ORDER BY id`).bind(uid).all<Row>(),
    db.prepare('SELECT savings FROM bank_accounts WHERE uid = ?').bind(uid).first<{ savings: number }>(),
    getBalance(db, uid),
  ]);
  const loans: LoanRow[] = results.map((l) => ({
    id: l.id, principal: l.principal, interest: l.interest, owed: l.principal + l.interest, borrowed: l.borrowed,
    takenAt: l.taken_at, dueAt: l.due_at, overdue: now > l.due_at,
  }));
  const owed = loans.reduce((a, l) => a + l.owed, 0);
  const limit = Math.min(LOAN.maxLimit, Math.round(LOAN.baseLimit + LOAN.wealthShare * (Math.max(0, balance) + (bank?.savings ?? 0))));
  return { rate, limit, available: Math.max(0, limit - owed), owed, overdue: loans.some((l) => l.overdue), loans };
}

export async function handleLoans(req: Request, env: Env, uid: string, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/loans')) return null;
  const db = env.DB;
  const now = Date.now();
  await db.batch([ensureWallet(db, uid), db.prepare('INSERT INTO bank_accounts (uid, savings, updated_at) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, now)]);

  if (path === '/api/loans' && req.method === 'GET') return json(await snapshot(db, uid, now));
  if (req.method !== 'POST') return err(405, 'Method not allowed');
  const body = (await req.json().catch(() => null)) as { amount?: unknown; id?: unknown } | null;
  const amount = body?.amount;
  // Only borrowing is capped: interest takes what is owed far past the biggest loan, and it must still be payable in one go.
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1) return err(400, 'Choose a valid amount');

  if (path === '/api/loans/take') {
    if (amount > LOAN.maxLimit) return err(400, 'Choose a valid amount');
    if (amount < LOAN.min) return err(400, `The smallest loan is ${naira(LOAN.min)}`);
    if (await jailedUntil(db, uid)) return err(403, 'The bank doesn’t lend to people in a cell');
    const snap = await snapshot(db, uid, now);
    if (snap.overdue) return err(409, 'Clear your overdue loan before borrowing again');
    if (amount > snap.available) return err(409, `The bank will lend you at most ${naira(snap.available)} right now`);
    const fee = Math.round((amount * LOAN.feePct) / 100);
    const row = await db
      .prepare(`INSERT INTO loans (uid, principal, interest, borrowed, taken_at, due_at, last_accrual, status) VALUES (?, ?, 0, ?, ?, ?, ?, 'open') RETURNING id`)
      .bind(uid, amount, amount, now, now + LOAN.termWeeks * LOAN.periodMs, now)
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
    await db.batch([
      db.prepare(`UPDATE loans SET interest = interest - ?, principal = principal - ?, status = CASE WHEN principal - ? <= 0 AND interest - ? <= 0 THEN 'repaid' ELSE status END WHERE id = ?`).bind(toInterest, toPrincipal, toPrincipal, toInterest, loan.id),
      // The government keeps the interest.
      db.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(toInterest),
    ]);
    return json({ snapshot: await snapshot(db, uid, now), balance: await getBalance(db, uid), paid, cleared: left <= 0 && loan.interest - toInterest <= 0 });
  }

  return err(404, 'Not found');
}
