// Dynamic Open Graph preview images for share links: houses (/b/<region>/<slot>), players (/u/<username>),
// snaps (/s/<id>), tweets (/t/<id>), player shops (/shop/<id>) and places on the map (/p/<city>/<placeId>).
// Generates a 1200×630 PNG card: the house design, owner, region and construction stage; the player's
// face, origin, day and job; the snap's picture and message; the tweet as it reads in the game (a police
// tweet with the thief's mugshot beside it); or the place, its area and what goes on there.
// Uses Satori (via workers-og) to render a layout tree to SVG, then resvg-wasm to rasterise it.

import { ImageResponse } from 'workers-og';
import fontBold from './fonts/PlusJakartaSans-Bold.ttf';
import { REGION_BY_ID, DESIGN_BY_ID, STAGES } from '../src/game/property';
import { avatarSvg } from '../src/game/face';
import { originOf } from '../src/game/origins';
import { JOBS } from '../src/game/catalog';
import { BIZ_COLOURS, BUSINESS_BY_ID, MARKET_PRODUCT_BY_ID, type BusinessType } from '../src/game/career';
import { CITY_MAPS, cityMap } from '../src/game/city';
import { regionOf } from '../src/game/regions';
import { mugshotParts } from '../src/game/mugshot';
import { SNAP_KEEP_MS, readSnap } from './snaps';
import { FEED_KEEP_MS } from './feed';
import { blogOf } from '../src/game/news';

async function plotRow(db: D1Database, region: string, slot: number) {
  return db
    .prepare(
      `SELECT e.uid, COALESCE(p.username, p.name) AS owner, e.design, e.stage
       FROM estate_plots e LEFT JOIN players p ON p.uid = e.uid WHERE e.region = ? AND e.slot = ?`,
    )
    .bind(region, slot)
    .first<{ uid: string; owner: string | null; design: string | null; stage: number }>();
}

type PlotRow = Awaited<ReturnType<typeof plotRow>>;

// Satori element helpers — plain objects, no JSX transform needed.
type El = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, ...children: (El | string)[]): El => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});


