import { handle, naira, postFeed } from './feed';
import { loadState } from './clock';
import { MAX_BANK_TRANSFER } from './limits';
import { applyStmts, ensureWallet, getBalance } from './wallet';
import { searchPhone } from './phoneSearch';
import { JAIL_SET, jailedUntil, jailStmt, rand, usernames } from './crime';
import { CREW, crewChance, type CrewInfo, type CrewResult } from '../src/game/heist';
import { notifyPlayer, whereIs } from './shards';
import { placeNameIn, regionOfArea } from '../src/game/regions';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

const HEIST_COOLDOWN_MS = 7 * 24 * 60 * 60_000;
const HEIST_LOOT = 30_000;
const HEIST_JAIL_MS = 15 * 60_000;


/** The bank branch they're standing in ('place:<city>:bank'), or null. */
async function bankArea(env: Env, uid: string) {
  const position = await whereIs(env, uid).catch(() => null);
  return position && /^place:[a-z0-9-]+:bank$/.test(position.area) ? position.area : null;
}

/** That branch's name: Kaduna Community Bank, or Garki Community Bank in Abuja. */
const bankNameOf = (area: string | null) => placeNameIn(regionOfArea(area).id, 'bank');

async function atBank(env: Env, uid: string) {
  return !!(await bankArea(env, uid));
}

function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}

