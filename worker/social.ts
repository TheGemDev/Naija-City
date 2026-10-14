// Usernames, direct messages, and player-to-player money.
//
// Money moves between wallets (worker/wallet.ts) in a single transaction. A pay message stays
// 'pending' until the recipient's game acknowledges it (POST /api/claim) and shows the toast.

import { followHost, notifyPlayer, roomOf, whereIs } from './shards';
import { verifyTurnstile } from './turnstile';
import type { FirebaseUser } from './auth';
import { ensureWallet, getBalance } from './wallet';
import { loadPolicy } from './policy';
import { transferFeeOf } from '../src/game/treasury';
import { ITEMS } from '../src/game/catalog';
import { MAX_GRID_H, MAX_GRID_W } from '../src/game/grid';
import { PAINT_BY_ID } from '../src/game/paint';
import { sectionOf } from '../src/game/estate';
import { CAR_BY_ID } from '../src/game/cars';
import { supplyOf, type PowerSave, type Supply } from '../src/game/power';
import { normalizeOrigin } from '../src/game/origins';
import { getRegion } from '../src/game/regions';
import { DESIGN_BY_ID, REGION_BY_ID, STAGES } from '../src/game/property';
import { HOUSEHOLD_STAFF, type HouseholdStaff } from '../src/game/staff';
import { alertOwner, injuredUntil, lockedOutUntil, securityCatch } from './crime';
import { sendPush } from './push';
import { befriendOnReply } from './community';

export const USERNAME_RE = /^[a-z0-9_]{3,15}$/;
const RESERVED = new Set(['admin', 'kaduna', 'kadunalife', 'support', 'system', 'moderator', 'official']);
import { MAX_SOCIAL_AMOUNT } from './limits';
const MAX_TEXT = 500;

export interface Message {
  id: number;
  from: string;
  to: string;
  kind: 'text' | 'pay' | 'request' | 'invite' | 'visit' | 'love';
  text: string;
  amount: number | null;
  status: string | null;
  ref: number | null;
  at: number;
  read: boolean;
}

interface MessageRow {
  id: number;
  from_uid: string;
  to_uid: string;
  kind: Message['kind'];
  text: string;
  amount: number | null;
  status: string | null;
  ref: number | null;
  created_at: number;
  read_at: number | null;
}

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  from: r.from_uid,
  to: r.to_uid,
  kind: r.kind,
  text: r.text,
  amount: r.amount,
  status: r.status,
  ref: r.ref,
  at: r.created_at,
  read: r.read_at !== null,
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Push a live event to a player if they are online (they also see it next time they load). */
function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}

async function playerByUid(env: Env, uid: string) {
  return env.DB.prepare('SELECT uid, username, name FROM players WHERE uid = ?').bind(uid).first<{ uid: string; username: string | null; name: string | null }>();
}

/** Whole years between a date of birth and `now`. */
function ageOn(now: number, y: number, m: number, d: number): number {
  const today = new Date(now);
  const hadBirthday = today.getUTCMonth() > m - 1 || (today.getUTCMonth() === m - 1 && today.getUTCDate() >= d);
  return today.getUTCFullYear() - y - (hadBirthday ? 0 : 1);
}

const validAmount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_SOCIAL_AMOUNT;

