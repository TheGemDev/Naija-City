// What a city floats on: a craggy rock body that tapers away under the map, a few stray boulders and slow clouds
// drifting below the edge, so the map reads as a floating island instead of a slab on a table.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, ExtrudeGeometry, Shape, type Group } from 'three';

/** A cheap repeatable "random": the same island every time, and the same on every phone. */
const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const LAYERS = 6;
const LAYER_H = 1.5;

export function IslandBase({ outline, top = 1.52, seed = 1 }: { outline: [number, number][]; top?: number; seed?: number }) {
  const { layers, rocks, clouds } = useMemo(() => {
    let cx = 0, cz = 0;
    for (const [x, z] of outline) { cx += x; cz += z; }
    cx /= outline.length; cz /= outline.length;
    const radius = Math.max(...outline.map(([x, z]) => Math.hypot(x - cx, z - cz)));
    const rock = new Color('#9a6b3f');
    const deep = new Color('#4a4038');
    const layers = Array.from({ length: LAYERS }, (_, i) => {
      // Each layer is the coast pulled in towards the middle and roughened, so the island narrows like a root.
      const scale = 1 - 0.14 * (i + 1) + 0.04 * i * (i % 2);
      const pts = outline.map(([x, z], k): [number, number] => {
        const jitter = (noise(seed * 100 + i * 31 + k) - 0.5) * (1.2 + i * 0.5);
        const dx = x - cx, dz = z - cz;
        const len = Math.hypot(dx, dz) || 1;
        return [cx + dx * scale + (dx / len) * jitter, cz + dz * scale + (dz / len) * jitter];
      });
      const shape = new Shape();
      shape.moveTo(pts[0][0], -pts[0][1]);
      for (const [x, z] of pts.slice(1)) shape.lineTo(x, -z);
      shape.closePath();
      return {
        geo: new ExtrudeGeometry(shape, { depth: LAYER_H, bevelEnabled: false }),
        y: -top - LAYER_H * (i + 1) + LAYER_H,
        color: rock.clone().lerp(deep, i / (LAYERS - 1)).getStyle(),
      };
    });
    // Boulders breaking away round the underside.
    const rocks = Array.from({ length: 7 }, (_, i) => {
      const a = noise(seed * 7 + i) * Math.PI * 2;
      const r = radius * (0.55 + noise(seed * 13 + i) * 0.5);
      return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: -top - 2 - noise(seed * 3 + i) * 9, s: 0.5 + noise(seed * 5 + i) * 1.3 };
    });
    const clouds = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + noise(seed + i);
      const r = radius * (1.05 + noise(seed * 17 + i) * 0.35);
      return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: -top - 3 - noise(seed * 19 + i) * 5, s: 2.2 + noise(seed * 23 + i) * 2 };
    });
    return { layers, rocks, clouds };
  }, [outline, top, seed]);

  const drift = useRef<Group>(null);
  useFrame((state) => {
    if (drift.current) drift.current.position.x = Math.sin(state.clock.elapsedTime * 0.08) * 1.4;
  });

  return (
    <group>
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, l.y, 0]}>
          <meshStandardMaterial color={l.color} flatShading />
        </mesh>
      ))}
      {rocks.map((r, i) => (
        <mesh key={i} position={[r.x, r.y, r.z]} scale={r.s} rotation={[i, i * 2, 0]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#6b5a49" flatShading />
        </mesh>
      ))}
      <group ref={drift}>
        {clouds.map((c, i) => (
          <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
            {[[0, 0, 0, 1], [0.9, -0.1, 0.2, 0.75], [-0.9, -0.1, -0.1, 0.8], [0.3, 0.3, -0.4, 0.7]].map(([x, y, z, s], k) => (
              <mesh key={k} position={[x, y, z]} scale={[s * 1.3, s * 0.7, s]}>
                <icosahedronGeometry args={[0.8, 1]} />
                <meshStandardMaterial color="#ffffff" transparent opacity={0.85} flatShading />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}
