// Floor and wall finishes drawn in code: one small seamless canvas per finish (game/finishes.ts), made the first
// time any house uses it and shared by every house after that. One material per finish, one per paint colour, so
// a fully done-up house adds a handful of materials, never one per room.

import { CanvasTexture, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { FLOOR_BY_ID, WALL_BY_ID, type FinishDef } from '../game/finishes';
import { paintHex } from '../game/paint';

type G = CanvasRenderingContext2D;
type Rnd = () => number;

/** Pixels per repeat. Small enough for phones; mipmaps keep it clean from afar. */
const SIZE = 256;

function rng(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashId = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

/** Draws something nine times round the tile so whatever crosses an edge comes back on the other side. */
function wrap(S: number, draw: (dx: number, dy: number) => void) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) draw(dx, dy);
}

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function speckle(g: G, S: number, rnd: Rnd, n: number, dark: string, light: string, size = 1.5, alpha = 0.18) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = rnd() * alpha;
    g.fillStyle = rnd() < 0.5 ? dark : light;
    const s = size * (0.5 + rnd());
    g.fillRect(rnd() * S, rnd() * S, s, s);
  }
  g.globalAlpha = 1;
}

function blotches(g: G, S: number, rnd: Rnd, n: number, colours: string[], r: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, rr = r * (0.5 + rnd());
    const c = colours[Math.floor(rnd() * colours.length)];
    wrap(S, (dx, dy) => {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr);
      grad.addColorStop(0, c);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = alpha;
      g.fillStyle = grad;
      g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2);
    });
  }
  g.globalAlpha = 1;
}

/** Marble veins: wandering lines, soft at the edges, wrapped round the tile. */
function veins(g: G, S: number, rnd: Rnd, n: number, colour: string, width: number, alpha: number) {
  g.strokeStyle = colour;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const pts: [number, number][] = [];
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    for (let k = 0; k < 14; k++) {
      pts.push([x, y]);
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * S * 0.06;
      y += Math.sin(a) * S * 0.06;
    }
    const w = width * (0.4 + rnd());
    wrap(S, (dx, dy) => {
      for (const [lw, al] of [[w * 3, alpha * 0.25], [w, alpha]] as const) {
        g.globalAlpha = al;
        g.lineWidth = lw;
        g.beginPath();
        pts.forEach(([px, py], j) => (j ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)));
        g.stroke();
      }
    });
  }
  g.globalAlpha = 1;
}

/** A grid of tiles with grout, each tile a touch different. */
function tiles(g: G, S: number, rnd: Rnd, cols: number, rows: number, colour: (i: number, j: number) => string, grout: string, gw: number, vary = 0.04, offsetRows = false) {
  g.fillStyle = grout;
  g.fillRect(0, 0, S, S);
  const tw = S / cols, th = S / rows;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const off = offsetRows && j % 2 ? tw / 2 : 0;
      const c = colour(i, j);
      const k = (rnd() - 0.5) * vary * 2;
      g.fillStyle = shadeHex(c, k);
      const x = i * tw + off;
      g.fillRect(x + gw / 2, j * th + gw / 2, tw - gw, th - gw);
      if (off && i === cols - 1) g.fillRect(x - S + gw / 2, j * th + gw / 2, tw - gw, th - gw);
    }
}

