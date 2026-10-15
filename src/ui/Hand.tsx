// Hand holding the phone (desktop only), drawn as smooth shaded vector shapes. Drawn in a 520×560 box
// where the phone covers x 90–430 and its bottom edge sits at y 360. Fingers wrap the left edge
// from behind; the thumb rests on the right edge in front.

type P = [number, number];

const SKIN = { base: '#8a5a3c', dark: '#5b3622', deep: '#3f2415', light: '#b57c57', hi: '#d09a73' };
const NAIL = { base: '#e8c4ad', edge: '#c99a82', hi: '#fbeee4' };

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

/** A tapering limb: round-capped segments laid down in layers (outline, body, light, highlight). */
function Tube({ line, widths, id }: { line: P[]; widths: number[]; id: string }) {
  const seg = (k: number, inset: number, dx: number, dy: number, stroke: string, op = 1) =>
    line.slice(0, -1).map((a, i) => {
      const b = line[i + 1];
      return (
        <line
          key={`${k}-${i}`}
          x1={a[0] + dx} y1={a[1] + dy} x2={b[0] + dx} y2={b[1] + dy}
          stroke={stroke} strokeOpacity={op} strokeLinecap="round"
          strokeWidth={Math.max(1.5, Math.min(widths[i], widths[i + 1]) - inset)}
        />
      );
    });
  return (
    <g data-id={id}>
      {seg(0, -2.5, 0, 0, SKIN.deep)}
      {seg(1, 0, 0, 0, SKIN.base)}
      {seg(2, 12, -2, -2.5, SKIN.light, 0.9)}
      {seg(3, 22, -3.5, -4.5, SKIN.hi, 0.55)}
    </g>
  );
}

/** A rounded nail with a soft sheen. */
function Nail({ at, r, rot, w = 1 }: { at: P; r: number; rot: number; w?: number }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${rot})`}>
      <rect x={-r} y={-r * 0.8 * w} width={r * 2} height={r * 1.6 * w} rx={r * 0.8} fill={NAIL.edge} />
      <rect x={-r + 1.2} y={-r * 0.8 * w + 1.2} width={r * 2 - 2.4} height={r * 1.6 * w - 2.4} rx={r * 0.7} fill={NAIL.base} />
      <ellipse cx={-r * 0.25} cy={-r * 0.3 * w} rx={r * 0.45} ry={r * 0.22 * w} fill={NAIL.hi} opacity={0.7} />
    </g>
  );
}

// Heel of the palm and wrist: only the part below the phone shows, flowing down into the forearm.
const PALM: P[] = [[205, 200], [330, 190], [430, 240], [458, 330], [440, 400], [400, 440], [330, 450], [260, 430], [210, 380], [185, 290]];
const FOREARM: P[] = [[290, 380], [420, 380], [540, 580], [450, 650], [350, 520]];
const THENAR: P[] = [[418, 340], [466, 350], [476, 410], [440, 440], [408, 405]];

// index → pinky, wrapping the left edge: bent across the edge, tips curling back round the side.
const FINGERS = [
  { y: 118, w: 50, tip: 46, len: 1 },
  { y: 170, w: 52, tip: 38, len: 1.1 },
  { y: 224, w: 50, tip: 44, len: 1 },
  { y: 276, w: 44, tip: 58, len: 0.8 },
];

export function Hand({ part }: { part: 'back' | 'thumb' }) {
  const id = `hand-${part}`;
  return (
    <svg className={`hand hand-${part}`} viewBox="0 0 520 560" aria-hidden>
      <defs>
        <radialGradient id={`${id}-palm`} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor={SKIN.light} />
          <stop offset="0.55" stopColor={SKIN.base} />
          <stop offset="1" stopColor={SKIN.dark} />
        </radialGradient>
        <linearGradient id={`${id}-arm`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={SKIN.dark} />
          <stop offset="0.45" stopColor={SKIN.base} />
          <stop offset="1" stopColor={SKIN.deep} />
        </linearGradient>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`${id}-fine`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      {part === 'back' ? (
        <>
          {/* forearm running off the bottom-right */}
          <path d={blob(FOREARM)} fill={`url(#${id}-arm)`} />
          {/* palm behind the phone */}
          <path d={blob(PALM)} fill={`url(#${id}-palm)`} />
          <path d={blob(PALM)} fill="none" stroke={SKIN.deep} strokeOpacity={0.55} strokeWidth={16} filter={`url(#${id}-soft)`} />
          {FINGERS.map((f, i) => (
            <g key={i}>
              <Tube
                id={`f${i}`}
                line={[[230, f.y], [118, f.y + 2], [f.tip + 34, f.y + 8], [f.tip + 8, f.y + 24], [f.tip + 2, f.y + 34]]}
                widths={[f.w, f.w, f.w - 2, f.w - 6, f.w - 14]}
              />
              {/* knuckle creases */}
              <path d={`M${f.tip + 66},${f.y - f.w * 0.28} q-6 ${f.w * 0.28} 0 ${f.w * 0.56}`} stroke={SKIN.deep} strokeOpacity={0.45} strokeWidth={2} fill="none" strokeLinecap="round" filter={`url(#${id}-fine)`} />
              <Nail at={[f.tip + 6, f.y + 29]} r={9} rot={-105} />
            </g>
          ))}
        </>
      ) : (
        <>
          {/* thumb pad / base on the right edge */}
          <path d={blob(THENAR)} fill={`url(#${id}-palm)`} />
          <path d={blob(THENAR)} fill="none" stroke={SKIN.deep} strokeOpacity={0.4} strokeWidth={10} filter={`url(#${id}-soft)`} />
          <Tube id="thumb" line={[[450, 392], [442, 322], [424, 266], [402, 214]]} widths={[54, 46, 38, 31]} />
          {/* joint crease */}
          <path d="M432 262 q14 -6 28 4" stroke={SKIN.deep} strokeOpacity={0.45} strokeWidth={2} fill="none" strokeLinecap="round" filter={`url(#${id}-fine)`} />
          <Nail at={[402, 204]} r={13} rot={-28} w={1.05} />
        </>
      )}
    </svg>
  );
}
