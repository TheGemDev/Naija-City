// Naija City API. Static game files are served by Workers Assets; only /api/* reaches this code.

import { FORBES_ASSETS_TOP, FORBES_MIN_WORTH } from '../src/game/forbes';
import { withSentry } from '@sentry/cloudflare';
import { readLiveStats } from './cfTraffic';
import { verifyIdToken, type FirebaseUser } from './auth';
import { handleAdmin } from './admin';
import { handleSocial } from './social';
import { connectPlayer } from './shards';
import { edgeCached, replica } from './cache';
import { deliverPush, type PushJob } from './push';
import { runCron } from './cron';
import { MEDIA_KEY, readMedia, uploadMedia } from './media';
import { SNAP_KEY, handleSnaps, readSnap } from './snaps';
import { track } from './metrics';
import { cityNow } from './state';
import { applyEvents, ensureWallet, handleWallet } from './wallet';
import { advance, loadState, saveStateStmts, unitsOf, verifyKnowledge } from './clock';
import { forbesAssets, ownedCounts, ownsCar, trimItems } from './progress';
import { MAX_GRID_H, MAX_GRID_W } from '../src/game/grid';
import { cleanHouses } from './houses';
import { readEstate, syncEstate } from './estate';
import { handleCivic } from './civic';
import { referralClaim, referralClick } from './referral';
import { handleVice } from './vice';
import { handleLoans } from './loans';
import { handleRoads } from './roads';
import { handleDisasters, readDisasters } from './disasters';
import { handleCrime } from './crime';
import { handleGuns } from './guns';
import { handleEfcc } from './efcc';
import { handleBank } from './bank';
import { handleFun } from './fun';
import { handleGames } from './games';
import { handleOwambe } from './owambe';
import { handleCribs, refreshCribs, type SaveJson } from './cribs';
import { handlePushApi, pushPublicKey } from './push';
import { handleCommunity } from './community';
import { handleGroups } from './groups';
import { handleCareer } from './career';
import { handleHustles } from './hustles';
import { handleHangout } from './hangout';
import { handleKids } from './kids';
import { handleRentals } from './rentals';
import { handleBlackMarket } from './blackmarket';
import { handleShop, handleShopWebhook } from './shop';
import { handleAds, readLiveAds } from './ads';
import { readMarket } from './market';
import { readPlot, readProfile, readShop, shareLinkPage } from './share';
import { ogPlaceImage, ogPlotImage, ogProfileImage, ogShopImage, ogSnapImage, ogTweetImage } from './og';
import { STAGES } from '../src/game/property';

export { Room } from './room';
export { Lobby } from './lobby';

const SAVE_VERSION = 1;
const MAX_SAVE_BYTES = 256 * 1024;
const NEED_KEYS = ['hunger', 'energy', 'hygiene', 'bladder', 'fun', 'social'];
type SaveFurniture = { id?: string; type: string; x?: number; z?: number; rot?: number };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);

async function authenticate(req: Request, env: Env, url: URL): Promise<FirebaseUser | null> {
  // WebSockets can't send headers from the browser, so the room accepts ?token= too.
  const header = req.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
  return token ? verifyIdToken(token, env.FIREBASE_PROJECT_ID) : null;
}

/** last_seen is only rewritten this often: the game saves every 30 seconds, and nothing reads it finer than a few minutes. */
const SEEN_EVERY_MS = 2 * 60_000;

