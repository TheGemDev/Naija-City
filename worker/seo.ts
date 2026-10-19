// Pages for search engines. /sitemap.xml lists every page worth finding, /cities and /cities/<id> describe each city
// from its map (src/game/city.ts), so a new place shows up here with the next deploy. The guide and FAQ are plain
// files (public/guide.html, public/faq.html) in the same style.

import { JOBS } from '../src/game/catalog';
import { CITY_MAPS, flightFare, type Place } from '../src/game/city';
import { REGIONS, REGION_IDS, type RegionId } from '../src/game/regions';

/** The one address search engines should list. Every other host (kaduna.life, www.*) points here. */
export const SITE = 'https://naija.city';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });

/** The same look as public/privacy.html. */
function page(o: { path: string; title: string; description: string; on?: string; body: string }): string {
  const link = (href: string, text: string) => `<a href="${href}"${o.on === href ? ' class="on"' : ''}>${text}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}" />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="${SITE}${o.path}" />
<link rel="icon" href="/icons/kaduna-life.svg" type="image/svg+xml" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Naija City" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="${esc(o.description)}" />
<meta property="og:url" content="${SITE}${o.path}" />
<meta property="og:image" content="${SITE}/og.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<style>
  :root { --ink:#0f172a; --muted:#64748b; --green:#15803d; --line:#e2e8f0; --bg:#f4f8f2; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); background:linear-gradient(180deg,#c7e0f6 0,#e6f2e8 320px,var(--bg) 100%) no-repeat var(--bg); }
  main { max-width:760px; margin:0 auto; padding:20px 16px 56px; }
  .logo { font-size:28px; font-weight:800; letter-spacing:-1px; color:var(--green); text-decoration:none; }
  .logo span { color:#f59e0b; }
  nav { display:flex; gap:14px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:14px; }
  nav div a { color:var(--muted); font-weight:700; font-size:14px; margin-left:14px; text-decoration:none; }
  nav div a.on { color:var(--ink); }
  article { background:#fff; border-radius:24px; padding:28px 24px; box-shadow:0 20px 50px rgba(15,23,42,.10),0 2px 6px rgba(15,23,42,.05); }
  h1 { margin:0 0 4px; font-size:28px; letter-spacing:-.5px; }
  h2 { margin:28px 0 6px; font-size:18px; }
  h3 { margin:18px 0 2px; font-size:16px; }
  p, li { color:#1e293b; } li { margin:4px 0; }
  .meta { color:var(--muted); font-size:14px; margin:0 0 12px; }
  .jobs { color:var(--muted); font-size:14px; margin:0; }
  .play { display:inline-block; margin:18px 0 4px; padding:12px 22px; border-radius:14px; background:var(--green); color:#fff; font-weight:800; text-decoration:none; }
  a { color:#2563eb; }
  footer { text-align:center; color:var(--muted); font-size:13px; margin-top:20px; }
</style>
</head>
<body>
<main>
<nav>
  <a class="logo" href="/">Naija<span>City</span></a>
  <div>${link('/guide', 'How to play')}${link('/cities', 'Cities')}${link('/faq', 'FAQ')}</div>
</nav>
<article>
${o.body}
<a class="play" href="/">Play Naija City free</a>
</article>
<footer>© Naija City · <a href="/">Play</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
</main>
</body>
</html>`;
}

/** Kaduna's links carry no city (src/net/deeplink.ts placeLink). */
const placePath = (city: string, id: string) => `/p/${city === 'kaduna' ? '' : `${city}/`}${id}`;

/** The city's public places: not the player's own house, which is a different house for everyone. */
const listedPlaces = (city: RegionId): Place[] => CITY_MAPS[city].places.filter((p) => p.blurb && p.id !== 'home');

const jobTitles = (p: Place) => (p.jobs ?? []).map((id) => JOBS.find((j) => j.id === id)?.title).filter(Boolean) as string[];

