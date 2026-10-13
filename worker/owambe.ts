// Player-hosted owambes and spraying money on real players (rules in src/game/owambe.ts).
//
// Anyone at a city's square (Murtala Square in Kaduna, Eagle Square in Abuja) can spray another player
// standing there: the money moves wallet to wallet. A player can also book the square of the city they are
// in for their own party (one at a time in each city, for a fee); sprays on the host
// during it count towards the party's spray board, and the feed announces the total when it ends.

import type { FirebaseUser } from './auth';
import { applyStmts, getBalance } from './wallet';
import { jailedUntil, transfer, usernames } from './crime';
import { handle, naira, postFeed } from './feed';
import { PARTY, PARTY_KINDS, squareCity, squareName, type Party, type PartyKind } from '../src/game/owambe';
import { getRegion } from '../src/game/regions';
import { sendPush } from './push';
import { notifyPlayer, whereIs } from './shards';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}

interface OwambeRow {
  id: number;
  host_uid: string;
  kind: PartyKind;
  title: string;
  city: string;
  starts_at: number;
  ends_at: number;
  sprayed: number;
  wrapped: number;
}

/** The party on at that city's square. */
const live = (db: D1Database, now: number, city: string) =>
  db.prepare('SELECT * FROM owambes WHERE ends_at > ? AND city = ? ORDER BY id DESC LIMIT 1').bind(now, city).first<OwambeRow>();
/** A city that exists; anything else is Kaduna. */
const cityOf = (id: unknown) => getRegion(typeof id === 'string' ? id : '')?.id ?? 'kaduna';

async function toParty(db: D1Database, row: OwambeRow, me: string): Promise<Party> {
  const [{ results: top }, mine, names] = await Promise.all([
    db
      .prepare(
        `SELECT p.username, g.sprayed AS amount FROM owambe_guests g JOIN players p ON p.uid = g.uid
         WHERE g.owambe_id = ? AND g.sprayed > 0 ORDER BY g.sprayed DESC LIMIT 5`,
      )
      .bind(row.id)
      .all<{ username: string | null; amount: number }>(),
    db.prepare('SELECT invited FROM owambe_guests WHERE owambe_id = ? AND uid = ?').bind(row.id, me).first<{ invited: number }>(),
    usernames(db, [row.host_uid]),
  ]);
  return {
    id: row.id, kind: row.kind, title: row.title, city: row.city, endsAt: row.ends_at, sprayed: row.sprayed,
    host: { uid: row.host_uid, username: names.get(row.host_uid) ?? 'someone' },
    top: top.map((t) => ({ username: t.username ?? 'someone', amount: t.amount })),
    invited: row.host_uid === me || !!mine?.invited,
    isHost: row.host_uid === me,
  };
}

/** Announce every party that has ended (once each). Runs whenever someone looks. */
async function wrapUp(db: D1Database, now: number) {
  const { results } = await db
    .prepare('UPDATE owambes SET wrapped = 1 WHERE ends_at <= ? AND wrapped = 0 RETURNING *')
    .bind(now)
    .all<OwambeRow>();
  for (const row of results) {
    const top = await db
      .prepare(
        `SELECT p.username, g.sprayed FROM owambe_guests g JOIN players p ON p.uid = g.uid
         WHERE g.owambe_id = ? AND g.sprayed > 0 ORDER BY g.sprayed DESC LIMIT 1`,
      )
      .bind(row.id)
      .first<{ username: string | null; sprayed: number }>();
    await postFeed(
      db, row.host_uid, 'owambe', PARTY_KINDS[row.kind].icon,
      row.sprayed > 0
        ? `${row.title} is over! Guests sprayed ${naira(row.sprayed)}${top ? `, and ${handle(top.username)} was the biggest spender with ${naira(top.sprayed)}` : ''}. 💃🏾💸`
        : `${row.title} is over. The DJ played to an empty square and nobody sprayed a kobo. 😭`,
    );
  }
}