export async function handleSocial(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string, url: URL): Promise<Response | null> {
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  // --- Identity ---

  if (path === '/api/me' && req.method === 'GET') {
    const p = await env.DB.prepare('SELECT username, birthdate FROM players WHERE uid = ?').bind(me).first<{ username: string | null; birthdate: string | null }>();
    const born = p?.birthdate?.split('-').map(Number);
    // The birthdate goes only to the player it belongs to (it is printed on their birth certificate).
    return json({ uid: me, username: p?.username ?? null, adult: !!p?.birthdate, age: born ? ageOn(now, born[0], born[1], born[2]) : null, birthdate: p?.birthdate ?? null });
  }

  if (path === '/api/birthdate' && req.method === 'POST') {
    const b = await body<{ year?: number; month?: number; day?: number }>(req);
    const y = Number(b?.year), m = Number(b?.month), d = Number(b?.day);
    const dob = new Date(Date.UTC(y, m - 1, d));
    const real = Number.isInteger(y) && y >= 1900 && dob.getUTCFullYear() === y && dob.getUTCMonth() === m - 1 && dob.getUTCDate() === d;
    if (!real) return err(400, 'That date doesn’t look right.');
    const age = ageOn(now, y, m, d);
    if (age < 0) return err(400, 'That date doesn’t look right.'); // not born yet
    const birthdate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    await db
      .prepare(
        `INSERT INTO players (uid, email, name, created_at, last_seen, birthdate) VALUES (?1, ?2, ?3, ?4, ?4, ?5)
         ON CONFLICT(uid) DO UPDATE SET birthdate = COALESCE(birthdate, ?5)`,
      )
      .bind(me, user.email ?? null, user.name ?? null, now, birthdate)
      .run();
    return json({ ok: true, age });
  }

  if (path === '/api/username' && req.method === 'POST') {
    if (!(await verifyTurnstile(env, req.headers.get('x-turnstile-token'), req.headers.get('cf-connecting-ip')))) {
      return err(403, 'Please complete the human check and try again');
    }
    const b = await body<{ username?: string }>(req);
    const username = (b?.username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return err(400, 'Use 3–15 letters, numbers or _');
    if (RESERVED.has(username)) return err(409, 'That username is taken');
    try {
      await db
        .prepare(
          `INSERT INTO players (uid, email, name, created_at, last_seen, username) VALUES (?1, ?2, ?3, ?4, ?4, ?5)
           ON CONFLICT(uid) DO UPDATE SET username = ?5`,
        )
        .bind(me, user.email ?? null, user.name ?? null, now, username)
        .run();
    } catch (e) {
      if (String(e).includes('UNIQUE')) return err(409, 'That username is taken');
      throw e;
    }
    return json({ uid: me, username });
  }

  if (path === '/api/players' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{1,15}$/.test(q)) return json({ players: [] });
    const { results } = await db
      .prepare(`SELECT uid, username, name, (SELECT json_extract(s.data, '$.look') FROM saves s WHERE s.uid = players.uid) AS look
         FROM players WHERE username >= ?1 AND username < ?1 || '~' AND uid != ?2 ORDER BY username LIMIT 10`)
      .bind(q, me)
      .all();
    return json({ players: results });
  }

  // Faces for lists that only carry a uid or a username (leaderboards, feeds): asked for in one batch.
  if (path === '/api/looks' && req.method === 'GET') {
    const pick = (key: string, ok: RegExp) => [...new Set((url.searchParams.get(key) ?? '').split(','))].filter((v) => ok.test(v)).slice(0, 40);
    const uids = pick('u', /^[\w-]{1,128}$/);
    const names = pick('n', /^[a-z0-9_]{1,15}$/);
    if (!uids.length && !names.length) return json({ players: [] });
    const marks = (n: number) => Array(n).fill('?').join(',');
    const { results } = await db
      .prepare(`SELECT uid, username, (SELECT json_extract(s.data, '$.look') FROM saves s WHERE s.uid = players.uid) AS look
         FROM players WHERE uid IN (${marks(uids.length)}) OR username IN (${marks(names.length)})`)
      .bind(...uids, ...names)
      .all();
    return json({ players: results });
  }

  // --- Messages ---

  if (path === '/api/inbox' && req.method === 'GET') {
    const { results } = await db
      .prepare(
        `WITH c AS (
           SELECT other, MAX(id) AS last_id, SUM(unread) AS unread FROM (
             SELECT to_uid AS other, id, 0 AS unread FROM messages WHERE from_uid = ?1
             UNION ALL
             SELECT from_uid AS other, id, (read_at IS NULL) AS unread FROM messages WHERE to_uid = ?1
           ) GROUP BY other
         )
         SELECT c.other AS uid, c.unread, p.username, p.name, (SELECT json_extract(s.data, '$.look') FROM saves s WHERE s.uid = c.other) AS look, m.*
         FROM c JOIN messages m ON m.id = c.last_id LEFT JOIN players p ON p.uid = c.other
         ORDER BY c.last_id DESC LIMIT 50`,
      )
      .bind(me)
      .all<MessageRow & { uid: string; unread: number; username: string | null; name: string | null; look: string | null }>();
    return json({
      conversations: results.map((r) => ({ uid: r.uid, username: r.username, name: r.name, look: r.look, unread: r.unread, last: toMessage(r) })),
    });
  }

  const thread = path.match(/^\/api\/messages\/([\w-]{1,128})$/);
  if (thread && req.method === 'GET') {
    const other = thread[1];
    const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const [{ results }, marked, player] = await Promise.all([
      db
        .prepare(
          `SELECT * FROM messages WHERE ((from_uid = ?1 AND to_uid = ?2) OR (from_uid = ?2 AND to_uid = ?1)) AND id < ?3
           ORDER BY id DESC LIMIT 50`,
        )
        .bind(me, other, before)
        .all<MessageRow>(),
      db.prepare('UPDATE messages SET read_at = ?3 WHERE to_uid = ?1 AND from_uid = ?2 AND read_at IS NULL').bind(me, other, now).run(),
      db
        .prepare(`SELECT uid, username, name, (SELECT json_extract(s.data, '$.look') FROM saves s WHERE s.uid = players.uid) AS look FROM players WHERE uid = ?`)
        .bind(other)
        .first<{ uid: string; username: string | null; name: string | null; look: string | null }>(),
    ]);
    if (!player) return err(404, 'No such player');
    // Tell them their messages were seen.
    if (marked.meta.changes > 0) {
      const upTo = results.filter((m) => m.from_uid === other).reduce((a, m) => Math.max(a, m.id), 0);
      notify(env, ctx, other, { t: 'msg-read', by: me, upTo });
    }
    return json({ player, messages: results.reverse().map(toMessage) });
  }

  if (path === '/api/messages' && req.method === 'POST') {
    const b = await body<{ to?: string; text?: string; ref?: number }>(req);
    const text = (b?.text ?? '').trim().slice(0, MAX_TEXT);
    if (!b?.to || !text) return err(400, 'Message is empty');
    return send(env, ctx, me, b.to, { kind: 'text', text, ref: b.ref ?? null });
  }

  if (path === '/api/invite' && req.method === 'POST') {
    const b = await body<{ to?: string }>(req);
    if (!b?.to) return err(400, 'Choose a player to invite');
    return send(env, ctx, me, b.to, { kind: 'invite', text: 'Invited you to visit their house', status: 'open' });
  }

  if (path === '/api/visit/request' && req.method === 'POST') {
    const b = await body<{ to?: string }>(req);
    if (!b?.to) return err(400, 'Choose a player to visit');
    return send(env, ctx, me, b.to, { kind: 'visit', text: 'Asked to visit your house', status: 'open' });
  }

  if (path === '/api/break-in/start' && req.method === 'POST') {
    const b = await body<{ target?: string; slot?: number; region?: string }>(req);
    if (!b || typeof b.target !== 'string' || typeof b.region !== 'string' ||
      !REGION_BY_ID[b.region] || !Number.isSafeInteger(b.slot) || b.slot! < 0 || b.slot! >= 4_000_000) {
      return err(400, 'Choose a valid house');
    }
    if (b.target === me) return err(400, 'You can’t break into your own house');
    if (await injuredUntil(db, me)) return err(403, 'You are still hurting from the beating. Rest first');
    const lockedOut = await lockedOutUntil(db, me, b.target);
    if (lockedOut) {
      const minutes = Math.ceil((lockedOut - Date.now()) / 60_000);
      return err(403, `They know your face at this house. Lie low for ${minutes} more minute${minutes === 1 ? '' : 's'}`);
    }
    const location = await whereIs(env, me);
    const estate = location?.area.match(/^estate:([\w-]+):(\d+)$/);
    if (!estate || estate[1] !== b.region || Number(estate[2]) !== sectionOf(b.slot!)) {
      return err(409, 'Go to the estate containing that house first');
    }
    const plot = await db
      .prepare('SELECT pid, design, stage FROM estate_plots WHERE region = ?1 AND slot = ?2 AND uid = ?3')
      .bind(b.region, b.slot, b.target)
      .first<{ pid: string; design: string | null; stage: number }>();
    if (!plot || !plot.design || plot.stage < STAGES.length) return err(404, 'That finished house is no longer available');
    const loaded = await houseOf(db, b.target, plot.pid);
    if ('error' in loaded) return err(loaded.status, loaded.error);
    if (await securityCatch(env, ctx, me, b.target, plot.pid)) {
      return err(403, '🚨 House security caught you and handed you to the police');
    }
    await followHost(env, me, b.target);
    await (await roomOf(env, me)).allowHomeVisit(me, b.target, 'burglary', plot.pid);
    await alertOwner(env, ctx, me, b.target, plot.pid);
    return json({ home: loaded.home });
  }

  const visitReq = path.match(/^\/api\/visit\/(\d+)\/(accept|decline|enter)$/);
  if (visitReq && req.method === 'POST') {
    const id = Number(visitReq[1]);
    const action = visitReq[2];
    if (action === 'enter') {
      // The requester walks in once the owner has said yes.
      const m = await db.prepare(`SELECT to_uid FROM messages WHERE id = ?1 AND from_uid = ?2 AND kind = 'visit' AND status = 'accepted'`).bind(id, me).first<{ to_uid: string }>();
      if (!m) return err(404, 'Visit request expired or unavailable');
      const loaded = await houseOf(db, m.to_uid);
      if ('error' in loaded) return err(loaded.status, loaded.error);
      await followHost(env, me, m.to_uid);
      await (await roomOf(env, me)).allowHomeVisit(me, m.to_uid, 'invited', loaded.home.propertyId ?? undefined);
      return json({ home: loaded.home });
    }
    const status = action === 'accept' ? 'accepted' : 'declined';
    if (status === 'accepted') {
      const mine = await houseOf(db, me);
      if ('error' in mine) return err(mine.status, mine.error);
    }
    const row = await db
      .prepare(`UPDATE messages SET status = ?3 WHERE id = ?1 AND to_uid = ?2 AND kind = 'visit' AND status = 'open' RETURNING *`)
      .bind(id, me, status)
      .first<MessageRow>();
    if (!row) return err(409, 'Visit request was already handled');
    const message = toMessage(row);
    notify(env, ctx, message.from, { t: 'msg-update', message });
    return json({ message });
  }

  if (path === '/api/visit/leave' && req.method === 'POST') {
    await (await roomOf(env, me)).revokeHomeVisit(me);
    return json({ ok: true });
  }

  const invite = path.match(/^\/api\/invite\/(\d+)\/(accept|decline)$/);
  if (invite && req.method === 'POST') {
    const id = Number(invite[1]);
    const decision = invite[2] === 'accept' ? 'accepted' : 'declined';
    let home: Home | undefined;
    if (decision === 'accepted') {
      const loaded = await loadHome(db, id, me);
      if ('error' in loaded) return err(loaded.status, loaded.error);
      home = loaded.home;
    }
    const messageRow = await db
      .prepare(`UPDATE messages SET status = ?3 WHERE id = ?1 AND to_uid = ?2 AND kind = 'invite' AND status = 'open' RETURNING *`)
      .bind(id, me, decision)
      .first<MessageRow>();
    if (!messageRow) return err(409, 'House invite was already handled');
    const message = toMessage(messageRow);
    notify(env, ctx, message.from, { t: 'msg-update', message });
    if (home) {
      await followHost(env, me, home.ownerUid);
      await (await roomOf(env, me)).allowHomeVisit(me, home.ownerUid, 'invited', home.propertyId ?? undefined);
    }
    return json({ message, ...(home ? { home } : {}) });
  }

  const delMsg = path.match(/^\/api\/messages\/(\d+)$/);
  if (delMsg && req.method === 'DELETE') {
    const msgId = Number(delMsg[1]);
    const row = await db.prepare('SELECT * FROM messages WHERE id = ?1 AND (from_uid = ?2 OR to_uid = ?2)').bind(msgId, me).first<MessageRow>();
    if (!row) return err(404, 'Message not found');
    await db.prepare('DELETE FROM messages WHERE id = ?').bind(msgId).run();
    notify(env, ctx, row.from_uid, { t: 'msg-delete', id: msgId, from: row.from_uid, to: row.to_uid });
    notify(env, ctx, row.to_uid, { t: 'msg-delete', id: msgId, from: row.from_uid, to: row.to_uid });
    return json({ ok: true, id: msgId });
  }

  // --- Money ---

  if (path === '/api/request' && req.method === 'POST') {
    const b = await body<{ to?: string; amount?: number; note?: string }>(req);
    if (!b?.to || !validAmount(b.amount)) return err(400, 'Enter an amount between ₦1 and ₦10,000,000,000');
    return send(env, ctx, me, b.to, { kind: 'request', text: (b.note ?? '').trim().slice(0, 140), amount: b.amount, status: 'open' });
  }

  const decline = path.match(/^\/api\/request\/(\d+)\/decline$/);
  if (decline && req.method === 'POST') {
    const row = await db
      .prepare(`UPDATE messages SET status = 'declined' WHERE id = ? AND to_uid = ? AND kind = 'request' AND status = 'open' RETURNING *`)
      .bind(Number(decline[1]), me)
      .first<MessageRow>();
    if (!row) return err(409, 'Request is no longer open');
    notify(env, ctx, row.from_uid, { t: 'msg-update', message: toMessage(row) });
    return json({ message: toMessage(row) });
  }

  if (path === '/api/pay' && req.method === 'POST') {
    const b = await body<{ to?: string; amount?: number; note?: string; ref?: number }>(req);
    if (!b?.to || !validAmount(b.amount)) return err(400, 'Enter an amount between ₦1 and ₦10,000,000,000');
    if (b.to === me) return err(400, 'You can’t send money to yourself');
    if (user.guest) return err(403, 'Save your progress with Google or email to send money');
    const amount = b.amount;
    const [recipient, sender] = await Promise.all([playerByUid(env, b.to), playerByUid(env, me)]);
    if (!recipient?.username) return err(404, 'No such player');
    if (!sender?.username) return err(403, 'Pick a username first');

    // Settling a request: lock it first so it can only be paid once.
    let request: MessageRow | null = null;
    if (b.ref) {
      request = await db
        .prepare(`UPDATE messages SET status = 'paid' WHERE id = ?1 AND kind = 'request' AND status = 'open' AND to_uid = ?2 AND from_uid = ?3 AND amount = ?4 RETURNING *`)
        .bind(b.ref, me, b.to, amount)
        .first<MessageRow>();
      if (!request) return err(409, 'That request is no longer open');
    }

    // One transaction: debit sender, credit recipient, record both in the ledger, post the message.
    // Every step after the first is conditional on the sender's ledger row, which only exists if
    // they could afford it, so it all happens or none of it does.
    const tx = `tx:${crypto.randomUUID()}`;
    const note = (b.note ?? '').trim().slice(0, 140);
    // The president's transfer fee: the sender pays it on top and it goes to the treasury.
    const fee = transferFeeOf(amount, (await loadPolicy(db))?.transferFee ?? 0);
    const ok = `EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`;
    const results = await db.batch<MessageRow & { balance?: number }>([
      ensureWallet(db, me),
      ensureWallet(db, b.to),
      db
        .prepare(
          `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
           SELECT ?1, ?2, 'transfer_out', ?3, -?4, ?5 WHERE (SELECT balance FROM wallets WHERE uid = ?1) >= ?4`,
        )
        .bind(me, tx, b.to, amount + fee, now),
      db.prepare(`UPDATE wallets SET balance = balance - ?3, updated_at = ?4 WHERE uid = ?1 AND ${ok}`).bind(me, tx, amount + fee, now),
      db.prepare(`UPDATE wallets SET balance = balance + ?4, updated_at = ?5 WHERE uid = ?3 AND ${ok}`).bind(me, tx, b.to, amount, now),
      db
        .prepare(`INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) SELECT ?3, ?2, 'transfer_in', ?1, ?4, 1, ?5 WHERE ${ok}`)
        .bind(me, tx, b.to, amount, now),
      db
        .prepare(
          `INSERT INTO messages (from_uid, to_uid, kind, text, amount, status, ref, created_at)
           SELECT ?1, ?3, 'pay', ?6, ?4, 'pending', ?7, ?5 WHERE ${ok} RETURNING *`,
        )
        .bind(me, tx, b.to, amount, now, note, request?.id ?? null),
      db.prepare(`UPDATE civic_policies SET treasury = treasury + ?3 WHERE id = 1 AND ${ok}`).bind(me, tx, fee),
      db.prepare(`UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2`).bind(me, tx),
      db.prepare(`SELECT balance FROM wallets WHERE uid = ?`).bind(me),
    ]);
    const row = results[6].results[0];
    const balance = results[9].results[0].balance!;
    if (!row) {
      if (request) await db.prepare(`UPDATE messages SET status = 'open' WHERE id = ?`).bind(request.id).run();
      return err(402, fee > 0 ? `Not enough money. The transfer fee adds ₦${fee.toLocaleString('en-NG')}` : 'Not enough money');
    }

    const message = toMessage(row);
    // Paying a "Yahoo" request: the scam worked (worker/fun.ts counts it on the scammer's record).
    if (request) await db.prepare("UPDATE scams SET status = 'paid' WHERE message_id = ? AND status = 'sent'").bind(request.id).run();
    notify(env, ctx, b.to, { t: 'dm', message, from: { uid: me, username: sender.username, name: sender.name } });
    sendPush(env, ctx, b.to, { title: `💸 @${sender.username} sent you ₦${amount.toLocaleString('en-NG')}`, body: `${note ? `“${note}” · ` : ''}Open Naija City to see it.`, tag: `payment-${me}`, category: 'money', chatUid: me });
    const settled = request ? { ...toMessage(request), status: 'paid' } : null;
    if (settled) notify(env, ctx, b.to, { t: 'msg-update', message: settled });
    return json({ message, balance, request: settled, fee });
  }

  if (path === '/api/claim' && req.method === 'POST') {
    // The money is already in the wallet; claiming just acknowledges it so the game can show it.
    const claimed = await db
      .prepare(`UPDATE messages SET status = 'claimed' WHERE to_uid = ?1 AND kind = 'pay' AND status = 'pending' RETURNING *`)
      .bind(me)
      .all<MessageRow>();
    const payments = claimed.results.map(toMessage);
    const balance = await getBalance(db, me);
    if (!payments.length) return json({ payments, senders: {}, balance });
    const uids = [...new Set(payments.map((p) => p.from))];
    const { results } = await db
      .prepare(`SELECT uid, username FROM players WHERE uid IN (${uids.map(() => '?').join(',')})`)
      .bind(...uids)
      .all<{ uid: string; username: string }>();
    return json({ payments, senders: Object.fromEntries(results.map((r) => [r.uid, r.username])), balance });
  }

  return null;
}

