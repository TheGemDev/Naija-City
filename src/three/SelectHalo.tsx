// A white glow round the foot of everything you can use: faint and slowly breathing all the time, so you can see what's
// usable, and brighter while the pointer is on it (with HoverOutline's line round its body). Every device gets it.
// One flat quad a little bigger than the footprint; its shader works out the distance to the footprint's rounded edge
// in world units, so the glow hugs the base at the same width for a stool or a bank counter.
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, ShaderMaterial, type Object3D } from 'three';
import { hoverTarget } from './HoverOutline';

/** A real mouse or trackpad. */
export const DESK_HALO = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** How far past the footprint the glow reaches, in world units. */
const SPREAD = 0.55;
const IDLE = 0.85;
const HOVER = 1;
const GLOW = new Color('#ffffff');

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 uSize;
uniform vec2 uHalf;
uniform vec3 uColor;
uniform float uOpacity;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float d = box((vUv - 0.5) * uSize, uHalf, 0.12);
  // Brightest at the edge of the footprint, fading out past it, and carried in under the object too: a model a little
  // smaller than its footprint would otherwise stand in a ring of bare floor.
  float a = d < 0.0 ? mix(0.55, 1.0, smoothstep(-0.35, 0.0, d)) : exp(-d / 0.17);
  gl_FragColor = vec4(uColor, a * uOpacity);
}`;

/** `w` × `d`: the footprint it glows round; `target`: the object whose hover lights it up. */
export function SelectHalo({ x, z, w, d, yaw, target }: { x: number; z: number; w: number; d: number; yaw: number; target: RefObject<Object3D | null> }) {
  const mat = useMemo(
    () => new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: [w + SPREAD * 2, d + SPREAD * 2] },
        uHalf: { value: [w / 2, d / 2] },
        uColor: { value: GLOW },
        uOpacity: { value: IDLE },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
    [w, d],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const shown = useRef(IDLE);
  // A different start for each, so a room full of them doesn't breathe in step.
  const phase = useMemo(() => x * 1.7 + z * 0.9, [x, z]);
  useFrame(({ clock }, dt) => {
    const want = target.current && hoverTarget() === target.current ? HOVER : IDLE * (0.8 + 0.2 * Math.sin(clock.elapsedTime * 2 + phase));
    shown.current += (want - shown.current) * Math.min(1, dt * 10);
    mat.uniforms.uOpacity.value = shown.current;
  });
  return (
    // dynamic: it brightens and dims, so the map and place batching (StaticBatch) must leave it alone.
    <group userData={{ dynamic: true }}>
      <mesh position={[x, 0.025, z]} rotation={[-Math.PI / 2, 0, yaw]} renderOrder={2} raycast={() => null} material={mat}>
        <planeGeometry args={[w + SPREAD * 2, d + SPREAD * 2]} />
      </mesh>
    </group>
  );
}
