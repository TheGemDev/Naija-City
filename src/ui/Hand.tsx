// Right hand holding the phone (desktop only), low-poly like the rest of the game: every part is a
// faceted surface with a little depth, each facet flat-shaded by one light from the upper left. Drawn in
// a 520×560 box where the phone covers x 90–430 and its bottom edge sits at y 360. The palm and fingers
// are behind the phone, with only the fingertips peeking round the left edge; the thumb grows out of the
// heel of the hand at the bottom right and bends in over the corner of the screen.
//
// The hand and thumb are drawn together behind the phone, so the thumb grows out of the palm with no
// join; the front layer draws the same thumb again, cut to the phone, where it lies over the screen.

type P = [number, number];
type V = [number, number, number];
interface Facet { pts: P[]; fill: string }

/** Skin from shadow to highlight; a facet takes its colour from how squarely it faces the light. */
const SKIN = ['#3d2216', '#5a3321', '#774530', '#93593c', '#ad6f4b', '#c4865d', '#d59c72'];
const NAIL = ['#8f604a', '#ad7c64', '#c99a83', '#dfb9a4', '#efd6c8'];
/** Up and to the left of the screen, and toward you. */
const LIGHT: V = (() => {
  const v: V = [-0.5, -0.62, 0.78];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

function mix(a: string, b: string, k: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
}
function ramp(colours: string[], k: number) {
  const x = Math.max(0, Math.min(0.999, k)) * (colours.length - 1);
  const i = Math.floor(x);
  return mix(colours[i], colours[i + 1], x - i);
}

/** The same little wobble for the same vertex every time, so the facets never shift. */
function wobble(i: number, j: number, salt: number) {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

/**
 * A surface stretched between two edges, `cols` facets across, bulging toward you like a limb: rounder for
 * a bigger `depth` (one for all of it, or row by row). Each quad is cut into two triangles, the cut alternating so the facets interlock.
 */
function surface(left: P[], right: P[], cols: number, depth: number | ((i: number) => number), salt: number, colours = SKIN, tag?: (i: number, j: number) => string[] | null): Facet[] {
  const rows = left.length;
  const grid: V[][] = [];
  for (let i = 0; i < rows; i++) {
    const [lx, ly] = left[i], [rx, ry] = right[i];
    const half = Math.hypot(rx - lx, ry - ly) / 2;
    const bulge = typeof depth === 'number' ? depth : depth(i);
    const row: V[] = [];
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      let x = lx + (rx - lx) * u, y = ly + (ry - ly) * u;
      // Nudge the inner vertices so the facets are uneven, like cut stone rather than graph paper.
      if (j > 0 && j < cols && i > 0 && i < rows - 1) {
        const jit = Math.min(4, half / cols);
        x += wobble(i, j, salt) * jit;
        y += wobble(j, i, salt + 1) * jit;
      }
      row.push([x, y, Math.sin(Math.PI * u) * half * bulge * (1 + wobble(i, j, salt + 2) * 0.12)]);
    }
    grid.push(row);
  }
  const out: Facet[] = [];
  const add = (a: V, b: V, c: V, palette: string[], i: number, j: number) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n);
    if (l < 1e-6) return;
    n = [n[0] / l, n[1] / l, n[2] / l];
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
    const lit = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    out.push({ pts: [[a[0], a[1]], [b[0], b[1]], [c[0], c[1]]], fill: ramp(palette, 0.12 + lit * 0.82 + wobble(i, j, salt + 3) * 0.05) });
  };
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j + 1], d = grid[i + 1][j];
      const palette = tag?.(i, j) ?? colours;
      if ((i + j) % 2) { add(a, b, c, palette, i, j); add(a, c, d, palette, i, j); }
      else { add(a, b, d, palette, i, j); add(b, c, d, palette, i, j); }
    }
  }
  return out;
}

/**
 * A limb along a centre line: its two sides, `rows` steps from root to tip, then a rounded cap over the tip.
 * `at` gives the centre and direction at t (0 root, 1 tip), `half` the half-width there; `inner` narrows the
 * left side alone, as a share of that.
 */
