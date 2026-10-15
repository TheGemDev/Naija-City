// Town buildings for the map, built from primitives with trim, framed windows and smooth curves. Each model is centred on its footprint (w along x,
// d along z, in tiles), sits on y=0 and has its entrance on the +z side.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial, type Group, type Mesh } from 'three';
import { B, Keke } from './models';

type V3 = [number, number, number];

/** Shared materials so windows and street lamps can all light up at night in one go. */
export const windowMat = new MeshStandardMaterial({ color: '#5f8fb0', emissive: '#ffcf7a', emissiveIntensity: 0, roughness: 0.18, metalness: 0.55 });
export const lampMat = new MeshStandardMaterial({ color: '#fff4cf', emissive: '#ffd27a', emissiveIntensity: 0 });

const FRAME = '#f1ede4';
const SILL = '#cfc8ba';

/** A glazed window: the glass, a frame round it, a glazing bar or two and a sill under it. Works on any wall: the thinnest side of `s` is its depth. */
function Win({ p, s }: { p: V3; s: V3 }) {
  const pane = (
    <mesh position={p} material={windowMat}>
      <boxGeometry args={s} />
    </mesh>
  );
  const deep = s[0] < s[2] ? 0 : 2;
  if (s[1] < Math.min(s[0], s[2])) return pane;
  const wide = deep === 0 ? 2 : 0;
  const t = 0.035;
  const box = (w: number, h: number, dd: number): V3 => (wide === 0 ? [w, h, dd] : [dd, h, w]);
  const at = (a: number, y: number, out = 0): V3 => {
    const q: V3 = [...p];
    q[wide] += a;
    q[1] += y;
    q[deep] += out * Math.sign(p[deep] || 1);
    return q;
  };
  const W = s[wide], H = s[1], D = s[deep];
  return (
    <group>
      {pane}
      <B p={at(0, H / 2 + t / 2)} s={box(W + t * 2, t, D + 0.02)} c={FRAME} />
      <B p={at(0, -H / 2 - t / 2)} s={box(W + t * 2, t, D + 0.02)} c={FRAME} />
      <B p={at(-W / 2 - t / 2, 0)} s={box(t, H, D + 0.02)} c={FRAME} />
      <B p={at(W / 2 + t / 2, 0)} s={box(t, H, D + 0.02)} c={FRAME} />
      {W > 0.2 && <B p={at(0, 0, 0.004)} s={box(0.02, H, D + 0.01)} c={FRAME} />}
      {H > 0.32 && <B p={at(0, H * 0.12, 0.004)} s={box(W, 0.02, D + 0.01)} c={FRAME} />}
      <B p={at(0, -H / 2 - t - 0.018, 0.03)} s={box(W + 0.14, 0.036, D + 0.08)} c={SILL} />
    </group>
  );
}

function Cyl({ p, r, h, c, rt, seg = 24, e }: { p: V3; r: number; h: number; c: string; rt?: number; seg?: number; e?: string }) {
  // Square and five-sided posts keep their edges; anything rounder is drawn round, with twice the sides.
  const facets = seg < 6;
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, facets ? seg : Math.max(seg * 2, 16)]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} flatShading={facets} />
    </mesh>
  );
}

function Dome({ p, r, c }: { p: V3; r: number; c: string }) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={c} roughness={0.55} />
    </mesh>
  );
}

/**
 * A unit wedge for gable ends: a triangle across z (-0.5 to 0.5 at y=0, apex at y=1, z=0), x from -0.5 to 0.5.
 * Flat faces, built once and shared.
 */
const PRISM = (() => {
  const a: V3 = [0, 0, -0.5], b: V3 = [0, 0, 0.5], c: V3 = [0, 1, 0];
  const at = (q: V3, x: number): V3 => [x, q[1], q[2]];
  const faces: V3[][] = [
    [at(a, -0.5), at(c, -0.5), at(b, -0.5)], [at(a, 0.5), at(b, 0.5), at(c, 0.5)],
    [at(a, -0.5), at(b, -0.5), at(b, 0.5), at(a, 0.5)],
    [at(b, -0.5), at(c, -0.5), at(c, 0.5), at(b, 0.5)],
    [at(c, -0.5), at(a, -0.5), at(a, 0.5), at(c, 0.5)],
  ];
  const pos: number[] = [];
  for (const face of faces) {
    const f = [...face].reverse(); // listed clockwise above; faces point out counter-clockwise
    const tris = f.length === 3 ? [f] : [[f[0], f[1], f[2]], [f[0], f[2], f[3]]];
    for (const t of tris) for (const v of t) pos.push(...v);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
})();

/** `c` a shade darker (k < 1) or lighter (k > 1). */
const shade = (c: string, k: number) => `#${new Color(c).multiplyScalar(k).getHexString()}`;

/**
 * Pitched roof with its ridge along x: two sloping sheets from the ridge out past the walls, a ridge cap, and
 * the wall's own colour filling the triangle at each end. `p` is the middle of the eaves line (the top of the
 * walls), `w` the roof's length, `d` the depth of the walls it covers and `h` the rise to the ridge.
 */
function Gable({ p, w, d, h, c, wall, eave = 0.18 }: { p: V3; w: number; d: number; h: number; c: string; wall?: string; eave?: number }) {
  const half = d / 2;
  const ang = Math.atan2(h, half);
  const t = 0.05;
  const len = Math.hypot(half, h) + eave / Math.cos(ang);
  return (
    <group position={p}>
      {[1, -1].map((s) => (
        <group key={s} position={[0, h - (len / 2) * Math.sin(ang) + (t / 2) * Math.cos(ang), s * ((len / 2) * Math.cos(ang) + (t / 2) * Math.sin(ang))]} rotation={[s * ang, 0, 0]}>
          <B p={[0, 0, 0]} s={[w, t, len]} c={c} />
          {/* the sheet's lower edge: a fascia board along the eaves */}
          <B p={[0, -t, s * (len / 2 - 0.02)]} s={[w + 0.02, t * 1.6, 0.05]} c={shade(c, 0.72)} />
        </group>
      ))}
      <B p={[0, h + t * 0.9, 0]} s={[w + 0.04, 0.07, 0.13]} c={shade(c, 0.78)} />
      <mesh geometry={PRISM} scale={[w - eave * 1.4, h, d]} castShadow receiveShadow>
        <meshStandardMaterial color={wall ?? shade(c, 0.85)} flatShading />
      </mesh>
    </group>
  );
}

/** Low wall round the top of a flat roof, with a coping strip along it. `y` is the roof's top. */
function Parapet({ w, d, y, c, h = 0.2, cap = '#ece6da' }: { w: number; d: number; y: number; c: string; h?: number; cap?: string }) {
  const t = 0.07;
  return (
    <>
      <B p={[0, y + h / 2, d / 2 - t / 2]} s={[w, h, t]} c={c} />
      <B p={[0, y + h / 2, -d / 2 + t / 2]} s={[w, h, t]} c={c} />
      <B p={[w / 2 - t / 2, y + h / 2, 0]} s={[t, h, d - t * 2]} c={c} />
      <B p={[-w / 2 + t / 2, y + h / 2, 0]} s={[t, h, d - t * 2]} c={c} />
      <B p={[0, y + h + 0.02, d / 2 - t / 2]} s={[w + 0.04, 0.04, t + 0.04]} c={cap} />
      <B p={[0, y + h + 0.02, -d / 2 + t / 2]} s={[w + 0.04, 0.04, t + 0.04]} c={cap} />
      <B p={[w / 2 - t / 2, y + h + 0.02, 0]} s={[t + 0.04, 0.04, d]} c={cap} />
      <B p={[-w / 2 + t / 2, y + h + 0.02, 0]} s={[t + 0.04, 0.04, d]} c={cap} />
    </>
  );
}

// The crown is a cluster of soft lumps: low-poly spheres with smooth normals, so a city of hundreds of trees stays light.
const CROWN = [
  [0, 2.45, 0, 0.95, 1], [0.6, 2.2, 0.3, 0.68, 0.9], [-0.55, 2.25, -0.25, 0.7, 0.86],
  [0.2, 2.15, -0.6, 0.62, 0.8], [-0.3, 2.1, 0.55, 0.62, 0.92], [0.05, 3.05, 0.05, 0.6, 1.1],
] as const;

function Tree({ p, s = 0.6, c = '#3f7d2a' }: { p: V3; s?: number; c?: string }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0.95, 0]} r={0.17} rt={0.1} h={1.9} c="#5b3a1e" seg={6} />
      {/* two boughs leaving the trunk into the crown */}
      <group position={[0.12, 1.75, 0]} rotation={[0, 0, -0.6]}><Cyl p={[0, 0.25, 0]} r={0.07} rt={0.05} h={0.5} c="#5b3a1e" seg={5} /></group>
      <group position={[-0.1, 1.65, 0.05]} rotation={[0.3, 0, 0.6]}><Cyl p={[0, 0.25, 0]} r={0.07} rt={0.05} h={0.5} c="#5b3a1e" seg={5} /></group>
      {CROWN.map(([x, y, z, r, k], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={shade(c, k)} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Row of windows along the front (+z) face. */
function WindowRow({ w, d, y, n, inset = 0.4, hood, skip }: { w: number; d: number; y: number; n: number; inset?: number; hood?: string; skip?: number }) {
  const span = w - inset * 2;
  const ww = (span / n) * 0.55;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        if (i === skip) return null;
        const x = -span / 2 + (span / n) * (i + 0.5);
        return (
          <group key={i}>
            <Win p={[x, y, d / 2 + 0.01]} s={[ww, 0.45, 0.04]} />
            {/* the concrete sunshade over a window, as on most houses in the north */}
            {hood && <B p={[x, y + 0.31, d / 2 + 0.09]} s={[ww + 0.16, 0.04, 0.18]} c={hood} />}
          </group>
        );
      })}
    </>
  );
}

/** Windows at the given positions across one face: `z` is the face (+z), or `x` with `side` for a side wall. */
function Bays({ at, y, z, ww = 0.32, wh = 0.45, hood, x, side }: { at: number[]; y: number[]; z?: number; ww?: number; wh?: number; hood?: string; x?: number; side?: 1 | -1 }) {
  return (
    <>
      {y.flatMap((wy) => at.map((a) => {
        const onSide = x !== undefined;
        const p: V3 = onSide ? [x + (side ?? 1) * 0.01, wy, a] : [a, wy, (z ?? 0) + 0.01];
        return (
          <group key={`${wy}|${a}`}>
            <Win p={p} s={onSide ? [0.04, wh, ww] : [ww, wh, 0.04]} />
            {hood && <B p={onSide ? [p[0] + (side ?? 1) * 0.08, wy + wh / 2 + 0.06, a] : [a, wy + wh / 2 + 0.06, p[2] + 0.08]} s={onSide ? [0.18, 0.04, ww + 0.16] : [ww + 0.16, 0.04, 0.18]} c={hood} />}
          </group>
        );
      }))}
    </>
  );
}

/** `n` evenly spaced positions across `span`, leaving out any within `gap` of the middle. */
const spread = (span: number, n: number, gap = 0) =>
  Array.from({ length: n }, (_, i) => -span / 2 + (span / n) * (i + 0.5)).filter((x) => Math.abs(x) >= gap);

function Block({ w, d, h, wall, roof, floors = 1, sign }: { w: number; d: number; h: number; wall: string; roof: string; floors?: number; sign?: string }) {
  const fh = h / floors;
  return (
    <group>
      <B p={[0, h / 2, 0]} s={[w, h, d]} c={wall} />
      <B p={[0, 0.09, 0]} s={[w + 0.06, 0.18, d + 0.06]} c="#8b7d6b" />
      <B p={[0, h + 0.06, 0]} s={[w + 0.15, 0.12, d + 0.15]} c={roof} />
      <Parapet w={w + 0.15} d={d + 0.15} y={h + 0.12} c={wall} h={0.16} />
      {Array.from({ length: floors - 1 }, (_, f) => (
        <B key={f} p={[0, fh * (f + 1), 0]} s={[w + 0.05, 0.06, d + 0.05]} c="#ece6da" />
      ))}
      {Array.from({ length: floors }, (_, f) => {
        const n = Math.max(2, Math.round(w * 1.2));
        // The door takes the middle of the ground floor.
        return <WindowRow key={f} w={w} d={d} y={fh * f + fh * 0.6} n={n} hood="#ece6da" skip={f === 0 && n % 2 ? (n - 1) / 2 : undefined} />;
      })}
      <B p={[0, 0.48, d / 2 + 0.015]} s={[0.72, 0.96, 0.03]} c={FRAME} />
      <B p={[0, 0.45, d / 2 + 0.02]} s={[0.6, 0.9, 0.05]} c="#3b2a1a" />
      <B p={[0, 1.0, d / 2 + 0.2]} s={[0.95, 0.05, 0.4]} c={roof} />
      {sign && <B p={[0, Math.min(h - 0.2, 1.35), d / 2 + 0.06]} s={[Math.min(w * 0.6, 2.4), 0.35, 0.06]} c={sign} />}
    </group>
  );
}

/* ---------- Landmarks ---------- */

function Home({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#c98b5e" />
      {/* Compound fence with the green gate */}
      <B p={[0, 0.45, -d / 2 + 0.05]} s={[w, 0.9, 0.1]} c="#d8c7a8" />
      <B p={[-w / 2 + 0.05, 0.45, 0]} s={[0.1, 0.9, d]} c="#d8c7a8" />
      <B p={[w / 2 - 0.05, 0.45, 0]} s={[0.1, 0.9, d]} c="#d8c7a8" />
      <B p={[-w / 4 - 0.4, 0.45, d / 2 - 0.05]} s={[w / 2 - 0.2, 0.9, 0.1]} c="#d8c7a8" />
      <B p={[w / 4 + 0.4, 0.45, d / 2 - 0.05]} s={[w / 2 - 0.2, 0.9, 0.1]} c="#d8c7a8" />
      <B p={[-0.5 + 0.5, 0.6, d / 2 - 0.05]} s={[1, 1.2, 0.08]} c="#0f5132" />
      <group position={[0, 0, -0.4]}>
        <B p={[0, 0.8, 0]} s={[3, 1.6, 2.2]} c="#f3ead8" />
        <Gable p={[0, 1.6, 0]} w={3.4} d={2.2} h={0.75} c="#1f4e3d" wall="#f3ead8" />
        <WindowRow w={3} d={2.2} y={0.95} n={3} />
        <B p={[0.9, 0.45, 1.12]} s={[0.45, 0.9, 0.05]} c="#5a371e" />
      </group>
      {/* Raised GP tank: the compound's pumpable water reserve. */}
      <group position={[0, 0, -0.55]}>
        {[-0.25, 0.25].flatMap((x) => [-0.22, 0.22].map((z) => (
          <Cyl key={`${x}-${z}`} p={[x, 2.35, z]} r={0.025} h={0.55} c="#64748b" seg={6} />
        )))}
        <Cyl p={[0, 2.72, 0]} r={0.36} rt={0.36} h={0.58} c="#2563eb" seg={10} />
        <Cyl p={[0, 3.02, 0]} r={0.36} rt={0.34} h={0.05} c="#1d4ed8" seg={10} />
      </group>
      <B p={[-1.4, 0.3, 1.35]} s={[0.5, 0.45, 0.4]} c="#dc2626" />
      <Tree p={[1.4, 0, 1.3]} s={0.45} c="#2f7d32" />
    </group>
  );
}

function Smoke() {
  const ref = useRef<Group>(null!);
  useFrame(({ clock }) => {
    ref.current.children.forEach((m, i) => {
      const t = (clock.elapsedTime * 0.5 + i / 4) % 1;
      m.position.set(Math.sin(t * 6 + i) * 0.15, 1.1 + t * 1.6, 0);
      m.scale.setScalar(0.12 + t * 0.25);
      ((m as Mesh).material as MeshStandardMaterial).opacity = 0.5 * (1 - t);
    });
  });
  return (
    <group ref={ref} userData={{ dynamic: true }}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#d1d5db" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Suya({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#b77b52" />
      <group position={[0, 0, -0.7]}>
        <B p={[0, 0.7, 0]} s={[1.8, 1.4, 1.1]} c="#f8f1e3" />
        <B p={[0, 1.5, 0.1]} s={[2.1, 0.1, 1.5]} c="#b91c1c" />
        <B p={[0, 1.2, 0.58]} s={[1.4, 0.3, 0.05]} c="#facc15" />
      </group>
      <group position={[0.6, 0, 0.3]}>
        <B p={[0, 0.5, 0]} s={[0.8, 0.25, 0.5]} c="#111827" />
        <B p={[0, 0.64, 0]} s={[0.76, 0.03, 0.46]} c="#f97316" e="#ea580c" />
        <Smoke />
      </group>
      {[[-0.8, 0.5], [-0.6, 1.1], [0.2, 1.2]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <B p={[0, 0.4, 0]} s={[0.5, 0.05, 0.5]} c="#f8fafc" />
          <B p={[0, 0.2, 0]} s={[0.08, 0.4, 0.08]} c="#e2e8f0" />
        </group>
      ))}
      <Cyl p={[-0.7, 0.9, 0.8]} r={0.03} h={1.8} c="#64748b" />
      <Cyl p={[-0.7, 1.75, 0.8]} r={0.75} rt={0.02} h={0.3} c="#16a34a" seg={8} />
    </group>
  );
}