type Home = {
  ownerUid: string;
  ownerUsername: string;
  ownerName: string | null;
  propertyId: string | null;
  /** Where the house stands and when it was finished, for the card a visitor sees. A starter house has no estate, only its city. */
  region: string | null;
  slot: number | null;
  builtAt: number | null;
  city: string;
  /** What the house runs on: the visitor's screen lights it from this. */
  supply: Supply;
  /** The owner's meter is bypassed or tampered with: a visitor can see the wire and report it. */
  meterBypassed: boolean;
  save: {
    origin: string;
    items: { id: string; type: string; x: number; z: number; rot: number; paint?: (string | null)[] }[];
    design: string | null;
    walls: string[];
    paint: { outer?: string; inner?: string };
    staff: HouseholdStaff[];
    ownedCars?: string[];
    houseStation: string | null;
  };
};

/** The house owned by `ownerUid`, as a visitor sees it. */
export async function houseOf(db: D1Database, ownerUid: string, propertyId?: string): Promise<{ home: Home } | { error: string; status: number }> {
  const row = await db
    .prepare(`SELECT s.data, p.uid, p.username, p.name FROM saves s JOIN players p ON p.uid = s.uid WHERE s.uid = ?1`)
    .bind(ownerUid)
    .first<{ data: string; uid: string; username: string; name: string | null }>();
  if (!row) return { error: 'That house cannot be visited right now', status: 404 };
  const save = JSON.parse(row.data) as {
    origin?: unknown;
    minutes?: number;
    items?: unknown;
    properties?: { id?: string; design?: string | null; staff?: HouseholdStaff[]; items?: unknown; region?: unknown; slot?: unknown; builtAt?: unknown }[];
    homeState?: unknown;
    homePropertyId?: string | null;
    activeHouseId?: string | null;
    wallEdits?: Record<string, unknown>;
    housePaint?: Record<string, unknown>;
    nepaOwed?: number;
    power?: PowerSave['power'];
    meter?: { level?: string };
    ownedCars?: unknown;
    houseStation?: unknown;
  };
  if (typeof save.origin !== 'string' || !Array.isArray(save.items)) return { error: 'That house cannot be visited right now', status: 422 };
  // With no house named, visitors go where the owner actually lives right now (the house their
  // furniture is in), not the one marked as home, which may be empty. No active house: the starter one.
  const active = save.activeHouseId ?? null;
  const target = propertyId ?? active;
  const home = target ? save.properties?.find((property) => property.id === target) : undefined;
  // The active house's furniture lives in save.items (always the freshest copy).
  // Even if the active house's property record is gone (seized, reclaimed, rewound by a failed save), its furniture is still in save.items.
  const sourceItems = !target || target === active
    ? save.items
    : Array.isArray(home?.items) ? home.items : [];
  const items = sourceItems.filter((item): item is Home['save']['items'][number] => {
    if (!item || typeof item !== 'object') return false;
    const i = item as Record<string, unknown>;
    return typeof i.id === 'string' && typeof i.type === 'string' && !!ITEMS[i.type] &&
      Number.isInteger(i.x) && (i.x as number) >= 0 && (i.x as number) < MAX_GRID_W &&
      Number.isInteger(i.z) && (i.z as number) >= 0 && (i.z as number) < MAX_GRID_H &&
      Number.isInteger(i.rot) && (i.rot as number) >= 0 && (i.rot as number) <= 3;
  }).map((item) => {
    const { paint, ...rest } = item;
    const clean = Array.isArray(paint) ? paint.slice(0, 4).map((id) => (typeof id === 'string' && PAINT_BY_ID[id] ? id : null)) : [];
    return clean.some(Boolean) ? { ...rest, paint: clean } : rest;
  });
  const wallSource = save.wallEdits?.[home?.id ?? 'starter'];
  const walls = Array.isArray(wallSource)
    ? wallSource.filter((k): k is string => typeof k === 'string' && /^[hv]:\d{1,2}:\d{1,2}$/.test(k)).slice(0, 300)
    : [];
  const paintSource = save.housePaint?.[home?.id ?? 'starter'] as Record<string, unknown> | undefined;
  const paint: { outer?: string; inner?: string } = {};
  for (const part of ['outer', 'inner'] as const) {
    const id = paintSource?.[part];
    if (typeof id === 'string' && PAINT_BY_ID[id]) paint[part] = id;
  }
  const staff = (home?.staff ?? []).filter((member) =>
    member && member.role in HOUSEHOLD_STAFF && member.paidThrough >= Math.floor((save.minutes ?? 0) / 1440),
  );
  if (normalizeOrigin(save.origin) === 'almajiri' && items.length === 0 &&
    !save.properties?.some((property) => (property as { stage?: number }).stage === STAGES.length)) {
    return { error: 'This player does not have a home yet', status: 409 };
  }
  const estate = typeof home?.region === 'string' ? REGION_BY_ID[home.region] : undefined;
  return {
    home: {
      ownerUid: row.uid,
      ownerUsername: row.username,
      ownerName: row.name,
      propertyId: home?.id ?? null,
      region: estate ? estate.id : null,
      slot: estate && Number.isInteger(home?.slot) && (home!.slot as number) >= 0 ? (home!.slot as number) : null,
      builtAt: typeof home?.builtAt === 'number' && Number.isFinite(home.builtAt) ? home.builtAt : null,
      city: estate?.city ?? getRegion(typeof save.homeState === 'string' ? save.homeState : '')?.id ?? 'kaduna',
      supply: supplyOf({ minutes: save.minutes, nepaOwed: save.nepaOwed, power: save.power }, items),
      meterBypassed: save.meter?.level === 'tamper' || save.meter?.level === 'bypass',
      save: {
        origin: normalizeOrigin(save.origin),
        items,
        design: home?.design && DESIGN_BY_ID[home.design] ? home.design : null,
        walls,
        paint,
        staff,
        ownedCars: Array.isArray(save.ownedCars)
          ? save.ownedCars.filter((id): id is string => typeof id === 'string' && !!CAR_BY_ID[id])
          : [],
        // The station on their speakers: visitors hear it too (the client only plays ids it knows)
        houseStation: typeof save.houseStation === 'string' && save.houseStation.length <= 40 ? save.houseStation : null,
      },
    },
  };
}

