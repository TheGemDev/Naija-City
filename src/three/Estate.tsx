// A region's estate: rows of plots along roads, with your houses and the neighbours' at whatever stage each one has
// reached. Walk around by tapping the ground; tap a plot to see who owns it. You come in at the estate gate at the
// bottom-left (a ride ends there: game/store.ts rideToEstate).
//
// Every house is drawn by the shared house kit (houseKit.tsx), the same model as on the map and in the House app,
// and all of them go into one merged kit: a whole estate is a few dozen meshes however many plots are built on.
// Your own houses wear the outside you chose (game/exterior.ts) and your paint; neighbours' get a look picked from
// their plot so the street isn't forty copies of one house. Windows and gate lamps light up after dark (EstateNight).

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { hourOf, useGame } from '../game/store';
import { CAP, estateH, estateW, houseRect, PLOT, ROAD, rowsFor, sectionOf, slotOrigin, type EstateLot } from '../game/estate';
import { REGION_BY_ID } from '../game/property';
import { EXTERIOR_COLOURS, exteriorOf, type HouseExterior } from '../game/exterior';
import { paintHex } from '../game/paint';
import { CAR_BY_ID } from '../game/cars';
import { photoHour } from '../game/photo';
import { LIGHTS_ON, sceneHour } from '../game/theme';
import { gridOn } from '../game/live';
import { useEstate } from '../net/estate';
import { useSession } from '../net/session';
import { Slab } from './Slab';
import { B, Tree } from './models';
import { EstateBillboards } from './Billboard';
import { lampMat, windowMat, windowsLit } from './cityModels';
import { KitModel } from './placeKit';
import { DESIGN_WALL, drawHouse, HousePen, seedOf, type HouseFrame, type HouseLook } from './houseKit';

/** Neighbours' walls: the paints people actually pick for a Nigerian house. */
const PAINT = ['#f1e4c8', '#f4efe4', '#e8d5a8', '#d9e4ec', '#efd9c2', '#e9dccb', '#dfe7d2', '#f2d7b0'];
const ROOFS = ['red', 'green', 'blue', 'brown', 'charcoal', 'terracotta'];

export interface Lot extends EstateLot {
  key: string;
  owner: string;
  mine: boolean;
  building: boolean;
  uid: string | null;
  /** An NPC citizen's house: their children. */
  kids?: number | null;
  /** Your own houses: the name you gave it, the outside, the extensions, the paint and the cars parked there. */
  name?: string;
  exterior?: HouseExterior;
  extensions?: string[];
  wall?: string | null;
  cars?: string[];
}

/** Everything on the estate right now: my properties plus the neighbours the server knows about. */
export function useLots(region: string): Lot[] {
  const properties = useGame((s) => s.properties);
  const housePaint = useGame((s) => s.housePaint);
  const home = useGame((s) => s.homePropertyId);
  const cars = useGame((s) => s.ownedCars);
  const no = useGame((s) => s.estateNo);
  const neighbours = useEstate((s) => s.byRegion[region]);
  const uid = useSession((s) => s.user?.uid);
  return useMemo(() => {
    const mine: Lot[] = properties
      .filter((p) => p.region === region && sectionOf(p.slot ?? 0) === no)
      .map((p) => ({
        key: p.id, slot: p.slot ?? 0, plot: p.plot, stage: p.stage, design: p.design, owner: 'You', mine: true, building: !!p.building, uid: uid ?? null,
        name: p.name, exterior: p.exterior, extensions: p.extensions, wall: paintHex(housePaint[p.id]?.outer),
        // Your cars stand under the carport of the house you live in.
        cars: p.id === home ? cars.slice(-2).map((id) => CAR_BY_ID[id]?.color ?? '#475569') : [],
      }));
    const taken = new Set(mine.map((l) => l.slot));
    const others: Lot[] = (neighbours ?? [])
      .filter((n) => n.uid !== uid && !taken.has(n.slot) && sectionOf(n.slot) === no)
      .map((n) => ({ key: n.pid, slot: n.slot, plot: n.plot, stage: n.stage, design: n.design, owner: n.owner, mine: false, building: n.building, uid: n.uid, kids: n.kids }));
    return [...mine, ...others];
  }, [properties, housePaint, home, cars, no, neighbours, uid, region]);
}

/** Rows to draw for a region, from what the store and the network know. */
export const estateRowsNow = (_region: string) => rowsFor();

