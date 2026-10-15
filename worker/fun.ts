// The live city: cup-final bets, the Kaduna Gist feed, "Yahoo" scams, and the underworld (the crime
// ladder and motor parks run by godfathers). Everything that moves money is decided here, server side.

import type { FirebaseUser } from './auth';
import { applyStmts, getBalance } from './wallet';
import { jailedUntil, jailStmt, loadLaws, rand, transfer, usePerk, usernames } from './crime';
import { FEED_KEEP_MS, feedStmt, handle, naira, postFeed, tweetCountStmt } from './feed';
import { searchPhone } from './phoneSearch';
import { BET_WINDOW_MS, FINAL_ODDS, FINAL_TEAMS, LIVE_DURATION_MS, MAX_STAKE, liveEvent, slotStart, type FinalPick } from '../src/game/live';
import { BABA_PERKS, FAKE_PERK_CHANCE, MUGU_BY_ID, MUGU_PREFIX, PERK_BY_ID, SCAM_BY_ID, SCAM_RULES, muguChance } from '../src/game/scams';
import { ACHIEVEMENT_BY_ID } from '../src/game/legacy';
import { CRIME_POINTS, PARK_BY_ID, PARK_RULES, PARKS, crimeTier, tierIndex } from '../src/game/underworld';
import { regionPlace } from '../src/game/regions';
import { drawVenueBet, VENUE_BETS, type BetVenue } from '../src/game/betting';
import { NEWS_KINDS, VDM_NEWS_ICONS } from '../src/game/news';
import { CIVIC_CITIES } from '../src/game/civic';
import { notifyPlayer, whereIs } from './shards';
import { fineItem, recordExhibits } from './exhibits';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

function notify(env: Env, ctx: ExecutionContext, uid: string, event: object) {
  ctx.waitUntil(notifyPlayer(env, uid, event));
}

async function body<T>(req: Request): Promise<T | null> {
  return (await req.json().catch(() => null)) as T | null;
}

/** Lock a player in a cell for the IGP's jail term (or longer if they already are), on this charge. */
export async function jail(db: D1Database, uid: string, minutes: number, charge: string) {
  const until = Date.now() + minutes * 60_000;
  await jailStmt(db, uid, until, [charge]).run();
  return until;
}

const FEED_PAGE = 30;
const POST_COOLDOWN_MS = 60_000;
const REPLY_COOLDOWN_MS = 5_000;
/** Only this many top-level posts stay visible. */
const FEED_WINDOW = 200;
const MAX_POST = 200;
const quoted = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(', ');
/** Which posts (feed f) are national news: the news kinds, and VDM when he is on the government. */
const NEWS_SQL = `(f.kind IN (${quoted(NEWS_KINDS)}) OR (f.kind = 'vdm' AND f.icon IN (${quoted(VDM_NEWS_ICONS)})))`;

/* ---------- Bets ---------- */

function drawResult(): { result: FinalPick; score: string } {
  const r = rand();
  const result: FinalPick = r < 0.45 ? 'home' : r < 0.7 ? 'draw' : 'away';
  const goals = 1 + Math.floor(rand() * 3);
  const other = Math.floor(rand() * goals);
  if (result === 'draw') {
    const g = Math.floor(rand() * 4);
    return { result, score: `${g}-${g}` };
  }
  return { result, score: result === 'home' ? `${goals}-${other}` : `${other}-${goals}` };
}

/** Pay out every final that has finished. Runs whenever someone looks at the bets. */
export async function settleBets(env: Env, ctx: ExecutionContext) {
  const db = env.DB;
  const now = Date.now();
  const { results: slots } = await db
    .prepare('SELECT DISTINCT slot FROM bets WHERE payout IS NULL LIMIT 5')
    .all<{ slot: number }>();
  for (const { slot } of slots) {
    if (slotStart(slot) + LIVE_DURATION_MS > now) continue;
    const drawn = drawResult();
    await db.prepare('INSERT OR IGNORE INTO live_results (slot, result, score, created_at) VALUES (?, ?, ?, ?)').bind(slot, drawn.result, drawn.score, now).run();
    const res = await db.prepare('SELECT result, score FROM live_results WHERE slot = ?').bind(slot).first<{ result: FinalPick; score: string }>();
    if (!res) continue;
    const { results: bets } = await db
      .prepare('UPDATE bets SET payout = CASE WHEN pick = ?2 THEN CAST(stake * ?3 AS INTEGER) ELSE 0 END WHERE slot = ?1 AND payout IS NULL RETURNING *')
      .bind(slot, res.result, FINAL_ODDS[res.result])
      .all<{ id: number; uid: string; stake: number; payout: number; pick: FinalPick }>();
    const winners = bets.filter((b) => b.payout > 0);
    const names = await usernames(db, winners.map((b) => b.uid));
    const stmts: D1PreparedStatement[] = [];
    for (const b of winners) stmts.push(...applyStmts(db, b.uid, `bet:${b.id}`, 'bet_win', String(slot), b.payout));
    const biggest = winners.sort((a, b) => b.payout - a.payout)[0];
    stmts.push(
      feedStmt(db, null, 'final', '🏆', `FULL TIME: ${FINAL_TEAMS.home} ${res.score} ${FINAL_TEAMS.away}. ${winners.length} punter${winners.length === 1 ? '' : 's'} won${biggest ? `; ${handle(names.get(biggest.uid))} cashed out ${naira(biggest.payout)} 🤑` : '. The bookies are smiling.'}`),
    );
    await db.batch(stmts);
    for (const b of bets) notify(env, ctx, b.uid, { t: 'fun', kind: 'bet', payout: b.payout, stake: b.stake, score: res.score, result: res.result });
  }
}

