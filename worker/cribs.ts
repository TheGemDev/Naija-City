// Cribs: house style scores, visitor ratings, the Cribs leaderboard and feed of house tours, saved layouts and
// interior designer jobs. Rules in src/game/cribs.ts; tables in migrations/0102_cribs.sql.
//
// Every score is worked out here from the owner's saved house (the save the server already holds, with furniture
// checked against what they paid for), never taken from the client. A rating needs a visit the room actually let
// happen. A designer job's money sits in escrow from the moment the client hires and moves exactly once, on a
// claimed status change, with ledger ids that can only be written once.

import type { FirebaseUser } from './auth';
import { applyStmts, getBalance } from './wallet';
import { transfer, usernames } from './crime';
import { handle, naira, postFeed } from './feed';
import { sendPush } from './push';
import { followHost, roomOf } from './shards';
import { houseOf } from './social';
import { ITEMS } from '../src/game/catalog';
import { MAX_GRID_H, MAX_GRID_W, arrivalCell, placementError, type PlacedItem } from '../src/game/grid';
import { isColourRef, type HousePaint } from '../src/game/paint';
import type { HouseFinish } from '../src/game/finishes';
import { REGION_BY_ID, STAGES } from '../src/game/property';
import { getRegion } from '../src/game/regions';
import { skillLevel } from '../src/game/career';
import {
  DESIGN_JOB, LAYOUTS, RATING, STYLE_PACK_BY_ID, cribLayout, dayNumber, finalScore, layoutQuote, propertyLayout, ratedAverage, scoreCrib, snapshotHouse,
  snapshotValue, tierOf, type CribItem, type CribScore, type DesignDraft, type DesignJobStatus, type LayoutSnapshot,
} from '../src/game/cribs';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const body = async <T>(req: Request) => (await req.json().catch(() => null)) as T | null;

const STARTER = 'starter';
const TOUR = { captionMax: 120, cooldownMs: 3 * 3600_000, keepMs: 7 * 24 * 3600_000, page: 20 } as const;
const LEADERBOARD = 50;
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const CITIES = ['kaduna', 'abuja', 'lagos', 'kano'];

/* ---------- Reading houses out of a save ---------- */

type SaveProperty = { id?: string; region?: string; design?: string | null; stage?: number; items?: unknown; extensions?: string[]; rooms?: Record<string, { type?: string; name?: string }>; [k: string]: unknown };
export type SaveJson = Record<string, unknown> & {
  items?: unknown;
  furnitureInventory?: unknown;
  properties?: SaveProperty[];
  activeHouseId?: string | null;
  homePropertyId?: string | null;
  homeState?: string;
  wallEdits?: Record<string, unknown>;
  housePaint?: Record<string, unknown>;
  ownedCars?: unknown;
};

/** Placed items that are well formed and in the catalogue. Extra fields are kept. */
export function cleanItems(raw: unknown): CribItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is CribItem => {
    if (!i || typeof i !== 'object') return false;
    const it = i as Record<string, unknown>;
    return typeof it.type === 'string' && !!ITEMS[it.type] && Number.isInteger(it.x) && Number.isInteger(it.z) &&
      (it.x as number) >= 0 && (it.x as number) < MAX_GRID_W && (it.z as number) >= 0 && (it.z as number) < MAX_GRID_H && typeof it.rot === 'number';
  }).slice(0, LAYOUTS.maxItems);
}

const cleanPaint = (raw: unknown): HousePaint => {
  const out: HousePaint = {};
  for (const part of ['outer', 'inner'] as const) {
    const id = (raw as Record<string, unknown> | undefined)?.[part];
    if (isColourRef(id)) out[part] = id;
  }
  return out;
};

export interface SavedHouse { pid: string; design: string | null; layout: string | null; city: string; items: CribItem[]; walls: string[]; paint: HousePaint; property?: SaveProperty }

/** The house the save says the player is in right now. */
export const activeKey = (save: SaveJson) => save.activeHouseId ?? save.homePropertyId ?? STARTER;

/** Every house in a save worth scoring: finished properties, and the starter house while it is the one lived in. */
export function savedHouses(save: SaveJson): SavedHouse[] {
  const active = activeKey(save);
  const cars = Array.isArray(save.ownedCars) && save.ownedCars.length > 0;
  const homeCity = getRegion(typeof save.homeState === 'string' ? save.homeState : '')?.id ?? 'kaduna';
  const walls = (pid: string) => {
    const w = save.wallEdits?.[pid];
    return Array.isArray(w) ? w.filter((k): k is string => typeof k === 'string').slice(0, 300) : [];
  };
  const out: SavedHouse[] = [];
  for (const p of save.properties ?? []) {
    if (!p || typeof p.id !== 'string' || (p.stage ?? 0) < STAGES.length) continue;
    const items = cleanItems(p.id === active ? save.items : p.items);
    out.push({
      pid: p.id, design: p.design ?? null, layout: propertyLayout(p as never, cars && p.id === active), city: REGION_BY_ID[p.region ?? '']?.city ?? homeCity,
      items, walls: walls(p.id), paint: cleanPaint(save.housePaint?.[p.id]), property: p,
    });
  }
  if (active === STARTER || !out.some((h) => h.pid === active)) {
    if (active === STARTER) out.push({ pid: STARTER, design: null, layout: null, city: homeCity, items: cleanItems(save.items), walls: walls(STARTER), paint: cleanPaint(save.housePaint?.[STARTER]) });
  }
  return out;
}

/** The decorating data of one house, every per-house value in the save, as the score's finishes. */
function decorOf(save: SaveJson, house: SavedHouse) {
  const snap = snapshotHouse(save, house.pid, house.items, house.design);
  // houseFinish is read on its own (the score knows its shape); anything else per house counts generically.
  const { lighting, houseFinish, ...rest } = { ...(snap.decor ?? {}), ...(snap.prop ?? {}) } as Record<string, unknown>;
  return { finishes: rest, lighting, finish: houseFinish as HouseFinish | undefined };
}