/** A little house drawing for the card: shape follows the design, how much is built follows the stage. */
function houseSvg(designId: string | null, stage: number, owned: boolean): string {
  const done = stage >= STAGES.length;
  const sky = '<rect width="520" height="400" fill="#dff3e6"/><circle cx="440" cy="70" r="34" fill="#fcd34d"/>';
  const ground = '<rect y="320" width="520" height="80" fill="#86c58f"/><rect y="320" width="520" height="8" fill="#5fa86b"/>';
  if (!designId) {
    const sign = '<rect x="236" y="250" width="8" height="80" fill="#92400e"/><rect x="170" y="200" width="180" height="70" rx="10" fill="#fff" stroke="#0f6b3a" stroke-width="5"/>'
      + `<text x="260" y="248" font-size="34" font-weight="700" text-anchor="middle" fill="#0f6b3a" font-family="Plus Jakarta Sans">${owned ? 'LAND' : 'FOR SALE'}</text>`;
    const fence = [60, 120, 180, 340, 400, 460].map((x) => `<rect x="${x}" y="290" width="10" height="50" fill="#b45309"/>`).join('') + '<rect x="40" y="305" width="440" height="8" fill="#b45309"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="400" viewBox="0 0 520 400">${sky}${ground}${fence}${sign}</svg>`;
  }
  const dims: Record<string, { w: number; h: number; floors: number }> = {
    selfcon: { w: 190, h: 100, floors: 1 }, bungalow: { w: 260, h: 120, floors: 1 }, duplex: { w: 320, h: 150, floors: 1 },
    flats: { w: 340, h: 210, floors: 2 }, mansion: { w: 360, h: 230, floors: 2 },
  };
  const d = dims[designId] ?? dims.bungalow;
  const x = (520 - d.w) / 2, base = 320, top = base - d.h;
  const wall = stage >= 4 ? (designId === 'mansion' ? '#f8fafc' : '#fde68a') : '#a8a29e';
  let out = sky + ground;
  if (stage >= 1) out += `<rect x="${x - 14}" y="${base - 8}" width="${d.w + 28}" height="14" fill="#78716c"/>`; // foundation slab
  if (stage >= 2) {
    const wh = d.h;
    out += `<rect x="${x}" y="${base - wh}" width="${d.w}" height="${wh}" fill="${wall}" stroke="#57534e" stroke-width="3"/>`;
    if (stage < 3) for (let i = 1; i < 4; i++) out += `<line x1="${x}" x2="${x + d.w}" y1="${base - (wh * i) / 4}" y2="${base - (wh * i) / 4}" stroke="#78716c" stroke-width="2"/>`;
  }
  if (stage >= 3) {
    const rc = designId === 'mansion' ? '#7f1d1d' : '#b91c1c';
    out += `<polygon points="${x - 22},${top} ${x + d.w / 2},${top - 70} ${x + d.w + 22},${top}" fill="${rc}"/>`;
    if (designId === 'mansion') out += `<rect x="${x + d.w / 2 - 60}" y="${top + 40}" width="14" height="${d.h - 40}" fill="#e2e8f0"/><rect x="${x + d.w / 2 + 46}" y="${top + 40}" width="14" height="${d.h - 40}" fill="#e2e8f0"/>`;
  }
  if (stage >= 4) {
    const rows = d.floors;
    const cols = designId === 'selfcon' ? 2 : designId === 'flats' ? 4 : 3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = x + 24 + c * ((d.w - 48) / cols) + 6, wy = top + 20 + r * (d.h / rows - 4);
      out += `<rect x="${wx}" y="${wy}" width="${(d.w - 48) / cols - 18}" height="34" rx="3" fill="#7dd3fc" stroke="#0369a1" stroke-width="3"/>`;
    }
    out += `<rect x="${x + d.w / 2 - 22}" y="${base - 66}" width="44" height="66" rx="4" fill="#92400e"/><circle cx="${x + d.w / 2 + 12}" cy="${base - 32}" r="3" fill="#fcd34d"/>`;
    out += `<rect x="${x + d.w + 40}" y="${base - 120}" width="14" height="120" fill="#78350f"/><circle cx="${x + d.w + 47}" cy="${base - 130}" r="42" fill="#22a05a"/>`;
  }
  if (!done) out += '<rect x="30" y="296" width="70" height="26" fill="#fbbf24"/><rect x="30" y="296" width="70" height="26" fill="none" stroke="#92400e" stroke-width="3"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="400" viewBox="0 0 520 400">${out}</svg>`;
}