async function account(db: D1Database, uid: string) {
  const [, , wallet, savings, debt] = await db.batch<{ balance: number; savings: number; debt: number }>([
    ensureWallet(db, uid),
    db.prepare('INSERT INTO bank_accounts (uid, savings, updated_at) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, Date.now()),
    db.prepare('SELECT balance FROM wallets WHERE uid = ?').bind(uid),
    db.prepare('SELECT savings FROM bank_accounts WHERE uid = ?').bind(uid),
    db.prepare('SELECT debt FROM bank_accounts WHERE uid = ?').bind(uid),
  ]);
  return { balance: wallet.results[0].balance, savings: savings.results[0].savings, debt: debt.results[0].debt };
}

async function transfer(db: D1Database, uid: string, requestId: string, kind: 'deposit' | 'withdraw', amount: number) {
  const prior = await db.prepare('SELECT kind, amount, applied FROM bank_transactions WHERE uid = ? AND request_id = ?')
    .bind(uid, requestId).first<{ kind: string; amount: number; applied: number }>();
  if (prior && (prior.kind !== kind || prior.amount !== amount)) return err(409, 'This bank request was already used');

  const now = Date.now();
  const statements = [
    ensureWallet(db, uid),
    db.prepare('INSERT INTO bank_accounts (uid, savings, updated_at) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, now),
    db.prepare(
      'INSERT INTO bank_transactions (uid, request_id, kind, amount, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(uid, request_id) DO NOTHING',
    ).bind(uid, requestId, kind, amount, now),
  ];

  if (kind === 'deposit') {
    statements.push(
      db.prepare(
        `UPDATE wallets SET balance = balance - ?3, updated_at = ?4
         WHERE uid = ?1 AND balance >= ?3
           AND EXISTS (SELECT 1 FROM bank_transactions WHERE uid = ?1 AND request_id = ?2 AND applied = 0 AND kind = 'deposit' AND amount = ?3)`,
      ).bind(uid, requestId, amount, now),
      db.prepare('UPDATE bank_accounts SET savings = savings + ?2, updated_at = ?3 WHERE uid = ?1 AND changes() = 1').bind(uid, amount, now),
      db.prepare('UPDATE bank_transactions SET applied = 1 WHERE uid = ?1 AND request_id = ?2 AND applied = 0 AND changes() = 1').bind(uid, requestId),
    );
  } else {
    statements.push(
      db.prepare(
        `UPDATE bank_accounts SET savings = savings - ?3, updated_at = ?4
         WHERE uid = ?1 AND savings >= ?3
           AND EXISTS (SELECT 1 FROM bank_transactions WHERE uid = ?1 AND request_id = ?2 AND applied = 0 AND kind = 'withdraw' AND amount = ?3)`,
      ).bind(uid, requestId, amount, now),
      db.prepare('UPDATE wallets SET balance = balance + ?2, updated_at = ?3 WHERE uid = ?1 AND changes() = 1').bind(uid, amount, now),
      db.prepare('UPDATE bank_transactions SET applied = 1 WHERE uid = ?1 AND request_id = ?2 AND applied = 0 AND changes() = 1').bind(uid, requestId),
    );
  }

  await db.batch(statements);
  const completed = await db.prepare('SELECT applied FROM bank_transactions WHERE uid = ? AND request_id = ?')
    .bind(uid, requestId).first<{ applied: number }>();
  if (!completed?.applied) {
    const current = await account(db, uid);
    return err(400, kind === 'deposit'
      ? `Your wallet only has ${current.balance.toLocaleString('en-NG')}`
      : `Your savings only have ${current.savings.toLocaleString('en-NG')}`);
  }
  return json(await account(db, uid));
}

async function repayDebt(db: D1Database, uid: string, requestId: string, amount: number) {
  const prior = await db.prepare('SELECT amount, applied FROM debt_payments WHERE uid = ? AND request_id = ?')
    .bind(uid, requestId).first<{ amount: number; applied: number }>();
  if (prior && prior.amount !== amount) return err(409, 'This debt payment request was already used');
  if (prior?.applied) return json(await account(db, uid));

  const now = Date.now();
  await db.batch([
    ensureWallet(db, uid),
    db.prepare('INSERT INTO bank_accounts (uid, savings, updated_at) VALUES (?, 0, ?) ON CONFLICT(uid) DO NOTHING').bind(uid, now),
    db.prepare(
      'INSERT INTO debt_payments (uid, request_id, amount, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(uid, request_id) DO NOTHING',
    ).bind(uid, requestId, amount, now),
    db.prepare(
      `UPDATE wallets SET balance = balance - ?3, updated_at = ?4
       WHERE uid = ?1 AND balance >= ?3
         AND EXISTS (SELECT 1 FROM bank_accounts WHERE uid = ?1 AND debt >= ?3)
         AND EXISTS (SELECT 1 FROM debt_payments WHERE uid = ?1 AND request_id = ?2 AND applied = 0 AND amount = ?3)`,
    ).bind(uid, requestId, amount, now),
    db.prepare('UPDATE bank_accounts SET debt = debt - ?2, updated_at = ?3 WHERE uid = ?1 AND changes() = 1')
      .bind(uid, amount, now),
    db.prepare('UPDATE debt_payments SET applied = 1 WHERE uid = ?1 AND request_id = ?2 AND applied = 0 AND changes() = 1')
      .bind(uid, requestId),
  ]);
  const completed = await db.prepare('SELECT applied FROM debt_payments WHERE uid = ? AND request_id = ?')
    .bind(uid, requestId).first<{ applied: number }>();
  if (!completed?.applied) {
    const current = await account(db, uid);
    return err(400, current.debt < amount
      ? `Your outstanding debt is only ${current.debt.toLocaleString('en-NG')}`
      : `Your wallet only has ${current.balance.toLocaleString('en-NG')}`);
  }
  return json(await account(db, uid));
}

async function heist(env: Env, uid: string, requestId: string) {
  const db = env.DB;
  const existing = await db.prepare('SELECT success, amount, jailed_until, created_at FROM bank_heists WHERE uid = ? AND request_id = ?')
    .bind(uid, requestId)
    .first<{ success: number; amount: number; jailed_until: number | null; created_at: number }>();
  if (existing) {
    return json({
      success: !!existing.success, amount: existing.amount, jailedUntil: existing.jailed_until,
      readyAt: existing.created_at + HEIST_COOLDOWN_MS, balance: await getBalance(db, uid),
    });
  }

  const branch = await bankArea(env, uid);
  if (!branch) return err(409, 'Be inside a bank branch to try this');
  const bankName = bankNameOf(branch);
  if (await myOpenCrew(db, uid)) return err(409, 'You’re in a crew. Leave it before going solo');

  const state = await loadState(db, uid);
  if (state.knowledge < 5) return err(403, 'A bank heist needs at least 5 knowledge. Learn more before attempting it.');
  const save = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>();
  const jobId = save ? (JSON.parse(save.data) as { jobId?: string }).jobId : null;
  if (jobId === 'police') return err(403, 'You cannot rob the bank while serving as a police officer');

  const now = Date.now();
  const success = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 < Math.min(0.35, 0.12 + state.knowledge * 0.03);
  const jailedUntil = success ? null : now + HEIST_JAIL_MS;
  const amount = success ? HEIST_LOOT : 0;
  const cooldown = now - HEIST_COOLDOWN_MS;
  const statements = [
    ensureWallet(db, uid),
    db.prepare(
      `INSERT INTO bank_heists (uid, request_id, success, amount, jailed_until, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE NOT EXISTS (SELECT 1 FROM bank_heists WHERE uid = ?1 AND created_at > ?7)
       ON CONFLICT(uid, request_id) DO NOTHING`,
    ).bind(uid, requestId, success ? 1 : 0, amount, jailedUntil, now, cooldown),
    db.prepare(
      `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
       SELECT uid, 'bank-heist:' || request_id, 'bank_heist', 'bank', amount, ?
       FROM bank_heists WHERE uid = ? AND request_id = ? AND success = 1 AND paid = 0
       ON CONFLICT(uid, client_id) DO NOTHING`,
    ).bind(now, uid, requestId),
    db.prepare(
      `UPDATE wallets SET balance = balance + (
         SELECT amount FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0
       ), updated_at = ?3
       WHERE uid = ?1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`,
    ).bind(uid, `bank-heist:${requestId}`, now),
    db.prepare('UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2 AND applied = 0').bind(uid, `bank-heist:${requestId}`),
    db.prepare(
      `UPDATE bank_heists SET paid = 1
       WHERE uid = ?1 AND request_id = ?2 AND success = 1
         AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?3 AND applied = 1)`,
    ).bind(uid, requestId, `bank-heist:${requestId}`),
    db.prepare(
      `UPDATE players SET ${JAIL_SET}
       WHERE uid = ?1 AND EXISTS (SELECT 1 FROM bank_heists WHERE uid = ?1 AND request_id = ?5 AND success = 0)`,
    ).bind(uid, jailedUntil ?? 0, now, JSON.stringify(['Bank robbery · the alarm caught you']), requestId),
  ];
  await db.batch(statements);

  const attempt = await db.prepare('SELECT success, amount, jailed_until, created_at FROM bank_heists WHERE uid = ? AND request_id = ?')
    .bind(uid, requestId)
    .first<{ success: number; amount: number; jailed_until: number | null; created_at: number }>();
  if (!attempt) return err(429, 'The bank is watching you. You can try again after the weekly cooldown.');
  if (attempt.created_at === now && !attempt.success) {
    attempt.jailed_until = (await searchPhone(env, uid, 'police', HEIST_JAIL_MS / 60_000)).until ?? attempt.jailed_until;
  }
  if (attempt.created_at === now) {
    const who = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(uid).first<{ username: string | null }>();
    await postFeed(
      db, uid, 'heist', attempt.success ? '🏦' : '🚨',
      attempt.success
        ? `BREAKING: Masked robbers hit ${bankName} and escaped with ${naira(attempt.amount)}. Police say they are “on top of the matter”. 👀`
        : `${handle(who?.username)} tried to rob ${bankName} and was tackled by the gateman. 🤦🏾 Now in police custody.`,
    );
  }
  return json({
    success: !!attempt.success, amount: attempt.amount, jailedUntil: attempt.jailed_until,
    readyAt: attempt.created_at + HEIST_COOLDOWN_MS, balance: await getBalance(db, uid),
  });
}

/* ---------- Crew heists (rules in src/game/heist.ts) ---------- */

interface CrewRow {
  id: number;
  leader_uid: string;
  bank_area: string;
  status: 'planning' | 'done' | 'failed' | 'cancelled';
  snitch_uid: string | null;
  created_at: number;
  expires_at: number;
}

const POLICE_JOB = 'police';

async function jobOf(db: D1Database, uid: string) {
  const save = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>();
  try {
    return save ? (JSON.parse(save.data) as { jobId?: string }).jobId ?? null : null;
  } catch {
    return null;
  }
}

async function heistReadyAt(db: D1Database, uid: string) {
  const r = await db.prepare('SELECT MAX(created_at) AS last_at FROM bank_heists WHERE uid = ?').bind(uid).first<{ last_at: number | null }>();
  return r?.last_at ? r.last_at + HEIST_COOLDOWN_MS : 0;
}

/** Break up crews that never went in. */
async function expireCrews(db: D1Database, now: number) {
  await db.prepare(`UPDATE heist_crews SET status = 'cancelled' WHERE status = 'planning' AND expires_at <= ?`).bind(now).run();
}

async function crewMembers(db: D1Database, crewId: number) {
  const { results } = await db
    .prepare('SELECT m.uid, p.username FROM heist_members m LEFT JOIN players p ON p.uid = m.uid WHERE m.crew_id = ? ORDER BY m.joined_at')
    .bind(crewId)
    .all<{ uid: string; username: string | null }>();
  return results.map((r) => ({ uid: r.uid, username: r.username ?? 'someone' }));
}

async function toCrew(db: D1Database, row: CrewRow, me: string): Promise<CrewInfo> {
  const members = await crewMembers(db, row.id);
  const leader = members.find((m) => m.uid === row.leader_uid) ?? { uid: row.leader_uid, username: 'someone' };
  const knowledge = (await loadState(db, row.leader_uid)).knowledge;
  return {
    id: row.id, leader, members, expiresAt: row.expires_at, chance: crewChance(knowledge, members.length),
    mine: members.some((m) => m.uid === me),
    ...(row.snitch_uid === me ? { snitched: true } : {}),
  };
}

/** The crew I'm in that hasn't gone in yet, if any. */
const myOpenCrew = (db: D1Database, uid: string) =>
  db
    .prepare(`SELECT c.* FROM heist_crews c JOIN heist_members m ON m.crew_id = c.id WHERE m.uid = ? AND c.status = 'planning' LIMIT 1`)
    .bind(uid)
    .first<CrewRow>();

/** Crews planning a job in this branch, mine first. */
async function crewsAt(db: D1Database, area: string | null, me: string) {
  const mine = await myOpenCrew(db, me);
  const { results } = area
    ? await db.prepare(`SELECT * FROM heist_crews WHERE status = 'planning' AND bank_area = ? ORDER BY id DESC LIMIT 6`).bind(area).all<CrewRow>()
    : { results: [] as CrewRow[] };
  const rows = [...(mine ? [mine] : []), ...results.filter((r) => r.id !== mine?.id)];
  return Promise.all(rows.map((r) => toCrew(db, r, me)));
}

/** Can this player take part in a heist right now? Returns why not. */
async function crewBlocker(env: Env, uid: string, area: string | null) {
  if (!area) return 'Be inside a bank branch to plan a job';
  if ((await jobOf(env.DB, uid)) === POLICE_JOB) return 'You cannot rob the bank while serving as a police officer';
  if (await jailedUntil(env.DB, uid)) return 'You are in a police cell';
  if ((await heistReadyAt(env.DB, uid)) > Date.now()) return 'The bank is watching you. Wait for your weekly cooldown';
  return null;
}

const crewStatus = async (env: Env, uid: string) => ({
  crews: await crewsAt(env.DB, await bankArea(env, uid), uid),
  heistReadyAt: await heistReadyAt(env.DB, uid),
  balance: await getBalance(env.DB, uid),
});

async function tellCrew(env: Env, ctx: ExecutionContext, crewId: number, except: string, event: object) {
  for (const m of await crewMembers(env.DB, crewId)) if (m.uid !== except) notify(env, ctx, m.uid, event);
}

async function crewAction(env: Env, ctx: ExecutionContext, me: string, action: string, crewId: unknown) {
  const db = env.DB;
  const now = Date.now();
  await expireCrews(db, now);
  const here = await bankArea(env, me);

  if (action === 'crew_plan') {
    const blocked = await crewBlocker(env, me, here);
    if (blocked) return err(409, blocked);
    if ((await loadState(db, me)).knowledge < CREW.leaderKnowledge) return err(403, `Leading a crew needs at least ${CREW.leaderKnowledge} knowledge`);
    if (await myOpenCrew(db, me)) return err(409, 'You’re already in a crew');
    const row = await db
      .prepare(`INSERT INTO heist_crews (leader_uid, bank_area, created_at, expires_at) VALUES (?, ?, ?, ?) RETURNING *`)
      .bind(me, here, now, now + CREW.planMs)
      .first<CrewRow>();
    await db.prepare('INSERT INTO heist_members (crew_id, uid, joined_at) VALUES (?, ?, ?)').bind(row!.id, me, now).run();
    return json(await crewStatus(env, me));
  }

  if (typeof crewId !== 'number') return err(400, 'Pick a crew');
  const crew = await db.prepare(`SELECT * FROM heist_crews WHERE id = ? AND status = 'planning'`).bind(crewId).first<CrewRow>();
  if (!crew) return err(409, 'That crew has broken up');
  const members = await crewMembers(db, crew.id);
  const inCrew = members.some((m) => m.uid === me);

  if (action === 'crew_join') {
    if (inCrew) return err(409, 'You’re already in this crew');
    const blocked = await crewBlocker(env, me, here);
    if (blocked) return err(409, blocked);
    if (here !== crew.bank_area) return err(409, 'This crew is planning a job at another branch');
    if (await myOpenCrew(db, me)) return err(409, 'You’re already in another crew');
    if (members.length >= CREW.maxSize) return err(409, 'The crew is full');
    await db.prepare('INSERT INTO heist_members (crew_id, uid, joined_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(crew.id, me, now).run();
    const names = await usernames(db, [me]);
    await tellCrew(env, ctx, crew.id, me, { t: 'fun', kind: 'crew', text: `🥷🏾 @${names.get(me)} joined your crew` });
    return json(await crewStatus(env, me));
  }

  if (!inCrew) return err(403, 'You’re not in this crew');

  if (action === 'crew_leave') {
    if (crew.leader_uid === me) {
      await db.prepare(`UPDATE heist_crews SET status = 'cancelled' WHERE id = ? AND status = 'planning'`).bind(crew.id).run();
      await tellCrew(env, ctx, crew.id, me, { t: 'fun', kind: 'crew', text: '🚪 Your crew leader called the job off' });
    } else {
      await db.prepare('DELETE FROM heist_members WHERE crew_id = ? AND uid = ?').bind(crew.id, me).run();
      // Leaving after snitching doesn't take the tip back.
      const names = await usernames(db, [me]);
      await tellCrew(env, ctx, crew.id, me, { t: 'fun', kind: 'crew', text: `🚪 @${names.get(me)} left your crew` });
    }
    return json(await crewStatus(env, me));
  }

  if (action === 'crew_snitch') {
    if (crew.leader_uid === me) return err(400, 'You can’t snitch on your own job. Call it off instead');
    // Silent: nobody else in the crew is told.
    await db.prepare('UPDATE heist_crews SET snitch_uid = ? WHERE id = ? AND snitch_uid IS NULL').bind(me, crew.id).run();
    return json(await crewStatus(env, me));
  }

  if (action === 'crew_go') {
    if (crew.leader_uid !== me) return err(403, 'Only the leader can call the job');
    if (here !== crew.bank_area) return err(409, 'Get back inside the branch first');
    // Only those still in the branch go in.
    const present = (
      await Promise.all(members.map(async (m) => ((await bankArea(env, m.uid)) === crew.bank_area ? m : null)))
    ).filter((m): m is { uid: string; username: string } => !!m);
    if (present.length < 2) return err(409, 'Nobody else from your crew is in the branch. Wait for them, or go solo');
    // Lock the job so it can only run once.
    const knowledge = (await loadState(db, me)).knowledge;
    const betrayed = !!crew.snitch_uid;
    const success = !betrayed && rand() < crewChance(knowledge, present.length);
    const locked = await db
      .prepare(`UPDATE heist_crews SET status = ? WHERE id = ? AND status = 'planning' RETURNING id`)
      .bind(success ? 'done' : 'failed', crew.id)
      .first();
    if (!locked) return err(409, 'This job already happened');

    const crooks = present.filter((m) => m.uid !== crew.snitch_uid);
    const share = success ? CREW.lootPerHead : 0;
    const jailUntil = success ? null : now + CREW.jailMs;
    const ref = `crew:${crew.id}`;
    const stmts: D1PreparedStatement[] = [];
    for (const m of present) {
      // Everyone who went in (the snitch too) uses up their weekly attempt.
      const isSnitch = m.uid === crew.snitch_uid;
      const mine = isSnitch ? 0 : share;
      stmts.push(
        db
          .prepare(
            `INSERT INTO bank_heists (uid, request_id, success, amount, jailed_until, paid, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
             ON CONFLICT(uid, request_id) DO NOTHING`,
          )
          .bind(m.uid, ref, success ? 1 : 0, mine, isSnitch ? null : jailUntil, now),
      );
      if (mine > 0) stmts.push(...applyStmts(db, m.uid, `crew-heist:${crew.id}`, 'bank_heist', 'bank', mine));
      if (jailUntil && !isSnitch) stmts.push(jailStmt(db, m.uid, jailUntil, [betrayed ? 'Bank heist · your own crew tipped off the police' : 'Bank heist · the alarm caught the whole crew']));
    }
    if (betrayed && present.some((m) => m.uid === crew.snitch_uid)) {
      stmts.push(...applyStmts(db, crew.snitch_uid!, `crew-snitch:${crew.id}`, 'snitch_reward', 'police', CREW.snitchReward));
    }
    await db.batch(stmts);

    const until = new Map<string, number | null>();
    if (!success) {
      for (const m of crooks) until.set(m.uid, (await searchPhone(env, m.uid, 'police', CREW.jailMs / 60_000)).until ?? jailUntil);
    }
    const names = crooks.map((m) => handle(m.username)).join(', ');
    await postFeed(
      db, me, 'heist', success ? '🏦' : '🚨',
      success
        ? `BREAKING: A crew of ${present.length} masked robbers hit ${bankNameOf(crew.bank_area)} and escaped with ${naira(share * present.length)}. Police are “studying the CCTV”. 👀`
        : betrayed
          ? `Police were WAITING inside the bank when ${names} tried to rob it. Somebody talked. 🐀 All in custody.`
          : `${names} tried to rob ${bankNameOf(crew.bank_area)} together and the gateman tackled them all. 🤦🏾 Now in police custody.`,
    );
    for (const m of present) {
      const isSnitch = m.uid === crew.snitch_uid;
      const result: CrewResult = {
        success, share: isSnitch ? 0 : share, size: present.length, betrayed,
        jailedUntil: isSnitch ? null : until.get(m.uid) ?? jailUntil,
        ...(isSnitch ? { snitchReward: CREW.snitchReward } : {}),
      };
      if (m.uid === me) continue;
      notify(env, ctx, m.uid, { t: 'fun', kind: 'crewResult', result });
    }
    const leaderResult: CrewResult = { success, share, size: present.length, betrayed, jailedUntil: until.get(me) ?? jailUntil };
    return json({ ...(await crewStatus(env, me)), result: leaderResult });
  }

  return err(400, 'Unknown crew action');
}

export async function handleBank(req: Request, env: Env, ctx: ExecutionContext, uid: string, path: string): Promise<Response | null> {
  if (path !== '/api/bank') return null;
  if (req.method === 'GET') {
    await expireCrews(env.DB, Date.now());
    const [accountData, readyAt, crews] = await Promise.all([
      account(env.DB, uid),
      heistReadyAt(env.DB, uid),
      bankArea(env, uid).then((area) => crewsAt(env.DB, area, uid)),
    ]);
    return json({ ...accountData, heistReadyAt: readyAt, crews });
  }
  if (req.method !== 'POST') return err(405, 'Method not allowed');
  const body = (await req.json().catch(() => null)) as { action?: unknown; amount?: unknown; requestId?: unknown } | null;
  if (typeof body?.action === 'string' && body.action.startsWith('crew_')) {
    return crewAction(env, ctx, uid, body.action, (body as { crewId?: unknown }).crewId);
  }
  if (body?.action === 'heist') {
    if (typeof body.requestId !== 'string' || body.requestId.length > 64) return err(400, 'Invalid attempt');
    return heist(env, uid, body.requestId);
  }
  if (body?.action === 'repay_debt') {
    if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount < 1 || body.amount > MAX_BANK_TRANSFER ||
        typeof body.requestId !== 'string' || body.requestId.length > 64) return err(400, 'Choose a valid debt payment');
    return repayDebt(env.DB, uid, body.requestId, body.amount);
  }
  if ((body?.action !== 'deposit' && body?.action !== 'withdraw') ||
      typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount < 100 || body.amount > MAX_BANK_TRANSFER ||
      typeof body.requestId !== 'string' || body.requestId.length > 64) {
    return err(400, 'Choose a valid bank amount');
  }
  if (!(await atBank(env, uid))) return err(409, 'Visit a bank branch to move money in or out of savings');
  return transfer(env.DB, uid, body.requestId, body.action, body.amount);
}
