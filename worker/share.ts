// Share links. /u/<username> opens a player's profile, /b/<region>/<slot> opens a plot in an estate,
// /p/<placeId> (Kaduna) or /p/<city>/<placeId> opens a location on the map, /s/<id> opens a snap, /t/<id> a tweet and /shop/<id> a player's business. All serve the normal game page, with the Open Graph tags
// rewritten so a link pasted into WhatsApp, X or iMessage shows who or what it is.
// The game reads the path on load and jumps to it (src/net/deeplink.ts).

import { REGION_BY_ID } from '../src/game/property';
import '../src/game/abuja';
import '../src/game/lagos';
import '../src/game/kano';
import { CITY_MAPS } from '../src/game/city';
import { USERNAME_RE } from './social';
import { SNAP_KEEP_MS } from './snaps';
import { FEED_KEEP_MS } from './feed';
import { shopRow, tweetAuthor } from './og';
import { profileKidsSql } from './kids';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

interface Card { title: string; description: string; imageUrl?: string }

/** GET /api/profile/<username>: public card for a player. */
export async function readProfile(db: D1Database, username: string): Promise<Response> {
  const name = username.toLowerCase();
  if (!USERNAME_RE.test(name)) return json({ error: 'Not found' }, 404);
  const p = await db
    .prepare(
      `SELECT p.uid, p.username, p.name, COALESCE(w.balance, 0) AS balance,
              (SELECT COUNT(*) FROM estate_plots e WHERE e.uid = p.uid) AS plots,
              ${profileKidsSql} AS children
       FROM players p LEFT JOIN wallets w ON w.uid = p.uid WHERE p.username = ?`,
    )
    .bind(name)
    .first<{ uid: string; username: string; name: string | null; balance: number; plots: number; children: string | null }>();
  if (!p) return json({ error: 'Not found' }, 404);
  // The children at home (Phone → Adopt): first names and ages, shown on their profile card.
  const children = JSON.parse(p.children ?? '[]') as { name: string; sex: string; bornAt: number }[];
  return json({ uid: p.uid, username: p.username, name: p.name, plots: p.plots, children });
}

/** GET /api/plot/<region>/<slot>: public card for a plot. */
export async function readPlot(db: D1Database, region: string, slot: number): Promise<Response> {
  if (!REGION_BY_ID[region] || !Number.isInteger(slot) || slot < 0 || slot > 10_000_000) return json({ error: 'Not found' }, 404);
  const row = await plotRow(db, region, slot);
  return json({ region, slot, owner: row?.owner ?? null, uid: row?.uid ?? null, design: row?.design ?? null, stage: row?.stage ?? 0 });
}

/** GET /api/shop/<id>: public card for a player's business. */
export async function readShop(db: D1Database, id: number): Promise<Response> {
  const shop = await shopRow(db, id);
  return shop ? json(shop) : json({ error: 'Not found' }, 404);
}

async function plotRow(db: D1Database, region: string, slot: number) {
  return db
    .prepare(
      `SELECT e.uid, COALESCE(p.username, p.name) AS owner, e.design, e.stage
       FROM estate_plots e LEFT JOIN players p ON p.uid = e.uid WHERE e.region = ? AND e.slot = ?`,
    )
    .bind(region, slot)
    .first<{ uid: string; owner: string | null; design: string | null; stage: number }>();
}

