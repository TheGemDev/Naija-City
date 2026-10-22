import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { ExtrudeGeometry, Shape, type Group } from 'three';
import { edgeKey, houseLayout, isEditableEdge, pathToCell, wallBuildError, type Edge, type HouseLayout, type PlacedItem, type WallEdge } from '../game/grid';
import { houseKeyOf, useGame } from '../game/store';
import { edgeHasWindow } from '../game/mount';
import { wallMountGroups } from './DecorEdit';
import { applyFinish, type HouseFinish } from '../game/finishes';
import { finishToolOn, useFinishUi } from '../game/finishUi';
import { HouseInterior, SideScaled, SideTall } from './HouseShell';
import { HouseLights } from './HouseLights';
import { FinishGuides, finishTap } from './FinishGuides';
import { avatar, avatarCell } from '../game/avatar';
import { Tree } from './models';
import { CarModel } from './CarModel';
import { HomeCarport, HouseDoors, YardPuddles } from './homeYard';
import { designOfKey, exteriorOf, withPark } from '../game/exterior';
import { useVisit } from '../game/visits';
import { useParkedCar } from '../ui/parkedCarStore';
import { homeTransform } from '../game/origins';
import { StaticBatch } from './StaticBatch';
import { DEFAULT_INNER_WALL, paintHex, type HousePaint } from '../game/paint';

const WALL_T = 0.14;
const TALL = 2.6;
const SHORT = 0.9;
const FENCE = 1.3;

