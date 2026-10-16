import { EFCC, EFCC_DIRTY_KINDS, EFCC_RECORD_MS, efccConvicts, efccSource, type EfccCase, type EfccIncome, type EfccStatus } from '../src/game/efcc';
import { DESIGN_BY_ID, STAGES, type Property } from '../src/game/property';
import { syncEstate } from './estate';
import { sendPush } from './push';
import { applyStmts, ensureWallet } from './wallet';
import { notifyPlayer } from './shards';
import { loadLaws } from './crime';
import { jail } from './fun';
import { furnitureOf, houseReturned, recordExhibits, seizuresOf } from './exhibits';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}

interface IncomeRow { at: number; kind: string; amount: number; scam: number }
interface SaveRow { data: string; saved_at: number; balance: number }
interface CaseRow {
  id: string; accuser_uid: string; target_uid: string; status: EfccStatus; filed_at: number; resolves_at: number;
  audit_json: string; statement: string | null; bribe_attempted: number; bribe_succeeded: number | null; fine: number | null;
  seized_property_json: string | null; buyback_price: number | null; bought_back_at: number | null;
  accuser_revealed_at: number | null;
}
interface SaveData {
  properties?: Property[];
  items?: Property['items'];
  furnitureInventory?: Property['items'];
  homePropertyId?: string | null;
  activeHouseId?: string | null;
  [key: string]: unknown;
}

const isIllicit = (kind: string, scam: number) => EFCC_DIRTY_KINDS.includes(kind) || scam > 0;

