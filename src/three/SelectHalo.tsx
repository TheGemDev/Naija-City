// Desktop: a soft white glow on the floor round the foot of everything you can use, faint all the time so you can see
// what's selectable, and brighter while the pointer is on it (with HoverOutline's white line). Touch screens get the
// pulsing ring in Items.tsx instead. One shared texture; each halo is a single small transparent quad.
import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, type MeshBasicMaterial, type Object3D } from 'three';
import { hoverTarget } from './HoverOutline';

/** A real mouse or trackpad. */
export const DESK_HALO = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

let glow: CanvasTexture | null = null;
/** White in the middle fading to nothing at the rim, so the halo has no hard edge. */
function glowTexture() {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return (glow = new CanvasTexture(c));
}

const IDLE = 0.26;
const HOVER = 0.55;

/** `w` × `d`: the footprint it glows round (it spreads a little past it); `target`: the object whose hover lights it up. */
export function SelectHalo({ x, z, w, d, yaw, target }: { x: number; z: number; w: number; d: number; yaw: number; target: RefObject<Object3D | null> }) {
  const tex = useMemo(glowTexture, []);
  const mat = useRef<MeshBasicMaterial>(null!);
  useFrame((_, dt) => {
    const want = target.current && hoverTarget() === target.current ? HOVER : IDLE;
    mat.current.opacity += (want - mat.current.opacity) * Math.min(1, dt * 10);
  });
  return (
    // dynamic: it brightens and dims, so the map and place batching (StaticBatch) must leave it alone.
    <group userData={{ dynamic: true }}>
      <mesh position={[x, 0.025, z]} rotation={[-Math.PI / 2, 0, yaw]} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[w + 0.7, d + 0.7]} />
        <meshBasicMaterial ref={mat} map={tex} transparent opacity={IDLE} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
