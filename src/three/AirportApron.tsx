// What you see through the terminal's glass: the apron behind the back wall, an airliner nose-in on the
// jet bridge at gate A1, a private jet on the stand at A2, the tower, and a flight leaving off the far runway.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Interior } from '../game/interiors';
import { B } from './models';
import { Cyl } from './propKit';
import { StaticBatch } from './StaticBatch';

type V3 = [number, number, number];

const ALONG: V3 = [Math.PI / 2, 0, 0];
const GREEN = '#15803d';
const WHITE = '#f8fafc';

/** A wing or tailplane: a tapered slab swept back from the root. `side` is -1 (left of the nose) or 1. */
function Wing({ p, span, chord, sweep, side, c = '#e2e8f0', t = 0.14 }: { p: V3; span: number; chord: number; sweep: number; side: number; c?: string; t?: number }) {
  return (
    <group position={p} rotation={[0, side * sweep, 0]}>
      <B p={[(side * span) / 2, 0, 0]} s={[span, t, chord]} c={c} />
      <B p={[side * (span - 0.2), 0.02, -chord * 0.1]} s={[0.4, t + 0.02, chord * 0.7]} c={c} />
    </group>
  );
}

/** Airliner, nose towards +z, wheels on y=0. About 13 long. */
function Airliner() {
  const r = 0.95;
  const y = 1.95;
  return (
    <group>
      {/* Fuselage, nose and tail cone */}
      <Cyl p={[0, y, -5.4]} r={r} h={8.4} c={WHITE} seg={14} rot={ALONG} />
      <Cyl p={[0, y - 0.08, -0.55]} r={r} rt={0.3} h={1.5} c={WHITE} seg={14} rot={ALONG} />
      <Cyl p={[0, y - 0.3, 0.3]} r={0.3} rt={0.08} h={0.3} c="#334155" seg={10} rot={ALONG} />
      <Cyl p={[0, y + 0.22, -10.8]} r={0.34} rt={r} h={2.6} c={WHITE} seg={14} rot={ALONG} />
      {/* Cheatline and cabin windows */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[s * (r - 0.02), y - 0.18, -5.4]} s={[0.06, 0.16, 8.2]} c={GREEN} />
          {Array.from({ length: 13 }, (_, i) => <B key={i} p={[s * (r - 0.03), y + 0.2, -1.9 - i * 0.56]} s={[0.07, 0.2, 0.26]} c="#1e293b" />)}
          <B p={[s * 0.5, y + 0.38, -0.5]} s={[0.36, 0.26, 0.5]} c="#0f172a" />
        </group>
      ))}
      <B p={[0, y + 0.42, -0.34]} s={[0.7, 0.24, 0.3]} c="#0f172a" />
      {/* Forward door, where the bridge meets it */}
      <B p={[r - 0.02, y - 0.05, -1.5]} s={[0.07, 1.1, 0.6]} c="#cbd5e1" />
      {/* Wings and engines */}
      {[-1, 1].map((s) => (
        <group key={`w${s}`}>
          <Wing p={[s * 0.6, y - 0.55, -5.2]} span={5.6} chord={2.0} sweep={0.42} side={s} />
          <Cyl p={[s * 2.7, y - 1.05, -5.3]} r={0.48} rt={0.42} h={1.7} c="#cbd5e1" seg={12} rot={ALONG} />
          <Cyl p={[s * 2.7, y - 1.05, -4.43]} r={0.36} h={0.06} c="#1f2937" seg={12} rot={ALONG} />
          <B p={[s * 2.7, y - 0.68, -5.5]} s={[0.12, 0.34, 1.2]} c="#cbd5e1" />
          <Wing p={[s * 0.3, y + 0.35, -11.0]} span={2.4} chord={1.0} sweep={0.5} side={s} t={0.1} />
        </group>
      ))}
      {/* Fin, in the colours of the flag */}
      <group position={[0, y + 0.7, -10.9]} rotation={[-0.5, 0, 0]}>
        <B p={[0, 1.4, 0]} s={[0.16, 3.0, 1.7]} c={GREEN} />
        <B p={[0, 1.5, 0]} s={[0.18, 0.7, 1.72]} c={WHITE} />
      </group>
      {/* Undercarriage */}
      <B p={[0, 0.55, -1.4]} s={[0.1, 1.0, 0.1]} c="#64748b" />
      <Cyl p={[0, 0.22, -1.4]} r={0.22} h={0.34} c="#111827" rot={[0, 0, Math.PI / 2]} />
      {[-1.3, 1.3].map((x) => (
        <group key={x}>
          <B p={[x, 0.6, -5.8]} s={[0.12, 1.0, 0.12]} c="#64748b" />
          <Cyl p={[x, 0.28, -5.8]} r={0.28} h={0.5} c="#111827" rot={[0, 0, Math.PI / 2]} />
        </group>
      ))}
    </group>
  );
}