export function scoreSaved(save: SaveJson, house: SavedHouse): CribScore {
  const { finishes, lighting, finish } = decorOf(save, house);
  return scoreCrib({ items: house.items, design: house.layout, walls: house.walls, paint: house.paint, rooms: house.property?.rooms ?? null, finishes, lighting, finish });
}

async function loadSave(db: D1Database, uid: string): Promise<SaveJson | null> {
  const row = await db.prepare('SELECT data FROM saves WHERE uid = ?').bind(uid).first<{ data: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.data) as SaveJson;
  } catch {
    return null;
  }
}

/* ---------- Scores ---------- */

/** Every house's ratings in the window: sum and count, by pid. */
async function ratingsOf(db: D1Database, uid: string, now: number): Promise<Map<string, { sum: number; n: number }>> {
  const { results } = await db
    .prepare('SELECT pid, SUM(stars) AS sum, COUNT(*) AS n FROM crib_ratings WHERE owner_uid = ? AND created_at > ? GROUP BY pid')
    .bind(uid, now - RATING.windowMs)
    .all<{ pid: string; sum: number; n: number }>();
  return new Map(results.map((r) => [r.pid, { sum: r.sum, n: r.n }]));
}

interface ScoreRow { uid: string; pid: string; design: string | null; city: string; base: number; score: number; tier: string; value: number; items: number; parts: string; updated_at: number }

/**
 * Works out every house in a player's saved game and keeps crib_scores in step: changed rows are written, houses
 * they no longer have are dropped. Runs after each save upload (worker/index.ts) and whenever a score is asked for.
 */
export async function refreshCribs(db: D1Database, uid: string, save?: SaveJson | null): Promise<ScoreRow[]> {
  const data = save ?? (await loadSave(db, uid));
  if (!data) return [];
  const now = Date.now();
  const [ratings, { results: old }] = await Promise.all([
    ratingsOf(db, uid, now),
    db.prepare('SELECT * FROM crib_scores WHERE uid = ?').bind(uid).all<ScoreRow>(),
  ]);
  const rows: ScoreRow[] = savedHouses(data).map((h) => {
    const s = scoreSaved(data, h);
    const r = ratings.get(h.pid);
    const score = finalScore(s.base, r?.sum ?? 0, r?.n ?? 0);
    return { uid, pid: h.pid, design: h.design, city: h.city, base: s.base, score, tier: tierOf(score).id, value: s.value, items: s.items, parts: JSON.stringify(s.parts), updated_at: now };
  });
  const before = new Map(old.map((r) => [r.pid, r]));
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    const o = before.get(r.pid);
    if (o && o.base === r.base && o.score === r.score && o.value === r.value && o.items === r.items && o.city === r.city && o.parts === r.parts) continue;
    stmts.push(db.prepare(
      `INSERT INTO crib_scores (uid, pid, design, city, base, score, tier, value, items, parts, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(uid, pid) DO UPDATE SET design = ?3, city = ?4, base = ?5, score = ?6, tier = ?7, value = ?8, items = ?9, parts = ?10, updated_at = ?11`,
    ).bind(r.uid, r.pid, r.design, r.city, r.base, r.score, r.tier, r.value, r.items, r.parts, r.updated_at));
  }
  for (const o of old) if (!rows.some((r) => r.pid === o.pid)) stmts.push(db.prepare('DELETE FROM crib_scores WHERE uid = ? AND pid = ?').bind(uid, o.pid));
  if (stmts.length) await db.batch(stmts);
  return rows;
}

/** A player's best crib score (0 with none). The owambe reads it. */
export async function bestCribScore(db: D1Database, uid: string): Promise<number> {
  const row = await db.prepare('SELECT MAX(score) AS s FROM crib_scores WHERE uid = ?').bind(uid).first<{ s: number | null }>().catch(() => null);
  return row?.s ?? 0;
}

const viewRow = (r: ScoreRow, rating?: { sum: number; n: number }) => ({
  pid: r.pid, design: r.design, city: r.city, base: r.base, score: r.score, tier: r.tier, value: r.value, items: r.items,
  parts: JSON.parse(r.parts || '[]'), rating: rating && rating.n ? { avg: Math.round((rating.sum / rating.n) * 10) / 10, n: rating.n, weighted: Math.round(ratedAverage(rating.sum, rating.n) * 10) / 10 } : null,
});

/* ---------- Visits ---------- */

/** The house the room is letting this guest into right now, if any (invited guests only: a burglar can't rate). */
async function liveVisit(env: Env, me: string, owner: string): Promise<string | null | undefined> {
  const room = await roomOf(env, me);
  if ((await room.homeAccess(me, owner)) !== 'invited') return undefined;
  return (await room.homeProperty(me)) ?? null;
}

/** Note a visit the server let happen. pid null: the owner's active house. */
async function recordVisit(db: D1Database, me: string, owner: string, pid: string | null) {
  let house = pid;
  if (!house) {
    const save = await loadSave(db, owner);
    house = save ? activeKey(save) : STARTER;
  }
  await db
    .prepare('INSERT INTO crib_visits (visitor_uid, owner_uid, pid, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(visitor_uid, owner_uid, pid) DO UPDATE SET at = ?4 WHERE crib_visits.at < ?4 - ?5')
    // A visit that keeps checking in keeps its start time, so the minimum stay counts from when it really began.
    .bind(me, owner, house, Date.now(), RATING.visitWithinMs)
    .run();
  return house;
}

/* ---------- Designer jobs ---------- */

interface JobRow {
  id: number; client_uid: string; designer_uid: string; pid: string; design: string | null; fee: number; budget: number; spent: number;
  status: DesignJobStatus; note: string; base: string; draft: string; hours: number; created_at: number; accepted_at: number | null;
  expires_at: number | null; submitted_at: number | null; settled_at: number | null; delivered: number; version: number;
}