export async function handleOwambe(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/owambe')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  if (path === '/api/owambe' && req.method === 'GET') {
    await wrapUp(db, now);
    const [row, last] = await Promise.all([
      live(db, now, cityOf(new URL(req.url).searchParams.get('city'))),
      db.prepare('SELECT MAX(starts_at) AS at FROM owambes WHERE host_uid = ?').bind(me).first<{ at: number | null }>(),
    ]);
    return json({ party: row ? await toParty(db, row, me) : null, hostReadyAt: last?.at ? last.at + PARTY.hostCooldownMs : 0 });
  }

  const b = (await req.json().catch(() => null)) as { kind?: string; to?: string; amount?: number; city?: string } | null;
  const self = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();
  if (!self?.username) return err(403, 'Pick a username first');

  if (path === '/api/owambe/host' && req.method === 'POST') {
    const kind = b?.kind && b.kind in PARTY_KINDS ? (b.kind as PartyKind) : null;
    if (!kind) return err(400, 'Pick what you’re celebrating');
    const city = cityOf(b?.city);
    const square = squareName(city);
    if (await jailedUntil(db, me)) return err(403, 'You can’t throw a party from a police cell');
    const last = await db.prepare('SELECT MAX(starts_at) AS at FROM owambes WHERE host_uid = ?').bind(me).first<{ at: number | null }>();
    if (last?.at && now - last.at < PARTY.hostCooldownMs) return err(429, 'You threw a party not long ago. Let the city recover');
    if ((await getBalance(db, me)) < PARTY.fee) return err(402, `Booking ${square} costs ${naira(PARTY.fee)}`);
    // Book the square first (only if it's free), then pay; undo the booking if the money isn't there.
    const title = PARTY_KINDS[kind].title(self.username);
    const row = await db
      .prepare(
        `INSERT INTO owambes (host_uid, kind, title, starts_at, ends_at, city)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE NOT EXISTS (SELECT 1 FROM owambes WHERE ends_at > ?4 AND city = ?6) RETURNING *`,
      )
      .bind(me, kind, title, now, now + PARTY.durationMs, city)
      .first<OwambeRow>();
    if (!row) {
      const busy = await live(db, now, city);
      return err(409, busy ? `${square} is booked for ${busy.title} right now. Go and spray them!` : `${square} is booked`);
    }
    const paid = await transfer(db, me, null, PARTY.fee, 'owambe_fee', '', `owambe:${row.id}`);
    if (paid < PARTY.fee) {
      await db.prepare('DELETE FROM owambes WHERE id = ?').bind(row.id).run();
      if (paid > 0) await db.batch(applyStmts(db, me, `owambe-refund:${row.id}`, 'refund', 'owambe', paid));
      return err(402, 'Not enough money');
    }
    await db.prepare('INSERT INTO owambe_guests (owambe_id, uid, invited) VALUES (?, ?, 1)').bind(row.id, me).run();
    await postFeed(
      db, me, 'owambe', PARTY_KINDS[kind].icon,
      `🎊 ${title} is ON at ${square}! DJ dey, jollof dey, aso-ebi dey. Come and spray before it ends in ${Math.round(PARTY.durationMs / 60_000)} minutes. 💃🏾🕺🏾`,
    );
    return json({ party: await toParty(db, row, me), balance: await getBalance(db, me) });
  }

  if (path === '/api/owambe/invite' && req.method === 'POST') {
    const row = await db.prepare('SELECT * FROM owambes WHERE ends_at > ? AND host_uid = ? ORDER BY id DESC LIMIT 1').bind(now, me).first<OwambeRow>();
    if (!row) return err(403, 'Only the celebrant can send invites');
    if (typeof b?.to !== 'string' || b.to === me) return err(400, 'Pick a guest');
    const guest = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(b.to).first<{ username: string | null }>();
    if (!guest?.username) return err(404, 'No such player');
    const count = await db.prepare('SELECT COUNT(*) AS n FROM owambe_guests WHERE owambe_id = ? AND invited = 1').bind(row.id).first<{ n: number }>();
    if ((count?.n ?? 0) > PARTY.maxInvites) return err(429, 'The guest list is full');
    await db
      .prepare('INSERT INTO owambe_guests (owambe_id, uid, invited) VALUES (?1, ?2, 1) ON CONFLICT(owambe_id, uid) DO UPDATE SET invited = 1')
      .bind(row.id, b.to)
      .run();
    notify(env, ctx, b.to, { t: 'fun', kind: 'owambeInvite', host: self.username, title: row.title, endsAt: row.ends_at, square: squareName(row.city) });
    sendPush(env, ctx, b.to, { title: 'Owambe invitation', body: `You’ve been invited to a party at ${squareName(row.city)}.`, tag: 'owambe-invite', category: 'invites' });
    return json({ ok: true });
  }

  if (path === '/api/owambe/spray' && req.method === 'POST') {
    const amount = b?.amount;
    const to = b?.to;
    if (!PARTY.sprays.includes(amount as (typeof PARTY.sprays)[number])) return err(400, 'Pick how much to spray');
    if (typeof to !== 'string' || to === me) return err(400, 'Pick someone to spray');
    const target = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(to).first<{ username: string | null }>();
    if (!target?.username) return err(404, 'No such player');
    const [here, there] = await Promise.all([whereIs(env, me), whereIs(env, to)]);
    const city = squareCity(here);
    if (!city) return err(409, 'Get to the square first');
    if (squareCity(there) !== city) return err(409, `@${target.username} isn’t at the party`);
    if ((await getBalance(db, me)) < amount!) return err(402, 'Not enough money');
    const paid = await transfer(db, me, to, amount!, 'spray_out', 'spray_in', `spray:${to}`);
    if (paid <= 0) return err(402, 'Not enough money');

    // Sprays on the celebrant go on the party's board.
    const party = await live(db, now, city);
    const onHost = party?.host_uid === to;
    if (party && onHost) {
      await db.batch([
        db.prepare('UPDATE owambes SET sprayed = sprayed + ? WHERE id = ?').bind(paid, party.id),
        db
          .prepare('INSERT INTO owambe_guests (owambe_id, uid, sprayed) VALUES (?1, ?2, ?3) ON CONFLICT(owambe_id, uid) DO UPDATE SET sprayed = sprayed + ?3')
          .bind(party.id, me, paid),
      ]);
    }
    notify(env, ctx, to, { t: 'fun', kind: 'sprayed', by: self.username, amount: paid, party: onHost ? party!.title : null });
    if (paid >= PARTY.headline) {
      await postFeed(
        db, me, 'owambe', '💸',
        `${handle(self.username)} just emptied ${naira(paid)} on ${handle(target.username)}’s head at ${onHost ? party!.title : squareName(city)}. The DJ shouted their name three times! 📣`,
      );
    }
    return json({ amount: paid, balance: await getBalance(db, me), party: party ? await toParty(db, party, me) : null });
  }

  return null;
}
