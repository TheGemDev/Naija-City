// The kidnappers' clearing: a wall of jungle trees all round, a campfire, a tent, armed guards at the gap
// and other tied-up captives. Drawn over the 'camp' interior (game/interiors.ts) while you are held.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, PointLight } from 'three';
import { hash } from '../game/live';
import { encodeLook, randomAppearance } from '../game/wardrobe';
import { CityTree } from './cityModels';
import { B } from './models';
import { Person, seatDrop, type Clip } from './Person';

const W = 16;
const H = 11;
const GATE_X = 8;
const rnd = (n: number) => (hash(n) % 1000) / 1000;

const GUARD = encodeLook({ body: 'm', skin: 5, hair: 'bald', hairColor: 0, outfit: { top: 'tee_green', bottom: 'trousers_black', shoes: 'boots_tan', eyes: 'shades_black' } });

function Trees() {
  const trees = useMemo(() => {
    const out: { x: number; z: number; s: number }[] = [];
    let n = 0;
    // A thick belt around the clearing, two rows deep, leaving the gap at the gate.
    for (let row = 0; row < 2; row++) {
      const off = 1.6 + row * 1.8;
      for (let x = -off; x <= W + off; x += 1.8) {
        out.push({ x: x + rnd(n++) * 0.6, z: -off + rnd(n++) * 0.5, s: 0.75 + rnd(n++) * 0.5 });
        if (Math.abs(x - GATE_X) > 1.6) out.push({ x: x + rnd(n++) * 0.6, z: H + off - 0.4 + rnd(n++) * 0.5, s: 0.75 + rnd(n++) * 0.5 });
      }
      for (let z = -off + 1.5; z < H + off - 1; z += 1.8) {
        out.push({ x: -off + rnd(n++) * 0.5, z: z + rnd(n++) * 0.6, s: 0.75 + rnd(n++) * 0.5 });
        out.push({ x: W + off + rnd(n++) * 0.5, z: z + rnd(n++) * 0.6, s: 0.75 + rnd(n++) * 0.5 });
      }
    }
    return out;
  }, []);
  const ferns = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({ x: -0.6 + rnd(i * 3) * (W + 1.2), z: -0.6 + rnd(i * 3 + 1) * (H + 1.2), h: 0.18 + rnd(i * 3 + 2) * 0.25 })),
    [],
  );
  return (
    <group>
      {trees.map((t, i) => <CityTree key={i} p={[t.x, 0, t.z]} s={t.s} />)}
      {ferns.map((f, i) => <B key={i} p={[f.x, f.h / 2, f.z]} s={[0.35, f.h, 0.35]} c={i % 2 ? '#2f6b2a' : '#3f8a35'} />)}
    </group>
  );
}

function Fire() {
  const flame = useRef<Group>(null!);
  const light = useRef<PointLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.1;
    flame.current.scale.set(1, f, 1);
    light.current.intensity = 5 + Math.sin(t * 11) * 1.2;
  });
  return (
    <group position={[9.5, 0, 5]}>
      {[0, 1.05, 2.1, 3.15, 4.2, 5.25].map((a) => (
        <B key={a} p={[Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45]} s={[0.5, 0.18, 0.14]} c="#57534e" />
      ))}
      <group ref={flame}>
        <B p={[0, 0.35, 0]} s={[0.4, 0.5, 0.4]} c="#f97316" e="#f97316" />
        <B p={[0, 0.7, 0]} s={[0.24, 0.5, 0.24]} c="#fbbf24" e="#fbbf24" />
        <B p={[0, 1.0, 0]} s={[0.12, 0.3, 0.12]} c="#fde68a" e="#fde68a" />
      </group>
      <pointLight ref={light} position={[0, 1.2, 0]} color="#fb923c" intensity={5} distance={9} decay={1.6} />
    </group>
  );
}

function Tent() {
  return (
    <group position={[12.6, 0, 5.2]} rotation-y={-0.3}>
      <B p={[0, 0.8, 0]} s={[2.2, 1.6, 1.7]} c="#4d5b3a" />
      <B p={[-0.55, 1.75, 0]} s={[1.3, 0.1, 1.9]} c="#3f4b2f" />
      <B p={[0.55, 1.75, 0]} s={[1.3, 0.1, 1.9]} c="#3f4b2f" />
      <B p={[0, 0.7, 0.88]} s={[0.7, 1.3, 0.04]} c="#1c1917" />
    </group>
  );
}

function Crates() {
  return (
    <group>
      <B p={[14.2, 0.35, 8.6]} s={[0.9, 0.7, 0.9]} c="#78350f" />
      <B p={[13.4, 0.25, 8.9]} s={[0.7, 0.5, 0.7]} c="#92400e" />
      <B p={[14.2, 1.0, 8.6]} s={[0.6, 0.6, 0.6]} c="#a16207" />
      <B p={[1.2, 0.3, 8.6]} s={[0.8, 0.6, 0.8]} c="#78350f" />
    </group>
  );
}

function Guard({ x, z, yaw, clip }: { x: number; z: number; yaw: number; clip: Clip }) {
  const ref = useRef<Clip>(clip);
  return (
    <group position={[x, 0, z]} rotation-y={yaw}>
      <Person look={GUARD} clipRef={ref} />
      {/* Rifle held across the chest */}
      <group position={[0.18, 1.1, 0.22]} rotation={[0.2, 0.25, 0]}>
        <B p={[0, 0, 0]} s={[0.08, 0.1, 0.95]} c="#1f2937" />
        <B p={[0, -0.12, -0.2]} s={[0.07, 0.2, 0.1]} c="#111827" />
        <B p={[0, 0, -0.55]} s={[0.1, 0.14, 0.2]} c="#78350f" />
      </group>
    </group>
  );
}

function Captive({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  const look = useMemo(() => encodeLook(randomAppearance()), []);
  const ref = useRef<Clip>('sit');
  return (
    <group position={[x, 0.42, z]} rotation-y={yaw}>
      {/* The upturned crate they are sat on */}
      <B p={[0, -0.21, -0.02]} s={[0.42, 0.42, 0.4]} c="#6b4423" />
      <group position-y={-seatDrop(0.42)}>
        <Person look={look} clipRef={ref} />
        {/* Ropes round the arms */}
        <B p={[0, 1.25, 0]} s={[0.56, 0.06, 0.34]} c="#d6c39a" />
        <B p={[0, 1.07, 0]} s={[0.54, 0.06, 0.34]} c="#d6c39a" />
      </group>
    </group>
  );
}

export function KidnapCamp() {
  return (
    <group>
      <Trees />
      <Fire />
      <Tent />
      <Crates />
      <Guard x={6.4} z={9.3} yaw={Math.PI} clip="idle" />
      <Guard x={9.8} z={9.3} yaw={Math.PI} clip="talk" />
      <Guard x={11.2} z={6.6} yaw={-Math.PI / 2 - 0.3} clip="idle" />
      <Captive x={13.8} z={7.2} yaw={-Math.PI / 2} />
      <Captive x={14.4} z={6.2} yaw={-Math.PI / 2 - 0.4} />
    </group>
  );
}
