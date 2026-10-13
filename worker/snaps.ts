// Snap: a picture from the in-game camera with a short message, shown to friends and to the whole city, and gone a
// real day later. The picture lives in R2 and the row in D1; the hourly sweep (worker/cron.ts) deletes both.

import type { FirebaseUser } from './auth';
import { sniff } from './media';
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
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

/** Snap pictures are kept apart from other uploads (s/ not u/), so sweeping them can never touch a profile or ad picture. */
export const SNAP_KEY = /^s\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

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
}

export async function handleSnaps(req: Request, env: Env, user: FirebaseUser, path: string, url: URL): Promise<Response | null> {
  if (!path.startsWith('/api/snaps')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  if (path === '/api/snaps' && req.method === 'GET') {
    const friends = url.searchParams.get('scope') === 'friends';
    const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const { results } = await db
      .prepare(
        `SELECT s.id, s.uid, s.media_key, s.caption, s.created_at AS at, p.username,
                (SELECT COUNT(*) FROM snap_likes l WHERE l.snap_id = s.id) AS likes,
                EXISTS (SELECT 1 FROM snap_likes l WHERE l.snap_id = s.id AND l.uid = ?1) AS liked,
                (SELECT COUNT(*) FROM snap_comments c WHERE c.snap_id = s.id) AS comments
         FROM snaps s LEFT JOIN players p ON p.uid = s.uid
         WHERE s.id < ?2 AND s.created_at >= ?3
           ${friends ? `AND (s.uid = ?1 OR EXISTS (SELECT 1 FROM friendships fr WHERE fr.status = 'accepted'
                AND fr.a = MIN(s.uid, ?1) AND fr.b = MAX(s.uid, ?1)))` : 'AND ?1 IS NOT NULL'}
         ORDER BY s.id DESC LIMIT ?4`,
      )
      .bind(me, before, now - SNAP_KEEP_MS, SNAP_PAGE)
      .all<{ id: number; uid: string; media_key: string; caption: string; at: number; username: string | null; likes: number; liked: number; comments: number }>();
    const snaps = results.map(({ media_key, liked, ...s }) => ({ ...s, liked: !!liked, url: `/api/media/${media_key}`, until: s.at + SNAP_KEEP_MS }));
    return json({ snaps, page: SNAP_PAGE });
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
    const key = `s/${me}/${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
    const row = await db
      .prepare('INSERT INTO snaps (uid, media_key, caption, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(me, key, caption, now)
      .first<{ id: number }>()
      .catch(() => null);
    if (!row) {
      await env.MEDIA.delete(key);
      return err(500, 'Could not post that snap');
    }
    return json({ ok: true, id: row.id, until: now + SNAP_KEEP_MS });
  }

  const one = path.match(/^\/api\/snaps\/(\d+)$/);
  /** One snap, for whoever opened a share link to it (src/net/deeplink.ts). */
  if (one && req.method === 'GET') {
    const s = await db
      .prepare(
        `SELECT s.id, s.uid, s.media_key, s.caption, s.created_at AS at, p.username,
                (SELECT COUNT(*) FROM snap_likes l WHERE l.snap_id = s.id) AS likes,
                EXISTS (SELECT 1 FROM snap_likes l WHERE l.snap_id = s.id AND l.uid = ?1) AS liked,
                (SELECT COUNT(*) FROM snap_comments c WHERE c.snap_id = s.id) AS comments
         FROM snaps s LEFT JOIN players p ON p.uid = s.uid WHERE s.id = ?2 AND s.created_at >= ?3`,
      )
      .bind(me, Number(one[1]), now - SNAP_KEEP_MS)
      .first<{ id: number; uid: string; media_key: string; caption: string; at: number; username: string | null; likes: number; liked: number; comments: number }>();
    if (!s) return err(404, 'That snap is gone');
    const { media_key, liked, ...rest } = s;
    return json({ snap: { ...rest, liked: !!liked, url: `/api/media/${media_key}`, until: s.at + SNAP_KEEP_MS } });
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
    if (!had) await db.prepare('INSERT OR IGNORE INTO snap_likes (snap_id, uid) SELECT id, ? FROM snaps WHERE id = ? AND created_at >= ?').bind(me, id, now - SNAP_KEEP_MS).run();
    const n = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(uid = ?), 0) AS mine FROM snap_likes WHERE snap_id = ?').bind(me, id).first<{ n: number; mine: number }>();
    return json({ liked: !!n?.mine, likes: n?.n ?? 0 });
  }

  const comments = path.match(/^\/api\/snaps\/(\d+)\/comments$/);
  if (comments && req.method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT c.id, c.uid, c.text, c.created_at AS at, p.username
         FROM snap_comments c JOIN snaps s ON s.id = c.snap_id LEFT JOIN players p ON p.uid = c.uid
         WHERE c.snap_id = ? AND s.created_at >= ? ORDER BY c.id ASC LIMIT ?`,
      )
      .bind(Number(comments[1]), now - SNAP_KEEP_MS, COMMENT_WINDOW)
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
      .prepare('SELECT (SELECT COUNT(*) FROM snap_comments c WHERE c.snap_id = s.id) AS n FROM snaps s WHERE s.id = ? AND s.created_at >= ?')
      .bind(id, now - SNAP_KEEP_MS)
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
