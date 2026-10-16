// Guns (rules: src/game/guns.ts, migration 0098). Guns are illegal: buying one from the Fixer's dealer, rounds,
// a vest and an armed bodyguard; then robbing a player at gunpoint, shooting one, or holding up a passer-by or a shop.
// A robbery or shooting of a player is written into `crimes` like any street robbery (kind 'pickpocket', `armed` set),
// so the victim reports it, the police hunt the robber and bail works the same. Nobody dies: a player who is shot is
// hurt for a while and pays a hospital bill. Anyone arrested with a gun loses it and pays a huge fine (confiscateGun).

import type { CrimeReport } from '../src/game/crime';
import { GUNS, GUN_RULES, HOLDUPS, isGun, type GunId, type GunResult, type GunSeizure, type GunState, type HoldupKind, type ShotEvent } from '../src/game/guns';
import type { FirebaseUser } from './auth';
import { injuredUntil, jailedUntil, jailStmt, loadLaws, rand, transfer } from './crime';
import { handle, naira, postFeed } from './feed';
import { notifyPlayer, whereIs } from './shards';
import { applyStmts, ensureWallet, getBalance } from './wallet';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

interface GunRow { gun: GunId; ammo: number; bought_at: number }
interface PlayerRow { username: string | null; vest_hits: number; escort_until: number | null; gun_at: number | null; last_arrest_at: number | null }

const playerOf = (db: D1Database, uid: string) =>
  db.prepare('SELECT username, vest_hits, escort_until, gun_at, last_arrest_at FROM players WHERE uid = ?').bind(uid).first<PlayerRow>();

/**
 * The police found a gun on someone they arrested: it goes, and they pay its fine (as much as they have). Null when
 * there was no gun, or another call already took it. Run on every arrest's search (worker/phoneSearch.ts).
 */
export async function confiscateGun(db: D1Database, uid: string, now = Date.now()): Promise<GunSeizure | null> {
  const gone = await db.prepare('DELETE FROM guns WHERE uid = ? RETURNING gun').bind(uid).first<{ gun: string }>();
  if (!gone || !isGun(gone.gun)) return null;
  const fine = await transfer(db, uid, null, GUNS[gone.gun].fine, 'fine', '', `gun-fine:${uid}:${now}`);
  return { gun: gone.gun, fine };
}

/**
 * The gun this player carries. One bought before their last arrest should have gone at that arrest's search; if an
 * arrest skipped the search, it goes now, fine and all, and `seized` says so (once, on the call that takes it).
 */
async function gunOf(db: D1Database, uid: string): Promise<{ gun: GunRow | null; seized: GunSeizure | null }> {
  const r = await db
    .prepare('SELECT g.gun, g.ammo, g.bought_at, p.last_arrest_at FROM guns g JOIN players p ON p.uid = g.uid WHERE g.uid = ?')
    .bind(uid)
    .first<GunRow & { last_arrest_at: number | null }>();
  if (!r || !isGun(r.gun)) return { gun: null, seized: null };
  if (r.last_arrest_at && r.last_arrest_at > r.bought_at) return { gun: null, seized: await confiscateGun(db, uid) };
  return { gun: r, seized: null };
}

async function stateOf(db: D1Database, uid: string, now: number): Promise<GunState> {
  const [{ gun, seized }, p] = await Promise.all([gunOf(db, uid), playerOf(db, uid)]);
  return {
    gun: gun ? { id: gun.gun, ammo: gun.ammo } : null,
    vest: p?.vest_hits ?? 0,
    escortUntil: p?.escort_until && p.escort_until > now ? p.escort_until : null,
    readyAt: (p?.gun_at ?? 0) + GUN_RULES.cooldownMs,
    seized,
  };
}

/** Pay for something: out of the wallet, all of it or nothing. */
const pay = (db: D1Database, uid: string, clientId: string, ref: string, amount: number) => [ensureWallet(db, uid), ...applyStmts(db, uid, clientId, 'spend', ref, -amount)];