/** Invite `id` sent to `me`: its sender's house. */
async function loadHome(db: D1Database, id: number, me: string): Promise<{ home: Home } | { error: string; status: number }> {
  const inv = await db.prepare(`SELECT from_uid FROM messages WHERE id = ?1 AND to_uid = ?2 AND kind = 'invite' AND status = 'open'`).bind(id, me).first<{ from_uid: string }>();
  if (!inv) return { error: 'House invite expired or unavailable', status: 404 };
  return houseOf(db, inv.from_uid);
}

/** A challenge to a street game (worker/games.ts) also lands in the challenged player's messages, so it isn't lost with the toast. */
export async function sendGameChallenge(env: Env, ctx: ExecutionContext, from: string, to: string, text: string) {
  const sender = await playerByUid(env, from);
  if (!sender?.username) return;
  const row = await env.DB.prepare(
    `INSERT INTO messages (from_uid, to_uid, kind, text, created_at) VALUES (?, ?, 'text', ?, ?) RETURNING *`,
  )
    .bind(from, to, text, Date.now())
    .first<MessageRow>();
  notify(env, ctx, to, { t: 'dm', message: toMessage(row!), from: { uid: from, username: sender.username, name: sender.name } });
  sendPush(env, ctx, to, { title: `@${sender.username} challenges you`, body: 'Open Games on your phone to answer.', tag: `message-${from}`, category: 'invites', chatUid: from });
}

