// Group chats: a named room of up to MAX_MEMBERS players. Clients poll; there is no live push.

import { OFFICES, OFFICE_RULES, type PoliticalOffice } from '../src/game/civic';
import type { FirebaseUser } from './auth';
import { handle } from './feed';

const MAX_MEMBERS = 20;
const MAX_TEXT = 500;
const PAGE = 50;
const NAME_RE = /^[\w .'!-]{2,30}$/;

// The Government Forum: the one group no player owns. Whoever holds an office is in it and nobody else is
// (syncForum), so nobody can be added to it and nobody can leave it. Its notes are messages from this owner.
const FORUM_OWNER = 'government';
const FORUM_NAME = 'Government Forum';
const FORUM_ID = `(SELECT id FROM group_chats WHERE owner_uid = '${FORUM_OWNER}' ORDER BY id LIMIT 1)`;
/** Everyone in office right now: one row per office held, in the order of OFFICES. One SELECT, not a UNION per office: D1 allows five. */
const HOLDERS = `SELECT j.key AS office, j.value AS uid FROM civic_policies c, json_each(json_object(${OFFICES.map((o) => `'${o}', c.${o}_uid`).join(', ')})) j WHERE c.id = 1 AND j.value IS NOT NULL`;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

interface MsgRow {
  id: number;
  group_id: number;
  from_uid: string;
  text: string;
  created_at: number;
  username?: string | null;
}

const toMsg = (r: MsgRow) => ({ id: r.id, group: r.group_id, from: r.from_uid, username: r.username ?? null, text: r.text, at: r.created_at, system: r.from_uid === FORUM_OWNER });

/**
 * Makes the Government Forum's members the people in office: whoever lost their seat goes, whoever won one comes in,
 * and the forum is told. Safe to run at any time and as often as you like. Runs when a seat changes hands
 * (worker/civic.ts) and on the cron, which also catches a seat changed any other way.
 */
export async function syncForum(db: D1Database, now: number) {
  const [, left, joined] = await db.batch<{ uid: string }>([
    db.prepare(`INSERT INTO group_chats (name, owner_uid, created_at) SELECT ?1, '${FORUM_OWNER}', ?2 WHERE ${FORUM_ID} IS NULL`).bind(FORUM_NAME, now),
    db.prepare(`DELETE FROM group_members WHERE group_id = ${FORUM_ID} AND uid NOT IN (SELECT uid FROM (${HOLDERS})) RETURNING uid`),
    // Like anyone added to a group, a new member starts with nothing unread: the note below is their first.
    db
      .prepare(
        `INSERT OR IGNORE INTO group_members (group_id, uid, joined_at, last_read_id)
         SELECT ${FORUM_ID}, uid, ?1, (SELECT COALESCE(MAX(id), 0) FROM group_messages WHERE group_id = ${FORUM_ID}) FROM (${HOLDERS}) RETURNING uid`,
      )
      .bind(now),
  ]);
  const moved = [...left.results, ...joined.results].map((r) => r.uid);
  if (!moved.length) return;
  const { results: who } = await db
    .prepare(`SELECT p.uid, p.username, h.office FROM players p LEFT JOIN (${HOLDERS}) h ON h.uid = p.uid WHERE p.uid IN (${moved.map(() => '?').join(',')})`)
    .bind(...moved)
    .all<{ uid: string; username: string | null; office: PoliticalOffice | null }>();
  const name = (uid: string) => handle(who.find((w) => w.uid === uid)?.username);
  const titles = (uid: string) => who.filter((w) => w.uid === uid && w.office).map((w) => OFFICE_RULES[w.office!].title).join(' and ');
  const notes = [
    ...left.results.map(({ uid }) => `${name(uid)} is out of office and has left the forum.`),
    ...joined.results.map(({ uid }) => `${name(uid)} joined the forum${titles(uid) ? ` as ${titles(uid)}` : ''}.`),
  ];
  await db.batch(notes.map((text) => db.prepare(`INSERT INTO group_messages (group_id, from_uid, text, created_at) VALUES (${FORUM_ID}, '${FORUM_OWNER}', ?, ?)`).bind(text, now)));
}

export async function handleGroups(req: Request, env: Env, user: FirebaseUser, path: string, url: URL): Promise<Response | null> {
  if (!path.startsWith('/api/groups')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  if (path === '/api/groups' && req.method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT g.id, g.name, g.owner_uid, gm.last_read_id,
                (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS members,
                (SELECT COUNT(*) FROM group_messages m WHERE m.group_id = g.id AND m.id > gm.last_read_id AND m.from_uid != ?1) AS unread,
                l.id AS last_id, l.from_uid AS last_from, l.text AS last_text, l.created_at AS last_at, lp.username AS last_username
         FROM group_members gm
         JOIN group_chats g ON g.id = gm.group_id
         LEFT JOIN group_messages l ON l.id = (SELECT MAX(id) FROM group_messages WHERE group_id = g.id)
         LEFT JOIN players lp ON lp.uid = l.from_uid
         WHERE gm.uid = ?1
         ORDER BY g.owner_uid = ?2 DESC, COALESCE(l.id, 0) DESC, g.id DESC LIMIT 50`,
      )
      .bind(me, FORUM_OWNER)
      .all<Record<string, unknown>>();
    return json({
      groups: results.map((r) => ({
        id: r.id,
        name: r.name,
        members: r.members,
        unread: r.unread,
        official: r.owner_uid === FORUM_OWNER,
        last: r.last_id ? { id: r.last_id, from: r.last_from, username: r.last_username, text: r.last_text, at: r.last_at, system: r.last_from === FORUM_OWNER } : null,
      })),
    });
  }

  if (path === '/api/groups' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { name?: string; members?: unknown } | null;
    const name = (b?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!NAME_RE.test(name)) return err(400, 'Group name must be 2–30 characters');
    if (name.toLowerCase() === FORUM_NAME.toLowerCase()) return err(400, 'That name is taken');
    const ids = [...new Set(Array.isArray(b?.members) ? (b!.members as unknown[]).filter((x): x is string => typeof x === 'string' && x !== me) : [])];
    if (ids.length < 1) return err(400, 'Add at least one other player');
    if (ids.length + 1 > MAX_MEMBERS) return err(400, `A group holds ${MAX_MEMBERS} people at most`);
    const { results: found } = await db
      .prepare(`SELECT uid FROM players WHERE username IS NOT NULL AND uid IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<{ uid: string }>();
    if (found.length !== ids.length) return err(404, 'Someone you picked does not exist');
    const g = await db.prepare('INSERT INTO group_chats (name, owner_uid, created_at) VALUES (?, ?, ?) RETURNING id').bind(name, me, now).first<{ id: number }>();
    await db.batch([me, ...ids].map((uid) => db.prepare('INSERT INTO group_members (group_id, uid, joined_at) VALUES (?, ?, ?)').bind(g!.id, uid, now)));
    return json({ id: g!.id, name });
  }

  const one = path.match(/^\/api\/groups\/(\d+)(\/messages|\/leave|\/members)?$/);
  if (!one) return null;
  const gid = Number(one[1]);
  const sub = one[2];
  const member = await db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND uid = ?').bind(gid, me).first();
  if (!member) return err(404, 'You are not in that group');

  if (!sub && req.method === 'GET') {
    const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const [{ results }, group, { results: members }] = await Promise.all([
      db
        .prepare(
          `SELECT m.*, p.username FROM group_messages m LEFT JOIN players p ON p.uid = m.from_uid
           WHERE m.group_id = ?1 AND m.id < ?2 ORDER BY m.id DESC LIMIT ?3`,
        )
        .bind(gid, before, PAGE)
        .all<MsgRow>(),
      db.prepare('SELECT id, name, owner_uid FROM group_chats WHERE id = ?').bind(gid).first<{ id: number; name: string; owner_uid: string }>(),
      db
        .prepare(`SELECT gm.uid, p.username, p.name, (SELECT json_extract(s.data, '$.look') FROM saves s WHERE s.uid = gm.uid) AS look
           FROM group_members gm LEFT JOIN players p ON p.uid = gm.uid WHERE gm.group_id = ? ORDER BY gm.joined_at`)
        .bind(gid)
        .all<{ uid: string; username: string | null; name: string | null; look: string | null; office?: string }>(),
    ]);
    const official = group?.owner_uid === FORUM_OWNER;
    if (official) {
      // In the forum everyone is listed by the office they hold, in the order the Civic app lists the offices.
      const { results: seats } = await db.prepare(HOLDERS).all<{ office: PoliticalOffice; uid: string }>();
      const rank = (uid: string) => seats.findIndex((s) => s.uid === uid);
      for (const m of members) m.office = seats.filter((s) => s.uid === m.uid).map((s) => OFFICE_RULES[s.office].title).join(' · ');
      members.sort((a, b) => rank(a.uid) - rank(b.uid));
    }
    if (!before || before === Number.MAX_SAFE_INTEGER) {
      const top = results[0]?.id ?? 0;
      if (top) await db.prepare('UPDATE group_members SET last_read_id = MAX(last_read_id, ?3) WHERE group_id = ?1 AND uid = ?2').bind(gid, me, top).run();
    }
    return json({ group: { ...group, official, members }, messages: results.reverse().map(toMsg) });
  }

  if (sub === '/messages' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { text?: string } | null;
    const text = (b?.text ?? '').trim().slice(0, MAX_TEXT);
    if (!text) return err(400, 'Message is empty');
    const p = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();
    if (!p?.username) return err(403, 'Pick a username first');
    const row = await db
      .prepare('INSERT INTO group_messages (group_id, from_uid, text, created_at) VALUES (?, ?, ?, ?) RETURNING *')
      .bind(gid, me, text, now)
      .first<MsgRow>();
    await db.prepare('UPDATE group_members SET last_read_id = ? WHERE group_id = ? AND uid = ?').bind(row!.id, gid, me).run();
    return json({ message: toMsg({ ...row!, username: p.username }) });
  }

  if (sub === '/members' && req.method === 'POST') {
    const b = (await req.json().catch(() => null)) as { add?: string } | null;
    if (!b?.add) return err(400, 'Choose a player');
    const owner = await db.prepare('SELECT 1 FROM group_chats WHERE id = ? AND owner_uid = ?').bind(gid, me).first();
    if (!owner) return err(403, 'Only the group owner can add people');
    const n = await db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').bind(gid).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_MEMBERS) return err(400, 'Group is full');
    const exists = await db.prepare('SELECT 1 FROM players WHERE uid = ? AND username IS NOT NULL').bind(b.add).first();
    if (!exists) return err(404, 'No such player');
    const last = await db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM group_messages WHERE group_id = ?').bind(gid).first<{ id: number }>();
    await db.prepare('INSERT OR IGNORE INTO group_members (group_id, uid, joined_at, last_read_id) VALUES (?, ?, ?, ?)').bind(gid, b.add, now, last?.id ?? 0).run();
    return json({ ok: true });
  }

  if (sub === '/leave' && req.method === 'POST') {
    const forum = await db.prepare('SELECT 1 FROM group_chats WHERE id = ? AND owner_uid = ?').bind(gid, FORUM_OWNER).first();
    if (forum) return err(403, `You leave the ${FORUM_NAME} when you leave office`);
    await db.prepare('DELETE FROM group_members WHERE group_id = ? AND uid = ?').bind(gid, me).run();
    const left = await db.prepare('SELECT uid FROM group_members WHERE group_id = ? ORDER BY joined_at LIMIT 1').bind(gid).first<{ uid: string }>();
    if (!left) {
      await db.batch([
        db.prepare('DELETE FROM group_messages WHERE group_id = ?').bind(gid),
        db.prepare('DELETE FROM group_chats WHERE id = ?').bind(gid),
      ]);
    } else {
      await db.prepare('UPDATE group_chats SET owner_uid = ? WHERE id = ? AND owner_uid = ?').bind(left.uid, gid, me).run();
    }
    return json({ ok: true });
  }

  return null;
}