/** Someone hit by a bullet: hurt for a while, and the hospital bill out of their wallet. */
async function hurt(db: D1Database, uid: string, minutes: number, ref: string, now: number) {
  const until = now + minutes * 60_000;
  await db.prepare('UPDATE players SET injured_until = MAX(COALESCE(injured_until, 0), ?) WHERE uid = ?').bind(until, uid).run();
  const s = GUN_RULES.shoot;
  const due = Math.min(s.billCap, s.bill + Math.round((await getBalance(db, uid)) * s.billPct));
  const bill = await transfer(db, uid, null, due, 'hospital', '', `gunshot:${ref}`);
  return { until, bill };
}

/** Both online, in the same place (a street or a building, not someone's home), close enough. */
async function closeEnough(env: Env, a: string, b: string): Promise<string | null> {
  const [x, y] = await Promise.all([whereIs(env, a), whereIs(env, b)]);
  if (!x) return 'Go online in the game first';
  if (!y) return 'They are not around right now';
  if (x.area === 'home' || x.area !== y.area) return 'They are not here';
  if (Math.hypot(x.x - y.x, x.z - y.z) > GUN_RULES.reach) return 'Get closer first';
  return null;
}

/** Everything an armed job needs first: a free, unhurt shooter with a loaded gun, past the cooldown. Claims the cooldown. */
async function ready(db: D1Database, me: string, now: number): Promise<{ error: string; status: number } | { gun: GunRow; p: PlayerRow }> {
  const [{ gun, seized }, p] = await Promise.all([gunOf(db, me), playerOf(db, me)]);
  if (!p?.username) return { error: 'Pick a username first', status: 403 };
  if (!gun) return { error: seized ? `The police kept your ${GUNS[seized.gun].name} when they arrested you` : 'You don’t have a gun', status: 409 };
  if (gun.ammo < GUNS[gun.gun].rounds) return { error: 'You are out of rounds. Buy a box first', status: 409 };
  if (await jailedUntil(db, me)) return { error: 'You are in a police cell', status: 403 };
  if (await injuredUntil(db, me)) return { error: 'You are hurt. Rest first', status: 403 };
  const claimed = await db.prepare('UPDATE players SET gun_at = ?1 WHERE uid = ?2 AND COALESCE(gun_at, 0) <= ?3 RETURNING uid').bind(now, me, now - GUN_RULES.cooldownMs).first();
  if (!claimed) return { error: 'Lie low for a few minutes before the next job', status: 429 };
  // The rounds are spent whatever happens next.
  await db.prepare('UPDATE guns SET ammo = ammo - ? WHERE uid = ?').bind(GUNS[gun.gun].rounds, me).run();
  return { gun, p };
}