function School({ w, d }: { w: number; d: number }) {
  const bw = w - 1;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#c98b5e" />
      <group position={[0, 0, -0.6]}>
        <B p={[0, 0.65, 0]} s={[bw, 1.3, 1.6]} c="#fde68a" />
        <B p={[0, 0.08, 0.15]} s={[bw + 0.06, 0.16, 2.1]} c="#a8a29e" />
        <B p={[0, 1.38, 0.15]} s={[w - 0.7, 0.12, 2.1]} c="#1e40af" />
        <B p={[0, 1.31, 0.15]} s={[w - 0.7, 0.04, 2.12]} c="#f8fafc" />
        <WindowRow w={bw} d={1.6} y={0.75} n={8} />
        {/* the open corridor along the classrooms, its roof on square pillars */}
        {spread(bw - 0.12, Math.max(4, Math.round(bw / 0.9) + 1)).map((x) => (
          <B key={x} p={[x, 0.66, 1.1]} s={[0.1, 1.28, 0.1]} c="#f8fafc" />
        ))}
        {/* classroom doors, painted blue */}
        {[-0.3, 0.3].map((k) => (
          <B key={k} p={[k * bw, 0.4, 0.81]} s={[0.3, 0.72, 0.03]} c="#1e40af" />
        ))}
      </group>
      {/* Flag pole: green-white-green */}
      <group position={[w / 2 - 0.8, 0, d / 2 - 0.6]}>
        <B p={[0, 0.06, 0]} s={[0.4, 0.12, 0.4]} c="#e7e5e4" />
        <Cyl p={[0, 1.2, 0]} r={0.03} h={2.4} c="#cbd5e1" />
        <B p={[0.2, 2.15, 0]} s={[0.13, 0.3, 0.02]} c="#15803d" />
        <B p={[0.33, 2.15, 0]} s={[0.13, 0.3, 0.02]} c="#ffffff" />
        <B p={[0.46, 2.15, 0]} s={[0.13, 0.3, 0.02]} c="#15803d" />
      </group>
    </group>
  );
}

function Pitch({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#c8a06a" />
      <B p={[0, 0.03, 0]} s={[w - 0.6, 0.01, d - 0.6]} c="#8db255" />
      <B p={[0, 0.04, 0]} s={[0.06, 0.01, d - 0.6]} c="#fff" />
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.62, 24]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 0.35), 0, 0]}>
          <B p={[0, 0.5, -0.6]} s={[0.06, 1, 0.06]} c="#fff" />
          <B p={[0, 0.5, 0.6]} s={[0.06, 1, 0.06]} c="#fff" />
          <B p={[0, 1, 0]} s={[0.06, 0.06, 1.26]} c="#fff" />
        </group>
      ))}
    </group>
  );
}

function Church({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <group position={[0, 0, -0.3]}>
        <B p={[0, 0.9, 0]} s={[2.4, 1.8, 3.6]} c="#f5f5f4" />
        <group rotation={[0, Math.PI / 2, 0]}>
          <Gable p={[0, 1.8, 0]} w={3.9} d={2.4} h={1} c="#7f1d1d" wall="#f5f5f4" />
        </group>
        {[-0.8, 0, 0.8].map((z) => (
          <Win key={z} p={[1.21, 1.0, z]} s={[0.04, 0.8, 0.3]} />
        ))}
        {/* Bell tower */}
        <B p={[0, 1.7, 1.75]} s={[0.9, 3.4, 0.9]} c="#e7e5e4" />
        <mesh position={[0, 3.75, 1.75]} castShadow>
          <coneGeometry args={[0.65, 1.0, 4]} />
          <meshStandardMaterial color="#7f1d1d" flatShading />
        </mesh>
        <B p={[0, 4.5, 1.75]} s={[0.06, 0.5, 0.06]} c="#facc15" />
        <B p={[0, 4.6, 1.75]} s={[0.3, 0.06, 0.06]} c="#facc15" />
        <B p={[0, 0.5, 2.21]} s={[0.5, 1, 0.04]} c="#5a371e" />
      </group>
    </group>
  );
}

function Buka({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#c98b5e" />
      {[[-1.2, -1.2], [1.2, -1.2], [-1.2, 0.6], [1.2, 0.6]].map(([x, z], i) => (
        <B key={i} p={[x, 0.75, z]} s={[0.08, 1.5, 0.08]} c="#6b4423" />
      ))}
      <B p={[0, 1.55, -0.3]} s={[2.8, 0.08, 2.2]} c="#94a3b8" />
      <B p={[0, 0.45, -0.9]} s={[2.2, 0.9, 0.5]} c="#7c2d12" />
      {[-0.6, 0, 0.6].map((x, i) => (
        <Cyl key={i} p={[x, 1.0, -0.9]} r={0.17} rt={0.2} h={0.2} c={['#f59e0b', '#b91c1c', '#15803d'][i]} />
      ))}
      <B p={[0, 0.25, 0.4]} s={[2, 0.08, 0.35]} c="#a16207" />
      <B p={[0, 0.5, 0.2]} s={[2, 0.06, 0.6]} c="#92400e" />
      {/* Mai shayi table and kettle */}
      <group position={[1.0, 0, 1.0]}>
        <B p={[0, 0.4, 0]} s={[0.7, 0.05, 0.5]} c="#1d4ed8" />
        <B p={[0, 0.2, 0]} s={[0.6, 0.4, 0.05]} c="#1e3a8a" />
        <Cyl p={[0.1, 0.55, 0]} r={0.1} rt={0.07} h={0.22} c="#e5e7eb" />
      </group>
    </group>
  );
}

function ViewingCenter({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#92775c" />
      <B p={[0, 1.1, -d / 2 + 0.08]} s={[w - 0.3, 2.2, 0.16]} c="#d6cfc2" />
      <B p={[0, 2.3, 0]} s={[w + 0.25, 0.16, d + 0.25]} c="#475569" />
      {[-w / 2 + 0.2, w / 2 - 0.2].map((x) => (
        <Cyl key={x} p={[x, 1.1, 0.35]} r={0.06} h={2.2} c="#6b4423" seg={8} />
      ))}
      <B p={[0, 1.35, -d / 2 + 0.18]} s={[w * 0.48, 0.8, 0.08]} c="#111827" />
      <B p={[0, 1.35, -d / 2 + 0.23]} s={[w * 0.42, 0.64, 0.03]} c="#2563eb" />
      <B p={[0, 0.3, d / 2 - 0.35]} s={[w * 0.42, 0.5, 0.24]} c="#7c4a24" />
      <B p={[0, 0.58, d / 2 - 0.35]} s={[w * 0.42, 0.08, 0.28]} c="#5b371c" />
      <B p={[w / 2 - 0.75, 0.25, -0.1]} s={[0.65, 0.5, 0.65]} c="#334155" />
      <B p={[w / 2 - 0.75, 0.52, -0.1]} s={[0.52, 0.06, 0.52]} c="#f59e0b" />
    </group>
  );
}

function Flare() {
  const ref = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current.scale.set(1 + Math.sin(t * 13) * 0.15, 1 + Math.sin(t * 9) * 0.25, 1);
  });
  return (
    <mesh ref={ref} position={[0, 0.3, 0]} userData={{ dynamic: true }}>
      <coneGeometry args={[0.22, 0.7, 6]} />
      <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} />
    </mesh>
  );
}

function Refinery({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#9ca3af" />
      {[[-2.5, -2.2], [0, -2.2], [-2.5, 0.6], [0, 0.6]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl p={[0, 0.7, 0]} r={1.05} h={1.4} c="#e5e7eb" seg={16} />
          <Cyl p={[0, 1.42, 0]} r={1.05} rt={0.9} h={0.06} c="#cbd5e1" seg={16} />
          <B p={[0, 0.6, 1.02]} s={[0.5, 0.15, 0.05]} c="#16a34a" />
        </group>
      ))}
      <group position={[2.6, 0, -1]}>
        <B p={[0, 1.6, 0]} s={[1.6, 3.2, 1.4]} c="#475569" />
        {[0.8, 1.6, 2.4].map((y) => (
          <B key={y} p={[0, y, 0.72]} s={[1.6, 0.05, 0.05]} c="#facc15" />
        ))}
        <Cyl p={[0.4, 3.3, 0]} r={0.25} h={3.4} c="#94a3b8" />
      </group>
      <group position={[3.3, 0, 2.3]}>
        <Cyl p={[0, 2.5, 0]} r={0.14} rt={0.1} h={5} c="#dc2626" seg={8} />
        <group position={[0, 5, 0]}>
          <Flare />
        </group>
      </group>
      {[-1.4, 1.2].map((z) => (
        <mesh key={z} position={[0, 0.35, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, w - 1, 6]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      ))}
      <B p={[0, 0.5, d / 2 - 0.3]} s={[w - 0.4, 1, 0.08]} c="#e5e7eb" o={0.6} />
    </group>
  );
}

function Mosque({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#e7e5e4" />
      <B p={[0, 0.8, -0.1]} s={[2.6, 1.6, 2.2]} c="#fafaf9" />
      <Cyl p={[0, 1.7, -0.1]} r={0.75} h={0.2} c="#f5f5f4" />
      <Dome p={[0, 1.8, -0.1]} r={0.75} c="#15803d" />
      <B p={[0, 2.65, -0.1]} s={[0.05, 0.3, 0.05]} c="#facc15" />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.65, 0, 1.0]}>
          <Cyl p={[0, 1.6, 0]} r={0.18} rt={0.14} h={3.2} c="#fafaf9" seg={8} />
          <Cyl p={[0, 2.6, 0]} r={0.24} h={0.12} c="#15803d" seg={8} />
          <mesh position={[0, 3.45, 0]}>
            <coneGeometry args={[0.18, 0.5, 8]} />
            <meshStandardMaterial color="#15803d" flatShading />
          </mesh>
        </group>
      ))}
      {[-0.8, 0, 0.8].map((x) => (
        <Win key={x} p={[x, 0.95, 1.01]} s={[0.35, 0.6, 0.04]} />
      ))}
    </group>
  );
}

function Jetty({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.05, 0.2]} s={[1.2, 0.1, d + 0.6]} c="#8b5a2b" />
      {[[-0.55, -0.2], [0.55, -0.2], [-0.55, 0.7], [0.55, 0.7]].map(([x, z], i) => (
        <B key={i} p={[x, -0.1, z]} s={[0.1, 0.5, 0.1]} c="#5a3418" />
      ))}
      {/* Canoe */}
      <group position={[w / 2 - 0.2, -0.05, -0.1]}>
        <B p={[0, 0, 0]} s={[0.45, 0.2, 1.6]} c="#7c2d12" />
        <B p={[0, 0.06, 0]} s={[0.35, 0.12, 1.4]} c="#a16207" />
      </group>
    </group>
  );
}

/** Small airliner, nose towards +x. */
function Plane() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 2.2, 10]} />
        <meshStandardMaterial color="#f8fafc" flatShading />
      </mesh>
      <mesh position={[1.2, 0.35, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.17, 0.3, 10]} />
        <meshStandardMaterial color="#f8fafc" flatShading />
      </mesh>
      <B p={[0, 0.3, 0]} s={[2.2, 0.06, 0.36]} c="#15803d" />
      <B p={[0.05, 0.3, 0]} s={[0.55, 0.05, 2.2]} c="#e2e8f0" />
      <B p={[-1.0, 0.62, 0]} s={[0.35, 0.45, 0.05]} c="#15803d" />
      <B p={[-1.0, 0.4, 0]} s={[0.3, 0.04, 0.8]} c="#e2e8f0" />
      {[-0.55, 0.55].map((z) => (
        <Cyl key={z} p={[0.2, 0.22, z]} r={0.08} h={0.3} c="#94a3b8" />
      ))}
    </group>
  );
}

function Airport({ w, d }: { w: number; d: number }) {
  const runZ = -d / 2 + 1;
  const runLen = w - 0.6;
  const flyer = useRef<Group>(null!);
  // A plane rolls down the runway, lifts off and climbs away every 16 seconds.
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 16) / 16;
    const g = flyer.current;
    g.visible = t > 0.1 && t < 0.85;
    const run = Math.max(0, t - 0.1) / 0.75; // 0 → 1
    const x = -runLen / 2 + 0.8 + run * run * (runLen + 6);
    const lift = Math.max(0, x - 1);
    g.position.set(x, lift * 0.35, runZ);
    g.rotation.z = Math.min(0.3, lift * 0.12);
  });
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#a3a37a" />
      {/* Runway with centre dashes and threshold stripes */}
      <B p={[0, 0.05, runZ]} s={[runLen, 0.02, 1.4]} c="#3f4249" />
      {Array.from({ length: Math.floor(runLen / 1.2) }, (_, i) => (
        <B key={i} p={[-runLen / 2 + 1.2 + i * 1.2, 0.065, runZ]} s={[0.5, 0.01, 0.06]} c="#f8fafc" />
      ))}
      {[-1, 1].map((e) =>
        [-0.45, -0.15, 0.15, 0.45].map((z) => <B key={`${e}${z}`} p={[e * (runLen / 2 - 0.35), 0.065, runZ + z]} s={[0.4, 0.01, 0.12]} c="#f8fafc" />),
      )}
      {/* Apron and taxiway */}
      <B p={[0.5, 0.045, d / 2 - 1.3]} s={[9, 0.02, 2]} c="#9ca3af" />
      <B p={[-4.2, 0.045, runZ + 1]} s={[0.6, 0.02, 1.2]} c="#9ca3af" />
      {/* Terminal */}
      <group position={[-4.5, 0, d / 2 - 1.1]}>
        <B p={[0, 0.6, 0]} s={[5, 1.2, 1.6]} c="#f1f5f9" />
        <B p={[0, 1.25, 0]} s={[5.3, 0.12, 1.9]} c="#15803d" />
        <WindowRow w={5} d={1.6} y={0.7} n={7} />
      </group>
      {/* Control tower */}
      <group position={[w / 2 - 2.2, 0, d / 2 - 1]}>
        <Cyl p={[0, 1.2, 0]} r={0.28} h={2.4} c="#e5e7eb" />
        <Cyl p={[0, 2.6, 0]} r={0.45} rt={0.55} h={0.4} c="#7fb4d6" e="#1e3a5f" />
        <Cyl p={[0, 2.88, 0]} r={0.58} rt={0.4} h={0.16} c="#475569" />
        <Cyl p={[0, 3.15, 0]} r={0.03} h={0.4} c="#dc2626" e="#dc2626" />
      </group>
      {/* Parked plane at the gate */}
      <group position={[1.5, 0.05, d / 2 - 1.3]} rotation={[0, Math.PI, 0]}>
        <Plane />
      </group>
      <group ref={flyer} userData={{ dynamic: true }}>
        <Plane />
      </group>
    </group>
  );
}

function Market({ w, d }: { w: number; d: number }) {
  const colours = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0d9488'];
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#b77b52" />
      {/* Main shed */}
      <group position={[0, 0, -1.2]}>
        <B p={[0, 0.8, 0]} s={[w - 1, 1.6, 2]} c="#e7d3b1" />
        <Gable p={[0, 1.6, 0]} w={w - 0.6} d={2} h={0.6} c="#8b9aa5" wall="#e7d3b1" />
        <B p={[0, 1.25, 1.02]} s={[3, 0.4, 0.05]} c="#15803d" />
      </group>
      {/* Stalls with umbrellas */}
      {Array.from({ length: 6 }, (_, i) => {
        const x = -w / 2 + 0.9 + i * ((w - 1.8) / 5);
        return (
          <group key={i} position={[x, 0, 1.2 + (i % 2) * 0.4]}>
            <B p={[0, 0.35, 0]} s={[0.8, 0.7, 0.5]} c="#7c4a24" />
            {[0, 1, 2].map((k) => (
              <B key={k} p={[-0.22 + k * 0.22, 0.75, 0]} s={[0.18, 0.12, 0.18]} c={colours[(i + k) % 6]} />
            ))}
            <Cyl p={[0, 0.9, 0]} r={0.025} h={1.4} c="#475569" />
            <Cyl p={[0, 1.55, 0]} r={0.6} rt={0.02} h={0.25} c={colours[i % 6]} seg={8} />
          </group>
        );
      })}
    </group>
  );
}

function Lugard({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <B p={[0, 0.9, -0.4]} s={[w - 0.8, 1.8, d - 1.4]} c="#f0e6d2" />
      <B p={[0, 1.85, -0.4]} s={[w - 0.6, 0.12, d - 1.2]} c="#a8a29e" />
      <Cyl p={[0, 2.15, -0.4]} r={1.15} h={0.5} c="#f5f0e6" seg={16} />
      <Dome p={[0, 2.4, -0.4]} r={1.15} c="#4d7c6f" />
      <Cyl p={[0, 3.6, -0.4]} r={0.15} h={0.3} c="#d4af37" />
      {/* Portico with columns */}
      <B p={[0, 1.65, 1.35]} s={[2.6, 0.2, 0.9]} c="#e7e5e4" />
      {[-1.1, -0.37, 0.37, 1.1].map((x) => (
        <Cyl key={x} p={[x, 0.8, 1.6]} r={0.1} h={1.6} c="#fafaf9" seg={8} />
      ))}
      <WindowRow w={w - 0.8} d={d - 1.4 - 0.8} y={1.1} n={6} />
      {[-1, 1].map((s) => (
        <B key={s} p={[s * (w / 2 - 0.3), 0.3, d / 2 - 0.3]} s={[0.3, 0.6, 0.3]} c="#15803d" />
      ))}
    </group>
  );
}