function limb(at: (t: number) => { at: P; dir: P }, half: (t: number) => number, rows: number, cap = 4, inner: (t: number) => number = () => 1): { left: P[]; right: P[] } {
  const left: P[] = [], right: P[] = [];
  let t = 0;
  const side = (c: P, d: P, h: number) => {
    const k = inner(t);
    left.push([c[0] + d[1] * h * (2 * k - 1), c[1] - d[0] * h * (2 * k - 1)]);
    right.push([c[0] - d[1] * h, c[1] + d[0] * h]);
  };
  for (let i = 0; i <= rows; i++) {
    t = i / rows;
    const { at: c, dir } = at(t);
    side(c, dir, half(t));
  }
  t = 1;
  const { at: tip, dir } = at(1);
  const r = half(1);
  for (let k = 1; k <= cap; k++) {
    const a = (k / cap) * (Math.PI / 2);
    side([tip[0] + dir[0] * r * 0.9 * Math.sin(a), tip[1] + dir[1] * r * 0.9 * Math.sin(a)], dir, Math.max(0.5, r * Math.cos(a)));
  }
  return { left, right };
}

// The thumb's centre line, a cubic Bézier from its root down in the heel of the hand to the tip on the
// screen, and its half-width along the way: the broad muscle pad at the base, narrowing to the knuckle,
// a little fuller over the pad. Its outer side is the hand's own outline, so the two are one shape.
const SPINE: [P, P, P, P] = [[526, 620], [528, 440], [474, 318], [398, 248]];
const HALF = [82, 64, 48, 37, 32, 32, 31];

