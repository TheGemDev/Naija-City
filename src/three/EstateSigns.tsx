// Where each estate's road leaves town on the city map (game/estateRoads.ts): a green road sign on two posts pointing
// out of town, so a ride to an estate visibly ends somewhere. The sign for the estate you are riding to, and the ones
// where you own a house, carry their name.

import { Html } from '@react-three/drei';
// cityModels before placeKit (see houseKit.tsx): the map imports this file first.
import './cityModels';
import { useGame } from '../game/store';
import { cityEstates } from '../game/property';
import { estateExits } from '../game/estateRoads';
import { KitModel } from './placeKit';
import { HousePen } from './houseKit';

/** The signposts, merged into one kit (it sits in the map's StaticBatch with the buildings). */
export function EstateSigns({ city }: { city: string }) {
  return (
    <KitModel
      deps={[city]}
      build={(low) => {
        const k = new HousePen();
        for (const e of Object.values(estateExits(city))) {
          // Beside the road cell, turned to face back into town; the arrow points the way out.
          const side = Math.abs(e.out.x) > Math.abs(e.out.z) ? { x: 0, z: 0.62 } : { x: 0.62, z: 0 };
          const x = e.cell.x + 0.5 + side.x, z = e.cell.z + 0.5 + side.z;
          const yaw = Math.atan2(e.out.x, e.out.z);
          const across = Math.abs(e.out.x) > Math.abs(e.out.z);
          for (const s of [-0.28, 0.28]) k.post('#9ca3af', [x + (across ? 0 : s), 0, z + (across ? s : 0)], 0.025, 0.95, 5);
          k.box('#15803d', [x, 0.92, z], across ? [0.04, 0.32, 0.78] : [0.78, 0.32, 0.04]);
          k.box('#f8fafc', [x, 0.92, z], across ? [0.05, 0.26, 0.7] : [0.7, 0.26, 0.05]);
          k.box('#15803d', [x, 0.92, z], across ? [0.06, 0.2, 0.62] : [0.62, 0.2, 0.06]);
          if (!low) {
            // The arrow on the board, pointing along the road out of town.
            const ax = x + Math.sin(yaw) * 0.18, az = z + Math.cos(yaw) * 0.18;
            k.box('#f8fafc', [ax, 0.92, az], across ? [0.07, 0.05, 0.12] : [0.12, 0.05, 0.07]);
          }
        }
        return k.done();
      }}
    />
  );
}

/** Names over the signs that matter right now: the estate you are riding to and the ones you own a house in. */
export function EstateSignLabels({ city }: { city: string }) {
  const target = useGame((s) => (s.task?.estate ? s.task.estate.region : null));
  const owned = useGame((s) => s.properties.map((p) => p.region).join(','));
  const exits = estateExits(city);
  const shown = cityEstates(city).filter((r) => r.id === target || owned.split(',').includes(r.id));
  return (
    <>
      {shown.map((r) => {
        const e = exits[r.id];
        if (!e) return null;
        return (
          <Html key={r.id} position={[e.cell.x + 0.5, 1.6, e.cell.z + 0.5]} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`place-label landmark ${r.id === target ? 'on' : ''}`}><b>→ {r.name} Estate</b></div>
          </Html>
        );
      })}
    </>
  );
}
