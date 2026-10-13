// Outside the back wall: the platform behind the station hall, with the train standing at it.
// Platform with its yellow line, the green-and-white train on the near track, a goods train on the far one.

import type { Interior } from '../game/interiors';
import { B, Cyl, Label } from './propKit';
import { StaticBatch } from './StaticBatch';

const GREEN = '#15803d';
const WHITE = '#f8fafc';
const TRACK = 1.5;

/** Rails and sleepers along x, centred on `z`. */
function Track({ x0, x1, z }: { x0: number; x1: number; z: number }) {
  const len = x1 - x0;
  return (
    <group>
      {Array.from({ length: Math.floor(len / 1.3) }, (_, i) => <B key={i} p={[x0 + 0.65 + i * 1.3, 0.04, z]} s={[0.26, 0.06, TRACK + 0.6]} c="#4a3b2a" />)}
      {[-TRACK / 2, TRACK / 2].map((dz) => <B key={dz} p={[(x0 + x1) / 2, 0.1, z + dz]} s={[len, 0.08, 0.08]} c="#3f3f46" />)}
    </group>
  );
}

/** A passenger coach, lying along x, its doors on the +z (platform) side. */
function Coach({ len }: { len: number }) {
  const n = Math.max(2, Math.floor((len - 2.2) / 1.05));
  return (
    <group>
      <B p={[0, 1.6, 0]} s={[len, 1.9, 1.7]} c={WHITE} />
      <B p={[0, 0.98, 0]} s={[len + 0.02, 0.34, 1.72]} c={GREEN} />
      <B p={[0, 2.6, 0]} s={[len - 0.3, 0.14, 1.4]} c="#9ca3af" />
      {Array.from({ length: n }, (_, i) => <B key={i} p={[-((n - 1) * 1.05) / 2 + i * 1.05, 1.9, 0.855]} s={[0.78, 0.56, 0.02]} c="#1e293b" />)}
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[s * (len / 2 - 0.55), 1.42, 0.86]} s={[0.62, 1.5, 0.02]} c="#0f172a" />
          <B p={[s * (len / 2 - 0.55), 0.6, 1.0]} s={[0.7, 0.06, 0.3]} c="#64748b" />
          <B p={[s * (len / 2 - 1.5), 0.4, 0]} s={[1.5, 0.5, 1.4]} c="#1f2937" />
        </group>
      ))}
    </group>
  );
}

/** The locomotive: green, a white band, yellow nose. Cab at the +x end. */
function Loco({ len }: { len: number }) {
  return (
    <group>
      <B p={[0, 1.55, 0]} s={[len, 1.8, 1.7]} c={GREEN} />
      <B p={[0, 1.3, 0]} s={[len + 0.02, 0.26, 1.72]} c={WHITE} />
      <B p={[len / 2 - 0.5, 2.1, 0]} s={[0.9, 0.5, 1.74]} c="#1e293b" />
      <B p={[len / 2 + 0.02, 1.0, 0]} s={[0.06, 0.6, 1.5]} c="#facc15" />
      <B p={[-0.6, 2.52, 0]} s={[len - 1.8, 0.16, 1.2]} c="#14532d" />
      {[-1, 1].map((s) => <B key={s} p={[s * (len / 2 - 1.2), 0.4, 0]} s={[1.6, 0.5, 1.4]} c="#1f2937" />)}
      {[-0.5, 0.5].map((z) => <B key={z} p={[len / 2 + 0.03, 1.5, z]} s={[0.04, 0.16, 0.26]} c="#fef9c3" e="#fde68a" />)}
    </group>
  );
}