export async function handleGuns(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/guns')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();
  const tell = (uid: string, event: object) => ctx.waitUntil(notifyPlayer(env, uid, event));

  if (path === '/api/guns' && req.method === 'GET') return json(await stateOf(db, me, now));
  if (req.method !== 'POST') return err(405, 'Method not allowed');
  const b = (await req.json().catch(() => null)) as { gun?: string; target?: string; kind?: string } | null;
  const done = async (extra: object = {}) => json({ ...extra, state: await stateOf(db, me, now), balance: await getBalance(db, me) });

  /* ---------- Buying ---------- */

  if (path === '/api/guns/buy') {
    if (!isGun(b?.gun)) return err(400, 'Pick a gun');
    const def = GUNS[b.gun];
    if (await jailedUntil(db, me)) return err(403, 'You are in a police cell');
    if ((await getBalance(db, me)) < def.price) return err(402, `You need ${naira(def.price)}`);
    await db.batch([
      ...pay(db, me, `gun-buy:${me}:${now}`, `gun:${def.id}`, def.price),
      db.prepare('INSERT INTO guns (uid, gun, ammo, licensed, bought_at) VALUES (?1, ?2, ?3, 0, ?4) ON CONFLICT(uid) DO UPDATE SET gun = ?2, ammo = ?3, licensed = 0, bought_at = ?4')
        .bind(me, def.id, GUN_RULES.startRounds, now),
    ]);
    return done();
  }

  if (path === '/api/guns/ammo') {
    const { gun } = await gunOf(db, me);
    if (!gun) return err(409, 'Buy a gun first');
    const price = GUN_RULES.box.price;
    if ((await getBalance(db, me)) < price) return err(402, `You need ${naira(price)}`);
    await db.batch([...pay(db, me, `gun-ammo:${me}:${now}`, 'gun-ammo', price), db.prepare('UPDATE guns SET ammo = ammo + ? WHERE uid = ?').bind(GUN_RULES.box.rounds, me)]);
    return done();
  }

  if (path === '/api/guns/vest' || path === '/api/guns/escort') {
    const vest = path.endsWith('vest');
    const price = vest ? GUN_RULES.vest.price : GUN_RULES.escort.price;
    if (await jailedUntil(db, me)) return err(403, 'You are in a police cell');
    if ((await getBalance(db, me)) < price) return err(402, `You need ${naira(price)}`);
    await db.batch([
      ...pay(db, me, `gun-${vest ? 'vest' : 'escort'}:${me}:${now}`, vest ? 'vest' : 'escort', price),
      vest
        ? db.prepare('UPDATE players SET vest_hits = ? WHERE uid = ?').bind(GUN_RULES.vest.hits, me)
        : db.prepare('UPDATE players SET escort_until = MAX(COALESCE(escort_until, 0), ?1) + ?2 WHERE uid = ?3').bind(now, GUN_RULES.escort.hours * 3_600_000, me),
    ]);
    return done();
  }

  /* ---------- Robbing and shooting a player ---------- */

  if (path === '/api/guns/rob' || path === '/api/guns/shoot') {
    const shooting = path.endsWith('shoot');
    const target = b?.target;
    if (typeof target !== 'string') return err(400, 'Pick someone');
    if (target === me) return err(400, 'Not yourself');
    const victim = await playerOf(db, target);
    if (!victim?.username) return err(404, 'No such player');
    // A prisoner is behind the bars of a police cell (src/game/cells.ts), with a warder at the desk.
    if (await jailedUntil(db, target)) return err(409, 'They are behind bars');
    const scene = await closeEnough(env, me, target);
    if (scene) return err(409, scene);
    const shield = await db.prepare('SELECT 1 FROM crimes WHERE victim_uid = ? AND armed IS NOT NULL AND success = 1 AND created_at > ?').bind(target, now - GUN_RULES.victimShieldMs).first();
    if (shield) return err(429, 'They were just held up. Everybody is watching them now');
    const go = await ready(db, me, now);
    if ('error' in go) return err(go.status, go.error);
    const { gun, p } = go;
    const def = GUNS[gun.gun];
    const names = { me: p.username, them: victim.username };

    let result: GunResult = { outcome: 'failed', amount: 0 };
    let success = false;
    // The victim fights back first: an armed bodyguard, or their own gun.
    const theirs = (await gunOf(db, target)).gun;
    const guarded = !!victim.escort_until && victim.escort_until > now && rand() < GUN_RULES.escort.stops;
    const drew = !guarded && !!theirs && theirs.ammo > 0 && rand() < GUN_RULES.shootBack * GUNS[theirs.gun].aim;
    if (guarded || drew) {
      if (drew) await db.prepare('UPDATE guns SET ammo = ammo - 1 WHERE uid = ? AND ammo > 0').bind(target).run();
      const aim = guarded ? GUN_RULES.escort.aim : GUNS[theirs!.gun].aim;
      result = { outcome: guarded ? 'escort' : 'shotBack', amount: 0 };
      if (rand() < aim) {
        // My own vest might save me.
        const vest = await db.prepare('UPDATE players SET vest_hits = vest_hits - 1 WHERE uid = ? AND vest_hits > 0 RETURNING vest_hits').bind(me).first();
        if (!vest) {
          const h = await hurt(db, me, guarded ? GUNS.pistol.hurtMin : GUNS[theirs!.gun].hurtMin, `${me}:${now}`, now);
          result = { ...result, hurtUntil: h.until, bill: h.bill };
        }
      }
    } else if (shooting) {
      if (rand() < def.aim) {
        const vest = await db.prepare('UPDATE players SET vest_hits = vest_hits - 1 WHERE uid = ? AND vest_hits > 0 RETURNING vest_hits').bind(target).first();
        if (vest) result = { outcome: 'vest', amount: 0 };
        else {
          const h = await hurt(db, target, def.hurtMin, `${target}:${now}`, now);
          // What they had on them as they went down.
          const s = GUN_RULES.shoot;
          const grab = Math.min(s.grabCap, Math.floor((await getBalance(db, target)) * s.grab));
          const took = grab > 0 ? await transfer(db, target, me, grab, 'theft_out', 'theft_in', `gunshot-grab:${target}:${now}`) : 0;
          result = { outcome: 'shot', amount: took };
          success = true;
          tell(target, { t: 'shot', by: names.me ?? 'someone', gun: def.id, hurt: true, until: h.until, bill: h.bill, took, vest: false } satisfies ShotEvent);
        }
      } else result = { outcome: 'missed', amount: 0 };
      if (result.outcome === 'vest') tell(target, { t: 'shot', by: names.me ?? 'someone', gun: def.id, hurt: false, until: null, bill: 0, took: 0, vest: true } satisfies ShotEvent);
    } else if (rand() < GUN_RULES.rob.works) {
      const r = GUN_RULES.rob;
      const want = Math.min(r.cap, Math.floor((await getBalance(db, target)) * (r.min + rand() * (r.max - r.min))));
      const took = want > 0 ? await transfer(db, target, me, want, 'theft_out', 'theft_in', `gunpoint:${target}:${now}`) : 0;
      result = { outcome: took ? 'robbed' : 'empty', amount: took };
      success = true;
    }

    // Gunshots bring the police: always when the victim's guard or gun answered, most of the time otherwise. Then it
    // is a warrant like any other, and the arrest takes the gun.
    const wanted = result.outcome === 'escort' || result.outcome === 'shotBack' || rand() < GUN_RULES.traced;
    const row = await db
      .prepare(
        `INSERT INTO crimes (thief_uid, victim_uid, kind, success, amount, status, reported_at, created_at, armed)
         VALUES (?1, ?2, 'pickpocket', ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`,
      )
      .bind(me, target, success ? 1 : 0, result.amount, wanted ? 'wanted' : 'open', wanted ? now : null, now, shooting ? 'shoot' : 'rob')
      .first<{ id: number }>();
    result.wanted = wanted;

    const report: CrimeReport = {
      id: row!.id, kind: 'pickpocket', armed: shooting ? 'shoot' : 'rob', success, amount: result.amount, item: null,
      status: wanted ? 'wanted' : 'open', returned: 0, at: now, reportedAt: wanted ? now : null, guard: result.outcome === 'escort' ? 'bodyguard' : null,
      bounty: 0, thief: names.me ?? 'someone', victim: names.them ?? 'someone',
    };
    // A shooting victim already heard about it; anyone else hears what happened.
    if (result.outcome !== 'shot' && result.outcome !== 'vest') tell(target, { t: 'robbed', crime: report });

    const who = handle(names.me), them = handle(names.them);
    const feed: Partial<Record<GunResult['outcome'], [string, string]>> = {
      robbed: ['🔫', `ARMED ROBBERY: ${who} pulled a ${def.name.toLowerCase()} on ${them} in broad daylight and walked off with ${naira(result.amount)}. ${wanted ? 'Police are after them.' : 'Nobody saw the face.'} 😨`],
      shot: ['🚑', `GUNSHOTS: ${them} was shot by ${who} and rushed to hospital. ${wanted ? 'Police have the shooter’s name.' : 'The shooter disappeared into the crowd.'} 🚨`],
      escort: ['🕶️', `${who} tried to rob ${them} at gunpoint and met their armed bodyguard. ${result.hurtUntil ? 'The robber left in an ambulance.' : 'The robber ran.'} 💪🏾`],
      shotBack: ['🔫', `${who} tried to rob ${them}, but ${them} was carrying too. ${result.hurtUntil ? 'The robber is in hospital.' : 'The robber ran for their life.'} 😳`],
      vest: ['🦺', `${who} shot ${them}. The bulletproof vest took it. ${them} is shaken but walking. 🙏🏾`],
    };
    const line = feed[result.outcome];
    if (line) await postFeed(db, me, 'crime', line[0], line[1]).catch(() => {});
    return done({ result });
  }

  /* ---------- Holding up someone who isn't a player ---------- */

  if (path === '/api/guns/holdup') {
    const kind = b?.kind === 'shop' || b?.kind === 'passerby' ? (b.kind as HoldupKind) : null;
    if (!kind) return err(400, 'Pick who to hold up');
    const here = await whereIs(env, me);
    if (!here || here.area === 'home') return err(409, kind === 'shop' ? 'Go to a shop in town first' : 'Go out onto the street first');
    if (kind === 'shop' && !here.area.startsWith('place:')) return err(409, 'Walk into a shop first');
    const go = await ready(db, me, now);
    if ('error' in go) return err(go.status, go.error);
    const h = HOLDUPS[kind];
    const who = handle(go.p.username);
    let result: GunResult;
    if (rand() < h.shotBack) {
      // The shopkeeper had a gun under the counter.
      const shot = await hurt(db, me, 15, `${me}:${now}`, now);
      result = { outcome: 'shotBack', amount: 0, hurtUntil: shot.until, bill: shot.bill };
      await postFeed(db, me, 'crime', '🏪', `${who} tried to hold up a shop and the shopkeeper shot first. The robber is in hospital. 🚑`).catch(() => {});
    } else if (rand() < h.works) {
      const [lo, hi] = h.loot;
      const loot = Math.round((lo + rand() * (hi - lo)) / 500) * 500;
      if (rand() < h.police) {
        // The police were round the corner: the loot goes back and so do you, to a cell. They keep the gun and fine you.
        const laws = await loadLaws(db);
        const until = now + laws.jailMinutes * 60_000;
        await jailStmt(db, me, until, [`Armed robbery · ${kind === 'shop' ? 'held up a shop' : 'robbed a passer-by'} at gunpoint`]).run();
        const seized = await confiscateGun(db, me, now);
        result = { outcome: 'arrested', amount: 0, jailedUntil: until, seized };
        await postFeed(db, me, 'crime', '🚔', `${who} ${kind === 'shop' ? 'held up a shop' : 'robbed a passer-by at gunpoint'} and ran straight into a police patrol. Gun, loot and all, straight to the cell${seized ? `, with a ${naira(seized.fine)} fine for the gun` : ''}. ⛓️`).catch(() => {});
      } else {
        // Robbery money is dirty money: the EFCC can read it in the ledger.
        await db.batch([ensureWallet(db, me), ...applyStmts(db, me, `holdup:${me}:${now}`, 'theft_in', kind, loot)]);
        result = { outcome: 'robbed', amount: loot };
        if (kind === 'shop') await postFeed(db, me, 'crime', '🏪', `A shop was robbed at gunpoint this afternoon. ${naira(loot)} gone from the till. Traders are closing early. 😨`).catch(() => {});
      }
    } else {
      result = { outcome: 'failed', amount: 0 };
    }
    return done({ result });
  }

  return err(404, 'Unknown gun action');
}
