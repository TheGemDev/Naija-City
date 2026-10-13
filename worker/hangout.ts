// Group hangouts (host one, your friends join, everyone is paid if enough turn up) and love
// (dating, an engagement ring, marriage). Rules in src/game/hangout.ts.
//
// Hangouts settle lazily the next time anyone looks after they end. Money is capped per player per
// real day and paid through the wallet ledger with a per-hangout client id.

import { roomOf } from './shards';
import { sendLoveCard, settleLoveCards } from './social';
import type { FirebaseUser } from './auth';
import { handle, naira, postFeed } from './feed';
import { usernames } from './crime';
import { applyStmts, ensureWallet, getBalance, treasuryStmts } from './wallet';
import { DAY_MS, seasonKey } from '../src/game/community';
import { HANGOUT, HANGOUTS, HANGOUT_BY_ID, LOVE, cheatWipeCost, hangoutReward, type CheatRecord, type HangoutKind, type HangoutScope } from '../src/game/hangout';
import { liveEvent } from '../src/game/live';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const body = async <T>(req: Request) => (await req.json().catch(() => null)) as T | null;
const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

interface HangoutRow {
  id: number; host_uid: string; kind: HangoutKind; scope: HangoutScope; crew_id: number | null; title: string;
  starts_at: number; ends_at: number; settled: number; partner_uid: string | null;
}
interface CoupleRow {
  a: string; b: string; asker: string; status: 'asked_date' | 'dating' | 'asked_marry' | 'married';
  since: number; dating_since: number | null; bond: number; last_night: number;
}

/** Every relationship (pending ones too) a player is in. */
const loversOf = async (db: D1Database, uid: string) =>
  (await db.prepare('SELECT * FROM lovers WHERE a = ?1 OR b = ?1 ORDER BY COALESCE(dating_since, since)').bind(uid).all<CoupleRow>()).results;
const coupleWith = (db: D1Database, x: string, y: string) => {
  const [a, b] = pair(x, y);
  return db.prepare('SELECT * FROM lovers WHERE a = ? AND b = ?').bind(a, b).first<CoupleRow>();
};
const partnerOf = (c: CoupleRow, uid: string) => (c.a === uid ? c.b : c.a);
const isActive = (c: CoupleRow) => c.status === 'dating' || c.status === 'married' || c.status === 'asked_marry';
const isMarried = async (db: D1Database, uid: string) =>
  !!(await db.prepare("SELECT 1 AS x FROM lovers WHERE status = 'married' AND (a = ?1 OR b = ?1)").bind(uid).first());

/**
 * `cheater` just took on (or spent a night with) `withUid`. Each of their other partners may find out:
 * a dating partner walks out, a spouse loses bond. Returns who found out.
 */
