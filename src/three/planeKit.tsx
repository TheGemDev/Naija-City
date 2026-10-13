// The outside of an aircraft in flight (three/FlightCabin.tsx): a fuselage lofted through rings so the nose droops
// and the tail sweeps up, tapered wings, fins, engines with turning fans, undercarriage and lights.

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute, FrontSide, Shape, Vector2, Vector3, type Group, type MeshStandardMaterial } from 'three';

export type V3 = [number, number, number];
/** One ring of a fuselage: how far along the plane it is, its radius, and how far its centre sits above the axis. */
export type Ring = [z: number, r: number, y: number];

/** A few hand-placed rings, smoothed into enough of them to look round from nose to tail. */
export function smoothRings(stations: Ring[], steps = 4): Ring[] {
  const curve = new CatmullRomCurve3(stations.map(([z, r, y]) => new Vector3(z, r, y)), false, 'catmullrom', 0.5);
  return curve.getPoints((stations.length - 1) * steps).map((p) => [p.x, Math.max(0, p.y), p.z]);
}

/**
 * Skin stretched over rings, by angle around the fuselage: 0 is the belly, a quarter turn is the camera's side,
 * minus a quarter turn the far side. `grow` lifts it off the rings (paint over the hull, lining inside it).
 */
function loft(list: Ring[], from: number, to: number, grow: number, around: number): BufferGeometry {
  const rings = list[0][0] <= list[list.length - 1][0] ? list : [...list].reverse();
  const positions: number[] = [];
  const index: number[] = [];
  for (const [z, r0, y] of rings) {
    const r = r0 > 0.001 ? r0 + grow : 0;
    for (let j = 0; j <= around; j++) {
      const a = from + ((to - from) * j) / around;
      positions.push(r * Math.sin(a), y - r * Math.cos(a), z);
    }
  }
  const row = around + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * row + j;
      index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A closed skin runs belly to belly, so its seam is underneath. */
export const ALL_ROUND: [number, number] = [0, Math.PI * 2];

export function Skin({ rings, arc, colour, grow = 0, inside, glass, shine }: {
  rings: Ring[];
  arc: [number, number];
  colour: string;
  grow?: number;
  /** Lining: seen only from inside the hull. */
  inside?: boolean;
  /** See-through, for a windscreen. */
  glass?: number;
  /** Lit from within, like a window with the sky behind it. */
  shine?: string;
}) {
  const geometry = useMemo(() => loft(rings, arc[0], arc[1], grow, Math.max(6, Math.round(Math.abs(arc[1] - arc[0]) * 7))), [rings, arc, grow]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={colour}
        side={inside ? BackSide : DoubleSide}
        transparent={glass !== undefined}
        opacity={glass ?? 1}
        depthWrite={glass === undefined}
        emissive={shine ?? '#000000'}
        emissiveIntensity={shine ? 0.75 : 0}
        metalness={glass !== undefined ? 0.4 : 0}
        roughness={glass !== undefined ? 0.15 : 0.6}
      />
    </mesh>
  );
}

/** The rings between two points along the plane. */
export const ringsBetween = (rings: Ring[], z0: number, z1: number) => rings.filter(([z]) => z >= Math.min(z0, z1) - 0.001 && z <= Math.max(z0, z1) + 0.001);

/** The flat end of a hull section: a disc at a ring, or just the slice of it between two angles. */
export function Cap({ ring, colour, arc = ALL_ROUND }: { ring: Ring; colour: string; arc?: [number, number] }) {
  const shape = useMemo(() => {
    const s = new Shape();
    const steps = 28;
    for (let j = 0; j <= steps; j++) {
      const a = arc[0] + ((arc[1] - arc[0]) * j) / steps;
      const x = ring[1] * Math.sin(a);
      const y = ring[2] - ring[1] * Math.cos(a);
      if (j) s.lineTo(x, y); else s.moveTo(x, y);
    }
    s.closePath();
    return s;
  }, [ring, arc]);
  return (
    <mesh position={[0, 0, ring[0]]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={colour} side={DoubleSide} />
    </mesh>
  );
}

/** A wing from above, root to tip: where the leading and trailing edge sit at each end, as distances ahead of the wing's origin. */
function wingShape(span: number, root: [number, number], tip: [number, number]) {
  const s = new Shape();
  s.moveTo(0, -root[0]);
  s.lineTo(0, -root[1]);
  s.lineTo(span - 0.25, -(tip[1] + (root[1] - tip[1]) * (0.25 / span)));
  s.quadraticCurveTo(span + 0.05, -tip[1], span, -(tip[0] + tip[1]) / 2);
  s.quadraticCurveTo(span + 0.05, -tip[0], span - 0.25, -(tip[0] + (root[0] - tip[0]) * (0.25 / span)));
  s.closePath();
  return s;
}

/** A thin line painted on top of a wing, between two [x, z] points. */
function Seam({ a, b, y, colour }: { a: [number, number]; b: [number, number]; y: number; colour: string }) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  return (
    <mesh position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation-y={-Math.atan2(dz, dx)}>
      <boxGeometry args={[Math.hypot(dx, dz), 0.012, 0.035]} />
      <meshStandardMaterial color={colour} />
    </mesh>
  );
}

/**
 * A wing or tailplane: tapered, swept, rounded at the edges, tips a little higher than the root, with the flap and
 * aileron lines along its trailing edge. `side` is 1 (the camera's side) or -1; children ride on it (engines, winglets),
 * placed as [along the span, up, ahead].
 */
export function Wing({ side, at, span, root, tip, thick = 0.16, rise = 0.06, colour, seams = '#cbd5e1', children }: {
  side: number;
  at: V3;
  span: number;
  root: [number, number];
  tip: [number, number];
  thick?: number;
  rise?: number;
  colour: string;
  seams?: string | null;
  children?: ReactNode;
}) {
  const shape = useMemo(() => wingShape(span, root, tip), [span, root, tip]);
  const edge = (k: number, back: number): [number, number] => {
    const lead = root[0] + (tip[0] - root[0]) * k;
    const trail = root[1] + (tip[1] - root[1]) * k;
    return [span * k, trail + (lead - trail) * back];
  };
  const top = thick + thick * 0.3 + 0.004;
  return (
    <group position={at} scale={[side, 1, 1]}>
      <group rotation-z={rise}>
        <mesh rotation-x={-Math.PI / 2} castShadow>
          <extrudeGeometry args={[shape, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: 0.07, bevelSegments: 2 }]} />
          <meshStandardMaterial color={colour} side={DoubleSide} />
        </mesh>
        {seams && (
          <>
            <Seam a={edge(0.06, 0.26)} b={edge(0.93, 0.3)} y={top} colour={seams} />
            {[0.06, 0.36, 0.66, 0.93].map((k) => <Seam key={k} a={edge(k, k > 0.5 ? 0.3 : 0.26)} b={edge(k, 0)} y={top} colour={seams} />)}
          </>
        )}
        {children}
      </group>
    </group>
  );
}