function plotCard(regionId: string, slot: number, row: PlotRow): El {
  const region = REGION_BY_ID[regionId];
  const design = row?.design ? DESIGN_BY_ID[row.design] : null;
  const stageIdx = row?.stage ?? 0;
  const complete = design && stageIdx >= STAGES.length;
  const building = design && !complete;

  const title = design?.name ?? 'Empty Plot';
  const subtitle = complete
    ? 'Completed'
    : building
      ? `${STAGES[stageIdx].name} — stage ${stageIdx + 1} of ${STAGES.length}`
      : row?.owner
        ? 'Land purchased'
        : 'Available';
  const ownerLine = row?.owner ? `@${row.owner}` : '';
  const locationLine = `${region.name} estate · plot #${slot}`;

  // Progress bar (only when building)
  const progress = building ? (stageIdx + 1) / STAGES.length : complete ? 1 : 0;

  return el(
    'div',
    {
      display: 'flex',
      width: '1200px',
      height: '630px',
      background: 'linear-gradient(135deg, #0f6b3a 0%, #0a4d2a 100%)',
      padding: '40px',
      fontFamily: '"Plus Jakarta Sans"',
      color: '#0f172a',
    },
    // Main white card
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'rgba(255,255,255,0.96)',
        borderRadius: '24px',
        padding: '40px 48px',
        justifyContent: 'space-between',
      },
      // Top section: info + house drawing
      el(
        'div',
        { display: 'flex', alignItems: 'flex-start', gap: '40px', justifyContent: 'space-between' },
        // Text column
        el(
          'div',
          { display: 'flex', flexDirection: 'column', gap: '8px', flex: '1' },
          el('div', { fontSize: '44px', fontWeight: 700, lineHeight: '1.15' }, title),
          el('div', { fontSize: '26px', color: '#64748b', fontWeight: 600 }, subtitle),
          // Progress bar
          ...(building
            ? [
                el(
                  'div',
                  {
                    display: 'flex',
                    width: '100%',
                    height: '12px',
                    background: '#e2e8f0',
                    borderRadius: '6px',
                    marginTop: '8px',
                    overflow: 'hidden',
                  },
                  el('div', {
                    display: 'flex',
                    width: `${Math.round(progress * 100)}%`,
                    height: '100%',
                    background: '#0f6b3a',
                    borderRadius: '6px',
                  }),
                ),
              ]
            : []),
        ),
        { type: 'img', props: { src: `data:image/svg+xml;base64,${btoa(houseSvg(row?.design ?? null, stageIdx, !!row?.owner))}`, width: 440, height: 338, style: { borderRadius: '20px', flexShrink: 0 } } },
      ),
      // Bottom section: owner + location + branding
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
        el(
          'div',
          { display: 'flex', flexDirection: 'column', gap: '4px' },
          ...(ownerLine
            ? [el('div', { fontSize: '30px', fontWeight: 700, color: '#0f6b3a' }, ownerLine)]
            : []),
          el('div', { fontSize: '22px', color: '#94a3b8', fontWeight: 600 }, locationLine),
        ),
        el('div', { display: 'flex', fontSize: '22px', fontWeight: 700, color: '#0f6b3a' }, 'NAIJA CITY'),
      ),
    ),
  );
}

export async function ogPlotImage(env: Env, regionId: string, slot: number): Promise<Response> {
  if (!REGION_BY_ID[regionId] || !Number.isInteger(slot) || slot < 0 || slot > 10_000_000) {
    return new Response('Not found', { status: 404 });
  }
  const row = await plotRow(env.DB, regionId, slot);
  const element = plotCard(regionId, slot, row);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(element as any, {
    width: 1200,
    height: 630,
    fonts: [{ name: 'Plus Jakarta Sans', data: fontBold, weight: 700, style: 'normal' as const }],
  });
}

/* ---------- Player cards (/u/<username>) ---------- */

async function profileRow(db: D1Database, username: string) {
  return db
    .prepare(
      `SELECT p.username, (SELECT COUNT(*) FROM estate_plots e WHERE e.uid = p.uid) AS plots,
              json_extract(s.data, '$.look') AS look, json_extract(s.data, '$.origin') AS origin,
              json_extract(s.data, '$.minutes') AS minutes, json_extract(s.data, '$.jobId') AS jobId
       FROM players p LEFT JOIN saves s ON s.uid = p.uid WHERE p.username = ?`,
    )
    .bind(username)
    .first<{ username: string; plots: number; look: string | null; origin: string | null; minutes: number | null; jobId: string | null }>();
}

type ProfileRow = NonNullable<Awaited<ReturnType<typeof profileRow>>>;