async function rollCaught(db: D1Database, cheater: string, withUid: string, chance: number, now: number): Promise<string[]> {
  const others = (await loversOf(db, cheater)).filter((c) => isActive(c) && partnerOf(c, cheater) !== withUid);
  const caught: string[] = [];
  for (const c of others) {
    const found = Math.random() < chance;
    // Every cheat goes on the record (the Family app's cheaters search), found out or not.
    await db.prepare('INSERT INTO cheats (cheater_uid, partner_uid, with_uid, caught, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(cheater, partnerOf(c, cheater), withUid, found ? 1 : 0, now).run().catch(() => {});
    if (!found) continue;
    const victim = partnerOf(c, cheater);
    const names = await usernames(db, [cheater, victim, withUid]);
    if (c.status === 'married') {
      await db.prepare('UPDATE lovers SET bond = MAX(0, bond - ?) WHERE a = ? AND b = ?').bind(LOVE.caughtBond, c.a, c.b).run();
      await postFeed(db, victim, 'love', '🔥', `${handle(names.get(victim))} caught ${handle(names.get(cheater))} cheating with ${handle(names.get(withUid))}. Wahala!`);
    } else {
      await db.prepare('DELETE FROM lovers WHERE a = ? AND b = ?').bind(c.a, c.b).run();
      await postFeed(db, victim, 'love', '💔', `${handle(names.get(victim))} caught ${handle(names.get(cheater))} with ${handle(names.get(withUid))} and walked out.`);
    }
    caught.push(names.get(victim) ?? 'someone');
  }
  return caught;
}


const areFriends = async (db: D1Database, x: string, y: string) => {
  const [a, b] = pair(x, y);
  return !!(await db.prepare("SELECT 1 AS ok FROM friendships WHERE a = ? AND b = ? AND status = 'accepted'").bind(a, b).first());
};

/* ---------- Settlement ---------- */

async function earnedToday(db: D1Database, uid: string, now: number) {
  const row = await db
    .prepare("SELECT SUM(amount) AS n FROM ledger WHERE uid = ? AND kind = 'hangout' AND amount > 0 AND created_at >= ?")
    .bind(uid, Math.floor(now / DAY_MS) * DAY_MS)
    .first<{ n: number | null }>();
  return row?.n ?? 0;
}

export async function settleHangouts(db: D1Database, now: number) {
  const { results: due } = await db
    .prepare('SELECT * FROM hangouts WHERE settled = 0 AND ends_at <= ? ORDER BY ends_at LIMIT 10')
    .bind(now)
    .all<HangoutRow>();
  for (const h of due) {
    const claimed = await db.prepare('UPDATE hangouts SET settled = 1 WHERE id = ? AND settled = 0').bind(h.id).run();
    if (!claimed.meta.changes) continue;
    const def = HANGOUT_BY_ID[h.kind];
    const { results: guests } = await db.prepare('SELECT uid FROM hangout_guests WHERE hangout_id = ?').bind(h.id).all<{ uid: string }>();
    const uids = guests.map((g) => g.uid);
    if (uids.length < def.min) continue;

    const stmts: D1PreparedStatement[] = [];
    const married = new Set<string>();
    const couples: CoupleRow[] = [];
    if (h.kind === 'date') {
      const c = h.partner_uid ? await coupleWith(db, h.host_uid, h.partner_uid) : null;
      if (c && isActive(c) && uids.includes(h.host_uid) && uids.includes(h.partner_uid!)) couples.push(c);
    } else {
      for (const u of uids) {
        for (const c of await loversOf(db, u)) {
          if (!isActive(c) || !uids.includes(partnerOf(c, u))) continue;
          if (c.status === 'married') married.add(u);
          if (u === c.a) couples.push(c);
        }
      }
    }
    for (const u of uids) {
      if (h.kind === 'date') continue;
      const room = HANGOUT.dailyCap - (await earnedToday(db, u, now));
      const pay = Math.min(hangoutReward(uids.length, married.has(u)), Math.max(0, room));
      stmts.push(ensureWallet(db, u));
      if (pay > 0) stmts.push(...applyStmts(db, u, `hangout:${h.id}:${u}`, 'hangout', h.kind, pay));
      stmts.push(
        db
          .prepare('INSERT INTO season_points (season, uid, points) VALUES (?1, ?2, ?3) ON CONFLICT(season, uid) DO UPDATE SET points = points + ?3')
          .bind(seasonKey(now), u, HANGOUT.points),
      );
    }
    for (const c of couples) {
      stmts.push(db.prepare('UPDATE lovers SET bond = bond + ? WHERE a = ? AND b = ?').bind(h.kind === 'date' ? HANGOUT.bondDate : HANGOUT.bondShared, c.a, c.b));
    }
    if (stmts.length) await db.batch(stmts);
    if (h.kind !== 'date') {
      const host = (await usernames(db, [h.host_uid])).get(h.host_uid);
      await postFeed(db, h.host_uid, 'hangout', def.icon, `${handle(host)} hosted ${def.label.toLowerCase()} with ${uids.length} people. Friends who show up win.`);
    }
  }
}

async function visibleHangouts(db: D1Database, me: string, now: number): Promise<HangoutRow[]> {
  const { results } = await db
    .prepare(
      `SELECT h.* FROM hangouts h WHERE h.ends_at > ?1 AND (
         h.host_uid = ?2
         OR EXISTS (SELECT 1 FROM hangout_guests g WHERE g.hangout_id = h.id AND g.uid = ?2)
         OR (h.kind != 'date' AND h.scope = 'friends' AND EXISTS (
              SELECT 1 FROM friendships f WHERE f.status = 'accepted'
              AND f.a = MIN(h.host_uid, ?2) AND f.b = MAX(h.host_uid, ?2)))
         OR (h.kind = 'date' AND h.partner_uid = ?2)
       ) ORDER BY h.ends_at LIMIT 20`,
    )
    .bind(now, me)
    .all<HangoutRow>();
  return results;
}

/* ---------- Cheaters list ---------- */

interface CheatRow { id: number; cheater_uid: string; partner_uid: string; with_uid: string; caught: number; created_at: number }

/** Records that haven't been paid off. uid: one player's; null: everyone's latest. */
async function cheatRecords(db: D1Database, uid: string | null, limit: number): Promise<CheatRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT c.* FROM cheats c LEFT JOIN cheat_wipes w ON w.uid = c.cheater_uid
       WHERE (?1 IS NULL OR c.cheater_uid = ?1) AND (w.wiped_at IS NULL OR c.created_at > w.wiped_at)
       ORDER BY c.created_at DESC LIMIT ?2`,
    )
    .bind(uid, limit)
    .all<CheatRow>();
  const names = await usernames(db, results.flatMap((r) => [r.cheater_uid, r.partner_uid, r.with_uid]));
  return results.map((r) => ({
    id: r.id, cheater: names.get(r.cheater_uid) ?? 'someone', partner: names.get(r.partner_uid) ?? 'someone',
    with: names.get(r.with_uid) ?? 'someone', caught: !!r.caught, at: r.created_at,
  }));
}

const wipesOf = async (db: D1Database, uid: string) =>
  (await db.prepare('SELECT times FROM cheat_wipes WHERE uid = ?').bind(uid).first<{ times: number }>())?.times ?? 0;

/* ---------- Router ---------- */

export async function handleHangout(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/hangouts') && !path.startsWith('/api/love')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();
  const post = req.method === 'POST';

  if (path === '/api/hangouts' && req.method === 'GET') {
    await settleHangouts(db, now);
    const rows = await visibleHangouts(db, me, now);
    const ids = rows.map((r) => r.id);
    const guests = ids.length
      ? (await db.prepare(`SELECT hangout_id, uid FROM hangout_guests WHERE hangout_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ hangout_id: number; uid: string }>()).results
      : [];
    const names = await usernames(db, [...rows.map((r) => r.host_uid), ...guests.map((g) => g.uid)]);
    const ev = liveEvent(now);
    return json({
      hangouts: rows.map((r) => {
        const gs = guests.filter((g) => g.hangout_id === r.id);
        return {
          id: r.id, kind: r.kind, scope: r.scope, title: r.title, endsAt: r.ends_at,
          host: { uid: r.host_uid, username: names.get(r.host_uid) ?? 'someone' },
          guests: gs.map((g) => names.get(g.uid) ?? 'someone'),
          joined: gs.some((g) => g.uid === me),
          need: HANGOUT_BY_ID[r.kind].min, max: HANGOUT_BY_ID[r.kind].max,
        };
      }),
      finalLive: ev.active && ev.def.id === 'final',
      earnedToday: await earnedToday(db, me, now),
      dailyCap: HANGOUT.dailyCap,
    });
  }

  if (path === '/api/hangouts/host' && post) {
    const b = await body<{ kind?: string; scope?: string; partner?: string }>(req);
    const def = HANGOUTS.find((h) => h.id === b?.kind);
    if (!def) return err(400, 'Unknown hangout');
    const scope: HangoutScope = 'friends';
    if (def.needsFinal) {
      const ev = liveEvent(now);
      if (!(ev.active && ev.def.id === 'final')) return err(409, 'Match night only happens while the cup final is on');
    }
    const last = await db.prepare('SELECT MAX(starts_at) AS t FROM hangouts WHERE host_uid = ?').bind(me).first<{ t: number | null }>();
    if (last?.t && last.t + HANGOUT.hostCooldownMs > now) return err(429, 'Give it a bit before hosting again');
    let partnerUid: string | null = null;
    if (def.couples) {
      const c = b?.partner ? await coupleWith(db, me, b.partner) : null;
      if (!c || !['dating', 'married'].includes(c.status)) return err(409, 'Pick a partner for date night');
      partnerUid = partnerOf(c, me);
    }
    const open = await db.prepare('SELECT 1 AS x FROM hangouts WHERE host_uid = ? AND ends_at > ?').bind(me, now).first();
    if (open) return err(409, 'You are already hosting one');
    const name = (await usernames(db, [me])).get(me) ?? 'someone';
    const made = await db
      .prepare('INSERT INTO hangouts (host_uid, kind, scope, crew_id, title, starts_at, ends_at, partner_uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(me, def.id, def.couples ? 'friends' : scope, null, `@${name}’s ${def.label.toLowerCase()}`, now, now + HANGOUT.durationMs, partnerUid)
      .first<{ id: number }>();
    await db.prepare('INSERT INTO hangout_guests (hangout_id, uid, joined_at) VALUES (?, ?, ?)').bind(made!.id, me, now).run();
    return json({ ok: true, id: made!.id });
  }

  if (path === '/api/hangouts/join' && post) {
    const b = await body<{ id?: number }>(req);
    const h = b?.id ? await db.prepare('SELECT * FROM hangouts WHERE id = ?').bind(b.id).first<HangoutRow>() : null;
    if (!h || h.ends_at <= now) return err(404, 'That hangout is over');
    if (!(await visibleHangouts(db, me, now)).some((v) => v.id === h.id)) return err(403, 'Not your crowd');
    const def = HANGOUT_BY_ID[h.kind];
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM hangout_guests WHERE hangout_id = ?').bind(h.id).first<{ n: number }>())?.n ?? 0;
    if (n >= def.max) return err(409, 'It is full');
    await db.prepare('INSERT OR IGNORE INTO hangout_guests (hangout_id, uid, joined_at) VALUES (?, ?, ?)').bind(h.id, me, now).run();
    return json({ ok: true });
  }

  if (path === '/api/hangouts/leave' && post) {
    const b = await body<{ id?: number }>(req);
    await db.prepare('DELETE FROM hangout_guests WHERE hangout_id = ? AND uid = ? AND uid != (SELECT host_uid FROM hangouts WHERE id = ?1)').bind(b?.id, me).run().catch(() => {});
    return json({ ok: true });
  }

  /* ---------- Love ---------- */

  if (path === '/api/love' && req.method === 'GET') {
    const rows = await loversOf(db, me);
    const names = await usernames(db, rows.map((c) => partnerOf(c, me)));
    // The babe is the spouse, or whoever you have been dating longest. Everyone else is a side.
    const active = rows.filter((c) => c.status === 'dating' || c.status === 'married' || c.status === 'asked_marry');
    const babe = active.find((c) => c.status === 'married') ?? active[0];
    return json({
      lovers: rows.map((c) => {
        const other = partnerOf(c, me);
        return {
          uid: other, username: names.get(other) ?? 'someone', status: c.status, mine: c.asker === me,
          since: c.since, bond: c.bond, side: isActive(c) && c !== babe,
          canPropose: c.status === 'dating' && now - (c.dating_since ?? now) >= LOVE.datingMs && c.bond >= LOVE.bondToMarry,
          datingFor: c.dating_since ? now - c.dating_since : 0,
          nightIn: Math.max(0, c.last_night + LOVE.nightCooldownMs - now),
        };
      }),
      rules: { ring: LOVE.ringCost, bondToMarry: LOVE.bondToMarry, datingMs: LOVE.datingMs, divorce: LOVE.divorceCost, max: LOVE.maxPartners },
    });
  }

  /** The cheaters list: the latest cheats in town, and what it costs me to clear my own name. */
  if (path === '/api/love/cheaters' && req.method === 'GET') {
    const [recent, mine, times] = await Promise.all([cheatRecords(db, null, 15), cheatRecords(db, me, 50), wipesOf(db, me)]);
    return json({ recent, mine: mine.length, wipeCost: cheatWipeCost(times) });
  }

  /** Is your man (or woman) a cheater? Search anyone by username. */
  if (path === '/api/love/cheaters/search' && req.method === 'GET') {
    const name = (new URL(req.url).searchParams.get('u') ?? '').trim().toLowerCase().replace(/^@/, '');
    const target = name ? await db.prepare('SELECT uid, username FROM players WHERE username = ?').bind(name).first<{ uid: string; username: string }>() : null;
    if (!target) return err(404, 'No player with that name');
    return json({ username: target.username, records: await cheatRecords(db, target.uid, 20) });
  }

  /** Pay (a lot) to have your cheating record cleared. New cheating after this shows up again. */
  if (path === '/api/love/cheaters/wipe' && post) {
    const times = await wipesOf(db, me);
    const cost = cheatWipeCost(times);
    if (!(await cheatRecords(db, me, 1)).length) return err(409, 'Your record is already clean');
    if ((await getBalance(db, me)) < cost) return err(402, `Clearing your name costs ${naira(cost)}`);
    await db.batch([
      ensureWallet(db, me),
      ...applyStmts(db, me, `cheat-wipe:${me}:${times + 1}`, 'spend', 'cheat_wipe', -cost),
      db.prepare('INSERT INTO cheat_wipes (uid, wiped_at, times) VALUES (?1, ?2, 1) ON CONFLICT(uid) DO UPDATE SET wiped_at = ?2, times = times + 1')
        .bind(me, now),
    ]);
    return json({ ok: true, balance: await getBalance(db, me), wipeCost: cheatWipeCost(times + 1) });
  }

  if (path === '/api/love/ask' && post) {
    const b = await body<{ username?: string; uid?: string }>(req);
    const target = b?.uid
      ? await db.prepare('SELECT uid FROM players WHERE uid = ?').bind(b.uid).first<{ uid: string }>()
      : await db.prepare('SELECT uid FROM players WHERE username = ?').bind((b?.username ?? '').trim().toLowerCase().replace(/^@/, '')).first<{ uid: string }>();
    if (!target || target.uid === me) return err(404, 'No player with that name');
    if (!(await areFriends(db, me, target.uid))) return err(403, 'Become friends first');
    if (await coupleWith(db, me, target.uid)) return err(409, 'You two already have something going');
    if ((await loversOf(db, me)).length >= LOVE.maxPartners) return err(409, `You can only handle ${LOVE.maxPartners} at a time`);
    if ((await loversOf(db, target.uid)).length >= LOVE.maxPartners) return err(409, 'They have their hands full');
    const [a, c] = pair(me, target.uid);
    await db.prepare("INSERT INTO lovers (a, b, asker, status, since) VALUES (?, ?, ?, 'asked_date', ?)").bind(a, c, me, now).run();
    await sendLoveCard(env, ctx, me, target.uid, 'date');
    return json({ ok: true });
  }

  const lb = path.startsWith('/api/love/') && post ? await body<{ uid?: string }>(req) : null;
  const other = lb?.uid ?? '';
  const c = other ? await coupleWith(db, me, other) : null;
  if (!c) return err(404, 'No relationship with them');

  if (path === '/api/love/accept' && post) {
    if (c.asker === me) return err(409, 'Wait for them to answer');
    const names = await usernames(db, [me, other]);
    if (c.status === 'asked_date') {
      await db.prepare("UPDATE lovers SET status = 'dating', dating_since = ?, since = ? WHERE a = ? AND b = ?").bind(now, now, c.a, c.b).run();
      await settleLoveCards(env, ctx, me, other, 'accepted');
      await postFeed(db, me, 'love', '💕', `${handle(names.get(other))} and ${handle(names.get(me))} are now dating.`);
      // Anyone who already had someone risks being found out by them.
      const caught = [...(await rollCaught(db, me, other, LOVE.caughtChance, now)), ...(await rollCaught(db, other, me, LOVE.caughtChance, now))];
      return json({ ok: true, status: 'dating', caught });
    }
    if (c.status === 'asked_marry') {
      if ((await isMarried(db, me)) || (await isMarried(db, other))) return err(409, 'One of you is already married');
      await db.prepare("UPDATE lovers SET status = 'married', since = ? WHERE a = ? AND b = ?").bind(now, c.a, c.b).run();
      await settleLoveCards(env, ctx, me, other, 'accepted');
      await postFeed(db, me, 'love', '💍', `${handle(names.get(other))} and ${handle(names.get(me))} just got married! Congratulations!`);
      return json({ ok: true, status: 'married' });
    }
    return err(409, 'Nothing to accept');
  }

  if (path === '/api/love/propose' && post) {
    if (c.status !== 'dating') return err(409, 'You need to be dating first');
    if ((await isMarried(db, me)) || (await isMarried(db, other))) return err(409, 'One of you is already married');
    if (now - (c.dating_since ?? now) < LOVE.datingMs) return err(409, 'Date a little longer before you propose');
    if (c.bond < LOVE.bondToMarry) return err(409, `Build your bond first (${c.bond}/${LOVE.bondToMarry}). Go on date nights`);
    if ((await getBalance(db, me)) < LOVE.ringCost) return err(402, `The ring costs ${naira(LOVE.ringCost)}`);
    const res = await db.prepare("UPDATE lovers SET status = 'asked_marry', asker = ? WHERE a = ? AND b = ? AND status = 'dating'").bind(me, c.a, c.b).run();
    if (!res.meta.changes) return err(409, 'Busy, try again');
    await db.batch([ensureWallet(db, me), ...applyStmts(db, me, `ring:${c.a}:${c.b}:${now}`, 'spend', 'ring', -LOVE.ringCost)]);
    await sendLoveCard(env, ctx, me, other, 'marry');
    return json({ ok: true, balance: await getBalance(db, me) });
  }

  /** Spend the night together (fade to black). Bond grows; your other partners may hear about it. */
  if (path === '/api/love/night' && post) {
    if (c.status !== 'dating' && c.status !== 'married') return err(409, 'You are not together yet');
    // Only at home: your partner has to be inside your house (or you inside theirs) as an invited guest.
    const together = (await (await roomOf(env, other)).homeAccess(other, me)) === 'invited' || (await (await roomOf(env, me)).homeAccess(me, other)) === 'invited';
    if (!together) return err(409, 'Your partner has to be at your house first. Invite them over 🏠');
    if (c.last_night + LOVE.nightCooldownMs > now) return err(429, 'Give it a while before the next one');
    await db.prepare('UPDATE lovers SET bond = bond + ?, last_night = ? WHERE a = ? AND b = ?').bind(LOVE.nightBond, now, c.a, c.b).run();
    const caught = await rollCaught(db, me, other, LOVE.caughtNightChance, now);
    return json({ ok: true, bond: c.bond + LOVE.nightBond, caught });
  }

  /** Decline a request, call off an engagement (ring refunded), or break up / divorce. */
  if (path === '/api/love/end' && post) {
    if (c.status === 'asked_date') {
      await db.prepare('DELETE FROM lovers WHERE a = ? AND b = ?').bind(c.a, c.b).run();
      await settleLoveCards(env, ctx, me, other, 'declined');
      return json({ ok: true });
    }
    if (c.status === 'asked_marry') {
      await db.prepare("UPDATE lovers SET status = 'dating', asker = ? WHERE a = ? AND b = ?").bind(me, c.a, c.b).run();
      await db.batch([ensureWallet(db, c.asker), ...applyStmts(db, c.asker, `ring-refund:${c.a}:${c.b}:${now}`, 'refund', 'ring', LOVE.ringCost)]);
      await settleLoveCards(env, ctx, me, other, 'declined');
      return json({ ok: true });
    }
    if (c.status === 'married') {
      if ((await getBalance(db, me)) < LOVE.divorceCost) return err(402, `A divorce costs ${naira(LOVE.divorceCost)}`);
      await db.batch([ensureWallet(db, me), ...treasuryStmts(db, me, `divorce:${c.a}:${c.b}:${now}`, 'spend', 'divorce', LOVE.divorceCost)]);
      const names = await usernames(db, [me, other]);
      await postFeed(db, me, 'love', '💔', `${handle(names.get(me))} and ${handle(names.get(other))} have divorced.`);
    }
    await db.prepare('DELETE FROM lovers WHERE a = ? AND b = ?').bind(c.a, c.b).run();
    return json({ ok: true });
  }

  return err(404, 'Not found');
}
