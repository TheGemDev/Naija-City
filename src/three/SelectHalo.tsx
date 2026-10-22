// A soft white light rising up the body of everything you can use, from the floor and fading out going up: faint and
// slowly breathing all the time, so you can see what's usable, and brighter while the pointer is on it (with
// HoverOutline's line round its body). Every device gets it. It is the sides of the object's own bounding box, measured
// once its meshes are there, so it fits a stool or a bank counter alike.
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Box3, Color, DoubleSide, Matrix4, Mesh, ShaderMaterial, Vector3, type Group, type Object3D } from 'three';
import { hoverTarget } from './HoverOutline';

/** A real mouse or trackpad. */
export const DESK_HALO = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

const IDLE = 0.85;
const HOVER = 1;
const GLOW = new Color('#ffffff');

// The glow up the body: the sides of the object's own bounding box, lit from the floor and fading out going up.
const RISE_VERT = /* glsl */ `
varying float vUp;
varying float vSide;
void main() {
  vUp = position.y + 0.5;
  vSide = abs(normal.y) < 0.5 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RISE_FRAG = /* glsl */ `
varying float vUp;
varying float vSide;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  if (vSide < 0.5) discard;
  float a = pow(1.0 - clamp(vUp, 0.0, 1.0), 2.2);
  gl_FragColor = vec4(uColor, a * uOpacity * 0.55);
}`;

/** Of the box round the object's meshes, in the object's own frame: where it is and how big. Null until the model has meshes. */
function localBounds(obj: Object3D): { center: Vector3; size: Vector3 } | null {
  obj.updateWorldMatrix(true, true);
  const toLocal = new Matrix4().copy(obj.matrixWorld).invert();
  const box = new Box3();
  const part = new Box3();
  const m = new Matrix4();
  obj.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    part.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(toLocal, mesh.matrixWorld));
    box.union(part);
  });
  return box.isEmpty() ? null : { center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) };
}

/** `target`: the object whose hover lights it up. */
/** `x`, `z`: where it stands (only to start each one's breathing at a different moment). */
export function SelectHalo({ x, z, target }: { x: number; z: number; target: RefObject<Object3D | null> }) {
  const riseMat = useMemo(
    () => new ShaderMaterial({
      vertexShader: RISE_VERT,
      fragmentShader: RISE_FRAG,
      uniforms: { uColor: { value: GLOW }, uOpacity: { value: IDLE } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
    [],
  );
  useEffect(() => () => riseMat.dispose(), [riseMat]);
  // The rising glow follows the object: placed in its frame once its meshes are there to measure.
  const rise = useRef<Group>(null);
  const measured = useRef(false);
  const shown = useRef(IDLE);
  // A different start for each, so a room full of them doesn't breathe in step.
  const phase = useMemo(() => x * 1.7 + z * 0.9, [x, z]);
  useFrame(({ clock }, dt) => {
    const want = target.current && hoverTarget() === target.current ? HOVER : IDLE * (0.8 + 0.2 * Math.sin(clock.elapsedTime * 2 + phase));
    shown.current += (want - shown.current) * Math.min(1, dt * 10);
    riseMat.uniforms.uOpacity.value = shown.current;
    const obj = target.current;
    const g = rise.current;
    if (!obj || !g) return;
    if (!measured.current) {
      const b = localBounds(obj);
      if (!b) return;
      measured.current = true;
      // A hair bigger than the body so it sits on it, not in it; from the floor up.
      const box = g.children[0];
      box.scale.set(b.size.x * 1.04 + 0.02, b.size.y + 0.02, b.size.z * 1.04 + 0.02);
      box.position.set(b.center.x, b.center.y, b.center.z);
      g.visible = true;
    }
    // The object's world placement, taken back into this group's parent's frame.
    g.matrix.copy(g.parent!.matrixWorld).invert().multiply(obj.matrixWorld);
    g.matrixWorldNeedsUpdate = true;
  });
  return (
    // dynamic: it brightens and dims, so the map and place batching (StaticBatch) must leave it alone.
    <group userData={{ dynamic: true }}>
      <group ref={rise} matrixAutoUpdate={false} visible={false}>
        <mesh renderOrder={3} raycast={() => null} material={riseMat}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      </group>
    </group>
  );
}