const logStmt = (db: D1Database, job: number, actor: string, action: string, detail = '', amount = 0) =>
  db.prepare('INSERT INTO design_job_log (job_id, actor_uid, action, detail, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(job, actor, action, detail.slice(0, 200), amount, Date.now());

/** Credits money out of a job's escrow, once per id (ledger client_id is unique per player). */
const credit = (db: D1Database, uid: string, id: string, kind: string, amount: number) => (amount > 0 ? applyStmts(db, uid, id, kind, 'design', amount) : []);

/**
 * Settles a job: claims the status change first (only one request can), then moves the money. approve: the designer
 * gets the fee, the client what is left of the budget. revert: the designer gets the call-out share of the fee, the
 * client the rest of it and the unspent budget. refund (cancel, decline, expire): the client gets everything back.
 */
async function settle(db: D1Database, job: JobRow, to: 'approved' | 'reverted' | 'cancelled' | 'declined' | 'expired', actor: string, from: DesignJobStatus[]): Promise<JobRow | null> {
  const now = Date.now();
  const claimed = await db
    .prepare(`UPDATE design_jobs SET status = ?1, settled_at = ?2, version = version + 1 WHERE id = ?3 AND status IN (${from.map((s) => `'${s}'`).join(',')}) RETURNING *`)
    .bind(to, now, job.id)
    .first<JobRow>();
  if (!claimed) return null;
  const left = Math.max(0, claimed.budget - claimed.spent);
  let designerGets = 0;
  let clientGets = 0;
  if (to === 'approved') {
    designerGets = claimed.fee;
    clientGets = left;
  } else if (to === 'reverted') {
    designerGets = Math.round(claimed.fee * DESIGN_JOB.calloutShare);
    clientGets = claimed.fee - designerGets + left;
  } else {
    clientGets = claimed.fee + left;
  }
  const stmts: D1PreparedStatement[] = [
    ...credit(db, claimed.designer_uid, `dj-pay:${claimed.id}`, 'design_fee', designerGets),
    ...credit(db, claimed.client_uid, `dj-back:${claimed.id}`, 'refund', clientGets),
    logStmt(db, claimed.id, actor, to, to === 'approved' ? 'Client approved the design' : to === 'reverted' ? 'Client reverted the house' : `Job ${to}`, designerGets),
  ];
  if (clientGets) stmts.push(logStmt(db, claimed.id, actor, 'refund', 'Back to the client from escrow', clientGets));
  if (to === 'approved') {
    stmts.push(db.prepare(
      `INSERT INTO skills (uid, skill, xp, trained_at) VALUES (?1, 'design', ?2, 0) ON CONFLICT(uid, skill) DO UPDATE SET xp = xp + ?2`,
    ).bind(claimed.designer_uid, DESIGN_JOB.xp));
  }
  await db.batch(stmts);
  return claimed;
}

/** Offers nobody answered, keys that ran out, and reviews nobody did. Runs on reads and from the cron. */
export async function settleDesignJobs(db: D1Database, now = Date.now()): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT * FROM design_jobs WHERE (status = 'offered' AND created_at < ?1) OR (status = 'active' AND expires_at < ?2)
         OR (status = 'submitted' AND submitted_at < ?3) LIMIT 50`,
    )
    .bind(now - DESIGN_JOB.offerMs, now, now - DESIGN_JOB.reviewMs)
    .all<JobRow>();
  let n = 0;
  for (const job of results) {
    if (job.status === 'offered') n += (await settle(db, job, 'expired', 'system', ['offered'])) ? 1 : 0;
    else if (job.status === 'active') {
      const r = await db.prepare("UPDATE design_jobs SET status = 'submitted', submitted_at = ?1, version = version + 1 WHERE id = ?2 AND status = 'active' RETURNING id").bind(now, job.id).first();
      if (r) { await logStmt(db, job.id, 'system', 'submitted', 'Time ran out: the design went to the client').run(); n++; }
    } else n += (await settle(db, job, 'approved', 'system', ['submitted'])) ? 1 : 0;
  }
  return n;
}

function jobView(job: JobRow, me: string, names: Map<string, string>, full = false) {
  const draft = JSON.parse(job.draft) as DesignDraft;
  return {
    id: job.id, pid: job.pid, design: job.design, fee: job.fee, budget: job.budget, spent: job.spent, status: job.status, note: job.note, hours: job.hours,
    createdAt: job.created_at, acceptedAt: job.accepted_at, expiresAt: job.expires_at, submittedAt: job.submitted_at, settledAt: job.settled_at,
    delivered: !!job.delivered, version: job.version,
    client: { uid: job.client_uid, username: names.get(job.client_uid) ?? null },
    designer: { uid: job.designer_uid, username: names.get(job.designer_uid) ?? null },
    role: job.client_uid === me ? 'client' : 'designer',
    ...(full ? { draft, base: JSON.parse(job.base) as DesignDraft } : { pieces: draft.items.length }),
  };
}

const parseDraft = (job: JobRow) => JSON.parse(job.draft) as DesignDraft;
const opId = (job: JobRow, n: number) => `dj${job.id}_${n}`;

/* ---------- Routes ---------- */

export async function handleCribs(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser, path: string, url: URL): Promise<Response | null> {
  if (!path.startsWith('/api/cribs') && !path.startsWith('/api/design')) return null;
  const db = env.DB;
  const me = user.uid;
  const now = Date.now();
  const self = await db.prepare('SELECT username FROM players WHERE uid = ?').bind(me).first<{ username: string | null }>();

  /* Scores */

  if (path === '/api/cribs/me' && req.method === 'GET') {
    const rows = await refreshCribs(db, me);
    const [ratings, skill, jobs] = await Promise.all([
      ratingsOf(db, me, now),
      db.prepare("SELECT xp FROM skills WHERE uid = ? AND skill = 'design'").bind(me).first<{ xp: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM design_jobs WHERE designer_uid = ? AND status = 'approved'").bind(me).first<{ n: number }>(),
    ]);
    const best = rows.reduce((b, r) => (r.score > (b?.score ?? -1) ? r : b), null as ScoreRow | null);
    return json({
      houses: rows.map((r) => viewRow(r, ratings.get(r.pid))),
      best: best ? { pid: best.pid, score: best.score, tier: best.tier } : null,
      designer: { xp: skill?.xp ?? 0, level: skillLevel(skill?.xp ?? 0), jobs: jobs?.n ?? 0 },
    });
  }

  if (path === '/api/cribs/house' && req.method === 'GET') {
    const owner = url.searchParams.get('uid') ?? '';
    const pid = url.searchParams.get('pid') || null;
    const save = await loadSave(db, owner);
    if (!save) return err(404, 'No such house');
    const rows = await refreshCribs(db, owner, save);
    const row = rows.find((r) => r.pid === (pid ?? activeKey(save))) ?? rows[0];
    if (!row) return err(404, 'No such house');
    const [ratings, recent, mine, names] = await Promise.all([
      ratingsOf(db, owner, now),
      db.prepare(
        `SELECT r.stars, r.comment, r.created_at AS at, p.username FROM crib_ratings r LEFT JOIN players p ON p.uid = r.rater_uid
         WHERE r.owner_uid = ? AND r.pid = ? AND r.created_at > ? ORDER BY r.created_at DESC LIMIT 10`,
      ).bind(owner, row.pid, now - RATING.windowMs).all<{ stars: number; comment: string; at: number; username: string | null }>(),
      db.prepare('SELECT stars FROM crib_ratings WHERE rater_uid = ? AND owner_uid = ? AND pid = ? AND day = ?').bind(me, owner, row.pid, dayNumber(now)).first<{ stars: number }>(),
      usernames(db, [owner]),
    ]);
    return json({ owner: { uid: owner, username: names.get(owner) ?? null }, house: viewRow(row, ratings.get(row.pid)), reviews: recent.results, ratedToday: mine?.stars ?? null });
  }

  if (path === '/api/cribs/top' && req.method === 'GET') {
    const c = url.searchParams.get('city');
    const city = c && CITIES.includes(c) ? c : null;
    const { results } = await db
      .prepare(
        `SELECT * FROM (
           SELECT c.uid, c.pid, c.design, c.city, c.score, c.base, c.tier, c.value, c.items, p.username, p.name,
                  ROW_NUMBER() OVER (PARTITION BY c.uid ORDER BY c.score DESC, c.value DESC) AS k
           FROM crib_scores c JOIN players p ON p.uid = c.uid
           WHERE p.username IS NOT NULL AND c.items > 0 AND (?1 IS NULL OR c.city = ?1)
         ) WHERE k = 1 ORDER BY score DESC, value DESC LIMIT ?2`,
      )
      .bind(city, LEADERBOARD)
      .all<{ uid: string; pid: string; design: string | null; city: string; score: number; base: number; tier: string; value: number; items: number; username: string; name: string | null }>();
    const counts = results.length
      ? await db.prepare(
        `SELECT owner_uid, pid, COUNT(*) AS n, AVG(stars) AS avg FROM crib_ratings WHERE created_at > ? AND owner_uid IN (${results.map(() => '?').join(',')}) GROUP BY owner_uid, pid`,
      ).bind(now - RATING.windowMs, ...results.map((r) => r.uid)).all<{ owner_uid: string; pid: string; n: number; avg: number }>()
      : { results: [] };
    const rated = new Map(counts.results.map((r) => [`${r.owner_uid}|${r.pid}`, r]));
    return json({
      city,
      houses: results.map(({ k: _k, ...r }: typeof results[number] & { k?: number }) => {
        const x = rated.get(`${r.uid}|${r.pid}`);
        return { ...r, rating: x ? { n: x.n, avg: Math.round(x.avg * 10) / 10 } : null };
      }),
    });
  }

  /* Visits and ratings */

  if (path === '/api/cribs/checkin' && req.method === 'POST') {
    const b = await body<{ owner?: string }>(req);
    if (typeof b?.owner !== 'string' || b.owner === me) return err(400, 'Whose house?');
    const pid = await liveVisit(env, me, b.owner);
    if (pid === undefined) return err(403, 'You are not visiting that house');
    const house = await recordVisit(db, me, b.owner, pid);
    return json({ ok: true, pid: house });
  }

  if (path === '/api/cribs/rate' && req.method === 'POST') {
    const b = await body<{ owner?: string; pid?: string; stars?: number; comment?: string }>(req);
    if (!self?.username) return err(403, 'Pick a username first');
    const stars = Number(b?.stars);
    if (typeof b?.owner !== 'string' || typeof b.pid !== 'string' || !Number.isInteger(stars) || stars < 1 || stars > 5) return err(400, 'Give the house 1 to 5 stars');
    if (b.owner === me) return err(400, 'You can’t rate your own house');
    const comment = (typeof b.comment === 'string' ? b.comment : '').replace(/\s+/g, ' ').trim().slice(0, RATING.maxComment);
    const visit = await db
      .prepare('SELECT at FROM crib_visits WHERE visitor_uid = ? AND owner_uid = ? AND pid = ?')
      .bind(me, b.owner, b.pid)
      .first<{ at: number }>();
    if (!visit || visit.at < now - RATING.visitWithinMs) return err(403, 'Visit the house first, then rate it');
    if (now - visit.at < RATING.minStayMs) return err(429, 'Look around a little before you rate it');
    const row = await db
      .prepare('INSERT INTO crib_ratings (rater_uid, owner_uid, pid, day, stars, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING stars')
      .bind(me, b.owner, b.pid, dayNumber(now), stars, comment, now)
      .first();
    if (!row) return err(409, 'You already rated this house today');
    const rows = await refreshCribs(db, b.owner);
    const house = rows.find((r) => r.pid === b.pid);
    if (stars >= 4) {
      sendPush(env, ctx, b.owner, { title: `${'⭐'.repeat(stars)} for your house`, body: `@${self.username} rated your crib${comment ? `: “${comment}”` : '.'}`, tag: 'crib-rating', category: 'invites' });
    }
    return json({ ok: true, score: house?.score ?? null, tier: house?.tier ?? null });
  }

  /* Tours */

  if (path === '/api/cribs/tours' && req.method === 'GET') {
    const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const { results } = await db
      .prepare(
        `SELECT t.id, t.uid, t.pid, t.city, t.region, t.slot, t.caption, t.open, t.score, t.tier, t.layout, t.created_at AS at, p.username,
                s.media_key, s.created_at AS snap_at
         FROM crib_tours t JOIN players p ON p.uid = t.uid LEFT JOIN snaps s ON s.id = t.snap_id
         WHERE t.id < ? AND t.created_at > ? ORDER BY t.id DESC LIMIT ?`,
      )
      .bind(before, now - TOUR.keepMs, TOUR.page)
      .all<{ id: number; uid: string; pid: string; city: string; region: string | null; slot: number | null; caption: string; open: number; score: number; tier: string; layout: string; at: number; username: string; media_key: string | null; snap_at: number | null }>();
    return json({
      page: TOUR.page,
      tours: results.map(({ media_key, snap_at, layout, open, ...t }) => ({
        ...t, open: !!open, layout: JSON.parse(layout) as LayoutSnapshot,
        // A snap lasts a day (worker/snaps.ts); the plan of the house stays on the card after it.
        photo: media_key && snap_at && snap_at > now - 86_400_000 ? `/api/media/${media_key}` : null,
      })),
    });
  }

  if (path === '/api/cribs/tours' && req.method === 'POST') {
    if (!self?.username) return err(403, 'Pick a username first');
    const b = await body<{ pid?: string; caption?: string; snapId?: number; open?: boolean }>(req);
    const last = await db.prepare('SELECT MAX(created_at) AS at FROM crib_tours WHERE uid = ?').bind(me).first<{ at: number | null }>();
    if (last?.at && now - last.at < TOUR.cooldownMs) return err(429, `You posted a tour not long ago. Next one in ${Math.ceil((last.at + TOUR.cooldownMs - now) / 60_000)} minutes`);
    const save = await loadSave(db, me);
    if (!save) return err(409, 'Save your game first');
    const houses = savedHouses(save);
    const house = houses.find((h) => h.pid === (b?.pid ?? activeKey(save)));
    if (!house || !house.items.length) return err(409, 'Furnish the house before you show it off');
    const rows = await refreshCribs(db, me, save);
    const row = rows.find((r) => r.pid === house.pid)!;
    let snapId: number | null = null;
    if (b?.snapId !== undefined && b.snapId !== null) {
      const snap = await db.prepare('SELECT id FROM snaps WHERE id = ? AND uid = ?').bind(Number(b.snapId), me).first<{ id: number }>();
      if (!snap) return err(404, 'That snap is not yours or is gone');
      snapId = snap.id;
    }
    const caption = (b?.caption ?? '').replace(/\s+/g, ' ').trim().slice(0, TOUR.captionMax);
    const layout = snapshotHouse(save, house.pid, house.items, house.layout);
    const tour = await db
      .prepare('INSERT INTO crib_tours (uid, pid, city, region, slot, caption, snap_id, open, score, tier, layout, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(
        me, house.pid, house.city, REGION_BY_ID[String(house.property?.region)] ? String(house.property?.region) : null,
        Number.isInteger(house.property?.slot) ? house.property!.slot : null, caption, snapId, b?.open ? 1 : 0, row.score, row.tier, JSON.stringify(layout), now,
      )
      .first<{ id: number }>();
    const tier = tierOf(row.score);
    await postFeed(db, me, 'cribs', '🏠', `${handle(self.username)} just posted a house tour on Cribs: ${tier.icon} ${tier.name}, ${row.score}/100.${caption ? ` “${caption}”` : ''}${b?.open ? ' Open house: come and look!' : ''}`);
    return json({ ok: true, id: tour?.id });
  }

  const tourOne = path.match(/^\/api\/cribs\/tours\/(\d+)(\/visit)?$/);
  if (tourOne && req.method === 'DELETE' && !tourOne[2]) {
    const gone = await db.prepare('DELETE FROM crib_tours WHERE id = ? AND uid = ? RETURNING id').bind(Number(tourOne[1]), me).first();
    return gone ? json({ ok: true }) : err(404, 'You can only delete your own tours');
  }
  if (tourOne && req.method === 'POST' && tourOne[2]) {
    const tour = await db.prepare('SELECT uid, pid, open, created_at FROM crib_tours WHERE id = ?').bind(Number(tourOne[1])).first<{ uid: string; pid: string; open: number; created_at: number }>();
    if (!tour || tour.created_at < now - TOUR.keepMs) return err(404, 'That tour is gone');
    if (tour.uid === me) return err(400, 'This is your own house');
    // Not an open house: the owner has to say yes, the usual way (a visit request, worker/social.ts).
    if (!tour.open) return json({ request: true, owner: tour.uid });
    const loaded = await houseOf(db, tour.uid, tour.pid === STARTER ? undefined : tour.pid);
    if ('error' in loaded) return err(loaded.status, loaded.error);
    await followHost(env, me, tour.uid);
    await (await roomOf(env, me)).allowHomeVisit(me, tour.uid, 'invited', loaded.home.propertyId ?? undefined);
    await recordVisit(db, me, tour.uid, loaded.home.propertyId ?? STARTER);
    return json({ home: loaded.home });
  }

  /* Layouts */

  if (path === '/api/cribs/layouts' && req.method === 'GET') {
    const { results } = await db
      .prepare('SELECT id, name, design, snapshot, items, value, created_at AS at FROM crib_layouts WHERE uid = ? ORDER BY created_at DESC')
      .bind(me)
      .all<{ id: number; name: string; design: string | null; snapshot: string; items: number; value: number; at: number }>();
    return json({ max: LAYOUTS.max, layouts: results.map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) as LayoutSnapshot })) });
  }

  if (path === '/api/cribs/layouts' && req.method === 'POST') {
    const raw = await req.text();
    if (raw.length > MAX_SNAPSHOT_BYTES) return err(413, 'That layout is too big');
    const b = (() => { try { return JSON.parse(raw) as { name?: string; snapshot?: LayoutSnapshot }; } catch { return null; } })();
    const name = (b?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, LAYOUTS.nameMax);
    if (!name) return err(400, 'Name the layout');
    const s = b?.snapshot;
    if (!s || s.v !== 1 || !Array.isArray(s.items)) return err(400, 'Bad layout');
    const items = cleanItems(s.items);
    if (items.length !== s.items.length) return err(400, 'That layout has pieces that don’t exist');
    const snapshot: LayoutSnapshot = { ...s, items, paint: cleanPaint(s.paint), design: typeof s.design === 'string' ? s.design.slice(0, 80) : null };
    const count = await db.prepare('SELECT COUNT(*) AS n FROM crib_layouts WHERE uid = ?').bind(me).first<{ n: number }>();
    if ((count?.n ?? 0) >= LAYOUTS.max) return err(409, `You can keep ${LAYOUTS.max} layouts. Delete one first`);
    const row = await db
      .prepare('INSERT INTO crib_layouts (uid, name, design, snapshot, items, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(me, name, snapshot.design, JSON.stringify(snapshot), items.length, snapshotValue(snapshot), now)
      .first<{ id: number }>();
    return json({ ok: true, id: row?.id });
  }

  const layoutOne = path.match(/^\/api\/cribs\/layouts\/(\d+)(\/quote)?$/);
  if (layoutOne && req.method === 'DELETE' && !layoutOne[2]) {
    const gone = await db.prepare('DELETE FROM crib_layouts WHERE id = ? AND uid = ? RETURNING id').bind(Number(layoutOne[1]), me).first();
    return gone ? json({ ok: true }) : err(404, 'No such layout');
  }
  /** What putting a layout (or a style pack, /api/cribs/packs/<id>/quote) into a house would cost, from the saved game. */
  if (layoutOne && req.method === 'GET' && layoutOne[2]) {
    const row = await db.prepare('SELECT snapshot FROM crib_layouts WHERE id = ? AND uid = ?').bind(Number(layoutOne[1]), me).first<{ snapshot: string }>();
    if (!row) return err(404, 'No such layout');
    const save = await loadSave(db, me);
    if (!save) return err(409, 'Save your game first');
    const house = savedHouses(save).find((h) => h.pid === (url.searchParams.get('pid') ?? activeKey(save)));
    if (!house) return err(404, 'No such house');
    const snap = JSON.parse(row.snapshot) as LayoutSnapshot;
    return json({ ...layoutQuote(snap.items, [...house.items, ...cleanItems(save.furnitureInventory)]), sameDesign: (snap.design ?? null) === (house.layout ?? null), balance: await getBalance(db, me) });
  }
  const packQuote = path.match(/^\/api\/cribs\/packs\/([a-z]+)\/quote$/);
  if (packQuote && req.method === 'GET') {
    const pack = STYLE_PACK_BY_ID[packQuote[1]];
    if (!pack) return err(404, 'No such style pack');
    const save = await loadSave(db, me);
    if (!save) return err(409, 'Save your game first');
    const house = savedHouses(save).find((h) => h.pid === (url.searchParams.get('pid') ?? activeKey(save)));
    // A pack reuses only what is in storage: the furniture already in the house stays where it is.
    return json({ ...layoutQuote(pack.items.map((type) => ({ type })), cleanItems(save.furnitureInventory)), house: house?.pid ?? null });
  }

  /* Designer jobs */

  if (path.startsWith('/api/design')) await settleDesignJobs(db, now).catch(() => 0);

  if (path === '/api/design/jobs' && req.method === 'GET') {
    const { results } = await db
      .prepare('SELECT * FROM design_jobs WHERE client_uid = ?1 OR designer_uid = ?1 ORDER BY id DESC LIMIT 30')
      .bind(me)
      .all<JobRow>();
    const names = await usernames(db, results.flatMap((j) => [j.client_uid, j.designer_uid]));
    return json({ jobs: results.map((j) => jobView(j, me, names)) });
  }

  if (path === '/api/design/hire' && req.method === 'POST') {
    if (!self?.username) return err(403, 'Pick a username first');
    const b = await body<{ designer?: string; pid?: string; fee?: number; budget?: number; hours?: number; note?: string }>(req);
    const fee = Math.round(Number(b?.fee));
    const budget = Math.round(Number(b?.budget ?? 0));
    const hours = Number(b?.hours);
    if (!Number.isFinite(fee) || fee < DESIGN_JOB.minFee || fee > DESIGN_JOB.maxFee) return err(400, `The fee is ${naira(DESIGN_JOB.minFee)} to ${naira(DESIGN_JOB.maxFee)}`);
    if (!Number.isFinite(budget) || budget < 0 || budget > DESIGN_JOB.maxBudget) return err(400, 'Pick a budget for new furniture');
    if (!(DESIGN_JOB.hours as readonly number[]).includes(hours)) return err(400, 'Pick how long they have');
    const name = (b?.designer ?? '').trim().replace(/^@/, '').toLowerCase();
    const designer = await db.prepare('SELECT uid, username FROM players WHERE username = ?').bind(name).first<{ uid: string; username: string }>();
    if (!designer) return err(404, 'No player with that username');
    if (designer.uid === me) return err(400, 'Hire someone else: you can decorate your own house for free');
    const open = await db
      .prepare("SELECT COUNT(*) AS n FROM design_jobs WHERE client_uid = ? AND status IN ('offered', 'active', 'submitted')")
      .bind(me)
      .first<{ n: number }>();
    if ((open?.n ?? 0) >= 2) return err(409, 'You already have two design jobs going. Finish one first');
    const save = await loadSave(db, me);
    if (!save) return err(409, 'Save your game first');
    const house = savedHouses(save).find((h) => h.pid === (b?.pid ?? activeKey(save)));
    if (!house) return err(404, 'Pick one of your finished houses');
    const busy = await db
      .prepare("SELECT id FROM design_jobs WHERE client_uid = ? AND pid = ? AND status IN ('offered', 'active', 'submitted')")
      .bind(me, house.pid)
      .first();
    if (busy) return err(409, 'That house already has a designer on it');
    if ((await getBalance(db, me)) < fee + budget) return err(402, `You need ${naira(fee + budget)} for the fee and budget`);
    const withIds = (list: CribItem[], prefix: string) => list.map((i, n) => ({ ...i, id: typeof i.id === 'string' ? i.id : `${prefix}${n}` }) as PlacedItem);
    const base: DesignDraft = { items: withIds(house.items, 'h'), storage: withIds(cleanItems(save.furnitureInventory), 's'), paint: house.paint, bought: [] };
    const note = (b?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, DESIGN_JOB.noteMax);
    const job = await db
      .prepare(
        `INSERT INTO design_jobs (client_uid, designer_uid, pid, design, fee, budget, status, note, base, draft, hours, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'offered', ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(me, designer.uid, house.pid, house.layout, fee, budget, note, JSON.stringify(base), JSON.stringify(base), hours, now)
      .first<JobRow>();
    if (!job) return err(500, 'Could not hire');
    // Into escrow. Undo the job if the wallet could not cover all of it.
    const paid = await transfer(db, me, null, fee + budget, 'design_escrow', '', `design:${job.id}`);
    if (paid < fee + budget) {
      await db.batch([
        db.prepare('DELETE FROM design_jobs WHERE id = ?').bind(job.id),
        ...credit(db, me, `dj-undo:${job.id}`, 'refund', paid),
      ]);
      return err(402, 'Not enough money');
    }
    await logStmt(db, job.id, me, 'hired', `Fee ${naira(fee)}, budget ${naira(budget)}, ${hours}h${note ? `: ${note}` : ''}`, fee + budget).run();
    sendPush(env, ctx, designer.uid, { title: '🛋️ Interior design job', body: `@${self.username} wants you to decorate their house for ${naira(fee)}. Open Cribs to accept.`, tag: `design-${job.id}`, category: 'invites' });
    return json({ ok: true, id: job.id, balance: await getBalance(db, me) });
  }

  const jobPath = path.match(/^\/api\/design\/(\d+)(?:\/(accept|decline|cancel|op|submit|approve|revert|delivered))?$/);
  if (!jobPath) return err(404, 'Not found');
  const job = await db.prepare('SELECT * FROM design_jobs WHERE id = ?').bind(Number(jobPath[1])).first<JobRow>();
  if (!job || (job.client_uid !== me && job.designer_uid !== me)) return err(404, 'No such job');
  const isClient = job.client_uid === me;
  const action = jobPath[2];

  if (!action && req.method === 'GET') {
    const [names, log] = await Promise.all([
      usernames(db, [job.client_uid, job.designer_uid]),
      db.prepare('SELECT actor_uid AS actor, action, detail, amount, created_at AS at FROM design_job_log WHERE job_id = ? ORDER BY id').bind(job.id).all(),
    ]);
    return json({ job: jobView(job, me, names, true), log: log.results });
  }
  if (req.method !== 'POST') return err(405, 'Method not allowed');

  if (action === 'accept' || action === 'decline') {
    if (isClient) return err(403, 'Only the designer can answer');
    if (action === 'decline') {
      const done = await settle(db, job, 'declined', me, ['offered']);
      return done ? json({ ok: true }) : err(409, 'That offer is no longer open');
    }
    const r = await db
      .prepare("UPDATE design_jobs SET status = 'active', accepted_at = ?1, expires_at = ?2, version = version + 1 WHERE id = ?3 AND status = 'offered' RETURNING *")
      .bind(now, now + job.hours * 3600_000, job.id)
      .first<JobRow>();
    if (!r) return err(409, 'That offer is no longer open');
    await logStmt(db, job.id, me, 'accepted', `Keys for ${job.hours}h`).run();
    sendPush(env, ctx, job.client_uid, { title: '🛋️ Your designer is in', body: `They have ${job.hours} hour${job.hours === 1 ? '' : 's'} to work on your house.`, tag: `design-${job.id}`, category: 'invites' });
    return json({ ok: true, expiresAt: r.expires_at });
  }

  if (action === 'cancel') {
    if (!isClient) return err(403, 'Only the client can withdraw an offer');
    const done = await settle(db, job, 'cancelled', me, ['offered']);
    return done ? json({ ok: true, balance: await getBalance(db, me) }) : err(409, 'The designer already accepted: wait for the design, then approve or revert');
  }

  if (action === 'op') {
    if (isClient) return err(403, 'Only the designer edits during the job');
    if (job.status !== 'active' || (job.expires_at ?? 0) < now) return err(409, 'The keys have run out on this job');
    const b = await body<{ op?: string; version?: number; itemId?: string; type?: string; x?: number; z?: number; rot?: number; part?: 'inner' | 'outer'; colour?: string | null }>(req);
    if (b?.version !== job.version) return err(409, 'The job changed: reload it');
    const draft = parseDraft(job);
    const layout = cribLayout(job.design, null);
    // Checked as if someone stood just inside the gate: nothing may block the way in or sit on that spot.
    const far = arrivalCell(layout);
    const at = (x: unknown, z: unknown, rot: unknown) => (Number.isInteger(x) && Number.isInteger(z) && Number.isInteger(rot) && (rot as number) >= 0 && (rot as number) <= 3 ? { x: x as number, z: z as number, rot: rot as number } : null);
    let spend = 0;
    let detail = '';
    let ledger: D1PreparedStatement[] = [];
    if (b.op === 'move') {
      const it = draft.items.find((i) => i.id === b.itemId);
      const pos = at(b.x, b.z, b.rot);
      if (!it || !pos || ITEMS[it.type]?.fixed) return err(400, 'Pick a piece and a spot');
      const why = placementError({ type: it.type, ...pos }, draft.items, far, it.id, layout);
      if (why) return err(409, why);
      Object.assign(it, pos);
      detail = `Moved ${ITEMS[it.type].name}`;
    } else if (b.op === 'place') {
      const idx = draft.storage.findIndex((i) => i.id === b.itemId);
      const pos = at(b.x, b.z, b.rot);
      if (idx < 0 || !pos) return err(400, 'Pick a stored piece and a spot');
      const it = draft.storage[idx];
      const why = placementError({ type: it.type, ...pos }, draft.items, far, undefined, layout);
      if (why) return err(409, why);
      draft.storage.splice(idx, 1);
      draft.items.push({ ...it, ...pos });
      detail = `Placed ${ITEMS[it.type].name} from storage`;
    } else if (b.op === 'store') {
      const idx = draft.items.findIndex((i) => i.id === b.itemId);
      if (idx < 0 || ITEMS[draft.items[idx].type]?.fixed) return err(400, 'Pick a piece to store');
      const [it] = draft.items.splice(idx, 1);
      draft.storage.push(it);
      detail = `Stored ${ITEMS[it.type].name}`;
    } else if (b.op === 'buy') {
      const def = ITEMS[b.type ?? ''];
      const pos = at(b.x, b.z, b.rot);
      if (!def || def.fixed || !pos) return err(400, 'Pick something to buy and a spot');
      if (job.spent + def.price > job.budget) return err(402, `That is over the budget (${naira(job.budget - job.spent)} left)`);
      const why = placementError({ type: def.type, ...pos }, draft.items, far, undefined, layout);
      if (why) return err(409, why);
      const id = opId(job, draft.bought.length);
      draft.items.push({ id, type: def.type, ...pos });
      draft.bought.push(id);
      spend = def.price;
      detail = `Bought ${def.name}`;
      // The piece is the client's from now on: an already-applied buy line (amount 0, the money left with the escrow)
      // counts it in what they own (migrations/0081_owned.sql), so their save may hold it.
      // Written only if the draft update just before it in the batch went through (changes() = 1).
      ledger = [db.prepare(
        `INSERT INTO ledger (uid, client_id, kind, ref, amount, applied, created_at) SELECT ?, ?, 'buy', ?, 0, 1, ? WHERE changes() = 1
         ON CONFLICT(uid, client_id) DO NOTHING`,
      ).bind(job.client_uid, `dj-buy:${id}`, def.type, now)];
    } else if (b.op === 'paint') {
      if ((b.part !== 'inner' && b.part !== 'outer') || (b.colour !== null && !isColourRef(b.colour))) return err(400, 'Pick a wall and a colour');
      draft.paint = { ...draft.paint, [b.part]: b.colour ?? undefined };
      if (!draft.paint[b.part]) delete draft.paint[b.part];
      detail = `Painted the ${b.part === 'inner' ? 'inside' : 'outside'} walls ${b.colour ?? 'back to plain'}`;
    } else return err(400, 'Unknown change');
    const opCount = await db.prepare('SELECT COUNT(*) AS n FROM design_job_log WHERE job_id = ?').bind(job.id).first<{ n: number }>();
    if ((opCount?.n ?? 0) > DESIGN_JOB.maxOps) return err(429, 'That is a lot of changes. Submit the design');
    // Only if nobody changed the job meanwhile (and the budget still covers it): the version is the lock.
    const results = await db.batch([
      db.prepare(
        `UPDATE design_jobs SET draft = ?1, spent = spent + ?2, version = version + 1 WHERE id = ?3 AND version = ?4 AND status = 'active' AND spent + ?2 <= budget`,
      ).bind(JSON.stringify(draft), spend, job.id, job.version),
      ...ledger,
    ]);
    if (!results[0].meta.changes) return err(409, 'The job changed: reload it');
    await logStmt(db, job.id, me, b.op, detail, spend).run();
    return json({ ok: true, version: job.version + 1, draft, spent: job.spent + spend });
  }

  if (action === 'submit') {
    if (isClient) return err(403, 'Only the designer submits');
    const r = await db
      .prepare("UPDATE design_jobs SET status = 'submitted', submitted_at = ?1, version = version + 1 WHERE id = ?2 AND status = 'active' RETURNING id")
      .bind(now, job.id)
      .first();
    if (!r) return err(409, 'This job is not open');
    await logStmt(db, job.id, me, 'submitted', 'Design handed to the client').run();
    sendPush(env, ctx, job.client_uid, { title: '🛋️ Your new interior is ready', body: 'Open Cribs to see it, then approve or revert.', tag: `design-${job.id}`, category: 'invites' });
    return json({ ok: true });
  }

  if (action === 'approve' || action === 'revert') {
    if (!isClient) return err(403, 'Only the client decides');
    // The client may stop the job early too: what the designer did so far is the design.
    const done = await settle(db, job, action === 'approve' ? 'approved' : 'reverted', me, ['submitted', 'active']);
    if (!done) return err(409, 'This job is already settled');
    const names = await usernames(db, [job.designer_uid]);
    if (action === 'approve') {
      await postFeed(db, job.designer_uid, 'cribs', '🛋️', `Interior designer ${handle(names.get(job.designer_uid))} just finished a house for ${handle(self?.username)}. Book them on Cribs!`);
    }
    sendPush(env, ctx, job.designer_uid, {
      title: action === 'approve' ? `💸 Paid ${naira(job.fee)} for your design` : 'The client reverted your design',
      body: action === 'approve' ? 'The client loved it. +design skill.' : `You keep ${naira(Math.round(job.fee * DESIGN_JOB.calloutShare))} for your time.`,
      tag: `design-${job.id}`, category: 'money',
    });
    const fresh = await db.prepare('SELECT * FROM design_jobs WHERE id = ?').bind(job.id).first<JobRow>();
    return json({ ok: true, job: jobView(fresh!, me, names, true), balance: await getBalance(db, me) });
  }

  if (action === 'delivered') {
    if (!isClient) return err(403, 'Only the client');
    await db.prepare("UPDATE design_jobs SET delivered = 1 WHERE id = ? AND status IN ('approved', 'reverted')").bind(job.id).run();
    return json({ ok: true });
  }

  return err(404, 'Not found');
}
