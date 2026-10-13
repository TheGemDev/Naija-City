// The picture the police post on Twitter when a thief is caught: the player in orange overalls against the height
// chart, holding a booking board. Drawn from their look, so nothing is stored. The same post always draws the same
// picture, but the wall, the chart, the board and the stamp change from one post to the next.

import { avatarSvg } from './face';

/** A small repeatable random source, so a post looks the same every time it is drawn and on every phone. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALLS = [
  { wall: '#e7e5e4', line: '#57534e' },
  { wall: '#d6d3d1', line: '#44403c' },
  { wall: '#cbd5e1', line: '#334155' },
  { wall: '#e2e8f0', line: '#475569' },
  { wall: '#d9e2d0', line: '#3f4d36' },
  { wall: '#e8dcc4', line: '#5b4a2e' },
];
const BOARDS = [
  { bg: '#111827', ink: '#f9fafb', edge: '#374151' },
  { bg: '#f8fafc', ink: '#0f172a', edge: '#94a3b8' },
  { bg: '#1e3a8a', ink: '#eff6ff', edge: '#1e40af' },
];
const STAMPS = ['ARRESTED', 'CAUGHT', 'BUSTED', 'IN CUSTODY'];
const STATIONS = ['NIGERIA POLICE', 'STATE CID', 'FORCE CID', 'ANTI-ROBBERY SQUAD', 'CENTRAL DIV.'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Where the top of a bare head sits in avatarSvg's own 400-wide drawing. */
const HEAD_TOP = 81;

export interface MugshotOf {
  look: string | null | undefined;
  /** Who it is: decides their height, which stays the same in every picture of them. */
  uid: string | null;
  username: string | null;
  /** The post, which decides everything else about the picture. */
  seed: number | string;
  at: number;
}

/**
 * The words on the picture, for a renderer that cannot draw an SVG's own text (the link-preview card, worker/og.ts):
 * where the booking board and the stamp sit in the 400-wide drawing, and how far each is turned about its centre.
 */
export interface MugshotLabels {
  board: { x: number; y: number; w: number; h: number; rot: number; ink: string; station: string; name: string; nameSize: number; booking: string };
  stamp: { x: number; y: number; w: number; h: number; rot: number; word: string; size: number } | null;
}

export const mugshotSvg = (of: MugshotOf): string => mugshotParts(of).svg;