function Floors({ layout }: { layout: HouseLayout }) {
  const tiles = useMemo(() => {
    const out: { x: number; z: number; c: string }[] = [];
    for (const r of layout.rooms)
      for (let x = r.x0; x < r.x1; x++)
        for (let z = r.z0; z < r.z1; z++) out.push({ x, z, c: (x + z) % 2 ? r.a : r.b });
    return out;
  }, [layout]);
  return (
    <StaticBatch>
      {tiles.map((t) => (
        <mesh key={`${t.x},${t.z}`} position={[t.x + 0.5, 0.005, t.z + 0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={t.c} />
        </mesh>
      ))}
    </StaticBatch>
  );
}

/** Outward direction of an outer house wall, used to lower the walls facing the camera. */
function outwardNormal(e: Edge): [number, number] | null {
  if (!e.tall) return null;
  if (e.dir === 'h') return e.z === 0 ? [0, -1] : [0, 1];
  return e.x === 0 ? [-1, 0] : [1, 0];
}

/** All wall edges on one side of the house. Outer walls drop to half height when they face the
 *  camera; every edge on a side moves together, so each side is merged and animated as one.
 *  Inside walls always stand full height. */
function WallSide({ edges, normal, center, layout, paint, finish }: { edges: Edge[]; normal: [number, number] | null; center: { x: number; z: number }; layout: HouseLayout; paint?: HousePaint; finish?: HouseFinish }) {
  const outerColour = paintHex(paint?.outer) ?? layout.shell.wall;
  const innerColour = paintHex(paint?.inner) ?? DEFAULT_INNER_WALL;
  const bodies = useRef<Group>(null!);
  const caps = useRef<Group>(null!);
  const wins = useRef<Group>(null!);
  const tallHeight = TALL;
  const height = useRef(tallHeight);

  useFrame(({ camera }, dt) => {
    if (!normal) return;
    const facing = normal[0] * (camera.position.x - center.x) + normal[1] * (camera.position.z - center.z) > 0;
    const goal = facing ? SHORT : tallHeight;
    height.current += (goal - height.current) * Math.min(1, dt * 8);
    const h = height.current;
    bodies.current.scale.y = h;
    caps.current.position.y = h;
    wins.current.visible = h > 2;
    // Pictures, TVs and the like hung on this side drop out of sight with it (three/DecorEdit.tsx).
    const mounted = wallMountGroups.get(normal.join(','));
    if (mounted) for (const g of mounted) g.visible = h > 1.8;
  });

  return (
    <group>
      {/* Animated sides: unit-height walls scaled by the group. Others stand at their own height. */}
      <group ref={bodies} scale={[1, normal ? tallHeight : 1, 1]}>
        <StaticBatch>
          {edges.map((e, i) => {
            const horiz = e.dir === 'h';
            const base = normal ? 1 : e.kind === 'fence' ? FENCE : TALL;
            // Walls with a window are built round their opening (HouseShell SideScaled).
            if (normal && edgeHasWindow(e, layout)) return null;
            return (
              <mesh key={i} position={[horiz ? e.x + 0.5 : e.x, base / 2, horiz ? e.z : e.z + 0.5]} scale={[1, base, 1]} castShadow receiveShadow>
                <boxGeometry args={horiz ? [1 + WALL_T, 1, WALL_T] : [WALL_T, 1, 1 + WALL_T]} />
                <meshStandardMaterial color={e.kind === 'fence' ? '#d8c7a8' : e.tall ? outerColour : innerColour} flatShading />
              </mesh>
            );
          })}
        </StaticBatch>
        {normal && <SideScaled edges={edges} layout={layout} finish={finish} wall={outerColour} innerColour={innerColour} height={height} />}
      </group>
      <group ref={caps} position={[0, normal ? tallHeight : 0, 0]}>
        <StaticBatch>
          {edges.map((e, i) => {
            const horiz = e.dir === 'h';
            const base = normal ? 0 : e.kind === 'fence' ? FENCE : TALL;
            return (
              <mesh key={i} position={[horiz ? e.x + 0.5 : e.x, base + 0.03, horiz ? e.z : e.z + 0.5]} castShadow>
                <boxGeometry args={horiz ? [1 + WALL_T, 0.06, WALL_T + 0.04] : [WALL_T + 0.04, 0.06, 1 + WALL_T]} />
                <meshStandardMaterial color={e.kind === 'fence' ? '#b9a27c' : e.tall ? layout.shell.trim : '#847b6a'} flatShading />
              </mesh>
            );
          })}
        </StaticBatch>
      </group>
      {/* Windows, cornices, POP borders and switches: only while the side stands tall (HouseShell SideTall). */}
      <group ref={wins}>
        {normal && <SideTall edges={edges} normal={normal} layout={layout} finish={finish} />}
      </group>
    </group>
  );
}

function EntryPorch({ layout }: { layout: HouseLayout }) {
  const west = layout.entry.side === 'west';
  const north = layout.entry.side === 'north';
  const span = layout.width >= 14 ? 3 : 1;
  const center = layout.entry.at + 0.5;
  const x = west ? -0.28 : center;
  const z = west ? layout.entry.at + 0.5 : north ? -0.32 : layout.depth + 0.32;
  const porchWidth = west ? 0.58 : span;
  const porchDepth = west ? span : 0.58;
  const columnPositions = span > 1
    ? west ? [[-0.15, center - 1], [-0.15, center + 1]] : [[center - 1, north ? -0.16 : layout.depth + 0.16], [center + 1, north ? -0.16 : layout.depth + 0.16]]
    : [];
  return (
    <group>
      <mesh position={[x, 0.08, z]} receiveShadow castShadow>
        <boxGeometry args={[porchWidth, 0.16, porchDepth]} />
        <meshStandardMaterial color={layout.shell.trim} />
      </mesh>
      {span > 1 && (
        <>
          <mesh position={[west ? -0.34 : center, 2.32, west ? center : north ? -0.05 : layout.depth + 0.05]} castShadow>
            <boxGeometry args={[west ? 0.18 : span + 0.45, 0.14, west ? span + 0.45 : 0.9]} />
            <meshStandardMaterial color={layout.shell.roof} />
          </mesh>
          {columnPositions.map(([cx, cz], i) => (
            <mesh key={i} position={[cx, 1.16, cz]} castShadow>
              <boxGeometry args={[0.14, 2.32, 0.14]} />
              <meshStandardMaterial color={layout.shell.trim} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

function Walls({ layout, paint, finish }: { layout: HouseLayout; paint?: HousePaint; finish?: HouseFinish }) {
  const sides = useMemo(() => {
    const out = new Map<string, { normal: [number, number] | null; edges: Edge[] }>();
    for (const e of layout.edges) {
      const normal = outwardNormal(e);
      const key = normal ? normal.join(',') : 'inner';
      if (!out.has(key)) out.set(key, { normal, edges: [] });
      out.get(key)!.edges.push(e);
    }
    return [...out.entries()];
  }, [layout]);
  const center = { x: layout.width / 2, z: layout.depth / 2 };
  return (
    <group>
      {sides.map(([key, side]) => (
        <WallSide key={key} edges={side.edges} normal={side.normal} center={center} layout={layout} paint={paint} finish={finish} />
      ))}
    </group>
  );
}

// The plot sits on a floating island with rounded corners, sized to the house type.
// An owner with cars gets a parking apron on the front of the island showing their latest purchases.
export const PARKING_MAX = 3;
export const PARKING_DEPTH = 4.4;
const PARKING_GAP = 2.3;
export const parkedCars = (ownedCars: string[]) => ownedCars.slice(-PARKING_MAX);

const islandOf = (layout: HouseLayout, parked = 0) => ({
  x0: -1.4, z0: -1.4, x1: layout.gridW + 1.4, z1: layout.gridH + 1.8 + (parked ? PARKING_DEPTH : 0), r: 2.2, depth: 0.9,
});

function Island({ layout, parked }: { layout: HouseLayout; parked: number }) {
  const ISLAND = islandOf(layout, parked);
  const { gridW, gridH } = layout;
  const geo = useMemo(() => {
    const { x0, z0, x1, z1, r } = islandOf(layout, parked);
    // Shape is drawn in (x, -z) so that after rotating flat it lines up with world x/z.
    const s = new Shape();
    s.moveTo(x0 + r, -z0);
    s.lineTo(x1 - r, -z0);
    s.quadraticCurveTo(x1, -z0, x1, -z0 - r);
    s.lineTo(x1, -z1 + r);
    s.quadraticCurveTo(x1, -z1, x1 - r, -z1);
    s.lineTo(x0 + r, -z1);
    s.quadraticCurveTo(x0, -z1, x0, -z1 + r);
    s.lineTo(x0, -z0 - r);
    s.quadraticCurveTo(x0, -z0, x0 + r, -z0);
    return new ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 10 });
  }, [layout, parked]);
  return (
    <group>
      <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -ISLAND.depth - 0.12, 0]} receiveShadow>
        <meshStandardMaterial attach="material-0" color="#9fbf5a" />
        <meshStandardMaterial attach="material-1" color="#b06a3b" flatShading />
      </mesh>
      {/* Laterite path from the gate to the edge */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[layout.gate.x + 0.5, 0.004, (gridH + gridH + 1.8) / 2]} receiveShadow>
        <planeGeometry args={[1.2, gridH + 1.8 - gridH]} />
        <meshStandardMaterial color="#c98b5e" />
      </mesh>
      {parked > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gridW / 2, 0.006, gridH + 1.8 + PARKING_DEPTH / 2]} receiveShadow>
          <planeGeometry args={[Math.max(parked, 2) * PARKING_GAP + 1, PARKING_DEPTH - 0.4]} />
          <meshStandardMaterial color="#6b7280" />
        </mesh>
      )}
      {[[-0.6, gridH + 0.9, 0.45], [gridW + 0.5, gridH + 0.8, 0.5], [gridW + 0.6, 4, 0.6]].map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]}>
          <Tree s={s} />
        </group>
      ))}
    </group>
  );
}