function Square({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#9fbf5a" />
      <B p={[0, 0.03, 0.4]} s={[w - 1, 0.01, 1.2]} c="#d6c4a1" />
      {/* Covered grandstand along the back */}
      <group position={[0, 0, -d / 2 + 0.55]}>
        {[0, 1, 2].map((i) => (
          <B key={i} p={[0, 0.15 + i * 0.2, -i * 0.2]} s={[4.4, 0.3 + i * 0.4, 0.4]} c="#e5e7eb" />
        ))}
        <B p={[0, 1.6, -0.2]} s={[4.8, 0.08, 1.2]} c="#15803d" />
        {[-2.2, 2.2].map((x) => (
          <B key={x} p={[x, 0.8, 0.3]} s={[0.08, 1.6, 0.08]} c="#94a3b8" />
        ))}
      </group>
      {/* Flags */}
      {[-3.6, -3.1, 3.1, 3.6].map((x, i) => (
        <group key={x} position={[x, 0, -0.6]}>
          <Cyl p={[0, 1.1, 0]} r={0.025} h={2.2} c="#cbd5e1" />
          <B p={[0.22, 1.95, 0]} s={[0.4, 0.26, 0.02]} c={i % 2 ? '#ffffff' : '#15803d'} />
        </group>
      ))}
    </group>
  );
}

function Secretariat({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <group position={[0, 0, -0.3]}>
        <Block w={w - 1.2} d={d - 1.6} h={4.2} wall="#e7e5e4" roof="#64748b" floors={5} sign="#15803d" />
      </group>
      <Cyl p={[w / 2 - 0.5, 1.3, d / 2 - 0.4]} r={0.03} h={2.6} c="#cbd5e1" />
      <B p={[w / 2 - 0.28, 2.4, d / 2 - 0.4]} s={[0.4, 0.26, 0.02]} c="#15803d" />
    </group>
  );
}

function BankBranch({ w, d }: { w: number; d: number }) {
  const bw = w - 0.4, bd = d - 0.8;
  const front = -0.2 + bd / 2;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      {/* steps up to the banking hall */}
      <B p={[0, 0.06, front + 0.3]} s={[1.6, 0.08, 0.6]} c="#e7e5e4" />
      <B p={[0, 0.12, front + 0.2]} s={[1.4, 0.06, 0.4]} c="#f5f5f4" />
      <B p={[0, 1.25, -0.2]} s={[bw, 2.5, bd]} c="#f8fafc" />
      <B p={[0, 0.12, -0.2]} s={[bw + 0.06, 0.24, bd + 0.06]} c="#9ca3af" />
      <B p={[0, 2.5, -0.2]} s={[bw + 0.12, 0.08, bd + 0.12]} c="#e2e8f0" />
      <Parapet w={bw + 0.12} d={bd + 0.12} y={2.54} c="#f8fafc" h={0.14} cap="#166534" />
      <B p={[0, 2.55, d / 2 - 0.45]} s={[w - 0.3, 0.32, 0.18]} c="#166534" />
      <B p={[0, 1.65, d / 2 - 0.36]} s={[1.25, 0.72, 0.08]} c="#d4af37" />
      <B p={[0, 0.7, d / 2 - 0.35]} s={[0.95, 1.35, 0.1]} c="#166534" />
      {/* glass doors in the green frame */}
      <Glass p={[0, 0.62, d / 2 - 0.295]} s={[0.7, 1.1, 0.02]} />
      <Bays at={spread(bw - 0.4, Math.max(4, Math.round(bw * 1.4)), 0.95)} y={[0.75, 1.75]} z={front} ww={0.34} wh={0.55} hood="#e2e8f0" />
      {[-1, 1].map((sx) => (
        <Bays key={sx} at={spread(bd - 0.4, Math.max(2, Math.round(bd)), 0).map((z) => z - 0.2)} y={[0.75, 1.75]} x={sx * bw / 2} side={sx as 1 | -1} ww={0.34} wh={0.55} hood="#e2e8f0" />
      ))}
      {[-1.25, 1.25].map((x) => <Cyl key={x} p={[x, 1.25, d / 2 - 0.15]} r={0.1} h={2.5} c="#d4af37" />)}
    </group>
  );
}

function Hospital({ w, d }: { w: number; d: number }) {
  const bw = w - 0.4, bd = d - 0.8;
  const front = -0.2 + bd / 2;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <B p={[0, 1.25, -0.2]} s={[bw, 2.5, bd]} c="#f8fafc" />
      <B p={[0, 0.12, -0.2]} s={[bw + 0.06, 0.24, bd + 0.06]} c="#94a3b8" />
      <B p={[0, 1.3, -0.2]} s={[bw + 0.05, 0.06, bd + 0.05]} c="#ccfbf1" />
      <Parapet w={bw + 0.05} d={bd + 0.05} y={2.5} c="#f8fafc" h={0.14} cap="#0f766e" />
      <B p={[0, 2.55, d / 2 - 0.45]} s={[w - 0.3, 0.32, 0.18]} c="#0f766e" />
      <B p={[0, 1.65, d / 2 - 0.36]} s={[1.25, 0.72, 0.08]} c="#ffffff" />
      <B p={[0, 1.65, d / 2 - 0.3]} s={[0.28, 0.95, 0.04]} c="#dc2626" />
      <B p={[0, 1.65, d / 2 - 0.3]} s={[0.95, 0.28, 0.04]} c="#dc2626" />
      <B p={[0, 0.7, d / 2 - 0.35]} s={[0.95, 1.35, 0.1]} c="#0f766e" />
      <Glass p={[0, 0.62, d / 2 - 0.295]} s={[0.7, 1.1, 0.02]} />
      {/* the drop-off canopy over the entrance, on two posts */}
      <B p={[0, 1.38, front + 0.6]} s={[1.6, 0.08, 0.9]} c="#0f766e" />
      {[-0.7, 0.7].map((x) => (
        <B key={x} p={[x, 0.69, front + 0.95]} s={[0.07, 1.38, 0.07]} c="#e2e8f0" />
      ))}
      <Bays at={spread(bw - 0.4, Math.max(4, Math.round(bw * 1.4)), 0.95)} y={[0.75, 1.85]} z={front} ww={0.36} wh={0.5} hood="#ccfbf1" />
      {[-1, 1].map((sx) => (
        <Bays key={sx} at={spread(bd - 0.4, Math.max(2, Math.round(bd)), 0).map((z) => z - 0.2)} y={[0.75, 1.85]} x={sx * bw / 2} side={sx as 1 | -1} ww={0.36} wh={0.5} hood="#ccfbf1" />
      ))}
    </group>
  );
}

function Mall({ w, d }: { w: number; d: number }) {
  const bw = w - 0.6, bd = d - 1.6;
  const panes = Math.max(3, Math.round((w - 1.4) / 0.5));
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#6b7280" />
      {/* parking bay lines */}
      {[-2.1, -0.7, 0.7, 2.1].filter((x) => Math.abs(x) < w / 2 - 0.2).map((x) => (
        <B key={x} p={[x, 0.045, d / 2 - 0.5]} s={[0.04, 0.01, 0.8]} c="#f8fafc" />
      ))}
      <group position={[0, 0, -0.5]}>
        <B p={[0, 1.2, 0]} s={[bw, 2.4, bd]} c="#f1f5f9" />
        <B p={[0, 0.06, 0]} s={[bw + 0.04, 0.12, bd + 0.04]} c="#94a3b8" />
        <B p={[0, 2.45, 0]} s={[bw + 0.2, 0.12, bd + 0.2]} c="#334155" />
        <Parapet w={bw + 0.2} d={bd + 0.2} y={2.51} c="#e2e8f0" h={0.12} cap="#334155" />
        <B p={[0, 1.95, bd / 2 + 0.03]} s={[w - 1, 0.5, 0.05]} c="#dc2626" />
        <B p={[0, 1.95, bd / 2 + 0.06]} s={[w - 1.6, 0.18, 0.02]} c="#fef2f2" />
        <Glass p={[0, 0.8, bd / 2 + 0.02]} s={[w - 1.4, 1.2, 0.04]} />
        {/* mullions across the shopfront, and the canopy over the doors */}
        {Array.from({ length: panes + 1 }, (_, i) => (
          <B key={i} p={[-(w - 1.4) / 2 + ((w - 1.4) / panes) * i, 0.8, bd / 2 + 0.045]} s={[0.04, 1.22, 0.03]} c="#475569" />
        ))}
        <B p={[0, 1.42, bd / 2 + 0.045]} s={[w - 1.36, 0.05, 0.03]} c="#475569" />
        <B p={[0, 1.55, bd / 2 + 0.35]} s={[1.8, 0.07, 0.7]} c="#334155" />
        {/* rooftop air-conditioning plant */}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * bw * 0.25, 2.51, -bd * 0.15]}>
            <B p={[0, 0.15, 0]} s={[0.5, 0.3, 0.4]} c="#cbd5e1" />
            <Cyl p={[0, 0.31, 0]} r={0.12} h={0.02} c="#475569" seg={10} />
          </group>
        ))}
      </group>
      {/* Parked cars */}
      {[-1.4, 0, 1.4].map((x, i) => (
        <group key={x} position={[x, 0, d / 2 - 0.5]} rotation={[0, Math.PI / 2, 0]}>
          <Car c={['#2563eb', '#f8fafc', '#111827'][i]} />
        </group>
      ))}
    </group>
  );
}

function Boutique({ w, d }: { w: number; d: number }) {
  const bw = w - 0.6, bd = d - 1;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#e7e5e4" />
      <group position={[0, 0, -0.3]}>
        <B p={[0, 0.9, 0]} s={[bw, 1.8, bd]} c="#fdf4ff" />
        <B p={[0, 0.07, 0]} s={[bw + 0.04, 0.14, bd + 0.04]} c="#1f2937" />
        <B p={[0, 1.85, 0]} s={[w - 0.4, 0.12, d - 0.8]} c="#1f2937" />
        <Parapet w={w - 0.4} d={d - 0.8} y={1.91} c="#fdf4ff" h={0.12} cap="#d4af37" />
        {/* Gold sign and a big shop window with two mannequins, framed in black */}
        <B p={[0, 1.55, bd / 2 + 0.03]} s={[w - 1.2, 0.35, 0.05]} c="#d4af37" />
        <B p={[0, 1.55, bd / 2 + 0.06]} s={[w - 1.6, 0.12, 0.02]} c="#1f2937" />
        <Glass p={[0, 0.7, bd / 2 + 0.02]} s={[w - 1.4, 1, 0.04]} />
        {[-1, 0, 1].map((k) => (
          <B key={k} p={[k * (w - 1.4) / 2, 0.7, bd / 2 + 0.045]} s={[0.05, 1.04, 0.03]} c="#1f2937" />
        ))}
        <B p={[0, 1.22, bd / 2 + 0.045]} s={[w - 1.36, 0.05, 0.03]} c="#1f2937" />
        <B p={[0, 0.18, bd / 2 + 0.045]} s={[w - 1.36, 0.05, 0.03]} c="#1f2937" />
        {[-0.7, 0.7].map((x, i) => (
          <group key={x} position={[x, 0, bd / 2 - 0.15]}>
            <B p={[0, 0.45, 0]} s={[0.22, 0.7, 0.14]} c={i ? '#047857' : '#1d4ed8'} />
            <B p={[0, 0.88, 0]} s={[0.12, 0.14, 0.12]} c="#f5f5f4" />
          </group>
        ))}
      </group>
      {/* Awning, and two potted plants by the door */}
      <group position={[0, 1.32, d / 2 - 0.35]} rotation={[0.3, 0, 0]}>
        <B p={[0, 0, 0]} s={[w - 0.6, 0.05, 0.55]} c="#be185d" />
      </group>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (w / 2 - 0.55), 0, d / 2 - 0.25]}>
          <Cyl p={[0, 0.12, 0]} r={0.1} rt={0.13} h={0.24} c="#78350f" seg={8} />
          <mesh position={[0, 0.38, 0]} castShadow>
            <icosahedronGeometry args={[0.17, 1]} />
            <meshStandardMaterial color="#15803d" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Museum({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <B p={[0, 0.9, -0.4]} s={[w - 1, 1.8, d - 1.6]} c="#c2410c" />
      <B p={[0, 1.85, -0.4]} s={[w - 0.8, 0.14, d - 1.4]} c="#7c2d12" />
      {[-1.4, -0.7, 0, 0.7, 1.4].map((x) => (
        <B key={x} p={[x, 0.85, (d - 1.6) / 2 - 0.4 + 0.15]} s={[0.18, 1.7, 0.18]} c="#fde68a" />
      ))}
      {/* Nok terracotta head on a plinth */}
      <group position={[0, 0, d / 2 - 0.5]}>
        <B p={[0, 0.3, 0]} s={[0.5, 0.6, 0.5]} c="#e7e5e4" />
        <mesh position={[0, 0.85, 0]} scale={[1, 1.25, 0.9]} castShadow>
          <icosahedronGeometry args={[0.25, 1]} />
          <meshStandardMaterial color="#b45309" flatShading />
        </mesh>
      </group>
    </group>
  );
}

function Park({ w, d }: { w: number; d: number }) {
  const trees: V3[] = [[-4, 0, -1.2], [-2.6, 0, 1.1], [-0.9, 0, -1.3], [2.4, 0, -1.2], [3.9, 0, 0.9], [1.3, 0, 1.3]];
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#7fae4f" />
      <B p={[0, 0.03, 0]} s={[w - 0.4, 0.01, 0.6]} c="#d6c4a1" />
      {trees.map((p, i) => (
        <Tree key={i} p={p} s={0.55 + (i % 3) * 0.1} c={i % 2 ? '#3f7d2a' : '#4d8f31'} />
      ))}
      {/* Gazebo */}
      <group position={[0.6, 0, -0.3]}>
        <Cyl p={[0, 0.06, 0]} r={0.8} h={0.12} c="#e5e7eb" seg={8} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <B key={i} p={[Math.cos((i * Math.PI) / 3) * 0.65, 0.65, Math.sin((i * Math.PI) / 3) * 0.65]} s={[0.07, 1.1, 0.07]} c="#fafaf9" />
        ))}
        <mesh position={[0, 1.45, 0]} castShadow>
          <coneGeometry args={[1.0, 0.6, 8]} />
          <meshStandardMaterial color="#b91c1c" flatShading />
        </mesh>
      </group>
      {[-1.8, 3].map((x) => (
        <B key={x} p={[x, 0.22, 0.6]} s={[0.9, 0.08, 0.3]} c="#92400e" />
      ))}
    </group>
  );
}

function TechHub({ w, d }: { w: number; d: number }) {
  const bw = w - 1, bd = d - 1.4;
  const fins = Math.max(4, Math.round(bw / 0.35));
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#9ca3af" />
      <group position={[0, 0, -0.3]}>
        <B p={[0, 1.5, 0]} s={[bw, 3, bd]} c="#1e293b" />
        <Glass p={[0, 1.5, bd / 2 + 0.02]} s={[w - 1.2, 2.6, 0.04]} />
        <Glass p={[bw / 2 + 0.02, 1.5, 0]} s={[0.04, 2.6, d - 1.6]} />
        {/* green fins up the glass, and a slab at each floor */}
        {Array.from({ length: fins + 1 }, (_, i) => (
          <B key={i} p={[-bw / 2 + 0.1 + ((bw - 0.2) / fins) * i, 1.5, bd / 2 + 0.07]} s={[0.04, 2.7, 0.1]} c="#22c55e" />
        ))}
        {[0.95, 1.85].map((y) => (
          <B key={y} p={[0, y, bd / 2 + 0.03]} s={[bw, 0.06, 0.06]} c="#334155" />
        ))}
        {[0.95, 1.85].map((y) => (
          <B key={y} p={[bw / 2 + 0.03, y, 0]} s={[0.06, 0.06, bd]} c="#334155" />
        ))}
        <B p={[0, 3.05, 0]} s={[w - 0.8, 0.1, d - 1.2]} c="#22c55e" />
        {/* solar panels on the roof */}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * bw * 0.22, 3.2, 0]} rotation={[-0.35, 0, 0]}>
            <B p={[0, 0, 0]} s={[bw * 0.38, 0.03, bd * 0.6]} c="#1e3a8a" />
          </group>
        ))}
        {/* entrance canopy */}
        <B p={[0, 0.9, bd / 2 + 0.35]} s={[1.2, 0.05, 0.6]} c="#22c55e" />
      </group>
    </group>
  );
}

function Station({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#9ca3af" />
      {/* Rails */}
      {[-1.9, -1.4].map((z) => (
        <B key={z} p={[0, 0.06, z]} s={[w, 0.05, 0.06]} c="#57534e" />
      ))}
      {/* Train: green & white */}
      <group position={[-0.6, 0, -1.65]}>
        {[-2.2, 0, 2.2].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <B p={[0, 0.6, 0]} s={[2.1, 0.9, 0.8]} c="#f8fafc" />
            <B p={[0, 0.35, 0.41]} s={[2.1, 0.12, 0.02]} c="#15803d" />
            <Win p={[0, 0.75, 0.41]} s={[1.7, 0.25, 0.02]} />
          </group>
        ))}
        <B p={[3.45, 0.55, 0]} s={[0.3, 0.8, 0.78]} c="#15803d" />
      </group>
      {/* Platform & canopy */}
      <B p={[0, 0.2, -0.5]} s={[w - 0.5, 0.4, 1]} c="#d6d3d1" />
      <B p={[0, 1.6, -0.6]} s={[w - 1, 0.08, 1.4]} c="#15803d" />
      {[-3, -1, 1, 3].map((x) => (
        <B key={x} p={[x, 0.95, -0.5]} s={[0.08, 1.3, 0.08]} c="#94a3b8" />
      ))}
      {/* Terminal */}
      <group position={[0, 0, 1.2]}>
        <B p={[0, 0.8, 0]} s={[4, 1.6, 1.6]} c="#f5f5f4" />
        <B p={[0, 1.7, 0]} s={[4.3, 0.18, 1.9]} c="#15803d" />
        <WindowRow w={4} d={1.6} y={0.95} n={5} />
      </group>
    </group>
  );
}

