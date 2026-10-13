// One Durable Object per room. Players connect over WebSocket and stream their position + area
// (home or city); the room relays it to everyone else. Clients only draw players who are in the city. Uses hibernatable sockets so idle rooms cost nothing.

import { DurableObject } from 'cloudflare:workers';
import { TIME_RATE } from '../src/game/timeRates';
import type { LobbyActionKind } from '../src/game/shoutout';
import { shardName } from './shards';
import '../src/game/abuja';
import '../src/game/lagos';
import '../src/game/kano';
import { CITY_MAPS } from '../src/game/city';

export interface PlayerInfo {
  id: string;
  username: string;
  name: string;
  look: string;
}

/** Client → server */
type ClientMsg =
  | { t: 'move'; area: string; x: number; y: number; z: number; yaw: number; pose: string }
  | { t: 'hello'; name: string; look: string }
  | { t: 'time' }
  | { t: 'chat'; text: string }
  | { t: 'shoutout'; action: string }
  | { t: 'lobby-action'; action: LobbyActionKind; target: string };

const MAX_PLAYERS = 50;
const START_MINUTES = 7 * 60;
/** The far edge of the biggest map, with a little room past it: the cities are different sizes, and a position is clamped to the box that holds them all. */
const MAP_MAX = Math.max(...Object.values(CITY_MAPS).flatMap((m) => [m.w, m.h])) + 5;
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
/** Club activities worth hailing to the whole club lobby, with the naira each costs. Mirrors game/shoutout.ts. */
const CLUB_SHOUTS: Record<string, number> = { hijack_mic: 0, table_dance: 0, spray_money: 20_000, spray_heavy: 100_000, bottle_service: 75_000, buy_out_bar: 50_000, dj_hype: 10_000, dorime: 500_000, champagne_tower: 250_000, club_takeover: 2_000_000 };
const SHOUT_COOLDOWN = 15_000;
const lastShout = new WeakMap<WebSocket, number>();
const PLACE_SHOUTS: Record<LobbyActionKind, number> = {
  spray: 5_000,
  'cash-slap': 5_000,
  dance: 0,
  drink: 5_000,
  urgent2k: 0,
  drip: 0,
};
const PLACE_SHOUT_COOLDOWN = 1_000;
const lastPlaceShout = new WeakMap<WebSocket, number>();
const POSES = new Set(['stand', 'walk', 'sit', 'lie', 'hidden']);
/** Buildings are split into lobbies of this many players; you only see and chat with your own lobby. */
const LOBBY_SIZE = 10;
/** Outdoors, chat reaches at most this many players within CHAT_RADIUS. */
const CHAT_NEAREST = 10;
const CHAT_RADIUS = 30;
type Pos = { area: string; lobby: number; x: number; y: number; z: number; yaw: number; pose: string };
/**
 * How far a player may still move right now (it refills at the area's speed limit), and, after a move no one could
 * have made, the spot they really were at: the server keeps vouching for that until they could have got there.
 */
type Pace = { at: number; budget: number; hold?: { x: number; z: number; until: number } };
/** `since`: when this socket connected (sockets from before it was recorded have none). */
type Attachment = { info: PlayerInfo; pos: Pos | null; pace?: Pace; since?: number };
/** Tiles per second: on foot indoors, and the fastest ride (a helicopter) on the map. Mirrors three/Avatar.tsx, with slack. */
const speedLimit = (area: string) => (isOutdoors(area) ? 30 : 4);
/** A player who stood still may cover this many seconds of movement at once (late packets arrive in bursts). */
const PACE_BURST = 2;
const HOLD_MAX = 30_000;
/**
 * Attachments are read for every message in the room, so the live copy stays in memory. The socket's own copy is
 * only what the room wakes up with after hibernating, so it is rewritten when a player changes area or pose (they
 * stopped, sat down) and otherwise at most every PERSIST_EVERY.
 */
const attachments = new WeakMap<WebSocket, Attachment>();
const attOf = (ws: WebSocket): Attachment | null => {
  let att = attachments.get(ws);
  if (!att) {
    att = (ws.deserializeAttachment() as Attachment | null) ?? undefined;
    if (att) attachments.set(ws, att);
  }
  return att ?? null;
};
const posOf = (ws: WebSocket) => attOf(ws)?.pos ?? null;
const PERSIST_EVERY = 2000;
const persisted = new WeakMap<WebSocket, number>();
/**
 * Clients only draw other players inside buildings and houses. Outdoors a position is just "who is around", so a
 * player on the move there is relayed this often instead of on every step (and at once when they stop or arrive).
 */