function citiesPage(): Response {
  const cards = REGION_IDS.map((id) => {
    const r = REGIONS[id];
    const places = listedPlaces(id);
    const sample = places.slice(0, 6).map((p) => p.name).join(', ');
    return `<h2><a href="/cities/${id}">${esc(r.name)}</a></h2>
<p class="meta">${esc(r.tagline)}</p>
<p>${places.length} places to visit, including ${esc(sample)}.${r.fare ? '' : ' The home city.'}</p>`;
  }).join('\n');
  return html(page({
    path: '/cities',
    title: 'Cities in Naija City: Kaduna, Abuja, Lagos and Kano',
    description: 'Naija City has four Nigerian cities to live in: Kaduna, Abuja, Lagos and Kano. See the places, landmarks and jobs in each one.',
    on: '/cities',
    body: `<h1>The cities</h1>
<p>Naija City is a 3D Nigerian life sim with four cities, each built from its real landmarks, roads and markets. Kaduna is home, and the others are a flight away from the airport.</p>
${cards}`,
  }));
}

function cityPage(id: RegionId): Response {
  const r = REGIONS[id];
  const places = listedPlaces(id);
  // Grouped by area, in the order the map lists them.
  const areas = new Map<string, Place[]>();
  for (const p of places) areas.set(p.area, [...(areas.get(p.area) ?? []), p]);
  const sections = [...areas].map(([area, list]) => `<h2>${esc(area)}</h2>
${list.map((p) => {
  const jobs = jobTitles(p);
  return `<h3>${p.icon} <a href="${placePath(id, p.id)}">${esc(p.name)}</a></h3>
<p>${esc(p.blurb)}</p>${jobs.length ? `\n<p class="jobs">Jobs here: ${esc(jobs.join(', '))}</p>` : ''}`;
}).join('\n')}`).join('\n');
  const others = REGION_IDS.filter((o) => o !== id).map((o) => `<a href="/cities/${o}">${REGIONS[o].name}</a>`).join(' · ');
  const getThere = r.fare
    ? `Fly in to ${esc(r.airport)}. A one-way ticket from Kaduna costs ${naira(flightFare('kaduna', id))} in game money.`
    : `Kaduna is the game's home city. ${esc(r.airport)} has flights to the other cities.`;
  return html(page({
    path: `/cities/${id}`,
    title: `${r.name} in Naija City: places, landmarks and jobs`,
    description: `Live in ${r.name} in Naija City, the free Nigerian life sim. ${places.length} places to visit, including ${places.slice(0, 4).map((p) => p.name).join(', ')}.`,
    on: '/cities',
    body: `<h1>${esc(r.name)}</h1>
<p class="meta">${esc(r.tagline)}</p>
<p>${esc(r.name)} in Naija City is a 3D city you can walk, drive and work in with other players. ${getThere}</p>
${sections}
<h2>Other cities</h2>
<p>${others}</p>`,
  }));
}

function sitemap(): Response {
  const paths = ['/', '/guide', '/faq', '/cities', ...REGION_IDS.map((id) => `/cities/${id}`), '/privacy', '/terms'];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

/** The search pages, or null when the path is not one of them. */
export function seoPage(req: Request): Response | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const path = new URL(req.url).pathname.replace(/\/$/, '') || '/';
  if (path === '/sitemap.xml') return sitemap();
  if (path === '/cities') return citiesPage();
  const city = path.match(/^\/cities\/([a-z]{1,20})$/);
  if (city) {
    if (Object.hasOwn(REGIONS, city[1])) return cityPage(city[1] as RegionId);
    return html(page({ path: '/cities', title: 'No such city · Naija City', description: 'That city is not in Naija City.', body: '<h1>No such city</h1>\n<p>See <a href="/cities">all the cities</a>.</p>' }), 404);
  }
  return null;
}

/** www.naija.city and www.kaduna.life: one address each, so search engines don't split a page in two. Page loads only:
 *  an old page still open on www keeps its /api calls working. */
export function wwwRedirect(req: Request): Response | null {
  const url = new URL(req.url);
  if (!url.hostname.startsWith('www.') || (req.method !== 'GET' && req.method !== 'HEAD') || url.pathname.startsWith('/api/')) return null;
  url.hostname = url.hostname.slice(4);
  return Response.redirect(url.toString(), 301);
}
