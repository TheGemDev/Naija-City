// The Finishes tab's marks on the house: the rooms or the stretch of wall you picked. And what a tap picks.

import { useMemo } from 'react';
import type { HouseLayout } from '../game/grid';
import { faceCell, faceKey, interiorRooms, parseFace, roomAt, wallRun, type Face } from '../game/finishes';
import { setFinishUi, useFinishUi } from '../game/finishUi';
import { useGame } from '../game/store';
import { WALL_SHORT, WALL_THICK } from '../game/mount';

/** A tap on the floor plan at p (house units) while the Finishes tab is open. */
export function finishTap(p: { x: number; z: number }, layout: HouseLayout) {
  const ui = useFinishUi.getState();
  if (ui.part === 'mood') return;
  if (ui.part === 'face') {
    // The nearest wall edge, and which side of it the tap was on.
    const cx = Math.floor(p.x), cz = Math.floor(p.z);
    const fx = p.x - cx, fz = p.z - cz;
    const opts: [number, Face][] = [
      [fx, { dir: 'v', x: cx, z: cz, side: 'b' }],
      [1 - fx, { dir: 'v', x: cx + 1, z: cz, side: 'a' }],
      [fz, { dir: 'h', x: cx, z: cz, side: 'b' }],
      [1 - fz, { dir: 'h', x: cx, z: cz + 1, side: 'a' }],
    ];
    opts.sort((a, b) => a[0] - b[0]);
    for (const [, f] of opts) {
      const run = wallRun(layout, f);
      if (!run.length) continue;
      const keys = run.map(faceKey);
      setFinishUi({ faces: ui.faces[0] === keys[0] && ui.faces.length === keys.length ? [] : keys });
      return;
    }
    useGame.getState().toast('Tap close to a wall inside the house');
    return;
  }
  const room = roomAt(layout, { x: Math.floor(p.x), z: Math.floor(p.z) });
  if (!room) return useGame.getState().toast('Tap a room inside the house');
  const rooms = ui.rooms.includes(room.name) ? ui.rooms.filter((r) => r !== room.name) : [...ui.rooms, room.name];
  setFinishUi({ rooms });
}

export function FinishGuides({ layout }: { layout: HouseLayout }) {
  const on = useFinishUi((s) => s.on);
  const part = useFinishUi((s) => s.part);
  const rooms = useFinishUi((s) => s.rooms);
  const faces = useFinishUi((s) => s.faces);
  const picked = useMemo(() => interiorRooms(layout).filter((r) => rooms.includes(r.name)), [layout, rooms]);
  if (!on || part === 'mood') return null;
  if (part === 'face')
    return (
      <group>
        {faces.map((k) => {
          const f = parseFace(k);
          if (!f) return null;
          const c = faceCell(f);
          const off = (f.side === 'a' ? -1 : 1) * (WALL_THICK / 2 + 0.03);
          const horiz = f.dir === 'h';
          return (
            <mesh key={k} position={horiz ? [f.x + 0.5, WALL_SHORT / 2, f.z + off] : [f.x + off, WALL_SHORT / 2, f.z + 0.5]} renderOrder={4} raycast={() => null}>
              <boxGeometry args={horiz ? [0.98, WALL_SHORT, 0.04] : [0.04, WALL_SHORT, 0.98]} />
              <meshBasicMaterial color={roomAt(layout, c) ? '#facc15' : '#ef4444'} transparent opacity={0.55} depthWrite={false} />
            </mesh>
          );
        })}
      </group>
    );
  return (
    <group>
      {picked.map((r) => (
        <mesh key={r.name} position={[(r.x0 + r.x1) / 2, 0.05, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4} raycast={() => null}>
          <planeGeometry args={[r.x1 - r.x0 - 0.1, r.z1 - r.z0 - 0.1]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