function profileCard(row: ProfileRow): El {
  const origin = originOf(row.origin);
  const job = JOBS.find((j) => j.id === row.jobId);
  const day = Math.floor((row.minutes ?? 0) / (24 * 60)) + 1;
  const facts = [`Day ${day} in Naija City`, job?.title ?? 'Hustling', row.plots ? `${row.plots} ${row.plots === 1 ? 'plot' : 'plots'} of land` : 'No land yet'];

  return el(
    'div',
    {
      display: 'flex',
      width: '1200px',
      height: '630px',
      background: 'linear-gradient(135deg, #0f6b3a 0%, #0a4d2a 100%)',
      padding: '40px',
      fontFamily: '"Plus Jakarta Sans"',
      color: '#0f172a',
    },
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'rgba(255,255,255,0.96)',
        borderRadius: '24px',
        padding: '40px 48px',
        justifyContent: 'space-between',
      },
      el(
        'div',
        { display: 'flex', alignItems: 'center', gap: '48px' },
        { type: 'img', props: { src: `data:image/svg+xml;base64,${btoa(avatarSvg(row.look, '#dcfce7'))}`, width: 380, height: 380, style: { borderRadius: '190px', border: `10px solid ${origin.color}`, flexShrink: 0 } } },
        el(
          'div',
          { display: 'flex', flexDirection: 'column', gap: '14px', flex: '1' },
          el('div', { fontSize: '60px', fontWeight: 700, lineHeight: '1.1' }, `@${row.username}`),
          el(
            'div',
            { display: 'flex' },
            el('div', { display: 'flex', fontSize: '26px', fontWeight: 700, color: '#ffffff', background: origin.color, borderRadius: '999px', padding: '6px 20px' }, origin.label),
          ),
          ...facts.map((f) => el('div', { fontSize: '30px', color: '#475569', fontWeight: 600 }, f)),
        ),
      ),
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
        el('div', { fontSize: '22px', color: '#94a3b8', fontWeight: 600 }, `naija.city/u/${row.username}`),
        el('div', { display: 'flex', fontSize: '22px', fontWeight: 700, color: '#0f6b3a' }, 'NAIJA CITY'),
      ),
    ),
  );
}

export async function ogProfileImage(env: Env, username: string): Promise<Response> {
  const row = await profileRow(env.DB, username.toLowerCase());
  if (!row) return new Response('Not found', { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(profileCard(row) as any, {
    width: 1200,
    height: 630,
    fonts: [{ name: 'Plus Jakarta Sans', data: fontBold, weight: 700, style: 'normal' as const }],
  });
}

/* ---------- Snap cards (/s/<id>) ---------- */

const FONTS = [{ name: 'Plus Jakarta Sans', data: fontBold, weight: 700 as const, style: 'normal' as const }];
const face = (look: string | null, size: number): El => ({
  type: 'img',
  props: { src: `data:image/svg+xml;base64,${btoa(avatarSvg(look, '#dcfce7'))}`, width: size, height: size, style: { borderRadius: `${size / 2}px`, flexShrink: 0 } },
});

/** The card's font has no naira sign, so money reads the way it is typed without one: N2,500. */
const plain = (text: string) => text.replace(/₦/g, 'N');

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** Width and height of a JPEG or PNG, read from its header. Null if it is neither. */
function pictureSize(b: Uint8Array): { w: number; h: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: v.getUint32(16), h: v.getUint32(20) };
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // A start-of-frame segment (but not the Huffman table, arithmetic or restart markers that share its range).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: v.getUint16(i + 7), h: v.getUint16(i + 5) };
    i += 2 + v.getUint16(i + 2);
  }
  return null;
}

