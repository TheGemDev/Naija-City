import { EFCC, EFCC_DIRTY_KINDS, EFCC_FRESH_KINDS, EFCC_RECORD_MS, ELECTION_FRAUD, INEC_ACCUSED_SHOWN, efccConvicts, efccSource, electionConvicts, voteIllicit, voteTied, type EfccCase, type EfccIncome, type EfccStatus, type EfccVote, type InecCase, type PublicEfccCase, type VoteFlag } from '../src/game/efcc';
import { CHAOS, OFFICE_RULES, type PoliticalOffice } from '../src/game/civic';
import { linkedSql, sharedIpSql, twinSql } from './links';
import { syncForum } from './groups';
import { transfer, usernames } from './crime';
import { handle, naira, postFeed } from './feed';
import { DESIGN_BY_ID, STAGES, type Property } from '../src/game/property';
import { syncEstate } from './estate';
import { sendPush } from './push';
import { applyStmts, ensureWallet } from './wallet';
import { notifyPlayer } from './shards';
import { loadLaws } from './crime';
import { jail } from './fun';
import { fineItem, furnitureOf, houseReturned, recordExhibits, seizuresOf } from './exhibits';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}

interface IncomeRow { at: number; kind: string; amount: number; scam: number; fresh: number; near: number; linked: number }
interface SaveRow { data: string; saved_at: number; balance: number }
interface CaseRow {
  id: string; accuser_uid: string; target_uid: string; status: EfccStatus; filed_at: number; resolves_at: number;
  audit_json: string; statement: string | null; bribe_attempted: number; bribe_succeeded: number | null; fine: number | null;
  seized_property_json: string | null; buyback_price: number | null; bought_back_at: number | null;
  accuser_revealed_at: number | null;
  kind: 'money' | 'election';
  election_id: number | null;
}
/** An election audit's vote as stored: who cast it is kept for striking it off, and never sent to players. */
type StoredVote = EfccVote & { voter: string };
interface SaveData {
  properties?: Property[];
  items?: Property['items'];
  furnitureInventory?: Property['items'];
  homePropertyId?: string | null;
  activeHouseId?: string | null;
  [key: string]: unknown;
}

// A new account's money only counts when it came from the receiver's own network: anyone can send money to frame someone.
const isIllicit = (row: IncomeRow) => EFCC_DIRTY_KINDS.includes(row.kind) || row.scam > 0 || row.linked > 0 || (row.fresh > 0 && row.near > 0);

/**
 * SQL: the player ?u was new when the money left them at ?at. New means the account was made, or a life was born or
 * started over (its starting money, ledger kind 'start' or 'reset'), within EFCC.freshAccountMs before then.
 */
const freshAt = (u: string, at: string) =>
  `(EXISTS (SELECT 1 FROM players fp WHERE fp.uid = ${u} AND fp.created_at > ${at} - ?4)
    OR EXISTS (SELECT 1 FROM ledger fs WHERE fs.uid = ${u} AND fs.kind IN ('start', 'reset') AND fs.created_at > ${at} - ?4 AND fs.created_at <= ${at}))`;
