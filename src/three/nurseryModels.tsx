// Nursery furniture for adopted children (game/kids.ts): a cot, a high chair, a baby bath on a changing table, a play
// mat and a toy box. Same rules as models.tsx: centred on the footprint, on y=0, front facing +z.

import type { ReactNode } from 'react';
import { B } from './models';

type V3 = [number, number, number];

function Cyl({ p, r, h, c, rot }: { p: V3; r: number; h: number; c: string; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, h, 12]} />
      <meshStandardMaterial color={c} roughness={0.6} />
    </mesh>
  );
}

function Ball({ p, r, c }: { p: V3; r: number; c: string }) {
  return (
    <mesh position={p} castShadow>
      <icosahedronGeometry args={[r, 2]} />
      <meshStandardMaterial color={c} roughness={0.55} />
    </mesh>
  );
}

const WOOD = '#e8d2ad';
const WOOD_DARK = '#c9a877';

function Cot() {
  const w = 0.64, d = 0.94, top = 0.92, base = 0.42;
  const bars = (n: number, len: number, along: 'x' | 'z', at: number) =>
    Array.from({ length: n }, (_, i) => {
      const t = -len / 2 + ((i + 1) * len) / (n + 1);
      return <B key={`${along}${at}${i}`} p={along === 'x' ? [t, (base + top) / 2, at] : [at, (base + top) / 2, t]} s={[0.025, top - base, 0.025]} c={WOOD} />;
    });
  return (
    <group>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <B key={i} p={[(sx * (w - 0.05)) / 2, top / 2, (sz * (d - 0.05)) / 2]} s={[0.05, top, 0.05]} c={WOOD_DARK} />
      ))}
      <B p={[0, base - 0.04, 0]} s={[w - 0.04, 0.05, d - 0.04]} c={WOOD_DARK} />
      {/* Mattress, sheet and a little pillow */}
      <B p={[0, base + 0.04, 0]} s={[w - 0.08, 0.1, d - 0.08]} c="#f8fafc" r={0.04} />
      <B p={[0, base + 0.095, 0.12]} s={[w - 0.1, 0.02, d * 0.55]} c="#93c5fd" r={0.01} />
      <B p={[0, base + 0.11, -d / 2 + 0.17]} s={[0.26, 0.06, 0.14]} c="#fff7ed" r={0.03} />
      {/* Rails and slats */}
      {[-1, 1].map((s) => <B key={`rx${s}`} p={[0, top - 0.02, (s * (d - 0.05)) / 2]} s={[w, 0.04, 0.04]} c={WOOD_DARK} />)}
      {[-1, 1].map((s) => <B key={`rz${s}`} p={[(s * (w - 0.05)) / 2, top - 0.02, 0]} s={[0.04, 0.04, d]} c={WOOD_DARK} />)}
      {bars(5, w - 0.08, 'x', -(d - 0.05) / 2)}
      {bars(5, w - 0.08, 'x', (d - 0.05) / 2)}
      {bars(8, d - 0.08, 'z', -(w - 0.05) / 2)}
      {bars(8, d - 0.08, 'z', (w - 0.05) / 2)}
      {/* A mobile over the head end */}
      <B p={[-(w - 0.05) / 2, top + 0.25, -d / 2 + 0.1]} s={[0.025, 0.5, 0.025]} c="#f8fafc" />
      <B p={[-(w - 0.05) / 4, top + 0.48, -d / 2 + 0.1]} s={[w / 2, 0.02, 0.02]} c="#f8fafc" />
      <Ball p={[-0.08, top + 0.36, -d / 2 + 0.1]} r={0.04} c="#facc15" />
      <Ball p={[0.02, top + 0.33, -d / 2 + 0.14]} r={0.035} c="#f472b6" />
      <Ball p={[-0.02, top + 0.38, -d / 2 + 0.04]} r={0.03} c="#38bdf8" />
    </group>
  );
}

function HighChair() {
  const seat = 0.62;
  return (
    <group>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <group key={i} position={[sx * 0.2, seat / 2, sz * 0.2]} rotation={[sz * 0.12, 0, -sx * 0.12]}>
          <B p={[0, 0, 0]} s={[0.04, seat + 0.04, 0.04]} c="#f8fafc" />
        </group>
      ))}
      <B p={[0, 0.18, 0.2]} s={[0.36, 0.03, 0.03]} c="#f8fafc" />
      <B p={[0, seat, 0]} s={[0.34, 0.06, 0.34]} c="#fb923c" r={0.03} />
      <B p={[0, seat + 0.25, -0.16]} s={[0.34, 0.46, 0.05]} c="#fb923c" r={0.03} />
      {[-1, 1].map((s) => <B key={s} p={[s * 0.16, seat + 0.12, 0]} s={[0.03, 0.18, 0.3]} c="#fdba74" />)}
      {/* Tray, with a plate and a cup */}
      <B p={[0, seat + 0.2, 0.2]} s={[0.44, 0.03, 0.22]} c="#f8fafc" r={0.015} />
      <Cyl p={[-0.07, seat + 0.225, 0.2]} r={0.06} h={0.015} c="#22c55e" />
      <Cyl p={[0.12, seat + 0.26, 0.21]} r={0.025} h={0.08} c="#38bdf8" />
    </group>
  );
}

