// The lights you can buy (game/catalog.ts, game/finishes.ts LIGHTS). Each is centred on its footprint, sits on y=0
// and faces +z, like every other item. Bulbs here are plain and unlit: HouseLights.tsx draws the glow over them at
// night in the lamp's own colour, all lamps in one draw call, so a model never needs remounting when it is switched.

import type { ReactNode } from 'react';
import { DoubleSide } from 'three';
import { B } from './models';

type V3 = [number, number, number];
const BULB = '#f3ead2';

function Cyl({ p, r, rt, h, c, open, seg = 20 }: { p: V3; r: number; rt?: number; h: number; c: string; open?: boolean; seg?: number }) {
  return (
    <mesh position={p} castShadow={!open} receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, seg, 1, open]} />
      <meshStandardMaterial color={c} side={open ? DoubleSide : undefined} roughness={0.6} />
    </mesh>
  );
}

function Ball({ p, r, c, s }: { p: V3; r: number; c: string; s?: V3 }) {
  return (
    <mesh position={p} scale={s}>
      <icosahedronGeometry args={[r, 2]} />
      <meshStandardMaterial color={c} roughness={0.3} />
    </mesh>
  );
}

/** A flex hanging from the ceiling (2.6 m) down to `to`. */
const Cord = ({ to, x = 0, z = 0 }: { to: number; x?: number; z?: number }) => (
  <>
    <Cyl p={[x, 2.58, z]} r={0.06} h={0.03} c="#e8e4dc" />
    <Cyl p={[x, (2.6 + to) / 2, z]} r={0.007} h={2.6 - to} c="#1f1f1f" seg={6} />
  </>
);

export function lampShape(type: string): ReactNode | null {
  switch (type) {
    case 'table_lamp':
      // Small enough to stand on a side table, a desk or the floor (game/mount.ts surfaces).
      return (
        <group>
          <Cyl p={[0, 0.012, 0]} r={0.08} h={0.024} c="#c9a227" />
          <Ball p={[0, 0.12, 0]} r={0.085} c="#2f6f8f" s={[1, 1.2, 1]} />
          <Cyl p={[0, 0.25, 0]} r={0.012} h={0.08} c="#c9a227" />
          <Ball p={[0, 0.31, 0]} r={0.04} c={BULB} />
          <Cyl p={[0, 0.33, 0]} r={0.15} rt={0.1} h={0.16} c="#efe4cc" open seg={24} />
        </group>
      );
    case 'pendant_light':
      return (
        <group>
          <Cord to={1.86} />
          <Ball p={[0, 1.72, 0]} r={0.05} c={BULB} />
          {/* Brass dome, open underneath */}
          <mesh position={[0, 1.7, 0]} castShadow>
            <sphereGeometry args={[0.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#b8892e" metalness={0.6} roughness={0.35} side={DoubleSide} />
          </mesh>
          <Cyl p={[0, 1.91, 0]} r={0.03} h={0.04} c="#b8892e" />
        </group>
      );
    case 'wall_sconce':
      // Wall items are built round their centre height (ItemDef.wallY); the wall face is at z = -0.43.
      return (
        <group>
          <B p={[0, -0.06, -0.415]} s={[0.12, 0.26, 0.03]} c="#c9a227" />
          <B p={[0, -0.1, -0.35]} s={[0.03, 0.03, 0.12]} c="#c9a227" />
          <Ball p={[0, 0, -0.3]} r={0.04} c={BULB} />
          <Cyl p={[0, 0.01, -0.3]} r={0.05} rt={0.09} h={0.13} c="#f3ead7" open />
        </group>
      );
    case 'led_strip':
      return (
        <group>
          {/* Aluminium channel along the foot of the wall; the light is the diffuser on top */}
          <B p={[0, -0.02, -0.405]} s={[1.96, 0.04, 0.05]} c="#b8bec6" />
          <B p={[0, 0.002, -0.405]} s={[1.92, 0.008, 0.035]} c={BULB} />
          <B p={[0.98, -0.01, -0.37]} s={[0.04, 0.03, 0.03]} c="#111827" />
        </group>
      );
    case 'chandelier':
      return (
        <group>
          <Cord to={2.26} />
          {/* Brass spine and arms, candle bulbs, tiers of crystal drops */}
          <Cyl p={[0, 2.1, 0]} r={0.035} h={0.34} c="#c9a227" />
          <Ball p={[0, 1.9, 0]} r={0.06} c={BULB} />
          <Cyl p={[0, 1.97, 0]} r={0.46} rt={0.46} h={0.025} c="#c9a227" open seg={32} />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            const x = Math.cos(a) * 0.42, z = Math.sin(a) * 0.42;
            return (
              <group key={i}>
                <B p={[x / 2, 1.97, z / 2]} s={[0.02, 0.02, 0.02]} c="#c9a227" />
                <Cyl p={[x, 1.96, z]} r={0.04} rt={0.05} h={0.04} c="#c9a227" />
                <Cyl p={[x, 1.99, z]} r={0.012} h={0.06} c="#f5f5f4" />
                <Ball p={[x, 2.02, z]} r={0.022} c={BULB} s={[1, 1.5, 1]} />
              </group>
            );
          })}
          {[[0.3, 1.86, 10], [0.2, 1.76, 8], [0.1, 1.68, 6]].map(([r, y, n], t) =>
            Array.from({ length: n }, (_, i) => {
              const a = (i / n) * Math.PI * 2 + t * 0.3;
              return <Ball key={`${t}-${i}`} p={[Math.cos(a) * r, y, Math.sin(a) * r]} r={0.025} c="#e6f3fb" s={[0.7, 1.6, 0.7]} />;
            }),
          )}
          <Ball p={[0, 1.6, 0]} r={0.04} c="#e6f3fb" s={[0.8, 1.6, 0.8]} />
        </group>
      );
    default:
      return null;
  }
}