const FRESH_KINDS_SQL = EFCC_FRESH_KINDS.map((k) => `'${k}'`).join(', ');

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
       ) THEN 1 ELSE 0 END AS scam,
       CASE
         WHEN l.kind NOT IN (${FRESH_KINDS_SQL}) THEN 0
         -- A game pot: new if any other player who staked in that match was.
         WHEN l.kind = 'game_win' THEN EXISTS (
           SELECT 1 FROM game_matches gm, json_each(gm.players) gp
           JOIN ledger st ON st.uid = gp.value AND st.ref = gm.id AND st.kind = 'game_stake'
           WHERE gm.id = l.ref AND gp.value != l.uid AND ${freshAt('st.uid', 'st.created_at')})
         ELSE ${freshAt('l.ref', 'l.created_at')}
       END AS fresh,
       -- ...played on the receiver's network (a game pot: any new player at the table who was).
       CASE
         WHEN l.kind NOT IN (${FRESH_KINDS_SQL}) THEN 0
         WHEN l.kind = 'game_win' THEN EXISTS (
           SELECT 1 FROM game_matches nm, json_each(nm.players) np
           JOIN ledger ns ON ns.uid = np.value AND ns.ref = nm.id AND ns.kind = 'game_stake'
           WHERE nm.id = l.ref AND np.value != l.uid AND ${freshAt('ns.uid', 'ns.created_at')} AND ${sharedIpSql('ns.uid', 'l.uid')})
         ELSE ${sharedIpSql('l.ref', 'l.uid')}
       END AS near,
       -- Money from another account on the target's own device: passing it between their own accounts.
       CASE
         WHEN l.kind NOT IN (${FRESH_KINDS_SQL}) THEN 0
         WHEN l.kind = 'game_win' THEN EXISTS (
           SELECT 1 FROM game_matches lm, json_each(lm.players) lp WHERE lm.id = l.ref AND ${linkedSql('lp.value', 'l.uid')})
         ELSE ${linkedSql('l.ref', 'l.uid')}
       END AS linked
     FROM ledger l
     WHERE l.uid = ?1 AND l.applied = 1 AND l.amount > 0 AND l.created_at > ?2
     ORDER BY l.created_at DESC, l.id DESC LIMIT ?3`,
  ).bind(uid, since, EFCC.auditSize, EFCC.freshAccountMs).all<IncomeRow>();
  return results.map((row) => ({
    at: row.at,
    kind: row.kind,
    source: row.linked ? `${efccSource(row.kind)} from an account on their device`
      : row.fresh && row.near ? `${efccSource(row.kind)} from a new account on their network`
      : row.fresh ? `${efccSource(row.kind)} from a new account` : efccSource(row.kind),
    amount: row.amount,
    illicit: isIllicit(row),
  }));
}

/** Every vote the candidate has in this race, and what is wrong with each (src/game/efcc.ts VoteFlag). */
async function electionAudit(db: D1Database, electionId: number, candidate: string): Promise<StoredVote[]> {
  type Row = { voter: string; at: number } & Record<VoteFlag, number>;
  const { results } = await db.prepare(
    `SELECT v.voter_uid AS voter, v.updated_at AS at,
       ${linkedSql('v.voter_uid', '?2')} AS device,
       EXISTS (SELECT 1 FROM civic_votes o WHERE o.election_id = ?1 AND o.candidate_uid = ?2 AND ${linkedSql('v.voter_uid', 'o.voter_uid')}) AS ring,
       EXISTS (SELECT 1 FROM ledger pl WHERE pl.uid = v.voter_uid AND pl.ref = ?2 AND pl.kind IN ('transfer_in', 'spray_in')
                 AND pl.created_at BETWEEN v.updated_at - ?3 AND v.updated_at) AS paid,
       ${freshAt('v.voter_uid', 'v.updated_at')} AS fresh,
       ${sharedIpSql('v.voter_uid', '?2')} AS ip,
       ${twinSql('v.voter_uid', '?2')} AS twin
     FROM civic_votes v WHERE v.election_id = ?1 AND v.candidate_uid = ?2
     ORDER BY v.updated_at DESC`,
  ).bind(electionId, candidate, ELECTION_FRAUD.paidWindowMs, EFCC.freshAccountMs).all<Row>();
  return results.map((row) => {
    const flags = (['device', 'ring', 'paid', 'fresh', 'ip', 'twin'] as VoteFlag[]).filter((f) => row[f]);
    return { voter: row.voter, at: row.at, flags, illicit: voteIllicit(flags) };
  });
}

function fromRow(row: CaseRow & { office?: string | null }, target: string, accuser: string, viewerUid: string, ownedPropertyIds: Set<string>): EfccCase {
  const election = row.kind === 'election';
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
    kind: election ? 'election' : 'money',
    ...(election ? {
      office: row.office ?? undefined,
      votes: (JSON.parse(row.audit_json) as StoredVote[]).map(({ at, flags, illicit }) => ({ at, flags, illicit })),
    } : {}),
    targetUid: row.target_uid,
    accuserUid: hidden ? '' : row.accuser_uid,
    status: row.status,
    target,
    accuser: hidden ? '' : accuser,
    accuserHidden: hidden,
    filedAt: row.filed_at,
    resolvesAt: row.resolves_at,
    audit: election ? [] : JSON.parse(row.audit_json) as EfccIncome[],
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
  return row.kind === 'election' ? settleElection(db, row, now) : settleMoney(db, row, now);
}

/**
 * A rigged election. Every fake vote is struck off, whatever the verdict. The candidate is convicted only on votes traced
 * to them (src/game/efcc.ts voteTied): disqualified if the race is still on (out of that election only), fined and jailed,
 * as if caught in a vote-buying sting (worker/civic.ts). A race already over is recounted, and the seat goes to whoever
 * won it without the struck votes.
 */
async function settleElection(db: D1Database, row: CaseRow, now: number) {
  const votes = JSON.parse(row.audit_json) as StoredVote[];
  const convicted = electionConvicts(votes);
  const closed = await db.prepare(
    `UPDATE efcc_cases SET status = ?, resolved_at = ? WHERE id = ? AND status = 'investigating' AND resolves_at <= ?`,
  ).bind(convicted ? 'convicted' : 'cleared', now, row.id, now).run();
  // Only the call that closed the case strikes the votes and hands out the sentence.
  if (!closed.meta.changes) return;
  const race = await db.prepare('SELECT office, status, winner_uid FROM civic_elections WHERE id = ?').bind(row.election_id)
    .first<{ office: PoliticalOffice; status: string; winner_uid: string | null }>();
  const struck = votes.filter((v) => v.illicit).map((v) => v.voter);
  const tied = votes.filter((v) => voteTied(v.flags)).length;
  await db.batch([
    db.prepare('DELETE FROM civic_votes WHERE election_id = ?1 AND candidate_uid = ?2 AND voter_uid IN (SELECT value FROM json_each(?3))')
      .bind(row.election_id, row.target_uid, JSON.stringify(struck)),
    // Disqualified while the race is still on (their remaining votes go with them): their name stays on the board, struck
    // through, and they can't file into this race again.
    ...(convicted
      ? [
          db.prepare(
            `INSERT OR IGNORE INTO civic_disqualified (election_id, uid, reason, at)
             SELECT ?1, ?2, 'fake_votes', ?3 WHERE EXISTS (SELECT 1 FROM civic_candidates c JOIN civic_elections e ON e.id = c.election_id
               WHERE c.election_id = ?1 AND c.uid = ?2 AND e.status = 'open')`,
          ).bind(row.election_id, row.target_uid, now),
          db.prepare(`DELETE FROM civic_candidates WHERE election_id = ? AND uid = ? AND EXISTS (SELECT 1 FROM civic_elections WHERE id = ? AND status = 'open')`)
            .bind(row.election_id, row.target_uid, row.election_id),
        ]
      : []),
  ]);
  const title = race ? OFFICE_RULES[race.office].title : 'election';
  const city = race ? OFFICE_RULES[race.office].city : undefined;
  const who = (await usernames(db, [row.target_uid])).get(row.target_uid);
  // They won a race that is over: recount it without the struck votes (or without them at all, when convicted).
  let unseated = false;
  if (race && race.status !== 'open' && race.winner_uid === row.target_uid && struck.length) {
    const leader = await db.prepare(
      `SELECT c.uid FROM civic_candidates c
       LEFT JOIN civic_votes v ON v.election_id = c.election_id AND v.candidate_uid = c.uid
       WHERE c.election_id = ?1 AND (?3 = 0 OR c.uid != ?2)
       GROUP BY c.uid ORDER BY COUNT(v.voter_uid) DESC, c.support DESC, c.uid ASC LIMIT 1`,
    ).bind(row.election_id, row.target_uid, convicted ? 1 : 0).first<{ uid: string }>();
    const next = leader?.uid ?? null;
    if (next !== row.target_uid) {
      // Only the seat they still hold from this race: a term that has since moved on is left alone.
      const moved = await db.prepare(
        `UPDATE civic_policies SET ${race.office}_uid = ?1, ${race.office}_strikes = 0, updated_at = ?3 WHERE id = 1 AND ${race.office}_uid = ?2`,
      ).bind(next, row.target_uid, now).run();
      if (moved.meta.changes) {
        unseated = true;
        await db.prepare('UPDATE civic_elections SET winner_uid = ? WHERE id = ?').bind(next, row.election_id).run();
        await syncForum(db, now).catch((error) => console.error('forum sync failed', error));
        const heir = next ? (await usernames(db, [next])).get(next) : null;
        await postFeed(
          db, next ?? row.target_uid, 'election', '⚖️',
          `RESULT OVERTURNED: after the EFCC struck ${struck.length} fake vote${struck.length === 1 ? '' : 's'}, ${handle(who)} is no longer ${title}. ${next ? `${handle(heir)} takes the seat.` : 'The seat is vacant.'}`,
          city,
        );
      }
    }
  }
  if (!convicted) return;
  const fine = await transfer(db, row.target_uid, null, CHAOS.stingFine, 'efcc_fine', '', `election-fraud:${row.id}`);
  await db.prepare('UPDATE efcc_cases SET fine = ? WHERE id = ?').bind(fine, row.id).run();
  await recordExhibits(db, row.target_uid, `case:${row.id}`, `EFCC · rigging the ${title} race`, [fineItem(fine)], now);
  await jail(db, row.target_uid, (await loadLaws(db)).jailMinutes, `Election fraud · ${tied} fake vote${tied === 1 ? '' : 's'} in the ${title} race`);
  await postFeed(
    db, row.target_uid, 'election', '🗳️',
    `EFCC: ${tied} of ${title} candidate ${handle(who)}’s ${votes.length} votes came from their own phone, fake accounts on their network, or voters they paid. ${race?.status === 'open' ? 'Disqualified from this race, ' : unseated ? 'Removed from office, ' : ''}${naira(fine)} fine, and a cell. 🚓`,
    city,
  );
}

async function settleMoney(db: D1Database, row: CaseRow, now: number) {
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
    `SELECT c.*, target.username AS target, accuser.username AS accuser, e.office
     FROM efcc_cases c
     JOIN players target ON target.uid = c.target_uid
     JOIN players accuser ON accuser.uid = c.accuser_uid
     LEFT JOIN civic_elections e ON e.id = c.election_id
     WHERE (c.accuser_uid = ?1 OR c.target_uid = ?1)
       AND (c.status = 'investigating' OR COALESCE(c.resolved_at, c.resolves_at) > ?2
         OR (c.status = 'convicted' AND c.seized_property_json IS NOT NULL AND c.bought_back_at IS NULL))
     ORDER BY c.filed_at DESC LIMIT 50`,
  ).bind(uid, Date.now() - EFCC_RECORD_MS).all<CaseRow & { target: string; accuser: string; office: string | null }>();
  return results;
}

/** Close every EFCC investigation whose time is up (the cron does this, so cases resolve even if nobody opens the app). */
export async function settleDueCases(db: D1Database, limit = 25) {
  const now = Date.now();
  const { results } = await db.prepare("SELECT * FROM efcc_cases WHERE status = 'investigating' AND resolves_at <= ? LIMIT ?").bind(now, limit).all<CaseRow>();
  for (const row of results) await settle(db, row, now);
}

/** How many decided election cases INEC sends at a time. */
const INEC_PAGE = 20;

type InecRow = Pick<CaseRow, 'id' | 'target_uid' | 'status' | 'filed_at' | 'resolves_at' | 'audit_json' | 'fine'> & {
  resolved_at: number | null; target: string | null; office: string | null;
};

/**
 * An election case for everyone to read: the vote counts, and the accounts behind the fake votes by username with what
 * was wrong with each vote. Never the device or network data that flagged them, and never who filed it.
 */
function inecCase(row: InecRow, names: Map<string, string>): InecCase {
  const votes = JSON.parse(row.audit_json) as StoredVote[];
  // A bribed case just closes: the public doesn't learn why, or what the audit found.
  const dropped = row.status === 'bribed';
  // Every fake vote is struck when the case is decided, whatever the verdict (settleElection).
  const struck = row.status === 'convicted' || row.status === 'cleared';
  return {
    id: row.id,
    targetUid: row.target_uid,
    target: row.target ?? 'player',
    office: row.office,
    status: dropped ? 'dropped' : row.status as Exclude<EfccStatus, 'bribed'>,
    filedAt: row.filed_at,
    resolvesAt: row.resolves_at,
    resolvedAt: row.resolved_at,
    votes: votes.length,
    fake: dropped ? 0 : votes.filter((v) => v.illicit).length,
    traced: dropped ? 0 : votes.filter((v) => voteTied(v.flags)).length,
    fine: row.status === 'convicted' ? row.fine : null,
    accused: dropped ? [] : accusedOf(votes).map((v) => ({ uid: v.voter, username: names.get(v.voter) ?? 'player', flags: v.flags, struck })),
  };
}

/** The fake votes INEC lists under a case: the ones traced to the candidate first, then the rest, newest first in each. */
const accusedOf = (votes: StoredVote[]) =>
  votes.filter((v) => v.illicit).sort((a, b) => Number(voteTied(b.flags)) - Number(voteTied(a.flags))).slice(0, INEC_ACCUSED_SHOWN);

/**
 * INEC: every open election case on anyone, and the decided ones newest first, a page at a time. `before` is the last
 * page's cursor ("resolvedAt:id"). The history reads the efcc_election_history index (migrations/0114_inec_cases.sql).
 */
async function inecCases(db: D1Database, before: string | null) {
  const now = Date.now();
  // Cases whose time is up are closed here too, so nobody reads a verdict that is already due.
  const { results: due } = await db.prepare("SELECT * FROM efcc_cases WHERE kind = 'election' AND status = 'investigating' AND resolves_at <= ? LIMIT 5")
    .bind(now).all<CaseRow>();
  for (const row of due) await settle(db, row, now);
  const cols = `c.id, c.target_uid, c.status, c.filed_at, c.resolves_at, c.resolved_at, c.audit_json, c.fine, p.username AS target, e.office
     FROM efcc_cases c LEFT JOIN players p ON p.uid = c.target_uid LEFT JOIN civic_elections e ON e.id = c.election_id`;
  const [at, id] = (before ?? '').split(':');
  const cursor = Number(at) > 0;
  const [open, decided] = await db.batch<InecRow>([
    db.prepare(`SELECT ${cols} WHERE c.kind = 'election' AND c.status = 'investigating' ORDER BY c.filed_at DESC LIMIT 50`),
    db.prepare(
      `SELECT ${cols} WHERE c.kind = 'election' AND c.status != 'investigating'
         AND (?1 = 0 OR c.resolved_at < ?2 OR (c.resolved_at = ?2 AND c.id < ?3))
       ORDER BY c.resolved_at DESC, c.id DESC LIMIT ?4`,
    ).bind(cursor ? 1 : 0, cursor ? Number(at) : 0, id ?? '', INEC_PAGE + 1),
  ]);
  const page = decided.results.slice(0, INEC_PAGE);
  const last = page[page.length - 1];
  // Every listed voter's username in one read (json_each: there can be more of them than D1 takes bound parameters).
  const voters = [...new Set([...open.results, ...page].filter((r) => r.status !== 'bribed')
    .flatMap((r) => accusedOf(JSON.parse(r.audit_json) as StoredVote[]).map((v) => v.voter)))];
  const { results: named } = voters.length
    ? await db.prepare('SELECT uid, username FROM players WHERE uid IN (SELECT value FROM json_each(?))').bind(JSON.stringify(voters))
      .all<{ uid: string; username: string | null }>()
    : { results: [] };
  const names = new Map(named.filter((r) => r.username).map((r) => [r.uid, r.username!]));
  return {
    open: open.results.map((r) => inecCase(r, names)),
    decided: page.map((r) => inecCase(r, names)),
    next: decided.results.length > INEC_PAGE && last ? `${last.resolved_at}:${last.id}` : null,
  };
}

type PublicRow = Pick<CaseRow, 'id' | 'target_uid' | 'status' | 'filed_at' | 'resolves_at' | 'audit_json' | 'fine' | 'seized_property_json'> & {
  resolved_at: number | null; target: string | null;
};

/** A money case for everyone to read (PublicEfccCase): the audit's totals, never who filed it or what the accused said. */
function publicMoneyCase(row: PublicRow): PublicEfccCase {
  const dropped = row.status === 'bribed';
  const audit = dropped ? [] : JSON.parse(row.audit_json) as EfccIncome[];
  const dirty = audit.filter((i) => i.illicit);
  let seized: string | null = null;
  if (row.status === 'convicted' && row.seized_property_json) {
    try {
      seized = DESIGN_BY_ID[(JSON.parse(row.seized_property_json) as Property).design ?? '']?.name ?? 'A house';
    } catch {
      seized = 'A house';
    }
  }
  return {
    id: row.id,
    targetUid: row.target_uid,
    target: row.target ?? 'player',
    status: dropped ? 'dropped' : row.status as Exclude<EfccStatus, 'bribed'>,
    filedAt: row.filed_at,
    resolvesAt: row.resolves_at,
    resolvedAt: row.resolved_at,
    audited: audit.length,
    dirty: dirty.length,
    dirtyAmount: dirty.reduce((n, i) => n + i.amount, 0),
    fine: row.status === 'convicted' ? row.fine : null,
    seized,
  };
}

/**
 * The EFCC's public feed: every open dirty-money case on anyone, and the decided ones newest first, a page at a time,
 * as INEC does for elections (same cursor, same index). Cases whose time is up are settled first.
 */
async function publicMoneyCases(db: D1Database, before: string | null) {
  const now = Date.now();
  const { results: due } = await db.prepare("SELECT * FROM efcc_cases WHERE kind = 'money' AND status = 'investigating' AND resolves_at <= ? LIMIT 5")
    .bind(now).all<CaseRow>();
  for (const row of due) await settle(db, row, now);
  const cols = `c.id, c.target_uid, c.status, c.filed_at, c.resolves_at, c.resolved_at, c.audit_json, c.fine, c.seized_property_json, p.username AS target
     FROM efcc_cases c LEFT JOIN players p ON p.uid = c.target_uid`;
  const [at, id] = (before ?? '').split(':');
  const cursor = Number(at) > 0;
  const [open, decided] = await db.batch<PublicRow>([
    db.prepare(`SELECT ${cols} WHERE c.kind = 'money' AND c.status = 'investigating' ORDER BY c.filed_at DESC LIMIT 50`),
    db.prepare(
      `SELECT ${cols} WHERE c.kind = 'money' AND c.status != 'investigating'
         AND (?1 = 0 OR c.resolved_at < ?2 OR (c.resolved_at = ?2 AND c.id < ?3))
       ORDER BY c.resolved_at DESC, c.id DESC LIMIT ?4`,
    ).bind(cursor ? 1 : 0, cursor ? Number(at) : 0, id ?? '', INEC_PAGE + 1),
  ]);
  const page = decided.results.slice(0, INEC_PAGE);
  const last = page[page.length - 1];
  return {
    open: open.results.map(publicMoneyCase),
    decided: page.map(publicMoneyCase),
    next: decided.results.length > INEC_PAGE && last ? `${last.resolved_at}:${last.id}` : null,
  };
}

export async function handleEfcc(req: Request, env: Env, ctx: ExecutionContext, uid: string, path: string): Promise<Response | null> {
  // The EFCC's own cases, for every player to read, like INEC's.
  if (path === '/api/efcc/public' && req.method === 'GET') return json(await publicMoneyCases(env.DB, new URL(req.url).searchParams.get('before')));
  // INEC lists election cases to every player; the cases themselves are still the EFCC's (filed and settled below).
  if (path === '/api/inec/cases' && req.method === 'GET') return json(await inecCases(env.DB, new URL(req.url).searchParams.get('before')));

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
    const body = await req.json().catch(() => null) as { target?: unknown; requestId?: unknown; kind?: unknown } | null;
    // Dirty money (their latest incomes), or a rigged election (every vote they have in the race they are running in).
    const kind = body?.kind === 'election' ? 'election' : 'money';
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
    let evidence: EfccIncome[] | StoredVote[];
    let electionId: number | null = null;
    if (kind === 'election') {
      // The race they are running in, or one they ran in that ended a short while ago.
      const race = await env.DB.prepare(
        `SELECT c.election_id AS id FROM civic_candidates c JOIN civic_elections e ON e.id = c.election_id
         WHERE c.uid = ? AND (e.status = 'open' OR e.ends_at > ?) ORDER BY e.ends_at DESC LIMIT 1`,
      ).bind(target.uid, Date.now() - ELECTION_FRAUD.reportAfterMs).first<{ id: number }>();
      if (!race) return err(409, `@${username} is not running in an election, and has not run in one in the last ${ELECTION_FRAUD.reportAfterMs / 3_600_000} hours`);
      electionId = race.id;
      // A cleared candidate can be looked at again once more votes may have come in.
      const last = await env.DB.prepare(`SELECT MAX(filed_at) AS at FROM efcc_cases WHERE target_uid = ? AND kind = 'election' AND election_id = ?`)
        .bind(target.uid, race.id).first<{ at: number | null }>();
      const wait = (last?.at ?? 0) + ELECTION_FRAUD.refileMs - Date.now();
      if (wait > 0) return err(429, `@${username}’s votes were audited recently. Try again in ${Math.ceil(wait / 60_000)} minutes`);
      evidence = await electionAudit(env.DB, race.id, target.uid);
      if (!evidence.length) return err(409, `Nobody has voted for @${username} yet. There is nothing to investigate`);
    } else {
      // One case at a time per person, and then a rest: the same player can't be reported over and over.
      // How long that rest is, the EFCC chair sets (10 minutes to 12 hours: civic_policies.case_cooldown_min).
      const since = target.efcc_case_at ?? 0;
      const rest = since + (await loadLaws(env.DB)).caseCooldownMin * 60_000 - Date.now();
      if (rest > 0) {
        const mins = Math.ceil(rest / 60_000);
        const when = mins < 60 ? `${mins} minute${mins === 1 ? '' : 's'}` : `${Math.ceil(mins / 60)} hour${Math.ceil(mins / 60) === 1 ? '' : 's'}`;
        return err(429, `@${username} was investigated recently. A new case can be filed in ${when}`);
      }
      evidence = await audit(env.DB, target.uid, since);
      // Everything older was already judged in their last case.
      if (!evidence.length) return err(409, `@${username} has earned nothing since their last case. There is nothing new to investigate`);
    }
    const now = Date.now();
    const filing = await env.DB.batch([
      ensureWallet(env.DB, uid),
      env.DB.prepare(
        `INSERT OR IGNORE INTO efcc_cases (id, accuser_uid, target_uid, status, filed_at, resolves_at, audit_json, kind, election_id)
         SELECT ?, ?, ?, 'investigating', ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM wallets WHERE uid = ? AND balance >= ?)
           AND NOT EXISTS (SELECT 1 FROM efcc_cases WHERE target_uid = ? AND status = 'investigating')`,
      ).bind(id, uid, target.uid, now, now + EFCC.investigationMs, JSON.stringify(evidence), kind, electionId, uid, EFCC.filingFee, target.uid),
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
      // A money case is on their record from now: the cooldown starts, and the next audit reads only what comes after.
      ...(kind === 'money'
        ? [env.DB.prepare('UPDATE players SET efcc_case_at = ?1 WHERE uid = ?2 AND EXISTS (SELECT 1 FROM efcc_cases WHERE id = ?3 AND filed_at = ?1)').bind(now, target.uid, id)]
        : []),
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
    // An election case is answered in the INEC app; a money case in the EFCC app.
    notify(env, ctx, target.uid, { t: 'fun', kind: 'efccCase', caseId: id, election: kind === 'election' });
    sendPush(env, ctx, target.uid, {
      title: kind === 'election' ? 'INEC: your votes are being audited' : 'New EFCC investigation',
      body: kind === 'election'
        ? 'Someone reported your campaign for fake votes. Open the INEC app to respond, or pay to see who filed it.'
        : 'Someone has opened an investigation on you. Open the EFCC app to respond, or pay to see who filed it.',
      tag: `efcc-case-${id}`,
      category: 'crime', app: kind === 'election' ? 'inec' : 'efcc',
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