/** Business jet, nose towards +z: low wing, engines on the tail, T-tail. About 7 long. */
function PrivateJet() {
  const r = 0.55;
  const y = 1.15;
  return (
    <group>
      <Cyl p={[0, y, -2.9]} r={r} h={4.2} c={WHITE} seg={12} rot={ALONG} />
      <Cyl p={[0, y - 0.06, -0.35]} r={r} rt={0.14} h={1.1} c={WHITE} seg={12} rot={ALONG} />
      <Cyl p={[0, y + 0.14, -5.8]} r={0.18} rt={r} h={1.6} c={WHITE} seg={12} rot={ALONG} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <B p={[s * (r - 0.02), y - 0.12, -2.9]} s={[0.05, 0.1, 4.2]} c="#ca8a04" />
          {[0, 1, 2, 3, 4].map((i) => <B key={i} p={[s * (r - 0.03), y + 0.14, -1.6 - i * 0.6]} s={[0.06, 0.2, 0.3]} c="#1e293b" />)}
          <B p={[s * 0.28, y + 0.24, -0.5]} s={[0.24, 0.18, 0.4]} c="#0f172a" />
          <Wing p={[s * 0.3, y - 0.4, -3.1]} span={3.0} chord={1.1} sweep={0.4} side={s} t={0.09} />
          <Cyl p={[s * 0.85, y + 0.3, -4.9]} r={0.26} rt={0.22} h={1.2} c="#cbd5e1" seg={10} rot={ALONG} />
          <Wing p={[s * 0.05, y + 1.75, -6.3]} span={1.3} chord={0.6} sweep={0.45} side={s} t={0.07} />
        </group>
      ))}
      <group position={[0, y + 0.4, -6.0]} rotation={[-0.6, 0, 0]}>
        <B p={[0, 0.7, 0]} s={[0.1, 1.6, 0.9]} c="#111827" />
        <B p={[0, 0.7, 0]} s={[0.12, 0.3, 0.92]} c="#ca8a04" />
      </group>
      {/* Door let down as steps */}
      <group position={[r + 0.3, 0.5, -1.2]} rotation={[0, 0, -0.9]}>
        <B p={[0, 0, 0]} s={[0.08, 1.1, 0.6]} c="#e2e8f0" />
        {[-0.35, -0.1, 0.15, 0.4].map((s) => <B key={s} p={[-0.06, s, 0]} s={[0.14, 0.04, 0.56]} c="#94a3b8" />)}
      </group>
      <B p={[r - 0.02, y + 0.05, -1.2]} s={[0.05, 0.9, 0.6]} c="#0f172a" />
      <B p={[0, 0.3, -0.9]} s={[0.07, 0.6, 0.07]} c="#64748b" />
      <Cyl p={[0, 0.14, -0.9]} r={0.14} h={0.2} c="#111827" rot={[0, 0, Math.PI / 2]} />
      {[-0.8, 0.8].map((x) => (
        <group key={x}>
          <B p={[x, 0.35, -3.3]} s={[0.08, 0.6, 0.08]} c="#64748b" />
          <Cyl p={[x, 0.17, -3.3]} r={0.17} h={0.26} c="#111827" rot={[0, 0, Math.PI / 2]} />
        </group>
      ))}
    </group>
  );
}

