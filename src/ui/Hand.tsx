// Right hand holding the phone (desktop only), drawn as a soft-shaded illustration. Drawn in a
// 520×560 box where the phone covers x 90–430 and its bottom edge sits at y 360. The palm and
// fingers are behind the phone, with only the fingertips peeking round the left edge; the thumb
// rises from the heel of the hand at the bottom right and bends in over the corner of the screen.

type P = [number, number];

const SKIN = { hi: '#d39a70', light: '#b47a52', base: '#955e3d', dark: '#6e4229', deep: '#47281a' };
const NAIL = { base: '#d9a88c', tip: '#f1d9c8', edge: '#a87459', bed: '#c48f72' };

/** Closed smooth outline through the points (Catmull-Rom turned into Béziers). */
function blob(pts: P[]): string {
  const n = pts.length;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/** Open smooth line through the points. */
function line(pts: P[]): string {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// The thumb's centre line, a cubic Bézier from its root by the wrist to the tip on the screen, and its
// half-width along the way: thick at the base, narrowing at the knuckle, a little fuller over the pad.
const SPINE: [P, P, P, P] = [[488, 560], [506, 440], [472, 320], [398, 248]];
const HALF = [62, 52, 42, 35, 31, 32, 31];

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

/** A point `side` half-widths off the centre line at `t` (negative: the side facing the screen). */
function across(t: number, side: number): P {
  const { at, dir } = bez(t);
  const h = halfAt(t) * side;
  return [at[0] - dir[1] * h, at[1] + dir[0] * h];
}

/** The thumb's outline: down one side, round the tip, back up the other. */
function thumbOutline(): P[] {
  const ts = Array.from({ length: 9 }, (_, i) => i / 8);
  const left = ts.map((t) => across(t, -1));
  const right = ts.map((t) => across(t, 1)).reverse();
  const { at, dir } = bez(1);
  const r = halfAt(1);
  // The tip: a rounded cap a little flatter than a half circle, like a real thumb pad.
  const cap: P[] = [-0.6, -0.2, 0.2, 0.6].map((k) => {
    const a = (k * Math.PI) / 2;
    const fwd = Math.cos(a) * r * 0.9, side = Math.sin(a) * r;
    return [at[0] + dir[0] * fwd - dir[1] * side, at[1] + dir[1] * fwd + dir[0] * side];
  });
  return [...left, ...cap, ...right];
}

/** A line along the thumb, `side` half-widths off its centre, from `t0` to `t1`. */
function along(side: number, t0: number, t1: number): P[] {
  return Array.from({ length: 7 }, (_, i) => across(t0 + ((t1 - t0) * i) / 6, side));
}

/** A crease across the thumb at `t`, bowed toward the tip, from `from` to `to` half-widths. */
function crease(t: number, from: number, to: number, bow: number): string {
  const a = across(t, from), b = across(t, to);
  const { dir } = bez(t);
  const m: P = [(a[0] + b[0]) / 2 + dir[0] * bow, (a[1] + b[1]) / 2 + dir[1] * bow];
  return `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${m[0].toFixed(1)},${m[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
}

const THUMB = thumbOutline();
const TIP = bez(1);
const NAIL_AT = bez(0.95);
const NAIL_ANGLE = (Math.atan2(TIP.dir[1], TIP.dir[0]) * 180) / Math.PI + 90;

// The hand from the heel of the palm down through the wrist into the forearm, off the bottom-right.
// Its top is hidden behind the phone.
const HAND: P[] = [
  [150, 250], [300, 215], [430, 240], [480, 330], [512, 410], [556, 470], [600, 560], [624, 640],
  [430, 680], [380, 580], [322, 500], [244, 456], [180, 400], [150, 320],
];

// Fingertips curled round the left edge, index at the top. Only the pads past the edge show, each one
// a little different in size and how far it reaches, like real fingers.
const TIPS = [
  { y: 128, h: 56, reach: 30, tilt: -10 },
  { y: 184, h: 60, reach: 38, tilt: -4 },
  { y: 240, h: 56, reach: 34, tilt: 3 },
  { y: 290, h: 46, reach: 22, tilt: 10 },
];

/** A fingertip seen from the front as it wraps round the edge: fuller at the pad, narrowing toward the phone. */
function fingertip(f: (typeof TIPS)[number]): P[] {
  const x0 = 90 - f.reach, h = f.h / 2;
  return [
    [x0 + h * 0.15, f.y - h * 0.55], [x0 + h * 0.75, f.y - h * 0.98], [x0 + h * 1.6, f.y - h * 0.94], [130, f.y - h * 0.86],
    [130, f.y + h * 0.86], [x0 + h * 1.6, f.y + h * 0.96], [x0 + h * 0.7, f.y + h * 0.95], [x0 + h * 0.1, f.y + h * 0.5], [x0, f.y],
  ];
}

export function Hand({ part }: { part: 'back' | 'thumb' }) {
  const id = `hand-${part}`;
  const url = (n: string) => `url(#${id}-${n})`;
  return (
    <svg className={`hand hand-${part}`} viewBox="0 0 520 560" aria-hidden>
      <defs>
        <linearGradient id={`${id}-arm`} x1="0.1" y1="0.2" x2="0.9" y2="0.6">
          <stop offset="0" stopColor={SKIN.light} />
          <stop offset="0.45" stopColor={SKIN.base} />
          <stop offset="1" stopColor={SKIN.dark} />
        </linearGradient>
        {/* lit from the upper left; the side of each fingertip turning in behind the phone falls into its shadow */}
        <linearGradient id={`${id}-tip`} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor={SKIN.light} />
          <stop offset="0.3" stopColor={SKIN.hi} />
          <stop offset="0.7" stopColor={SKIN.base} />
          <stop offset="1" stopColor={SKIN.deep} />
        </linearGradient>
        <linearGradient id={`${id}-thumb`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor={SKIN.hi} />
          <stop offset="0.45" stopColor={SKIN.light} />
          <stop offset="1" stopColor={SKIN.dark} />
        </linearGradient>
        <linearGradient id={`${id}-nail`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={NAIL.bed} />
          <stop offset="0.75" stopColor={NAIL.base} />
          <stop offset="1" stopColor={NAIL.tip} />
        </linearGradient>
        <filter id={`${id}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${id}-mid`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <clipPath id={`${id}-handclip`}>
          <path d={blob(HAND)} />
        </clipPath>
        {/* the thumb's base melts into the palm instead of ending in an edge */}
        <linearGradient id={`${id}-melt`} x1="0" y1="0" x2="0" y2="560" gradientUnits="userSpaceOnUse">
          <stop offset="0.8" stopColor="#fff" />
          <stop offset="0.96" stopColor="#000" />
        </linearGradient>
        <mask id={`${id}-fade`} maskUnits="userSpaceOnUse" x="-100" y="0" width="720" height="560">
          <rect x="-100" width="720" height="560" fill={url('melt')} />
        </mask>
        <clipPath id={`${id}-thumbclip`}>
          <path d={blob(THUMB)} />
        </clipPath>
        {TIPS.map((f, i) => (
          <clipPath key={i} id={`${id}-tip${i}`}>
            <path d={blob(fingertip(f))} />
          </clipPath>
        ))}
      </defs>

      {part === 'back' ? (
        <>
          {TIPS.map((f, i) => (
            <g key={i} transform={`rotate(${f.tilt} 100 ${f.y})`}>
              <path d={blob(fingertip(f))} fill={url('tip')} />
              <g clipPath={url(`tip${i}`)}>
                {/* the rounded pad catching the light, and the shade on its underside */}
                <ellipse cx={90 - f.reach + f.h * 0.42} cy={f.y - f.h * 0.18} rx={f.h * 0.3} ry={f.h * 0.2} fill={SKIN.hi} opacity={0.6} filter={url('mid')} />
                <ellipse cx={90 - f.reach + f.h * 0.5} cy={f.y + f.h * 0.5} rx={f.h * 0.7} ry={f.h * 0.22} fill={SKIN.deep} opacity={0.4} filter={url('mid')} />
                {/* the phone's edge shading the part of the finger that turns behind it */}
                <rect x={78} y={f.y - f.h} width={60} height={f.h * 2} fill="#000" opacity={0.3} filter={url('mid')} />
              </g>
            </g>
          ))}

          <path d={blob(HAND)} fill={url('arm')} />
          <g clipPath={url('handclip')}>
            {/* soft form shading: the far side of the wrist turns away from the light */}
            <path d={blob([[480, 330], [610, 400], [610, 700], [470, 660], [440, 470]])} fill={SKIN.deep} opacity={0.45} filter={url('blur')} />
            <path d={blob([[170, 300], [250, 300], [330, 520], [300, 640], [190, 520]])} fill={SKIN.hi} opacity={0.35} filter={url('blur')} />
            {/* the phone's shadow across the palm */}
            <rect x={70} y={352} width={380} height={34} fill="#000" opacity={0.38} filter={url('blur')} />
            {/* wrist creases */}
            <path d="M326 496 q44 -22 100 -28" stroke={SKIN.deep} strokeOpacity={0.3} strokeWidth={3} fill="none" strokeLinecap="round" filter={url('soft')} />
            <path d="M342 514 q40 -18 92 -24" stroke={SKIN.deep} strokeOpacity={0.2} strokeWidth={2.5} fill="none" strokeLinecap="round" filter={url('soft')} />
          </g>
        </>
      ) : (
        <g mask={url('fade')}>
          <path d={blob(THUMB)} fill={url('thumb')} />
          <g clipPath={url('thumbclip')}>
            {/* shade down the outer side turning away from the light, and a sheen along the top of the thumb */}
            <path d={line(along(1.15, 0, 1))} stroke={SKIN.deep} strokeWidth={34} strokeOpacity={0.55} fill="none" filter={url('blur')} />
            <path d={line(along(-0.35, 0.15, 0.95))} stroke={SKIN.hi} strokeWidth={16} strokeOpacity={0.5} fill="none" strokeLinecap="round" filter={url('mid')} />
            {/* the knuckle: a soft bump of light above folds of skin */}
            <ellipse cx={across(0.6, -0.1)[0]} cy={across(0.6, -0.1)[1]} rx={22} ry={16} fill={SKIN.hi} opacity={0.3} filter={url('mid')} />
            <path d={crease(0.62, -0.7, 0.55, 6)} stroke={SKIN.deep} strokeOpacity={0.45} strokeWidth={2.4} fill="none" strokeLinecap="round" filter={url('soft')} />
            <path d={crease(0.6, -0.55, 0.45, 5)} stroke={SKIN.deep} strokeOpacity={0.3} strokeWidth={1.8} fill="none" strokeLinecap="round" filter={url('soft')} />
            <path d={crease(0.645, -0.5, 0.35, 4)} stroke={SKIN.deep} strokeOpacity={0.25} strokeWidth={1.6} fill="none" strokeLinecap="round" filter={url('soft')} />
            {/* the tip pressing on the glass is a touch darker where it meets it */}
            <ellipse cx={TIP.at[0] - TIP.dir[0] * 4} cy={TIP.at[1] - TIP.dir[1] * 4} rx={30} ry={18} transform={`rotate(${NAIL_ANGLE} ${TIP.at[0]} ${TIP.at[1]})`} fill={SKIN.dark} opacity={0.18} filter={url('mid')} />
          </g>
          {/* the nail, lying along the thumb, its pale free edge toward the tip */}
          <g transform={`translate(${NAIL_AT.at[0].toFixed(1)} ${NAIL_AT.at[1].toFixed(1)}) rotate(${NAIL_ANGLE.toFixed(1)})`}>
            <ellipse cx={0} cy={0} rx={23} ry={27} fill={SKIN.deep} opacity={0.3} filter={url('soft')} />
            <path d="M-19 16 C-21 -2 -20 -16 -13 -22 C-6 -26 6 -26 13 -22 C20 -16 21 -2 19 16 C10 21 -10 21 -19 16Z" fill={url('nail')} />
            {/* cuticle, pale free edge, and a glint */}
            <path d="M-18 16 C-9 21 9 21 18 16" stroke={SKIN.dark} strokeOpacity={0.55} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            <path d="M-14 -17 C-6 -23 6 -23 14 -17" stroke={NAIL.tip} strokeWidth={5} fill="none" strokeLinecap="round" />
            <path d="M-9 8 C-10 -2 -8 -9 -4 -13" stroke="#fff" strokeOpacity={0.5} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          </g>
        </g>
      )}
    </svg>
  );
}