/* ---------- Mugus ---------- */

/** Resolve this scammer's NPC scams whose "client" has had time to reply, paying out the ones that fell for it. */
async function settleMugus(db: D1Database, uid: string) {
  const now = Date.now();
  const { results } = await db
    .prepare("SELECT id, victim_uid, template, amount, blessed, payout, note FROM scams WHERE scammer_uid = ? AND status = 'sent' AND resolve_at IS NOT NULL AND resolve_at <= ? LIMIT 10")
    .bind(uid, now)
    .all<{ id: number; victim_uid: string; template: string; amount: number; blessed: number; payout: number; note: string }>();
  for (const r of results) {
    const claimed = await db.prepare("UPDATE scams SET status = ? WHERE id = ? AND status = 'sent'").bind(r.payout > 0 ? 'paid' : 'cleared', r.id).run();
    if (!claimed.meta.changes) continue;
    if (r.payout > 0) await db.batch(applyStmts(db, uid, `mugu:${r.id}`, 'scam_win', r.victim_uid, r.payout));
    const m = MUGU_BY_ID[r.victim_uid.slice(MUGU_PREFIX.length)];
    if (r.payout > 0 && m) {
      const names = await usernames(db, [uid]);
      await postFeed(db, uid, 'scam', '🤑', `${handle(names.get(uid))} just collected ${naira(r.payout)} from ${m.name} on a “${SCAM_BY_ID[r.template]?.title ?? 'Yahoo'}” script. Mugu don pay. 💻`);
    }
  }
}

/* ---------- Underworld ---------- */