function Poly({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#c98b5e" />
      <group position={[-1.2, 0, -0.6]}>
        <Block w={4.6} d={2.2} h={2.4} wall="#fef3c7" roof="#1e3a8a" floors={3} />
      </group>
      <group position={[2.6, 0, -0.6]}>
        <Block w={2} d={2.6} h={1.6} wall="#fde68a" roof="#1e3a8a" floors={2} />
      </group>
      {/* Gate arch */}
      <group position={[0.4, 0, d / 2 - 0.4]}>
        <B p={[-0.9, 0.7, 0]} s={[0.25, 1.4, 0.25]} c="#1e3a8a" />
        <B p={[0.9, 0.7, 0]} s={[0.25, 1.4, 0.25]} c="#1e3a8a" />
        <B p={[0, 1.5, 0]} s={[2.2, 0.35, 0.2]} c="#facc15" />
      </group>
      <Tree p={[-3.3, 0, 1.6]} s={0.45} />
      <Tree p={[3.4, 0, 1.6]} s={0.45} />
    </group>
  );
}

/** Glass for vehicles: the window material (it lights up at night with the rest) without a house window's frame and sill. */
function Glass({ p, s }: { p: V3; s: V3 }) {
  return (
    <mesh position={p} material={windowMat}>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** A box narrowing toward its top (a car's glasshouse): `w`×`d` at the foot, `top` of that at the head. */
function Frustum({ p, w, h, d, top, c, glass }: { p: V3; w: number; h: number; d: number; top: number; c?: string; glass?: boolean }) {
  const k = 1 / Math.SQRT2;
  return (
    <group position={p} scale={[w * k, h, d * k]}>
      <mesh rotation={[0, Math.PI / 4, 0]} material={glass ? windowMat : undefined} castShadow={!glass}>
        <cylinderGeometry args={[top, 1, 1, 4, 1]} />
        {!glass && <meshStandardMaterial color={c} flatShading />}
      </mesh>
    </group>
  );
}

const WHEELS = (x: number, z: number, r: number, t: number) =>
  [[-x, -z], [x, -z], [-x, z], [x, z]].map(([wx, wz], i) => (
    <group key={i} position={[wx, r, wz]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, t, 12]} />
        <meshStandardMaterial color="#0b0b0c" />
      </mesh>
      <mesh position={[Math.sign(wx) * (t / 2 + 0.005), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r * 0.55, r * 0.55, 0.02, 8]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
    </group>
  ));

/** A danfo: the flat-fronted minibus, windows all round between pillars, a roof rack and a stripe down the side. */
function Bus({ c = '#f8fafc', stripe = '#15803d' }: { c?: string; stripe?: string }) {
  const dark = '#1f2937';
  return (
    <group>
      <B p={[0, 0.38, 0]} s={[0.84, 0.44, 2]} c={c} />
      <B p={[0, 0.52, 0]} s={[0.86, 0.08, 2.02]} c={stripe} />
      <Glass p={[0, 0.74, 0.01]} s={[0.82, 0.3, 1.9]} />
      {/* the pillars between the windows, front to back */}
      {[-0.5, -0.05, 0.4].map((z) => (
        <B key={z} p={[0, 0.74, z]} s={[0.845, 0.3, 0.06]} c={c} />
      ))}
      {/* corner posts, leaving the windscreen and back window clear */}
      {[-0.39, 0.39].flatMap((x) => [-0.95, 0.95].map((z) => (
        <B key={`${x}${z}`} p={[x, 0.74, z]} s={[0.07, 0.3, 0.1]} c={c} />
      )))}
      <B p={[0, 0.74, 0.95]} s={[0.04, 0.3, 0.1]} c={c} />
      <B p={[0, 0.94, 0]} s={[0.84, 0.1, 2]} c={c} />
      <B p={[0, 0.995, 0]} s={[0.78, 0.02, 1.9]} c={shade(c, 0.9)} />
      {/* roof rack */}
      {[-0.32, 0.32].map((x) => (
        <B key={x} p={[x, 1.05, -0.1]} s={[0.035, 0.035, 1.5]} c={dark} />
      ))}
      {[-0.7, -0.1, 0.5].map((z) => (
        <B key={z} p={[0, 1.05, z]} s={[0.68, 0.03, 0.035]} c={dark} />
      ))}
      {/* lights, grille, bumpers and mirrors */}
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          <B p={[x, 0.36, 1.005]} s={[0.14, 0.08, 0.02]} c="#fef9c3" e="#fde68a" />
          <B p={[x, 0.4, -1.005]} s={[0.1, 0.12, 0.02]} c="#fecaca" e="#dc2626" />
          <B p={[x * 1.55, 0.72, 0.9]} s={[0.04, 0.1, 0.04]} c={dark} />
        </group>
      ))}
      <B p={[0, 0.36, 1.005]} s={[0.3, 0.08, 0.02]} c={dark} />
      <B p={[0, 0.17, 1.02]} s={[0.86, 0.08, 0.06]} c={dark} />
      <B p={[0, 0.17, -1.02]} s={[0.86, 0.08, 0.06]} c={dark} />
      <B p={[0, 0.2, 0]} s={[0.86, 0.06, 1.4]} c={dark} />
      {WHEELS(0.38, 0.68, 0.16, 0.1)}
    </group>
  );
}

export function Car({ c = '#2563eb' }: { c?: string }) {
  const dark = '#1f2937';
  return (
    <group>
      {/* Body: a long lower shell, bonnet and boot a step up, and the glasshouse narrowing to a painted roof */}
      <B p={[0, 0.27, 0]} s={[0.74, 0.24, 1.46]} c={c} />
      <B p={[0, 0.41, 0.46]} s={[0.7, 0.05, 0.52]} c={c} />
      <B p={[0, 0.41, -0.56]} s={[0.7, 0.05, 0.34]} c={c} />
      <B p={[0, 0.42, -0.08]} s={[0.72, 0.07, 0.72]} c={c} />
      <Frustum p={[0, 0.58, -0.08]} w={0.66} h={0.22} d={0.8} top={0.72} glass />
      <B p={[0, 0.7, -0.08]} s={[0.5, 0.04, 0.56]} c={c} />
      {/* the pillar between the doors */}
      <B p={[0, 0.57, -0.06]} s={[0.66, 0.2, 0.05]} c={c} />
      {/* Lights, grille, plates and bumpers */}
      {[-0.25, 0.25].map((x) => (
        <group key={x}>
          <B p={[x, 0.33, 0.735]} s={[0.15, 0.07, 0.02]} c="#fef9c3" e="#fde68a" />
          <B p={[x, 0.33, -0.735]} s={[0.15, 0.07, 0.02]} c="#fecaca" e="#dc2626" />
          <B p={[x * 1.45, 0.5, 0.2]} s={[0.08, 0.05, 0.05]} c={c} />
        </group>
      ))}
      <B p={[0, 0.32, 0.735]} s={[0.28, 0.06, 0.02]} c={dark} />
      {[0.76, -0.76].map((z) => (
        <group key={z}>
          <B p={[0, 0.17, z * 0.98]} s={[0.76, 0.08, 0.06]} c="#374151" />
          <B p={[0, 0.23, z * 1.0]} s={[0.2, 0.05, 0.01]} c="#f8fafc" />
        </group>
      ))}
      {/* sills, and dark arches over the wheels */}
      <B p={[0, 0.17, 0]} s={[0.76, 0.05, 0.62]} c={dark} />
      {[-0.46, 0.46].map((z) => (
        <B key={z} p={[0, 0.28, z]} s={[0.755, 0.1, 0.36]} c={dark} />
      ))}
      {WHEELS(0.37, 0.46, 0.15, 0.1)}
    </group>
  );
}

function MotorPark({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#57534e" />
      {/* Ticket shed */}
      <group position={[-w / 2 + 1.3, 0, -1.2]}>
        <B p={[0, 0.6, 0]} s={[2, 1.2, 1.4]} c="#fef3c7" />
        <B p={[0, 1.25, 0]} s={[2.3, 0.1, 1.7]} c="#b91c1c" />
      </group>
      {[0, 1.2, 2.4].map((x, i) => (
        <group key={x} position={[x - 0.6, 0, -1.1]}>
          <Bus c={i === 1 ? '#facc15' : '#f8fafc'} />
        </group>
      ))}
      {[-2.6, -1.6, 2.2, 3.2].map((x) => (
        <group key={x} position={[x, 0, 1.2]} scale={0.6} rotation={[0, Math.PI, 0]}>
          <Keke />
        </group>
      ))}
    </group>
  );
}

function Stadium({ w, d }: { w: number; d: number }) {
  const rx = w / 2 - 0.4;
  const rz = d / 2 - 0.4;
  const n = 22;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#9ca3af" />
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[rx - 0.9, rz - 0.9, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color="#b45309" />
      </mesh>
      <B p={[0, 0.07, 0]} s={[rx * 1.05, 0.02, rz * 0.9]} c="#4ade80" />
      <B p={[0, 0.085, 0]} s={[0.05, 0.01, rz * 0.9]} c="#fff" />
      {/* Stands: an oval of slanted blocks */}
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * rx;
        const z = Math.sin(a) * rz;
        const seg = ((2 * Math.PI * Math.max(rx, rz)) / n) * 1.05;
        const gap = i === Math.round(n / 4); // entrance on the +z side
        if (gap) return null;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, -a + Math.PI / 2, 0]}>
            <B p={[0, 0.55, 0]} s={[seg, 1.1, 0.7]} c={i % 2 ? '#15803d' : '#f8fafc'} />
          </group>
        );
      })}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <group key={i} position={[sx * (rx + 0.1), 0, sz * (rz + 0.1)]}>
          <Cyl p={[0, 1.6, 0]} r={0.05} h={3.2} c="#94a3b8" />
          <mesh position={[0, 3.25, 0]} material={lampMat}>
            <boxGeometry args={[0.5, 0.3, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Nda({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#a3b18a" />
      {/* Parade ground */}
      <B p={[0.6, 0.05, 0.6]} s={[w - 2.6, 0.02, d - 2.6]} c="#c8b48a" />
      {[-1, 0, 1].map((r) =>
        [-1.2, -0.4, 0.4, 1.2].map((c) => (
          <group key={`${r}${c}`} position={[0.6 + c, 0, 0.6 + r * 0.6]}>
            <B p={[0, 0.3, 0]} s={[0.18, 0.6, 0.14]} c="#4d5d3a" />
            <B p={[0, 0.66, 0]} s={[0.16, 0.12, 0.16]} c="#1f2937" />
          </group>
        )),
      )}
      {/* Barracks blocks along the back and side */}
      <group position={[0, 0, -d / 2 + 0.7]}>
        <B p={[0, 0.55, 0]} s={[w - 0.6, 1.1, 1]} c="#e7dfc9" />
        <B p={[0, 1.15, 0]} s={[w - 0.4, 0.1, 1.2]} c="#4d5d3a" />
      </group>
      <group position={[-w / 2 + 0.7, 0, 0.5]}>
        <B p={[0, 0.55, 0]} s={[1, 1.1, d - 2.2]} c="#e7dfc9" />
        <B p={[0, 1.15, 0]} s={[1.2, 0.1, d - 2]} c="#4d5d3a" />
      </group>
      <group position={[w / 2 - 0.5, 0, d / 2 - 0.5]}>
        <B p={[0, 1.4, 0]} s={[0.05, 2.8, 0.05]} c="#cbd5e1" />
        <B p={[0.15, 2.6, 0]} s={[0.12, 0.3, 0.02]} c="#15803d" />
        <B p={[0.27, 2.6, 0]} s={[0.12, 0.3, 0.02]} c="#ffffff" />
        <B p={[0.39, 2.6, 0]} s={[0.12, 0.3, 0.02]} c="#15803d" />
      </group>
    </group>
  );
}

function Hotel({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <group position={[-0.4, 0, -0.5]}>
        <Block w={w - 1.6} d={d - 2} h={4.6} wall="#fbf7ef" roof="#b45309" floors={6} sign="#b45309" />
      </group>
      {/* Pool by the side */}
      <B p={[w / 2 - 0.65, 0.05, 0.4]} s={[1, 0.06, 2.2]} c="#38bdf8" e="#0ea5e9" />
      <B p={[w / 2 - 0.65, 0.03, 0.4]} s={[1.3, 0.04, 2.5]} c="#f5f5f4" />
      {[-0.8, 0.8].map((x) => (
        <Tree key={x} p={[x, 0, d / 2 - 0.4]} s={0.35} c="#2f7d32" />
      ))}
    </group>
  );
}

function Arewa({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#9fbf5a" />
      <group position={[0, 0, -0.4]}>
        <B p={[0, 0.8, 0]} s={[w - 1, 1.6, d - 1.6]} c="#fbfaf6" />
        <B p={[0, 1.66, 0]} s={[w - 0.8, 0.12, d - 1.4]} c="#15803d" />
        <Gable p={[0, 1.72, 0]} w={2} d={1.6} h={0.5} c="#15803d" wall="#fbfaf6" eave={0.1} />
        {/* Arched verandah */}
        {[-1.4, -0.7, 0, 0.7, 1.4].map((x) => (
          <B key={x} p={[x, 0.6, (d - 1.6) / 2 + 0.25]} s={[0.15, 1.2, 0.15]} c="#f5f5f4" />
        ))}
        <B p={[0, 1.25, (d - 1.6) / 2 + 0.25]} s={[w - 1, 0.12, 0.3]} c="#f5f5f4" />
        <WindowRow w={w - 1} d={d - 1.6} y={0.9} n={5} />
      </group>
      <Tree p={[-w / 2 + 0.5, 0, d / 2 - 0.4]} s={0.4} />
    </group>
  );
}

function Horse({ c = '#7c2d12' }: { c?: string }) {
  return (
    <group>
      <B p={[0, 0.55, 0]} s={[0.22, 0.25, 0.7]} c={c} />
      <B p={[0, 0.8, 0.38]} s={[0.14, 0.35, 0.16]} c={c} />
      <B p={[0, 0.92, 0.5]} s={[0.12, 0.12, 0.22]} c={c} />
      {[[-0.08, -0.28], [0.08, -0.28], [-0.08, 0.28], [0.08, 0.28]].map(([x, z], i) => (
        <B key={i} p={[x, 0.22, z]} s={[0.06, 0.44, 0.06]} c="#3f1d0b" />
      ))}
      <B p={[0, 0.72, -0.05]} s={[0.24, 0.05, 0.25]} c="#1d4ed8" />
    </group>
  );
}

function Polo({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#7fbf4f" />
      {/* White rails round the field */}
      {[-1, 1].map((s) => (
        <B key={`x${s}`} p={[(s * (w - 0.3)) / 2, 0.3, 0]} s={[0.06, 0.06, d - 0.3]} c="#fff" />
      ))}
      {[-1, 1].map((s) => (
        <B key={`z${s}`} p={[0, 0.3, (s * (d - 0.3)) / 2]} s={[w - 0.3, 0.06, 0.06]} c="#fff" />
      ))}
      {[[-1, -1.5, 0.6], [1.2, 0.5, -2.2], [-0.4, 1.8, 2.6]].map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
          <Horse c={['#7c2d12', '#1f2937', '#a16207'][i]} />
        </group>
      ))}
      {/* Clubhouse stand */}
      <group position={[w / 2 - 0.7, 0, -d / 2 + 1.5]}>
        <B p={[0, 0.5, 0]} s={[1, 1, 2]} c="#fefce8" />
        <B p={[-0.2, 1.05, 0]} s={[1.5, 0.1, 2.3]} c="#15803d" />
      </group>
    </group>
  );
}

function Mill({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#9ca3af" />
      <group position={[0, 0, -0.4]}>
        <B p={[0, 0.8, 0]} s={[w - 0.8, 1.6, d - 1.4]} c="#d6cfc2" />
        {/* Saw-tooth factory roof */}
        {Array.from({ length: 5 }, (_, i) => (
          <group key={i} position={[-((w - 0.8) / 2) + 0.6 + i * ((w - 2) / 4), 1.6, 0]}>
            <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1]}>
              <cylinderGeometry args={[0.6, 0.6, d - 1.4, 3, 1]} />
              <meshStandardMaterial color="#8b929e" flatShading />
            </mesh>
          </group>
        ))}
        <B p={[0, 1.25, (d - 1.4) / 2 + 0.02]} s={[2.6, 0.35, 0.05]} c="#1d4ed8" />
        <WindowRow w={w - 0.8} d={d - 1.4} y={0.8} n={6} />
      </group>
      <Cyl p={[w / 2 - 0.6, 2, -d / 2 + 0.6]} r={0.28} rt={0.2} h={4} c="#9a3412" />
      {[-1.5, 1.5].map((x) => (
        <Cyl key={x} p={[x, 0.3, d / 2 - 0.4]} r={0.25} h={0.6} c={x < 0 ? '#dc2626' : '#16a34a'} />
      ))}
    </group>
  );
}

/* ---------- Landmarks (not enterable) ---------- */