export function StationPlatform({ it }: { it: Interior }) {
  const depth = it.behind ?? 9;
  const glass = it.glass ?? [[1, 5], [9, 13]];
  const x0 = -1.2;
  const x1 = it.w + 1.2;
  const wide = x1 - x0;
  const mid = (x0 + x1) / 2;
  const edge = -3;
  const near = edge - 1.45;
  const far = near - 3;
  // The solid stretch of wall between the two windows: the canopy stands behind it, where it hides nothing.
  const pierFrom = glass[0][1];
  const pierTo = glass[1]?.[0] ?? pierFrom + 4;
  const pier = (pierFrom + pierTo) / 2;
  // Loco at the right-hand end, two coaches behind it.
  const loco = 4.6;
  const coach = (wide - loco - 0.8) / 2;
  return (
    <StaticBatch>
      {/* Platform: paving, the yellow line, the white edge */}
      <B p={[mid, 0.03, (edge - 0.07) / 2]} s={[wide, 0.08, -edge - 0.07]} c="#cfcac4" />
      <B p={[mid, 0.075, edge + 0.55]} s={[wide, 0.012, 0.18]} c="#facc15" />
      <B p={[mid, 0.075, edge + 0.08]} s={[wide, 0.012, 0.12]} c={WHITE} />
      {/* Ballast and the two tracks */}
      <B p={[mid, 0.004, (edge - depth + 0.4) / 2]} s={[wide, 0.02, depth - 0.4 + edge]} c="#756f68" />
      <Track x0={x0} x1={x1} z={near} />
      <Track x0={x0} x1={x1} z={far} />
      {/* The train */}
      <group position={[x1 - 0.2 - loco / 2, 0, near]}>
        <Loco len={loco} />
      </group>
      {[0, 1].map((i) => (
        <group key={i} position={[x1 - 0.2 - loco - 0.2 - coach / 2 - i * (coach + 0.2), 0, near]}>
          <Coach len={coach} />
        </group>
      ))}
      {/* Goods wagons on the far track */}
      {[0, 1].map((i) => (
        <group key={`w${i}`} position={[x0 + 3.4 + i * 5.6, 0, far]}>
          <B p={[0, 0.62, 0]} s={[5.2, 0.2, 1.6]} c="#374151" />
          {[-1.6, 1.6].map((x) => <B key={x} p={[x, 0.36, 0]} s={[1.3, 0.4, 1.3]} c="#1f2937" />)}
          <B p={[-1.3, 1.5, 0]} s={[2.4, 1.56, 1.5]} c={i ? '#b91c1c' : '#1d4ed8'} />
          <B p={[1.3, 1.5, 0]} s={[2.4, 1.56, 1.5]} c={i ? '#f59e0b' : '#0f766e'} />
        </group>
      ))}
      {/* Canopy and name board behind the pier */}
      {[pierFrom + 0.4, pierTo - 0.4].map((x) => <B key={x} p={[x, 1.55, -1.5]} s={[0.14, 3.1, 0.14]} c="#94a3b8" />)}
      <B p={[pier, 3.16, -1.5]} s={[pierTo - pierFrom + 1, 0.12, 2.8]} c={GREEN} />
      <B p={[pier, 2.5, -2.3]} s={[2.4, 0.5, 0.08]} c="#14532d" />
      <Label p={[pier, 2.5, -2.255]} w={2.3} h={0.42} text="PLATFORM 1" bg="#14532d" />
      {/* Lamps and benches along the platform, a signal at the far end */}
      {glass.map(([from, to]) => {
        const x = (from + to) / 2;
        return (
          <group key={from}>
            <B p={[x + 1.6, 1.6, -0.5]} s={[0.08, 3.2, 0.08]} c="#64748b" />
            <B p={[x + 1.6, 3.2, -0.8]} s={[0.14, 0.08, 0.7]} c="#64748b" />
            <B p={[x + 1.6, 3.14, -1.05]} s={[0.2, 0.06, 0.2]} c="#fef9c3" e="#fde68a" />
            <B p={[x - 1.2, 0.5, -0.5]} s={[1.5, 0.08, 0.4]} c="#92400e" />
            {[-0.6, 0.6].map((dx) => <B key={dx} p={[x - 1.2 + dx, 0.28, -0.5]} s={[0.08, 0.44, 0.36]} c="#475569" />)}
          </group>
        );
      })}
      <group position={[x0 + 0.8, 0, far + 1.5]}>
        <Cyl p={[0, 1.5, 0]} r={0.06} h={3} c="#475569" />
        <B p={[0, 3.0, 0]} s={[0.3, 0.7, 0.2]} c="#111827" />
        <B p={[0, 3.18, 0.11]} s={[0.14, 0.14, 0.01]} c="#ef4444" e="#ef4444" />
        <B p={[0, 2.84, 0.11]} s={[0.14, 0.14, 0.01]} c="#14532d" />
      </group>
    </StaticBatch>
  );
}