/** How a lot is drawn: yours as you set it up, a neighbour's from a look its plot always picks. */
export function lotLook(lot: Lot): HouseLook {
  const seed = seedOf(lot.key);
  const design = lot.design;
  const ext: HouseExterior = lot.mine
    ? lot.exterior ?? {}
    : { roofColour: ROOFS[seed % ROOFS.length], fenceColour: EXTERIOR_COLOURS[(seed >> 3) % 4].id, gateColour: ['black', 'green', 'blue', 'black'][(seed >> 5) % 4] };
  return {
    design, stage: lot.stage, building: lot.building, plot: lot.plot, seed,
    wall: lot.wall ?? (lot.mine ? DESIGN_WALL[design ?? 'starter'] : PAINT[seed % PAINT.length]) ?? '#f1e4c8',
    ext: exteriorOf(design, ext), extensions: lot.extensions ?? [], cars: lot.cars,
  };
}

/** Plot frame for the kit: the plot centred on its middle, the house where the walk-round path blocks it. */
export function lotFrame(slot: number, plot: Lot['plot']): { cx: number; cz: number; frame: HouseFrame } {
  const o = slotOrigin(slot);
  const r = houseRect(slot, plot);
  const cx = o.x + PLOT / 2, cz = o.z + PLOT / 2;
  const half = PLOT / 2 - 0.04;
  // The house fills its blocked cells, kept clear of the compound wall.
  const m = 0.32;
  return {
    cx, cz,
    frame: {
      w: PLOT - 0.04, d: PLOT - 0.04, fh: 0.72,
      house: { x0: Math.max(-half + m, r.x0 - cx + 0.08), z0: Math.max(-half + m, r.z0 - cz + 0.08), x1: Math.min(half - m, r.x1 - cx - 0.08), z1: r.z1 - cz - 0.12 },
    },
  };
}

/** Every house on the estate in one kit. Rebuilt only when a house changes (a stage done, a new look). */
function EstateHouses({ lots }: { lots: Lot[] }) {
  const sig = lots.map((l) => `${l.key}:${l.slot}:${l.plot}:${l.design}:${l.stage}:${l.building ? 1 : 0}:${l.wall ?? ''}:${JSON.stringify(l.exterior ?? null)}:${(l.extensions ?? []).join(',')}:${(l.cars ?? []).join(',')}`).join('|');
  return (
    <KitModel
      deps={[sig]}
      build={(low) => {
        const k = new HousePen();
        for (const lot of lots) {
          const { cx, cz, frame } = lotFrame(lot.slot, lot.plot);
          k.ox = cx;
          k.oz = cz;
          drawHouse(k, lotLook(lot), frame, low);
        }
        return k.done();
      }}
    />
  );
}

function Label({ lot }: { lot: Lot }) {
  const o = slotOrigin(lot.slot);
  const picked = useEstate((s) => s.picked === lot.slot);
  const storeys = lot.design === 'flats' ? 3 : lot.design === 'mansion' || lot.design === 'duplex' || lot.extensions?.includes('floor2') ? 2 : 1;
  const tall = lot.stage >= 2 ? 0.72 * storeys + 1.1 : 0.8;
  return (
    <Html position={[o.x + PLOT / 2, tall, o.z + PLOT / 2]} center zIndexRange={[8, 1]} style={{ pointerEvents: 'auto' }}>
      <button
        type="button"
        className={`place-label ${picked ? 'on' : ''} ${lot.mine ? 'home' : ''}`}
        onClick={() => useEstate.setState({ picked: picked ? null : lot.slot })}
      >
        {lot.mine ? `⭐ ${lot.name || 'You'}` : `👤 ${lot.owner}`}
      </button>
    </Html>
  );
}

/**
 * The estate's own gate where the road comes in: pillars, a name arch, the barrier and the security hut. Arriving off a
 * ride, this is where you are let out.
 */