const OUTDOOR_RELAY_EVERY = 1000;
const relayed = new WeakMap<WebSocket, number>();
const isOutdoors = (area: string) => area.startsWith('city:') || area.startsWith('estate:');
/** The area other clients see: lobbies after the first get a `#n` suffix so they never match. */
const netArea = (p: Pos) => (p.lobby ? `${p.area}#${p.lobby}` : p.area);
const netPos = (p: Pos) => {
  const { lobby: _lobby, ...rest } = p;
  return { ...rest, area: netArea(p) };
};

export class Room extends DurableObject<Env> {
  /** Whose house each guest may be in (null: nobody's). In memory because every move of a visitor asks. */
  private hosts = new Map<string, string | null>();

  private async hostOf(guestUid: string) {
    let host = this.hosts.get(guestUid);
    if (host === undefined) {
      host = (await this.ctx.storage.get<string>(`homeVisit:${guestUid}`)) ?? null;
      this.hosts.set(guestUid, host);
    }
    return host;
  }

  /**
   * The world clock: START_MINUTES + `base` game minutes at 1/s up to `changeAt`, then TIME_RATE per second after it.
   * `base`/`changeAt` are recorded the first time the primary room runs after the day became an hour long, so the clock
   * carries on from where it was instead of jumping back. Every shard copies it from the first room, so the whole world
   * shares one time of day.
   */
  async getWorldClock(): Promise<{ base: number; changeAt: number }> {
    let clock = await this.ctx.storage.get<{ base: number; changeAt: number }>('worldClock');
    if (!clock) {
      const primary = this.env.ROOM.idFromName('kaduna');
      if (this.ctx.id.equals(primary)) {
        const now = Date.now();
        const epoch = (await this.ctx.storage.get<number>('worldEpoch')) ?? now;
        await this.ctx.storage.put('worldEpoch', epoch);
        clock = { base: (now - epoch) / 1000, changeAt: now };
      } else {
        clock = await this.env.ROOM.get(primary).getWorldClock();
      }
      await this.ctx.storage.put('worldClock', clock);
    }
    return clock;
  }

  private async worldMinutes() {
    const { base, changeAt } = await this.getWorldClock();
    return START_MINUTES + base + ((Date.now() - changeAt) / 1000) * TIME_RATE;
  }

  async getWorldTime() {
    return { minutes: await this.worldMinutes() };
  }

  /**
   * Tell the lobby how many players are in this room, so new connections go to a room with space. It answers with
   * the city's totals, which go straight to everyone here: the online count on their phone moves as people come and go.
   */
  private async reportToLobby(closing?: WebSocket) {
    const shard = await this.ctx.storage.get<number>('shard');
    if (shard === undefined) return;
    // Counted the way getOnline does (one per player with a socket), not by readyState: a socket that came back from
    // hibernation need not say OPEN, and counting by it told the whole room "0 online" while they were still here.
    const count = new Set(this.ctx.getWebSockets().filter((ws) => ws !== closing).flatMap((ws) => this.ctx.getTags(ws))).size;
    const city = await this.env.LOBBY.get(this.env.LOBBY.idFromName('main')).report(shard, count).catch(() => null);
    if (city) this.broadcastAll({ t: 'city', online: city.online });
  }