export async function ogSnapImage(env: Env, id: number): Promise<Response> {
  const row = await env.DB
    .prepare(
      `SELECT s.media_key, s.caption, p.username, json_extract(sv.data, '$.look') AS look
       FROM snaps s LEFT JOIN players p ON p.uid = s.uid LEFT JOIN saves sv ON sv.uid = s.uid
       WHERE s.id = ? AND s.created_at >= ?`,
    )
    .bind(id, Date.now() - SNAP_KEEP_MS)
    .first<{ media_key: string; caption: string; username: string | null; look: string | null }>();
  if (!row) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(row.media_key);
  if (!object) return new Response('Not found', { status: 404 });
  const bytes = new Uint8Array(await object.arrayBuffer());
  const size = pictureSize(bytes);
  // The card can only be drawn around a JPEG or PNG. Anything else is shown as it is.
  if (!size || !size.w || !size.h) return readSnap(env, row.media_key);
  // The picture keeps its shape: as tall as the card allows, and no wider than leaves room for the words.
  const scale = Math.min(550 / size.h, 640 / size.w);
  const w = Math.round(size.w * scale), h = Math.round(size.h * scale);
  const type = object.httpMetadata?.contentType ?? 'image/jpeg';
  const card = el(
    'div',
    { display: 'flex', width: '1200px', height: '630px', background: 'linear-gradient(135deg, #0f6b3a 0%, #0a4d2a 100%)', padding: '40px', gap: '40px', alignItems: 'center', fontFamily: '"Plus Jakarta Sans"', color: '#ffffff' },
    { type: 'img', props: { src: `data:${type};base64,${base64(bytes)}`, width: w, height: h, style: { borderRadius: '24px', border: '6px solid #fffc00', flexShrink: 0 } } },
    el(
      'div',
      { display: 'flex', flexDirection: 'column', flex: '1', height: '100%', justifyContent: 'space-between' },
      el(
        'div',
        { display: 'flex', flexDirection: 'column', gap: '24px' },
        el(
          'div',
          { display: 'flex', alignItems: 'center', gap: '20px' },
          face(row.look, 96),
          el('div', { display: 'flex', fontSize: '44px', fontWeight: 700 }, `@${row.username ?? 'someone'}`),
        ),
        ...(row.caption ? [el('div', { display: 'flex', fontSize: row.caption.length > 60 ? '34px' : '42px', lineHeight: '1.3', fontWeight: 700 }, plain(row.caption))] : []),
      ),
      el(
        'div',
        { display: 'flex', flexDirection: 'column', gap: '6px' },
        el('div', { display: 'flex', fontSize: '24px', color: '#fffc00', fontWeight: 700 }, 'SNAP · gone in 24 hours'),
        el('div', { display: 'flex', fontSize: '22px', fontWeight: 700, color: '#bbf7d0' }, 'NAIJA CITY'),
      ),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(card as any, { width: 1200, height: 630, fonts: FONTS, emoji: 'twemoji' });
}

/* ---------- Tweet cards (/t/<id>) ---------- */

const MUGSHOT_SIDE = 410;
/**
 * The police picture for a card. The rasteriser draws the SVG's shapes but none of its words, so the booking board
 * and the stamp are written over it here, each turned about its own centre the way the drawing turns it.
 */
function mugshotPicture({ svg, labels }: ReturnType<typeof mugshotParts>): El {
  const k = MUGSHOT_SIDE / 400;
  const px = (n: number) => `${(n * k).toFixed(1)}px`;
  const over = (b: { x: number; y: number; w: number; h: number; rot: number }, style: Record<string, unknown>, ...children: (El | string)[]) =>
    el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h), transform: `rotate(${b.rot.toFixed(1)}deg)`, ...style }, ...children);
  const { board, stamp } = labels;
  return el(
    'div',
    { display: 'flex', position: 'relative', width: `${MUGSHOT_SIDE}px`, height: `${MUGSHOT_SIDE}px`, borderRadius: '20px', border: '6px solid #0f172a', overflow: 'hidden', flexShrink: 0 },
    { type: 'img', props: { src: `data:image/svg+xml;base64,${base64(new TextEncoder().encode(svg))}`, width: MUGSHOT_SIDE, height: MUGSHOT_SIDE } },
    over(
      board,
      { color: board.ink, justifyContent: 'space-between', padding: `${px(7)} 0 ${px(6)}` },
      el('div', { display: 'flex', fontSize: px(11), letterSpacing: px(1) }, board.station),
      el('div', { display: 'flex', fontSize: px(Math.min(board.nameSize, 21)) }, board.name),
      el('div', { display: 'flex', fontSize: px(10), opacity: 0.85 }, board.booking),
    ),
    ...(stamp ? [over(stamp, { color: '#b91c1c', justifyContent: 'center', opacity: 0.82 }, el('div', { display: 'flex', fontSize: px(stamp.size - 1) }, stamp.word))] : []),
  );
}

