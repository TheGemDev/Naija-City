// Friends, daily/weekly quests and the two-week season board.
//
// Quest progress is counted from tables the server already owns (ledger, feed, messages, bets,
// friendships), never reported by the client. Rewards are paid through the wallet ledger with a
// per-period client id, and quest_claims' primary key stops a second claim.

import type { FirebaseUser } from './auth';
import { handle, naira, postFeed } from './feed';
import { usernames } from './crime';
import { shared } from './cache';
import { applyStmts, ensureWallet, getBalance } from './wallet';
import {
  FRIENDS, DAY_MS, QUEST_BY_ID, SEASON_PRIZES, WEEK_MS, dailyQuests, dayKey, seasonEnds, seasonKey, weekKey, weeklyQuests,
  type QuestDef, type QuestMetric,
} from '../src/game/community';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

async function body<T>(req: Request): Promise<T | null> {
  return (await req.json().catch(() => null)) as T | null;
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

const friendCount = async (db: D1Database, uid: string) =>
  (await db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND (a = ?1 OR b = ?1)").bind(uid).first<{ n: number }>())?.n ?? 0;

/**
 * Friendship is made by conversation: when `from` texts `to` and `to` has texted `from` before, the two
 * become friends. Returns true only when this message made them friends (both lists must have room).
 */
export async function befriendOnReply(db: D1Database, from: string, to: string): Promise<boolean> {
  const [a, c] = pair(from, to);
  const [existing, theyWrote] = await Promise.all([
    db.prepare("SELECT 1 AS ok FROM friendships WHERE a = ? AND b = ? AND status = 'accepted'").bind(a, c).first(),
    db.prepare("SELECT 1 AS ok FROM messages WHERE from_uid = ? AND to_uid = ? AND kind = 'text' LIMIT 1").bind(to, from).first(),
  ]);
  if (existing || !theyWrote) return false;
  const [mine, theirs] = await Promise.all([friendCount(db, from), friendCount(db, to)]);
  if (mine >= FRIENDS.maxFriends || theirs >= FRIENDS.maxFriends) return false;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO friendships (a, b, asker, status, created_at, accepted_at) VALUES (?1, ?2, ?3, 'accepted', ?4, ?4)
       ON CONFLICT (a, b) DO UPDATE SET status = 'accepted', accepted_at = ?4`,
    )
    .bind(a, c, to, now)
    .run();
  return true;
}

/* ---------- Quest progress ---------- */

async function progressOf(db: D1Database, uid: string, metric: QuestMetric, since: number): Promise<number> {
  const num = async (sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).first<{ n: number | null }>())?.n ?? 0;
  switch (metric) {
    case 'earn':
      return num("SELECT SUM(amount) AS n FROM ledger WHERE uid = ? AND kind IN ('work', 'gig') AND amount > 0 AND created_at >= ?", uid, since);
    case 'spend':
      return -(await num("SELECT SUM(amount) AS n FROM ledger WHERE uid = ? AND kind IN ('buy', 'spend', 'property') AND amount < 0 AND created_at >= ?", uid, since));
    case 'invest':
      return num("SELECT COUNT(*) AS n FROM ledger WHERE uid = ? AND kind = 'invest' AND amount < 0 AND created_at >= ?", uid, since);
    case 'post':
      // Counted from the tally, not the feed: posts are pruned after a day, the weekly quest needs seven.
      return num('SELECT SUM(n) AS n FROM tweet_counts WHERE uid = ? AND day >= ?', uid, dayKey(since));
    case 'message':
      return num("SELECT COUNT(*) AS n FROM messages WHERE from_uid = ? AND kind = 'text' AND created_at >= ?", uid, since);
    case 'pay':
      return num("SELECT COUNT(*) AS n FROM messages WHERE from_uid = ? AND kind = 'pay' AND created_at >= ?", uid, since);
    case 'bet':
      return num('SELECT COUNT(*) AS n FROM bets WHERE uid = ? AND created_at >= ?', uid, since);
    case 'friend':
      return num("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND accepted_at >= ? AND (a = ?2 OR b = ?2)", since, uid);
    case 'shift':
      return num("SELECT COUNT(*) AS n FROM ledger WHERE uid = ? AND kind = 'work' AND amount > 0 AND created_at >= ?", uid, since);
    case 'rides':
      return num("SELECT COUNT(*) AS n FROM ledger WHERE uid = ? AND kind = 'gig' AND ref IN ('keke_fare', 'okada_fare') AND amount > 0 AND created_at >= ?", uid, since);
    case 'dispatch':
    case 'freelance':
    case 'farm':
    case 'odd_job':
      // The gig refs these pay under (game/gigs.ts, worker/hustles.ts).
      return num("SELECT COUNT(*) AS n FROM ledger WHERE uid = ? AND kind = 'gig' AND ref = ? AND amount > 0 AND created_at >= ?", uid, metric === 'dispatch' ? 'dispatch_fare' : metric, since);
  }
}

interface QuestView extends Pick<QuestDef, 'id' | 'label' | 'icon' | 'target' | 'reward' | 'points'> {
  progress: number;
  claimed: boolean;
}

async function questViews(db: D1Database, uid: string, defs: QuestDef[], period: number, since: number): Promise<QuestView[]> {
  const { results: claims } = await db
    .prepare('SELECT quest_id FROM quest_claims WHERE uid = ? AND period = ?')
    .bind(uid, period)
    .all<{ quest_id: string }>();
  const claimed = new Set(claims.map((c) => c.quest_id));
  return Promise.all(
    defs.map(async (q) => ({
      id: q.id, label: q.label, icon: q.icon, target: q.target, reward: q.reward, points: q.points,
      progress: Math.min(q.target, await progressOf(db, uid, q.metric, since)),
      claimed: claimed.has(q.id),
    })),
  );
}

/* ---------- Seasons ---------- */

/** Pays out the season that just ended, once, the first time anyone looks. */
export async function settleSeasons(db: D1Database, now: number) {
  const prev = seasonKey(now) - 1;
  const first = await db.prepare('INSERT OR IGNORE INTO seasons_settled (season, settled_at) VALUES (?, ?)').bind(prev, now).run();
  if (!first.meta.changes) return;
  const { results: top } = await db
    .prepare('SELECT uid, points FROM season_points WHERE season = ? AND points > 0 ORDER BY points DESC, uid LIMIT ?')
    .bind(prev, SEASON_PRIZES.length)
    .all<{ uid: string; points: number }>();
  if (!top.length) return;
  const names = await usernames(db, top.map((t) => t.uid));
  await db.batch(
    top.map((t, i) => {
      const p = SEASON_PRIZES[i];
      return db
        .prepare('INSERT OR IGNORE INTO season_prizes (season, uid, rank, prize, title) VALUES (?, ?, ?, ?, ?)')
        .bind(prev, t.uid, p.rank, p.prize, p.title);
    }),
  );
  const champ = top[0];
  await postFeed(db, champ.uid, 'season', '🏆', `${handle(names.get(champ.uid))} is the Naija City Season Champion with ${champ.points} points! ${naira(SEASON_PRIZES[0].prize)} prize waiting.`);
}

async function seasonBoard(db: D1Database, uid: string, now: number) {
  const season = seasonKey(now);
  const [top, mine] = await Promise.all([
    // The top 20 is the same for everyone, so players share one read of it.
    shared(`season-top/${season}`, 30, async () => {
      const { results } = await db.prepare('SELECT uid, points FROM season_points WHERE season = ? AND points > 0 ORDER BY points DESC, uid LIMIT 20').bind(season).all<{ uid: string; points: number }>();
      const names = await usernames(db, results.map((t) => t.uid));
      return results.map((t) => ({ ...t, username: names.get(t.uid) ?? 'someone' }));
    }),
    db.prepare('SELECT points FROM season_points WHERE season = ? AND uid = ?').bind(season, uid).first<{ points: number }>(),
  ]);
  const points = mine?.points ?? 0;
  const ahead = points
    ? (await db.prepare('SELECT COUNT(*) AS n FROM season_points WHERE season = ? AND points > ?').bind(season, points).first<{ n: number }>())?.n ?? 0
    : null;
  return {
    id: season,
    endsAt: seasonEnds(now),
    points,
    rank: ahead === null ? null : ahead + 1,
    prizes: SEASON_PRIZES.slice(0, 3).map((p) => ({ rank: p.rank, prize: p.prize })),
    top: top.map((t, i) => ({ rank: i + 1, uid: t.uid, username: t.username, points: t.points, me: t.uid === uid })),
  };
}

/* ---------- Router ---------- */

export async function handleCommunity(req: Request, env: Env, _ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/friends') && !path.startsWith('/api/quests')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();
  const post = req.method === 'POST';

  // --- Friends ---

  if (path === '/api/friends' && req.method === 'GET') {
    const { results } = await db
      .prepare("SELECT * FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted' ORDER BY accepted_at DESC")
      .bind(me)
      .all<{ a: string; b: string; accepted_at: number | null; created_at: number }>();
    const other = (r: { a: string; b: string }) => (r.a === me ? r.b : r.a);
    const names = await usernames(db, results.map(other));
    // When each friend was last in the game, for the "Last online" line under their name.
    const ids = results.map(other);
    const seen = new Map<string, number>();
    if (ids.length) {
      const rows = await db.prepare(`SELECT uid, last_seen FROM players WHERE uid IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ uid: string; last_seen: number | null }>();
      for (const r of rows.results) seen.set(r.uid, r.last_seen ?? 0);
    }
    return json({
      friends: results.map((r) => ({ uid: other(r), username: names.get(other(r)) ?? 'someone', at: r.accepted_at ?? r.created_at, lastSeen: seen.get(other(r)) || null })),
    });
  }

  /** Unfriend: deletes the pair. Texting back and forth again makes them friends again. */
  if (path === '/api/friends/remove' && post) {
    const b = await body<{ uid?: string }>(req);
    if (!b?.uid) return err(400, 'Who?');
    const [a, c] = pair(me, b.uid);
    await db.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').bind(a, c).run();
    return json({ ok: true });
  }

  // --- Quests and season ---

  if (path === '/api/quests' && req.method === 'GET') {
    await settleSeasons(db, now);
    const dayStart = dayKey(now) * DAY_MS;
    const weekStart = weekKey(now) * WEEK_MS;
    const [daily, weekly, season, prize] = await Promise.all([
      questViews(db, me, dailyQuests(now), dayKey(now), dayStart),
      questViews(db, me, weeklyQuests(now), weekKey(now), weekStart),
      seasonBoard(db, me, now),
      db.prepare('SELECT season, rank, prize, title FROM season_prizes WHERE uid = ? AND claimed_at IS NULL ORDER BY season LIMIT 1').bind(me).first(),
    ]);
    return json({ daily, weekly, dayEndsAt: dayStart + DAY_MS, weekEndsAt: weekStart + WEEK_MS, season, prize });
  }

  if (path === '/api/quests/claim' && post) {
    const b = await body<{ id?: string }>(req);
    const q = b?.id ? QUEST_BY_ID.get(b.id) : undefined;
    if (!q) return err(404, 'No such quest');
    const daily = q.id.startsWith('d-');
    const active = (daily ? dailyQuests(now) : weeklyQuests(now)).some((x) => x.id === q.id);
    if (!active) return err(409, 'That quest is not on today’s board');
    const period = daily ? dayKey(now) : weekKey(now);
    const since = period * (daily ? DAY_MS : WEEK_MS);
    if ((await progressOf(db, me, q.metric, since)) < q.target) return err(409, 'Not finished yet');
    const first = await db
      .prepare('INSERT OR IGNORE INTO quest_claims (uid, quest_id, period, claimed_at) VALUES (?, ?, ?, ?)')
      .bind(me, q.id, period, now)
      .run();
    if (!first.meta.changes) return err(409, 'Already claimed');
    await db.batch([
      ensureWallet(db, me),
      ...applyStmts(db, me, `quest:${q.id}:${period}`, 'quest', q.id, q.reward),
      db
        .prepare('INSERT INTO season_points (season, uid, points) VALUES (?1, ?2, ?3) ON CONFLICT(season, uid) DO UPDATE SET points = points + ?3')
        .bind(seasonKey(now), me, q.points),
    ]);
    return json({ ok: true, reward: q.reward, points: q.points, balance: await getBalance(db, me) });
  }

  if (path === '/api/quests/prize' && post) {
    const row = await db
      .prepare('SELECT season, rank, prize, title FROM season_prizes WHERE uid = ? AND claimed_at IS NULL ORDER BY season LIMIT 1')
      .bind(me)
      .first<{ season: number; rank: number; prize: number; title: string }>();
    if (!row) return err(404, 'No prize waiting');
    const claimed = await db.prepare('UPDATE season_prizes SET claimed_at = ? WHERE season = ? AND uid = ? AND claimed_at IS NULL').bind(now, row.season, me).run();
    if (!claimed.meta.changes) return err(409, 'Already collected');
    await db.batch([ensureWallet(db, me), ...applyStmts(db, me, `season-prize:${row.season}`, 'season_prize', String(row.season), row.prize)]);
    return json({ ok: true, prize: row.prize, title: row.title, balance: await getBalance(db, me) });
  }

  return err(404, 'Not found');
}