/** The target's latest incomes since `since` (the last case filed on them): money already judged is not read again. */
async function audit(db: D1Database, uid: string, since = 0): Promise<EfccIncome[]> {
  const { results } = await db.prepare(
    `SELECT l.created_at AS at, l.kind, l.amount,
       CASE WHEN l.kind = 'transfer_in' AND EXISTS (
         SELECT 1 FROM scams s
         JOIN messages request ON request.id = s.message_id AND request.kind = 'request'
         JOIN messages payment ON payment.ref = request.id AND payment.kind = 'pay'
           AND payment.to_uid = l.uid AND payment.from_uid = s.victim_uid
           AND payment.amount = l.amount AND ABS(payment.created_at - l.created_at) <= 2000
         WHERE s.scammer_uid = l.uid AND s.status IN ('paid', 'reported') AND s.amount = l.amount
       ) THEN 1 ELSE 0 END AS scam
     FROM ledger l
     WHERE l.uid = ? AND l.applied = 1 AND l.amount > 0 AND l.created_at > ?
     ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
  ).bind(uid, since, EFCC.auditSize).all<IncomeRow>();
  return results.map((row) => ({
    at: row.at,
    kind: row.kind,
    source: efccSource(row.kind),
    amount: row.amount,
    illicit: isIllicit(row.kind, row.scam),
  }));
}

function fromRow(row: CaseRow, target: string, accuser: string, viewerUid: string, ownedPropertyIds: Set<string>): EfccCase {
  let property: Property | null = null;
  if (row.seized_property_json) {
    try {
      property = JSON.parse(row.seized_property_json) as Property;
    } catch {
      property = null;
    }
  }
  // The accused doesn't learn who filed it until they pay the reveal fee in the EFCC app.
  const hidden = row.target_uid === viewerUid && row.accuser_revealed_at === null;
  return {
    id: row.id,
    targetUid: row.target_uid,
    accuserUid: hidden ? '' : row.accuser_uid,
    status: row.status,
    target,
    accuser: hidden ? '' : accuser,
    accuserHidden: hidden,
    filedAt: row.filed_at,
    resolvesAt: row.resolves_at,
    audit: JSON.parse(row.audit_json) as EfccIncome[],
    statement: row.statement,
    bribeAttempted: !!row.bribe_attempted,
    bribeSucceeded: row.bribe_succeeded === null ? null : !!row.bribe_succeeded,
    fine: row.fine,
    seizedProperty: property
      ? {
          id: property.id,
          name: DESIGN_BY_ID[property.design ?? '']?.name ?? 'Property',
          price: row.buyback_price ?? 0,
          boughtBack: row.bought_back_at !== null,
          ...(row.target_uid === viewerUid && row.bought_back_at !== null && ownedPropertyIds.has(property.id) ? { property } : {}),
        }
      : null,
  };
}

async function balance(db: D1Database, uid: string) {
  return (await db.prepare('SELECT balance FROM wallets WHERE uid = ?').bind(uid).first<{ balance: number }>())?.balance ?? 0;
}

async function caseRow(db: D1Database, id: string, uid: string) {
  return db.prepare('SELECT * FROM efcc_cases WHERE id = ? AND (accuser_uid = ? OR target_uid = ?)').bind(id, uid, uid).first<CaseRow>();
}

async function settle(db: D1Database, row: CaseRow, now: number) {
  if (row.status !== 'investigating' || row.resolves_at > now) return;
  const convicted = efccConvicts(JSON.parse(row.audit_json) as EfccIncome[]);
  const saveRow = await db.prepare('SELECT data, saved_at FROM saves WHERE uid = ?').bind(row.target_uid)
    .first<{ data: string; saved_at: number }>();
  let save: SaveData | null = null;
  let seized: Property | null = null;
  // A seized house that wasn't the one they live in goes with its furniture; the one they live in leaves it behind.
  let withFurniture = false;
  if (saveRow) {
    try {
      save = JSON.parse(saveRow.data) as SaveData;
      const properties = Array.isArray(save.properties) ? save.properties : [];
      const primary = properties.find((p) => p.id === save?.homePropertyId && p.stage >= STAGES.length);
      seized = primary ?? properties
        .filter((p) => p.stage >= STAGES.length)
        .sort((a, b) => b.spent - a.spent)[0] ?? null;
      if (!convicted) seized = null;
      if (seized) {
        withFurniture = save.activeHouseId !== seized.id;
        save.properties = properties.filter((p) => p.id !== seized!.id);
        const fallback = save.properties?.find((p) => p.stage >= STAGES.length) ?? null;
        if (save.homePropertyId === seized.id) save.homePropertyId = fallback?.id ?? null;
        if (save.activeHouseId === seized.id) {
          save.activeHouseId = fallback?.id ?? null;
          save.items = fallback?.items ?? [];
          save.furnitureInventory = [...(save.furnitureInventory ?? []), ...(seized.items ?? [])];
        }
      }
    } catch {
      save = null;
      seized = null;
    }
  }
  const finalStatus: EfccStatus = convicted ? 'convicted' : 'cleared';
  const buybackPrice = seized ? Math.max(500_000, Math.round(seized.spent * 0.75)) : null;
  const statements: D1PreparedStatement[] = [];
  if (save && saveRow && seized) {
    statements.push(db.prepare('UPDATE saves SET data = ?, saved_at = ? WHERE uid = ? AND saved_at = ?')
      .bind(JSON.stringify(save), now, row.target_uid, saveRow.saved_at));
  }
  const guardSave = save && saveRow && seized ? `AND changes() = 1` : '';
  statements.push(db.prepare(
    `UPDATE efcc_cases SET status = ?, resolved_at = ?, seized_property_json = ?, buyback_price = ?,
       fine = CASE WHEN ? = 'convicted' THEN (
         SELECT CAST((w.balance + COALESCE(a.savings, 0)) * ? / 100 AS INTEGER)
         FROM wallets w LEFT JOIN bank_accounts a ON a.uid = w.uid WHERE w.uid = ?
       ) ELSE NULL END
     WHERE id = ? AND status = 'investigating' AND resolves_at <= ? ${guardSave}`,
  ).bind(finalStatus, now, seized ? JSON.stringify(seized) : null, buybackPrice,
    finalStatus, EFCC.walletSeizurePercent, row.target_uid, row.id, now));
  if (convicted) {
    statements.push(
      db.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?, 'efcc-fine:' || ?, 'efcc_fine', ?, -CAST(balance * ? / 100 AS INTEGER), 1, ?
         FROM wallets WHERE uid = ? AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ? AND status = 'convicted')
         ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(row.target_uid, row.id, row.id, EFCC.walletSeizurePercent, now, row.target_uid, row.id),
      db.prepare(
        `UPDATE wallets SET balance = MAX(0, balance - (
           SELECT -amount FROM ledger WHERE uid = ? AND client_id = ? AND kind = 'efcc_fine'
         )), updated_at = ?
         WHERE uid = ? AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ? AND status = 'convicted')`,
      ).bind(row.target_uid, `efcc-fine:${row.id}`, now, row.target_uid, row.id),
      db.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?, 'efcc-fine-savings:' || ?, 'efcc_fine_savings', ?, -CAST(savings * ? / 100 AS INTEGER), 1, ?
         FROM bank_accounts WHERE uid = ? AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ? AND status = 'convicted')
         ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(row.target_uid, row.id, row.id, EFCC.walletSeizurePercent, now, row.target_uid, row.id),
      db.prepare(
        `UPDATE bank_accounts SET savings = MAX(0, savings - (
           SELECT -amount FROM ledger WHERE uid = ? AND client_id = ? AND kind = 'efcc_fine_savings'
         )), updated_at = ?
         WHERE uid = ? AND EXISTS (SELECT 1 FROM ledger WHERE uid = ? AND client_id = ? AND kind = 'efcc_fine_savings')`,
      ).bind(row.target_uid, `efcc-fine-savings:${row.id}`, now, row.target_uid, row.target_uid, `efcc-fine-savings:${row.id}`),
      db.prepare('DELETE FROM estate_plots WHERE uid = ? AND pid = ? AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ? AND status = \'convicted\')')
        .bind(row.target_uid, seized?.id ?? '', row.id),
    );
  }
  await db.batch(statements);
  // A conviction is an arrest: the EFCC lock the accused up for longer than the police would. Only the call that closed the case does it.
  if (convicted) {
    const closed = await db.prepare("SELECT 1 AS ok FROM efcc_cases WHERE id = ? AND status = 'convicted' AND resolved_at = ?").bind(row.id, now).first();
    if (closed) {
      await jail(db, row.target_uid, (await loadLaws(db)).jailMinutes * 1.5, 'Proceeds of crime · convicted by the EFCC');
      // The exhibit book: what came out of the wallet and the bank, and the house with whatever was in it.
      const { results: taken } = await db
        .prepare("SELECT client_id, -amount AS amount FROM ledger WHERE uid = ? AND client_id IN (?, ?)")
        .bind(row.target_uid, `efcc-fine:${row.id}`, `efcc-fine-savings:${row.id}`)
        .all<{ client_id: string; amount: number }>();
      const took = (id: string) => taken.find((t) => t.client_id === id)?.amount ?? 0;
      // What the EFCC recovered goes to the federal treasury.
      const recovered = took(`efcc-fine:${row.id}`) + took(`efcc-fine-savings:${row.id}`);
      if (recovered > 0) await db.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(recovered).run();
      await recordExhibits(db, row.target_uid, `case:${row.id}`, 'Convicted by the EFCC', [
        { kind: 'cash', icon: '💵', label: `${EFCC.walletSeizurePercent}% of your wallet`, value: took(`efcc-fine:${row.id}`) },
        { kind: 'savings', icon: '🏦', label: `${EFCC.walletSeizurePercent}% of your savings`, value: took(`efcc-fine-savings:${row.id}`) },
        ...(seized ? [{ kind: 'house' as const, icon: '🏠', label: DESIGN_BY_ID[seized.design ?? '']?.name ?? 'Your house', value: seized.spent }] : []),
        ...(seized && withFurniture ? furnitureOf(seized.items) : []),
      ], now);
    }
  }
}

async function refreshedRows(db: D1Database, uid: string) {
  const { results } = await db.prepare(
    `SELECT c.*, target.username AS target, accuser.username AS accuser
     FROM efcc_cases c
     JOIN players target ON target.uid = c.target_uid
     JOIN players accuser ON accuser.uid = c.accuser_uid
     WHERE (c.accuser_uid = ?1 OR c.target_uid = ?1)
       AND (c.status = 'investigating' OR COALESCE(c.resolved_at, c.resolves_at) > ?2
         OR (c.status = 'convicted' AND c.seized_property_json IS NOT NULL AND c.bought_back_at IS NULL))
     ORDER BY c.filed_at DESC LIMIT 50`,
  ).bind(uid, Date.now() - EFCC_RECORD_MS).all<CaseRow & { target: string; accuser: string }>();
  return results;
}

/** Close every EFCC investigation whose time is up (the cron does this, so cases resolve even if nobody opens the app). */
export async function settleDueCases(db: D1Database, limit = 25) {
  const now = Date.now();
  const { results } = await db.prepare("SELECT * FROM efcc_cases WHERE status = 'investigating' AND resolves_at <= ? LIMIT ?").bind(now, limit).all<CaseRow>();
  for (const row of results) await settle(db, row, now);
}

export async function handleEfcc(req: Request, env: Env, ctx: ExecutionContext, uid: string, path: string): Promise<Response | null> {
  if (path === '/api/efcc' && req.method === 'GET') {
    const now = Date.now();
    const pending = await env.DB.prepare(
      "SELECT * FROM efcc_cases WHERE (target_uid = ? OR accuser_uid = ?) AND status = 'investigating' AND resolves_at <= ?",
    ).bind(uid, uid, now).all<CaseRow>();
    for (const row of pending.results) await settle(env.DB, row, now);
    const rows = await refreshedRows(env.DB, uid);
    const ownedPropertyIds = new Set<string>();
    if (rows.some((row) => row.target_uid === uid && row.bought_back_at !== null)) {
      const save = await env.DB.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>();
      if (save) {
        const parsed = JSON.parse(save.data) as { properties?: { id?: string }[] };
        for (const property of parsed.properties ?? []) if (property.id) ownedPropertyIds.add(property.id);
      }
    }
    return json({ cases: rows.map((row) => fromRow(row, row.target, row.accuser, uid, ownedPropertyIds)), seizures: await seizuresOf(env.DB, uid) });
  }

  if (path === '/api/efcc/cases' && req.method === 'POST') {
    const body = await req.json().catch(() => null) as { target?: unknown; requestId?: unknown } | null;
    const username = typeof body?.target === 'string' ? body.target.replace(/^@/, '').trim().toLowerCase() : '';
    if (!username || username.length > 32) return err(400, 'Enter a valid player username');
    if (body?.requestId !== undefined && (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))) {
      return err(400, 'Invalid filing request id');
    }
    const id = typeof body?.requestId === 'string' ? body.requestId : crypto.randomUUID();
    const target = await env.DB.prepare('SELECT uid, efcc_case_at FROM players WHERE LOWER(username) = LOWER(?)').bind(username).first<{ uid: string; efcc_case_at: number | null }>();
    if (!target) return err(404, 'No player has that username');
    if (target.uid === uid) return err(400, 'You cannot accuse yourself');
    const prior = await env.DB.prepare('SELECT id FROM efcc_cases WHERE id = ? AND accuser_uid = ? AND target_uid = ?')
      .bind(id, uid, target.uid).first<{ id: string }>();
    if (prior) return json({ balance: await balance(env.DB, uid), id: prior.id }, 200);
    const already = await env.DB.prepare("SELECT 1 AS yes FROM efcc_cases WHERE target_uid = ? AND status = 'investigating' AND resolves_at > ?")
      .bind(target.uid, Date.now()).first();
    if (already) return err(409, 'This player already has an open investigation');
    const expired = await env.DB.prepare("SELECT * FROM efcc_cases WHERE target_uid = ? AND status = 'investigating' AND resolves_at <= ?")
      .bind(target.uid, Date.now()).all<CaseRow>();
    for (const row of expired.results) await settle(env.DB, row, Date.now());
    // One case at a time per person, and then a rest: the same player can't be reported over and over.
    const since = target.efcc_case_at ?? 0;
    const rest = since + EFCC.caseCooldownMs - Date.now();
    if (rest > 0) {
      const hours = Math.ceil(rest / 3_600_000);
      return err(429, `@${username} was investigated recently. A new case can be filed in ${hours} hour${hours === 1 ? '' : 's'}`);
    }
    const evidence = await audit(env.DB, target.uid, since);
    // Everything older was already judged in their last case.
    if (!evidence.length) return err(409, `@${username} has earned nothing since their last case. There is nothing new to investigate`);
    const now = Date.now();
    const filing = await env.DB.batch([
      ensureWallet(env.DB, uid),
      env.DB.prepare(
        `INSERT OR IGNORE INTO efcc_cases (id, accuser_uid, target_uid, status, filed_at, resolves_at, audit_json)
         SELECT ?, ?, ?, 'investigating', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM wallets WHERE uid = ? AND balance >= ?)
           AND NOT EXISTS (SELECT 1 FROM efcc_cases WHERE target_uid = ? AND status = 'investigating')`,
      ).bind(id, uid, target.uid, now, now + EFCC.investigationMs, JSON.stringify(evidence), uid, EFCC.filingFee, target.uid),
      env.DB.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?, 'efcc-file:' || ?, 'efcc_filing', ?, ?, 1, ?
         WHERE EXISTS (SELECT 1 FROM efcc_cases WHERE id = ? AND status = 'investigating')
           AND EXISTS (SELECT 1 FROM wallets WHERE uid = ? AND balance >= ?)
         ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(uid, id, id, -EFCC.filingFee, now, id, uid, EFCC.filingFee),
      env.DB.prepare(
        `UPDATE wallets SET balance = balance - ?, updated_at = ?
         WHERE uid = ? AND balance >= ? AND EXISTS (SELECT 1 FROM ledger WHERE uid = ? AND client_id = ? AND kind = 'efcc_filing')
           AND changes() = 1`,
      ).bind(EFCC.filingFee, now, uid, EFCC.filingFee, uid, `efcc-file:${id}`),
      // The filing fee is the state's.
      env.DB.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1 AND changes() = 1').bind(EFCC.filingFee),
      // The case is on their record from now: the cooldown starts, and the next audit reads only what comes after.
      env.DB.prepare('UPDATE players SET efcc_case_at = ?1 WHERE uid = ?2 AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ?3 AND filed_at = ?1)').bind(now, target.uid, id),
    ]);
    if (!filing[3].meta.changes) {
      const retry = await env.DB.prepare('SELECT id FROM efcc_cases WHERE id = ? AND accuser_uid = ? AND target_uid = ?')
        .bind(id, uid, target.uid).first<{ id: string }>();
      if (retry) return json({ balance: await balance(env.DB, uid), id: retry.id }, 200);
      const existing = await env.DB.prepare("SELECT 1 AS yes FROM efcc_cases WHERE target_uid = ? AND status = 'investigating'").bind(target.uid).first();
      return existing
        ? err(409, 'This player already has an open investigation')
        : err(402, `Filing an investigation costs ${EFCC.filingFee.toLocaleString()} naira`);
    }
    notify(env, ctx, target.uid, { t: 'fun', kind: 'efccCase', caseId: id });
    sendPush(env, ctx, target.uid, {
      title: 'New EFCC investigation',
      body: 'Someone has opened an investigation on you. Open the EFCC app to respond, or pay to see who filed it.',
      tag: `efcc-case-${id}`,
      category: 'crime', app: 'efcc',
    });
    return json({ balance: await balance(env.DB, uid), id }, 201);
  }

  const match = path.match(/^\/api\/efcc\/cases\/([0-9a-f-]+)\/(response|bribe|buyback|reveal)$/i);
  if (!match) return null;
  const row = await caseRow(env.DB, match[1], uid);
  if (!row) return err(404, 'Investigation not found');
  const action = match[2];
  const now = Date.now();
  if (row.status === 'investigating' && row.resolves_at <= now) {
    await settle(env.DB, row, now);
  }
  const current = await caseRow(env.DB, row.id, uid);
  if (!current) return err(404, 'Investigation not found');

  if (action === 'response' && req.method === 'POST') {
    if (current.target_uid !== uid) return err(403, 'Only the accused player can respond');
    if (current.status !== 'investigating' || current.resolves_at <= now) return err(409, 'The investigation response window has closed');
    const body = await req.json().catch(() => null) as { statement?: unknown } | null;
    const statement = typeof body?.statement === 'string' ? body.statement.trim().slice(0, 500) : '';
    if (!statement) return err(400, 'Write a short response first');
    await env.DB.prepare('UPDATE efcc_cases SET statement = ? WHERE id = ? AND target_uid = ? AND status = \'investigating\' AND resolves_at > ?')
      .bind(statement, current.id, uid, now).run();
    return json({ balance: await balance(env.DB, uid) });
  }

  if (action === 'reveal' && req.method === 'POST') {
    if (current.target_uid !== uid) return err(403, 'Only the accused player can ask who filed this');
    if (current.accuser_revealed_at !== null) return json({ balance: await balance(env.DB, uid) });
    const revealed = await env.DB.batch([
      ensureWallet(env.DB, uid),
      env.DB.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?, 'efcc-reveal:' || ?, 'efcc_reveal', ?, ?, 1, ?
         WHERE EXISTS (SELECT 1 FROM wallets WHERE uid = ? AND balance >= ?)
         ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(uid, current.id, current.id, -EFCC.revealFee, now, uid, EFCC.revealFee),
      env.DB.prepare(
        `UPDATE wallets SET balance = balance - ?, updated_at = ?
         WHERE uid = ? AND balance >= ? AND EXISTS (SELECT 1 FROM ledger WHERE uid = ? AND client_id = ? AND kind = 'efcc_reveal')
           AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ? AND accuser_revealed_at IS NULL)`,
      ).bind(EFCC.revealFee, now, uid, EFCC.revealFee, uid, `efcc-reveal:${current.id}`, current.id),
      env.DB.prepare(
        `UPDATE efcc_cases SET accuser_revealed_at = ? WHERE id = ? AND target_uid = ? AND accuser_revealed_at IS NULL AND changes() = 1`,
      ).bind(now, current.id, uid),
      // What you pay to look up the accuser goes to the treasury.
      env.DB.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1 AND changes() = 1').bind(EFCC.revealFee),
    ]);
    if (!revealed[3].meta.changes) return err(402, `Finding out who filed it costs ${EFCC.revealFee.toLocaleString()} naira`);
    return json({ balance: await balance(env.DB, uid) });
  }

  if (action === 'bribe' && req.method === 'POST') {
    if (current.target_uid !== uid) return err(403, 'Only the accused player can attempt a bribe');
    if (current.status !== 'investigating' || current.resolves_at <= now) return err(409, 'The investigation is no longer open');
    if (current.bribe_attempted) return err(409, 'You already tried to bribe the EFCC in this case');
    const succeeds = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 < EFCC.bribeChance;
    const batch = await env.DB.batch([
      ensureWallet(env.DB, uid),
      env.DB.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
         SELECT ?, 'efcc-bribe:' || ?, 'efcc_bribe', ?, ?, 1, ?
         WHERE EXISTS (SELECT 1 FROM wallets WHERE uid = ? AND balance >= ?)
         ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(uid, current.id, current.id, -EFCC.bribeAmount, now, uid, EFCC.bribeAmount),
      env.DB.prepare(
        `UPDATE wallets SET balance = balance - ?, updated_at = ?
         WHERE uid = ? AND balance >= ? AND EXISTS (SELECT 1 FROM ledger WHERE uid = ? AND client_id = ? AND kind = 'efcc_bribe')
           AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ? AND status = 'investigating' AND bribe_attempted = 0)`,
      ).bind(EFCC.bribeAmount, now, uid, EFCC.bribeAmount, uid, `efcc-bribe:${current.id}`, current.id),
      env.DB.prepare(
        `UPDATE efcc_cases SET bribe_attempted = 1, bribe_succeeded = ?, status = CASE WHEN ? = 1 THEN 'bribed' ELSE status END,
           resolved_at = CASE WHEN ? = 1 THEN ? ELSE resolved_at END
         WHERE id = ? AND status = 'investigating' AND bribe_attempted = 0
           AND changes() = 1`,
      ).bind(succeeds ? 1 : 0, succeeds ? 1 : 0, succeeds ? 1 : 0, now, current.id, uid),
    ]);
    const wallet = batch[2].meta.changes;
    if (!wallet) return err(402, `A bribe costs ${EFCC.bribeAmount.toLocaleString()} naira`);
    // A bribe goes to whoever chairs the EFCC; with nobody in the chair, the desk officers hand it to the treasury.
    const chair = (await env.DB.prepare('SELECT efcc_uid FROM civic_policies WHERE id = 1').first<{ efcc_uid: string | null }>())?.efcc_uid;
    await env.DB.batch(chair && chair !== uid
      ? [ensureWallet(env.DB, chair), ...applyStmts(env.DB, chair, `efcc-bribe-take:${current.id}`, 'bribe', current.id, EFCC.bribeAmount)]
      : [env.DB.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(EFCC.bribeAmount)]);
    return json({ balance: await balance(env.DB, uid), succeeded: succeeds });
  }

  if (action === 'buyback' && req.method === 'POST') {
    if (current.target_uid !== uid) return err(403, 'Only the player who lost this property can buy it back');
    if (current.status !== 'convicted' || !current.seized_property_json || current.bought_back_at !== null) {
      return err(409, 'This property is not available for buy-back');
    }
    const saveRow = await env.DB.prepare('SELECT data, saved_at FROM saves WHERE uid = ?').bind(uid).first<SaveRow>();
    if (!saveRow || !current.buyback_price) return err(404, 'The saved property is unavailable');
    let save: SaveData;
    let property: Property;
    try {
      save = JSON.parse(saveRow.data) as SaveData;
      property = JSON.parse(current.seized_property_json) as Property;
    } catch {
      return err(500, 'Could not restore the seized property');
    }
    if ((save.properties ?? []).some((p) => p.id === property.id)) return err(409, 'This property is already in your portfolio');
    const now = Date.now();
    const restoredProperties = [...(save.properties ?? []), property];
    if (!save.homePropertyId) save.homePropertyId = property.id;
    const updatedSave = JSON.stringify({ ...save, properties: restoredProperties });
    const bought = await env.DB.batch([
      env.DB.prepare(
      `UPDATE saves SET data = ?, saved_at = ?
       WHERE uid = ? AND saved_at = ? AND EXISTS (
         SELECT 1 FROM efcc_cases WHERE id = ? AND target_uid = ? AND status = 'convicted' AND bought_back_at IS NULL
       ) AND EXISTS (SELECT 1 FROM wallets WHERE uid = ? AND balance >= ?)`,
      ).bind(updatedSave, now, uid, saveRow.saved_at, current.id, uid, uid, current.buyback_price),
      env.DB.prepare(
      `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at)
       SELECT ?, 'efcc-buyback:' || ?, 'efcc_buyback', ?, -?, 1, ?
       WHERE EXISTS (SELECT 1 FROM saves WHERE uid = ? AND saved_at = ?)
         AND EXISTS (SELECT 1 FROM wallets WHERE uid = ? AND balance >= ?)
       ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(uid, current.id, property.id, current.buyback_price, now, uid, now, uid, current.buyback_price),
      env.DB.prepare(
        `UPDATE wallets SET balance = balance - ?, updated_at = ?
         WHERE uid = ? AND balance >= ? AND EXISTS (SELECT 1 FROM ledger WHERE uid = ? AND client_id = ? AND kind = 'efcc_buyback')
           AND changes() = 1`,
      ).bind(current.buyback_price, now, uid, current.buyback_price, uid, `efcc-buyback:${current.id}`),
      env.DB.prepare(
        `UPDATE efcc_cases SET bought_back_at = ?
         WHERE id = ? AND target_uid = ? AND bought_back_at IS NULL AND changes() = 1`,
      ).bind(now, current.id, uid),
    ]);
    if (bought[3].meta.changes) {
      // Buying it back pays the federal treasury.
      await env.DB.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(current.buyback_price).run();
      await houseReturned(env.DB, uid, `case:${current.id}`, now).run().catch(() => {});
    }
    if (!bought[3].meta.changes) {
      const currentBalance = await balance(env.DB, uid);
      return currentBalance < current.buyback_price
        ? err(402, `Buy-back costs ${current.buyback_price.toLocaleString()} naira`)
        : err(409, 'Your save changed. Refresh EFCC and try again');
    }
    const estateRequest = new Request('https://naija.city/api/estate/sync', { method: 'POST', body: JSON.stringify({ properties: restoredProperties }) });
    await syncEstate(estateRequest, env.DB, uid);
    return json({ balance: await balance(env.DB, uid) });
  }
  return null;
}