/** Who a tweet is from, the way Twitter in the game names them (TweetCard in src/ui/LiveApps.tsx). */
export const tweetAuthor = (kind: string, username: string | null, id: number, author?: string | null) =>
  kind === 'post' ? `@${username ?? 'someone'}` : kind === 'citizen' ? author ?? 'A citizen' : kind === 'vdm' ? 'VDM' : kind === 'mugshot' ? 'Nigeria Police' : kind === 'achievement' ? 'Achievement' : blogOf(id);

export async function ogTweetImage(env: Env, id: number): Promise<Response> {
  const row = await env.DB
    .prepare(
      `SELECT f.kind, f.icon, f.text, f.uid, f.created_at AS at, f.author, p.username, json_extract(sv.data, '$.look') AS look,
              (SELECT COUNT(*) FROM feed_likes l WHERE l.post_id = f.id) AS likes,
              (SELECT COUNT(*) FROM feed r WHERE r.parent_id = f.id) AS replies
       FROM feed f LEFT JOIN players p ON p.uid = f.uid LEFT JOIN saves sv ON sv.uid = f.uid
       WHERE f.id = ? AND f.parent_id IS NULL AND f.created_at >= ?`,
    )
    .bind(id, Date.now() - FEED_KEEP_MS)
    .first<{ kind: string; icon: string; text: string; uid: string | null; at: number; author: string | null; username: string | null; look: string | null; likes: number; replies: number }>();
  if (!row) return new Response('Not found', { status: 404 });
  const byPlayer = row.kind === 'post';
  // The police picture, drawn the way the game draws it under the tweet (src/ui/Mugshot.tsx).
  const mugshot = row.kind === 'mugshot' && row.uid ? mugshotPicture(mugshotParts({ look: row.look, uid: row.uid, username: row.username, seed: id, at: row.at })) : null;
  const words = el('div', { display: 'flex', fontSize: mugshot ? (row.text.length > 120 ? '28px' : '34px') : row.text.length > 180 ? '34px' : row.text.length > 90 ? '40px' : '52px', lineHeight: '1.3', fontWeight: 700 }, plain(row.text));
  const author = el(
    'div',
    { display: 'flex', alignItems: 'center', gap: '20px' },
    byPlayer ? face(row.look, 96) : el('div', { display: 'flex', fontSize: mugshot ? '56px' : '72px' }, row.icon),
    el('div', { display: 'flex', fontSize: '40px', fontWeight: 700 }, tweetAuthor(row.kind, row.username, id, row.author)),
  );
  const card = el(
    'div',
    { display: 'flex', width: '1200px', height: '630px', background: 'linear-gradient(135deg, #0f6b3a 0%, #0a4d2a 100%)', padding: '40px', fontFamily: '"Plus Jakarta Sans"', color: '#0f172a' },
    el(
      'div',
      { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'rgba(255,255,255,0.96)', borderRadius: '24px', padding: '40px 48px', justifyContent: 'space-between' },
      mugshot
        ? el(
          'div',
          { display: 'flex', alignItems: 'center', gap: '40px' },
          mugshot,
          el('div', { display: 'flex', flexDirection: 'column', gap: '22px', flex: '1' }, author, words),
        )
        : el('div', { display: 'flex', flexDirection: 'column', gap: '28px' }, author, words),
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
        el(
          'div',
          { display: 'flex', gap: '36px', fontSize: '26px', color: '#64748b', fontWeight: 600 },
          el('div', { display: 'flex' }, '❤️', el('div', { display: 'flex', marginLeft: '10px' }, `${row.likes}`)),
          el('div', { display: 'flex' }, '💬', el('div', { display: 'flex', marginLeft: '10px' }, `${row.replies}`)),
        ),
        el('div', { display: 'flex', fontSize: '22px', fontWeight: 700, color: '#0f6b3a' }, 'NAIJA TWITTER · NAIJA CITY'),
      ),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(card as any, { width: 1200, height: 630, fonts: FONTS, emoji: 'twemoji' });
}

/* ---------- Shop cards (/shop/<id>) ---------- */

/** A player's business as the world sees it: badge, kind, place, owner and whether it is trading. */
export async function shopRow(db: D1Database, id: number) {
  const row = await db
    .prepare(
      `SELECT b.id, b.type, b.name, b.icon, b.color, b.city, b.place_id, b.area, p.username AS owner,
              EXISTS (SELECT 1 FROM business_products bp WHERE bp.business_id = b.id AND bp.stock > 0) AS stocked
       FROM businesses b LEFT JOIN players p ON p.uid = b.uid WHERE b.id = ?`,
    )
    .bind(id)
    .first<{ id: number; type: string; name: string; icon: string; color: string; city: string; place_id: string; area: string; owner: string | null; stocked: number }>();
  const def = row ? BUSINESS_BY_ID[row.type as BusinessType] : undefined;
  if (!row || !def) return null;
  // The place as it stands in the shop's own city: the airport is a different one in each.
  const place = cityMap(row.city).placeById[row.place_id];
  return {
    id: row.id, type: row.type, kind: def.name, name: row.name, icon: row.icon || def.icon, color: row.color || BIZ_COLOURS[0],
    city: row.city, place: row.place_id, where: place ? `${place.name}, ${place.area}` : row.area, owner: row.owner, open: row.stocked > 0,
  };
}

export async function ogShopImage(env: Env, id: number): Promise<Response> {
  const shop = await shopRow(env.DB, id);
  if (!shop) return new Response('Not found', { status: 404 });
  const { results } = await env.DB
    .prepare('SELECT product, price FROM business_products WHERE business_id = ? AND stock > 0 ORDER BY price LIMIT 3')
    .bind(id)
    .all<{ product: string; price: number }>();
  const shelf = results.flatMap((r) => {
    const product = MARKET_PRODUCT_BY_ID[r.product];
    return product ? [{ icon: product.icon, name: product.name, price: `N${r.price.toLocaleString('en-NG')}` }] : [];
  });
  const card = el(
    'div',
    { display: 'flex', width: '1200px', height: '630px', background: 'linear-gradient(135deg, #0f6b3a 0%, #0a4d2a 100%)', padding: '40px', fontFamily: '"Plus Jakarta Sans"', color: '#0f172a' },
    el(
      'div',
      { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'rgba(255,255,255,0.96)', borderRadius: '24px', padding: '40px 48px', justifyContent: 'space-between' },
      el(
        'div',
        { display: 'flex', alignItems: 'center', gap: '40px' },
        el('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '220px', height: '220px', borderRadius: '56px', background: shop.color, fontSize: '120px', flexShrink: 0 }, shop.icon),
        el(
          'div',
          { display: 'flex', flexDirection: 'column', gap: '10px', flex: '1' },
          el('div', { display: 'flex', fontSize: shop.name.length > 16 ? '52px' : '64px', fontWeight: 700, lineHeight: '1.1' }, plain(shop.name)),
          el('div', { display: 'flex', fontSize: '30px', color: '#475569', fontWeight: 600 }, `${shop.kind} · ${shop.where}`),
          el(
            'div',
            { display: 'flex', alignItems: 'center', gap: '16px' },
            el('div', { display: 'flex', fontSize: '24px', fontWeight: 700, color: '#ffffff', background: shop.open ? '#16a34a' : '#94a3b8', borderRadius: '999px', padding: '6px 20px' }, shop.open ? 'OPEN NOW' : 'CLOSED'),
            ...(shop.owner ? [el('div', { display: 'flex', fontSize: '28px', fontWeight: 700, color: '#0f6b3a' }, `by @${shop.owner}`)] : []),
          ),
        ),
      ),
      el(
        'div',
        { display: 'flex', gap: '20px' },
        ...shelf.map((item) => el(
          'div',
          { display: 'flex', alignItems: 'center', gap: '14px', flex: '1', background: '#f1f5f9', borderRadius: '20px', padding: '16px 20px' },
          el('div', { display: 'flex', fontSize: '48px' }, item.icon),
          el(
            'div',
            { display: 'flex', flexDirection: 'column' },
            el('div', { display: 'flex', fontSize: '24px', fontWeight: 700 }, item.name),
            el('div', { display: 'flex', fontSize: '24px', fontWeight: 700, color: '#0f6b3a' }, item.price),
          ),
        )),
      ),
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
        el('div', { display: 'flex', fontSize: '22px', color: '#94a3b8', fontWeight: 600 }, `naija.city/shop/${shop.id}`),
        el('div', { display: 'flex', fontSize: '22px', fontWeight: 700, color: '#0f6b3a' }, 'NAIJA CITY'),
      ),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(card as any, { width: 1200, height: 630, fonts: FONTS, emoji: 'twemoji' });
}

/* ---------- Place cards (/p/<city>/<placeId>) ---------- */

/** A place on the map: what it is called in that city, where it stands and what goes on there. */
export async function ogPlaceImage(cityId: string, placeId: string): Promise<Response> {
  // The cities share place ids: the airport is a different one in each.
  const place = Object.hasOwn(CITY_MAPS, cityId) ? CITY_MAPS[cityId].placeById[placeId] : undefined;
  if (!place) return new Response('Not found', { status: 404 });
  const region = regionOf(cityId);
  const blurb = place.blurb.length > 150 ? `${place.blurb.slice(0, 147).trimEnd()}…` : place.blurb;
  const card = el(
    'div',
    { display: 'flex', width: '1200px', height: '630px', background: 'linear-gradient(135deg, #0f6b3a 0%, #0a4d2a 100%)', padding: '40px', fontFamily: '"Plus Jakarta Sans"', color: '#0f172a' },
    el(
      'div',
      { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'rgba(255,255,255,0.96)', borderRadius: '24px', padding: '40px 48px', justifyContent: 'space-between' },
      el(
        'div',
        { display: 'flex', alignItems: 'center', gap: '40px' },
        el('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '220px', height: '220px', borderRadius: '56px', background: region.accent, fontSize: '120px', flexShrink: 0 }, place.icon),
        el(
          'div',
          { display: 'flex', flexDirection: 'column', gap: '12px', flex: '1' },
          el('div', { display: 'flex', fontSize: place.name.length > 30 ? '44px' : place.name.length > 18 ? '54px' : '66px', fontWeight: 700, lineHeight: '1.1' }, plain(place.name)),
          el(
            'div',
            { display: 'flex' },
            el('div', { display: 'flex', fontSize: '26px', fontWeight: 700, color: '#ffffff', background: region.accent, borderRadius: '999px', padding: '6px 20px' }, `${place.area} · ${region.name}`),
          ),
        ),
      ),
      el('div', { display: 'flex', fontSize: blurb.length > 100 ? '32px' : '36px', lineHeight: '1.35', color: '#475569', fontWeight: 600 }, plain(blurb)),
      el(
        'div',
        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
        el('div', { display: 'flex', fontSize: '22px', color: '#94a3b8', fontWeight: 600 }, `naija.city/p/${cityId === 'kaduna' ? '' : `${cityId}/`}${placeId}`),
        el('div', { display: 'flex', fontSize: '22px', fontWeight: 700, color: '#0f6b3a' }, 'NAIJA CITY'),
      ),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(card as any, { width: 1200, height: 630, fonts: FONTS, emoji: 'twemoji' });
}