/** A fin or winglet seen from the side: its corners as [ahead, up], going round. `lean` tips it outwards. */
export function Fin({ outline, at = [0, 0, 0], thick = 0.16, colour, lean = 0 }: { outline: [number, number][]; at?: V3; thick?: number; colour: string; lean?: number }) {
  const shape = useMemo(() => {
    const s = new Shape();
    outline.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
    s.closePath();
    return s;
  }, [outline]);
  return (
    <group position={at} rotation-z={-lean}>
      <mesh position={[thick / 2, 0, 0]} rotation-y={-Math.PI / 2} castShadow>
        <extrudeGeometry args={[shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 2 }]} />
        <meshStandardMaterial color={colour} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** The fan in an engine's mouth, turning. */
function Fan({ r }: { r: number }) {
  const fan = useRef<Group>(null!);
  useFrame((_, dt) => { fan.current.rotation.z -= Math.min(dt, 0.1) * 9; });
  return (
    <group ref={fan}>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} rotation-z={(i / 9) * Math.PI * 2} position={[0, 0, 0.01]}>
          <boxGeometry args={[r * 0.2, r * 1.9, 0.02]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 0, r * 0.22]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[r * 0.3, r * 0.5, 14]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** A jet engine, mouth towards the nose: a shaped cowl with a polished lip, the fan inside it and a dark nozzle behind. */
export function Engine({ at, r, length, colour, band }: { at: V3; r: number; length: number; colour: string; band?: string }) {
  const cowl = useMemo(() => [[0.56, -0.5], [0.74, -0.36], [0.95, -0.12], [1, 0.14], [0.96, 0.36], [0.87, 0.5]].map(([k, y]) => new Vector2(r * k, length * y)), [r, length]);
  return (
    <group position={at} rotation-x={Math.PI / 2}>
      <mesh castShadow>
        <latheGeometry args={[cowl, 22]} />
        <meshStandardMaterial color={colour} side={DoubleSide} />
      </mesh>
      {band && (
        <mesh position={[0, -length * 0.2, 0]}>
          <cylinderGeometry args={[r * 0.93, r * 0.86, length * 0.1, 22, 1, true]} />
          <meshStandardMaterial color={band} side={FrontSide} />
        </mesh>
      )}
      <mesh position={[0, length * 0.5, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[r * 0.87, r * 0.07, 8, 22]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[0, length * 0.36, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[r * 0.9, 22]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <group position={[0, length * 0.37, 0]} rotation-x={-Math.PI / 2}>
        <Fan r={r * 0.85} />
      </group>
      <mesh position={[0, -length * 0.6, 0]}>
        <cylinderGeometry args={[r * 0.5, r * 0.3, length * 0.26, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** A light on the airframe. Steady for the red and green on the wingtips; `every` seconds for a strobe or the beacon. */
export function Lamp({ at, colour, every, r = 0.09 }: { at: V3; colour: string; every?: number; r?: number }) {
  const material = useRef<MeshStandardMaterial>(null!);
  useFrame(({ clock }) => {
    if (every) material.current.emissiveIntensity = clock.elapsedTime % every < 0.14 ? 4 : 0.15;
  });
  return (
    <mesh position={at}>
      <sphereGeometry args={[r, 10, 8]} />
      <meshStandardMaterial ref={material} color={colour} emissive={colour} emissiveIntensity={every ? 0.15 : 2.2} />
    </mesh>
  );
}

/** One leg of the undercarriage, hanging from `at` down to wheels that sit on `ground`. */
export function Gear({ at, ground, wheel, pair = 0.3 }: { at: V3; ground: number; wheel: number; pair?: number }) {
  const drop = at[1] - (ground + wheel);
  return (
    <group position={[at[0], ground + wheel, at[2]]}>
      <mesh position={[0, drop / 2, 0]}>
        <cylinderGeometry args={[wheel * 0.22, wheel * 0.22, drop, 8]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * pair, 0, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[wheel, wheel, wheel * 0.7, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
    </group>
  );
}
