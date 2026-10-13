// Kaduna Gist: the city's feed. The server posts the viral moments (crimes, arrests, elections, big wins,
// scandals); players post their own gist and like each other's. Read by GET /api/feed (worker/fun.ts).

import { type CivicCity } from '../src/game/civic';
import { DAY_MS, dayKey } from '../src/game/community';

/** Twitter is today's gist: a post is gone a real day after it went up, with its replies and likes. */
export const FEED_KEEP_MS = DAY_MS;
/** Tweet tallies feed the weekly quests, so they outlive the posts by a week (and a day of slack). */
const TALLY_KEEP_DAYS = 8;

/**
 * A post statement, to run alone or inside a batch. uid = who it's about (null: nobody in particular).
 * city = the state the news is about (none: national), which the News tab filters by.
 */
export function feedStmt(db: D1Database, uid: string | null, kind: string, icon: string, text: string, city?: CivicCity | null) {
  return db
    .prepare('INSERT INTO feed (uid, kind, icon, text, created_at, city) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uid, kind, icon, text.slice(0, 280), Date.now(), city ?? null);
}

/** Fire-and-forget post; a failed feed write must never break the action that caused it. */
export async function postFeed(db: D1Database, uid: string | null, kind: string, icon: string, text: string, city?: CivicCity | null) {
  await feedStmt(db, uid, kind, icon, text, city).run().catch(() => {});
}

export const handle = (u: string | null | undefined) => (u ? `@${u}` : 'someone');

export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** Count a tweet (or, with by = -1, uncount a deleted one) towards the day it was posted. */
export function tweetCountStmt(db: D1Database, uid: string, at: number, by: 1 | -1 = 1) {
  return by === 1
    ? db.prepare('INSERT INTO tweet_counts (uid, day, n) VALUES (?, ?, 1) ON CONFLICT (uid, day) DO UPDATE SET n = n + 1').bind(uid, dayKey(at))
    : db.prepare('UPDATE tweet_counts SET n = MAX(0, n - 1) WHERE uid = ? AND day = ?').bind(uid, dayKey(at));
}

/** Hourly sweep: drop posts past their day (the feed_cascade trigger takes their replies and likes), then old tallies. */
export async function pruneFeed(db: D1Database, now: number) {
  await db.batch([
    db.prepare('DELETE FROM feed WHERE parent_id IS NULL AND created_at < ?').bind(now - FEED_KEEP_MS),
    db.prepare('DELETE FROM tweet_counts WHERE day < ?').bind(dayKey(now) - TALLY_KEEP_DAYS),
  ]);
}