/** The cell edge closest to a point on the floor (local grid units). */
function nearestEdge(p: { x: number; z: number }): WallEdge {
  const cx = Math.floor(p.x), cz = Math.floor(p.z);
  const fx = p.x - cx, fz = p.z - cz;
  const options: [number, WallEdge][] = [
    [fx, { dir: 'v', x: cx, z: cz }],
    [1 - fx, { dir: 'v', x: cx + 1, z: cz }],
    [fz, { dir: 'h', x: cx, z: cz }],
    [1 - fz, { dir: 'h', x: cx, z: cz + 1 }],
  ];
  return options.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
}

const edgePos = (e: WallEdge, y: number): [number, number, number] => (e.dir === 'h' ? [e.x + 0.5, y, e.z] : [e.x, y, e.z + 0.5]);

/** Wall tool overlay: dotted slots where a wall can go, and the picked / hovered edge. */
function WallGuides({ layout, items }: { layout: HouseLayout; items: PlacedItem[] }) {
  const on = useGame((s) => s.mode === 'buy' && s.wallMode);
  const sel = useGame((s) => s.wallSel);
  const hover = useGame((s) => s.wallHover);
  const slots = useMemo(() => {
    const out: WallEdge[] = [];
    for (let x = 0; x < layout.width; x++) for (let z = 1; z < layout.depth; z++) out.push({ dir: 'h', x, z });
    for (let x = 1; x < layout.width; x++) for (let z = 0; z < layout.depth; z++) out.push({ dir: 'v', x, z });
    return out;
  }, [layout]);
  if (!on) return null;
  const mark = (e: WallEdge, picked: boolean) => {
    const exists = layout.edgeSet.has(edgeKey(e));
    const blocked = !exists && !!wallBuildError(layout, e, items, avatarCell());
    const color = exists ? '#ef4444' : blocked ? '#f97316' : '#22c55e';
    const h = exists ? TALL + 0.06 : SHORT;
    const horiz = e.dir === 'h';
    return (
      <mesh position={edgePos(e, h / 2)} renderOrder={2}>
        <boxGeometry args={horiz ? [1.02, h, WALL_T + 0.08] : [WALL_T + 0.08, h, 1.02]} />
        <meshBasicMaterial color={color} transparent opacity={picked ? 0.6 : 0.35} depthWrite={false} />
      </mesh>
    );
  };
  return (
    <group>
      {slots.map((e) => {
        const exists = layout.edgeSet.has(edgeKey(e));
        const horiz = e.dir === 'h';
        return (
          <mesh key={edgeKey(e)} position={edgePos(e, exists ? SHORT + 0.07 : 0.05)} renderOrder={1}>
            <boxGeometry args={exists ? (horiz ? [0.9, 0.04, WALL_T + 0.06] : [WALL_T + 0.06, 0.04, 0.9]) : horiz ? [0.55, 0.03, 0.1] : [0.1, 0.03, 0.55]} />
            <meshBasicMaterial color={exists ? '#f59e0b' : '#0d9488'} transparent opacity={exists ? 0.95 : 0.8} depthWrite={false} />
          </mesh>
        );
      })}
      {hover && (!sel || edgeKey(hover) !== edgeKey(sel)) && mark(hover, false)}
      {sel && mark(sel, true)}
    </group>
  );
}