function GovHouse({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#8fbf5a" />
      {/* Perimeter wall + gate */}
      <B p={[0, 0.4, -d / 2 + 0.05]} s={[w, 0.8, 0.1]} c="#f5f5f4" />
      <B p={[-w / 2 + 0.05, 0.4, 0]} s={[0.1, 0.8, d]} c="#f5f5f4" />
      <B p={[w / 2 - 0.05, 0.4, 0]} s={[0.1, 0.8, d]} c="#f5f5f4" />
      <B p={[-w / 4 - 0.35, 0.4, d / 2 - 0.05]} s={[w / 2 - 0.7, 0.8, 0.1]} c="#f5f5f4" />
      <B p={[w / 4 + 0.35, 0.4, d / 2 - 0.05]} s={[w / 2 - 0.7, 0.8, 0.1]} c="#f5f5f4" />
      <group position={[0, 0, -0.5]}>
        <B p={[0, 0.9, 0]} s={[3.6, 1.8, 2]} c="#fbfaf6" />
        <B p={[0, 1.86, 0]} s={[3.8, 0.12, 2.2]} c="#b45309" />
        {[-1, -0.33, 0.33, 1].map((x) => (
          <Cyl key={x} p={[x, 0.8, 1.15]} r={0.09} h={1.6} c="#fafaf9" seg={8} />
        ))}
        <B p={[0, 1.65, 1.15]} s={[2.4, 0.15, 0.4]} c="#f5f5f4" />
        <WindowRow w={3.6} d={2} y={1.1} n={5} />
      </group>
      <B p={[0, 0.03, d / 2 - 1]} s={[0.8, 0.02, 2]} c="#d6d3d1" />
      <group position={[w / 2 - 0.6, 0, d / 2 - 0.6]}>
        <Cyl p={[0, 1.3, 0]} r={0.03} h={2.6} c="#cbd5e1" />
        <B p={[0.15, 2.4, 0]} s={[0.12, 0.3, 0.02]} c="#15803d" />
        <B p={[0.27, 2.4, 0]} s={[0.12, 0.3, 0.02]} c="#ffffff" />
        <B p={[0.39, 2.4, 0]} s={[0.12, 0.3, 0.02]} c="#15803d" />
      </group>
    </group>
  );
}

function Flyover({ w }: { w: number; d: number }) {
  const deckY = 1.15;
  const ramp = 2.6;
  const flat = w - ramp * 2;
  const slope = Math.atan2(deckY, ramp);
  const rampLen = Math.hypot(deckY, ramp);
  return (
    <group position={[0, 0, 0.5]}>
      <B p={[0, deckY, 0]} s={[flat, 0.18, 1.7]} c="#9ca3af" />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (flat / 2 + ramp / 2), deckY / 2, 0]} rotation={[0, 0, -s * slope]} castShadow>
          <boxGeometry args={[rampLen, 0.18, 1.7]} />
          <meshStandardMaterial color="#9ca3af" flatShading />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <B key={`rail${s}`} p={[0, deckY + 0.2, s * 0.85]} s={[flat, 0.25, 0.08]} c="#e5e7eb" />
      ))}
      {[-flat / 2 + 0.3, 0, flat / 2 - 0.3].map((x) => (
        <B key={x} p={[x, deckY / 2, 0]} s={[0.3, deckY, 0.6]} c="#78716c" />
      ))}
      <B p={[0, deckY + 0.1, 0]} s={[flat - 0.4, 0.01, 0.06]} c="#facc15" />
    </group>
  );
}

function Golf({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#6dbb4a" />
      {[[-1.5, -1.6], [1.4, 1.2], [-0.6, 1.9]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.7, 16]} />
            <meshStandardMaterial color="#86d65f" />
          </mesh>
          <B p={[0, 0.45, 0]} s={[0.03, 0.9, 0.03]} c="#f8fafc" />
          <B p={[0.12, 0.8, 0]} s={[0.22, 0.14, 0.02]} c="#dc2626" />
        </group>
      ))}
      <mesh position={[1.2, 0.03, -1.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 12]} />
        <meshStandardMaterial color="#e7d8a8" />
      </mesh>
      <Tree p={[w / 2 - 0.6, 0, -d / 2 + 0.6]} s={0.5} />
      <Tree p={[-w / 2 + 0.6, 0, 0]} s={0.45} />
      <group position={[-w / 2 + 1, 0, -d / 2 + 0.8]}>
        <B p={[0, 0.5, 0]} s={[1.4, 1, 1]} c="#fefce8" />
        <B p={[0, 1.05, 0]} s={[1.6, 0.1, 1.2]} c="#15803d" />
      </group>
    </group>
  );
}

function TradeFair({ w, d }: { w: number; d: number }) {
  const tents = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b'];
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6c4a1" />
      {tents.map((c, i) => (
        <group key={c} position={[-w / 2 + 1.1 + (i % 2) * 2.4, 0, -d / 2 + 1.2 + Math.floor(i / 2) * 2.4]}>
          <B p={[0, 0.5, 0]} s={[1.6, 1, 1.6]} c="#f8fafc" />
          <mesh position={[0, 1.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.25, 0.7, 4]} />
            <meshStandardMaterial color={c} flatShading />
          </mesh>
        </group>
      ))}
      {/* Ferris wheel */}
      <group position={[w / 2 - 1.3, 0, 0]}>
        <B p={[-0.25, 1.1, 0]} s={[0.08, 2.2, 0.08]} c="#64748b" />
        <B p={[0.25, 1.1, 0]} s={[0.08, 2.2, 0.08]} c="#64748b" />
        <mesh position={[0, 2.1, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[1, 0.05, 6, 20]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <B key={i} p={[0, 2.1 + Math.sin((i / 8) * Math.PI * 2), Math.cos((i / 8) * Math.PI * 2)]} s={[0.2, 0.18, 0.18]} c={tents[i % 4]} />
        ))}
      </group>
    </group>
  );
}

function Nightclub({ w, d }: { w: number; d: number }) {
  return (
    <group>
      {/* Dark luxury pavement base */}
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#0f172a" />

      {/* Main Luxury Nightclub Complex Building */}
      <group position={[0, 0, -0.6]}>
        {/* Core club structure */}
        <B p={[0, 1.6, 0]} s={[4.8, 3.2, 3.4]} c="#09090b" />
        {/* Gold parapet crown trim */}
        <B p={[0, 3.25, 0]} s={[4.96, 0.12, 3.56]} c="#eab308" e="#ca8a04" />

        {/* Vertical Neon Light Fins along the facade */}
        {[-2.1, -1.5, -0.9, 0.9, 1.5, 2.1].map((x, i) => (
          <group key={x}>
            <B p={[x, 1.6, 1.72]} s={[0.08, 2.8, 0.05]} c={i % 2 === 0 ? '#06b6d4' : '#ec4899'} e={i % 2 === 0 ? '#06b6d4' : '#ec4899'} />
            <B p={[x, 1.6, 1.7]} s={[0.16, 2.86, 0.02]} c="#18181b" />
          </group>
        ))}

        {/* Large "THE CASTLE" Neon Marquee Blade Sign */}
        <group position={[0, 2.65, 1.75]}>
          <B p={[0, 0, 0]} s={[3.6, 0.75, 0.08]} c="#020617" />
          <B p={[0, 0, 0.05]} s={[3.66, 0.81, 0.02]} c="#eab308" e="#ca8a04" />
          <B p={[0, 0.08, 0.06]} s={[3.0, 0.28, 0.02]} c="#ec4899" e="#ec4899" />
          <B p={[0, -0.2, 0.06]} s={[1.8, 0.12, 0.02]} c="#06b6d4" e="#06b6d4" />
        </group>

        {/* VIP Entrance Canopy / Portico */}
        <group position={[0, 1.55, 1.7]} rotation={[0, 0, 0]}>
          <B p={[0, 0, 0.6]} s={[2.2, 0.1, 1.2]} c="#020617" />
          <B p={[0, 0.06, 0.6]} s={[2.24, 0.04, 1.24]} c="#eab308" e="#ca8a04" />
          <Cyl p={[-1.0, -0.75, 1.15]} r={0.05} h={1.5} c="#eab308" e="#ca8a04" />
          <Cyl p={[1.0, -0.75, 1.15]} r={0.05} h={1.5} c="#eab308" e="#ca8a04" />
          <Cyl p={[-0.5, -0.06, 0.6]} r={0.08} h={0.02} c="#fef08a" e="#fef08a" />
          <Cyl p={[0.5, -0.06, 0.6]} r={0.08} h={0.02} c="#fef08a" e="#fef08a" />
        </group>

        {/* Smoked glass double doors */}
        <B p={[0, 0.7, 1.72]} s={[1.3, 1.4, 0.04]} c="#1e293b" />
        <B p={[-0.05, 0.7, 1.75]} s={[0.02, 0.3, 0.02]} c="#eab308" />
        <B p={[0.05, 0.7, 1.75]} s={[0.02, 0.3, 0.02]} c="#eab308" />

        {/* Roof Sky Searchlights / Lasers */}
        <group position={[-1.6, 3.4, -0.5]} rotation={[0.4, 0.3, 0]}>
          <Cyl p={[0, 0, 0]} r={0.16} h={0.25} c="#1e293b" />
          <Cyl p={[0, 0.14, 0]} r={0.14} h={0.04} c="#06b6d4" e="#06b6d4" />
        </group>
        <group position={[1.6, 3.4, -0.5]} rotation={[0.4, -0.3, 0]}>
          <Cyl p={[0, 0, 0]} r={0.16} h={0.25} c="#1e293b" />
          <Cyl p={[0, 0.14, 0]} r={0.14} h={0.04} c="#ec4899" e="#ec4899" />
        </group>
      </group>

      {/* Red Carpet VIP Entrance Runner */}
      <B p={[0, 0.045, 1.65]} s={[1.2, 0.03, 1.7]} c="#991b1b" />

      {/* Polished Brass Stanchions & Velvet Ropes */}
      {[-0.7, 0.7].map((x) => (
        <group key={x}>
          {[1.0, 1.6, 2.2].map((z) => (
            <group key={z} position={[x, 0, z]}>
              <Cyl p={[0, 0.02, 0]} r={0.08} h={0.03} c="#ca8a04" />
              <Cyl p={[0, 0.28, 0]} r={0.028} h={0.52} c="#eab308" e="#ca8a04" />
              <mesh position={[0, 0.56, 0]}>
                <sphereGeometry args={[0.045, 8, 8]} />
                <meshStandardMaterial color="#facc15" />
              </mesh>
            </group>
          ))}
          <B p={[x, 0.45, 1.3]} s={[0.025, 0.025, 0.58]} c="#7f1d1d" />
          <B p={[x, 0.45, 1.9]} s={[0.025, 0.025, 0.58]} c="#7f1d1d" />
        </group>
      ))}

      {/* VIP Parked Luxury Black SUV */}
      <group position={[2.0, 0, 1.3]}>
        <B p={[0, 0.35, 0]} s={[0.92, 0.48, 1.7]} c="#09090b" />
        <B p={[0, 0.72, -0.1]} s={[0.82, 0.42, 1.1]} c="#18181b" />
        <B p={[0, 0.72, 0.46]} s={[0.76, 0.34, 0.02]} c="#020617" />
        <B p={[0, 0.72, -0.66]} s={[0.76, 0.34, 0.02]} c="#020617" />
        {[[-0.46, -0.55], [0.46, -0.55], [-0.46, 0.55], [0.46, 0.55]].map(([wx, wz], wi) => (
          <group key={wi} position={[wx, 0.16, wz]} rotation={[0, 0, Math.PI / 2]}>
            <Cyl p={[0, 0, 0]} r={0.16} h={0.12} c="#18181b" />
            <Cyl p={[0, 0.06, 0]} r={0.09} h={0.02} c="#cbd5e1" />
          </group>
        ))}
        <Cyl p={[-0.32, 0.42, 0.86]} r={0.06} h={0.02} c="#f8fafc" e="#ffffff" />
        <Cyl p={[0.32, 0.42, 0.86]} r={0.06} h={0.02} c="#f8fafc" e="#ffffff" />
        <B p={[-0.34, 0.42, -0.86]} s={[0.14, 0.06, 0.02]} c="#ef4444" e="#dc2626" />
        <B p={[0.34, 0.42, -0.86]} s={[0.14, 0.06, 0.02]} c="#ef4444" e="#dc2626" />
      </group>

      {/* Decorative Nightclub Landscaping Planters on Left Side */}
      <group position={[-2.1, 0, 1.3]}>
        <B p={[0, 0.25, 0]} s={[0.7, 0.5, 1.6]} c="#1e293b" />
        <B p={[0, 0.52, 0]} s={[0.74, 0.06, 1.64]} c="#eab308" />
        <Tree p={[0, 0.5, -0.4]} s={0.35} c="#15803d" />
        <Tree p={[0, 0.5, 0.4]} s={0.35} c="#15803d" />
      </group>
    </group>
  );
}

/* ---------- Abuja ---------- */

/** A lump of bare granite: a low-poly ball squashed to size. */
function Boulder({ p, s, c = '#8d867b', yaw = 0 }: { p: V3; s: V3; c?: string; yaw?: number }) {
  return (
    <mesh position={p} scale={s} rotation={[0, yaw, 0]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={c} flatShading roughness={0.95} />
    </mesh>
  );
}

/** Aso Rock: the 400 m granite outcrop behind the Three Arms Zone, bush at its foot. */
function AsoRock({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#7fae58" />
      <Boulder p={[-0.4, 1.2, -0.3]} s={[w * 0.4, 3.9, d * 0.36]} yaw={0.3} />
      <Boulder p={[w * 0.24, 0.9, 0.2]} s={[w * 0.24, 2.7, d * 0.3]} c="#978f83" yaw={1.1} />
      <Boulder p={[-w * 0.3, 0.6, 0.5]} s={[w * 0.2, 1.9, d * 0.27]} c="#7f786e" yaw={2} />
      <Boulder p={[w * 0.05, 0.3, d * 0.3]} s={[w * 0.18, 1.0, d * 0.14]} c="#9a9388" yaw={0.7} />
      {/* Rain streaks down the bare face. */}
      {[-1.5, -0.6, 0.5, 1.3].map((x, i) => (
        <B key={x} p={[x - 0.4, 2.3 - i * 0.2, d * 0.2 + 0.25 - Math.abs(x) * 0.22]} s={[0.12, 2.2, 0.05]} c="#5f5a53" />
      ))}
      {[[-w / 2 + 0.7, d / 2 - 0.6], [-w / 2 + 1.9, d / 2 - 0.4], [w / 2 - 0.8, d / 2 - 0.7], [w / 2 - 2, d / 2 - 0.4], [0.4, d / 2 - 0.35], [-w / 2 + 0.6, -d / 2 + 0.8], [w / 2 - 0.7, -d / 2 + 0.9]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0, z]} s={0.42 + (i % 3) * 0.08} c={i % 2 ? '#2f7d3b' : '#3f8f45'} />
      ))}
    </group>
  );
}

/** Zuma Rock: the lone monolith on the road to Kaduna, with the dark streaks people read as a face. */
function ZumaRock({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#8fb963" />
      <Cyl p={[0, 1.3, -0.1]} r={w * 0.36} rt={w * 0.31} h={2.6} c="#8a8479" seg={9} />
      <mesh position={[0, 2.6, -0.1]} scale={[w * 0.31, 1.25, w * 0.31]} castShadow>
        <sphereGeometry args={[1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#8a8479" flatShading roughness={0.95} />
      </mesh>
      {/* The face: two eyes, a nose and a mouth of rain-stained rock. */}
      {[[-0.55, 2.35, 0.3, 0.9], [0.45, 2.3, 0.28, 1.0], [-0.05, 1.7, 0.2, 1.1], [0.05, 0.95, 0.75, 0.3]].map(([x, y, sx, sy], i) => (
        <B key={i} p={[x, y, w * 0.33 - 0.1 - Math.abs(x) * 0.25]} s={[sx, sy, 0.06]} c="#56514b" />
      ))}
      <Boulder p={[w * 0.36, 0.25, d * 0.2]} s={[0.7, 0.6, 0.6]} c="#9a9388" />
      {[[-w / 2 + 0.5, d / 2 - 0.5], [w / 2 - 0.5, -d / 2 + 0.6], [-w / 2 + 0.7, -d / 2 + 0.6]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0, z]} s={0.4} c="#3f8f45" />
      ))}
    </group>
  );
}

/** Abuja City Gate: twin pylons and a beam over Airport Road. The road runs through along x. */
function CityGate({ d }: { w: number; d: number }) {
  const span = d - 0.7;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, (s * span) / 2]}>
          <B p={[0, 0.12, 0]} s={[1.1, 0.24, 0.7]} c="#d6d3d1" />
          <B p={[0, 1.5, 0]} s={[0.7, 2.6, 0.42]} c="#fafaf9" />
          <B p={[0, 1.5, s * 0.22]} s={[0.24, 2.6, 0.03]} c="#15803d" />
          <B p={[0, 3.05, 0]} s={[0.9, 0.5, 0.56]} c="#15803d" />
        </group>
      ))}
      <B p={[0, 2.62, 0]} s={[0.5, 0.36, span]} c="#fafaf9" />
      <B p={[0, 2.86, 0]} s={[0.62, 0.12, span + 0.5]} c="#15803d" />
      {/* Name plates, facing drivers both ways. */}
      {[-1, 1].map((s) => (
        <B key={s} p={[s * 0.27, 2.62, 0]} s={[0.03, 0.24, span * 0.55]} c="#facc15" />
      ))}
    </group>
  );
}

