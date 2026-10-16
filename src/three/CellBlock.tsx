// The cell doors of the police cells (game/cells.ts): one barred leaf per cell that slides open along the bars when
// somebody is let out. Yours opens when the warder walks you out (store.cellExit); anybody else's opens as they pass
// through it, so visitors in the corridor see the door go. The fixed bars are a prop (props/civic.tsx cell_front).

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, type BufferGeometry, type Group } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { avatar } from '../game/avatar';
import { CELLS, type JailCell } from '../game/cells';
import { useGame } from '../game/store';
import { lobbyArea, placeArea, remotePos, useNet } from '../net/multiplayer';

/** How far the leaf slides when open: its own width, so it ends up over the bars beside the doorway. */
const SLIDE = 0.98;
/** In front of the fixed bars, on the corridor side, so it can slide over them. */
const LEAF_Z = 0.08;

/** One door leaf as a single mesh: bars, rails and the lock. */
function leafGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(g);
  };
  for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) box(0.05, 2.26, 0.05, x, 1.17, 0);
  for (const y of [0.08, 1.15, 2.27]) box(0.94, 0.07, 0.07, 0, y, 0);
  box(0.12, 0.18, 0.08, -0.34, 1.02, 0.05);
  const merged = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  return merged;
}

/** Somebody standing in the doorway, or just through it. Not someone at the bars inside, nor a visitor right outside. */
const inDoorway = (c: JailCell, x: number, z: number) => Math.abs(x - (c.door.x + 0.5)) < 0.6 && z > c.door.z - 0.4 && z < c.door.z + 1.4;

export function CellDoors() {
  const geometry = useMemo(leafGeometry, []);
  const leaves = useRef<(Group | null)[]>([]);
  const open = useRef(CELLS.map(() => 0));
  useFrame((_, dt) => {
    const g = useGame.getState();
    const area = lobbyArea(placeArea(g, useNet.getState().myId));
    CELLS.forEach((c, i) => {
      // Yours stays open from the moment you're let out until you're through it.
      const through = avatar.z > c.outside.z + 0.6 || Math.abs(avatar.x - (c.door.x + 0.5)) > 1.2;
      let want = (g.cellExit?.cell === i && !through) || inDoorway(c, avatar.x, avatar.z);
      if (!want) remotePos.forEach((p) => { if (!want && p.area === area && inDoorway(c, p.x, p.z)) want = true; });
      const now = open.current[i] + ((want ? 1 : 0) - open.current[i]) * Math.min(1, dt * 5);
      open.current[i] = now;
      const leaf = leaves.current[i];
      if (leaf) leaf.position.x = now * SLIDE;
    });
  });
  return (
    <group>
      {CELLS.map((c, i) => (
        <group key={i} position={[c.door.x + 0.5, 0, c.door.z + 0.5 + LEAF_Z]}>
          <group ref={(el) => { leaves.current[i] = el; }}>
            <mesh geometry={geometry} castShadow>
              <meshStandardMaterial color="#475569" flatShading />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