  /** Who is connected right now, one entry per player, for the dashboard's online list. */
  listOnline(): { uid: string; username: string; area: string | null; since: number | null }[] {
    const out = new Map<string, { uid: string; username: string; area: string | null; since: number | null }>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = attOf(ws);
      if (att) out.set(att.info.id, { uid: att.info.id, username: att.info.username, area: att.pos?.area ?? null, since: att.since ?? null });
    }
    return [...out.values()];
  }

  /** Players with an open socket right now (a player on two tabs counts once). */
  getOnline() {
    return new Set(this.ctx.getWebSockets().flatMap((ws) => this.ctx.getTags(ws))).size;
  }

  /** Tell everyone connected to this shard (the election opening or closing, say). */
  async announce(message: object) {
    this.broadcastAll(message);
  }

  /** Announce here and pass it on to `shards`, so one caller never has to reach every room itself. */
  async relay(message: object, shards: number[]) {
    this.broadcastAll(message);
    await Promise.all(shards.map((n) => this.env.ROOM.get(this.env.ROOM.idFromName(shardName(n))).announce(message).catch(() => {})));
  }

  async allowHomeVisit(guestUid: string, ownerUid: string, mode: 'invited' | 'burglary' = 'invited', propertyId?: string) {
    await this.ctx.storage.put(`homeVisit:${guestUid}`, ownerUid);
    this.hosts.set(guestUid, ownerUid);
    await this.ctx.storage.put(`homeVisitMode:${guestUid}`, mode);
    if (propertyId) await this.ctx.storage.put(`homeVisitProperty:${guestUid}`, propertyId);
    else await this.ctx.storage.delete(`homeVisitProperty:${guestUid}`);
  }

  async revokeHomeVisit(guestUid: string) {
    await this.ctx.storage.delete(`homeVisit:${guestUid}`);
    this.hosts.set(guestUid, null);
    await this.ctx.storage.delete(`homeVisitMode:${guestUid}`);
    await this.ctx.storage.delete(`homeVisitProperty:${guestUid}`);
    await this.ctx.storage.delete(`stealing:${guestUid}`);
  }

  /** A burglar started carrying an item out; the steal only completes once its time has passed. */
  async startStealing(guestUid: string, itemId: string) {
    await this.ctx.storage.put(`stealing:${guestUid}`, { itemId, at: Date.now() });
  }

  async stealingSince(guestUid: string, itemId: string): Promise<number | null> {
    const s = await this.ctx.storage.get<{ itemId: string; at: number }>(`stealing:${guestUid}`);
    return s && s.itemId === itemId ? s.at : null;
  }

  async stopStealing(guestUid: string) {
    await this.ctx.storage.delete(`stealing:${guestUid}`);
  }

  async homeAccess(guestUid: string, ownerUid: string): Promise<'invited' | 'burglary' | null> {
    if ((await this.hostOf(guestUid)) !== ownerUid) return null;
    return (await this.ctx.storage.get<'invited' | 'burglary'>(`homeVisitMode:${guestUid}`)) ?? 'invited';
  }

  async homeProperty(guestUid: string): Promise<string | null> {
    return (await this.ctx.storage.get<string>(`homeVisitProperty:${guestUid}`)) ?? null;
  }

  private broadcastAll(message: object) {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* closing */
      }
    }
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const uid = req.headers.get('X-Uid')!;

    // One socket per player: a new tab replaces the old one (which saves and steps aside).
    const replacedOther = this.ctx.getWebSockets(uid).length > 0;
    for (const ws of this.ctx.getWebSockets(uid)) ws.close(4000, 'Opened elsewhere');
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response('Room full', { status: 503 });
    const shard = Number(req.headers.get('X-Shard') ?? 0);
    if ((await this.ctx.storage.get<number>('shard')) !== shard) await this.ctx.storage.put('shard', shard);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const username = req.headers.get('X-Username')!;
    const info: PlayerInfo = { id: uid, username, name: username, look: '' };
    this.ctx.acceptWebSocket(server, [uid]);
    const att: Attachment = { info, pos: null, since: Date.now() };
    server.serializeAttachment(att);
    attachments.set(server, att);

    // Tell the newcomer who is already here.
    const others = this.ctx
      .getWebSockets()
      .filter((ws) => ws !== server)
      .map(attOf)
      .filter((a) => !!a?.info);
    server.send(JSON.stringify({
      t: 'welcome',
      you: uid,
      replacedOther,
      minutes: await this.worldMinutes(),
      players: others.map((a) => ({ ...a!.info, ...(a!.pos ? netPos(a!.pos) : {}) })),
    }));
    this.ctx.waitUntil(this.reportToLobby());
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Called by the Worker (RPC): where a player is right now, or null if they're offline. Used to check thefts happen up close. */
  async whereIs(uid: string): Promise<{ area: string; x: number; z: number } | null> {
    for (const ws of this.ctx.getWebSockets(uid)) {
      const { pos, pace } = attOf(ws) ?? ({} as Partial<Attachment>);
      if (!pos) continue;
      // After a jump they are still where they were, as far as anything that needs them close is concerned.
      const at = pace?.hold && pace.hold.until > Date.now() ? pace.hold : pos;
      return { area: pos.area, x: at.x, z: at.z };
    }
    return null;
  }

  /** Called by the Worker (RPC) to deliver a DM or payment to a player who is online. False if they are not in this room. */
  async notify(uid: string, event: object) {
    const data = JSON.stringify(event);
    let sent = false;
    for (const ws of this.ctx.getWebSockets(uid)) {
      try {
        ws.send(data);
        sent = true;
      } catch {
        /* closing */
      }
    }
    return sent;
  }

  /** The move budget after going from `prev` to `pos`: a step too far to be real leaves a hold on where they were. */
  private pace(pace: Pace | undefined, prev: Pos | null, pos: Pos, now: number): Pace {
    const limit = speedLimit(pos.area);
    if (!pace || prev?.area !== pos.area) return { at: now, budget: limit * PACE_BURST };
    const hold = pace.hold && pace.hold.until > now ? pace.hold : undefined;
    const budget = Math.min(limit * PACE_BURST, pace.budget + (limit * (now - pace.at)) / 1000);
    const dist = Math.hypot(pos.x - prev.x, pos.z - prev.z);
    if (dist <= budget) return { at: now, budget: budget - dist, hold };
    const from = hold ?? prev;
    const walk = (Math.hypot(pos.x - from.x, pos.z - from.z) / limit) * 1000;
    return { at: now, budget: limit / 2, hold: { x: from.x, z: from.z, until: now + Math.min(HOLD_MAX, walk) } };
  }

  /** Lowest-numbered lobby of a building with a free spot. Houses and outdoors are one shared lobby. */
  private pickLobby(self: WebSocket, area: string) {
    if (!area.startsWith('place:')) return 0;
    const counts = new Map<number, number>();
    for (const o of this.ctx.getWebSockets()) {
      const op = o === self ? null : posOf(o);
      if (op?.area === area) counts.set(op.lobby, (counts.get(op.lobby) ?? 0) + 1);
    }
    let lobby = 0;
    while ((counts.get(lobby) ?? 0) >= LOBBY_SIZE) lobby++;
    return lobby;
  }

  private broadcast(from: WebSocket, msg: object) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === from) continue;
      try {
        ws.send(data);
      } catch {
        /* closing */
      }
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 1024) return;
    let m: ClientMsg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const att = attOf(ws);
    if (!att) return;
    const id = att.info.id;

    if (m.t === 'time') {
      ws.send(JSON.stringify({ t: 'time', minutes: await this.worldMinutes() }));
    } else if (m.t === 'hello') {
      att.info.name = str(m.name, 18) || att.info.name;
      att.info.look = str(m.look, 200);
      ws.serializeAttachment(att);
      this.broadcast(ws, { t: 'join', ...att.info, ...(att.pos ? netPos(att.pos) : {}) });
    } else if (m.t === 'move') {
      let area = typeof m.area === 'string' && (/^city:[\w-]{1,40}$/.test(m.area) || /^place:[\w-]{1,40}:[\w-]{1,40}$/.test(m.area) || /^estate:[\w-]{1,40}:\d{1,5}$/.test(m.area) || /^home:[\w-]{1,128}$/.test(m.area))
        ? m.area
        : m.area === 'city' ? 'city:kaduna'
          : typeof m.area === 'string' && /^place:[\w-]{1,40}$/.test(m.area) ? `place:kaduna:${m.area.slice(6)}` : 'home';
      const home = area.match(/^home:([\w-]{1,128})$/);
      if (home && home[1] !== id && (await this.hostOf(id)) !== home[1]) area = 'home';
      const prev = att.pos;
      const lobby = prev?.area === area ? prev.lobby : this.pickLobby(ws, area);
      const pos: Pos = { area, lobby, x: num(m.x, -5, MAP_MAX), y: num(m.y, -1, 4), z: num(m.z, -5, MAP_MAX), yaw: num(m.yaw, -10, 10), pose: POSES.has(m.pose) ? m.pose : 'stand' };
      const now = Date.now();
      att.pace = this.pace(att.pace, prev, pos, now);
      att.pos = pos;
      const arrived = prev?.area !== area || prev.lobby !== lobby;
      const changed = arrived || prev?.pose !== pos.pose;
      if (changed || now - (persisted.get(ws) ?? 0) >= PERSIST_EVERY) {
        persisted.set(ws, now);
        ws.serializeAttachment(att);
      }
      if (isOutdoors(area) && !changed && now - (relayed.get(ws) ?? 0) < OUTDOOR_RELAY_EVERY) return;
      relayed.set(ws, now);
      // Moves only go to the players who can see them: this area and lobby, plus the one just left (so they see them go).
      const data = JSON.stringify({ t: 'move', id, ...netPos(pos) });
      const here: object[] = [];
      for (const o of this.ctx.getWebSockets()) {
        if (o === ws) continue;
        const op = posOf(o);
        if (!op) continue;
        const together = op.area === area && op.lobby === lobby;
        if (together && arrived) here.push({ id: this.ctx.getTags(o)[0], ...netPos(op) });
        if (!together && !(arrived && prev && op.area === prev.area && op.lobby === prev.lobby)) continue;
        try {
          o.send(data);
        } catch {
          /* closing */
        }
      }
      if (arrived) {
        ws.send(JSON.stringify({ t: 'lobby', area, lobby }));
        // They heard nothing from this area while they were elsewhere, so tell them who is in it now.
        ws.send(JSON.stringify({ t: 'here', players: here }));
      }
    } else if (m.t === 'lobby-action') {
      const me = att.pos;
      const targetId = str(m.target, 128);
      const now = Date.now();
      if (
        !me ||
        !me.area.startsWith('place:') ||
        !Object.hasOwn(PLACE_SHOUTS, m.action) ||
        !targetId ||
        targetId === id ||
        now - (lastPlaceShout.get(ws) ?? 0) < PLACE_SHOUT_COOLDOWN
      ) return;
      const targetSocket = this.ctx.getWebSockets(targetId).find((other) => {
        const targetPos = posOf(other);
        return targetPos?.area === me.area && targetPos.lobby === me.lobby;
      });
      const target = targetSocket ? attOf(targetSocket) : null;
      if (!target?.info) return;

      lastPlaceShout.set(ws, now);
      const data = JSON.stringify({
        t: 'lobby-action',
        id,
        name: att.info.name,
        username: att.info.username,
        action: m.action,
        amount: PLACE_SHOUTS[m.action],
        target: target.info.username,
        place: me.area.slice(me.area.lastIndexOf(':') + 1),
      });
      for (const other of this.ctx.getWebSockets()) {
        const otherPos = posOf(other);
        if (otherPos?.area !== me.area || otherPos.lobby !== me.lobby) continue;
        try {
          other.send(data);
        } catch {
          /* closing */
        }
      }
    } else if (m.t === 'shoutout') {
      const me = att.pos;
      const now = Date.now();
      if (!me || !/^place:[\w-]+:club$/.test(me.area) || !Object.hasOwn(CLUB_SHOUTS, m.action) || now - (lastShout.get(ws) ?? 0) < SHOUT_COOLDOWN) return;
      lastShout.set(ws, now);
      const data = JSON.stringify({ t: 'shoutout', id, name: att.info.name, username: att.info.username, action: m.action, amount: CLUB_SHOUTS[m.action] });
      for (const o of this.ctx.getWebSockets()) {
        const op = posOf(o);
        if (!op || op.area !== me.area || op.lobby !== me.lobby) continue;
        try {
          o.send(data);
        } catch {
          /* closing */
        }
      }
    } else if (m.t === 'chat') {
      const text = str(m.text, 140).trim();
      if (text) {
        const msg = { t: 'chat', id, name: att.info.name, username: att.info.username, text };
        // Chat never goes game-wide: only to your lobby inside a building, or the nearest few players around you.
        const me = att.pos;
        if (me) {
          const outdoors = me.area.startsWith('city:') || me.area.startsWith('estate:');
          const near: [WebSocket, number][] = [];
          for (const o of this.ctx.getWebSockets()) {
            if (o === ws) continue;
            const op = posOf(o);
            if (!op || op.area !== me.area || op.lobby !== me.lobby) continue;
            const d = (op.x - me.x) ** 2 + (op.z - me.z) ** 2;
            if (!outdoors || d <= CHAT_RADIUS ** 2) near.push([o, d]);
          }
          near.sort((a, b) => a[1] - b[1]);
          const data = JSON.stringify(msg);
          for (const [o] of near.slice(0, outdoors ? CHAT_NEAREST : LOBBY_SIZE)) {
            try {
              o.send(data);
            } catch {
              /* closing */
            }
          }
        }
        ws.send(JSON.stringify(msg));
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const att = attOf(ws);
    // A replaced socket shares the uid; only announce leave if no other socket is left for it.
    if (att && this.ctx.getWebSockets(att.info.id).every((s) => s === ws)) this.broadcast(ws, { t: 'leave', id: att.info.id });
    this.ctx.waitUntil(this.reportToLobby(ws));
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
}