/** The National Mosque: one great golden dome, four small ones, and a minaret at each corner. */
function NationalMosque({ w, d }: { w: number; d: number }) {
  const mx = w / 2 - 0.45;
  const mz = d / 2 - 0.45;
  return (
    <group>
      <B p={[0, 0.03, 0]} s={[w, 0.06, d]} c="#e7e5e4" />
      <B p={[0, 0.85, -0.2]} s={[3.6, 1.6, 2.8]} c="#f3ead7" />
      <B p={[0, 1.7, -0.2]} s={[3.8, 0.12, 3]} c="#d9c9a3" />
      <Cyl p={[0, 2.0, -0.2]} r={1.2} h={0.5} c="#f3ead7" seg={16} />
      <Dome p={[0, 2.25, -0.2]} r={1.2} c="#d4a017" />
      <B p={[0, 3.6, -0.2]} s={[0.06, 0.4, 0.06]} c="#facc15" />
      {[[-1.35, -1.15], [1.35, -1.15], [-1.35, 0.75], [1.35, 0.75]].map(([x, z], i) => (
        <Dome key={i} p={[x, 1.76, z]} r={0.38} c="#d4a017" />
      ))}
      {[[-mx, -mz], [mx, -mz], [-mx, mz], [mx, mz]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl p={[0, 2.1, 0]} r={0.17} rt={0.12} h={4.2} c="#f8f1e0" seg={8} />
          <Cyl p={[0, 2.9, 0]} r={0.24} h={0.1} c="#d9c9a3" seg={8} />
          <Cyl p={[0, 3.7, 0]} r={0.21} h={0.1} c="#d9c9a3" seg={8} />
          <mesh position={[0, 4.5, 0]} castShadow>
            <coneGeometry args={[0.15, 0.6, 8]} />
            <meshStandardMaterial color="#d4a017" flatShading />
          </mesh>
        </group>
      ))}
      {/* Arched entrance and windows. */}
      <B p={[0, 0.6, 1.22]} s={[0.7, 1.1, 0.06]} c="#5a371e" />
      {[-1.3, -0.75, 0.75, 1.3].map((x) => (
        <Win key={x} p={[x, 0.95, 1.21]} s={[0.3, 0.7, 0.04]} />
      ))}
    </group>
  );
}

/** The National Assembly: the long white complex under its green dome. */
function NationalAssembly({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      {/* The two chambers, either side of the dome. */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 1.15), 0, -0.5]}>
          <B p={[0, 0.75, 0]} s={[1.9, 1.5, d - 1.8]} c="#f5f5f4" />
          <B p={[0, 1.56, 0]} s={[2.05, 0.12, d - 1.65]} c="#15803d" />
          <WindowRow w={1.9} d={d - 1.8} y={0.9} n={3} inset={0.2} />
        </group>
      ))}
      <B p={[0, 1.0, -0.5]} s={[2.4, 2.0, d - 1.4]} c="#fafaf9" />
      <B p={[0, 2.06, -0.5]} s={[2.6, 0.12, d - 1.2]} c="#e7e5e4" />
      <Cyl p={[0, 2.3, -0.5]} r={1.1} h={0.4} c="#f5f5f4" seg={16} />
      <Dome p={[0, 2.5, -0.5]} r={1.1} c="#15803d" />
      <Cyl p={[0, 3.75, -0.5]} r={0.03} h={0.5} c="#e5e7eb" seg={6} />
      {/* Portico */}
      <B p={[0, 1.75, 1.25]} s={[2.4, 0.18, 0.8]} c="#e7e5e4" />
      {[-0.95, -0.32, 0.32, 0.95].map((x) => (
        <Cyl key={x} p={[x, 0.85, 1.5]} r={0.09} h={1.7} c="#fafaf9" seg={8} />
      ))}
      <B p={[0, 0.5, 1.12]} s={[0.7, 1.0, 0.05]} c="#3b2a1a" />
      {/* Flags along the forecourt. */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 0.4), 0, d / 2 - 0.4]}>
          <Cyl p={[0, 1.1, 0]} r={0.03} h={2.2} c="#cbd5e1" seg={6} />
          <B p={[0.14, 2.05, 0]} s={[0.1, 0.26, 0.02]} c="#15803d" />
          <B p={[0.24, 2.05, 0]} s={[0.1, 0.26, 0.02]} c="#ffffff" />
          <B p={[0.34, 2.05, 0]} s={[0.1, 0.26, 0.02]} c="#15803d" />
        </group>
      ))}
    </group>
  );
}

/** The Supreme Court: a square white hall behind a colonnade. */
function SupremeCourt({ w, d }: { w: number; d: number }) {
  const n = 6;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <B p={[0, 0.15, 0]} s={[w - 0.6, 0.3, d - 0.6]} c="#e7e5e4" />
      <B p={[0, 1.15, -0.2]} s={[w - 1.4, 1.7, d - 1.6]} c="#fafaf9" />
      <B p={[0, 2.1, 0]} s={[w - 0.5, 0.22, d - 0.5]} c="#f5f5f4" />
      <B p={[0, 2.3, 0]} s={[w - 1.2, 0.18, d - 1.2]} c="#a8a29e" />
      {Array.from({ length: n }, (_, i) => (
        <Cyl key={i} p={[-(w - 1.2) / 2 + ((w - 1.2) / (n - 1)) * i, 1.15, d / 2 - 0.55]} r={0.1} h={1.7} c="#fafaf9" seg={8} />
      ))}
      <B p={[0, 0.75, d / 2 - 1.0]} s={[0.7, 1.2, 0.05]} c="#3b2a1a" />
    </group>
  );
}

/** A glass office tower on a podium. */
function Tower({ p, s, c, cap = '#e5e7eb' }: { p: V3; s: V3; c: string; cap?: string }) {
  const [sx, sy, sz] = s;
  const floors = Math.max(3, Math.round(sy / 0.55));
  return (
    <group position={p}>
      <B p={[0, sy / 2, 0]} s={s} c={c} />
      <B p={[0, sy + 0.05, 0]} s={[sx + 0.1, 0.1, sz + 0.1]} c={cap} />
      {Array.from({ length: floors }, (_, f) => (
        <Win key={f} p={[0, (sy / floors) * (f + 0.55), sz / 2 + 0.01]} s={[sx * 0.82, (sy / floors) * 0.5, 0.03]} />
      ))}
    </group>
  );
}

/** Central Bank of Nigeria headquarters: a tall glass slab between two stone wings. */
function CbnHq({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <B p={[0, 0.35, 0]} s={[w - 0.6, 0.7, d - 0.9]} c="#e7e5e4" />
      <Tower p={[0, 0.7, -0.1]} s={[1.5, 3.9, 1.3]} c="#3f6f8f" cap="#d4af37" />
      {[-1, 1].map((s) => (
        <Tower key={s} p={[s * 1.15, 0.7, -0.1]} s={[0.7, 2.8, 1.5]} c="#efe9dc" />
      ))}
      <B p={[0, 0.4, d / 2 - 0.42]} s={[0.8, 0.8, 0.05]} c="#3b2a1a" />
    </group>
  );
}

/** NNPC Towers: four identical blue-glass towers round one podium. */
function NnpcTowers({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <B p={[0, 0.3, 0]} s={[w - 0.5, 0.6, d - 0.5]} c="#cbd5e1" />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Tower key={i} p={[sx * (w / 2 - 0.95), 0.6, sz * (d / 2 - 0.85)]} s={[0.95, sz < 0 ? 3.6 : 3.2, 0.8]} c="#4f7fa3" />
      ))}
      <B p={[0, 0.95, d / 2 - 0.2]} s={[1.3, 0.3, 0.06]} c="#15803d" />
    </group>
  );
}

/** Millennium Tower: the needle of the capital's skyline, three fins flaring near the top. */
function MillenniumTower({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <Cyl p={[0, 0.25, 0]} r={1.0} h={0.5} c="#e7e5e4" seg={12} />
      <Cyl p={[0, 3.2, 0]} r={0.3} rt={0.16} h={5.6} c="#f5f5f4" seg={8} />
      <Cyl p={[0, 4.7, 0]} r={0.55} rt={0.62} h={0.3} c="#94a3b8" seg={12} />
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
          <mesh position={[0.42, 5.4, 0]} rotation={[0, 0, -0.32]} castShadow>
            <boxGeometry args={[0.07, 1.7, 0.5]} />
            <meshStandardMaterial color="#e5e7eb" flatShading />
          </mesh>
        </group>
      ))}
      <Cyl p={[0, 6.5, 0]} r={0.04} h={1.2} c="#cbd5e1" seg={6} />
    </group>
  );
}

/** A university campus: teaching blocks round a green quad, a taller senate building at the back. */
function Campus({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#8fb86a" />
      <Tower p={[0, 0.04, -d / 2 + 0.6]} s={[w * 0.4, 1.7, 0.8]} c="#f1ead8" cap="#8f3b28" />
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[s * (w / 2 - 0.55), 0.42, 0.1]} s={[0.8, 0.8, d - 1.1]} c="#efe6d4" />
          <B p={[s * (w / 2 - 0.55), 0.87, 0.1]} s={[0.95, 0.1, d - 0.95]} c="#8f3b28" />
          <Win p={[s * (w / 2 - 0.96), 0.5, 0.1]} s={[0.03, 0.3, d - 1.6]} />
        </group>
      ))}
      <Tree p={[-0.4, 0.04, 0.35]} s={0.45} />
      <Tree p={[0.45, 0.04, 0.6]} s={0.4} />
      <B p={[0, 0.3, d / 2 - 0.15]} s={[1.1, 0.6, 0.12]} c="#f8f5ee" />
    </group>
  );
}

/** Unity Fountain: a round basin with a jet in the middle. */
function Fountain({ w }: { w: number; d: number }) {
  return (
    <group>
      <Cyl p={[0, 0.03, 0]} r={w / 2} h={0.06} c="#d6d3d1" seg={20} />
      <Cyl p={[0, 0.14, 0]} r={w / 2 - 0.2} h={0.22} c="#e7e5e4" seg={20} />
      <Cyl p={[0, 0.27, 0]} r={w / 2 - 0.3} h={0.04} c="#5fb3d9" seg={20} />
      <Cyl p={[0, 0.5, 0]} r={0.12} h={0.5} c="#e7e5e4" seg={8} />
      <Cyl p={[0, 1.0, 0]} r={0.05} h={0.9} c="#bfe6f5" rt={0.14} seg={8} />
    </group>
  );
}

/** World Trade Centre: one very tall glass tower beside a shorter one, on a retail podium. */
function Wtc({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <B p={[0, 0.3, 0]} s={[w - 0.4, 0.6, d - 0.5]} c="#cbd5e1" />
      <Tower p={[-0.45, 0.6, -0.5]} s={[1.1, 5.2, 1.1]} c="#35607f" cap="#94a3b8" />
      <Tower p={[0.6, 0.6, 0.7]} s={[0.9, 3.4, 0.9]} c="#4f7fa3" cap="#94a3b8" />
    </group>
  );
}

/** ECOWAS Secretariat: a long white office block with a row of member-state flags in front. */
function Ecowas({ w, d }: { w: number; d: number }) {
  const flags = ['#15803d', '#dc2626', '#f59e0b', '#2563eb', '#15803d', '#f8fafc'];
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <Tower p={[0, 0.04, -0.3]} s={[w - 0.8, 2.0, d - 1.4]} c="#f8fafc" cap="#15803d" />
      {flags.map((c, i) => (
        <group key={i} position={[-w / 2 + 0.5 + i * ((w - 1) / (flags.length - 1)), 0, d / 2 - 0.3]}>
          <Cyl p={[0, 0.6, 0]} r={0.025} h={1.2} c="#e5e7eb" seg={6} />
          <B p={[0.14, 1.08, 0]} s={[0.26, 0.16, 0.02]} c={c} />
        </group>
      ))}
    </group>
  );
}

/** Dunamis Glory Dome: one enormous low dome over a round auditorium. */
function GloryDome({ w, d }: { w: number; d: number }) {
  const r = Math.min(w, d) / 2 - 0.3;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d6d3d1" />
      <Cyl p={[0, 0.45, 0]} r={r} h={0.9} c="#f1f5f9" seg={24} />
      <group position={[0, 0.9, 0]} scale={[1, 0.55, 1]}>
        <Dome p={[0, 0, 0]} r={r} c="#e2e8f0" />
      </group>
      <Cyl p={[0, 0.9 + r * 0.55 + 0.2, 0]} r={0.05} h={0.5} c="#d4af37" seg={6} />
      <B p={[0, 0.45, r + 0.25]} s={[1.6, 0.9, 0.5]} c="#e2e8f0" />
      <B p={[0, 0.35, r + 0.51]} s={[0.7, 0.7, 0.03]} c="#3b2a1a" />
    </group>
  );
}

/* ---------- Lagos ---------- */

/** National Theatre, Iganmu: a round drum under a wide flared brim, shaped like a general's cap. */
function NationalTheatre({ w, d }: { w: number; d: number }) {
  const r = Math.min(w, d) / 2 - 0.55;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#8fb86a" />
      <Cyl p={[0, 0.08, 0]} r={r + 0.45} h={0.12} c="#d6d3d1" seg={24} />
      <Cyl p={[0, 0.75, 0]} r={r} h={1.3} c="#e7e5e4" seg={24} />
      {Array.from({ length: 12 }, (_, i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 6, 0]}>
          <B p={[0, 0.75, r + 0.03]} s={[0.12, 1.3, 0.1]} c="#a8a29e" />
        </group>
      ))}
      <Cyl p={[0, 1.52, 0]} r={r + 0.2} rt={r + 0.6} h={0.26} c="#f5f5f4" seg={24} />
      <Cyl p={[0, 1.95, 0]} r={r * 0.95} rt={r * 0.6} h={0.6} c="#cbd5e1" seg={24} />
      <Cyl p={[0, 2.3, 0]} r={r * 0.6} h={0.1} c="#94a3b8" seg={24} />
      <B p={[0, 0.4, r + 0.3]} s={[1.1, 0.8, 0.5]} c="#e7e5e4" />
      <B p={[0, 0.35, r + 0.56]} s={[0.6, 0.6, 0.03]} c="#3b2a1a" />
    </group>
  );
}

/** Apapa Port: a quay stacked with containers, two gantry cranes reaching out over a ship in the lagoon (+z). */
function Port({ w, d }: { w: number; d: number }) {
  const boxes = ['#b91c1c', '#1d4ed8', '#15803d', '#f59e0b', '#7c3aed', '#0e7490', '#9a3412'];
  const n = Math.max(4, Math.floor(w - 2));
  return (
    <group>
      <B p={[0, 0.04, 0]} s={[w, 0.08, d]} c="#9ca3af" />
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + 0.8 + i * ((w - 1.6) / (n - 1));
        const tall = (i * 7) % 3;
        return (
          <group key={i}>
            <B p={[x, 0.3, -d / 2 + 0.45]} s={[0.75, 0.44, 0.7]} c={boxes[i % boxes.length]} />
            {tall > 0 && <B p={[x, 0.75, -d / 2 + 0.45]} s={[0.75, 0.44, 0.7]} c={boxes[(i + 3) % boxes.length]} />}
            {tall > 1 && <B p={[x, 1.2, -d / 2 + 0.45]} s={[0.75, 0.44, 0.7]} c={boxes[(i + 5) % boxes.length]} />}
          </group>
        );
      })}
      {[-w / 4, w / 4].map((x, i) => (
        <group key={i} position={[x, 0, d / 2 - 0.35]}>
          {[-0.45, 0.45].map((lx) => <B key={lx} p={[lx, 1.1, 0]} s={[0.12, 2.2, 0.12]} c="#dc2626" />)}
          <B p={[0, 2.2, 0]} s={[1.1, 0.14, 0.2]} c="#dc2626" />
          <B p={[0, 2.35, 0.9]} s={[0.16, 0.16, 3.0]} c="#f97316" />
          <B p={[0, 1.9, 1.7]} s={[0.04, 0.8, 0.04]} c="#1f2937" />
          <B p={[0, 1.45, 1.7]} s={[0.5, 0.3, 0.45]} c={boxes[i + 1]} />
        </group>
      ))}
      <group position={[0, 0, d / 2 + 1.7]}>
        <B p={[0, 0.2, 0]} s={[w * 0.7, 0.5, 1.1]} c="#1e3a8a" />
        <B p={[0, 0.5, 0]} s={[w * 0.7 + 0.1, 0.1, 1.2]} c="#b91c1c" />
        <B p={[-w * 0.26, 0.95, 0]} s={[0.9, 0.8, 0.9]} c="#f8fafc" />
        {[0, 1, 2, 3].map((i) => <B key={i} p={[-w * 0.08 + i * 0.85, 0.78, 0]} s={[0.75, 0.44, 0.8]} c={boxes[(i * 2) % boxes.length]} />)}
      </group>
    </group>
  );
}

