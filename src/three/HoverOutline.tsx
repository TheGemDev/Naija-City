// On desktop, hovering anything you can click draws a thin white outline round it. Every clickable thing calls
// onHover / offHover from its pointer handlers (the same place it sets the pointer cursor); one HoverOutline in the
// scene draws the outline for whatever is hovered.
//
// The outline is an inverted hull: the hovered meshes drawn again, back faces only, pushed out along smoothed
// normals by a fixed number of pixels, so it stays the same width near or far. Only the hovered object pays: its
// hull geometries are built on hover (cached for the next time) and nothing is drawn when nothing is hovered.
// Phones and tablets never hover, so they never build any of it.

import { useEffect, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { create } from 'zustand';
import { BackSide, MeshBasicMaterial, Mesh, SkinnedMesh, Vector2, type BufferGeometry, type Material, type Object3D } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A real mouse or trackpad: touch screens fire pointer-over on a tap, which must not leave an outline behind. */
const CAN_HOVER = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Outline width in CSS pixels. */
const THICKNESS = 2.5;

const useHover = create<{ target: Object3D | null }>(() => ({ target: null }));

/** Pointer entered something clickable: the pointer cursor, and its outline (`target`, or the object the handler is on). */
export function onHover(e: ThreeEvent<PointerEvent>, target?: Object3D | null) {
  e.stopPropagation();
  document.body.style.cursor = 'pointer';
  // `target` null: the pointer cursor only (a floating label), no outline.
  if (CAN_HOVER) useHover.setState({ target: target === undefined ? e.eventObject : target });
}

/** Pointer left it. */
export function offHover() {
  document.body.style.cursor = '';
  if (useHover.getState().target) useHover.setState({ target: null });
}

const resolution = { value: new Vector2(1, 1) };
const outlineMat = new MeshBasicMaterial({ color: '#ffffff', side: BackSide, toneMapped: false, fog: false });
outlineMat.onBeforeCompile = (shader) => {
  shader.uniforms.uRes = resolution;
  shader.uniforms.uThick = { value: THICKNESS };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec2 uRes;\nuniform float uThick;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      // Push the hull out along the normal as seen on screen, by uThick pixels whatever the distance.
      vec2 oDir = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
      float oLen = length(oDir);
      if (oLen > 1e-5) gl_Position.xy += (oDir / oLen) * uThick * 2.0 / uRes * gl_Position.w;`,
    );
};

/** Smoothed-normal copies of geometries already outlined, so hovering the same thing again is free. A few dozen at most. */
const hulls = new Map<BufferGeometry, BufferGeometry>();
const HULL_CACHE = 48;
function hullOf(g: BufferGeometry) {
  let h = hulls.get(g);
  if (h) {
    hulls.delete(g);
    hulls.set(g, h);
    return h;
  }
  // Flat-shaded boxes have a normal per face, which would split the hull at every corner: smooth them all out.
  h = toCreasedNormals(g.index ? g : g.clone(), Math.PI);
  hulls.set(g, h);
  if (hulls.size > HULL_CACHE) {
    const [oldest, geo] = hulls.entries().next().value!;
    hulls.delete(oldest);
    geo.dispose();
  }
  return h;
}

/** Is this a mesh worth outlining? Invisible hitboxes, glows and highlight decals are transparent: they are left out. */
function outlinable(o: Object3D): o is Mesh {
  const m = o as Mesh;
  if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || o.userData.noOutline) return false;
  const mat = m.material as Material | Material[];
  if (Array.isArray(mat) || mat.transparent || !m.geometry.attributes.position || !m.geometry.attributes.normal) return false;
  return true;
}

/** Still in the scene? A hovered object can unmount under the pointer (a place closing, a player leaving). */
function attached(o: Object3D, root: Object3D) {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}

export function HoverOutline() {
  const target = useHover((s) => s.target);
  const { scene, size, gl } = useThree();
  const [hulls, setHulls] = useState<{ src: Mesh; mesh: Mesh }[]>([]);

  useEffect(() => {
    resolution.value.set(size.width, size.height);
  }, [size.width, size.height, gl]);

  useEffect(() => {
    if (!target) return setHulls([]);
    const list: { src: Mesh; mesh: Mesh }[] = [];
    // Hidden meshes count: the map's StaticBatch hides a building's own meshes and draws merged copies instead.
    target.traverse((o) => {
      if (!outlinable(o)) return;
      const geo = hullOf(o.geometry);
      const skinned = o as SkinnedMesh;
      let mesh: Mesh;
      if (skinned.isSkinnedMesh) {
        const s = new SkinnedMesh(geo, outlineMat);
        s.bind(skinned.skeleton, skinned.bindMatrix);
        mesh = s;
      } else mesh = new Mesh(geo, outlineMat);
      // Placed by hand each frame on top of its mesh: the scene must not recompute where it is.
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      list.push({ src: o, mesh });
    });
    setHulls(list);
  }, [target]);

  useFrame(() => {
    if (!target) return;
    if (!attached(target, scene)) return offHover();
    // Hidden meshes still track their place (the batcher only hides them), so the hull follows anything that moves.
    for (const { src, mesh } of hulls) mesh.matrixWorld.copy(src.matrixWorld);
  });

  return (
    <group>
      {hulls.map(({ mesh }) => <primitive key={mesh.uuid} object={mesh} />)}
    </group>
  );
}
