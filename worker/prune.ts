// The daily clean-up. Most tables only matter while something is still open: a contract being hunted, a bet
// awaiting its final, a transfer that might be retried. Once that is settled the row is dead weight, so the cron
// drops it after a grace period. Chats are capped by count instead of age: a quiet old friendship keeps its
// history, a busy one keeps its latest messages. Children (guests, pledges, crew members) follow their parent
// out through the triggers in migrations/0055_cascade_triggers.sql.
//
// Deliberately left alone: ledger (retry protection, lifetime job counts, EFCC audits), crimes and sold
// black-market rows (together they say which loot is still in hand), scams and paid marketplace orders
// (lifetime counts on profiles and shops), paid orders and ads (real-money records), and anything a player owns.

import { DAY_MS, seasonKey, weekKey } from '../src/game/community';
import { EFCC_RECORD_MS } from '../src/game/efcc';

/** Newest messages kept per conversation (DMs) and per group chat. */
export const DM_KEEP = 200;
export const GROUP_KEEP = 200;
/** Settled game state (contracts, parties, bets, listings) lingers this long for "what happened" screens. */
const DONE_KEEP_MS = 14 * DAY_MS;
/** Request receipts only exist so a retried call isn't applied twice; a week is far past any retry. */
const RECEIPT_KEEP_MS = 7 * DAY_MS;
/** Checkouts that were never paid. Generous, so a slow payment webhook still finds its order. */
const UNPAID_KEEP_MS = 7 * DAY_MS;
/** Closed EFCC cases, old elections, quest claims, shard assignments. */
const RECORD_KEEP_MS = 30 * DAY_MS;
const POTHOLE_FIXES_KEEP = 50;
/** The Police app shows three days of reports and arrests, then they are gone (a warrant still out, or loot a thief still holds, is kept). */
export const POLICE_KEEP_MS = 3 * DAY_MS;