/** Computer Village: rows of phone stalls under umbrellas, and one tall signboard nobody can read from the road. */
function CompVillage({ w, d }: { w: number; d: number }) {
  const shades = ['#facc15', '#dc2626', '#2563eb', '#16a34a', '#f97316'];
  const cols = Math.max(3, Math.floor(w));
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#b8b2a6" />
      {[-1, 1].map((row) => (
        <group key={row} position={[0, 0, row * (d / 4)]}>
          <B p={[0, 0.5, -0.2]} s={[w - 0.5, 1.0, 0.7]} c="#e9dcc3" />
          <B p={[0, 1.04, -0.2]} s={[w - 0.35, 0.08, 0.9]} c="#6b7280" />
          <B p={[0, 0.82, 0.16]} s={[w - 0.6, 0.22, 0.03]} c={row < 0 ? '#1d4ed8' : '#b91c1c'} />
          {Array.from({ length: cols }, (_, i) => {
            const x = -w / 2 + 0.6 + i * ((w - 1.2) / (cols - 1));
            return (
              <group key={i} position={[x, 0, 0.55]}>
                <Cyl p={[0, 0.4, 0]} r={0.02} h={0.8} c="#52525b" seg={6} />
                <Cyl p={[0, 0.85, 0]} r={0.36} rt={0.02} h={0.18} c={shades[(i + (row < 0 ? 0 : 2)) % shades.length]} seg={8} />
                <B p={[0, 0.22, 0]} s={[0.4, 0.06, 0.3]} c="#3f3f46" />
              </group>
            );
          })}
        </group>
      ))}
      <Cyl p={[w / 2 - 0.4, 1.2, -d / 2 + 0.35]} r={0.05} h={2.4} c="#52525b" seg={6} />
      <B p={[w / 2 - 0.4, 2.3, -d / 2 + 0.35]} s={[0.9, 0.6, 0.08]} c="#111827" />
      <Win p={[w / 2 - 0.4, 2.3, -d / 2 + 0.4]} s={[0.76, 0.46, 0.02]} />
    </group>
  );
}

/** Landmark Beach: sand, umbrellas and loungers, a bar hut, and the Atlantic rolling in on the +z side. */
function Beach({ w, d }: { w: number; d: number }) {
  const shades = ['#f97316', '#0ea5e9', '#facc15', '#ef4444', '#22c55e'];
  const n = Math.max(3, Math.floor(w / 2));
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#f0dca8" />
      <B p={[0, 0.02, d / 2 + 0.5]} s={[w, 0.03, 1]} c="#f8fafc" />
      <B p={[0, 0.012, d / 2 + 1.6]} s={[w + 1, 0.02, 1.4]} c="#38a3c9" />
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + 1 + i * ((w - 2) / (n - 1));
        return (
          <group key={i} position={[x, 0, (i % 2 ? 0.25 : -0.15) * d]}>
            <Cyl p={[0, 0.4, 0]} r={0.02} h={0.8} c="#78716c" seg={6} />
            <Cyl p={[0, 0.84, 0]} r={0.45} rt={0.02} h={0.2} c={shades[i % shades.length]} seg={8} />
            <B p={[0.3, 0.1, 0.15]} s={[0.22, 0.06, 0.6]} c="#f8fafc" />
          </group>
        );
      })}
      <group position={[-w / 2 + 0.7, 0, -d / 2 + 0.6]}>
        <B p={[0, 0.3, 0]} s={[1.0, 0.6, 0.7]} c="#b88b49" />
        <Cyl p={[0, 0.82, 0]} r={0.85} rt={0.05} h={0.45} c="#a16207" seg={8} />
      </group>
      <Tree p={[w / 2 - 0.5, 0.03, -d / 2 + 0.5]} s={0.5} c="#3f8f4a" />
      <Tree p={[w / 2 - 1.6, 0.03, -d / 2 + 0.4]} s={0.42} c="#4a9a52" />
    </group>
  );
}

/* ---------- Kano ---------- */

/** Sun-baked mud (tubali), the colour of everything old in Kano. */
const MUD = '#b98a5e';
const MUD_DARK = '#a3764c';
const MUD_LIGHT = '#cfa57a';

/** Zanko: the horn a Hausa builder raises on every corner of a roof. */
function Zanko({ p, s = 1 }: { p: V3; s?: number }) {
  return <Cyl p={[p[0], p[1] + 0.25 * s, p[2]]} r={0.1 * s} rt={0.02 * s} h={0.5 * s} c={MUD_LIGHT} seg={5} />;
}

/** A stretch of the old city wall: a mud rampart, thick at the foot and worn uneven along the top. It runs along its longer side. */
function CityWall({ w, d }: { w: number; d: number }) {
  const len = Math.max(w, d);
  const n = Math.max(2, Math.round(len / 1.1));
  return (
    <group rotation={[0, w >= d ? 0 : Math.PI / 2, 0]}>
      <B p={[0, 0.35, 0]} s={[len, 0.7, 0.72]} c={MUD} />
      <B p={[0, 0.88, 0]} s={[len, 0.36, 0.5]} c={MUD_DARK} />
      {Array.from({ length: n }, (_, i) => {
        const h = 0.14 + ((i * 7) % 4) * 0.07;
        return <B key={i} p={[-len / 2 + (i + 0.5) * (len / n), 1.06 + h / 2, 0]} s={[(len / n) * 0.62, h, 0.4]} c={i % 2 ? MUD : MUD_LIGHT} />;
      })}
    </group>
  );
}

/** A gate of the old city (kofar): two mud towers with horned corners and a heavy lintel over the road. The road runs through along x. */
function Kofar({ d }: { w: number; d: number }) {
  const span = d - 0.9;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, (s * span) / 2]}>
          <B p={[0, 1.35, 0]} s={[1.1, 2.7, 0.8]} c={MUD} />
          <B p={[0, 0.3, 0]} s={[1.25, 0.6, 0.95]} c={MUD_DARK} />
          <B p={[0, 2.76, 0]} s={[1.2, 0.14, 0.9]} c={MUD_DARK} />
          {[[-0.5, -0.33], [0.5, -0.33], [-0.5, 0.33], [0.5, 0.33]].map(([x, z], i) => (
            <Zanko key={i} p={[x, 2.83, z]} />
          ))}
        </group>
      ))}
      <B p={[0, 2.5, 0]} s={[0.85, 0.5, span]} c={MUD_LIGHT} />
      <B p={[0, 2.8, 0]} s={[0.95, 0.12, span + 0.3]} c={MUD_DARK} />
      {/* Whitewashed patterns on both faces, where drivers see them. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[s * 0.435, 2.5, 0]} s={[0.03, 0.26, span * 0.62]} c="#f5f0e1" />
          <B p={[s * 0.45, 2.5, 0]} s={[0.03, 0.1, span * 0.4]} c="#15803d" />
        </group>
      ))}
    </group>
  );
}

/** Gidan Rumfa, the Emir's Palace: a walled mud compound, a painted gatehouse on the south side and the domed hall inside. */
function EmirPalace({ w, d }: { w: number; d: number }) {
  const hw = w / 2 - 0.22, hd = d / 2 - 0.22;
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#dcc59c" />
      <B p={[0, 0.5, -hd]} s={[w - 0.4, 1, 0.24]} c={MUD} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[s * hw, 0.5, 0]} s={[0.24, 1, d - 0.4]} c={MUD} />
          <B p={[s * (w / 4 + 0.4), 0.5, hd]} s={[w / 2 - 1.2, 1, 0.24]} c={MUD} />
        </group>
      ))}
      {[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([x, z], i) => (
        <group key={i}>
          <B p={[x, 0.65, z]} s={[0.44, 1.3, 0.44]} c={MUD_DARK} />
          <Zanko p={[x, 1.3, z]} s={1.1} />
        </group>
      ))}
      {/* The gatehouse, whitewashed and painted. */}
      <B p={[0, 0.95, hd]} s={[1.7, 1.9, 0.8]} c={MUD_LIGHT} />
      <B p={[0, 0.6, hd + 0.41]} s={[0.62, 1.2, 0.03]} c="#3b2a1a" />
      <B p={[0, 1.52, hd + 0.41]} s={[1.4, 0.34, 0.03]} c="#f5f0e1" />
      <B p={[0, 1.52, hd + 0.425]} s={[1.05, 0.12, 0.03]} c="#15803d" />
      {[-0.72, 0.72].map((x) => (
        <Zanko key={x} p={[x, 1.9, hd]} s={1.2} />
      ))}
      {/* Soron Giwa: the great hall under its dome. */}
      <B p={[-0.55, 0.75, -0.55]} s={[2.1, 1.5, 1.9]} c="#efe2c6" />
      <Dome p={[-0.55, 1.5, -0.55]} r={0.8} c="#f8fafc" />
      {[[-1.5, -1.4], [0.4, -1.4], [-1.5, 0.3], [0.4, 0.3]].map(([x, z], i) => (
        <Zanko key={i} p={[x, 1.5, z]} />
      ))}
      {/* Council chamber and stables. */}
      <B p={[1.35, 0.55, -1.15]} s={[1.2, 1.1, 1.5]} c={MUD_LIGHT} />
      <B p={[1.35, 1.13, -1.15]} s={[1.3, 0.06, 1.6]} c={MUD_DARK} />
      <B p={[1.3, 0.4, 0.75]} s={[1.3, 0.8, 0.9]} c={MUD} />
      <B p={[1.3, 0.83, 0.75]} s={[1.4, 0.06, 1]} c={MUD_DARK} />
      <Tree p={[-1.7, 0, 1.3]} s={0.42} c="#4d7c3a" />
      <Cyl p={[0.9, 1.4, hd - 0.2]} r={0.03} h={2.8} c="#e5e7eb" seg={6} />
      <B p={[1.2, 2.6, hd - 0.2]} s={[0.55, 0.32, 0.02]} c="#15803d" />
    </group>
  );
}

/** Dala Hill: the red laterite hill the city began on, with the long stair up its face. */
function DalaHill({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#cdaa76" />
      <Boulder p={[0, 0.7, -0.2]} s={[w * 0.46, 1.7, d * 0.42]} c="#a8623a" yaw={0.4} />
      <Boulder p={[0.2, 1.6, -0.3]} s={[w * 0.3, 1.35, d * 0.28]} c="#b56d42" yaw={1.2} />
      <Boulder p={[-w * 0.27, 0.4, d * 0.2]} s={[w * 0.2, 0.9, d * 0.18]} c="#9c5a36" yaw={2.1} />
      {Array.from({ length: 8 }, (_, i) => (
        <B key={i} p={[1.0 - i * 0.07, 0.1 + i * 0.3, d * 0.4 - i * 0.3]} s={[0.5, 0.08, 0.26]} c="#ead8b4" />
      ))}
      <Cyl p={[0.2, 3.2, -0.3]} r={0.04} h={0.9} c="#e5e7eb" seg={6} />
      {[[-w / 2 + 0.5, d / 2 - 0.5], [w / 2 - 0.5, -d / 2 + 0.6], [-w / 2 + 0.6, -d / 2 + 0.7]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0, z]} s={0.36} c="#7d8f45" />
      ))}
    </group>
  );
}

/** Kofar Mata dye pits: round pits of indigo sunk in a sandy yard, cloth drying on the lines, a thatched shade. */
function DyePits({ w, d }: { w: number; d: number }) {
  const cols = 4, rows = 2;
  const cloths = ['#1e3a8a', '#1e1b4b', '#3730a3', '#1d4ed8', '#312e81'];
  return (
    <group>
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c="#d9c092" />
      {Array.from({ length: cols * rows }, (_, i) => {
        const x = -w / 2 + 0.75 + (i % cols) * ((w - 1.5) / (cols - 1));
        const z = 0.1 + Math.floor(i / cols) * 0.95;
        return (
          <group key={i}>
            <Cyl p={[x, 0.08, z]} r={0.36} h={0.12} c={MUD} seg={10} />
            <Cyl p={[x, 0.145, z]} r={0.27} h={0.02} c={i % 3 ? '#1e3a8a' : '#1e1b4b'} seg={10} />
          </group>
        );
      })}
      {/* The drying line along the back. */}
      {[-1, 1].map((s) => (
        <Cyl key={s} p={[s * (w / 2 - 0.4), 0.7, -d / 2 + 0.5]} r={0.04} h={1.4} c="#5b3a1e" seg={6} />
      ))}
      <B p={[0, 1.36, -d / 2 + 0.5]} s={[w - 0.8, 0.02, 0.02]} c="#5b3a1e" />
      {cloths.map((c, i) => (
        <B key={i} p={[-w / 2 + 0.95 + i * ((w - 1.9) / (cloths.length - 1)), 0.95, -d / 2 + 0.5]} s={[0.55, 0.8, 0.03]} c={c} />
      ))}
      {/* Thatched shade for the dyers. */}
      {[[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]].map(([x, z], i) => (
        <Cyl key={i} p={[w / 2 - 0.9 + x, 0.45, -d / 2 + 1.7 + z]} r={0.035} h={0.9} c="#5b3a1e" seg={5} />
      ))}
      <B p={[w / 2 - 0.9, 0.95, -d / 2 + 1.7]} s={[1.3, 0.12, 1.1]} c="#b09252" />
    </group>
  );
}

/** The groundnut pyramids: sacks stacked into pyramids taller than the houses, waiting for the train south. */
function Pyramids({ w, d }: { w: number; d: number }) {
  const spots: [number, number, number, number][] = [[-w * 0.31, -0.25, 1.3, 2.1], [0.05, 0.25, 1.45, 2.5], [w * 0.31, -0.2, 1.2, 1.9]];
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w, 0.03, d]} c="#d6ba8a" />
      {spots.map(([x, z, r, h], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, Math.PI / 4, 0]}>
          <Cyl p={[0, h / 2, 0]} r={r} rt={0.07} h={h} c={i % 2 ? '#c8a36a' : '#d4b27c'} seg={4} />
          {/* Courses of sacks. */}
          {[0.2, 0.4, 0.6, 0.8].map((t) => (
            <Cyl key={t} p={[0, h * t, 0]} r={r * (1 - t) + 0.07 * t + 0.015} h={0.035} c="#a8834f" seg={4} />
          ))}
        </group>
      ))}
      {[[-0.6, d / 2 - 0.55], [-0.2, d / 2 - 0.5], [-0.4, d / 2 - 0.85], [w / 2 - 0.8, d / 2 - 0.5]].map(([x, z], i) => (
        <B key={i} p={[x, 0.11 + (i === 2 ? 0.16 : 0), z]} s={[0.36, 0.18, 0.24]} c="#c8a36a" />
      ))}
    </group>
  );
}

export function LandmarkModel({ model, w, d }: { model: string; w: number; d: number }) {
  switch (model) {
    case 'govhouse': return <GovHouse w={w} d={d} />;
    case 'flyover': return <Flyover w={w} d={d} />;
    case 'golf': return <Golf w={w} d={d} />;
    case 'tradefair': return <TradeFair w={w} d={d} />;
    case 'asorock': return <AsoRock w={w} d={d} />;
    case 'zumarock': return <ZumaRock w={w} d={d} />;
    case 'citygate': return <CityGate w={w} d={d} />;
    case 'supremecourt': return <SupremeCourt w={w} d={d} />;
    case 'cbn': return <CbnHq w={w} d={d} />;
    case 'nnpc': return <NnpcTowers w={w} d={d} />;
    case 'milltower': return <MillenniumTower w={w} d={d} />;
    case 'campus': return <Campus w={w} d={d} />;
    case 'fountain': return <Fountain w={w} d={d} />;
    case 'wtc': return <Wtc w={w} d={d} />;
    case 'ecowas': return <Ecowas w={w} d={d} />;
    case 'glorydome': return <GloryDome w={w} d={d} />;
    case 'nationaltheatre': return <NationalTheatre w={w} d={d} />;
    case 'port': return <Port w={w} d={d} />;
    case 'compvillage': return <CompVillage w={w} d={d} />;
    case 'beach': return <Beach w={w} d={d} />;
    case 'citywall': return <CityWall w={w} d={d} />;
    case 'kofar': return <Kofar w={w} d={d} />;
    case 'emirpalace': return <EmirPalace w={w} d={d} />;
    case 'dala': return <DalaHill w={w} d={d} />;
    case 'dyepits': return <DyePits w={w} d={d} />;
    case 'pyramids': return <Pyramids w={w} d={d} />;
    default: return null;
  }
}

export function PlaceModel({ model, w, d }: { model: string; w: number; d: number }) {
  const props = { w, d };
  switch (model) {
    case 'home': return <Home {...props} />;
    case 'suya': return <Suya {...props} />;
    case 'school': return <School {...props} />;
    case 'pitch': return <Pitch {...props} />;
    case 'viewing': return <ViewingCenter {...props} />;
    case 'church': return <Church {...props} />;
    case 'buka': return <Buka {...props} />;
    case 'refinery': return <Refinery {...props} />;
    case 'mosque': return <Mosque {...props} />;
    case 'jetty': return <Jetty {...props} />;
    case 'market': return <Market {...props} />;
    case 'lugard': return <Lugard {...props} />;
    case 'square': return <Square {...props} />;
    case 'secretariat': return <Secretariat {...props} />;
    case 'bank': return <BankBranch {...props} />;
    case 'hospital': return <Hospital {...props} />;
    case 'mall': return <Mall {...props} />;
    case 'boutique': return <Boutique {...props} />;
    case 'museum': return <Museum {...props} />;
    case 'park': return <Park {...props} />;
    case 'techhub': return <TechHub {...props} />;
    case 'station': return <Station {...props} />;
    case 'poly': return <Poly {...props} />;
    case 'motorpark': return <MotorPark {...props} />;
    case 'stadium': return <Stadium {...props} />;
    case 'nda': return <Nda {...props} />;
    case 'hotel': return <Hotel {...props} />;
    case 'arewa': return <Arewa {...props} />;
    case 'polo': return <Polo {...props} />;
    case 'mill': return <Mill {...props} />;
    case 'airport': return <Airport {...props} />;
    case 'club': return <Nightclub {...props} />;
    case 'nationalmosque': return <NationalMosque {...props} />;
    case 'nass': return <NationalAssembly {...props} />;
    case 'govhouse': return <GovHouse {...props} />;
    default: return <B p={[0, 0.5, 0]} s={[w, 1, d]} c="#f0f" />;
  }
}

