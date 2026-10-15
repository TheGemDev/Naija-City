// Right hand holding the phone (desktop only), drawn as a soft-shaded illustration. Drawn in a
// 520×560 box where the phone covers x 90–430 and its bottom edge sits at y 360. The palm and
// fingers are behind the phone, with only the fingertips peeking round the left edge; the thumb
// rests along the right edge in front.

type P = [number, number];

const SKIN = { hi: '#c98d64', light: '#b07650', base: '#935d3c', dark: '#6e4229', deep: '#4a2a18' };
const NAIL = { base: '#e6bba1', tip: '#f3dccd', edge: '#b9876c' };

/** Closed smooth outline through the points (Catmull-Rom turned into Béziers). */
function blob(pts: P[]): string {
  const n = pts.length;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d + 'Z';
}

// The hand from the heel of the palm down through the wrist into the forearm, off the bottom-right.
// Its top is hidden behind the phone.
const HAND: P[] = [
  [175, 250], [300, 225], [425, 250], [462, 320], [470, 395], [492, 455], [540, 540], [575, 620],
  [420, 660], [372, 560], [322, 492], [250, 450], [196, 392],
];

// Fingertips curled round the left edge, index at the top. Only the pads past the edge show.
const TIPS = [
  { y: 150, h: 44, reach: 22, tilt: -8 },
  { y: 198, h: 46, reach: 27, tilt: -4 },
  { y: 246, h: 44, reach: 24, tilt: 2 },
  { y: 290, h: 38, reach: 17, tilt: 8 },
];

// The thumb, its base (the mound under it) at the bottom right, tip resting on the edge of the screen.
const THUMB: P[] = [
  [404, 196], [424, 194], [440, 212], [450, 250], [462, 296], [478, 340], [486, 388], [478, 440],
  [462, 500], [436, 510], [416, 460], [414, 400], [416, 352], [406, 300], [394, 252], [390, 218],
];

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
        <linearGradient id={`${id}-tip`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKIN.hi} />
          <stop offset="0.55" stopColor={SKIN.light} />
          <stop offset="1" stopColor={SKIN.dark} />
        </linearGradient>
        <linearGradient id={`${id}-thumb`} x1="0" y1="0" x2="1" y2="0.15">
          <stop offset="0" stopColor={SKIN.hi} />
          <stop offset="0.5" stopColor={SKIN.light} />
          <stop offset="1" stopColor={SKIN.dark} />
        </linearGradient>
        <radialGradient id={`${id}-nail`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor={NAIL.tip} />
          <stop offset="0.7" stopColor={NAIL.base} />
          <stop offset="1" stopColor={NAIL.edge} />
        </radialGradient>
        <filter id={`${id}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <clipPath id={`${id}-handclip`}>
          <path d={blob(HAND)} />
        </clipPath>
        {/* the thumb's base melts into the palm instead of ending in an edge */}
        <linearGradient id={`${id}-melt`} x1="0" y1="0" x2="0" y2="560" gradientUnits="userSpaceOnUse">
          <stop offset="0.76" stopColor="#fff" />
          <stop offset="0.9" stopColor="#000" />
        </linearGradient>
        <mask id={`${id}-fade`} maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="560">
          <rect width="520" height="560" fill={url('melt')} />
        </mask>
        <clipPath id={`${id}-thumbclip`}>
          <path d={blob(THUMB)} />
        </clipPath>
      </defs>

      {part === 'back' ? (
        <>
          {TIPS.map((f, i) => (
            <g key={i} transform={`rotate(${f.tilt} 100 ${f.y})`}>
              <rect x={90 - f.reach} y={f.y - f.h / 2} width={f.reach + 60} height={f.h} rx={f.h / 2} fill={url('tip')} />
              {/* the pad's rounded highlight, and the crease where it meets the next finger */}
              <ellipse cx={90 - f.reach + f.h * 0.42} cy={f.y - f.h * 0.16} rx={f.h * 0.26} ry={f.h * 0.16} fill={SKIN.hi} opacity={0.55} filter={url('soft')} />
              <path d={`M${92 - f.reach + f.h * 0.3},${f.y + f.h / 2 - 1} H150`} stroke={SKIN.deep} strokeOpacity={0.35} strokeWidth={3} filter={url('soft')} />
            </g>
          ))}

          <path d={blob(HAND)} fill={url('arm')} />
          <g clipPath={url('handclip')}>
            {/* soft form shading: the far side of the wrist turns away from the light */}
            <path d={blob([[470, 330], [600, 400], [600, 680], [470, 660], [430, 470]])} fill={SKIN.deep} opacity={0.45} filter={url('blur')} />
            <path d={blob([[180, 300], [260, 300], [330, 520], [300, 640], [200, 520]])} fill={SKIN.hi} opacity={0.35} filter={url('blur')} />
            {/* the phone's shadow across the palm */}
            <rect x={80} y={350} width={360} height={30} fill="#000" opacity={0.35} filter={url('blur')} />
            {/* wrist creases */}
            <path d="M318 488 q40 -22 92 -30" stroke={SKIN.deep} strokeOpacity={0.3} strokeWidth={3} fill="none" strokeLinecap="round" filter={url('soft')} />
            <path d="M334 506 q36 -18 84 -26" stroke={SKIN.deep} strokeOpacity={0.22} strokeWidth={2.5} fill="none" strokeLinecap="round" filter={url('soft')} />
          </g>
        </>
      ) : (
        <g mask={url('fade')}>
          <path d={blob(THUMB)} fill={url('thumb')} />
          <g clipPath={url('thumbclip')}>
            {/* rim of shade down the outer side, and a soft sheen along the top */}
            <path d={blob([[450, 200], [520, 260], [530, 480], [480, 500], [460, 330]])} fill={SKIN.deep} opacity={0.5} filter={url('blur')} />
            <path d={blob([[396, 220], [418, 220], [430, 330], [420, 430], [404, 330]])} fill={SKIN.hi} opacity={0.5} filter={url('blur')} />
            {/* knuckle creases */}
            <path d="M404 292 q20 -10 46 -4" stroke={SKIN.deep} strokeOpacity={0.4} strokeWidth={2.5} fill="none" strokeLinecap="round" filter={url('soft')} />
            <path d="M408 302 q18 -6 38 -2" stroke={SKIN.deep} strokeOpacity={0.25} strokeWidth={2} fill="none" strokeLinecap="round" filter={url('soft')} />
          </g>
          {/* nail */}
          <g transform="rotate(-18 416 228)">
            <rect x={402} y={204} width={28} height={40} rx={13} fill={NAIL.edge} opacity={0.6} />
            <rect x={404} y={206} width={24} height={36} rx={11.5} fill={url('nail')} />
            <path d="M408 212 q8 -4 16 0" stroke="#fff" strokeOpacity={0.55} strokeWidth={2} fill="none" strokeLinecap="round" />
          </g>
        </g>
      )}
    </svg>
  );
}
