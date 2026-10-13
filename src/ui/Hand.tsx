// Low-poly hand holding the phone (desktop only). Drawn in a 520×560 box where the phone
// covers x 90–430 and its bottom edge sits at y 360. Fingers wrap the left edge from behind;
// the thumb rests on the right edge in front.

type P = [number, number];
interface Tri { pts: P[]; fill: string }

const LIGHT: P = [-0.6, -0.8]; // from top-left
const SKIN = { h: 24, s: 44, l: 36 };

// Deterministic jitter so facets don't flicker between renders.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;

const shade = (dot: number, base = SKIN.l) =>
  `hsl(${SKIN.h} ${SKIN.s}% ${(base + dot * 9 + rand() * 4).toFixed(1)}%)`;

const centroid = (pts: P[]): P => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

function facing(c: P, from: P) {
  const dx = c[0] - from[0];
  const dy = c[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  return (dx * LIGHT[0] + dy * LIGHT[1]) / len;
}

/** A tube along a centerline: each segment split into 4 facets around a ridge line. */
function strip(line: P[], widths: number[], base?: number): Tri[] {
  const out: Tri[] = [];
  const rings = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = widths[i] / 2;
    return { l: [p[0] + nx * w, p[1] + ny * w] as P, c: p, r: [p[0] - nx * w, p[1] - ny * w] as P };
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    const mid = centroid([A.c, B.c]);
    for (const pts of [
      [A.l, A.c, B.l],
      [A.c, B.c, B.l],
      [A.c, A.r, B.c],
      [A.r, B.r, B.c],
    ] as P[][]) {
      out.push({ pts, fill: shade(facing(centroid(pts), mid), base) });
    }
  }
  return out;
}

/** A flat-ish blob: triangle fan from an off-centre peak. */
function fan(ring: P[], peak: P, base?: number): Tri[] {
  return ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const pts: P[] = [peak, p, q];
    return { pts, fill: shade(facing(centroid([p, q]), peak), base) };
  });
}

const NAIL = 'hsl(18 30% 72%)';

function build() {
  seed = 7;
  const back: Tri[] = [
    // forearm, running off the bottom-right
    ...strip([[400, 430], [450, 520], [500, 640]], [150, 160, 170], 32),
    // palm behind the phone
    ...fan(
      [[170, 110], [300, 92], [420, 140], [472, 255], [474, 380], [425, 468], [305, 498], [195, 440], [150, 330], [158, 200]],
      [330, 330],
    ),
  ];
  // index → pinky, wrapping the left edge
  const fingers: { y: number; w: number; tip: number }[] = [
    { y: 122, w: 34, tip: 36 },
    { y: 180, w: 36, tip: 30 },
    { y: 236, w: 34, tip: 36 },
    { y: 288, w: 29, tip: 50 },
  ];
  const nails: P[][] = [];
  for (const f of fingers) {
    const line: P[] = [[210, f.y], [110, f.y + 4], [f.tip + 26, f.y + 10], [f.tip, f.y + 26]];
    back.push(...strip(line, [f.w, f.w - 1, f.w - 4, f.w - 14]));
    nails.push([[f.tip + 20, f.y + 4], [f.tip + 6, f.y + 14], [f.tip + 3, f.y + 23], [f.tip + 15, f.y + 15]]);
  }
  const thumb: Tri[] = [
    ...fan([[444, 300], [494, 326], [502, 400], [456, 424], [432, 372]], [470, 362], 40),
    ...strip([[476, 350], [452, 286], [426, 236], [402, 200]], [56, 46, 37, 26], 44),
  ];
  const thumbNail: P[] = [[394, 208], [397, 192], [410, 190], [412, 208]];
  return { back, nails, thumb, thumbNail };
}

const HAND = build();
const poly = (pts: P[]) => pts.map((p) => p.join(',')).join(' ');

export function Hand({ part }: { part: 'back' | 'thumb' }) {
  const tris = part === 'back' ? HAND.back : HAND.thumb;
  return (
    <svg className={`hand hand-${part}`} viewBox="0 0 520 560" aria-hidden>
      {tris.map((t, i) => (
        <polygon key={i} points={poly(t.pts)} fill={t.fill} stroke={t.fill} strokeWidth={0.6} strokeLinejoin="round" />
      ))}
      {part === 'back'
        ? HAND.nails.map((n, i) => <polygon key={`n${i}`} points={poly(n)} fill={NAIL} />)
        : <polygon points={poly(HAND.thumbNail)} fill={NAIL} />}
    </svg>
  );
}
