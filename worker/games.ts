// Street Games: tables where players play each other at Belt, Ten-Ten, Street Dice, Ayo and Whot (the Games
// phone app). The rules live in gameRules.ts; this file seats players, holds their stakes, runs the turn clock
// and pays the pot. A match is one D1 row whose `version` goes up on every change, so two requests landing
// together can never both move or both get paid.

import type { FirebaseUser } from './auth';
import { applyStmts, ensureWallet, getBalance } from './wallet';
import { usernames } from './crime';
import { sendGameChallenge } from './social';
import { shared } from './cache';
import { feedStmt, handle, naira } from './feed';
import { notifyPlayer } from './shards';
import { RULES, type Move } from './gameRules';
import {
  MAX_STAKE, MAX_TABLES, OPEN_MS, STREET_GAMES, isGameId,
  type Champion, type GameEvent, type GameId, type GamesLobby, type MatchCard, type MatchStatus, type MatchView,
} from '../src/game/streetGames';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

/** Slack after a deadline before the server acts, so a player's countdown reaches zero first. */
const GRACE_MS = 3_000;
/** A pot this big makes the Gist feed. */
const FEED_POT = 50_000;
const DAY_MS = 86_400_000;
/** Finished matches are kept this long. */
const KEEP_MS = 7 * DAY_MS;
/** How many times a move is retried when another request changed the match first. */
const TRIES = 4;

interface Row {
  id: string;
  game: GameId;
  host: string;
  stake: number;
  seats: number;
  status: MatchStatus;
  players: string;
  state: string | null;
  version: number;
  invite: string | null;
  winner: string | null;
  pot: number;
  paid: number;
  deadline: number;
  created_at: number;
  updated_at: number;
}

const playersOf = (row: Row) => JSON.parse(row.players) as string[];
const winnersOf = (row: Row) => (row.winner ? (JSON.parse(row.winner) as string[]) : []);
const load = (db: D1Database, id: string) => db.prepare('SELECT * FROM game_matches WHERE id = ?').bind(id).first<Row>();
/** SQL: the player ?1 sits at this table. */
const SEATED = 'EXISTS (SELECT 1 FROM json_each(game_matches.players) WHERE value = ?1)';

function tell(env: Env, ctx: ExecutionContext, uids: string[], event: GameEvent) {
  for (const uid of uids) ctx.waitUntil(notifyPlayer(env, uid, event));
}

/** Write a change only if nobody changed the match first. Returns the new row, or null if somebody did. */
async function commit(db: D1Database, row: Row, patch: Partial<Row>): Promise<Row | null> {
  const next: Row = { ...row, ...patch, version: row.version + 1, updated_at: Date.now() };
  const res = await db
    .prepare(
      `UPDATE game_matches SET status = ?, seats = ?, players = ?, state = ?, winner = ?, pot = ?, deadline = ?, version = ?, updated_at = ?
       WHERE id = ? AND version = ?`,
    )
    .bind(next.status, next.seats, next.players, next.state, next.winner, next.pot, next.deadline, next.version, next.updated_at, row.id, row.version)
    .run();
  return res.meta.changes ? next : null;
}

/**
 * Take a stake: the ledger row is only written if the wallet holds that much (and, when joining, the table is
 * still open at `version`), and the wallet only moves if the row was written. Run in a batch, before the
 * statement that seats the player, which checks the same ledger row.
 */