function planks(g: G, S: number, rnd: Rnd, rows: number, base: string, vertical = false) {
  const th = S / rows;
  g.save();
  if (vertical) {
    g.translate(S, 0);
    g.rotate(Math.PI / 2);
  }
  g.fillStyle = shadeHex(base, -0.55);
  g.fillRect(0, 0, S, S);
  for (let j = 0; j < rows; j++) {
    // Two boards a row, joints staggered from row to row.
    const cut = (0.2 + rnd() * 0.6) * S;
    for (const [x0, len] of [[cut - S, S], [cut, S]] as const) {
      const c = shadeHex(base, (rnd() - 0.5) * 0.22);
      g.fillStyle = c;
      g.fillRect(x0 + 1, j * th + 1, len - 2, th - 2);
      // Grain
      for (let k = 0; k < 7; k++) {
        g.globalAlpha = 0.08 + rnd() * 0.12;
        g.strokeStyle = rnd() < 0.5 ? shadeHex(base, -0.35) : shadeHex(base, 0.2);
        g.lineWidth = 0.6 + rnd();
        const y = j * th + 2 + rnd() * (th - 4);
        g.beginPath();
        g.moveTo(x0, y);
        g.bezierCurveTo(x0 + len * 0.3, y + (rnd() - 0.5) * 4, x0 + len * 0.6, y + (rnd() - 0.5) * 4, x0 + len, y);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }
  g.restore();
}

/** A wax-print (ankara) repeat: big ringed circles on a ground, with leaves and dots between. */
function ankara(g: G, S: number, ground: string, rings: string[], leaf: string, dot: string) {
  g.fillStyle = ground;
  g.fillRect(0, 0, S, S);
  const cells: [number, number][] = [[0, 0], [S / 2, S / 2]];
  for (const [cx, cy] of cells)
    wrap(S, (dx, dy) => {
      rings.forEach((c, i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(cx + dx, cy + dy, S * (0.22 - i * 0.045), 0, Math.PI * 2);
        g.fill();
      });
      g.fillStyle = dot;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.arc(cx + dx + Math.cos(a) * S * 0.13, cy + dy + Math.sin(a) * S * 0.13, S * 0.018, 0, Math.PI * 2);
        g.fill();
      }
    });
  // Leaves in the gaps
  for (const [cx, cy] of [[S / 2, 0], [0, S / 2]] as const)
    wrap(S, (dx, dy) => {
      g.fillStyle = leaf;
      for (let k = 0; k < 4; k++) {
        g.save();
        g.translate(cx + dx, cy + dy);
        g.rotate((k / 4) * Math.PI * 2 + Math.PI / 4);
        g.beginPath();
        g.ellipse(S * 0.09, 0, S * 0.08, S * 0.03, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.fillStyle = dot;
      g.beginPath();
      g.arc(cx + dx, cy + dy, S * 0.025, 0, Math.PI * 2);
      g.fill();
    });
}

/** Damask: a mirrored flourish in an ogee lattice. */
function damask(g: G, S: number, ground: string, ink: string) {
  g.fillStyle = ground;
  g.fillRect(0, 0, S, S);
  g.fillStyle = ink;
  g.strokeStyle = ink;
  const motif = (cx: number, cy: number, s: number) => {
    for (const m of [1, -1]) {
      g.save();
      g.translate(cx, cy);
      g.scale(m, 1);
      g.beginPath();
      g.moveTo(0, -s);
      g.bezierCurveTo(s * 0.5, -s * 0.7, s * 0.55, -s * 0.15, s * 0.15, 0);
      g.bezierCurveTo(s * 0.6, s * 0.15, s * 0.45, s * 0.7, 0, s);
      g.lineTo(0, -s);
      g.fill();
      g.beginPath();
      g.ellipse(s * 0.55, -s * 0.45, s * 0.12, s * 0.28, -0.5, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(s * 0.55, s * 0.45, s * 0.12, s * 0.28, 0.5, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = s * 0.05;
      g.beginPath();
      g.arc(s * 0.85, 0, s * 0.18, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.restore();
    }
  };
  for (const [cx, cy, s] of [[S / 2, S / 2, S * 0.3], [0, 0, S * 0.18], [S, 0, S * 0.18], [0, S, S * 0.18], [S, S, S * 0.18]] as const) motif(cx, cy, s);
  g.globalAlpha = 0.5;
  g.lineWidth = 1.5;
  for (const [cx, cy] of [[0, S / 2], [S, S / 2], [S / 2, 0], [S / 2, S]] as const) {
    g.beginPath();
    g.arc(cx, cy, S * 0.06, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

const PAINTERS: Record<string, (g: G, S: number, rnd: Rnd, def: FinishDef) => void> = {
  // ── Floors ──
  screed(g, S, rnd) {
    g.fillStyle = '#9a948a';
    g.fillRect(0, 0, S, S);
    blotches(g, S, rnd, 14, ['#867f74', '#aaa499', '#8f887c'], S * 0.25, 0.35);
    // Trowel sweeps
    g.strokeStyle = '#b3ada2';
    for (let i = 0; i < 10; i++) {
      const x = rnd() * S, y = rnd() * S, r = S * (0.12 + rnd() * 0.2), a = rnd() * Math.PI * 2;
      wrap(S, (dx, dy) => {
        g.globalAlpha = 0.12;
        g.lineWidth = 2 + rnd() * 3;
        g.beginPath();
        g.arc(x + dx, y + dy, r, a, a + 1.2);
        g.stroke();
      });
    }
    speckle(g, S, rnd, 2600, '#5e584f', '#c9c3b8', 1.4, 0.35);
  },
  rubber(g, S, rnd) {
    // The printed PVC "rubber carpet" every Nigerian parlour has had: a maroon ground, a cream lattice, flowers.
    g.fillStyle = '#8a3b2f';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#e8cf9a';
    g.lineWidth = S * 0.018;
    g.beginPath();
    g.moveTo(0, S / 2); g.lineTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.closePath();
    g.stroke();
    g.strokeStyle = '#5f2219';
    g.lineWidth = S * 0.008;
    g.strokeRect(S * 0.02, S * 0.02, S * 0.96, S * 0.96);
    const flower = (cx: number, cy: number, s: number) => {
      g.fillStyle = '#d99a3e';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55, s * 0.45, s * 0.22, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#2f5d4a';
      g.beginPath(); g.arc(cx, cy, s * 0.32, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2e3c0';
      g.beginPath(); g.arc(cx, cy, s * 0.14, 0, Math.PI * 2); g.fill();
    };
    flower(S / 2, S / 2, S * 0.16);
    for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) flower(x, y, S * 0.12);
    speckle(g, S, rnd, 900, '#3b120c', '#d9a66a', 1.2, 0.18);
  },
  tile_white(g, S, rnd, d) { tiles(g, S, rnd, 2, 2, () => d.base, '#c9c5bc', 2.5, 0.025); veins(g, S, rnd, 3, '#cfcac0', 1, 0.25); },
  tile_cream(g, S, rnd, d) { tiles(g, S, rnd, 2, 2, () => d.base, '#b7a684', 2.5, 0.035); veins(g, S, rnd, 4, '#c9b48a', 1, 0.25); },
  tile_grey(g, S, rnd, d) { tiles(g, S, rnd, 2, 2, () => d.base, '#7f807d', 2, 0.03); speckle(g, S, rnd, 1600, '#6e6f6c', '#c4c5c2', 1.2, 0.25); },
  tile_check(g, S, rnd) { tiles(g, S, rnd, 4, 4, (i, j) => ((i + j) % 2 ? '#1e1f22' : '#f1efe9'), '#9a9790', 1.5, 0.03); },
  tile_terracotta(g, S, rnd) {
    tiles(g, S, rnd, 4, 4, () => '#b8613a', '#d9c3a3', 3, 0.12);
    speckle(g, S, rnd, 1400, '#7a3519', '#e09a6b', 1.4, 0.25);
  },
  tile_mosaic(g, S, rnd) {
    const blues = ['#3d7fb5', '#5b9ac4', '#7cb6d8', '#2f6c9e', '#a9d2e6'];
    tiles(g, S, rnd, 10, 10, () => blues[Math.floor(rnd() * blues.length)], '#eef3f5', 2, 0.06);
  },
  terrazzo(g, S, rnd) {
    g.fillStyle = '#d8d2c6';
    g.fillRect(0, 0, S, S);
    const chips = ['#4a4a4a', '#8c8c8c', '#b5623e', '#f4f1ea', '#6b7f73', '#a89c86', '#2e2e30'];
    for (let i = 0; i < 520; i++) {
      const x = rnd() * S, y = rnd() * S, r = S * (0.004 + rnd() * rnd() * 0.022), c = chips[Math.floor(rnd() * chips.length)];
      const sides = 4 + Math.floor(rnd() * 3), a0 = rnd() * 6;
      wrap(S, (dx, dy) => {
        g.fillStyle = c;
        g.beginPath();
        for (let k = 0; k < sides; k++) {
          const a = a0 + (k / sides) * Math.PI * 2, rr = r * (0.6 + ((k * 7) % 5) * 0.12);
          const px = x + dx + Math.cos(a) * rr, py = y + dy + Math.sin(a) * rr;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.fill();
      });
    }
  },
  concrete(g, S, rnd) {
    g.fillStyle = '#8f9294';
    g.fillRect(0, 0, S, S);
    blotches(g, S, rnd, 22, ['#7d8082', '#a3a6a7', '#888b8c', '#6f7274'], S * 0.18, 0.4);
    speckle(g, S, rnd, 1800, '#5d6062', '#bcbfc0', 1.2, 0.2);
    // Saw-cut joints every 1.5 m
    g.fillStyle = 'rgba(60,62,64,0.55)';
    g.fillRect(0, 0, S, 1.5);
    g.fillRect(0, S / 2, S, 1.5);
    g.fillRect(0, 0, 1.5, S);
    g.fillRect(S / 2, 0, 1.5, S);
  },
  marble_white(g, S, rnd) {
    g.fillStyle = '#eeece8';
    g.fillRect(0, 0, S, S);
    blotches(g, S, rnd, 10, ['#e2dfd9', '#f7f6f3'], S * 0.3, 0.6);
    veins(g, S, rnd, 7, '#9e9a94', 1.4, 0.45);
    veins(g, S, rnd, 10, '#c4c0b9', 0.8, 0.35);
    g.fillStyle = 'rgba(150,146,140,0.6)';
    g.fillRect(0, 0, S, 1);
    g.fillRect(0, 0, 1, S);
  },
  marble_black(g, S, rnd) {
    g.fillStyle = '#1f1d1c';
    g.fillRect(0, 0, S, S);
    blotches(g, S, rnd, 10, ['#2c2926', '#141312'], S * 0.3, 0.6);
    veins(g, S, rnd, 6, '#d4af37', 1.3, 0.7);
    veins(g, S, rnd, 9, '#e8e4dc', 0.7, 0.4);
    g.fillStyle = 'rgba(212,175,55,0.5)';
    g.fillRect(0, 0, S, 1);
    g.fillRect(0, 0, 1, S);
  },
  wood_oak(g, S, rnd, d) { planks(g, S, rnd, 8, d.base); },
  wood_walnut(g, S, rnd, d) { planks(g, S, rnd, 8, d.base); },
  wood_parquet(g, S, rnd, d) {
    // Basket weave: 20 cm squares of four slats, turned each way in turn.
    g.fillStyle = shadeHex(d.base, -0.5);
    g.fillRect(0, 0, S, S);
    const n = 4, b = S / n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 4; k++) {
          g.fillStyle = shadeHex(d.base, (rnd() - 0.5) * 0.3);
          if ((i + j) % 2) g.fillRect(i * b + k * (b / 4) + 0.7, j * b + 0.7, b / 4 - 1.4, b - 1.4);
          else g.fillRect(i * b + 0.7, j * b + k * (b / 4) + 0.7, b - 1.4, b / 4 - 1.4);
        }
    speckle(g, S, rnd, 900, '#3b2414', '#c9925c', 1, 0.15);
  },
  carpet_grey(g, S, rnd, d) { g.fillStyle = d.base; g.fillRect(0, 0, S, S); speckle(g, S, rnd, 9000, shadeHex(d.base, -0.35), shadeHex(d.base, 0.25), 1.3, 0.35); },
  carpet_wine(g, S, rnd, d) { g.fillStyle = d.base; g.fillRect(0, 0, S, S); speckle(g, S, rnd, 9000, shadeHex(d.base, -0.4), shadeHex(d.base, 0.25), 1.3, 0.35); },
  carpet_blue(g, S, rnd, d) { g.fillStyle = d.base; g.fillRect(0, 0, S, S); speckle(g, S, rnd, 9000, shadeHex(d.base, -0.4), shadeHex(d.base, 0.25), 1.3, 0.35); },

  // ── Walls ──
  wp_ankara(g, S) { ankara(g, S, '#d9792b', ['#2b3f7a', '#f2e3c0', '#7a2e1d', '#f0b23a'], '#2f5d4a', '#f2e3c0'); },
  wp_ankara_teal(g, S) { ankara(g, S, '#1f7a7a', ['#f0b23a', '#f7efe0', '#c4452c', '#1f2e4a'], '#e8735a', '#f7efe0'); },
  wp_adire(g, S, rnd) {
    g.fillStyle = '#283a7a';
    g.fillRect(0, 0, S, S);
    blotches(g, S, rnd, 10, ['#1d2c63', '#33488f'], S * 0.25, 0.5);
    g.strokeStyle = '#c9d3ee';
    g.fillStyle = '#c9d3ee';
    const q = S / 2;
    for (const [ox, oy] of [[0, 0], [q, 0], [0, q], [q, q]]) {
      const kind = (ox + oy) / q;
      g.globalAlpha = 0.85;
      g.lineWidth = 2;
      g.strokeRect(ox + 4, oy + 4, q - 8, q - 8);
      if (kind % 2 === 0) {
        for (let r = q * 0.12; r < q * 0.42; r += q * 0.09) {
          g.beginPath(); g.arc(ox + q / 2, oy + q / 2, r, 0, Math.PI * 2); g.stroke();
        }
      } else {
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) {
            g.beginPath(); g.arc(ox + q * (0.2 + i * 0.2), oy + q * (0.2 + j * 0.2), q * 0.035, 0, Math.PI * 2); g.fill();
          }
      }
    }
    g.globalAlpha = 1;
  },
  wp_damask(g, S) { damask(g, S, '#e6d6b0', '#c4a35a'); },
  wp_damask_navy(g, S) { damask(g, S, '#2c3a5c', '#b9a36a'); },
  wp_stripes(g, S) {
    const bands: [string, number][] = [['#a9c2a6', 0.3], ['#efe8d6', 0.14], ['#c4a35a', 0.02], ['#efe8d6', 0.14], ['#a9c2a6', 0.4]];
    let x = 0;
    for (const [c, w] of bands) {
      g.fillStyle = c;
      g.fillRect(x, 0, w * S + 1, S);
      x += w * S;
    }
  },
  wp_geo(g, S) {
    // Mud-cloth style: rows of triangles and zigzags in black and rust on cream.
    g.fillStyle = '#e9e2d4';
    g.fillRect(0, 0, S, S);
    const row = S / 4;
    for (let j = 0; j < 4; j++) {
      const y = j * row;
      g.fillStyle = j % 2 ? '#b5623e' : '#2b2622';
      g.strokeStyle = g.fillStyle;
      if (j % 2 === 0) {
        for (let i = 0; i < 8; i++) {
          g.beginPath();
          g.moveTo(i * (S / 8), y + row * 0.8);
          g.lineTo(i * (S / 8) + S / 16, y + row * 0.2);
          g.lineTo((i + 1) * (S / 8), y + row * 0.8);
          g.fill();
        }
      } else {
        g.lineWidth = 3;
        g.beginPath();
        for (let i = 0; i <= 16; i++) g.lineTo(i * (S / 16), y + (i % 2 ? row * 0.25 : row * 0.75));
        g.stroke();
      }
      g.fillStyle = '#2b2622';
      g.fillRect(0, y, S, 1.5);
    }
  },
  wt_white(g, S, rnd) { tiles(g, S, rnd, 3, 6, () => '#f1f2f0', '#b9bcbc', 2, 0.03, true); },
  wt_green(g, S, rnd) { tiles(g, S, rnd, 6, 6, () => '#4f8a6a', '#dcdcd2', 2, 0.16); },
  wt_marble(g, S, rnd) {
    g.fillStyle = '#ece9e3';
    g.fillRect(0, 0, S, S);
    veins(g, S, rnd, 8, '#a8a39b', 1.2, 0.45);
    g.fillStyle = 'rgba(160,155,148,0.7)';
    g.fillRect(0, 0, S, 1.5);
    g.fillRect(0, 0, 1.5, S);
    g.fillRect(S / 2, 0, 1.5, S);
  },
  wood_panel(g, S, rnd, d) {
    planks(g, S, rnd, 5, d.base, true);
    g.fillStyle = 'rgba(30,18,10,0.45)';
    for (let i = 0; i < 5; i++) g.fillRect(i * (S / 5), 0, 2.5, S);
    // A dado rail
    g.fillStyle = shadeHex(d.base, -0.3);
    g.fillRect(0, S * 0.08, S, 4);
  },
  wood_slat(g, S, rnd, d) {
    g.fillStyle = '#1a120c';
    g.fillRect(0, 0, S, S);
    const n = 12, w = S / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shadeHex(d.base, (rnd() - 0.5) * 0.25);
      g.fillRect(i * w + w * 0.18, 0, w * 0.64, S);
    }
    speckle(g, S, rnd, 600, '#2a1a10', '#8a6040', 1, 0.15);
  },
  brick(g, S, rnd) {
    g.fillStyle = '#cfc6b8';
    g.fillRect(0, 0, S, S);
    const rows = 12, cols = 4, bh = S / rows, bw = S / cols;
    const reds = ['#a2482f', '#93402a', '#b05535', '#8a3a26', '#9c4a34'];
    for (let j = 0; j < rows; j++)
      for (let i = -1; i < cols; i++) {
        const x = i * bw + (j % 2 ? bw / 2 : 0);
        g.fillStyle = reds[Math.floor(rnd() * reds.length)];
        g.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
      }
    speckle(g, S, rnd, 2200, '#5a2416', '#d98a6a', 1.3, 0.25);
  },
  stone(g, S, rnd) {
    g.fillStyle = '#3b3631';
    g.fillRect(0, 0, S, S);
    const greys = ['#9a8f80', '#857a6c', '#b0a594', '#766c60', '#a39785', '#8c8378'];
    const rows = 10, h = S / rows;
    for (let j = 0; j < rows; j++) {
      let x = -rnd() * S * 0.3;
      while (x < S) {
        const w = S * (0.12 + rnd() * 0.3);
        const c = greys[Math.floor(rnd() * greys.length)];
        const hh = h * (0.7 + rnd() * 0.25);
        for (const dx of [0, -S, S]) {
          g.fillStyle = c;
          g.fillRect(x + 1.5 + dx, j * h + (h - hh) / 2, w - 3, hh);
        }
        x += w;
      }
    }
    speckle(g, S, rnd, 1500, '#4a433c', '#cfc5b5', 1.4, 0.25);
  },
};

const canvases = new Map<string, HTMLCanvasElement>();
function canvasOf(id: string, def: FinishDef): HTMLCanvasElement {
  let c = canvases.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  (PAINTERS[id] ?? ((gg: G) => { gg.fillStyle = def.base; gg.fillRect(0, 0, SIZE, SIZE); }))(g, SIZE, rng(hashId(id)), def);
  canvases.set(id, c);
  return c;
}

const defOf = (id: string) => FLOOR_BY_ID[id] ?? WALL_BY_ID[id];

const materials = new Map<string, MeshStandardMaterial>();

/**
 * The shared material for a floor or wall finish id, or a paint colour ref. UVs are in metres, so the map's repeat
 * is 1 / the finish's scale. Never disposed: there are only ever a few dozen and every house shares them.
 */
export function finishMaterial(value: string): MeshStandardMaterial | null {
  const hit = materials.get(value);
  if (hit) return hit;
  const def = defOf(value);
  let m: MeshStandardMaterial;
  if (def) {
    const tex = new CanvasTexture(canvasOf(value, def));
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(1 / def.scale, 1 / def.scale);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    m = new MeshStandardMaterial({ map: tex, roughness: def.roughness, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  } else {
    const hex = paintHex(value);
    if (!hex) return null;
    m = new MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  m.name = `finish:${value}`;
  materials.set(value, m);
  return m;
}

const swatches = new Map<string, string>();
/** A small picture of a finish for the UI (a data URL), drawn from the same canvas the 3D uses. */
export function finishSwatch(id: string, px = 72): string {
  const k = `${id}@${px}`;
  const hit = swatches.get(k);
  if (hit) return hit;
  const def = defOf(id);
  if (!def) return '';
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  // Show about a metre of it, so tiles read as tiles.
  const src = canvasOf(id, def);
  const reps = Math.max(1, Math.round(1 / def.scale));
  const step = px / reps;
  for (let i = 0; i < reps; i++) for (let j = 0; j < reps; j++) g.drawImage(src, i * step, j * step, step, step);
  const url = c.toDataURL();
  swatches.set(k, url);
  return url;
}
