// A tree on its own: one mesh from the shared tree kit (trees.ts). On the city map StaticBatch folds it into the
// town's buckets (no draw call of its own); in a yard, a camp or a room it is one draw call.

import { useLowPerf } from '../game/quality';
import { bushKind, mapTreeSize, treeDust, treeGeometry, treePick, type TreeKind } from './trees';

type V3 = [number, number, number];

/**
 * `s` is the map's tree scale (about a third of its height); `size` instead gives the kit's own scale outright (a
 * neem that many units tall). `kind` is the species: a shade tree or oil palm from where it stands by default.
 */
export function TreeModel({ p = [0, 0, 0], s = 0.6, size, kind, seed = 0 }: { p?: V3; s?: number; size?: number; kind?: TreeKind; seed?: number }) {
  const low = useLowPerf();
  const k = kind ?? bushKind(p[0] + seed, p[2]);
  const pick = treePick(k, p[0], p[2], seed);
  const scale = size ?? mapTreeSize(k, s) * pick.scale;
  return (
    // noShade: the ground shade under buildings (CityFx) would read a tree's bounds as a building.
    <mesh geometry={treeGeometry(k, pick.variant, pick.palette, low, treeDust())} position={p} rotation={[pick.lx, pick.yaw, pick.lz]} scale={scale} castShadow receiveShadow dispose={null} userData={{ noShade: true }}>
      <meshStandardMaterial vertexColors flatShading emissiveIntensity={0} />
    </mesh>
  );
}