function stakeStmts(db: D1Database, uid: string, cid: string, id: string, stake: number, version: number | null) {
  const now = Date.now();
  return [
    ensureWallet(db, uid),
    db
      .prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, created_at)
         SELECT ?1, ?2, 'game_stake', ?3, -?4, ?5 FROM wallets
         WHERE uid = ?1 AND ?4 > 0 AND balance >= ?4
           AND (?6 IS NULL OR EXISTS (SELECT 1 FROM game_matches WHERE id = ?3 AND version = ?6 AND status = 'open'))`,
      )
      .bind(uid, cid, id, stake, now, version),
    db
      .prepare(`UPDATE wallets SET balance = balance - ?3, updated_at = ?4 WHERE uid = ?1 AND EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)`)
      .bind(uid, cid, stake, now),
    db.prepare('UPDATE ledger SET applied = 1 WHERE uid = ?1 AND client_id = ?2').bind(uid, cid),
  ];
}

/** Pay the pot (or hand the stakes back) exactly once and record the result. Safe to call again. */
async function settle(env: Env, ctx: ExecutionContext, row: Row) {
  if (row.paid || (row.status !== 'done' && row.status !== 'void')) return;
  const db = env.DB;
  const done = row.status === 'done';
  const players = playersOf(row);
  const winners = winnersOf(row);
  const share = done && winners.length ? Math.floor(row.pot / winners.length) : 0;
  const got = (uid: string) => (done ? (winners.includes(uid) ? share : 0) : row.stake);
  const stmts: D1PreparedStatement[] = [];
  for (const uid of players) {
    if (got(uid) > 0) stmts.push(...applyStmts(db, uid, `game:${row.id}:${done ? 'win' : 'refund'}`, done ? 'game_win' : 'game_refund', row.id, got(uid)));
    if (!done) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO game_stats (uid, game, played, won, net)
           SELECT ?1, ?2, 1, ?3, ?4 WHERE EXISTS (SELECT 1 FROM game_matches WHERE id = ?5 AND paid = 0)
           ON CONFLICT(uid, game) DO UPDATE SET played = played + 1, won = won + excluded.won, net = net + excluded.net`,
        )
        .bind(uid, row.game, winners.includes(uid) ? 1 : 0, got(uid) - row.stake, row.id),
    );
  }
  const names = done && row.pot >= FEED_POT && winners.length === 1 ? await usernames(db, players) : null;
  if (names) {
    const losers = players.filter((uid) => uid !== winners[0]).map((uid) => handle(names.get(uid)));
    stmts.push(
      feedStmt(db, winners[0], 'game', STREET_GAMES[row.game].icon, `${handle(names.get(winners[0]))} just carried ${naira(row.pot)} at ${STREET_GAMES[row.game].name}. ${losers.join(', ')} ${losers.length === 1 ? 'is' : 'are'} trekking home. 😭`),
    );
  }
  stmts.push(db.prepare('UPDATE game_matches SET paid = 1 WHERE id = ?').bind(row.id));
  await db.batch(stmts);
  row.paid = 1;
  for (const uid of players) {
    const result = !done ? 'closed' : !winners.includes(uid) ? 'lost' : winners.length > 1 ? 'draw' : 'won';
    tell(env, ctx, [uid], { t: 'game', kind: 'over', id: row.id, game: row.game, result, amount: result === 'won' || result === 'draw' ? share : row.stake });
  }
}

/** The change that follows a move or a walk-off: carry on with a fresh clock, or finish with the winners named. */
function after(row: Row, state: unknown, now: number): Partial<Row> {
  const result = RULES[row.game].result(state);
  const players = playersOf(row);
  return {
    state: JSON.stringify(state),
    status: result ? 'done' : 'live',
    winner: result ? JSON.stringify(result.map((seat) => players[seat])) : null,
    deadline: now + STREET_GAMES[row.game].turnMs,
  };
}

/** Close a table nobody filled, and drop players who ran out of time. Returns the match as it now stands. */
async function enforce(env: Env, ctx: ExecutionContext, row: Row, now = Date.now()): Promise<Row> {
  const db = env.DB;
  let patch: Partial<Row> | null = null;
  if (row.status === 'open' && now > row.deadline) {
    patch = { status: 'void' };
  } else if (row.status === 'live' && row.state && now > row.deadline + GRACE_MS) {
    const rules = RULES[row.game];
    const state = JSON.parse(row.state);
    const late = rules.pending(state);
    for (const seat of late) rules.drop(state, seat);
    const result = rules.result(state);
    // If the only players left standing are ones who never moved either, nobody earned it: stakes go back.
    patch = result && result.every((seat) => late.includes(seat)) ? { status: 'void' } : after(row, state, now);
  }
  if (!patch) return row;
  const next = await commit(db, row, patch);
  if (!next) return (await load(db, row.id)) ?? row;
  if (next.status === 'live') tell(env, ctx, playersOf(next), { t: 'game', kind: 'update', id: next.id });
  else await settle(env, ctx, next);
  return next;
}

