// The directory of live rooms: one Durable Object that knows how full each shard is, so a new connection goes
// straight to a room with space instead of knocking on full ones. Rooms report their head count when someone
// joins or leaves (worker/room.ts). The counts are a hint: a room still refuses when it is really full.

import { DurableObject } from 'cloudflare:workers';

/** Fill a room to this, so a player who arrives a moment later doesn't bounce off a full room. */
const FILL_TO = 48;
/** What a room holds in the end (worker/room.ts MAX_PLAYERS). */
const ROOM_CAP = 50;
/** Counts change with every join and leave, so they are written at most this often instead of each time. */
const SAVE_EVERY = 5000;

export class Lobby extends DurableObject<Env> {
  private counts = new Map<number, number>();
  private dirty = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Record<string, number>>('counts');
      for (const [shard, count] of Object.entries(saved ?? {})) this.counts.set(Number(shard), count);
    });
  }

  private save() {
    if (this.dirty) return;
    this.dirty = true;
    this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + SAVE_EVERY));
  }

  async alarm() {
    this.dirty = false;
    await this.ctx.storage.put('counts', Object.fromEntries(this.counts));
  }

  private setCount(shard: number, count: number) {
    if (this.counts.get(shard) === count) return;
    this.counts.set(shard, count);
    this.save();
  }

  /** A room's real head count (it calls this whenever someone joins or leaves). Answers with the new totals, which the room shows its players. */
  report(shard: number, count: number) {
    this.setCount(shard, count);
    return this.totals();
  }

  /** Several rooms' real head counts at once (the cron's check). */
  reportMany(counts: [shard: number, count: number][]) {
    for (const [shard, count] of counts) this.setCount(shard, count);
  }

  /** A room turned someone away: treat it as full until it reports again. */
  markFull(shard: number) {
    this.counts.set(shard, ROOM_CAP);
    this.save();
  }

  /** The shard a new connection should try: `prefer` if it has space, otherwise the first one that does (a new one if all are full). */
  pick(prefer: number | null): number {
    let shard = prefer !== null && (this.counts.get(prefer) ?? 0) < FILL_TO ? prefer : -1;
    if (shard < 0) {
      shard = 0;
      while ((this.counts.get(shard) ?? 0) >= FILL_TO) shard++;
    }
    // Count the arrival now; the room corrects it with its real number a moment later.
    this.counts.set(shard, (this.counts.get(shard) ?? 0) + 1);
    this.save();
    return shard;
  }

  /** The shards with someone in them, so nobody has to wake an empty room. */
  live(): number[] {
    return [...this.counts].filter(([, count]) => count > 0).map(([shard]) => shard);
  }

  /** Players online across every room, and how many rooms are open. */
  totals() {
    let online = 0;
    let rooms = 0;
    for (const [, count] of this.counts) {
      online += count;
      if (count > 0) rooms++;
    }
    return { online, rooms };
  }
}
