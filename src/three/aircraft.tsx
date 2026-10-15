// Aircraft seen from outside on the ground: the airliner on the stand and the business jet beside it
// (AirportApron.tsx), and the same airliner shrunk onto the town map's airport (cityModels.tsx).
// Built from the same kit as the plane you fly in (planeKit.tsx): lofted hulls, swept wings, real nacelles.

import { useMemo } from 'react';
import { ALL_ROUND, Cap, Engine, Fin, Gear, Lamp, ringsBetween, Skin, smoothRings, Wing, type Ring } from './planeKit';

const WHITE = '#f8fafc';
const GREEN = '#15803d';
const BELLY = '#cbd5e1';
const GLASS = '#1e293b';

/** Angle round the hull (0 at the belly, a quarter turn at +x) for a height above the axis, as a fraction of the radius. */
const at = (k: number) => Math.acos(-k);

/** A row of cabin windows set into the hull, both sides, at `k` of the radius above the axis. */
function Windows({ r, k, from, step, n, w = 0.15, h = 0.2 }: { r: number; k: number; from: number; step: number; n: number; w?: number; h?: number }) {
  const a = at(k);
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} rotation-z={s * a}>
          {Array.from({ length: n }, (_, i) => (
            <mesh key={i} position={[0, -r - 0.004, from - i * step]}>
              <boxGeometry args={[h, 0.02, w]} />
              <meshStandardMaterial color={GLASS} roughness={0.25} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** The outline of a door on the hull at `z`, on side `s`: a pale panel a hair proud of the skin. */
function Door({ r, z, s, h, w }: { r: number; z: number; s: number; h: number; w: number }) {
  return (
    <group rotation-z={s * Math.PI / 2}>
      <mesh position={[0, -r - 0.006, z]}>
        <boxGeometry args={[h, 0.02, w]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
    </group>
  );
}

/** The windscreen: a dark band over the top of the nose, from side to side. */
function Windscreen({ rings, z0, z1 }: { rings: Ring[]; z0: number; z1: number }) {
  const glass = useMemo(() => ringsBetween(rings, z0, z1), [rings, z0, z1]);
  return <Skin rings={glass} arc={[Math.PI - 0.95, Math.PI + 0.95]} colour={GLASS} grow={0.008} />;
}

const AIR_R = 0.95;
/** Height of the airliner's fuselage axis off the ground. */
const AIR_AXIS = 1.95;
/** Nose tip to tail: [along, radius, height off the axis]. */
const AIR_RINGS: Ring[] = smoothRings([
  [0.45, 0, -0.3], [0.38, 0.2, -0.27], [0.18, 0.46, -0.2], [-0.15, 0.68, -0.12], [-0.55, 0.86, -0.05], [-1.05, 0.94, -0.01], [-1.7, AIR_R, 0],
  [-5.4, AIR_R, 0], [-9.0, AIR_R, 0], [-9.8, 0.88, 0.06], [-10.6, 0.7, 0.2], [-11.3, 0.5, 0.33], [-11.8, 0.3, 0.43], [-12.1, 0.13, 0.48], [-12.2, 0, 0.5],
].reverse() as Ring[], 4);

/**
 * Airliner, nose towards +z, wheels on y=0. About 13 long, the forward door on the right (+x) at z = -1.5 for the jet
 * bridge. In the national colours: white over a grey belly, a green cheatline and a green-white-green fin.
 */
export function Airliner() {
  const rings = AIR_RINGS;
  const cheat = useMemo(() => ringsBetween(rings, -10.4, 0.1), [rings]);
  const fuselage = useMemo(() => ringsBetween(rings, -12.25, 0.5), [rings]);
  /** The fin's leading and trailing edge at a height above the axis. */
  const fin = (y: number): [number, number] => [-9.3 - (2.0 * (y - 0.8)) / 2.5, -11.95 - (0.2 * (y - 0.45)) / 2.85];
  return (
    <group>
      <group position-y={AIR_AXIS}>
        <Skin rings={fuselage} arc={ALL_ROUND} colour={WHITE} cast />
        <Skin rings={rings} arc={[-1.0, 1.0]} colour={BELLY} grow={0.006} />
        <Skin rings={cheat} arc={[at(-0.12), at(0.02)]} colour={GREEN} grow={0.01} />
        <Skin rings={cheat} arc={[-at(0.02), -at(-0.12)]} colour={GREEN} grow={0.01} />
        <Windscreen rings={rings} z0={-0.22} z1={0.1} />
        <Windows r={AIR_R} k={0.32} from={-2.1} step={0.5} n={14} />
        {[-1, 1].map((s) => <Door key={s} r={AIR_R} z={-1.5} s={s} h={0.95} w={0.5} />)}
        {[-1, 1].map((s) => <Door key={`aft${s}`} r={AIR_R} z={-9.1} s={s} h={0.85} w={0.42} />)}
        <Cap ring={rings[rings.length - 1]} colour="#475569" />
        {/* Where the wings meet the belly */}
        <mesh position={[0, -0.62, -5.3]} scale={[1.0, 0.36, 1.75]}>
          <sphereGeometry args={[1, 20, 12]} />
          <meshStandardMaterial color={BELLY} />
        </mesh>
        {[-1, 1].map((side) => (
          <Wing key={side} side={side} at={[side * 0.55, -0.62, -4.9]} span={5.6} root={[1.0, -1.25]} tip={[-1.75, -2.3]} thick={0.1} rise={0.09} colour={WHITE}>
            <Engine at={[1.9, -0.52, 0.55]} r={0.42} length={1.55} colour="#e2e8f0" band={GREEN} />
            <mesh position={[1.9, -0.18, 0.15]}>
              <boxGeometry args={[0.08, 0.32, 1.1]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
            <Fin outline={[[-1.75, 0], [-2.2, 0.5], [-2.4, 0.5], [-2.3, 0]]} at={[5.55, 0.06, 0]} thick={0.05} colour={GREEN} lean={0.25} />
            <Lamp at={[5.6, 0.08, -2.0]} colour={side > 0 ? '#22c55e' : '#ef4444'} r={0.05} />
          </Wing>
        ))}
        {/* Tail: the fin in green, white, green, and the tailplane either side */}
        <Fin outline={[[-9.3, 0.8], [-11.3, 3.3], [-12.15, 3.3], [-11.95, 0.45]]} thick={0.12} colour={GREEN} />
        <Fin outline={[[fin(1.8)[0], 1.8], [fin(2.4)[0], 2.4], [fin(2.4)[1], 2.4], [fin(1.8)[1], 1.8]]} thick={0.14} colour={WHITE} />
        {[-1, 1].map((side) => (
          <Wing key={side} side={side} at={[side * 0.3, 0.32, -10.9]} span={2.3} root={[0.6, -0.6]} tip={[-0.75, -1.2]} thick={0.06} rise={0.1} colour={WHITE} seams={null} />
        ))}
        <Lamp at={[0, 3.32, -11.75]} colour="#ef4444" r={0.05} />
      </group>
      <Gear at={[0, 1.15, -0.9]} ground={0} wheel={0.17} pair={0.12} />
      {[-0.95, 0.95].map((x) => <Gear key={x} at={[x, 1.2, -5.8]} ground={0} wheel={0.25} pair={0.17} />)}
    </group>
  );
}

const JET_R = 0.55;
const JET_AXIS = 1.15;
const JET_RINGS: Ring[] = smoothRings([
  [0.32, 0, -0.14], [0.24, 0.13, -0.12], [0.05, 0.3, -0.07], [-0.35, 0.47, -0.02], [-0.85, JET_R, 0],
  [-2.8, JET_R, 0], [-4.6, JET_R, 0], [-5.4, 0.45, 0.08], [-6.1, 0.28, 0.2], [-6.6, 0.12, 0.28], [-6.75, 0, 0.3],
].reverse() as Ring[], 4);
const GOLD = '#ca8a04';

/** Business jet, nose towards +z, wheels on y=0: low wing, engines on the tail, T-tail, the door let down as steps on +x. About 7 long. */
export function PrivateJet() {
  const rings = JET_RINGS;
  const cheat = useMemo(() => ringsBetween(rings, -5.6, 0.05), [rings]);
  return (
    <group>
      <group position-y={JET_AXIS}>
        <Skin rings={rings} arc={ALL_ROUND} colour={WHITE} cast />
        <Skin rings={rings} arc={[-0.9, 0.9]} colour="#111827" grow={0.006} />
        <Skin rings={cheat} arc={[at(-0.2), at(-0.1)]} colour={GOLD} grow={0.01} />
        <Skin rings={cheat} arc={[-at(-0.1), -at(-0.2)]} colour={GOLD} grow={0.01} />
        <Windscreen rings={rings} z0={-0.4} z1={0.02} />
        <Windows r={JET_R} k={0.2} from={-1.75} step={0.55} n={5} w={0.2} h={0.17} />
        {/* The open doorway */}
        <group rotation-z={Math.PI / 2}>
          <mesh position={[0.05, -JET_R - 0.004, -1.2]}>
            <boxGeometry args={[0.85, 0.02, 0.55]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>
        <mesh position={[0, -0.4, -3.1]} scale={[0.6, 0.22, 1.0]}>
          <sphereGeometry args={[1, 18, 10]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {[-1, 1].map((side) => (
          <Wing key={side} side={side} at={[side * 0.3, -0.38, -2.85]} span={3.0} root={[0.6, -0.75]} tip={[-0.8, -1.2]} thick={0.07} rise={0.1} colour={WHITE}>
            <Fin outline={[[-0.8, 0], [-1.05, 0.35], [-1.2, 0.35], [-1.2, 0]]} at={[2.97, 0.04, 0]} thick={0.04} colour="#111827" lean={0.2} />
            <Lamp at={[3.02, 0.06, -1.0]} colour={side > 0 ? '#22c55e' : '#ef4444'} r={0.035} />
          </Wing>
        ))}
        {/* Engines either side of the tail, each on a short stub */}
        {[-1, 1].map((side) => (
          <group key={`e${side}`}>
            <Engine at={[side * 0.9, 0.3, -4.85]} r={0.27} length={1.25} colour={WHITE} band={GOLD} />
            <mesh position={[side * 0.55, 0.26, -5.0]}>
              <boxGeometry args={[0.5, 0.07, 0.55]} />
              <meshStandardMaterial color={WHITE} />
            </mesh>
          </group>
        ))}
        {/* T-tail: a black fin with a gold band, the tailplane across the top */}
        <Fin outline={[[-5.0, 0.42], [-6.2, 1.78], [-6.78, 1.78], [-6.62, 0.28]]} thick={0.08} colour="#111827" />
        <Fin outline={[[-5.45, 0.92], [-5.65, 1.15], [-6.68, 1.15], [-6.66, 0.92]]} thick={0.1} colour={GOLD} />
        {[-1, 1].map((side) => (
          <Wing key={`t${side}`} side={side} at={[side * 0.04, 1.74, -6.15]} span={1.3} root={[0.25, -0.35]} tip={[-0.35, -0.65]} thick={0.05} rise={0.02} colour={WHITE} seams={null} />
        ))}
      </group>
      {/* Door let down as steps, with a handrail */}
      <group position={[JET_R + 0.3, 0.5, -1.2]} rotation={[0, 0, -0.9]}>
        <mesh>
          <boxGeometry args={[0.06, 1.1, 0.55]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        {[-0.35, -0.1, 0.15, 0.4].map((y) => (
          <mesh key={y} position={[-0.05, y, 0]}>
            <boxGeometry args={[0.12, 0.035, 0.5]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        ))}
        <mesh position={[-0.3, 0.05, 0.27]}>
          <boxGeometry args={[0.02, 1.0, 0.02]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} />
        </mesh>
      </group>
      <Gear at={[0, 0.7, -0.85]} ground={0} wheel={0.12} pair={0.07} />
      {[-0.75, 0.75].map((x) => <Gear key={x} at={[x, 0.78, -3.3]} ground={0} wheel={0.16} pair={0.1} />)}
    </group>
  );
}