export function mugshotParts({ look, uid, username, seed, at }: MugshotOf): { svg: string; labels: MugshotLabels } {
  const who = seeded(`height:${uid ?? username ?? 'someone'}`);
  const r = seeded(`mug:${seed}`);
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const pickOf = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

  const inches = 61 + Math.floor(who() * 16); // 5'1" to 6'4"
  const { wall, line } = pickOf(WALLS);
  const board = pickOf(BOARDS);
  const metric = r() < 0.4;
  const labelsRight = r() < 0.5;
  const scale = between(0.8, 0.9);
  const size = 400 * scale;
  const ox = (400 - size) / 2 + between(-12, 12);
  const oy = 400 - size + between(0, 10);
  const headY = oy + HEAD_TOP * scale;
  /** Pixels per inch on the wall: the chart is ruled so the top of the head lands on the player's height. */
  const k = between(6.4, 8.2);

  let out = `<rect width="400" height="400" fill="${wall}"/>`;
  // The camera flash: brighter in the middle of the wall, falling off to the corners.
  out += `<defs><radialGradient id="f" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></radialGradient></defs>`;

  // The height chart. Feet and inches is ruled every 2 inches, centimetres every 5.
  const step = metric ? 5 : 2;
  const perUnit = metric ? k / 2.54 : k;
  const mine = metric ? inches * 2.54 : inches;
  const first = Math.ceil((mine - (400 - headY) / perUnit) / step) * step;
  const tx = labelsRight ? 392 : 8;
  for (let v = first; ; v += step) {
    const y = headY + (mine - v) * perUnit;
    if (y < 6) break;
    const major = metric ? v % 10 === 0 : v % 12 === 0;
    out += `<line x1="0" y1="${y.toFixed(1)}" x2="400" y2="${y.toFixed(1)}" stroke="${line}" stroke-width="${major ? 2.4 : 1}" opacity="${major ? 0.75 : 0.4}"/>`;
    if (major || (!metric && v % 4 === 0)) {
      const label = metric ? `${v}` : `${Math.floor(v / 12)}'${v % 12}"`;
      out += `<text x="${tx}" y="${(y - 4).toFixed(1)}" text-anchor="${labelsRight ? 'end' : 'start'}" font-family="monospace" font-weight="700" font-size="${major ? 17 : 13}" fill="${line}" opacity="0.9">${esc(label)}</text>`;
    }
  }
  out += '<rect width="400" height="400" fill="url(#f)"/>';

  // The suspect, in orange.
  out += `<g transform="translate(${ox.toFixed(1)},${oy.toFixed(1)}) scale(${scale.toFixed(3)})">${avatarSvg(look, 'none', true)}</g>`;

  // The booking board, hung from the neck on a string and never quite straight.
  const bw = between(176, 204);
  const bh = 78;
  const bx = ox + size / 2 + between(-8, 8);
  const by = between(300, 312);
  const tilt = between(-5, 5);
  const neckY = oy + 262 * scale;
  out += `<path d="M${(bx - 24 * scale).toFixed(1)},${neckY.toFixed(1)} L${(bx - bw / 2 + 12).toFixed(1)},${by.toFixed(1)} M${(bx + 24 * scale).toFixed(1)},${neckY.toFixed(1)} L${(bx + bw / 2 - 12).toFixed(1)},${by.toFixed(1)}" stroke="#1f2937" stroke-width="2" fill="none" opacity="0.7"/>`;
  const name = `@${username ?? 'unknown'}`;
  const nameSize = Math.min(24, (bw - 20) / (name.length * 0.62));
  const d = new Date(at);
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  const booking = `KD-${String(Math.floor(r() * 900000) + 100000)}`;
  const station = pickOf(STATIONS);
  out += `<g transform="rotate(${tilt.toFixed(1)} ${bx.toFixed(1)} ${(by + bh / 2).toFixed(1)})" font-family="monospace" font-weight="700" text-anchor="middle" fill="${board.ink}">`;
  out += `<rect x="${(bx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh}" rx="5" fill="${board.bg}" stroke="${board.edge}" stroke-width="3"/>`;
  out += `<text x="${bx.toFixed(1)}" y="${(by + 19).toFixed(1)}" font-size="12" letter-spacing="1.5">${esc(station)}</text>`;
  out += `<line x1="${(bx - bw / 2 + 12).toFixed(1)}" y1="${(by + 26).toFixed(1)}" x2="${(bx + bw / 2 - 12).toFixed(1)}" y2="${(by + 26).toFixed(1)}" stroke="${board.ink}" stroke-width="1" opacity="0.5"/>`;
  out += `<text x="${bx.toFixed(1)}" y="${(by + 50).toFixed(1)}" font-size="${nameSize.toFixed(1)}">${esc(name)}</text>`;
  out += `<text x="${bx.toFixed(1)}" y="${(by + 68).toFixed(1)}" font-size="11" opacity="0.85">${booking} · ${date}</text>`;
  out += '</g>';

  const labels: MugshotLabels = {
    board: { x: bx - bw / 2, y: by, w: bw, h: bh, rot: tilt, ink: board.ink, station, name, nameSize, booking: `${booking} · ${date}` },
    stamp: null,
  };
  // Most pictures get a rubber stamp, on whichever side the chart's numbers are not.
  if (r() < 0.75) {
    const sx = labelsRight ? between(74, 96) : between(304, 326);
    const sy = between(40, 70);
    const word = pickOf(STAMPS);
    const turn = between(-16, 16);
    labels.stamp = { x: sx - 62, y: sy - 17, w: 124, h: 32, rot: turn, word, size: word.length > 8 ? 15 : 19 };
    out += `<g transform="rotate(${turn.toFixed(1)} ${sx.toFixed(1)} ${sy.toFixed(1)})" opacity="0.82"><rect x="${(sx - 62).toFixed(1)}" y="${(sy - 17).toFixed(1)}" width="124" height="32" rx="4" fill="none" stroke="#b91c1c" stroke-width="3"/><text x="${sx.toFixed(1)}" y="${(sy + 6).toFixed(1)}" text-anchor="middle" font-family="monospace" font-weight="700" font-size="${word.length > 8 ? 15 : 19}" fill="#b91c1c">${word}</text></g>`;
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">${out}</svg>`, labels };
}
