// Merges every static mesh under it into a handful of big meshes, one per material look per
// map chunk. The town is built from thousands of little boxes, each its own draw call; phones
// choke on that. The originals stay in the scene, hidden, so taps on buildings still hit them.
//
// Anything that moves must sit under an object with `userData.dynamic` so it's left alone.
// Children are read once when this mounts: give it a `key` that changes when they do.

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  BufferGeometry, Float32BufferAttribute, Matrix3, Matrix4, Mesh, Vector3,
  type Group, type Material, type MeshStandardMaterial, type Object3D,
} from 'three';

interface Bucket { material: Material; ownColor: boolean; cast: boolean; receive: boolean; pos: number[]; nor: number[]; col: number[]; seed: number[] }

const v = new Vector3();
const n = new Vector3();

/** A steady number from 0 to 1 for a spot in the world: the same window always gets the same one. */
function seedAt(x: number, y: number, z: number) {
  const h = Math.sin(x * 12.9898 + y * 4.1414 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function signature(m: MeshStandardMaterial, cast: boolean, receive: boolean) {
  return [
    m.type, m.flatShading, m.emissive?.getHexString(), m.emissiveIntensity, m.roughness, m.metalness,
    m.transparent, m.opacity, m.side, m.depthWrite, m.polygonOffset, cast, receive,
  ].join('|');
}

/** Hidden, already merged, under something that moves, or something we can't merge. */
function skip(o: Object3D) {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.userData.dynamic) return true;
  const m = o as Mesh;
  if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || (m as { isSkinnedMesh?: boolean }).isSkinnedMesh) return true;
  if (!m.visible || Array.isArray(m.material) || !m.geometry.attributes.position) return true;
  const mat = m.material as MeshStandardMaterial;
  return !!mat.map || (mat.transparent && mat.opacity === 0);
}

export function StaticBatch({ children, chunk = 16 }: { children: ReactNode; chunk?: number }) {
  const root = useRef<Group>(null!);

  useLayoutEffect(() => {
    const g = root.current;
    g.updateWorldMatrix(true, true);
    const toLocal = new Matrix4().copy(g.matrixWorld).invert();

    const meshes: Mesh[] = [];
    g.traverse((o) => { if (o !== g && !skip(o)) meshes.push(o as Mesh); });

    // Materials shared between meshes (window glass, lamp heads) are changed from code at night,
    // so those keep their own material instead of being folded into a vertex-coloured copy. Each of
    // their meshes gets a `seed` (0 to 1, from where it stands) so the material can tell one window
    // from the next: which are lit at night is worked out from it (cityModels.tsx).
    const uses = new Map<Material, number>();
    for (const m of meshes) uses.set(m.material as Material, (uses.get(m.material as Material) ?? 0) + 1);

    const buckets = new Map<string, Bucket>();
    const rel = new Matrix4();
    const normalM = new Matrix3();
    for (const mesh of meshes) {
      const mat = mesh.material as MeshStandardMaterial;
      rel.multiplyMatrices(toLocal, mesh.matrixWorld);
      normalM.getNormalMatrix(rel);
      v.setFromMatrixPosition(rel);
      const cell = `${Math.floor(v.x / chunk)},${Math.floor(v.z / chunk)}`;
      const shared = (uses.get(mat) ?? 0) > 1;
      const key = `${cell}|${shared ? mat.uuid : signature(mat, mesh.castShadow, mesh.receiveShadow)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material: mat, ownColor: shared, cast: mesh.castShadow, receive: mesh.receiveShadow, pos: [], nor: [], col: [], seed: [] }));
      b.cast ||= mesh.castShadow;
      b.receive ||= mesh.receiveShadow;

      const geo = mesh.geometry;
      const P = geo.attributes.position;
      const N = geo.attributes.normal;
      const idx = geo.index;
      const count = idx ? idx.count : P.count;
      const flip = rel.determinant() < 0;
      const { r, g: gr, b: bl } = mat.color ?? { r: 1, g: 1, b: 1 };
      const seed = shared ? seedAt(v.x, v.y, v.z) : 0;
      for (let i = 0; i < count; i++) {
        // Mirrored meshes wind the other way; swap two corners so faces still point out.
        const k = flip ? i - (i % 3) + [0, 2, 1][i % 3] : i;
        const j = idx ? idx.getX(k) : k;
        v.fromBufferAttribute(P, j).applyMatrix4(rel);
        b.pos.push(v.x, v.y, v.z);
        if (N) n.fromBufferAttribute(N, j).applyMatrix3(normalM).normalize();
        else n.set(0, 1, 0);
        b.nor.push(n.x, n.y, n.z);
        b.col.push(r, gr, bl);
        if (shared) b.seed.push(seed);
      }
    }

    const made: Mesh[] = [];
    for (const b of buckets.values()) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new Float32BufferAttribute(b.nor, 3));
      let material = b.material;
      if (b.ownColor) geo.setAttribute('seed', new Float32BufferAttribute(b.seed, 1));
      else {
        geo.setAttribute('color', new Float32BufferAttribute(b.col, 3));
        material = b.material.clone();
        (material as MeshStandardMaterial).color?.setRGB(1, 1, 1);
        material.vertexColors = true;
      }
      geo.computeBoundingSphere();
      const m = new Mesh(geo, material);
      m.castShadow = b.cast;
      m.receiveShadow = b.receive;
      m.matrixAutoUpdate = false;
      m.userData.ownMaterial = material !== b.material;
      made.push(m);
    }
    for (const m of meshes) m.visible = false;
    if (made.length) g.add(...made);

    return () => {
      for (const m of meshes) m.visible = true;
      for (const m of made) {
        g.remove(m);
        m.geometry.dispose();
        if (m.userData.ownMaterial) (m.material as Material).dispose();
      }
    };
  }, [chunk]);

  return <group ref={root}>{children}</group>;
}