async function touchPlayer(env: Env, user: FirebaseUser) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO players (uid, email, name, created_at, last_seen) VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(uid) DO UPDATE SET email = ?2, last_seen = ?4
     WHERE players.email IS NOT ?2 OR players.last_seen < ?4 - ?5`,
  )
    .bind(user.uid, user.email ?? null, user.name ?? null, now, SEEN_EVERY_MS)
    .run();
}

type Save = {
  version: number;
  savedAt: number;
  name: string;
  money: number;
  minutes: number;
  knowledge: number;
  needs: Record<string, number>;
  items: { type: string }[];
  furnitureInventory?: { type: string }[];
  activeHouseId?: string | null;
  properties?: { id?: string; stage?: number; items?: SaveFurniture[] }[];
  homePropertyId?: string | null;
  ownedCars?: string[];
  selectedCar?: string | null;
  investments?: Record<string, { units: number; [k: string]: unknown }>;
  [k: string]: unknown;
};

/** What the server changed in an uploaded save; the client applies the same fixes. */
interface Corrections {
  knowledge?: number;
  items?: Save['items'];
  furnitureInventory?: Save['furnitureInventory'];
  properties?: Save['properties'];
  confiscatedProperties?: string[];
  ownedCars?: string[];
  selectedCar?: string | null;
  investments?: Save['investments'];
}

/** Shape + sanity checks. Returns an error message, or null if the save is acceptable.
 *  Money isn't trusted from saves at all: the wallet (worker/wallet.ts) is the source of truth. */
function checkSave(s: Save): string | null {
  if (!s || typeof s !== 'object' || s.version !== SAVE_VERSION) return 'Bad version';
  if (typeof s.money !== 'number' || !Number.isFinite(s.money)) return 'Bad money';
  if (typeof s.minutes !== 'number' || s.minutes < 0) return 'Bad clock';
  if (typeof s.name !== 'string' || s.name.length > 18) return 'Bad name';
  if (!s.needs || NEED_KEYS.some((k) => typeof s.needs[k] !== 'number')) return 'Bad needs';
  if (!Array.isArray(s.items) || s.items.some((i) => !i || typeof i.type !== 'string')) return 'Bad items';
  if (s.furnitureInventory !== undefined && (!Array.isArray(s.furnitureInventory) || s.furnitureInventory.some((i) => !i || typeof i.type !== 'string'))) return 'Bad furniture inventory';
  if (s.properties !== undefined && (
    !Array.isArray(s.properties) ||
    s.properties.some((property) =>
      !property ||
      typeof property.id !== 'string' ||
      (property.items !== undefined && (
        !Array.isArray(property.items) ||
        property.items.some((item) =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.type !== 'string' ||
          !Number.isInteger(item.x) || item.x! < 0 || item.x! >= MAX_GRID_W ||
          !Number.isInteger(item.z) || item.z! < 0 || item.z! >= MAX_GRID_H ||
          !Number.isInteger(item.rot) || item.rot! < 0 || item.rot! > 3
        )
      ))
    )
  )) return 'Bad house inventory';
  for (const k of NEED_KEYS) s.needs[k] = Math.max(0, Math.min(100, s.needs[k]));
  return null;
}

declare global {
  interface Env {
    /** Sentry DSN for server errors (public). Leave empty to send nothing. */
    SENTRY_DSN?: string;
    CF_VERSION_METADATA?: WorkerVersionMetadata;
  }
}

const handler = {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // ADMIN_HOST (dash.naija.city) is the owner dashboard (worker/admin.ts). "/" runs the Worker so the host can be checked; every other host's "/" is the game.
    if (env.ADMIN_HOST && url.hostname === env.ADMIN_HOST) return handleAdmin(req, env);
    if (path === '/') return env.ASSETS.fetch(req);

    if (path === '/api/health') return json({ ok: true });
    if (path === '/api/shop/webhook' && req.method === 'POST') return handleShopWebhook(req, env);
    if (path === '/api/ref/click' && req.method === 'POST') return referralClick(req, env);

    // Public reads are edge-cached, but a script can dodge the cache with random query strings: limit each address.
    if (req.method === 'GET' && /^\/api\/(forbes|profile|plot|estate|stats|media|stocks|ads\/live)(\/|$)/.test(path) && env.RL_PUBLIC) {
      if (!(await env.RL_PUBLIC.limit({ key: req.headers.get('cf-connecting-ip') ?? 'anon' })).success) return err(429, 'Too many requests');
    }
    if (path === '/api/push/key' && req.method === 'GET') return pushPublicKey(env);
    if (path === '/api/world-clock' && req.method === 'GET') {
      const room = env.ROOM.get(env.ROOM.idFromName('kaduna'));
      return json(await room.getWorldTime());
    }

    if (path === '/api/stats' && req.method === 'GET') {
      // Both numbers are live in the lobby; the short cache only keeps a crowd of open phones from all asking it at once.
      return edgeCached(req, ctx, 2, async () => json(await readLiveStats(env)));
    }

    // Not /api/market: that is the player shop marketplace (worker/career.ts).
    if (path === '/api/stocks' && req.method === 'GET') {
      return edgeCached(req, ctx, 150, async () => json(await readMarket(replica(env))));
    }

    // Only players worth FORBES_MIN_WORTH or more are listed, and the top FORBES_ASSETS_TOP come with a count of what they own. ?age=u20 or ?age=u30 narrows the list to players under that age. Only the list is public, never a birthdate.
    if (path === '/api/forbes' && req.method === 'GET') return edgeCached(req, ctx, 30, async () => {
      const under = ({ u20: 20, u30: 30 } as Record<string, number>)[url.searchParams.get('age') ?? ''];
      // Birthdates are YYYY-MM-DD, so "born after this day" is a plain text comparison.
      const today = new Date();
      const bornAfter = under ? `${today.getUTCFullYear() - under}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}` : null;
      const rows = await replica(env).prepare(`
        SELECT p.uid, p.username, p.name, COALESCE(w.balance, 0) AS balance, p.last_seen
        FROM players p
        LEFT JOIN wallets w ON w.uid = p.uid
        WHERE p.username IS NOT NULL AND (?1 IS NULL OR p.birthdate > ?1) AND COALESCE(w.balance, 0) >= ?2
        ORDER BY balance DESC
        LIMIT 50
      `).bind(bornAfter, FORBES_MIN_WORTH).all<{ uid: string; username: string; name: string | null; balance: number; last_seen: number }>();
      const assets = await Promise.all(rows.results.slice(0, FORBES_ASSETS_TOP).map((p) => forbesAssets(replica(env), p.uid)));
      return json({ players: rows.results.map((p, i) => (assets[i] ? { ...p, assets: assets[i] } : p)) });
    });

    const media = path.match(/^\/api\/media\/(.+)$/);
    if (media && req.method === 'GET') {
      if (SNAP_KEY.test(media[1])) return readSnap(env, media[1]);
      if (!MEDIA_KEY.test(media[1])) return err(404, 'Not found');
      const width = Number(url.searchParams.get('w') ?? 0);
      return edgeCached(req, ctx, 3600, () => readMedia(env, media[1], width));
    }

    const og = path.match(/^\/api\/og\/b\/([a-z0-9_]{1,24})\/(\d{1,8})$/);
    if (og && req.method === 'GET') return edgeCached(req, ctx, 600, () => ogPlotImage(env, og[1], Number(og[2])));
    const ogUser = path.match(/^\/api\/og\/u\/([A-Za-z0-9_]{1,15})$/);
    if (ogUser && req.method === 'GET') return edgeCached(req, ctx, 600, () => ogProfileImage(env, ogUser[1]));
    // Kept a shorter time than the others: a deleted snap or tweet should not go on showing in previews.
    const ogPost = path.match(/^\/api\/og\/(s|t)\/(\d{1,12})$/);
    if (ogPost && req.method === 'GET') return edgeCached(req, ctx, 120, () => (ogPost[1] === 's' ? ogSnapImage : ogTweetImage)(env, Number(ogPost[2])));

    // A place never changes between deploys, so its card is kept longest.
    const ogPlace = path.match(/^\/api\/og\/p\/([a-z]{1,20})\/([a-z_]{1,30})$/);
    if (ogPlace && req.method === 'GET') return edgeCached(req, ctx, 3600, () => ogPlaceImage(ogPlace[1], ogPlace[2]));

    const ogShop = path.match(/^\/api\/og\/shop\/(\d{1,10})$/);
    if (ogShop && req.method === 'GET') return edgeCached(req, ctx, 300, () => ogShopImage(env, Number(ogShop[1])));

    const shared = await shareLinkPage(req, env);
    if (shared) return shared;
    const profile = path.match(/^\/api\/profile\/([A-Za-z0-9_]{1,15})$/);
    if (profile && req.method === 'GET') return edgeCached(req, ctx, 30, () => readProfile(replica(env), profile[1]));
    const shop = path.match(/^\/api\/shop\/(\d{1,10})$/);
    if (shop && req.method === 'GET') return edgeCached(req, ctx, 30, () => readShop(replica(env), Number(shop[1])));

    // The billboards are public: a visitor looking round a city from the landing page sees the same ads as the players.
    if (path === '/api/ads/live' && req.method === 'GET') {
      return edgeCached(req, ctx, 60, async () => json({ live: await readLiveAds(replica(env)) }));
    }

    const plot = path.match(/^\/api\/plot\/([a-z0-9_]{1,24})\/(\d{1,8})$/);
    if (plot && req.method === 'GET') return edgeCached(req, ctx, 30, () => readPlot(replica(env), plot[1], Number(plot[2])));

    // Disasters are the same for everyone, so the list is public and shared from the edge for a few seconds.
    if (path === '/api/disasters' && req.method === 'GET') return edgeCached(req, ctx, 10, () => readDisasters(replica(env)));

    const estate = path.match(/^\/api\/estate\/([a-z0-9_]{1,24})$/);
    if (estate && req.method === 'GET') return edgeCached(req, ctx, 10, () => readEstate(replica(env), estate[1], Number(new URL(req.url).searchParams.get('n') ?? 0)));

    const user = await authenticate(req, env, url);
    if (!user) return err(401, 'Sign in required');
    // Per-player limits (a cheater with a script can't hammer D1). Money and purchases get a much tighter one.
    // Posting a snap is an upload, so it is one of them; liking and commenting on one is ordinary traffic.
    const sensitive = /^\/api\/((shop|pay|loans|bank|blackmarket|username|media)(\/|$)|snaps$|design\/hire$)/.test(path) && req.method !== 'GET';
    const limiter = sensitive ? env.RL_SENSITIVE : env.RL_API;
    if (limiter && !(await limiter.limit({ key: user.uid })).success) {
      track(env, 'rate_limited', { blobs: [sensitive ? 'sensitive' : 'api'] });
      return new Response(JSON.stringify({ error: 'Too many requests. Slow down a little.' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '10' } });
    }
    return handleApi(req, env, ctx, user);
  },

  /** Web pushes queued by sendPush (worker/push.ts), delivered off the request path and retried if they fail. */
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const job = message.body as PushJob;
        if (job.type === 'push') await deliverPush(env, [job.uid], job.payload);
        else if (job.type === 'broadcast') await deliverPush(env, job.uids, job.payload);
        message.ack();
      } catch (error) {
        console.error('Queue job failed', error);
        message.retry({ delaySeconds: 30 });
      }
    }
  },

  /** Every five minutes (wrangler.jsonc triggers): settle overdue work and sample how many are online. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env, ctx));
  },
} satisfies ExportedHandler<Env>;

// Server errors go to Sentry when SENTRY_DSN is set (wrangler.jsonc vars); without it the worker runs as before.
export default withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN || undefined, release: env.CF_VERSION_METADATA?.id, tracesSampleRate: 0 }),
  handler,
);

/** D1 now and then fails with an internal error or resets its storage object for no fault of ours. Only for work that is safe to repeat. */
const D1_BLIP = /D1_ERROR: (internal error|network connection lost)|object to be reset/i;
async function retryD1<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!D1_BLIP.test(String(error))) throw error;
    return run();
  }
}

/** Every signed-in /api route. Split from auth so it can be exercised with test users. */
export async function handleApi(req: Request, env: Env, ctx: ExecutionContext, user: FirebaseUser): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  const push = await handlePushApi(req, env, user.uid, path);
  if (push) return push;

  if (path === '/api/save' && req.method === 'GET') {
    await touchPlayer(env, user);
    // Money comes from the wallet, not from whatever the last upload said.
    const row = await env.DB.prepare('SELECT s.data, s.saved_at, w.balance FROM saves s LEFT JOIN wallets w ON w.uid = s.uid WHERE s.uid = ?')
      .bind(user.uid)
      .first<{ data: string; saved_at: number; balance: number | null }>();
    if (!row) return err(404, 'No save');
    const save = JSON.parse(row.data) as Save;
    if (row.balance !== null) save.money = row.balance;
    // The row's saved_at is the truth: server-side edits (break-ins) may bump it without rewriting the JSON.
    save.savedAt = row.saved_at;
    return json(save);
  }

  if (path === '/api/save' && req.method === 'PUT') {
    const body = await req.text();
    if (body.length > MAX_SAVE_BYTES) return err(413, 'Save too large');
    let save: Save;
    try {
      save = JSON.parse(body);
    } catch {
      return err(400, 'Invalid JSON');
    }
    // A closing tab has no time to send its wallet events first, so they come inside the save. They are applied
    // before the save is held against what the player owns, or the purchases it shows would be undone as unpaid.
    const walletEvents = save?.walletEvents;
    if (save && typeof save === 'object') delete save.walletEvents;
    if (Array.isArray(walletEvents) && walletEvents.length) await applyEvents(env.DB, user.uid, walletEvents, await cityNow(env, user.uid));
    // Two devices: the client says which cloud save it built on. If another device has saved since,
    // refuse and hand back the newer save rather than letting this one overwrite it.
    const base = Number(req.headers.get('X-Base-Saved-At'));
    const cur = await env.DB.prepare('SELECT s.data, s.saved_at, w.balance FROM saves s LEFT JOIN wallets w ON w.uid = s.uid WHERE s.uid = ?')
      .bind(user.uid)
      .first<{ data: string; saved_at: number; balance: number | null }>();
    if (req.headers.has('X-Base-Saved-At')) {
      if (cur && cur.saved_at > base) {
        const newer = JSON.parse(cur.data) as Save;
        if (cur.balance !== null) newer.money = cur.balance;
        newer.savedAt = cur.saved_at;
        return json({ error: 'Saved from another device', save: newer }, 409);
      }
    }
    const problem = checkSave(save);
    if (problem) return err(422, problem);
    // Always moves forward, even if this Worker's clock is behind the one that wrote the last save;
    // a timestamp going backwards would make the next upload look stale.
    const savedAt = Math.max(Date.now(), (cur?.saved_at ?? 0) + 1);
    save.savedAt = savedAt;
    // Anything the server can't back up is corrected and reported back: knowledge beyond what study
    // proves, and furniture, cars or investment units that were never paid for.
    const [, state, owned, seizedRows] = await Promise.all([
      touchPlayer(env, user),
      loadState(env.DB, user.uid),
      ownedCounts(env.DB, user.uid),
      env.DB.prepare(
        "SELECT seized_property_json FROM efcc_cases WHERE target_uid = ? AND status = 'convicted' AND bought_back_at IS NULL AND seized_property_json IS NOT NULL",
      ).bind(user.uid).all<{ seized_property_json: string }>(),
    ]);
    advance(state, Date.now());
    const corrected: Corrections = {};
    const seized = new Map<string, { id: string; items?: SaveFurniture[] }>();
    for (const row of seizedRows.results) {
      const property = JSON.parse(row.seized_property_json) as { id?: string; items?: SaveFurniture[] };
      if (property.id) seized.set(property.id, property as { id: string; items?: SaveFurniture[] });
    }
    if (seized.size) {
      const properties = save.properties ?? [];
      const fixedProperties = properties.filter((property) => !property.id || !seized.has(property.id));
      const activeWasSeized = !!save.activeHouseId && seized.has(save.activeHouseId);
      const homeWasSeized = !!save.homePropertyId && seized.has(save.homePropertyId);
      corrected.confiscatedProperties = [...seized.keys()];
      if (fixedProperties.length !== properties.length) save.properties = corrected.properties = fixedProperties;
      const fallback = fixedProperties.find((property) => property.id === save.homePropertyId && (property.stage ?? 0) >= STAGES.length)
        ?? fixedProperties.find((property) => (property.stage ?? 0) >= STAGES.length)
        ?? null;
      if (homeWasSeized) save.homePropertyId = fallback?.id ?? null;
      if (activeWasSeized) {
        const confiscated = seized.get(save.activeHouseId!)!;
        save.activeHouseId = fallback?.id ?? null;
        save.items = corrected.items = fallback?.items ?? [];
        save.furnitureInventory = corrected.furnitureInventory = [...(save.furnitureInventory ?? []), ...(confiscated.items ?? [])];
      }
    }
    // House names, outsides, extensions and rooms (game/exterior.ts): only clean, known values are kept.
    if (cleanHouses(save)) corrected.properties = save.properties;
    const knowledge = verifyKnowledge(state, save.knowledge);
    if (knowledge < save.knowledge) corrected.knowledge = save.knowledge = knowledge;
    const properties = save.properties ?? [];
    const otherHouseItems = properties
      .filter((property) => property.id !== save.activeHouseId)
      .flatMap((property) => property.items ?? []);
    const combined = trimItems([...save.items, ...otherHouseItems, ...(save.furnitureInventory ?? [])], owned);
    if (combined.removed) {
      const kept = new Set(combined.items);
      const items = save.items.filter((item) => kept.has(item));
      const fixedProperties = properties.map((property) =>
        property.id === save.activeHouseId || !property.items
          ? property
          : { ...property, items: property.items.filter((item) => kept.has(item)) },
      );
      const inventory = (save.furnitureInventory ?? []).filter((item) => kept.has(item));
      if (items.length !== save.items.length) save.items = corrected.items = items;
      if (fixedProperties.some((property, i) => property.items !== properties[i]?.items ||
        property.items?.length !== properties[i]?.items?.length)) {
        save.properties = corrected.properties = fixedProperties;
      }
      if (inventory.length !== (save.furnitureInventory ?? []).length) {
        save.furnitureInventory = corrected.furnitureInventory = inventory;
      }
    }
    if (Array.isArray(save.ownedCars)) {
      const cars = save.ownedCars.filter((id) => typeof id === 'string' && ownsCar(owned, id));
      if (cars.length !== save.ownedCars.length) {
        save.ownedCars = corrected.ownedCars = cars;
        if (save.selectedCar && !cars.includes(save.selectedCar)) save.selectedCar = cars[0] ?? null;
        corrected.selectedCar = save.selectedCar ?? null;
      }
    }
    if (save.investments && typeof save.investments === 'object') {
      let changed = false;
      const fixed: Save['investments'] = {};
      for (const [id, h] of Object.entries(save.investments)) {
        const units = Math.min(Math.max(0, Number(h?.units) || 0), unitsOf(state, id));
        if (units !== h?.units) changed = true;
        if (h) fixed[id] = { ...h, units };
      }
      if (changed) save.investments = corrected.investments = fixed;
    }
    // One round trip for every write, in order: the wallet is seeded from the save row written just before it.
    // Every statement sets values outright, so if D1 drops the batch it is safe to send again.
    await retryD1(() => env.DB.batch([
      ...saveStateStmts(env.DB, user.uid, state),
      env.DB.prepare(
        `INSERT INTO saves (uid, version, data, saved_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(uid) DO UPDATE SET version = ?2, data = ?3, saved_at = ?4`,
      ).bind(user.uid, save.version, JSON.stringify(save), savedAt),
      env.DB.prepare('UPDATE players SET name = ? WHERE uid = ?').bind(save.name, user.uid),
      // First upload ever (e.g. a guest signing in): seed the wallet from it, capped.
      ensureWallet(env.DB, user.uid),
    ]));
    // Crib scores (worker/cribs.ts) are worked out from the house just stored, off the request path.
    ctx.waitUntil(refreshCribs(env.DB, user.uid, save as SaveJson).catch((e) => console.error('Crib score refresh failed', e)));
    return json({ ok: true, savedAt, corrected: Object.keys(corrected).length ? corrected : undefined });
  }

  if (path === '/api/save' && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM saves WHERE uid = ?').bind(user.uid).run();
    return json({ ok: true });
  }

  if (path === '/api/ref/claim' && req.method === 'POST') return referralClaim(req, env, user);
  if (path === '/api/estate/sync' && req.method === 'POST') return syncEstate(req, env.DB, user.uid);
  if (path === '/api/media' && req.method === 'POST') return uploadMedia(req, env, user);
  if (path === '/api/civic') return handleCivic(req, env, user, ctx);

  const roads = await handleRoads(req, env.DB, user.uid, path, env, ctx);
  if (roads) return roads;

  const disasters = await handleDisasters(req, env, ctx, user.uid, path);
  if (disasters) return disasters;

  const wallet = await handleWallet(req, env, user.uid, path);
  if (wallet) return wallet;

  const efcc = await handleEfcc(req, env, ctx, user.uid, path);
  if (efcc) return efcc;

  const bank = await handleBank(req, env, ctx, user.uid, path);
  if (bank) return bank;

  const crime = await handleCrime(req, env, ctx, user, path);
  if (crime) return crime;

  const guns = await handleGuns(req, env, ctx, user, path);
  if (guns) return guns;

  const owambe = await handleOwambe(req, env, ctx, user, path);
  if (owambe) return owambe;

  const cribs = await handleCribs(req, env, ctx, user, path, url);
  if (cribs) return cribs;

  const fun = await handleFun(req, env, ctx, user, path, url);
  if (fun) return fun;

  const snaps = await handleSnaps(req, env, user, path, url);
  if (snaps) return snaps;

  const games = await handleGames(req, env, ctx, user, path, url);
  if (games) return games;

  const social = await handleSocial(req, env, ctx, user, path, url);
  if (social) return social;

  const groups = await handleGroups(req, env, user, path, url);
  if (groups) return groups;

  const community = await handleCommunity(req, env, ctx, user, path);
  if (community) return community;

  const career = await handleCareer(req, env, ctx, user, path);
  if (career) return career;

  const hustles = await handleHustles(req, env, user, path);
  if (hustles) return hustles;

  const hangout = await handleHangout(req, env, ctx, user, path);
  if (hangout) return hangout;

  const kids = await handleKids(req, env, ctx, user, path);
  if (kids) return kids;

  const rentals = await handleRentals(req, env, ctx, user, path);
  if (rentals) return rentals;

  const blackMarket = await handleBlackMarket(req, env, ctx, user, path);
  if (blackMarket) return blackMarket;

  const vice = await handleVice(req, env, ctx, user, path);
  if (vice) return vice;

  const loans = await handleLoans(req, env, user.uid, path);
  if (loans) return loans;

  const shop = await handleShop(req, env, user, path);
  if (shop) return shop;

  const ads = await handleAds(req, env, user, path);
  if (ads) return ads;

  // Live shared area: /api/room/<area>
  const room = path.match(/^\/api\/room\/([a-z0-9-]{1,32})$/);
  if (room) {
    if (req.headers.get('Upgrade') !== 'websocket') return err(426, 'Expected websocket');
    const headers = new Headers(req.headers);
    headers.set('X-Uid', user.uid);
    const p = await env.DB.prepare('SELECT username FROM players WHERE uid = ?').bind(user.uid).first<{ username: string | null }>();
    if (!p?.username) return err(403, 'Pick a username first');
    headers.set('X-Username', p.username);
    return connectPlayer(env, user.uid, req, headers);
  }

  return err(404, 'Not found');
}
