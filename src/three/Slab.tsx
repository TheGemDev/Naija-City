import { useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';

interface SlabProps { x0?: number; z0?: number; x1?: number; z1?: number; r?: number; depth?: number; top?: string; side?: string; outline?: [number, number][] }

/** Floating island: a rounded rectangle, or any outline (x, z points). */
export function Slab({ x0 = 0, z0 = 0, x1 = 1, z1 = 1, r = 2.2, depth = 0.9, top = '#9fbf5a', side = '#b06a3b', outline }: SlabProps) {
  const geo = useMemo(() => {
    // Drawn in (x, -z) so that after rotating flat it lines up with world x/z.
    const s = new Shape();
    if (outline) {
      s.moveTo(outline[0][0], -outline[0][1]);
      for (const [x, z] of outline.slice(1)) s.lineTo(x, -z);
      s.closePath();
      return new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.12, bevelSegments: 2 });
    }
    s.moveTo(x0 + r, -z0);
    s.lineTo(x1 - r, -z0);
    s.quadraticCurveTo(x1, -z0, x1, -z0 - r);
    s.lineTo(x1, -z1 + r);
    s.quadraticCurveTo(x1, -z1, x1 - r, -z1);
    s.lineTo(x0 + r, -z1);
    s.quadraticCurveTo(x0, -z1, x0, -z1 + r);
    s.lineTo(x0, -z0 - r);
    s.quadraticCurveTo(x0, -z0, x0 + r, -z0);
    return new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 10 });
  }, [x0, z0, x1, z1, r, depth, outline]);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -depth - 0.12, 0]} receiveShadow>
      <meshStandardMaterial attach="material-0" color={top} />
      <meshStandardMaterial attach="material-1" color={side} flatShading />
    </mesh>
  );
}