function BabyBath() {
  return (
    <group>
      <B p={[0, 0.4, 0]} s={[0.8, 0.8, 0.5]} c="#f1f5f9" r={0.03} />
      {[-0.2, 0.2].map((x) => <B key={x} p={[x, 0.42, 0.255]} s={[0.36, 0.68, 0.015]} c="#e2e8f0" />)}
      {[-0.2, 0.2].map((x) => <B key={x} p={[x - 0.1 * Math.sign(x), 0.42, 0.268]} s={[0.03, 0.12, 0.02]} c="#94a3b8" />)}
      {/* The tub on one side, a changing pad on the other */}
      <B p={[-0.17, 0.88, 0]} s={[0.42, 0.16, 0.42]} c="#7dd3fc" r={0.07} />
      <B p={[-0.17, 0.95, 0]} s={[0.34, 0.03, 0.34]} c="#e0f2fe" o={0.85} />
      <B p={[0.22, 0.83, 0]} s={[0.32, 0.06, 0.44]} c="#fbcfe8" r={0.03} />
      <B p={[0.22, 0.87, -0.16]} s={[0.3, 0.04, 0.08]} c="#f9a8d4" r={0.02} />
      <Cyl p={[0.33, 0.9, 0.17]} r={0.03} h={0.1} c="#fde68a" />
      <B p={[0.4, 0.62, 0.2]} s={[0.03, 0.34, 0.16]} c="#a7f3d0" />
    </group>
  );
}

const MAT = ['#f87171', '#facc15', '#4ade80', '#60a5fa'];
function PlayMat() {
  return (
    <group>
      {Array.from({ length: 16 }, (_, i) => {
        const x = (i % 4) - 1.5, z = Math.floor(i / 4) - 1.5;
        return <B key={i} p={[x * 0.45, 0.012, z * 0.45]} s={[0.44, 0.02, 0.44]} c={MAT[(i + Math.floor(i / 4)) % 4]} />;
      })}
      {/* Stacking blocks and a ball left out */}
      <B p={[0.42, 0.06, 0.3]} s={[0.09, 0.09, 0.09]} c="#a855f7" />
      <B p={[0.42, 0.15, 0.3]} s={[0.08, 0.08, 0.08]} c="#f97316" />
      <B p={[0.54, 0.06, 0.38]} s={[0.09, 0.09, 0.09]} c="#14b8a6" />
      <Ball p={[-0.5, 0.09, -0.4]} r={0.08} c="#ef4444" />
      <Cyl p={[-0.35, 0.04, 0.45]} r={0.07} h={0.05} c="#f8fafc" />
    </group>
  );
}

function ToyBox() {
  return (
    <group>
      <B p={[0, 0.24, 0]} s={[0.72, 0.46, 0.5]} c="#38bdf8" r={0.03} />
      <B p={[0, 0.24, 0.252]} s={[0.6, 0.06, 0.01]} c="#facc15" />
      <B p={[0, 0.1, 0.252]} s={[0.6, 0.04, 0.01]} c="#f472b6" />
      {/* Lid propped open behind, toys poking out */}
      <group position={[0, 0.48, -0.25]} rotation={[-1.1, 0, 0]}>
        <B p={[0, 0, 0.25]} s={[0.74, 0.04, 0.52]} c="#0ea5e9" r={0.02} />
      </group>
      <Ball p={[-0.18, 0.5, 0.05]} r={0.1} c="#ef4444" />
      {/* Teddy */}
      <Ball p={[0.15, 0.52, -0.02]} r={0.09} c="#b45309" />
      <Ball p={[0.15, 0.66, -0.02]} r={0.065} c="#b45309" />
      <Ball p={[0.1, 0.71, -0.02]} r={0.025} c="#92400e" />
      <Ball p={[0.2, 0.71, -0.02]} r={0.025} c="#92400e" />
      <B p={[0.02, 0.55, 0.12]} s={[0.07, 0.07, 0.07]} c="#22c55e" />
    </group>
  );
}

const NURSERY: Record<string, () => ReactNode> = {
  baby_cot: Cot,
  high_chair: HighChair,
  baby_bath: BabyBath,
  play_mat: PlayMat,
  toy_box: ToyBox,
};

/** The model for a nursery item, or null if `type` is not one. */
export function nurseryModel(type: string): ReactNode | null {
  const M = NURSERY[type];
  return M ? <M /> : null;
}