function EstateGate({ region, rows }: { region: string; rows: number }) {
  const name = REGION_BY_ID[region]?.name ?? 'Estate';
  const z = estateH(rows) - ROAD / 2;
  return (
    <group>
      <KitModel
        deps={[rows]}
        build={(low) => {
          const k = new HousePen();
          k.ox = 0;
          k.oz = z;
          for (const s of [-1, 1]) {
            k.box('#e6dcc6', [1 + s * 1.25, 0.6, 0], [0.32, 1.2, 0.32]);
            k.box('#a8a29e', [1 + s * 1.25, 1.22, 0], [0.4, 0.06, 0.4]);
            k.box(`lamp${s > 0 ? 1 : 2}`, [1 + s * 1.25, 1.32, 0], [0.12, 0.14, 0.12]);
            k.pool(1 + s * 1.25, 0.4, 0.6, 0.3);
          }
          k.box('#1f6b46', [1, 1.38, 0], [2.8, 0.36, 0.1]);
          k.box('#f4f1ea', [1, 1.38, 0.055], [2.5, 0.24, 0.01]);
          // The barrier arm, up, and the hut.
          k.post('#e5e7eb', [-0.05, 0, -0.9], 0.04, 0.5, 6);
          k.box('#dc2626', [-0.05, 0.85, -0.9], [0.06, 0.7, 0.06], [0, 0, 0.12]);
          k.box('#e8e2d4', [-0.55, 0.32, -1.4], [0.6, 0.64, 0.55]);
          k.box('#475569', [-0.55, 0.67, -1.4], [0.72, 0.06, 0.66]);
          k.box('glass2', [-0.24, 0.38, -1.4], [0.02, 0.2, 0.3]);
          if (!low) k.box('#facc15', [-0.05, 0.85, -0.9], [0.065, 0.12, 0.065], [0, 0, 0.12]);
          return k.done();
        }}
      />
      <Html position={[1, 1.95, z]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
        <div className="place-label landmark"><b>{name} Estate</b></div>
      </Html>
    </group>
  );
}

/** Windows and lamps glow after dark here too (on the map City.tsx's MapEffects does it). */
function EstateNight() {
  useFrame(() => {
    const h = photoHour() ?? sceneHour(hourOf(useGame.getState().minutes));
    const night = h < 6.3 || h >= LIGHTS_ON ? 1 : 0;
    windowMat.emissiveIntensity = night * 0.9;
    windowsLit.value = (h >= LIGHTS_ON ? 0.8 : h < 4 ? 0.8 - (h / 4) * 0.6 : 0.35) * (gridOn() ? 1 : 0.4);
    lampMat.emissiveIntensity = night * 2.5;
  });
  return null;
}

export function Estate() {
  const region = useGame((s) => s.estateId);
  const lots = useLots(region ?? '');
  if (!region) return null;
  const rows = rowsFor();
  const W = estateW();
  const H = estateH(rows);
  const used = new Set(lots.map((l) => l.slot % CAP));
  const onGround = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    useEstate.setState({ picked: null });
    useGame.getState().walkTo({ x: Math.max(0, Math.min(W - 1, Math.floor(e.point.x))), z: Math.max(0, Math.min(H - 1, Math.floor(e.point.z))) });
  };
  return (
    <group>
      <EstateNight />
      <Slab x0={-1} z0={-1} x1={W + 1} z1={H + 1} top="#86a94b" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0.01, H / 2]} onClick={onGround} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#8fb352" />
      </mesh>
      {Array.from({ length: rows }, (_, row) => (
        <group key={row}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0.02, row * (PLOT + ROAD) + PLOT + ROAD / 2]} receiveShadow>
            <planeGeometry args={[W, ROAD]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          {Array.from({ length: Math.floor(W / 2) }, (_, i) => (
            <B key={i} p={[i * 2 + 1, 0.03, row * (PLOT + ROAD) + PLOT + ROAD / 2]} s={[0.7, 0.01, 0.08]} c="#facc15" />
          ))}
        </group>
      ))}
      {Array.from({ length: CAP }, (_, slot) => {
        const o = slotOrigin(slot);
        const owned = used.has(slot);
        return (
          <group key={slot}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[o.x + PLOT / 2, 0.006, o.z + PLOT / 2]}
              onClick={(event) => {
                if (event.delta > 8) return;
                event.stopPropagation();
                useEstate.setState((s) => ({ picked: s.picked === slot ? null : slot }));
              }}
              receiveShadow
            >
              <planeGeometry args={[PLOT - 0.2, PLOT - 0.2]} />
              <meshStandardMaterial color={owned ? '#b98a5e' : '#9cbf5c'} />
            </mesh>
            {!owned && (
              <group position={[o.x + PLOT / 2, 0, o.z + PLOT - 0.6]}>
                <B p={[0, 0.3, 0]} s={[0.06, 0.6, 0.06]} c="#78716c" />
                <B p={[0, 0.65, 0]} s={[0.8, 0.35, 0.05]} c="#fef3c7" />
              </group>
            )}
          </group>
        );
      })}
      <EstateHouses lots={lots} />
      {lots.map((l) => <Label key={l.key} lot={l} />)}
      <EstateGate region={region} rows={rows} />
      <EstateBillboards width={W} region={region} />
      {[0, W - 1].flatMap((x) =>
        Array.from({ length: rows }, (_, i) => (
          <group key={`${x}-${i}`} position={[x + 0.5, 0, i * (PLOT + ROAD) + 2]}>
            <Tree s={0.5} />
          </group>
        )),
      )}
    </group>
  );
}
