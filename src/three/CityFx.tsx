// Touches that make the map's buildings sit in the world: a soft shade on the ground round the foot of every
// building, and pools of light under the street lamps at night. Each is one instanced draw call over the whole map.

import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import {
  AdditiveBlending, Box3, CanvasTexture, InstancedBufferAttribute, MeshBasicMaterial, Object3D, ShaderMaterial, UniformsLib, UniformsUtils,
  type Group, type InstancedMesh, type Mesh,
} from 'three';
import type { StreetLamp } from '../game/roads';

/* ---------- Ground shade ---------- */

const SHADE_VERT = /* glsl */ `
  attribute vec2 aHalf;
  uniform float uFade;
  varying vec2 vP;
  varying vec2 vHalf;
  varying float vFogDepth;
  void main() {
    // The quad reaches uFade past the walls on every side; vP is where this point is, in tiles from the middle.
    vHalf = aHalf;
    vP = position.xy * 2.0 * (aHalf + uFade);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(vP, 0.0, 1.0);
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const SHADE_FRAG = /* glsl */ `
  uniform float uFade;
  uniform float uStrength;
  uniform float fogNear;
  uniform float fogFar;
  varying vec2 vP;
  varying vec2 vHalf;
  varying float vFogDepth;
  void main() {
    // Distance out from the building's walls (a box with softened corners), fading to nothing uFade away.
    float r = min(0.15, min(vHalf.x, vHalf.y));
    vec2 q = abs(vP) - vHalf + r;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    float a = 1.0 - smoothstep(0.0, uFade, d);
    // Haze swallows it with everything else.
    a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uStrength);
  }
`;

/** Tiles past the walls the shade reaches. */
const FADE = 0.55;
const box = new Box3();

/** Ground-standing blocks big enough to be a building (not a fence, post, tree trunk or flat paving). */
function footprints(root: Group) {
  root.updateWorldMatrix(true, true);
  const found: { x: number; z: number; hx: number; hz: number }[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    for (let p: Object3D | null = m; p; p = p.parent) if (p.userData.dynamic) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
    if (box.min.y > 0.3 || h < 0.55 || Math.min(w, d) < 0.45) return;
    found.push({ x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, hx: w / 2, hz: d / 2 });
  });
  return found;
}

/**
 * Ambient shade on the ground round every building in `source`: the dark line where wall meets ground that the
 * sun's shadows miss (and low mode, which has no shadows, never had). Footprints are read off the buildings' own
 * blocks once, so new models get it for free. Mount it after the buildings, keyed the same way.
 */
export function GroundShade({ source, strength = 0.42 }: { source: RefObject<Group | null>; strength?: number }) {
  const ref = useRef<InstancedMesh>(null!);
  const mat = useMemo(() => new ShaderMaterial({
    vertexShader: SHADE_VERT,
    fragmentShader: SHADE_FRAG,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uFade: { value: FADE }, uStrength: { value: strength } }]),
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), [strength]);
  useLayoutEffect(() => () => mat.dispose(), [mat]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!source.current) return;
    const list = footprints(source.current);
    const n = Math.min(list.length, mesh.instanceMatrix.count);
    const half = new Float32Array(mesh.instanceMatrix.count * 2);
    const o = new Object3D();
    o.rotation.set(-Math.PI / 2, 0, 0);
    for (let i = 0; i < n; i++) {
      const f = list[i];
      // Just above the yard and plot paving so it shows on them, under anything standing.
      o.position.set(f.x, 0.036, f.z);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      half[i * 2] = f.hx;
      half[i * 2 + 1] = f.hz;
    }
    mesh.count = n;
    mesh.geometry.setAttribute('aHalf', new InstancedBufferAttribute(half, 2));
    mesh.instanceMatrix.needsUpdate = true;
  }, [source]);

  return (
    <instancedMesh ref={ref} args={[undefined, mat, 2048]} frustumCulled={false} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

/* ---------- Lamp light ---------- */

/** A warm round fall-off of light. */
function poolTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

/** The light the street lamps throw on the road after dark: brightness set with the lamp heads (City.tsx MapEffects). */
export const poolMat = new MeshBasicMaterial({
  color: '#ffc46b', map: poolTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, opacity: 0,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
});

/** Tiles across a lamp's pool of light. */
const POOL = 3.2;

/** A pool of light on the ground under each working street lamp. Real point lights would cost a shader pass each. */
export function LampPools({ list }: { list: StreetLamp[] }) {
  const ref = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    if (!list.length) return;
    const o = new Object3D();
    list.forEach((lamp, i) => {
      o.position.set(lamp.x, 0.04, lamp.z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [list]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, poolMat, list.length]} raycast={() => null} renderOrder={2}>
      <planeGeometry args={[POOL, POOL]} />
    </instancedMesh>
  );
}