/** Baggage tug pulling carts of bags. Faces +x. */
function BaggageTrain() {
  return (
    <group>
      <B p={[0, 0.4, 0]} s={[1.3, 0.5, 0.8]} c="#facc15" />
      <B p={[-0.25, 0.85, 0]} s={[0.6, 0.5, 0.7]} c="#1f2937" />
      <B p={[-0.25, 1.14, 0]} s={[0.7, 0.06, 0.8]} c="#facc15" />
      {[-0.4, 0.4].map((x) => [-0.4, 0.4].map((z) => <Cyl key={`${x}${z}`} p={[x, 0.16, z]} r={0.16} h={0.12} c="#111827" rot={ALONG} />))}
      {[1, 2].map((n) => (
        <group key={n} position={[-n * 1.7, 0, 0]}>
          <B p={[0, 0.32, 0]} s={[1.4, 0.1, 0.9]} c="#64748b" />
          <B p={[0.85, 0.3, 0]} s={[0.3, 0.05, 0.05]} c="#334155" />
          {[-0.45, 0.45].map((x) => [-0.4, 0.4].map((z) => <Cyl key={`${x}${z}`} p={[x, 0.14, z]} r={0.14} h={0.1} c="#111827" rot={ALONG} />))}
          {[['#7c2d12', -0.4, 0.55, -0.2], ['#1d4ed8', 0.2, 0.55, 0.15], ['#111827', -0.1, 0.9, 0], ['#b91c1c', 0.45, 0.55, -0.25]].map(([c, x, y2, z], i) => (
            <B key={i} p={[x as number, y2 as number, z as number]} s={[0.5, 0.34, 0.36]} c={c as string} />
          ))}
        </group>
      ))}
    </group>
  );
}

function Cone({ p }: { p: V3 }) {
  return (
    <mesh position={[p[0], 0.25, p[2]]} castShadow>
      <coneGeometry args={[0.16, 0.5, 8]} />
      <meshStandardMaterial color="#f97316" flatShading />
    </mesh>
  );
}

/** Ground crew in a hi-vis vest, batons up. */
function Marshal({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <B p={[0, 0.45, 0]} s={[0.3, 0.9, 0.22]} c="#1f2937" />
      <B p={[0, 1.15, 0]} s={[0.4, 0.55, 0.26]} c="#facc15" />
      <B p={[0, 1.2, 0.135]} s={[0.4, 0.07, 0.01]} c="#e5e7eb" />
      <B p={[0, 1.58, 0]} s={[0.24, 0.26, 0.24]} c="#5a371e" />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.3, 1.4, 0]} rotation={[0, 0, s * -0.7]}>
          <B p={[0, 0.3, 0]} s={[0.1, 0.6, 0.1]} c="#facc15" />
          <B p={[0, 0.8, 0]} s={[0.07, 0.45, 0.07]} c="#f97316" e="#c2410c" />
        </group>
      ))}
    </group>
  );
}

/** The flight that leaves while you watch: rolls down the far runway, lifts off and climbs away. */
function Departure({ z, x0, len }: { z: number; x0: number; len: number }) {
  const plane = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 22) / 22;
    const g = plane.current;
    g.visible = t > 0.08 && t < 0.8;
    const run = Math.max(0, t - 0.08) / 0.72;
    const x = x0 + run * run * (len + 26);
    const lift = Math.max(0, x - (x0 + len * 0.55));
    g.position.set(x, lift * 0.3, z);
    g.rotation.z = Math.min(0.26, lift * 0.05);
  });
  return (
    <group ref={plane} userData={{ dynamic: true }}>
      <group rotation={[0, Math.PI / 2, 0]} scale={0.75} position={[0, 0, 0]}>
        <group position={[0, 0, 6]}>
          <Airliner />
        </group>
      </group>
    </group>
  );
}