function cardOf(row: Row, me: string, names: Map<string, string>): MatchCard {
  const players = playersOf(row);
  const seat = players.indexOf(me);
  return {
    id: row.id,
    game: row.game,
    stake: row.stake,
    seats: row.seats,
    status: row.status,
    host: names.get(row.host) ?? 'someone',
    players: players.map((uid) => ({ uid, username: names.get(uid) ?? 'someone' })),
    invited: row.status === 'open' && row.invite === me,
    yourTurn: row.status === 'live' && !!row.state && seat >= 0 && RULES[row.game].pending(JSON.parse(row.state)).includes(seat),
    winners: winnersOf(row),
    at: row.updated_at,
  };
}

async function viewOf(db: D1Database, row: Row, me: string): Promise<MatchView> {
  const names = await usernames(db, playersOf(row));
  const card = cardOf(row, me, names);
  const you = playersOf(row).indexOf(me);
  const rules = RULES[row.game];
  const state = row.state ? JSON.parse(row.state) : null;
  return {
    ...card,
    pot: row.pot,
    you,
    pending: state && row.status === 'live' ? rules.pending(state) : [],
    deadline: row.deadline,
    now: Date.now(),
    version: row.version,
    view: state ? (rules.view(state, you) as MatchView['view']) : null,
  };
}

async function lobby(env: Env, ctx: ExecutionContext, me: string): Promise<GamesLobby> {
  const db = env.DB;
  const now = Date.now();
  const [mine, open, recent, wallet] = await Promise.all([
    db.prepare(`SELECT * FROM game_matches WHERE status IN ('open', 'live') AND ${SEATED} ORDER BY updated_at DESC`).bind(me).all<Row>(),
    db
      .prepare(
        `SELECT * FROM game_matches WHERE status = 'open' AND deadline > ?2 AND (invite IS NULL OR invite = ?1) AND NOT ${SEATED}
         ORDER BY (invite IS NOT NULL) DESC, created_at DESC LIMIT 30`,
      )
      .bind(me, now)
      .all<Row>(),
    db.prepare(`SELECT * FROM game_matches WHERE status IN ('done', 'void') AND updated_at > ?2 AND ${SEATED} ORDER BY updated_at DESC LIMIT 8`).bind(me, now - DAY_MS).all<Row>(),
    getBalance(db, me),
  ]);
  // Looking at your tables is also what moves a stalled one along.
  const current: Row[] = [];
  const ended: Row[] = [];
  for (const row of mine.results) {
    const r = await enforce(env, ctx, row, now);
    (r.status === 'open' || r.status === 'live' ? current : ended).push(r);
  }
  const rows = [...current, ...open.results, ...ended, ...recent.results];
  const names = await usernames(db, rows.flatMap(playersOf));
  const cards = (list: Row[]) => list.map((row) => cardOf(row, me, names));
  return { balance: ended.length ? await getBalance(db, me) : wallet, mine: cards(current), open: cards(open.results), recent: cards([...ended, ...recent.results]).slice(0, 8) };
}

async function champions(db: D1Database, me: string, game: string): Promise<{ top: Champion[]; me: Champion | null }> {
  const pick = isGameId(game) ? game : '';
  const sql = (where: string, tail: string) =>
    `SELECT s.uid, COALESCE(p.username, 'someone') AS username, SUM(s.played) AS played, SUM(s.won) AS won, SUM(s.net) AS net
     FROM game_stats s LEFT JOIN players p ON p.uid = s.uid WHERE (?1 = '' OR s.game = ?1) ${where} GROUP BY s.uid ${tail}`;
  const [top, mine] = await Promise.all([
    shared(`game-top/${pick || 'all'}`, 30, async () => (await db.prepare(sql('', 'ORDER BY won DESC, net DESC LIMIT 25')).bind(pick).all<Champion>()).results),
    db.prepare(sql('AND s.uid = ?2', '')).bind(pick, me).first<Champion>(),
  ]);
  return { top, me: mine ?? null };
}

/** Cron: settle tables nobody is looking at, retry any payout that failed, and clear out old matches. */
export async function sweepGames(env: Env, ctx: ExecutionContext, now = Date.now()) {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT * FROM game_matches
       WHERE (status IN ('open', 'live') AND deadline < ?1) OR (status IN ('done', 'void') AND paid = 0 AND updated_at > ?2) LIMIT 100`,
    )
    .bind(now - GRACE_MS, now - DAY_MS)
    .all<Row>();
  for (const row of results) await settle(env, ctx, await enforce(env, ctx, row, now));
  await db.prepare(`DELETE FROM game_matches WHERE status IN ('done', 'void') AND paid = 1 AND updated_at < ?`).bind(now - KEEP_MS).run();
}

const tablesOf = async (db: D1Database, uid: string) =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM game_matches WHERE status IN ('open', 'live') AND ${SEATED}`).bind(uid).first<{ n: number }>())?.n ?? 0;