function bez(t: number): { at: P; dir: P } {
  const [a, b, c, d] = SPINE;
  const u = 1 - t;
  const at: P = [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
  const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  const len = Math.hypot(dx, dy);
  return { at, dir: [dx / len, dy / len] };
}

function halfAt(t: number): number {
  const x = t * (HALF.length - 1);
  const i = Math.min(HALF.length - 2, Math.floor(x));
  return HALF[i] + (HALF[i + 1] - HALF[i]) * (x - i);
}

const THUMB_ROWS = 16;
const THUMB_COLS = 7;
// At its root the thumb is only the outside edge of the hand; its inner side sweeps out of the palm along
// the crease at its base.
const THUMB_EDGES = limb(bez, halfAt, THUMB_ROWS, 5, (t) => {
  const k = Math.min(1, t / 0.5);
  return 0.08 + 0.92 * k * k * (3 - 2 * k);
});
/** The nail: the middle of the thumb over its last stretch and up onto the cap. */
const isNail = (i: number, j: number) => i >= THUMB_ROWS - 1 && i <= THUMB_ROWS + 2 && j >= 2 && j <= THUMB_COLS - 3;
// The nail rides on the back of the thumb; its free edge, over the cap, is the palest.
// Flat as the back of the hand where it grows out of it, rounding up into the thumb proper.
const thumbDepth = (i: number) => {
  const k = Math.max(0, Math.min(1, (i / THUMB_ROWS - 0.12) / 0.35));
  return 0.32 + 0.63 * k * k * (3 - 2 * k);
};
const THUMB = surface(THUMB_EDGES.right, THUMB_EDGES.left, THUMB_COLS, thumbDepth, 11, SKIN, (i, j) =>
  isNail(i, j) ? (i >= THUMB_ROWS + 2 ? NAIL.slice(1) : NAIL) : null,
);
const THUMB_OUTLINE: P[] = [...THUMB_EDGES.left, ...[...THUMB_EDGES.right].reverse()];

/** Along a smooth line through the points, `n` evenly spaced. */
function resample(pts: P[], n: number): P[] {
  const dense: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)) as P);
    }
  }
  dense.push(pts[pts.length - 1]);
  const lens = [0];
  for (let i = 1; i < dense.length; i++) lens.push(lens[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = lens[lens.length - 1];
  return Array.from({ length: n }, (_, k) => {
    const want = (total * k) / (n - 1);
    let i = 1;
    while (i < lens.length - 1 && lens[i] < want) i++;
    const f = (want - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return [dense[i - 1][0] + (dense[i][0] - dense[i - 1][0]) * f, dense[i - 1][1] + (dense[i][1] - dense[i - 1][1]) * f];
  });
}

// The back of the hand and the wrist, from behind the phone off the bottom right. The little-finger side
// on the left; on the right, the outside of the thumb.
const PALM_LEFT: P[] = [[170, 200], [150, 320], [180, 400], [244, 456], [322, 500], [380, 580], [430, 680], [446, 740]];
const PALM_RIGHT: P[] = [[420, 200], [470, 290], ...[0.62, 0.5, 0.4, 0.3, 0.2, 0.1].map((t) => THUMB_EDGES.right[Math.round(t * THUMB_ROWS)]), [624, 640], [646, 740]];
const PALM = surface(resample(PALM_LEFT, 13), resample(PALM_RIGHT, 13), 8, 0.32, 3);

// Fingertips curled round the left edge, index at the top. Only the pads past the edge show, each one
// a little different in size and how far it reaches, like real fingers.
const TIPS = [
  { y: 128, h: 56, reach: 30, tilt: -10 },
  { y: 184, h: 60, reach: 38, tilt: -4 },
  { y: 240, h: 56, reach: 34, tilt: 3 },
  { y: 290, h: 46, reach: 22, tilt: 10 },
];
const FINGERS = TIPS.map((f, n) => {
  const a = (f.tilt * Math.PI) / 180;
  const dir: P = [-Math.cos(a), -Math.sin(a)];
  const from: P = [134, f.y];
  const len = 134 - (90 - f.reach) - f.h * 0.45;
  const edges = limb((t) => ({ at: [from[0] + dir[0] * len * t, from[1] + dir[1] * len * t], dir }), (t) => (f.h / 2) * (0.88 + 0.1 * Math.sin(t * Math.PI)), 3, 4);
  return surface(edges.left, edges.right, 5, 0.85, 20 + n);
});

const poly = (pts: P[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const smooth = (pts: P[]) => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`;

function Facets({ list }: { list: Facet[] }) {
  // Each facet is outlined in its own colour, so neighbours meet without hairline gaps.
  return <>{list.map((f, i) => <polygon key={i} points={poly(f.pts)} fill={f.fill} stroke={f.fill} strokeWidth={0.7} strokeLinejoin="round" />)}</>;
}

export function Hand({ part }: { part: 'back' | 'thumb' }) {
  const id = `hand-${part}`;
  const url = (n: string) => `url(#${id}-${n})`;
  return (
    <svg className={`hand hand-${part}`} viewBox="0 0 520 560" aria-hidden>
      <defs>
        <filter id={`${id}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${id}-mid`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <clipPath id={`${id}-palm`}>
          <path d={smooth([...resample(PALM_LEFT, 13), ...resample(PALM_RIGHT, 13).reverse()])} />
        </clipPath>
        {/* the part of the thumb over the phone: the rest is drawn behind, with the hand */}
        <clipPath id={`${id}-screen`}>
          <rect x={0} y={0} width={431} height={361} />
        </clipPath>
      </defs>

      {part === 'back' ? (
        <>
          {FINGERS.map((f, i) => <Facets key={i} list={f} />)}
          {/* the phone's edge shading the fingers where they turn in behind it */}
          <rect x={74} y={90} width={40} height={240} fill="#000" opacity={0.22} filter={url('mid')} />
          <Facets list={PALM} />
          {/* the phone's shadow across the palm */}
          <g clipPath={url('palm')}>
            <rect x={70} y={350} width={380} height={34} fill="#000" opacity={0.32} filter={url('blur')} />
          </g>
          {/* where the thumb's pad lies against the palm, a soft fold */}
          <path d={`M${THUMB_EDGES.left.slice(4, 10).map((p) => `${(p[0] - 3).toFixed(1)},${(p[1] + 2).toFixed(1)}`).join('L')}`} stroke="#000" strokeOpacity={0.28} strokeWidth={9} fill="none" strokeLinecap="round" filter={url('mid')} />
          <Facets list={THUMB} />
        </>
      ) : (
        <g clipPath={url('screen')}>
          {/* its shadow on the glass, then the thumb itself */}
          <path d={smooth(THUMB_OUTLINE)} transform="translate(-6 9)" fill="#000" opacity={0.38} filter={url('mid')} />
          <Facets list={THUMB} />
        </g>
      )}
    </svg>
  );
}
