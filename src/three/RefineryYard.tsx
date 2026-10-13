// Outside the back wall: the yard outside the refinery control room: tanks, pipes and the flare.
// A pipe rack runs past the window; behind it the storage tanks, the gas sphere, the column and the flare stack.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { Interior } from '../game/interiors';
import { B, Ball, Cyl } from './propKit';
import { StaticBatch } from './StaticBatch';

type V3 = [number, number, number];
const ACROSS: V3 = [0, 0, Math.PI / 2];

/** Flat-roofed storage tank with its band, ladder and top rail. */
function Tank({ p, r, h }: { p: V3; r: number; h: number }) {
  return (
    <group position={p}>
      <Cyl p={[0, h / 2, 0]} r={r} h={h} c="#e5e7eb" seg={18} />
      <Cyl p={[0, h * 0.62, 0]} r={r + 0.02} h={0.4} c="#15803d" seg={18} />
      <Cyl p={[0, h + 0.05, 0]} r={r} rt={r * 0.86} h={0.1} c="#cbd5e1" seg={18} />
      <Cyl p={[0, h + 0.4, 0]} r={r * 0.9} h={0.04} c="#facc15" seg={18} />
      <B p={[0, h / 2, r + 0.05]} s={[0.4, h, 0.06]} c="#64748b" />
      {Array.from({ length: Math.floor(h / 0.5) }, (_, i) => <B key={i} p={[0, 0.3 + i * 0.5, r + 0.09]} s={[0.4, 0.05, 0.04]} c="#facc15" />)}
    </group>
  );
}

/** The flame at the top of the stack. It never goes out. */
function Flame({ p }: { p: V3 }) {
  const flame = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flame.current.scale.set(1 + Math.sin(t * 9) * 0.18, 1 + Math.sin(t * 13) * 0.25, 1 + Math.cos(t * 11) * 0.18);
    flame.current.rotation.z = Math.sin(t * 3) * 0.12;
  });
  return (
    <group position={p} userData={{ dynamic: true }}>
      <mesh ref={flame} position={[0, 0.8, 0]}>
        <coneGeometry args={[0.5, 1.8, 7]} />
        <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} flatShading />
      </mesh>
    </group>
  );
}

export function RefineryYard({ it }: { it: Interior }) {
  const depth = it.behind ?? 13;
  const x0 = -1.2;
  const x1 = it.w + 1.2;
  const wide = x1 - x0;
  const mid = (x0 + x1) / 2;
  const stack: V3 = [x1 - 1.2, 0, -depth + 1.6];
  return (
    <group>
      <StaticBatch>
        <B p={[mid, 0.004, -depth / 2 - 0.2]} s={[wide, 0.02, depth - 0.6]} c="#a3a8b0" />
        <B p={[mid, 0.02, -3.6]} s={[wide, 0.012, 0.12]} c="#facc15" />
        {/* Pipe rack past the window */}
        {Array.from({ length: Math.floor(wide / 3.2) + 1 }, (_, i) => {
          const x = x0 + 0.6 + i * 3.2;
          return (
            <group key={i}>
              {[-1.5, -2.7].map((z) => <B key={z} p={[x, 1.0, z]} s={[0.12, 2.0, 0.12]} c="#475569" />)}
              <B p={[x, 1.2, -2.1]} s={[0.12, 0.1, 1.3]} c="#475569" />
              <B p={[x, 1.95, -2.1]} s={[0.12, 0.1, 1.3]} c="#475569" />
            </group>
          );
        })}
        {[[-1.7, 1.4, 0.14, '#f59e0b'], [-2.1, 1.4, 0.11, '#9ca3af'], [-2.5, 1.4, 0.14, '#e5e7eb'], [-1.9, 2.15, 0.1, '#dc2626'], [-2.4, 2.15, 0.12, '#f59e0b']].map(([z, y, r, c], i) => (
          <Cyl key={i} p={[mid, y as number, z as number]} r={r as number} h={wide - 0.6} c={c as string} seg={8} rot={ACROSS} />
        ))}
        {/* Storage tanks and the gas sphere */}
        <Tank p={[x0 + 3.2, 0, -7]} r={2.4} h={3.6} />
        <Tank p={[x0 + 8.6, 0, -9.4]} r={2.2} h={4.2} />
        <group position={[mid + 2.6, 0, -6.2]}>
          <Ball p={[0, 2.0, 0]} r={1.5} c="#f1f5f9" />
          {[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z], i) => <B key={i} p={[x, 0.7, z]} s={[0.14, 1.4, 0.14]} c="#64748b" />)}
          <Cyl p={[0, 2.0, 0]} r={1.52} h={0.14} c="#dc2626" seg={14} />
        </group>
        {/* Process unit: the column, its platforms, the block of the plant */}
        <group position={[x1 - 3.6, 0, -6.4]}>
          <B p={[0.6, 1.3, 0.4]} s={[2.8, 2.6, 2.2]} c="#475569" />
          {[0.9, 1.8, 2.62].map((y) => <B key={y} p={[0.6, y, 1.52]} s={[2.8, 0.06, 0.06]} c="#facc15" />)}
          <Cyl p={[-0.6, 4.6, -0.6]} r={0.6} h={9.2} c="#cbd5e1" seg={12} />
          {[3.2, 5.4, 7.6].map((y) => <Cyl key={y} p={[-0.6, y, -0.6]} r={0.95} h={0.08} c="#facc15" seg={12} />)}
          <Cyl p={[-0.6, 9.3, -0.6]} r={0.3} rt={0.6} h={0.4} c="#94a3b8" seg={12} />
          <Cyl p={[1.4, 3.6, 0.6]} r={0.22} h={2.2} c="#94a3b8" />
        </group>
        {/* Flare stack */}
        <group position={stack}>
          {[0, 1, 2, 3, 4].map((i) => <Cyl key={i} p={[0, 1.1 + i * 2.2, 0]} r={0.2} rt={0.18} h={2.2} c={i % 2 ? '#f8fafc' : '#dc2626'} seg={8} />)}
          <Cyl p={[0, 11.1, 0]} r={0.3} h={0.2} c="#1f2937" seg={8} />
          {[-0.7, 0.7].map((x) => <B key={x} p={[x * 0.5, 2.5, 0]} s={[0.06, 5, 0.06]} c="#64748b" />)}
        </group>
        {/* Drums and a pump by the door */}
        {[[x1 - 2.4, -1.0], [x1 - 1.9, -1.2], [x1 - 2.2, -0.6]].map(([x, z], i) => <Cyl key={`d${i}`} p={[x, 0.42, z]} r={0.22} h={0.84} c={i === 1 ? '#dc2626' : '#1d4ed8'} />)}
      </StaticBatch>
      <Flame p={[stack[0], 11.2, stack[2]]} />
    </group>
  );
}