/** Asking someone out, or proposing (worker/hangout.ts), lands in their chat as a card they can answer. `text` says which. */
export async function sendLoveCard(env: Env, ctx: ExecutionContext, from: string, to: string, what: 'date' | 'marry') {
  const sender = await playerByUid(env, from);
  if (!sender?.username) return;
  const row = await env.DB.prepare(
    `INSERT INTO messages (from_uid, to_uid, kind, text, status, created_at) VALUES (?, ?, 'love', ?, 'open', ?) RETURNING *`,
  )
    .bind(from, to, what, Date.now())
    .first<MessageRow>();
  notify(env, ctx, to, { t: 'dm', message: toMessage(row!), from: { uid: from, username: sender.username, name: sender.name } });
  sendPush(env, ctx, to, {
    title: what === 'marry' ? `@${sender.username} proposed 💍` : `@${sender.username} asked you out 💌`,
    body: 'Open your chat to answer.',
    tag: `love-${from}`,
    category: 'invites',
    chatUid: from,
  });
}

/** The answer (or the asker thinking better of it) closes every open love card between the two. */
export async function settleLoveCards(env: Env, ctx: ExecutionContext, x: string, y: string, status: 'accepted' | 'declined') {
  const { results } = await env.DB
    .prepare(`UPDATE messages SET status = ?3 WHERE kind = 'love' AND status = 'open' AND ((from_uid = ?1 AND to_uid = ?2) OR (from_uid = ?2 AND to_uid = ?1)) RETURNING *`)
    .bind(x, y, status)
    .all<MessageRow>();
  for (const row of results) {
    const message = toMessage(row);
    notify(env, ctx, message.from, { t: 'msg-update', message });
    notify(env, ctx, message.to, { t: 'msg-update', message });
  }
}