async function cardFor(db: D1Database, path: string): Promise<Card | null> {
  const u = path.match(/^\/u\/([A-Za-z0-9_]{1,15})\/?$/);
  if (u) {
    const name = u[1].toLowerCase();
    const p = await db.prepare('SELECT username FROM players WHERE username = ?').bind(name).first<{ username: string }>();
    if (!p) return null;
    return { title: `@${p.username} on Naija City`, description: `Meet @${p.username} in Naija City, the Nigerian life sim. Open the game to say hello.`, imageUrl: `/api/og/u/${p.username}` };
  }
  const b = path.match(/^\/b\/([a-z0-9_]{1,24})\/(\d{1,8})\/?$/);
  if (b) {
    const region = REGION_BY_ID[b[1]];
    if (!region) return null;
    const row = await plotRow(db, b[1], Number(b[2]));
    const where = `${region.name} estate`;
    return {
      title: row?.owner ? `@${row.owner}'s plot in ${where}` : `A free plot in ${where}`,
      description: row?.owner ? `Come and see @${row.owner}'s place in ${where} on Naija City.` : `Land is waiting in ${where}. Buy it on Naija City.`,
      imageUrl: `/api/og/b/${b[1]}/${b[2]}`,
    };
  }
  // Snaps and tweets last a day. After that the link is an ordinary link to the game.
  const s = path.match(/^\/s\/(\d{1,12})\/?$/);
  if (s) {
    const snap = await db
      .prepare('SELECT s.caption, p.username FROM snaps s LEFT JOIN players p ON p.uid = s.uid WHERE s.id = ? AND s.created_at >= ?')
      .bind(Number(s[1]), Date.now() - SNAP_KEEP_MS)
      .first<{ caption: string; username: string | null }>();
    if (!snap) return null;
    const who = `@${snap.username ?? 'someone'}`;
    return {
      title: `${who}'s snap on Naija City`,
      description: snap.caption || `${who} posted a snap in Naija City. Open the game to see it before it disappears.`,
      imageUrl: `/api/og/s/${s[1]}`,
    };
  }
  const t = path.match(/^\/t\/(\d{1,12})\/?$/);
  if (t) {
    const tweet = await db
      .prepare('SELECT f.kind, f.text, p.username FROM feed f LEFT JOIN players p ON p.uid = f.uid WHERE f.id = ? AND f.parent_id IS NULL AND f.created_at >= ?')
      .bind(Number(t[1]), Date.now() - FEED_KEEP_MS)
      .first<{ kind: string; text: string; username: string | null }>();
    if (!tweet) return null;
    return { title: `${tweetAuthor(tweet.kind, tweet.username, Number(t[1]))} on Naija Twitter`, description: tweet.text, imageUrl: `/api/og/t/${t[1]}` };
  }
  const shop = path.match(/^\/shop\/(\d{1,10})\/?$/);
  if (shop) {
    const row = await shopRow(db, Number(shop[1]));
    if (!row) return null;
    const by = row.owner ? ` by @${row.owner}` : '';
    return {
      title: `${row.icon} ${row.name} — ${row.kind} in Naija City`,
      description: `${row.name}${by} is ${row.open ? 'open' : 'a shop'} at ${row.where}. Open the game to buy from it.`,
      imageUrl: `/api/og/shop/${row.id}`,
    };
  }
  const p = path.match(/^\/p\/(?:([a-z]{1,20})\/)?([a-z_]{1,30})\/?$/);
  if (p) {
    // The cities share place ids: the link says which city's place it is.
    const city = p[1] ?? 'kaduna';
    const place = Object.hasOwn(CITY_MAPS, city) ? CITY_MAPS[city].placeById[p[2]] : undefined;
    if (!place) return null;
    return {
      title: `${place.icon} ${place.name} — Naija City`,
      description: place.blurb || `Visit ${place.name} in ${place.area}. Open the game to go there.`,
      imageUrl: `/api/og/p/${city}/${place.id}`,
    };
  }
  return null;
}

/** Serve the game's index.html for a share link, with link-preview tags filled in. Null if the path isn't a share link. */
export async function shareLinkPage(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url);
  if (req.method !== 'GET' || !/^\/(u|b|p|s|t|shop)\//.test(url.pathname)) return null;
  const page = await env.ASSETS.fetch(new Request(new URL('/', url), req));
  const card = await cardFor(env.DB, url.pathname).catch(() => null);
  if (!card) return page;
  const meta = (attrs: string) => ({ element: (e: Element) => { e.append(attrs, { html: true }); } });
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const image = card.imageUrl ? `${url.origin}${card.imageUrl}` : `${url.origin}/og.jpg`;
  const tags = [
    ['og:type', 'website'], ['og:site_name', 'Naija City'], ['og:title', card.title], ['og:description', card.description],
    ['og:url', url.origin + url.pathname], ['og:image', image], ['og:image:width', '1200'], ['og:image:height', '630'],
  ].map(([k, v]) => `<meta property="${k}" content="${esc(v)}" />`).join('\n')
    + `\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:image" content="${esc(image)}" />`
    + `\n<meta name="description" content="${esc(card.description)}" />\n<link rel="canonical" href="${esc(url.origin + url.pathname)}" />`;
  return new HTMLRewriter()
    .on('title', { element: (e) => { e.setInnerContent(card.title); } })
    // The home page's own search tags would win over this link's card: drop them.
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"], link[rel="canonical"], script[type="application/ld+json"]', { element: (e) => { e.remove(); } })
    .on('head', meta(tags))
    .transform(page);
}