export async function pruneOldData(db: D1Database, now: number) {
  const done = now - DONE_KEEP_MS;
  const receipt = now - RECEIPT_KEEP_MS;
  const unpaid = now - UNPAID_KEEP_MS;
  const record = now - RECORD_KEEP_MS;
  const oldElection = `(SELECT id FROM civic_elections WHERE status = 'closed' AND ends_at < ?)`;
  await db.batch([
    /* ----- Save corrections (why "progress couldn't be verified"): two weeks is enough to trace a cause. ----- */
    db.prepare('DELETE FROM save_corrections WHERE at < ?').bind(now - 14 * 24 * 3600_000),
    /* ----- Chats: keep the newest few per conversation. Money still waiting to be claimed is never dropped. ----- */
    db.prepare(
      `DELETE FROM messages WHERE id IN (
         SELECT id FROM (
           SELECT id, kind, status, ROW_NUMBER() OVER (PARTITION BY MIN(from_uid, to_uid), MAX(from_uid, to_uid) ORDER BY id DESC) AS rn
           FROM messages
         ) WHERE rn > ? AND NOT (kind = 'pay' AND status = 'pending')
       )`,
    ).bind(DM_KEEP),
    db.prepare(
      `DELETE FROM group_messages WHERE id IN (
         SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY id DESC) AS rn FROM group_messages) WHERE rn > ?
       )`,
    ).bind(GROUP_KEEP),

    /* ----- Settled underworld and vice ----- */
    db.prepare(`DELETE FROM contracts WHERE status IN ('done', 'failed', 'expired', 'cancelled', 'rescued') AND created_at < ?`).bind(done),
    db.prepare(`DELETE FROM breakouts WHERE status != 'open' AND created_at < ?`).bind(done),
    db.prepare(`DELETE FROM rackets WHERE status IN ('refused', 'broken', 'ended', 'protected') AND created_at < ?`).bind(done),
    db.prepare(`DELETE FROM vice_listings WHERE status != 'listed' AND listed_at < ?`).bind(done),
    db.prepare(`DELETE FROM vice_offers WHERE status != 'open' AND created_at < ?`).bind(done),
    db.prepare(`DELETE FROM black_market WHERE status = 'cancelled' AND listed_at < ?`).bind(done),
    db.prepare('DELETE FROM seizures WHERE applied = 1 AND created_at < ?').bind(done),

    /* ----- Bank jobs. A heist row is also the week-long cooldown, which is well inside the grace period. ----- */
    db.prepare(`DELETE FROM heist_crews WHERE status != 'planning' AND created_at < ?`).bind(done),
    db.prepare('DELETE FROM bank_heists WHERE created_at < ? AND (success = 0 OR paid = 1)').bind(done),
    db.prepare(`DELETE FROM loans WHERE status = 'repaid' AND taken_at < ?`).bind(done),

    /* ----- Parties and bets that have paid out ----- */
    db.prepare('DELETE FROM hangouts WHERE settled = 1 AND ends_at < ?').bind(done),
    db.prepare('DELETE FROM owambes WHERE wrapped = 1 AND ends_at < ?').bind(done),
    db.prepare('DELETE FROM bets WHERE payout IS NOT NULL AND created_at < ?').bind(done),
    db.prepare('DELETE FROM live_results WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.slot = live_results.slot AND b.payout IS NULL)').bind(done),

    /* ----- Retry receipts ----- */
    db.prepare('DELETE FROM bank_transactions WHERE created_at < ?').bind(receipt),
    db.prepare('DELETE FROM debt_payments WHERE created_at < ?').bind(receipt),
    db.prepare('DELETE FROM business_restock_requests WHERE created_at < ?').bind(receipt),
    db.prepare(`DELETE FROM marketplace_orders WHERE status != 'paid' AND created_at < ?`).bind(receipt),
    db.prepare('DELETE FROM place_visits WHERE day < ?').bind(Math.floor(now / 86_400_000) - 7),

    /* ----- Checkouts nobody paid for ----- */
    db.prepare(`DELETE FROM orders WHERE status = 'pending' AND created_at < ?`).bind(unpaid),
    db.prepare(`DELETE FROM ads WHERE status IN ('awaiting_payment', 'removed') AND paid_at IS NULL AND created_at < ?`).bind(unpaid),

    /* ----- Police history. Wanted rows are live warrants; a burglar's unrecovered loot is how the black market knows what is in hand. ----- */
    db.prepare(
      `DELETE FROM crimes WHERE created_at < ? AND status != 'wanted'
         AND NOT (kind = 'burglary' AND success = 1 AND item IS NOT NULL AND held = 1 AND COALESCE(recovered, 0) = 0)`,
    ).bind(now - POLICE_KEEP_MS),

    /* ----- Records. A conviction stays while its seized property can still be bought back. ----- */
    db.prepare(
      `DELETE FROM efcc_cases WHERE resolves_at < ? AND (status IN ('cleared', 'bribed')
         OR (status = 'convicted' AND (seized_property_json IS NULL OR bought_back_at IS NOT NULL)))`,
    ).bind(now - EFCC_RECORD_MS),
    db.prepare(`DELETE FROM civic_votes WHERE election_id IN ${oldElection}`).bind(record),
    db.prepare(`DELETE FROM civic_candidates WHERE election_id IN ${oldElection}`).bind(record),
    // A disqualification only matters while its race is open.
    db.prepare('DELETE FROM civic_disqualified WHERE at < ?').bind(record),
    db.prepare(`DELETE FROM civic_posters WHERE election_id IN ${oldElection}`).bind(record),
    db.prepare(`DELETE FROM civic_elections WHERE status = 'closed' AND ends_at < ?`).bind(record),
    db.prepare('DELETE FROM quest_claims WHERE claimed_at < ?').bind(record),
    // The season before this one may still be settling; anything older has had its prizes written.
    db.prepare('DELETE FROM season_points WHERE season < ?').bind(seasonKey(now) - 2),
    // The Hustlers app only shows this week and last week's winners.
    db.prepare('DELETE FROM hustle_weeks WHERE week < ?').bind(weekKey(now) - 1),
    db.prepare('DELETE FROM room_assign WHERE at < ?').bind(record),
    db.prepare('DELETE FROM pothole_fixes WHERE id NOT IN (SELECT id FROM pothole_fixes ORDER BY id DESC LIMIT ?)').bind(POTHOLE_FIXES_KEEP),
  ]);
}
