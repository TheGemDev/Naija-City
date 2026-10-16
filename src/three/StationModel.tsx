// The train station on the city map (cityModels.tsx 'station'): a glass-fronted hall in the railway's green and white,
// a platform under a long canopy behind it, two tracks, and the train itself pulling in, standing and pulling out again
// (trainKit PassingTrain), cut off at the edges of the plot so it never runs through the neighbours.

import { useMemo } from 'react';
import { Kit, KitMeshes } from './cabinKit';
import { PassingTrain, RAIL_GREEN, train } from './trainKit';

/** The train on the map: a diesel and two short coaches, at the map's scale. */
const MAP_SCALE = 0.42;
const buildTrain = (k: Kit) => train(k, 2, 5, 4, 0.25);

export function TrainStation({ w, d }: { w: number; d: number }) {
  const back = -d / 2;
  const near = back + 0.5;
  const far = back + 1.15;
  const platform = back + 1.95;
  const kit = useMemo(() => {
    const k = new Kit(false);
    // Ballast and the two tracks along the back of the plot
    k.box([w, 0.04, 1.6], [0, 0.02, back + 0.8], '#8a8178', 'matte');
    for (const z of [near, far]) {
      for (let x = -w / 2 + 0.15; x < w / 2; x += 0.3) k.box([0.08, 0.03, 0.82], [x, 0.05, z], '#5b4636', 'matte');
      for (const dz of [-0.3, 0.3]) k.box([w, 0.04, 0.05], [0, 0.08, z + dz], '#57534e', 'metal');
    }
    // The platform: paving, its yellow line and white edge, under a canopy on slim columns
    k.box([w - 0.2, 0.36, 0.9], [0, 0.18, platform], '#d6d3d1', 'matte');
    k.box([w - 0.2, 0.012, 0.06], [0, 0.365, platform - 0.3], '#facc15', 'matte');
    k.box([w - 0.2, 0.012, 0.05], [0, 0.365, platform - 0.43], '#f8fafc', 'matte');
    for (let x = -w / 2 + 0.6; x <= w / 2 - 0.5; x += 1.2) k.box([0.06, 1.1, 0.06], [x, 0.9, platform + 0.25], '#94a3b8', 'metal');
    k.soft([w - 0.4, 0.07, 1.25], [0, 1.48, platform - 0.05], RAIL_GREEN, 'satin', [0.06, 0, 0], 0.03);
    k.box([w - 0.4, 0.03, 0.06], [0, 1.43, platform - 0.66], '#f8fafc', 'satin');
    // Benches and lamps on the platform
    for (const x of [-w / 4, w / 4]) {
      k.box([0.5, 0.05, 0.16], [x, 0.55, platform + 0.2], '#92400e', 'satin');
      k.box([0.04, 0.6, 0.04], [x + 0.6, 0.66, platform + 0.32], '#475569', 'metal');
      k.box([0.12, 0.05, 0.12], [x + 0.6, 0.98, platform + 0.32], '#fef9c3', 'glow');
    }
    // The hall: white frame, a green band and roof, glass all along the front, and a clock tower at one end
    const hz = platform + 0.45 + (d / 2 - (platform + 0.45)) / 2;
    const hd = d / 2 - (platform + 0.45) - 0.2;
    k.soft([w - 0.5, 1.5, hd], [0, 0.75, hz], '#f5f5f4', 'satin', undefined, 0.04);
    k.box([w - 0.9, 0.95, 0.04], [0, 0.72, hz + hd / 2 + 0.01], '#7dd3fc', 'satin');
    for (let x = -(w - 0.9) / 2; x <= (w - 0.9) / 2 + 0.01; x += (w - 0.9) / 6) k.box([0.05, 0.95, 0.06], [x, 0.72, hz + hd / 2 + 0.02], '#f8fafc', 'satin');
    k.box([w - 0.3, 0.16, hd + 0.3], [0, 1.58, hz], RAIL_GREEN, 'satin');
    k.box([w - 0.6, 0.06, hd + 0.1], [0, 1.69, hz], '#e5e7eb', 'satin');
    k.box([1.6, 0.28, 0.05], [0, 1.25, hz + hd / 2 + 0.05], RAIL_GREEN, 'satin');
    k.box([1.4, 0.16, 0.02], [0, 1.25, hz + hd / 2 + 0.08], '#f8fafc', 'glow');
    // The entrance canopy and the clock tower
    k.box([1.4, 0.05, 0.6], [0, 1.0, hz + hd / 2 + 0.3], RAIL_GREEN, 'satin');
    for (const x of [-0.6, 0.6]) k.box([0.05, 1.0, 0.05], [x, 0.5, hz + hd / 2 + 0.55], '#94a3b8', 'metal');
    const tx = w / 2 - 0.65;
    k.soft([0.6, 2.4, 0.6], [tx, 1.2, hz], '#f5f5f4', 'satin', undefined, 0.04);
    k.box([0.64, 0.2, 0.64], [tx, 2.3, hz], RAIL_GREEN, 'satin');
    k.cyl(0.2, 0.2, 0.03, [tx, 1.95, hz + 0.31], '#fefce8', 'glow', [Math.PI / 2, 0, 0], 16);
    return k.build();
  }, [w, d, back, near, far, platform]);
  return (
    <group>
      <KitMeshes kit={kit} />
      {/* The passenger train on the near track, nose towards +x; it comes and goes every forty seconds or so. */}
      <PassingTrain build={buildTrain} from={-w / 2 + 0.05} to={w / 2 - 0.05} stop={w / 2 - 0.3} at={[0, 0.1, near]} scale={MAP_SCALE} cycle={42} />
    </group>
  );
}