export async function handleGames(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string, url: URL): Promise<Response | null> {
  if (!path.startsWith('/api/games')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();

  if (req.method === 'GET') {
    if (path === '/api/games') return json(await lobby(env, ctx, me));
    if (path === '/api/games/top') return json(await champions(db, me, url.searchParams.get('game') ?? ''));
    const one = path.match(/^\/api\/games\/([a-f0-9]{10})$/);
    if (!one) return err(404, 'Not found');
    const found = await load(db, one[1]);
    if (!found) return err(404, 'That table has closed');
    const row = await enforce(env, ctx, found, now);
    await settle(env, ctx, row);
    return json({ match: await viewOf(db, row, me) });
  }
  if (req.method !== 'POST') return err(405, 'Method not allowed');
  const body = ((await req.json().catch(() => null)) ?? {}) as { game?: unknown; stake?: unknown; seats?: unknown; invite?: unknown; move?: unknown };
  const reply = async (row: Row) => json({ match: await viewOf(db, row, me), balance: await getBalance(db, me) });

  if (path === '/api/games/create') {
    if (!isGameId(body.game)) return err(400, 'Pick a game');
    const game = STREET_GAMES[body.game];
    const stake = body.stake;
    if (typeof stake !== 'number' || !Number.isInteger(stake) || stake < 0 || stake > MAX_STAKE) return err(400, 'Choose a valid stake');
    const self = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();
    if (!self?.username) return err(403, 'Pick a username first');
    let invite: string | null = null;
    if (typeof body.invite === 'string' && body.invite.trim()) {
      const name = body.invite.trim().replace(/^@/, '');
      const them = await db.prepare('SELECT uid FROM players WHERE username = ? COLLATE NOCASE').bind(name).first<{ uid: string }>();
      if (!them) return err(404, `Nobody is called @${name}`);
      if (them.uid === me) return err(400, 'You cannot challenge yourself');
      invite = them.uid;
    }
    // A challenge is head to head.
    const seats = invite ? game.minSeats : Number(body.seats ?? game.minSeats);
    if (!Number.isInteger(seats) || seats < game.minSeats || seats > game.maxSeats) return err(400, 'Choose how many players');
    if ((await tablesOf(db, me)) >= MAX_TABLES) return err(409, `You are already at ${MAX_TABLES} tables. Finish one first`);
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const cid = `game:${id}:stake:0`;
    await db.batch([
      ...stakeStmts(db, me, cid, id, stake, null),
      db
        .prepare(
          `INSERT INTO game_matches (id, game, host, stake, seats, status, players, invite, pot, deadline, created_at, updated_at)
           SELECT ?1, ?2, ?3, ?4, ?5, 'open', ?6, ?7, ?4, ?8, ?9, ?9
           WHERE ?4 = 0 OR EXISTS (SELECT 1 FROM ledger WHERE uid = ?3 AND client_id = ?10 AND applied = 1)`,
        )
        .bind(id, game.id, me, stake, seats, JSON.stringify([me]), invite, now + OPEN_MS, now, cid),
    ]);
    const made = await load(db, id);
    if (!made) return err(402, `You need ${naira(stake)} to open this table`);
    if (invite) tell(env, ctx, [invite], { t: 'game', kind: 'invite', id, game: game.id, by: self.username, stake });
    if (invite) {
      const text = `🎮 ${game.name} challenge${stake ? ` for ${naira(stake)}` : ''}! Open Games on your phone to answer.`;
      ctx.waitUntil(sendGameChallenge(env, ctx, me, invite, text).catch(() => {}));
    }
    return reply(made);
  }

  const act = path.match(/^\/api\/games\/([a-f0-9]{10})\/(join|start|leave|move)$/);
  if (!act) return err(404, 'Not found');
  const [, id, action] = act;

  for (let attempt = 0; attempt < TRIES; attempt++) {
    const found = await load(db, id);
    if (!found) return err(404, 'That table has closed');
    const row = await enforce(env, ctx, found, now);
    const players = playersOf(row);
    const seat = players.indexOf(me);
    const game = STREET_GAMES[row.game];
    const rules = RULES[row.game];
    const others = players.filter((uid) => uid !== me);

    if (action === 'join') {
      if (seat >= 0) return reply(row);
      if (row.status !== 'open' || players.length >= row.seats) return err(409, 'That table is no longer open');
      if (row.invite && row.invite !== me) return err(403, 'That table is a private challenge');
      const self = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();
      if (!self?.username) return err(403, 'Pick a username first');
      if ((await tablesOf(db, me)) >= MAX_TABLES) return err(409, `You are already at ${MAX_TABLES} tables. Finish one first`);
      const seated = [...players, me];
      const full = seated.length >= row.seats;
      const cid = `game:${id}:stake:${row.version + 1}`;
      await db.batch([
        ...stakeStmts(db, me, cid, id, row.stake, row.version),
        db
          .prepare(
            `UPDATE game_matches SET players = ?3, status = ?4, state = ?5, pot = pot + stake, deadline = ?6, version = version + 1, updated_at = ?7
             WHERE id = ?1 AND version = ?2 AND status = 'open'
               AND (stake = 0 OR EXISTS (SELECT 1 FROM ledger WHERE uid = ?8 AND client_id = ?9 AND applied = 1))`,
          )
          .bind(id, row.version, JSON.stringify(seated), full ? 'live' : 'open', full ? JSON.stringify(rules.init(seated.length)) : null, full ? now + game.turnMs : row.deadline, now, me, cid),
      ]);
      const joined = await load(db, id);
      if (!joined || !playersOf(joined).includes(me)) {
        // Either the stake could not be paid, or somebody else changed the table in between.
        if (row.stake > 0 && (await getBalance(db, me)) < row.stake) return err(402, `You need ${naira(row.stake)} to sit at this table`);
        continue;
      }
      tell(env, ctx, others, full ? { t: 'game', kind: 'start', id, game: row.game } : { t: 'game', kind: 'joined', id, game: row.game, by: self.username });
      return reply(joined);
    }

    if (seat < 0) return err(403, 'You are not at this table');

    if (action === 'start') {
      if (row.status !== 'open') return reply(row);
      if (row.host !== me) return err(403, 'Only the host can start early');
      if (players.length < game.minSeats) return err(409, `You need at least ${game.minSeats} players`);
      const next = await commit(db, row, { status: 'live', seats: players.length, state: JSON.stringify(rules.init(players.length)), deadline: now + game.turnMs });
      if (!next) continue;
      tell(env, ctx, others, { t: 'game', kind: 'start', id, game: row.game });
      return reply(next);
    }

    if (action === 'leave') {
      if (row.status === 'open') {
        if (row.host === me) {
          const next = await commit(db, row, { status: 'void' });
          if (!next) continue;
          await settle(env, ctx, next);
          return reply(next);
        }
        const next = await commit(db, row, { players: JSON.stringify(others), pot: row.pot - row.stake });
        if (!next) continue;
        if (row.stake > 0) await db.batch(applyStmts(db, me, `game:${id}:refund:${next.version}`, 'game_refund', id, row.stake));
        tell(env, ctx, others, { t: 'game', kind: 'update', id });
        return reply(next);
      }
      if (row.status !== 'live' || !row.state) return reply(row);
      const state = JSON.parse(row.state);
      rules.drop(state, seat);
      const next = await commit(db, row, after(row, state, now));
      if (!next) continue;
      if (next.status === 'live') tell(env, ctx, others, { t: 'game', kind: 'update', id });
      else await settle(env, ctx, next);
      return reply(next);
    }

    // move
    if (row.status !== 'live' || !row.state) return json({ error: row.status === 'open' ? 'The game has not started' : 'This game is over', match: await viewOf(db, row, me) }, 409);
    const state = JSON.parse(row.state);
    const move = body.move && typeof body.move === 'object' ? (body.move as Move) : {};
    const problem = rules.move(state, seat, move);
    if (problem) return err(400, problem);
    const next = await commit(db, row, after(row, state, now));
    if (!next) continue;
    if (next.status === 'live') tell(env, ctx, others, { t: 'game', kind: 'update', id });
    else await settle(env, ctx, next);
    return reply(next);
  }
  return err(409, 'The table is busy. Try again');
}