/** Invisible plane over the plot that turns clicks into grid cells. */
function ClickPlane({ readOnly = false, items = [], origin, design, layout }: { readOnly?: boolean; items?: PlacedItem[]; origin?: string; design?: string | null; layout: HouseLayout }) {
  const toLocal = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const transform = homeTransform(origin ?? useGame.getState().origin, design);
    return { x: (e.point.x - transform.x) / transform.scale, z: (e.point.z - transform.z) / transform.scale };
  };
  const toCell = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = toLocal(e);
    return {
      x: Math.max(0, Math.min(layout.gridW - 1, Math.floor(p.x))),
      z: Math.max(0, Math.min(layout.gridH - 1, Math.floor(p.z))),
    };
  };
  const wallTool = () => {
    const s = useGame.getState();
    return !readOnly && s.mode === 'buy' && s.wallMode;
  };
  return (
    <mesh
      visible={false}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[layout.gridW / 2, 0.02, layout.gridH / 2]}
      onPointerMove={(e) => {
        if (wallTool()) {
          const edge = nearestEdge(toLocal(e));
          useGame.getState().setWallHover(isEditableEdge(layout, edge) ? edge : null);
        }
      }}
      onPointerOut={() => {
        if (wallTool()) useGame.getState().setWallHover(null);
      }}
      onClick={(e) => {
        if (e.delta > 8) return;
        const s = useGame.getState();
        if (!readOnly && s.mode === 'buy' && finishToolOn()) {
          finishTap(toLocal(e), layout);
          return;
        }
        if (wallTool()) {
          s.tapWall(nearestEdge(toLocal(e)));
          return;
        }
        const c = toCell(e);
        if (readOnly) {
          const path = pathToCell(avatarCell(), c, items, layout);
          if (path) {
            avatar.path = path;
            avatar.onArrive = null;
          }
          return;
        }
        if (s.placing) {
          // Placing is the editor's (three/DecorEdit.tsx DecorRig): it aims at walls and table tops too, which this
          // floor plane can't see past.
        } else if (s.selectedId) {
          s.select(null);
        } else if (s.mode === 'live') {
          s.walkTo(c);
        }
      }}
    >
      <planeGeometry args={[layout.gridW, layout.gridH]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function World({ readOnly = false, items = [], origin, design, walls, paint, finish: visitFinish, visitCars }: { readOnly?: boolean; items?: PlacedItem[]; origin?: string; design?: string | null; walls?: string[]; paint?: HousePaint; finish?: HouseFinish; visitCars?: string[] }) {
  const ownedCars = useGame((s) => readOnly ? null : s.ownedCars);
  const parked = parkedCars(visitCars ?? ownedCars ?? []);
  const homeItems = useGame((s) => s.items);
  // The cars stand in a bay inside the compound (game/grid.ts), so the layout carries it: walkable, under a carport.
  const layout = houseLayout(withPark(design, parked.length), walls);
  // The carport's style and colour: your own house's outside, or the one you are visiting.
  const ownExt = useGame((s) => (readOnly ? undefined : s.properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId))?.exterior));
  const visitExt = useVisit((v) => (readOnly ? v.current?.save.exterior ?? undefined : undefined));
  const ext = exteriorOf(designOfKey(design), readOnly ? visitExt : ownExt);
  // Your own house shows the finish you are trying out in the Finishes tab over what you have bought.
  const ownFinish = useGame((s) => (readOnly ? undefined : s.houseFinish[houseKeyOf(s)]));
  const draft = useFinishUi((s) => (readOnly ? null : s.draft));
  const finish = useMemo(() => (readOnly ? visitFinish : draft ? applyFinish(ownFinish, draft, layout) : ownFinish), [readOnly, visitFinish, draft, ownFinish, layout]);
  const innerColour = paintHex(paint?.inner) ?? DEFAULT_INNER_WALL;
  return (
    <group>
      <Island layout={layout} parked={0} />
      <YardPuddles layout={layout} />
      {/* StaticBatch reads its children once, so remount floors and walls when the layout changes. */}
      <Floors key={design ?? 'starter'} layout={layout} />
      <Walls key={`${design ?? 'starter'}|${(walls ?? []).slice().sort().join(',')}|${paint?.outer ?? ''}|${paint?.inner ?? ''}`} layout={layout} paint={paint} finish={finish} />
      <HouseInterior layout={layout} finish={finish} innerColour={innerColour} />
      <HouseLights items={readOnly ? items : homeItems} layout={layout} finish={finish} />
      {!readOnly && <FinishGuides layout={layout} />}
      {!readOnly && <WallGuides layout={layout} items={homeItems} />}
      <EntryPorch layout={layout} />
      <HouseDoors layout={layout} trim={layout.shell.trim} />
      <HomeCarport layout={layout} ext={ext} />
      {parked.map((id, i) => {
        const spot = layout.cars[i];
        return spot ? (
          <CarModel key={id} carId={id} position={[spot.x + 1, 0, spot.z + 2]} rotation={[0, 0, 0]} onTap={readOnly ? undefined : () => useParkedCar.setState({ carId: id })} />
        ) : null;
      })}
      <ClickPlane readOnly={readOnly} items={items} origin={origin} design={design} layout={layout} />
    </group>
  );
}