export async function crimeScore(db: D1Database, uid: string) {
  const r = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM crimes WHERE thief_uid = ?1 AND success = 1) AS thefts,
         (SELECT COUNT(*) FROM crimes WHERE thief_uid = ?1 AND success = 0) AS failed,
         (SELECT COUNT(*) FROM scams WHERE scammer_uid = ?1 AND status IN ('paid', 'reported')) AS scams,
         (SELECT turf_wins FROM underworld WHERE uid = ?1) AS wins,
         (SELECT escapes FROM underworld WHERE uid = ?1) AS escapes,
         (SELECT vice FROM underworld WHERE uid = ?1) AS vice`,
    )
    .bind(uid)
    .first<{ thefts: number; failed: number; scams: number; wins: number | null; escapes: number | null; vice: number | null }>();
  if (!r) return 0;
  return Math.floor(
    r.thefts * CRIME_POINTS.theft + r.failed * CRIME_POINTS.failedTheft + r.scams * CRIME_POINTS.scam +
      (r.wins ?? 0) * CRIME_POINTS.turfWin + Math.min(10, r.escapes ?? 0) * CRIME_POINTS.checkpointEscape + Math.min(20, r.vice ?? 0) * 0.5,
  );
}

const duesOf = (p: { collected_at: number | null; since: number | null; levies: number }, now: number) => {
  const from = p.collected_at ?? p.since ?? now;
  const hours = Math.min(PARK_RULES.maxDuesHours, (now - from) / 3600_000);
  return Math.floor(hours * PARK_RULES.duesPerHour) + p.levies;
};

/** Are they at the park (inside it, or on the map by its gate)? */
async function atPark(env: Env, uid: string, parkId: string) {
  const here = await whereIs(env, uid);
  const park = PARK_BY_ID[parkId];
  const place = regionPlace(park.city, park.place);
  if (!here || !place) return false;
  if (here.area === `place:${park.city}:${place.id}`) return true;
  return here.area === `city:${park.city}` && Math.hypot(here.x - (place.door.x + 0.5), here.z - (place.door.z + 0.5)) < 4;
}

/* ---------- Routes ---------- */

export async function handleFun(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string, url: URL): Promise<Response | null> {
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  /* ----- Live events and bets ----- */

  if (path === '/api/venue-bet' && req.method === 'POST') {
    const b = await body<{ venue?: string; pick?: string; stake?: number }>(req);
    const venue = b?.venue && Object.hasOwn(VENUE_BETS, b.venue) ? b.venue as BetVenue : null;
    if (!venue) return err(400, 'Choose a valid betting venue');
    const option = VENUE_BETS[venue].picks.find((pick) => pick.id === b?.pick);
    if (!option) return err(400, 'Choose a valid bet');
    const stake = b?.stake;
    if (!Number.isInteger(stake) || stake! < 500 || stake! > MAX_STAKE) return err(400, `Stake between ₦500 and ${naira(MAX_STAKE)}`);
    if (await jailedUntil(db, me)) return err(403, 'No betting from a police cell');

    const here = await whereIs(env, me);
    if (!here) return err(409, 'Go online in the game first');
    if (venue === 'viewing' || venue === 'pitch') {
      if (!here.area.startsWith('place:') || !here.area.endsWith(`:${venue}`)) return err(409, `Go to ${venue === 'viewing' ? 'a viewing centre' : 'a football pitch'} to bet`);
    } else if (here.area !== 'city:kaduna' || here.x < 10.5 || here.x > 17.5 || here.z < 65.5 || here.z > 72.5) {
      return err(409, 'Walk to Kaduna Golf Club before placing a golf bet');
    }

    if (await getBalance(db, me) < stake!) return err(402, 'Not enough money');
    const id = crypto.randomUUID();
    const paid = await transfer(db, me, null, stake!, 'venue_bet', '', `venue-bet:${id}`);
    if (paid < stake!) return err(402, 'Not enough money');
    const outcome = drawVenueBet(venue, rand());
    const payout = outcome === option.id ? Math.floor(stake! * option.odds) : 0;
    if (payout) await db.batch(applyStmts(db, me, `venue-bet-win:${id}`, 'venue_bet_win', venue, payout));
    return json({ outcome, payout, balance: await getBalance(db, me) });
  }

  if (path === '/api/live' && req.method === 'GET') {
    await settleBets(env, ctx);
    const live = liveEvent(now);
    const [bets, results] = await Promise.all([
      db.prepare('SELECT slot, pick, stake, payout FROM bets WHERE uid = ? ORDER BY slot DESC LIMIT 5').bind(me).all(),
      db.prepare('SELECT slot, result, score FROM live_results ORDER BY slot DESC LIMIT 3').all(),
    ]);
    return json({ now, event: { id: live.def.id, slot: live.slot, startsAt: live.startsAt, endsAt: live.endsAt, active: live.active }, bets: bets.results, results: results.results });
  }

  if (path === '/api/bet' && req.method === 'POST') {
    const b = await body<{ pick?: string; stake?: number }>(req);
    const pick = b?.pick as FinalPick;
    const stake = b?.stake;
    if (!pick || !(pick in FINAL_ODDS)) return err(400, 'Pick home, draw or away');
    if (!Number.isInteger(stake) || stake! < 500 || stake! > MAX_STAKE) return err(400, `Stake between ₦500 and ${naira(MAX_STAKE)}`);
    const live = liveEvent(now);
    if (!live.active || live.def.id !== 'final') return err(409, 'There is no final on right now');
    if (now > live.startsAt + BET_WINDOW_MS) return err(409, 'Betting has closed for this match');
    if (await jailedUntil(db, me)) return err(403, 'No betting from a police cell');
    const exists = await db.prepare('SELECT 1 FROM bets WHERE uid = ? AND slot = ?').bind(me, live.slot).first();
    if (exists) return err(409, 'You already have a bet on this final');
    if ((await getBalance(db, me)) < stake!) return err(402, 'Not enough money');
    const paid = await transfer(db, me, null, stake!, 'bet', '', `bet:${live.slot}:${me}`);
    if (paid < stake!) return err(402, 'Not enough money');
    await db.prepare('INSERT INTO bets (uid, slot, pick, stake, created_at) VALUES (?, ?, ?, ?, ?)').bind(me, live.slot, pick, stake, now).run();
    return json({ ok: true, balance: await getBalance(db, me) });
  }

  /* ----- Kaduna Gist feed ----- */

  /** Twitter's Friends tab: tweets by my friends and me, and city news about them. */
  if (path === '/api/feed' && req.method === 'GET' && url.searchParams.get('scope') === 'friends') {
    const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const { results } = await db
      .prepare(
        `SELECT f.id, f.uid, f.kind, f.icon, f.text, f.created_at AS at, p.username,
                (SELECT COUNT(*) FROM feed_likes l WHERE l.post_id = f.id) AS likes,
                EXISTS (SELECT 1 FROM feed_likes l WHERE l.post_id = f.id AND l.uid = ?1) AS liked,
                (SELECT COUNT(*) FROM feed r WHERE r.parent_id = f.id) AS replies
         FROM feed f LEFT JOIN players p ON p.uid = f.uid
         WHERE f.parent_id IS NULL AND f.id < ?2 AND f.uid IS NOT NULL AND f.created_at >= ?4
           AND (f.uid = ?1 OR EXISTS (SELECT 1 FROM friendships fr WHERE fr.status = 'accepted'
                AND fr.a = MIN(f.uid, ?1) AND fr.b = MAX(f.uid, ?1)))
         ORDER BY f.id DESC LIMIT ?3`,
      )
      .bind(me, before, FEED_PAGE, now - FEED_KEEP_MS)
      .all();
    return json({ posts: results });
  }

  /**
   * Twitter's News tab: national news only (src/game/news.ts). Tweets and news about one player are for their friends.
   * ?city= narrows it to one state's news (and the national stories).
   */
  if (path === '/api/feed' && req.method === 'GET') {
    const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const city = CIVIC_CITIES.find((c) => c === url.searchParams.get('city')) ?? null;
    // Only the latest FEED_WINDOW news posts (of that state, when one is picked) are visible; paging walks back through that window.
    // A state's news is its own plus the national stories (no city), so the tab is never empty for want of local stories.
    const news = city ? `${NEWS_SQL} AND (f.city = ?6 OR f.city IS NULL)` : NEWS_SQL;
    const { results } = await db
      .prepare(
        `SELECT f.id, f.uid, f.kind, f.icon, f.text, f.created_at AS at, p.username,
                (SELECT COUNT(*) FROM feed_likes l WHERE l.post_id = f.id) AS likes,
                EXISTS (SELECT 1 FROM feed_likes l WHERE l.post_id = f.id AND l.uid = ?1) AS liked,
                (SELECT COUNT(*) FROM feed r WHERE r.parent_id = f.id) AS replies
         FROM feed f LEFT JOIN players p ON p.uid = f.uid
         WHERE f.parent_id IS NULL AND f.id < ?2 AND f.created_at >= ?5 AND ${news}
           AND f.id >= COALESCE((SELECT MIN(id) FROM (SELECT f.id FROM feed f WHERE f.parent_id IS NULL AND ${news} ORDER BY f.id DESC LIMIT ?4)), 0)
         ORDER BY f.id DESC LIMIT ?3`,
      )
      .bind(me, before, FEED_PAGE, FEED_WINDOW, now - FEED_KEEP_MS, ...(city ? [city] : []))
      .all();
    return json({ posts: results, window: FEED_WINDOW });
  }

  /** Twitter's VDM tab: only him, on thieves and on the government. */
  if (path === '/api/feed/vdm' && req.method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT f.id, f.uid, f.kind, f.icon, f.text, f.created_at AS at, p.username,
                (SELECT COUNT(*) FROM feed_likes l WHERE l.post_id = f.id) AS likes,
                EXISTS (SELECT 1 FROM feed_likes l WHERE l.post_id = f.id AND l.uid = ?1) AS liked,
                (SELECT COUNT(*) FROM feed r WHERE r.parent_id = f.id) AS replies
         FROM feed f LEFT JOIN players p ON p.uid = f.uid
         WHERE f.parent_id IS NULL AND f.kind = 'vdm' AND f.created_at >= ?3
         ORDER BY f.id DESC LIMIT ?2`,
      )
      .bind(me, FEED_PAGE, now - FEED_KEEP_MS)
      .all();
    return json({ posts: results });
  }

  const replies = path.match(/^\/api\/feed\/(\d+)\/replies$/);
  if (replies && req.method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT f.id, f.uid, f.kind, f.icon, f.text, f.created_at AS at, f.parent_id AS parent, p.username,
                (SELECT COUNT(*) FROM feed_likes l WHERE l.post_id = f.id) AS likes,
                EXISTS (SELECT 1 FROM feed_likes l WHERE l.post_id = f.id AND l.uid = ?1) AS liked
         FROM feed f LEFT JOIN players p ON p.uid = f.uid
         WHERE f.parent_id = ?2 ORDER BY f.id ASC LIMIT ?3`,
      )
      .bind(me, Number(replies[1]), FEED_WINDOW)
      .all();
    return json({ replies: results });
  }

  if (path === '/api/feed' && req.method === 'POST') {
    const b = await body<{ text?: string; achievement?: string; parent?: number; legacy?: { icon?: unknown; name?: unknown; days?: unknown; title?: unknown; score?: unknown } }>(req);
    const p = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();
    if (!p?.username) return err(403, 'Pick a username first');
    if (b?.achievement) {
      const a = ACHIEVEMENT_BY_ID[b.achievement];
      if (!a?.rare) return err(400, 'Not a headline achievement');
      const dup = await db.prepare("SELECT 1 FROM feed WHERE uid = ? AND kind = 'achievement' AND text LIKE ?").bind(me, `%${a.title}%`).first();
      if (!dup) await postFeed(db, me, 'achievement', a.icon, `${handle(p.username)} just unlocked “${a.title}”: ${a.desc}`);
      return json({ ok: true });
    }
    if (b?.legacy) {
      // A life ending is city news, not a tweet the player wrote.
      const l = b.legacy;
      const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
      const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
      const name = str(l.name, 40);
      const title = str(l.title, 60);
      const icon = str(l.icon, 4) || '🕊️';
      const recent = await db.prepare("SELECT MAX(created_at) AS at FROM feed WHERE uid = ? AND kind = 'legacy'").bind(me).first<{ at: number | null }>();
      if (recent?.at && now - recent.at < POST_COOLDOWN_MS) return json({ ok: true });
      await postFeed(
        db, me, 'legacy', icon,
        `${name ? `${name} (${handle(p.username)})` : handle(p.username)} has passed on after ${int(l.days)} days in Naija City.${title ? ` Legacy: “${title}”` : ''} (${int(l.score).toLocaleString('en-NG')} pts). 🕊️`,
      );
      return json({ ok: true });
    }
    const text = (b?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_POST);
    if (!text) return err(400, 'Say something');
    const parent = Number.isSafeInteger(b?.parent) ? (b!.parent as number) : null;
    if (parent !== null) {
      const target = await db.prepare('SELECT id FROM feed WHERE id = ? AND parent_id IS NULL AND created_at >= ?').bind(parent, now - FEED_KEEP_MS).first();
      if (!target) return err(404, 'That post is gone');
      const lastReply = await db.prepare("SELECT MAX(created_at) AS at FROM feed WHERE uid = ? AND parent_id IS NOT NULL").bind(me).first<{ at: number | null }>();
      if (lastReply?.at && now - lastReply.at < REPLY_COOLDOWN_MS) return err(429, 'Easy! Give it a few seconds');
      const r = await db
        .prepare("INSERT INTO feed (uid, kind, icon, text, created_at, parent_id) VALUES (?, 'post', '💬', ?, ?, ?) RETURNING id")
        .bind(me, text, now, parent)
        .first<{ id: number }>();
      await tweetCountStmt(db, me, now).run().catch(() => {});
      return json({ ok: true, id: r?.id });
    }
    const last = await db.prepare("SELECT MAX(created_at) AS at FROM feed WHERE uid = ? AND kind = 'post' AND parent_id IS NULL").bind(me).first<{ at: number | null }>();
    if (last?.at && now - last.at < POST_COOLDOWN_MS) return err(429, 'Easy! One post a minute');
    await postFeed(db, me, 'post', '💬', text);
    await tweetCountStmt(db, me, now).run().catch(() => {});
    return json({ ok: true });
  }

  const delPost = path.match(/^\/api\/feed\/(\d+)$/);
  /** One tweet, for whoever opened a share link to it (src/net/deeplink.ts). */
  if (delPost && req.method === 'GET') {
    const post = await db
      .prepare(
        `SELECT f.id, f.uid, f.kind, f.icon, f.text, f.created_at AS at, p.username,
                (SELECT COUNT(*) FROM feed_likes l WHERE l.post_id = f.id) AS likes,
                EXISTS (SELECT 1 FROM feed_likes l WHERE l.post_id = f.id AND l.uid = ?1) AS liked,
                (SELECT COUNT(*) FROM feed r WHERE r.parent_id = f.id) AS replies
         FROM feed f LEFT JOIN players p ON p.uid = f.uid
         WHERE f.id = ?2 AND f.parent_id IS NULL AND f.created_at >= ?3`,
      )
      .bind(me, Number(delPost[1]), now - FEED_KEEP_MS)
      .first();
    if (!post) return err(404, 'That tweet is gone');
    return json({ post });
  }
  if (delPost && req.method === 'DELETE') {
    const id = Number(delPost[1]);
    const mine = await db.prepare("SELECT id, created_at FROM feed WHERE id = ? AND uid = ? AND kind = 'post'").bind(id, me).first<{ id: number; created_at: number }>();
    if (!mine) return err(404, 'You can only delete your own posts');
    await db.batch([
      // Replies and likes go with it (feed_cascade trigger).
      db.prepare('DELETE FROM feed WHERE id = ?').bind(id),
      tweetCountStmt(db, me, mine.created_at, -1),
    ]);
    return json({ ok: true });
  }

  const like = path.match(/^\/api\/feed\/(\d+)\/like$/);
  if (like && req.method === 'POST') {
    const id = Number(like[1]);
    const had = await db.prepare('DELETE FROM feed_likes WHERE post_id = ? AND uid = ? RETURNING post_id').bind(id, me).first();
    if (!had) await db.prepare('INSERT OR IGNORE INTO feed_likes (post_id, uid) SELECT id, ? FROM feed WHERE id = ?').bind(me, id).run();
    const n = await db.prepare('SELECT COUNT(*) AS n FROM feed_likes WHERE post_id = ?').bind(id).first<{ n: number }>();
    return json({ liked: !had, likes: n?.n ?? 0 });
  }

  /* ----- Yahoo scams ----- */

  if (path === '/api/scam' && req.method === 'POST') {
    const b = await body<{ to?: string; template?: string }>(req);
    const tpl = b?.template ? SCAM_BY_ID[b.template] : undefined;
    const to = b?.to;
    if (!tpl || typeof to !== 'string') return err(400, 'Pick a target and a script');
    if (to === me) return err(400, 'You can’t scam yourself (you already tried)');
    const mugu = to.startsWith(MUGU_PREFIX) ? MUGU_BY_ID[to.slice(MUGU_PREFIX.length)] : undefined;
    if (to.startsWith(MUGU_PREFIX) && !mugu) return err(404, 'No such client');
    const names = await usernames(db, [me, to]);
    const [mine, theirs] = await Promise.all([
      db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>(),
      mugu ? Promise.resolve({ username: mugu.name }) : db.prepare('SELECT username FROM players WHERE uid = ?').bind(to).first<{ username: string | null }>(),
    ]);
    if (!mine?.username) return err(403, 'Pick a username first');
    if (!theirs?.username) return err(404, 'No such player');
    if (await jailedUntil(db, me)) return err(403, 'No network in the cell');
    if (tpl.minPaid) {
      const won = await db.prepare("SELECT COUNT(*) AS n FROM scams WHERE scammer_uid = ? AND status = 'paid'").bind(me).first<{ n: number }>();
      if ((won?.n ?? 0) < tpl.minPaid) return err(403, `Big-boy script. Land ${tpl.minPaid} paid scams first (you have ${won?.n ?? 0})`);
    }
    const recent = await db
      .prepare(
        `SELECT (SELECT MAX(created_at) FROM scams WHERE scammer_uid = ?1) AS mine,
                (SELECT MAX(created_at) FROM scams WHERE scammer_uid = ?1 AND victim_uid = ?2) AS them,
                (SELECT COUNT(*) FROM scams WHERE victim_uid = ?2 AND created_at > ?3) AS tries`,
      )
      .bind(me, to, now - SCAM_RULES.wiseWindowMs)
      .first<{ mine: number | null; them: number | null; tries: number }>();
    if (recent?.mine && now - recent.mine < SCAM_RULES.cooldownMs) return err(429, 'Your “client” is suspicious. Wait a few minutes');
    if (recent?.them && now - recent.them < (mugu ? SCAM_RULES.muguCooldownMs : SCAM_RULES.sameTargetMs)) return err(429, 'You already tried them recently');

    const laws = await loadLaws(db);
    const soap = await usePerk(db, me, 'soap');
    if (!soap && rand() < SCAM_RULES.catchChance + laws.finePct / 1000) {
      const fine = SCAM_RULES.fine + tpl.amount;
      const paid = await transfer(db, me, null, fine, 'efcc_fine', '', `scamfine:${me}:${now}`);
      await recordExhibits(db, me, `scam:${now}`, 'Caught sending a Yahoo scam', [fineItem(paid)], now);
      await jail(db, me, laws.jailMinutes, `Yahoo fraud · caught sending a “${tpl.title}” scam`);
      const { until } = await searchPhone(env, me, 'efcc', laws.jailMinutes);
      await db.batch([
        db.prepare("INSERT INTO scams (scammer_uid, victim_uid, template, amount, status, created_at) VALUES (?, ?, ?, ?, 'caught', ?)").bind(me, to, tpl.id, tpl.amount, now),
        feedStmt(db, me, 'scam', '🚨', `EFCC don catch ${handle(mine.username)} red-handed sending a “${tpl.title}” scam to ${mugu ? mugu.name : handle(theirs.username)}. Laptop seized, ${naira(paid)} fine, straight to the cell. 🚔`),
      ]);
      notify(env, ctx, me, { t: 'fun', kind: 'jailed', until, reason: 'EFCC caught your Yahoo message' });
      return json({ caught: true, fine: paid, until, balance: await getBalance(db, me) });
    }
    const spell = await usePerk(db, me, 'spell');

    if (mugu) {
      // The mugu decides now; the reply (and the money) lands after a short wait.
      const falls = rand() < muguChance(mugu, tpl.id, recent?.tries ?? 0, spell);
      const blessed = falls && (await usePerk(db, me, 'blessing'));
      let payout = 0;
      if (falls) {
        const ask = tpl.amount * (0.7 + rand() * 0.6) * (blessed ? 1.5 : 1);
        payout = Math.max(1_000, Math.min(mugu.wallet, Math.round(ask / 100) * 100));
      }
      const delay = SCAM_RULES.replyMinMs + rand() * (SCAM_RULES.replyMaxMs - SCAM_RULES.replyMinMs);
      await db
        .prepare('INSERT INTO scams (scammer_uid, victim_uid, template, amount, payout, note, blessed, resolve_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(me, to, tpl.id, tpl.amount, payout, falls ? mugu.paid : mugu.refused, blessed ? 1 : 0, Math.round(now + delay), now)
        .run();
      return json({ caught: false, mugu: mugu.name, replyInMs: Math.round(delay), spell, soap });
    }

    const msg = await db
      .prepare(`INSERT INTO messages (from_uid, to_uid, kind, text, amount, status, created_at) VALUES (?, ?, 'request', ?, ?, 'open', ?) RETURNING *`)
      .bind(me, to, tpl.text, tpl.amount, now)
      .first<{ id: number; from_uid: string; to_uid: string; kind: string; text: string; amount: number; status: string; ref: number | null; created_at: number; read_at: number | null }>();
    await db.prepare('INSERT INTO scams (scammer_uid, victim_uid, message_id, template, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(me, to, msg!.id, tpl.id, tpl.amount, soap ? 'soap' : null, now).run();
    const message = { id: msg!.id, from: me, to, kind: 'request', text: tpl.text, amount: tpl.amount, status: 'open', ref: null, at: now, read: false };
    notify(env, ctx, to, { t: 'dm', message, from: { uid: me, username: names.get(me), name: null } });
    return json({ caught: false, message, spell, soap });
  }

  if (path === '/api/scams' && req.method === 'GET') {
    await settleMugus(db, me);
    const { results } = await db
      .prepare(
        `SELECT s.id, s.template, s.amount, s.status, s.created_at AS at, s.resolve_at AS replyAt, s.payout, s.note, p.username AS victim, s.victim_uid AS victimUid
         FROM scams s LEFT JOIN players p ON p.uid = s.victim_uid WHERE s.scammer_uid = ? ORDER BY s.id DESC LIMIT 20`,
      )
      .bind(me)
      .all<{ victimUid: string; victim: string | null; status: string; replyAt: number | null; note: string | null; [k: string]: unknown }>();
    const rows = results.map((r) => {
      const m = r.victimUid.startsWith(MUGU_PREFIX) ? MUGU_BY_ID[r.victimUid.slice(MUGU_PREFIX.length)] : undefined;
      const pending = r.status === 'sent' && r.replyAt !== null;
      return { ...r, victim: m ? m.name : r.victim, note: m && !pending ? r.note : null };
    });
    const perks = await db.prepare('SELECT perk, charges FROM baba_perks WHERE uid = ? AND charges > 0').bind(me).all<{ perk: string; charges: number }>();
    return json({ scams: rows, perks: perks.results });
  }

  /* ----- Baba Online ----- */

  if (path === '/api/baba/buy' && req.method === 'POST') {
    const b = await body<{ perk?: string }>(req);
    const perk = b?.perk ? PERK_BY_ID[b.perk] : undefined;
    if (!perk) return err(400, 'Baba does not sell that');
    if ((await getBalance(db, me)) < perk.price) return err(402, `${perk.label} costs ${naira(perk.price)}. Baba does not do credit`);
    const paid = await transfer(db, me, null, perk.price, 'baba', '', `baba:${perk.id}`);
    if (paid < perk.price) {
      if (paid > 0) await db.batch(applyStmts(db, me, `baba-refund:${crypto.randomUUID()}`, 'refund', perk.id, paid));
      return err(402, 'Not enough money');
    }
    // Sometimes Baba is a scammer too.
    const fake = rand() < FAKE_PERK_CHANCE;
    if (!fake) {
      await db
        .prepare('INSERT INTO baba_perks (uid, perk, charges) VALUES (?1, ?2, ?3) ON CONFLICT(uid, perk) DO UPDATE SET charges = charges + ?3')
        .bind(me, perk.id, perk.charges)
        .run();
    }
    const perks = await db.prepare('SELECT perk, charges FROM baba_perks WHERE uid = ? AND charges > 0').bind(me).all<{ perk: string; charges: number }>();
    return json({ fake, perks: perks.results, balance: await getBalance(db, me) });
  }

  if (path === '/api/baba' && req.method === 'GET') {
    const perks = await db.prepare('SELECT perk, charges FROM baba_perks WHERE uid = ? AND charges > 0').bind(me).all<{ perk: string; charges: number }>();
    return json({ perks: perks.results, catalog: BABA_PERKS });
  }

  const report = path.match(/^\/api\/scam\/report\/(\d+)$/);
  if (report && req.method === 'POST') {
    const messageId = Number(report[1]);
    const msg = await db.prepare("SELECT from_uid, to_uid FROM messages WHERE id = ? AND kind = 'request'").bind(messageId).first<{ from_uid: string; to_uid: string }>();
    if (!msg || msg.to_uid !== me) return err(404, 'Request not found');
    const scam = await db
      .prepare("UPDATE scams SET status = 'reported' WHERE message_id = ? AND victim_uid = ? AND status IN ('sent', 'paid') RETURNING *")
      .bind(messageId, me)
      .first<{ id: number; scammer_uid: string; amount: number; template: string; created_at: number }>();
    await db.prepare("UPDATE messages SET status = CASE WHEN status = 'open' THEN 'declined' ELSE status END WHERE id = ?").bind(messageId).run();
    if (!scam) {
      const was = await db.prepare('SELECT status FROM scams WHERE message_id = ?').bind(messageId).first<{ status: string }>();
      return json({ verdict: was ? 'already' : 'legit' });
    }
    const names = await usernames(db, [scam.scammer_uid, me]);
    const paidRow = await db.prepare("SELECT 1 FROM messages WHERE kind = 'pay' AND ref = ? AND from_uid = ?").bind(messageId, me).first();
    const slick = await db.prepare('SELECT note FROM scams WHERE id = ?').bind(scam.id).first<{ note: string | null }>();
    const fog = await usePerk(db, scam.scammer_uid, 'fog');
    if (slick?.note === 'soap' || rand() >= (fog ? SCAM_RULES.fogCatchChance : SCAM_RULES.reportCatchChance)) {
      return json({ verdict: 'escaped' });
    }
    const laws = await loadLaws(db);
    const refund = paidRow ? await transfer(db, scam.scammer_uid, me, scam.amount, 'restitution_out', 'restitution_in', `scam:${scam.id}`) : 0;
    const fine = await transfer(db, scam.scammer_uid, null, SCAM_RULES.fine, 'fine', '', `scamfine:${scam.id}`);
    await jail(db, scam.scammer_uid, laws.jailMinutes, `Yahoo fraud · the EFCC traced a “${SCAM_BY_ID[scam.template]?.title ?? 'Yahoo'}” scam to you`);
    const { until } = await searchPhone(env, scam.scammer_uid, 'efcc', laws.jailMinutes);
    await postFeed(db, scam.scammer_uid, 'scam', '🕵🏾', `EFCC traced a “${SCAM_BY_ID[scam.template]?.title ?? 'Yahoo'}” scam to ${handle(names.get(scam.scammer_uid))}. ${refund ? `${naira(refund)} returned to the victim, ` : ''}${naira(fine)} fine and a night in the cell.`);
    notify(env, ctx, scam.scammer_uid, { t: 'fun', kind: 'jailed', until, reason: `@${names.get(me)} reported your scam to the EFCC` });
    return json({ verdict: 'caught', refund, balance: await getBalance(db, me) });
  }

  /* ----- Underworld ----- */

  if (path === '/api/underworld' && req.method === 'GET') {
    const [score, rows, uw] = await Promise.all([
      crimeScore(db, me),
      db.prepare('SELECT k.*, p.username FROM parks k LEFT JOIN players p ON p.uid = k.boss_uid').all<{ id: string; boss_uid: string | null; since: number | null; collected_at: number | null; levies: number; shield_until: number | null; username: string | null }>(),
      db.prepare('SELECT turf_wins, escapes FROM underworld WHERE uid = ?').bind(me).first<{ turf_wins: number; escapes: number }>(),
    ]);
    const byId = new Map(rows.results.map((r) => [r.id, r]));
    const parks = PARKS.map((park) => {
      const r = byId.get(park.id);
      const mine = r?.boss_uid === me;
      return {
        id: park.id,
        boss: r?.boss_uid ? { uid: r.boss_uid, username: r.username } : null,
        since: r?.since ?? null,
        shieldUntil: r?.shield_until ?? null,
        dues: mine && r ? duesOf(r, now) : null,
      };
    });
    return json({ score, tier: crimeTier(score).id, turfWins: uw?.turf_wins ?? 0, escapes: uw?.escapes ?? 0, parks });
  }

  if (path === '/api/underworld/escape' && req.method === 'POST') {
    // A checkpoint escape: worth a little street cred, at most one every two minutes.
    await db
      .prepare(
        `INSERT INTO underworld (uid, escapes, escape_at) VALUES (?1, 1, ?2)
         ON CONFLICT(uid) DO UPDATE SET escapes = escapes + 1, escape_at = ?2 WHERE COALESCE(escape_at, 0) < ?2 - 120000`,
      )
      .bind(me, now)
      .run();
    return json({ ok: true });
  }

  if (path === '/api/underworld/claim' && req.method === 'POST') {
    const b = await body<{ park?: string }>(req);
    const park = b?.park ? PARK_BY_ID[b.park] : undefined;
    if (!park) return err(400, 'Unknown park');
    if (await jailedUntil(db, me)) return err(403, 'You are in a cell');
    const score = await crimeScore(db, me);
    if (tierIndex(crimeTier(score).id) < tierIndex(PARK_RULES.claimTier)) return err(403, 'The boys don’t know you. Climb to Agbero first');
    if (!(await atPark(env, me, park.id))) return err(409, `Go to ${park.name} first`);
    await db.prepare('INSERT OR IGNORE INTO parks (id) VALUES (?)').bind(park.id).run();
    const cur = await db.prepare('SELECT * FROM parks WHERE id = ?').bind(park.id).first<{ boss_uid: string | null; shield_until: number | null; since: number | null; collected_at: number | null; levies: number }>();
    if (cur?.boss_uid === me) return err(409, 'You already run this park');
    const names = await usernames(db, [me, cur?.boss_uid ?? null]);

    if (!cur?.boss_uid) {
      const paid = await transfer(db, me, null, PARK_RULES.claimCost, 'settlement', '', `park:${park.id}:${now}`);
      if (paid < PARK_RULES.claimCost) return err(402, `The elders want ${naira(PARK_RULES.claimCost)} to settle`);
      await db.batch([
        db.prepare('UPDATE parks SET boss_uid = ?, since = ?, collected_at = ?, levies = 0, shield_until = ? WHERE id = ? AND boss_uid IS NULL').bind(me, now, now, now + PARK_RULES.shieldMs, park.id),
        feedStmt(db, me, 'underworld', '🕴🏾', `New sheriff in town: ${handle(names.get(me))} now controls ${park.name}. Every keke driver is paying dues from today.`),
      ]);
      return json({ result: 'claimed', balance: await getBalance(db, me) });
    }

    if (cur.shield_until && cur.shield_until > now) return err(429, 'The boss’s boys are on high alert. Try again later');
    const paid = await transfer(db, me, null, PARK_RULES.warCost, 'turf_war', '', `war:${park.id}:${now}`);
    if (paid < PARK_RULES.warCost) return err(402, `A turf war costs ${naira(PARK_RULES.warCost)}`);
    const theirs = Math.max(1, await crimeScore(db, cur.boss_uid));
    const chance = Math.min(0.85, Math.max(0.15, score / (score + theirs)));
    if (rand() < chance) {
      // Whatever dues the old boss hadn't collected change hands too.
      await db.batch([
        db.prepare('UPDATE parks SET boss_uid = ?, since = ?, collected_at = ?, shield_until = ? WHERE id = ?').bind(me, now, now, now + PARK_RULES.shieldMs, park.id),
        db.prepare('INSERT INTO underworld (uid, turf_wins) VALUES (?, 1) ON CONFLICT(uid) DO UPDATE SET turf_wins = turf_wins + 1').bind(me),
        feedStmt(db, me, 'underworld', '⚔️', `TURF WAR at ${park.name}! ${handle(names.get(me))} has chased ${handle(names.get(cur.boss_uid))} out. The park has a new godfather.`),
      ]);
      notify(env, ctx, cur.boss_uid, { t: 'fun', kind: 'ousted', by: names.get(me), park: park.name });
      return json({ result: 'won', balance: await getBalance(db, me) });
    }
    let until: number | null = null;
    if (rand() < PARK_RULES.warArrestChance) {
      const { jailMinutes } = await loadLaws(db);
      await jail(db, me, jailMinutes, `Affray · fighting a turf war at ${park.name}`);
      ({ until } = await searchPhone(env, me, 'police', jailMinutes));
      notify(env, ctx, me, { t: 'fun', kind: 'jailed', until, reason: 'Police broke up the turf war' });
    }
    await postFeed(db, me, 'underworld', '🩹', `${handle(names.get(me))} tried to take ${park.name} from ${handle(names.get(cur.boss_uid))} and got chased out${until ? ' — straight into a police van' : ''}. 😂`);
    return json({ result: 'lost', until, balance: await getBalance(db, me) });
  }

  if (path === '/api/underworld/collect' && req.method === 'POST') {
    const b = await body<{ park?: string }>(req);
    const park = b?.park ? PARK_BY_ID[b.park] : undefined;
    if (!park) return err(400, 'Unknown park');
    if (await jailedUntil(db, me)) return err(403, 'You are in a cell');
    const cur = await db.prepare('SELECT * FROM parks WHERE id = ? AND boss_uid = ?').bind(park.id, me).first<{ since: number | null; collected_at: number | null; levies: number }>();
    if (!cur) return err(403, 'This is not your park');
    if (!(await atPark(env, me, park.id))) return err(409, `Go to ${park.name} to collect`);
    const dues = duesOf(cur, now);
    if (dues < 500) return err(409, 'Nothing to collect yet');
    const laws = await loadLaws(db);
    const names = await usernames(db, [me]);
    if (rand() < PARK_RULES.raidChance * (laws.patrols / 50)) {
      const fine = await transfer(db, me, null, PARK_RULES.raidFine, 'fine', '', `raid:${park.id}:${now}`);
      await jail(db, me, laws.jailMinutes, `Extortion · collecting dues at ${park.name}`);
      const { until } = await searchPhone(env, me, 'police', laws.jailMinutes);
      await db.batch([
        db.prepare('UPDATE parks SET boss_uid = NULL, since = NULL, collected_at = NULL, levies = 0, shield_until = NULL WHERE id = ?').bind(park.id),
        feedStmt(db, me, 'underworld', '🚔', `POLICE RAID at ${park.name}! Godfather ${handle(names.get(me))} arrested while counting dues. ${naira(fine)} fine. The park is up for grabs.`),
      ]);
      notify(env, ctx, me, { t: 'fun', kind: 'jailed', until, reason: 'Police raided your motor park' });
      return json({ result: 'raided', fine, until, balance: await getBalance(db, me) });
    }
    await db.batch([
      db.prepare('UPDATE parks SET collected_at = ?, levies = 0 WHERE id = ? AND boss_uid = ?').bind(now, park.id, me),
      ...applyStmts(db, me, `dues:${park.id}:${now}`, 'dues', park.id, dues),
    ]);
    return json({ result: 'collected', dues, balance: await getBalance(db, me) });
  }

  return null;
}