async function send(
  env: Env,
  ctx: ExecutionContext,
  from: string,
  to: string,
  m: { kind: Message['kind']; text: string; amount?: number; status?: string; ref?: number | null },
): Promise<Response> {
  if (to === from) return err(400, 'That’s you!');
  const [recipient, sender] = await Promise.all([playerByUid(env, to), playerByUid(env, from)]);
  if (!recipient?.username) return err(404, 'No such player');
  if (!sender?.username) return err(403, 'Pick a username first');
  const row = await env.DB.prepare(
    `INSERT INTO messages (from_uid, to_uid, kind, text, amount, status, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(from, to, m.kind, m.text, m.amount ?? null, m.status ?? null, m.ref ?? null, Date.now())
    .first<MessageRow>();
  const message = toMessage(row!);
  notify(env, ctx, to, { t: 'dm', message, from: { uid: from, username: sender.username, name: sender.name } });
  // A reply to someone who texted you first makes you friends; both sides hear about it.
  if (m.kind === 'text' && (await befriendOnReply(env.DB, from, to))) {
    notify(env, ctx, from, { t: 'friend', uid: to, username: recipient.username });
    notify(env, ctx, to, { t: 'friend', uid: from, username: sender.username });
    sendPush(env, ctx, to, { title: 'New friend', body: `You and @${sender.username} are now friends.`, tag: 'friend', category: 'messages', chatUid: from });
  }
  if (m.kind === 'text') {
    sendPush(env, ctx, to, {
      title: `Message from @${sender.username}`,
      body: 'Tap to open your chat.',
      tag: `message-${from}`,
      category: 'messages',
      chatUid: from,
    });
  }
  if (m.kind === 'invite' || m.kind === 'visit') {
    sendPush(env, ctx, to, {
      title: m.kind === 'invite' ? 'House invitation' : 'House visit request',
      body: m.kind === 'invite' ? 'Someone invited you to visit their house.' : 'Someone asked to visit your house.',
      tag: `house-${m.kind}`,
      category: 'invites',
      chatUid: from,
    });
  }
  return json({ message });
}
