// Unread badges on the phone's apps (src/net/badges.ts draws them). One cheap read the client polls:
//   GET  /api/badges       → { dms, groups, snap, twitter }
//   POST /api/badges/seen  { app: 'snap' | 'twitter' } → that app's count is 0 from now on.
// Messages count what is unread chat by chat (read when the chat opens, as Messages shows them). Snap and Twitter count
// what is new since the app was last opened (app_seen, migrations/0108_app_badges.sql).

import type { FirebaseUser } from './auth';
import { FEED_KEEP_MS } from './feed';
import { SNAP_KEEP_MS } from './snaps';

const SEEN_APPS = ['snap', 'twitter'] as const;
type SeenApp = (typeof SEEN_APPS)[number];
/** No badge shows more than "9+", so there is no point counting far past it. */
const ROW_CAP = 200;
/** How many of the newest posts are searched for @mentions on each poll. */
const MENTION_SCAN = 500;

/** Friends with me (?1): `who` is the column holding the other player's uid. */
const FRIEND_OF_ME = (who: string) => `EXISTS (SELECT 1 FROM friendships fr WHERE fr.status = 'accepted' AND fr.a = MIN(${who}, ?1) AND fr.b = MAX(${who}, ?1))`;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** "@name" as a whole handle: @ada is not a mention of @adaeze. */
export function mentions(text: string, username: string) {
  const name = username.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])@${name}(?![A-Za-z0-9_])`, 'i').test(text);
}

/** Marking an app seen: now, and for Twitter the feed's last row so far. */
const seenStmt = (db: D1Database, me: string, app: SeenApp, now: number) =>
  db
    .prepare(
      `INSERT INTO app_seen (uid, app, at, mark) VALUES (?1, ?2, ?3, CASE WHEN ?2 = 'twitter' THEN (SELECT COALESCE(MAX(id), 0) FROM feed) ELSE 0 END)
       ON CONFLICT (uid, app) DO UPDATE SET at = excluded.at, mark = excluded.mark`,
    )
    .bind(me, app, now);

export async function badgeCounts(db: D1Database, me: string, now = Date.now()) {
  const [{ results: seenRows }, player] = await db.batch([
    db.prepare('SELECT app, at, mark FROM app_seen WHERE uid = ?').bind(me),
    db.prepare('SELECT username FROM players WHERE uid = ?').bind(me),
  ]) as [D1Result<{ app: SeenApp; at: number; mark: number }>, D1Result<{ username: string | null }>];
  const username = player.results[0]?.username ?? null;
  // A player's first poll starts the clock: nothing from before it is "new".
  const missing = SEEN_APPS.filter((a) => !seenRows.some((r) => r.app === a));
  if (missing.length) {
    await db.batch(missing.map((a) => seenStmt(db, me, a, now)));
    return badgeCounts(db, me, now);
  }
  const seen = Object.fromEntries(seenRows.map((r) => [r.app, r])) as unknown as Record<SeenApp, { at: number; mark: number }>;
  const snapSince = now - SNAP_KEEP_MS;
  const feedSince = now - FEED_KEEP_MS;
  const [dms, groups, snap, feedIds, feedMentions, feedActs] = await db.batch([
    // Exactly what /api/inbox sums: every message to me not yet read (its chat not opened since).
    db.prepare('SELECT COUNT(*) AS n FROM messages WHERE to_uid = ? AND read_at IS NULL').bind(me),
    // Exactly what /api/groups sums: others' messages past where I last read each group.
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM group_members gm JOIN group_messages m ON m.group_id = gm.group_id AND m.id > gm.last_read_id
         WHERE gm.uid = ?1 AND m.from_uid != ?1`,
      )
      .bind(me),
    // Snap: snaps sent to me not yet opened, friends' new stories I have not watched (not counted twice when also sent
    // to me), and others' comments and likes on my snaps. All since I last opened Snap.
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM snap_sends d JOIN snaps s ON s.id = d.snap_id
             WHERE d.to_uid = ?1 AND d.opened_at IS NULL AND s.created_at > ?2 AND s.created_at >= ?3) AS direct,
           (SELECT COUNT(*) FROM snaps s
             WHERE s.created_at > ?2 AND s.created_at >= ?3 AND s.uid != ?1 AND s.audience < 2 AND ${FRIEND_OF_ME('s.uid')}
               AND NOT EXISTS (SELECT 1 FROM snap_sends d WHERE d.snap_id = s.id AND d.to_uid = ?1)
               AND NOT EXISTS (SELECT 1 FROM snap_views v WHERE v.snap_id = s.id AND v.uid = ?1)) AS stories,
           (SELECT COUNT(*) FROM snap_comments c JOIN snaps s ON s.id = c.snap_id
             WHERE s.uid = ?1 AND s.created_at >= ?3 AND c.uid != ?1 AND c.created_at > ?2) AS comments,
           (SELECT COUNT(*) FROM snap_likes l JOIN snaps s ON s.id = l.snap_id
             WHERE s.uid = ?1 AND s.created_at >= ?3 AND l.uid != ?1 AND l.created_at > ?2) AS likes`,
      )
      .bind(me, seen.snap.at, snapSince),
    // Twitter posts since I last looked (feed ids past the mark), each found through an index (the unary + keeps the
    // friends' half on feed_by_uid rather than walking every new post): my friends' new posts
    // (the Following tab), replies to my posts, and anything naming @me. Mentions are only looked for in the newest
    // MENTION_SCAN posts, so a poll never reads the whole day's feed. A post that is several of these counts once.
    db
      .prepare(
        `SELECT f.id FROM friendships fr JOIN feed f ON f.uid = CASE WHEN fr.a = ?1 THEN fr.b ELSE fr.a END
         WHERE (fr.a = ?1 OR fr.b = ?1) AND fr.status = 'accepted' AND +f.parent_id IS NULL AND +f.id > ?2 AND f.created_at >= ?3
         UNION
         SELECT r.id FROM feed p JOIN feed r ON r.parent_id = p.id
         WHERE p.uid = ?1 AND p.created_at >= ?3 AND r.id > ?2 AND (r.uid IS NULL OR r.uid != ?1)
         ORDER BY 1 DESC LIMIT ${ROW_CAP}`,
      )
      .bind(me, seen.twitter.mark, feedSince),
    db
      .prepare(
        `SELECT f.id, f.text FROM feed f
         WHERE f.id > MAX(?2, (SELECT COALESCE(MAX(id), 0) FROM feed) - ${MENTION_SCAN}) AND f.created_at >= ?3
           AND (f.uid IS NULL OR f.uid != ?1) AND ?4 IS NOT NULL AND f.text LIKE '%@' || ?4 || '%'
         ORDER BY f.id DESC LIMIT ${ROW_CAP}`,
      )
      .bind(me, seen.twitter.mark, feedSince, username),
    // Others' likes and reposts of my posts since I last looked.
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM feed_likes l JOIN feed p ON p.id = l.post_id
             WHERE p.uid = ?1 AND p.created_at >= ?3 AND l.uid != ?1 AND l.created_at > ?2) AS likes,
           (SELECT COUNT(*) FROM feed_reposts r JOIN feed p ON p.id = r.post_id
             WHERE p.uid = ?1 AND p.created_at >= ?3 AND r.uid != ?1 AND r.created_at > ?2) AS reposts`,
      )
      .bind(me, seen.twitter.at, feedSince),
  ]);
  const n = (r: D1Result, k = 'n') => Number((r.results[0] as Record<string, number> | undefined)?.[k] ?? 0);
  const tweets = new Set((feedIds.results as { id: number }[]).map((r) => r.id));
  for (const r of feedMentions.results as { id: number; text: string }[]) if (username && mentions(r.text, username)) tweets.add(r.id);
  return {
    dms: n(dms),
    groups: n(groups),
    snap: n(snap, 'direct') + n(snap, 'stories') + n(snap, 'comments') + n(snap, 'likes'),
    twitter: tweets.size + n(feedActs, 'likes') + n(feedActs, 'reposts'),
  };
}

export async function handleBadges(req: Request, env: Env, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/badges')) return null;
  const db = env.DB;
  const me = user.uid;
  if (path === '/api/badges' && req.method === 'GET') return json(await badgeCounts(db, me));
  if (path === '/api/badges/seen' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { app?: unknown } | null;
    const app = SEEN_APPS.find((a) => a === b?.app);
    if (!app) return json({ error: 'Unknown app' }, 400);
    await seenStmt(db, me, app, Date.now()).run();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