/** Filler house: bungalow, gabled house, or flat-roof storey building, in its own walled compound. */
export function HouseModel({ w, d, style, wall, roof, storeys, kind }: { w: number; d: number; style: number; wall: string; roof: string; storeys: number; kind?: string }) {
  if (kind === 'chapel') return <Chapel w={w} d={d} />;
  if (kind === 'mosque') return <SmallMosque w={w} d={d} />;
  if (kind === 'shop') return <ShopRow w={w} d={d} wall={wall} />;
  if (kind === 'clinic') return <Clinic w={w} d={d} />;
  const bw = w - 0.7;
  const bd = d - 1;
  const h = storeys === 2 ? 2.2 : 1.2;
  const front = bd / 2;
  // The same house always gets the same touches: worked out from what it is, never at random.
  const pick = (Math.round(w * 7 + style * 3 + storeys * 5) + wall.charCodeAt(2) + roof.charCodeAt(3)) % 4;
  const trim = '#efe9dd';
  const fence = shade(wall, 0.9);
  const gate = ['#14532d', '#1f2937', '#7c2d12', '#1e3a8a'][pick];
  const walled = w >= 3;
  const fy = 0.42;
  const fz = d / 2 - 0.1;
  const gx = 0.25;
  // The ground-floor window the door would cut through is left out.
  const wins = Math.max(2, Math.round(bw));
  const doorWin = Math.min(wins - 1, Math.max(0, Math.floor(((gx + (bw - 0.5) / 2) / (bw - 0.5)) * wins)));
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#c98b5e" />
      {/* the compound wall: back and sides, and a front with a metal gate lined up with the door */}
      <B p={[0, 0.3, -d / 2 + 0.1]} s={[w - 0.1, 0.6, 0.08]} c={fence} />
      {walled && (
        <>
          {[-1, 1].map((sx) => (
            <B key={sx} p={[sx * (w / 2 - 0.09), fy / 2, 0]} s={[0.08, fy, d - 0.18]} c={fence} />
          ))}
          <B p={[(-w / 2 + 0.05 + gx - 0.32) / 2, fy / 2, fz]} s={[gx - 0.32 + w / 2 - 0.05, fy, 0.08]} c={fence} />
          <B p={[(w / 2 - 0.05 + gx + 0.32) / 2, fy / 2, fz]} s={[w / 2 - 0.05 - gx - 0.32, fy, 0.08]} c={fence} />
          <B p={[gx, 0.27, fz]} s={[0.6, 0.5, 0.04]} c={gate} />
          {[-1, 1].map((sx) => (
            <B key={sx} p={[gx + sx * 0.33, 0.29, fz]} s={[0.1, 0.58, 0.12]} c={trim} />
          ))}
          {/* coping along the top of the front wall */}
          <B p={[0, fy + 0.015, fz]} s={[w - 0.08, 0.03, 0.11]} c={trim} />
          {/* a paved path from the gate to the door */}
          <B p={[gx, 0.035, (fz + front - 0.2) / 2 + 0.05]} s={[0.42, 0.02, fz - front + 0.2]} c="#b8b1a3" />
        </>
      )}
      <group position={[0, 0, -0.2]}>
        <B p={[0, h / 2, 0]} s={[bw, h, bd]} c={wall} />
        {/* plinth along the foot of the walls, corner pilasters, and a band between floors */}
        <B p={[0, 0.08, 0]} s={[bw + 0.06, 0.16, bd + 0.06]} c="#8b7d6b" />
        {[-1, 1].map((sx) => (
          <B key={sx} p={[sx * (bw / 2 - 0.02), h / 2, front - 0.02]} s={[0.1, h, 0.1]} c={trim} />
        ))}
        {storeys === 2 && <B p={[0, 1.17, 0]} s={[bw + 0.05, 0.07, bd + 0.05]} c={trim} />}
        {style === 0 && <Gable p={[0, h, 0]} w={bw + 0.3} d={bd} h={0.55} c={roof} wall={wall} />}
        {style === 1 && (
          <>
            {/* hipped roof over a shallow fascia, so the eaves throw a line of shade */}
            <B p={[0, h + 0.03, 0]} s={[bw + 0.24, 0.07, bd + 0.24]} c={shade(roof, 0.7)} />
            <mesh position={[0, h + 0.36, 0]} rotation={[0, Math.PI / 4, 0]} scale={[(bw + 0.24) * 0.7071, 1, (bd + 0.24) * 0.7071]} castShadow>
              <coneGeometry args={[1, 0.6, 4]} />
              <meshStandardMaterial color={roof} flatShading />
            </mesh>
          </>
        )}
        {style === 2 && (
          <>
            <B p={[0, h + 0.05, 0]} s={[bw + 0.1, 0.1, bd + 0.1]} c={shade(wall, 0.85)} />
            <Parapet w={bw + 0.1} d={bd + 0.1} y={h + 0.1} c={wall} h={0.18} cap={roof} />
          </>
        )}
        {Array.from({ length: storeys }, (_, f) => (
          <WindowRow key={f} w={bw} d={bd} y={0.7 + f * 1} n={wins} inset={0.25} hood={trim} skip={f === 0 ? doorWin : undefined} />
        ))}
        {/* front door in a frame, a step up to it and a little porch roof on two posts */}
        <B p={[gx, 0.37, front + 0.015]} s={[0.4, 0.78, 0.03]} c={FRAME} />
        <B p={[gx, 0.35, front + 0.025]} s={[0.3, 0.7, 0.04]} c="#5a371e" />
        <B p={[gx + 0.09, 0.36, front + 0.05]} s={[0.03, 0.03, 0.03]} c="#d4af37" />
        <B p={[gx, 0.03, front + 0.14]} s={[0.56, 0.06, 0.28]} c="#a8a29e" />
        <B p={[gx, 0.82, front + 0.15]} s={[0.62, 0.05, 0.3]} c={roof} />
        {walled && [-1, 1].map((sx) => (
          <B key={sx} p={[gx + sx * 0.27, 0.41, front + 0.27]} s={[0.04, 0.78, 0.04]} c={trim} />
        ))}
        {/* an air conditioner on the side wall, or a satellite dish on the roof */}
        {pick % 2 === 0 ? (
          <group position={[bw / 2 + 0.07, storeys === 2 ? 1.55 : 0.55, -bd / 4]}>
            <B p={[0, 0, 0]} s={[0.14, 0.22, 0.36]} c="#e5e7eb" />
            <B p={[0.071, 0, 0]} s={[0.01, 0.15, 0.28]} c="#6b7280" />
          </group>
        ) : (
          <group position={[-bw / 2 + 0.3, h + (style === 1 ? 0.12 : style === 0 ? 0.1 : 0.1), front - 0.3]} rotation={[0.5, 0.6, 0]}>
            <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.05, 0.06, 10]} />
              <meshStandardMaterial color="#e5e7eb" />
            </mesh>
            <B p={[0, 0.07, -0.02]} s={[0.025, 0.16, 0.025]} c="#9ca3af" />
          </group>
        )}
        {kind === 'tank' && (
          <group position={[bw / 2 - 0.35, h, -bd / 4]}>
            {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z], i) => (
              <B key={i} p={[x, 0.3, z]} s={[0.05, 0.6, 0.05]} c="#78716c" />
            ))}
            <B p={[0, 0.58, 0]} s={[0.44, 0.04, 0.44]} c="#78716c" />
            {/* the black plastic tank most compounds pump water up to */}
            <Cyl p={[0, 0.85, 0]} r={0.26} rt={0.24} h={0.5} c="#1f2937" seg={10} />
            <Cyl p={[0, 1.12, 0]} r={0.09} h={0.05} c="#111827" seg={8} />
          </group>
        )}
      </group>
    </group>
  );
}

/** Neighbourhood chapel: small gabled hall with a cross on the front. */
function Chapel({ w, d }: { w: number; d: number }) {
  const bw = w - 1;
  const bd = d - 0.8;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#d6d3d1" />
      <group position={[0, 0, -0.1]}>
        <B p={[0, 0.6, 0]} s={[bw, 1.2, bd]} c="#f5f5f4" />
        <B p={[0, 0.08, 0]} s={[bw + 0.06, 0.16, bd + 0.06]} c="#a8a29e" />
        {/* the gable faces the street, as on a church, with the cross on its peak */}
        <group rotation={[0, Math.PI / 2, 0]}>
          <Gable p={[0, 1.2, 0]} w={bd + 0.3} d={bw} h={0.75} c="#7f1d1d" wall="#f5f5f4" />
        </group>
        <B p={[0, 2.18, bd / 2 + 0.1]} s={[0.05, 0.42, 0.05]} c="#facc15" />
        <B p={[0, 2.26, bd / 2 + 0.1]} s={[0.24, 0.05, 0.05]} c="#facc15" />
        <Win p={[0, 1.45, bd / 2 + 0.02]} s={[0.18, 0.18, 0.04]} />
        {/* tall windows down each side */}
        {[-1, 1].map((sx) => [-0.25, 0.25].map((z) => (
          <Win key={`${sx}${z}`} p={[sx * (bw / 2 + 0.01), 0.7, z * bd]} s={[0.04, 0.5, 0.16]} />
        )))}
        <B p={[0, 0.36, bd / 2 + 0.015]} s={[0.4, 0.74, 0.03]} c={FRAME} />
        <B p={[0, 0.33, bd / 2 + 0.025]} s={[0.3, 0.66, 0.04]} c="#5a371e" />
        <B p={[0, 0.03, bd / 2 + 0.15]} s={[0.6, 0.06, 0.28]} c="#a8a29e" />
      </group>
    </group>
  );
}

/** Small prayer house: square hall, green dome and one slim minaret. */
function SmallMosque({ w, d }: { w: number; d: number }) {
  const bw = w - 1.2;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#e7e5e4" />
      <B p={[0, 0.55, -0.1]} s={[bw, 1.1, bw]} c="#fafaf9" />
      <B p={[0, 0.08, -0.1]} s={[bw + 0.06, 0.16, bw + 0.06]} c="#a8a29e" />
      <Parapet w={bw + 0.04} d={bw + 0.04} y={1.1} c="#fafaf9" h={0.12} cap="#15803d" />
      {/* a drum under the dome lifts it clear of the parapet */}
      <Cyl p={[0, 1.16, -0.1]} r={Math.min(0.5, bw / 2 - 0.15)} h={0.12} c="#f5f5f4" seg={12} />
      <Dome p={[0, 1.22, -0.1]} r={Math.min(0.5, bw / 2 - 0.15)} c="#15803d" />
      <B p={[0, 1.8, -0.1]} s={[0.04, 0.2, 0.04]} c="#facc15" />
      <group position={[bw / 2 + 0.1, 0, -bw / 2]}>
        <Cyl p={[0, 0.9, 0]} r={0.1} rt={0.08} h={1.8} c="#fafaf9" seg={8} />
        {/* the muezzin's balcony */}
        <Cyl p={[0, 1.55, 0]} r={0.14} h={0.06} c="#15803d" seg={8} />
        <mesh position={[0, 2.0, 0]}>
          <coneGeometry args={[0.11, 0.3, 8]} />
          <meshStandardMaterial color="#15803d" flatShading />
        </mesh>
      </group>
      <B p={[0, 0.38, bw / 2 - 0.085]} s={[0.4, 0.76, 0.03]} c="#15803d" />
      <B p={[0, 0.34, bw / 2 - 0.075]} s={[0.3, 0.68, 0.04]} c="#5a371e" />
      {[-1, 1].map((x) => (
        <Win key={x} p={[x * bw * 0.3, 0.65, bw / 2 - 0.08]} s={[0.18, 0.36, 0.04]} />
      ))}
    </group>
  );
}

/** Row of lock-up shops: a painted signboard along the top, roller shutters (some pulled up on the goods inside) and an awning over each. */
function ShopRow({ w, d, wall }: { w: number; d: number; wall: string }) {
  const bw = w - 0.7;
  const n = Math.max(2, Math.round(bw / 0.8));
  const cw = bw / n;
  const cols = ['#b91c1c', '#15803d', '#1d4ed8', '#f59e0b'];
  const bd = d - 1.4;
  const front = -0.3 + bd / 2;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#c98b5e" />
      {/* a concrete apron in front of the shops */}
      <B p={[0, 0.04, front + 0.3]} s={[bw + 0.2, 0.04, 0.6]} c="#b8b1a3" />
      <B p={[0, 0.6, -0.3]} s={[bw, 1.2, bd]} c={wall} />
      <B p={[0, 0.08, -0.3]} s={[bw + 0.05, 0.16, bd + 0.05]} c="#8b7d6b" />
      <B p={[0, 1.24, -0.3]} s={[bw + 0.1, 0.08, bd + 0.1]} c="#94a3b8" />
      <Parapet w={bw + 0.1} d={bd + 0.1} y={1.28} c={wall} h={0.12} />
      {/* the long signboard, white with a coloured band */}
      <B p={[0, 1.02, front + 0.04]} s={[bw - 0.1, 0.22, 0.04]} c="#f8fafc" />
      <B p={[0, 0.94, front + 0.065]} s={[bw - 0.1, 0.05, 0.01]} c={cols[(Math.round(w) + 1) % 4]} />
      {Array.from({ length: n }, (_, i) => {
        const x = -bw / 2 + cw * (i + 0.5);
        const open = i % 2 === 0;
        return (
          <group key={i}>
            {/* piers between the shops */}
            <B p={[x - cw / 2 + 0.03, 0.45, front + 0.02]} s={[0.06, 0.9, 0.06]} c={shade(wall, 0.92)} />
            {open ? (
              <>
                {/* shutter rolled up, the shop dark inside with goods on a shelf */}
                <B p={[x, 0.79, front + 0.02]} s={[cw - 0.12, 0.1, 0.05]} c="#9ca3af" />
                <B p={[x, 0.37, front + 0.005]} s={[cw - 0.12, 0.74, 0.02]} c="#1f2937" />
                <B p={[x, 0.32, front + 0.03]} s={[cw - 0.2, 0.03, 0.08]} c="#78716c" />
                {[-1, 0, 1].map((k) => (
                  <B key={k} p={[x + k * (cw / 4), 0.4, front + 0.04]} s={[0.1, 0.12, 0.06]} c={cols[(i + k + 3) % 4]} />
                ))}
              </>
            ) : (
              <>
                <B p={[x, 0.42, front + 0.02]} s={[cw - 0.12, 0.84, 0.04]} c="#a1a1aa" />
                {[0.15, 0.3, 0.45, 0.6, 0.75].map((y) => (
                  <B key={y} p={[x, y, front + 0.045]} s={[cw - 0.12, 0.015, 0.01]} c="#71717a" />
                ))}
              </>
            )}
            <group position={[x, 0.86, front + 0.2]} rotation={[0.35, 0, 0]}>
              <B p={[0, 0, 0]} s={[cw - 0.06, 0.04, 0.4]} c={cols[(i + 1) % 4]} />
              <B p={[0, -0.04, 0.2]} s={[cw - 0.06, 0.06, 0.015]} c={shade(cols[(i + 1) % 4], 0.75)} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Primary health clinic: white block, green stripe and cross. */
function Clinic({ w, d }: { w: number; d: number }) {
  const bw = w - 0.7;
  const bd = d - 1.2;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#d6d3d1" />
      <group position={[0, 0, -0.2]}>
        <B p={[0, 0.6, 0]} s={[bw, 1.2, bd]} c="#f8fafc" />
        <B p={[0, 0.08, 0]} s={[bw + 0.06, 0.16, bd + 0.06]} c="#94a3b8" />
        <B p={[0, 1.25, 0]} s={[bw + 0.15, 0.12, bd + 0.15]} c="#cbd5e1" />
        <Parapet w={bw + 0.15} d={bd + 0.15} y={1.31} c="#f8fafc" h={0.12} cap="#15803d" />
        <WindowRow w={bw} d={bd} y={0.65} n={Math.max(2, Math.round(bw))} inset={0.25} hood="#e2e8f0" skip={Math.max(2, Math.round(bw)) - 1} />
        {/* a canopy on posts over the entrance */}
        <B p={[bw / 2 - 0.35, 0.85, bd / 2 + 0.25]} s={[0.7, 0.05, 0.5]} c="#15803d" />
        {[-1, 1].map((sx) => (
          <B key={sx} p={[bw / 2 - 0.35 + sx * 0.3, 0.42, bd / 2 + 0.45]} s={[0.04, 0.84, 0.04]} c="#e2e8f0" />
        ))}
        <B p={[0, 1.08, bd / 2 + 0.01]} s={[bw, 0.1, 0.03]} c="#15803d" />
        {/* the red cross on a white board standing up from the roof */}
        <B p={[0, 1.62, bd / 2 + 0.04]} s={[0.5, 0.5, 0.04]} c="#ffffff" />
        <B p={[0, 1.62, bd / 2 + 0.065]} s={[0.12, 0.38, 0.02]} c="#dc2626" />
        <B p={[0, 1.62, bd / 2 + 0.065]} s={[0.38, 0.12, 0.02]} c="#dc2626" />
        <B p={[bw / 2 - 0.35, 0.3, bd / 2 + 0.02]} s={[0.3, 0.6, 0.04]} c="#475569" />
      </group>
    </group>
  );
}

export { Tree as CityTree, Bus, Horse };
