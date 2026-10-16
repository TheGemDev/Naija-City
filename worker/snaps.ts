// Snap: a picture from the in-game camera with a short message, shown to friends and to the whole city, and gone a
// real day later. The picture lives in R2 and the row in D1; the hourly sweep (worker/cron.ts) deletes both.

import type { FirebaseUser } from './auth';
import { sniff } from './media';
import { notifyPlayer } from './shards';
import { DAY_MS } from '../src/game/community';

/** How long a snap lasts. After this it is hidden at once and deleted for good within the hour. */
export const SNAP_KEEP_MS = DAY_MS;
const MAX_BYTES = 1024 * 1024;
const MAX_CAPTION = 120;
const SNAP_PAGE = 30;
const COOLDOWN_MS = 30_000;
const MAX_COMMENT = 200;
const COMMENT_COOLDOWN_MS = 5_000;
/** Most comments shown under one snap. */
const COMMENT_WINDOW = 200;
/** Most snaps one player can have up at a time. */
const MAX_LIVE = 30;
/** Most friends one snap can be sent straight to. */
const MAX_TO = 20;
/** Who a snap is for (migrations/0106): everyone (friends' stories and Spotlight), friends' stories only, or only the
 *  friends it was sent to. A snap posted with no audience given goes to everyone, as every snap did before. */
const EVERYONE = 0;
const DIRECT = 2;
/** Streak days run on Lagos time (UTC+1), so a streak day ends at midnight in Nigeria. */
const streakDay = (t: number) => Math.floor((t + 3_600_000) / DAY_MS);
const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

/** Snap pictures are kept apart from other uploads (s/ not u/), so sweeping them can never touch a profile or ad picture. */
export const SNAP_KEY = /^s\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

/** Whether player ?1 may see snap `s`: anyone for a snap to everyone, friends for a friends-only one, and only the
 *  friends it was sent to for a direct one. Its owner always can. */
const VISIBLE = `(s.audience = 0 OR s.uid = ?1
  OR (s.audience = 1 AND EXISTS (SELECT 1 FROM friendships fr WHERE fr.status = 'accepted' AND fr.a = MIN(s.uid, ?1) AND fr.b = MAX(s.uid, ?1)))
  OR EXISTS (SELECT 1 FROM snap_sends d WHERE d.snap_id = s.id AND d.to_uid = ?1))`;
/** The counts and my own marks on a snap, for every list that shows one (?1 is me). */
const COUNTS = `(SELECT COUNT(*) FROM snap_likes l WHERE l.snap_id = s.id) AS likes,
  EXISTS (SELECT 1 FROM snap_likes l WHERE l.snap_id = s.id AND l.uid = ?1) AS liked,
  (SELECT COUNT(*) FROM snap_comments c WHERE c.snap_id = s.id) AS comments,
  (SELECT COUNT(*) FROM snap_views v WHERE v.snap_id = s.id) AS views,
  (s.uid = ?1 OR EXISTS (SELECT 1 FROM snap_views v WHERE v.snap_id = s.id AND v.uid = ?1)) AS seen`;
type SnapRow = { id: number; uid: string; media_key: string; caption: string; at: number; username: string | null; likes: number; liked: number; comments: number; views: number; seen: number; audience: number };
const view = ({ media_key, liked, seen, ...s }: SnapRow) => ({ ...s, liked: !!liked, seen: !!seen, url: `/api/media/${media_key}`, until: s.at + SNAP_KEEP_MS });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

