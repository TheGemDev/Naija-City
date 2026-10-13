// Live rooms are sharded: shard 0 is the original 'kaduna' Durable Object, shard N is 'kaduna-N'. A player
// sticks to one shard (room_assign in D1); a new connection takes the first shard with space, so the world
// grows by itself as people join. Everything that talks to "the room a player is in" goes through here.

import type { Room } from './room';
import { track } from './metrics';
import { readCfVisits, type CfVisits } from './cfTraffic';

const PRIMARY = 'kaduna';
/** A player keeps their shard this long between connections (house visits live in the shard). */
const STICKY_MS = 6 * 3600_000;
/** Reconnecting to the same shard only rewrites room_assign this often, so a wave of reconnects is not a wave of D1 writes. */
const REFRESH_MS = 3600_000;
/** An announcement goes to at most this many rooms directly; past that, each of them passes it on to a group. */
const FAN = 32;
/** The cron checks at most this many rooms' head counts per run. */
const VERIFY_MAX = 400;

export const shardName = (n: number) => (n === 0 ? PRIMARY : `${PRIMARY}-${n}`);
const shardStub = (env: Env, n: number) => env.ROOM.get(env.ROOM.idFromName(shardName(n)));

/** The shard a player is in (0 if they have none yet). */
export async function shardOf(env: Env, uid: string): Promise<number> {
  const row = await env.DB.prepare('SELECT shard FROM room_assign WHERE uid = ?').bind(uid).first<{ shard: number }>();
  return row?.shard ?? 0;
}

export async function roomOf(env: Env, uid: string): Promise<DurableObjectStub<Room>> {
  return shardStub(env, await shardOf(env, uid));
}

/**
 * The shard this isolate last saw each player in. Only a guess, to find someone who is online without asking D1:
 * a room that doesn't have the player sends us back to room_assign.
 */
const seen = new Map<string, number>();
function remember(uid: string, shard: number) {
  if (seen.size >= 5000) seen.clear();
  seen.set(uid, shard);
}

/** Deliver a live event to a player if they are online. Never throws. */
export async function notifyPlayer(env: Env, uid: string, event: object): Promise<void> {
  try {
    const guess = seen.get(uid);
    if (guess !== undefined && (await shardStub(env, guess).notify(uid, event))) return;
    const shard = await shardOf(env, uid);
    remember(uid, shard);
    if (shard !== guess) await shardStub(env, shard).notify(uid, event);
  } catch {
    /* offline or room restarting */
  }
}

/** Deliver a live event to every player online, in every shard. Never throws. */
export async function announceAll(env: Env, event: object): Promise<void> {
  try {
    const shards = await lobbyOf(env).live().catch(() => [0]);
    if (shards.length <= FAN) {
      await Promise.all(shards.map((n) => shardStub(env, n).announce(event).catch(() => {})));
      return;
    }
    const size = Math.ceil(shards.length / FAN);
    const groups: number[][] = [];
    for (let i = 0; i < shards.length; i += size) groups.push(shards.slice(i, i + size));
    await Promise.all(groups.map(([first, ...rest]) => shardStub(env, first).relay(event, rest).catch(() => {})));
  } catch {
    /* rooms restarting */
  }
}

/** Where a player is right now, or null if offline. */
export async function whereIs(env: Env, uid: string) {
  const guess = seen.get(uid);
  if (guess !== undefined) {
    const at = await shardStub(env, guess).whereIs(uid);
    if (at) return at;
  }
  const shard = await shardOf(env, uid);
  remember(uid, shard);
  return shard === guess ? null : shardStub(env, shard).whereIs(uid);
}

export const lobbyOf = (env: Env) => env.LOBBY.get(env.LOBBY.idFromName('main'));

/** Everyone connected in every live room, with the shard they are in. Shard 0 is always asked, in case the lobby's count is stale. */
export async function onlinePlayers(env: Env) {
  const shards = [...new Set([0, ...(await lobbyOf(env).live().catch(() => []))])];
  const lists = await Promise.all(shards.map((n) =>
    shardStub(env, n).listOnline().then((l) => l.map((p) => ({ ...p, shard: n }))).catch((e) => {
      console.error(`listOnline failed on shard ${n}`, e);
      return [];
    })));
  return lists.flat();
}

/** Open the player's socket: the lobby names a room with space (their own if it has some); a room that is really full sends us back to the lobby. */
export async function connectPlayer(env: Env, uid: string, req: Request, headers: Headers): Promise<Response> {
  const row = await env.DB.prepare('SELECT shard, at FROM room_assign WHERE uid = ?').bind(uid).first<{ shard: number; at: number }>();
  const lobby = lobbyOf(env);
  let n = await lobby.pick(row && Date.now() - row.at < STICKY_MS ? row.shard : null).catch(() => row?.shard ?? 0);
  for (let tries = 0; tries < 40; tries++) {
    const h = new Headers(headers);
    h.set('X-Shard', String(n));
    const res = await shardStub(env, n).fetch(new Request(req, { headers: h }));
    if (res.status === 503) {
      track(env, 'room_full', { blobs: [String(n)] });
      await lobby.markFull(n).catch(() => {});
      n = await lobby.pick(null).catch(() => n + 1);
      continue;
    }
    if (res.status === 101) {
      track(env, 'connect', { blobs: [String(n)] });
      remember(uid, n);
      if (!row || row.shard !== n || Date.now() - row.at >= REFRESH_MS) {
        await env.DB.prepare('INSERT INTO room_assign (uid, shard, at) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET shard = excluded.shard, at = excluded.at')
          .bind(uid, n, Date.now())
          .run();
      }
    }
    return res;
  }
  return new Response('The world is full', { status: 503 });
}

/**
 * Put `guest` in the same shard as `host`, so a house visit happens where the owner is. If the guest was
 * elsewhere their socket is told to reconnect. Do this before allowHomeVisit.
 */
export async function followHost(env: Env, guest: string, host: string): Promise<void> {
  const [from, to] = await Promise.all([shardOf(env, guest), shardOf(env, host)]);
  if (from === to) return;
  await env.DB.prepare('INSERT INTO room_assign (uid, shard, at) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET shard = excluded.shard, at = excluded.at')
    .bind(guest, to, Date.now())
    .run();
  remember(guest, to);
  await shardStub(env, from).notify(guest, { t: 'reshard' }).catch(() => {});
}

/**
 * Players online across every shard, and how many rooms are open, from the lobby's counts (with the visit counts
 * from Cloudflare's analytics, see worker/cfTraffic.ts). The counts are only a hint (a dropped socket can leave one stale), so with `verify` (the
 * cron) the rooms that look occupied are asked for their real head count first and the lobby is corrected.
 */
export async function onlineEverywhere(env: Env, verify = false): Promise<{ online: number; rooms: number; visits: CfVisits | null }> {
  const lobby = lobbyOf(env);
  try {
    if (verify) {
      const live = await lobby.live();
      // Too many rooms for one run: take a different slice each time.
      const from = live.length > VERIFY_MAX ? (Math.floor(Date.now() / 300_000) * VERIFY_MAX) % live.length : 0;
      const shards = [...live.slice(from), ...live.slice(0, from)].slice(0, VERIFY_MAX);
      const counts = await Promise.all(shards.map((n) => shardStub(env, n).getOnline().catch(() => null)));
      await lobby.reportMany(shards.flatMap((n, i): [number, number][] => (counts[i] === null ? [] : [[n, counts[i]]])));
    }
    return { ...(await lobby.totals()), visits: await readCfVisits(env) };
  } catch {
    return { online: 0, rooms: 0, visits: null };
  }
}