export function AirportApron({ it }: { it: Interior }) {
  const depth = it.behind ?? 19;
  const [a1, a2] = it.glass ?? [[4, 10], [14, 20]];
  const gate1 = (a1[0] + a1[1]) / 2;
  const gate2 = (a2[0] + a2[1]) / 2;
  // Middle of each gate's door in the back wall (game/interiors.ts).
  const door1 = a1[1] - 1;
  const door2 = a2[0] + 1;
  const x0 = -1.2;
  const x1 = it.w + 1.2;
  const wide = x1 - x0;
  const mid = (x0 + x1) / 2;
  const runway = -depth + 2.2;
  return (
    <group>
      <StaticBatch>
        {/* Tarmac, stand lines and the service road */}
        <B p={[mid, 0.004, -depth / 2 - 0.2]} s={[wide, 0.02, depth - 0.6]} c="#8d939c" />
        <B p={[gate1, 0.02, -7]} s={[0.14, 0.012, 12]} c="#facc15" />
        <B p={[gate1, 0.02, -1.3]} s={[1.6, 0.012, 0.14]} c="#facc15" />
        {[-1.4, -8.2].map((z) => <B key={z} p={[gate2 + 0.4, 0.02, z]} s={[9, 0.012, 0.12]} c="#facc15" />)}
        <B p={[mid, 0.018, -14.4]} s={[wide, 0.012, 0.1]} c="#f8fafc" />
        {/* Runway: centre dashes, edge lights */}
        <B p={[mid, 0.016, runway]} s={[wide, 0.014, 3]} c="#3f4249" />
        {Array.from({ length: Math.floor(wide / 2.4) }, (_, i) => <B key={i} p={[x0 + 1.2 + i * 2.4, 0.03, runway]} s={[1.2, 0.01, 0.16]} c="#f8fafc" />)}
        {Array.from({ length: Math.floor(wide / 3) + 1 }, (_, i) => [-1.6, 1.6].map((z) => <B key={`${i}${z}`} p={[x0 + 0.4 + i * 3, 0.06, runway + z]} s={[0.1, 0.1, 0.1]} c="#fde68a" e="#f59e0b" />))}

        {/* Gate A1: the airliner and its bridge */}
        <group position={[gate1, 0, -1.4]}>
          <Airliner />
        </group>
        <group position={[door1, 0, 0]}>
          {/* Tunnel ramping up from the gate door to the aircraft's forward door */}
          <B p={[0, 1.3, -0.25]} s={[1.5, 2.6, 0.4]} c="#cbd5e1" />
          <group position={[-0.17, 1.5, -1.6]} rotation={[0.37, 0.13, 0]}>
            <B p={[0, 0, 0]} s={[1.2, 1.3, 3.0]} c="#e2e8f0" />
            <B p={[0, 0.2, 0]} s={[1.22, 0.5, 2.4]} c="#93c5fd" o={0.55} />
            <B p={[0, -0.5, 0]} s={[1.24, 0.14, 3.0]} c={GREEN} />
          </group>
          <B p={[-0.3, 2.0, -3.0]} s={[1.3, 1.4, 1.1]} c="#cbd5e1" />
          <B p={[-0.1, 0.7, -2.6]} s={[0.22, 1.4, 0.22]} c="#64748b" />
          <B p={[-0.1, 0.12, -2.6]} s={[0.9, 0.24, 0.5]} c="#334155" />
        </group>
        <group position={[gate1 - 5, 0, -8.2]} rotation={[0, 0.25, 0]}>
          <BaggageTrain />
        </group>
        {[[gate1 - 5.6, -4.2], [gate1 + 5.6, -4.2], [gate1 - 3.4, -1.2], [gate1 + 4.4, -7.2]].map(([x, z], i) => <Cone key={i} p={[x, 0, z]} />)}
        <Marshal p={[gate1 - 2.6, 0, -1.9]} />

        {/* Gate A2: the private jet side-on to the glass, steps down, carpet out to it */}
        <group position={[door2 - 1.2, 0, -4.8]} rotation={[0, -Math.PI / 2, 0]}>
          <PrivateJet />
        </group>
        <B p={[door2, 0.022, -1.8]} s={[1.3, 0.012, 3.4]} c="#991b1b" />
        {[[door2 + 6, -2.2], [door2 - 2.4, -3.4]].map(([x, z], i) => <Cone key={`c${i}`} p={[x, 0, z]} />)}

        {/* Fuel bowser parked off the stands */}
        <group position={[it.w - 1.2, 0, -10.6]}>
          <B p={[0, 0.5, 0.9]} s={[1.0, 0.8, 0.9]} c={WHITE} />
          <B p={[0, 0.75, 1.36]} s={[0.8, 0.3, 0.02]} c="#1e293b" />
          <Cyl p={[0, 0.85, -0.5]} r={0.55} h={2.0} c="#dc2626" seg={12} rot={ALONG} />
          {[-0.45, 0.45].map((x) => [-1.0, 0, 0.9].map((z) => <Cyl key={`${x}${z}`} p={[x, 0.2, z]} r={0.2} h={0.16} c="#111827" rot={[0, 0, Math.PI / 2]} />))}
        </group>

        {/* Control tower */}
        <group position={[x0 + 1.6, 0, -11.2]}>
          <Cyl p={[0, 3.2, 0]} r={0.7} rt={0.55} h={6.4} c="#e5e7eb" seg={10} />
          <Cyl p={[0, 6.9, 0]} r={1.0} rt={1.25} h={1.0} c="#7fb4d6" e="#1e3a5f" seg={10} />
          <Cyl p={[0, 7.5, 0]} r={1.3} rt={1.0} h={0.24} c="#475569" seg={10} />
          <Cyl p={[0, 8.1, 0]} r={0.04} h={1.0} c="#dc2626" e="#dc2626" />
        </group>
      </StaticBatch>
      <Departure z={runway} x0={x0 + 4} len={wide - 6} />
    </group>
  );
}