/** GET /api/media/s/<uid>/<file>: public like other pictures, but never served past its day and never kept at the edge. */
export async function readSnap(env: Env, key: string): Promise<Response> {
  const object = await env.MEDIA.get(key);
  if (!object || object.uploaded.getTime() < Date.now() - SNAP_KEEP_MS) return err(404, 'That snap is gone');
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Hourly sweep: delete expired pictures from R2, then their rows. A row only goes once its picture has. */
export async function pruneSnaps(env: Env, now: number) {
  const { results } = await env.DB
    .prepare('SELECT id, media_key FROM snaps WHERE created_at < ? ORDER BY id LIMIT 500')
    .bind(now - SNAP_KEEP_MS)
    .all<{ id: number; media_key: string }>();
  if (!results.length) return;
  await env.MEDIA.delete(results.map((r) => r.media_key));
  await env.DB.prepare('DELETE FROM snaps WHERE id <= ? AND created_at < ?').bind(results[results.length - 1].id, now - SNAP_KEEP_MS).run();
  // Streaks nobody has kept up for days are gone for good; there is nothing left to show for them.
  const old = streakDay(now) - 3;
  await env.DB.prepare('DELETE FROM snap_streaks WHERE day < ?1 AND a_day < ?1 AND b_day < ?1').bind(old).run();
}

/** A snap from `me` to friend `to` today: marks my side, and when both sides have sent one today the streak grows a day
 *  (or starts again at one, if a day was missed). */
function streakStmts(db: D1Database, me: string, to: string, now: number) {
  const [a, b] = pair(me, to);
  const d = streakDay(now);
  const mineA = me === a;
  return [
    db.prepare(
      `INSERT INTO snap_streaks (a, b, a_day, b_day) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(a, b) DO UPDATE SET a_day = MAX(a_day, excluded.a_day), b_day = MAX(b_day, excluded.b_day)`,
    ).bind(a, b, mineA ? d : -1, mineA ? -1 : d),
    db.prepare(
      `UPDATE snap_streaks SET count = CASE WHEN day = ?3 - 1 THEN count + 1 ELSE 1 END, day = ?3
       WHERE a = ?1 AND b = ?2 AND a_day = ?3 AND b_day = ?3 AND day < ?3`,
    ).bind(a, b, d),
  ];
}

export async function handleSnaps(req: Request, env: Env, user: FirebaseUser, path: string, url: URL): Promise<Response | null> {
  if (!path.startsWith('/api/snaps')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  if (path === '/api/snaps' && req.method === 'GET') {
    const friends = url.searchParams.get('scope') === 'friends';
    // Spotlight's "Top" is the day's most liked, then most seen: one page, no paging back.
    const top = !friends && url.searchParams.get('sort') === 'top';
    const before = top ? Number.MAX_SAFE_INTEGER : Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const { results } = await db
      .prepare(
        `SELECT s.id, s.uid, s.media_key, s.caption, s.created_at AS at, s.audience, p.username, ${COUNTS}
         FROM snaps s LEFT JOIN players p ON p.uid = s.uid
         WHERE s.id < ?2 AND s.created_at >= ?3
           ${friends ? `AND s.audience < ${DIRECT} AND (s.uid = ?1 OR EXISTS (SELECT 1 FROM friendships fr WHERE fr.status = 'accepted'
                AND fr.a = MIN(s.uid, ?1) AND fr.b = MAX(s.uid, ?1)))` : `AND s.audience = ${EVERYONE} AND ?1 IS NOT NULL`}
         ORDER BY ${top ? 'likes DESC, views DESC, s.id DESC' : 's.id DESC'} LIMIT ?4`,
      )
      .bind(me, before, now - SNAP_KEEP_MS, SNAP_PAGE)
      .all<SnapRow>();
    return json({ snaps: results.map(view), page: top ? Number.MAX_SAFE_INTEGER : SNAP_PAGE });
  }

  /** The Chat tab: snaps friends sent me (a picture only until it is opened), the last one I sent each friend, and streaks. */
  if (path === '/api/snaps/chats' && req.method === 'GET') {
    const since = now - SNAP_KEEP_MS;
    const today = streakDay(now);
    const [received, sent, streaks] = await Promise.all([
      db
        .prepare(
          `SELECT s.id, s.uid, p.username, s.caption, s.created_at AS at, d.opened_at AS opened, s.media_key
           FROM snap_sends d JOIN snaps s ON s.id = d.snap_id LEFT JOIN players p ON p.uid = s.uid
           WHERE d.to_uid = ?1 AND s.created_at >= ?2 ORDER BY d.snap_id DESC LIMIT 100`,
        )
        .bind(me, since)
        .all<{ id: number; uid: string; username: string | null; caption: string; at: number; opened: number | null; media_key: string }>(),
      db
        .prepare(
          `SELECT d.to_uid AS uid, s.created_at AS at, d.opened_at AS opened
           FROM snaps s JOIN snap_sends d ON d.snap_id = s.id
           WHERE s.uid = ?1 AND s.created_at >= ?2 ORDER BY s.id DESC LIMIT 200`,
        )
        .bind(me, since)
        .all<{ uid: string; at: number; opened: number | null }>(),
      db
        .prepare('SELECT a, b, count, day FROM snap_streaks WHERE (a = ?1 OR b = ?1) AND day >= ?2 AND count > 0')
        .bind(me, today - 1)
        .all<{ a: string; b: string; count: number; day: number }>(),
    ]);
    return json({
      // View once: an opened snap's picture is not handed out again.
      received: received.results.map(({ media_key, ...r }) => ({ ...r, url: r.opened ? null : `/api/media/${media_key}` })),
      sent: sent.results,
      // `ending`: the streak is from yesterday and dies at midnight unless both sides send one today.
      streaks: streaks.results.map((r) => ({ uid: r.a === me ? r.b : r.a, count: r.count, ending: r.day < today })),
    });
  }

  /** POST /api/snaps?caption=… (body = the picture, content-type = its type). */
  if (path === '/api/snaps' && req.method === 'POST') {
    const p = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();
    if (!p?.username) return err(403, 'Pick a username first');
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) return err(415, 'Snaps are JPEG, WebP or PNG pictures');
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return err(413, 'That picture is too big');
    const mine = await db
      .prepare('SELECT COUNT(*) AS n, MAX(created_at) AS at FROM snaps WHERE uid = ? AND created_at >= ?')
      .bind(me, now - SNAP_KEEP_MS)
      .first<{ n: number; at: number | null }>();
    if (mine?.at && now - mine.at < COOLDOWN_MS) return err(429, 'Easy! Give it a few seconds between snaps');
    if ((mine?.n ?? 0) >= MAX_LIVE) return err(429, `You already have ${MAX_LIVE} snaps up. Delete one or wait for the oldest to expire`);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return err(413, 'That picture is too big');
    if (!sniff(type, bytes)) return err(415, 'That file is not a real ' + ext.toUpperCase());
    const caption = (url.searchParams.get('caption') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION);
    // Who it goes to: ?audience=0|1|2 and ?to=<uid>,<uid> (friends only; anyone else on the list is dropped).
    const audience = Math.max(0, Math.min(DIRECT, Math.floor(Number(url.searchParams.get('audience')) || 0)));
    const asked = [...new Set((url.searchParams.get('to') ?? '').split(',').map((u) => u.trim()).filter((u) => /^[\w-]{1,128}$/.test(u) && u !== me))].slice(0, MAX_TO);
    let to: string[] = [];
    if (asked.length) {
      const { results } = await db
        .prepare(
          `SELECT CASE WHEN a = ?1 THEN b ELSE a END AS uid FROM friendships
           WHERE status = 'accepted' AND ((a = ?1 AND b IN (SELECT value FROM json_each(?2))) OR (b = ?1 AND a IN (SELECT value FROM json_each(?2))))`,
        )
        .bind(me, JSON.stringify(asked))
        .all<{ uid: string }>();
      to = results.map((r) => r.uid);
    }
    if (audience === DIRECT && !to.length) return err(400, 'Pick at least one friend to send it to');
    const key = `s/${me}/${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
    const row = await db
      .prepare('INSERT INTO snaps (uid, media_key, caption, created_at, audience) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(me, key, caption, now, audience)
      .first<{ id: number }>()
      .catch(() => null);
    if (!row) {
      await env.MEDIA.delete(key);
      return err(500, 'Could not post that snap');
    }
    if (to.length) {
      await db.batch([
        ...to.map((uid) => db.prepare('INSERT OR IGNORE INTO snap_sends (snap_id, to_uid) VALUES (?, ?)').bind(row.id, uid)),
        ...to.flatMap((uid) => streakStmts(db, me, uid, now)),
      ]);
      await Promise.all(to.map((uid) => notifyPlayer(env, uid, { t: 'snap', from: me, username: p.username })));
    }
    return json({ ok: true, id: row.id, until: now + SNAP_KEEP_MS, sent: to.length });
  }

  const one = path.match(/^\/api\/snaps\/(\d+)$/);
  /** One snap, for whoever opened a share link to it (src/net/deeplink.ts). */
  if (one && req.method === 'GET') {
    const s = await db
      .prepare(
        `SELECT s.id, s.uid, s.media_key, s.caption, s.created_at AS at, s.audience, p.username, ${COUNTS}
         FROM snaps s LEFT JOIN players p ON p.uid = s.uid WHERE s.id = ?2 AND s.created_at >= ?3 AND ${VISIBLE}`,
      )
      .bind(me, Number(one[1]), now - SNAP_KEEP_MS)
      .first<SnapRow>();
    if (!s) return err(404, 'That snap is gone');
    return json({ snap: view(s) });
  }
  if (one && req.method === 'DELETE') {
    // Its likes and comments go with it (snaps_cascade trigger).
    const gone = await db.prepare('DELETE FROM snaps WHERE id = ? AND uid = ? RETURNING media_key').bind(Number(one[1]), me).first<{ media_key: string }>();
    if (!gone) return err(404, 'You can only delete your own snaps');
    await env.MEDIA.delete(gone.media_key);
    return json({ ok: true });
  }

  const like = path.match(/^\/api\/snaps\/(\d+)\/like$/);
  if (like && req.method === 'POST') {
    const id = Number(like[1]);
    const had = await db.prepare('DELETE FROM snap_likes WHERE snap_id = ? AND uid = ? RETURNING snap_id').bind(id, me).first();
    if (!had) await db.prepare(`INSERT OR IGNORE INTO snap_likes (snap_id, uid) SELECT s.id, ?1 FROM snaps s WHERE s.id = ?2 AND s.created_at >= ?3 AND ${VISIBLE}`).bind(me, id, now - SNAP_KEEP_MS).run();
    const n = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(uid = ?), 0) AS mine FROM snap_likes WHERE snap_id = ?').bind(me, id).first<{ n: number; mine: number }>();
    return json({ liked: !!n?.mine, likes: n?.n ?? 0 });
  }

  /** Opened a snap: one view per player (its owner's own never count), and a snap sent to me is now opened. */
  const seen = path.match(/^\/api\/snaps\/(\d+)\/view$/);
  if (seen && req.method === 'POST') {
    const id = Number(seen[1]);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO snap_views (snap_id, uid, at) SELECT s.id, ?1, ?3 FROM snaps s WHERE s.id = ?2 AND s.uid != ?1 AND s.created_at >= ?4 AND ${VISIBLE}`)
        .bind(me, id, now, now - SNAP_KEEP_MS),
      db.prepare('UPDATE snap_sends SET opened_at = ?3 WHERE snap_id = ?2 AND to_uid = ?1 AND opened_at IS NULL').bind(me, id, now),
    ]);
    const n = await db.prepare('SELECT COUNT(*) AS n FROM snap_views WHERE snap_id = ?').bind(id).first<{ n: number }>();
    return json({ ok: true, views: n?.n ?? 0 });
  }
  /** Who has seen my snap, newest first: only its owner may ask. */
  const viewers = path.match(/^\/api\/snaps\/(\d+)\/views$/);
  if (viewers && req.method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT v.uid, p.username, v.at FROM snap_views v JOIN snaps s ON s.id = v.snap_id LEFT JOIN players p ON p.uid = v.uid
         WHERE v.snap_id = ?1 AND s.uid = ?2 ORDER BY v.at DESC LIMIT 100`,
      )
      .bind(Number(viewers[1]), me)
      .all<{ uid: string; username: string | null; at: number }>();
    return json({ viewers: results });
  }

  const comments = path.match(/^\/api\/snaps\/(\d+)\/comments$/);
  if (comments && req.method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT c.id, c.uid, c.text, c.created_at AS at, p.username
         FROM snap_comments c JOIN snaps s ON s.id = c.snap_id LEFT JOIN players p ON p.uid = c.uid
         WHERE c.snap_id = ?2 AND s.created_at >= ?3 AND ${VISIBLE} ORDER BY c.id ASC LIMIT ?4`,
      )
      .bind(me, Number(comments[1]), now - SNAP_KEEP_MS, COMMENT_WINDOW)
      .all();
    return json({ comments: results });
  }

  /** POST /api/snaps/<id>/comments { text } */
  if (comments && req.method === 'POST') {
    const id = Number(comments[1]);
    const b = (await req.json().catch(() => null)) as { text?: unknown } | null;
    const p = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();
    if (!p?.username) return err(403, 'Pick a username first');
    const text = (typeof b?.text === 'string' ? b.text : '').replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT);
    if (!text) return err(400, 'Say something');
    const target = await db
      .prepare(`SELECT (SELECT COUNT(*) FROM snap_comments c WHERE c.snap_id = s.id) AS n FROM snaps s WHERE s.id = ?2 AND s.created_at >= ?3 AND ${VISIBLE}`)
      .bind(me, id, now - SNAP_KEEP_MS)
      .first<{ n: number }>();
    if (!target) return err(404, 'That snap is gone');
    if (target.n >= COMMENT_WINDOW) return err(429, 'This snap has all the comments it can take');
    const last = await db.prepare('SELECT MAX(created_at) AS at FROM snap_comments WHERE uid = ?').bind(me).first<{ at: number | null }>();
    if (last?.at && now - last.at < COMMENT_COOLDOWN_MS) return err(429, 'Easy! Give it a few seconds');
    const row = await db
      .prepare('INSERT INTO snap_comments (snap_id, uid, text, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(id, me, text, now)
      .first<{ id: number }>();
    return json({ ok: true, id: row?.id });
  }

  /** Whoever wrote a comment can delete it, and so can the owner of the snap it is on. */
  const comment = path.match(/^\/api\/snaps\/(\d+)\/comments\/(\d+)$/);
  if (comment && req.method === 'DELETE') {
    const gone = await db
      .prepare(
        `DELETE FROM snap_comments WHERE id = ?1 AND snap_id = ?2
           AND (uid = ?3 OR EXISTS (SELECT 1 FROM snaps s WHERE s.id = ?2 AND s.uid = ?3)) RETURNING id`,
      )
      .bind(Number(comment[2]), Number(comment[1]), me)
      .first();
    if (!gone) return err(404, 'You can only delete your own comments, or comments on your snaps');
    return json({ ok: true });
  }

  return err(404, 'Not found');
}
