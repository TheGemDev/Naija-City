// On desktop, hovering anything you can click draws a thin gold outline round it. Every clickable thing calls
// onHover / offHover from its pointer handlers (the same place it sets the pointer cursor); one HoverOutline in the
// scene draws the outline for whatever is hovered.
//
// The outline is a hull: the hovered meshes drawn again in white, pushed out along smoothed normals by a fixed
// number of pixels, so it stays the same width near or far. The object's own shape is first stamped into the stencil
// buffer and the hull is only drawn outside it, so a busy model (a stadium's fans and masts) gets one clean line round
// its silhouette instead of a rim on every part. Only the hovered object pays: its
// hull geometries are built on hover (cached for the next time) and nothing is drawn when nothing is hovered.
// Phones and tablets never hover, so they never build any of it.

import { useEffect, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { create } from 'zustand';
import {
  AlwaysStencilFunc, DoubleSide, KeepStencilOp, MeshBasicMaterial, Mesh, NotEqualStencilFunc, ReplaceStencilOp, SkinnedMesh, Vector2,
  type BufferGeometry, type Material, type Object3D,
} from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A real mouse or trackpad: touch screens fire pointer-over on a tap, which must not leave an outline behind. */
const CAN_HOVER = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Outline width in CSS pixels. */
const THICKNESS = 2.5;

const useHover = create<{ target: Object3D | null }>(() => ({ target: null }));

/** The clickable thing the pointer (or finger) last went over: what a click that follows is about. The camera centres on it
 *  when it is selected (Scene.tsx CameraRig). */
export const lastPointed: { obj: Object3D | null } = { obj: null };

/** A pointer-out waiting a frame to clear the outline (offHover). */
let leaving = 0;

/** Pointer entered something clickable: the pointer cursor, and its outline (`target`, or the object the handler is on). */
export function onHover(e: ThreeEvent<PointerEvent>, target?: Object3D | null) {
  e.stopPropagation();
  cancelAnimationFrame(leaving);
  leaving = 0;
  document.body.style.cursor = 'pointer';
  lastPointed.obj = target === undefined ? e.eventObject : target;
  // `target` null: the pointer cursor only (a floating label), no outline.
  if (CAN_HOVER) useHover.setState({ target: target === undefined ? e.eventObject : target });
}

/** What the pointer is on right now (null: nothing, or a touch screen). */
export const hoverTarget = () => useHover.getState().target;

/** Pointer left it. Cleared a frame later: crossing from one mesh of a model to the next fires out then over, and
 *  clearing at once made the outline blink at every seam. An over in between cancels it, and the same target is a no-op. */
export function offHover() {
  cancelAnimationFrame(leaving);
  leaving = requestAnimationFrame(() => {
    leaving = 0;
    document.body.style.cursor = '';
    if (useHover.getState().target) useHover.setState({ target: null });
  });
}

const resolution = { value: new Vector2(1, 1) };
/** Stamps where the hovered object is on screen into the stencil, drawing nothing. */
const maskMat = new MeshBasicMaterial({
  colorWrite: false, depthWrite: false, depthTest: false,
  stencilWrite: true, stencilRef: 1, stencilFunc: AlwaysStencilFunc, stencilZPass: ReplaceStencilOp,
});
/** The warm hull (the same gold as SelectHalo's glow), kept off the stamped area so only the rim outside the silhouette shows. */
const outlineMat = new MeshBasicMaterial({
  color: '#ffd166', side: DoubleSide, toneMapped: false, fog: false,
  stencilWrite: true, stencilRef: 1, stencilFunc: NotEqualStencilFunc, stencilFail: KeepStencilOp, stencilZFail: KeepStencilOp, stencilZPass: KeepStencilOp,
});
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
  const [hulls, setHulls] = useState<{ src: Mesh; mesh: Mesh; mask: Mesh }[]>([]);

  useEffect(() => {
    resolution.value.set(size.width, size.height);
  }, [size.width, size.height, gl]);

  useEffect(() => {
    if (!target) return setHulls([]);
    const list: { src: Mesh; mesh: Mesh; mask: Mesh }[] = [];
    // Skinned (people) follow their skeleton; everything else is placed by hand on top of its mesh each frame.
    const twin = (o: Mesh, geo: BufferGeometry, mat: Material, order: number) => {
      const skinned = o as SkinnedMesh;
      let m: Mesh;
      if (skinned.isSkinnedMesh) {
        const s = new SkinnedMesh(geo, mat);
        s.bind(skinned.skeleton, skinned.bindMatrix);
        m = s;
      } else m = new Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.matrixWorldAutoUpdate = false;
      m.frustumCulled = false;
      m.renderOrder = order;
      m.raycast = () => {};
      return m;
    };
    // Hidden meshes count: the map's StaticBatch hides a building's own meshes and draws merged copies instead.
    target.traverse((o) => {
      if (!outlinable(o)) return;
      // Every mask before any hull, after the rest of the scene's opaque meshes.
      list.push({ src: o, mask: twin(o, o.geometry, maskMat, 1000), mesh: twin(o, hullOf(o.geometry), outlineMat, 1001) });
    });
    setHulls(list);
  }, [target]);

  useFrame(() => {
    if (!target) return;
    if (!attached(target, scene)) return offHover();
    // Hidden meshes still track their place (the batcher only hides them), so the hull follows anything that moves.
    for (const { src, mesh, mask } of hulls) {
      mesh.matrixWorld.copy(src.matrixWorld);
      mask.matrixWorld.copy(src.matrixWorld);
    }
  });

  return (
    <group>
      {hulls.flatMap(({ mesh, mask }) => [<primitive key={mask.uuid} object={mask} />, <primitive key={mesh.uuid} object={mesh} />])}
    </group>
  );
}
