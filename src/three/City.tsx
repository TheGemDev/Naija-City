// The town map: seen from above. Tap a building to travel there and go in.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial, Object3D, Shape, ShapeGeometry, type Group, type InstancedMesh, type Mesh } from 'three';
import {
  BRIDGE_RAMP, BRIDGE_Y, cityMap, placeYaw, mapGroundY, potholeCity, potholeOf, type CityMap, type Landmark, type Place, type Pothole,
} from '../game/city';
import { hourOf, nairaShort, useGame } from '../game/store';
import { PRODUCES } from '../game/trade';
import { crazeOf, populationOf } from '../game/npcs';
import { STAGES } from '../game/property';
import { photoHour } from '../game/photo';
import { LIGHTS_ON, sceneHour } from '../game/theme';
import { regionLandmarks, regionOf, regionPlaces } from '../game/regions';
import { CAR_BY_ID } from '../game/cars';
import { avatar } from '../game/avatar';
import { B, Bike, Keke } from './models';
import { Helicopter } from './aircraft';
import { heli } from '../game/heli';
import { mapTrees, setTreeDust } from './trees';
import { Bus, Car, CityTree, HouseModel, LandmarkModel, lampMat, PlaceModel, windowMat, windowsLit } from './cityModels';
import { useLowPerf } from '../game/quality';
import { GroundShade, LampPools, poolMat } from './CityFx';
import { seasonDust, sky } from '../game/weather';
import { gridOn } from '../game/live';
import { Slab } from './Slab';
import { brokenAsset, useRoads } from '../net/roads';
import { lampCity, lampSites, streetLamps, type StreetLamp } from '../game/roads';
import { useSession } from '../net/session';
import { StaticBatch } from './StaticBatch';
import { IslandBase } from './IslandBase';
import { DriveLayer } from './Drive';
import { CityBillboards, SeaAds } from './Billboard';
import { SEA_MARGIN, seaBoard, seaWater } from '../game/boards';
import { openAdsSheet } from '../net/ads';
import { cityRunBy, isSuspended, useCivic } from '../net/civic';
import { CITY_HEAD, OFFICE_ICON, type CivicCity, type PoliticalOffice } from '../game/civic';
import { Emoji } from '../ui/Icons';
import { WeatherChip } from '../ui/WeatherChip';
import { copyLink, stateLink } from '../net/deeplink';
import { offHover, onHover } from './HoverOutline';
import { EstateSignLabels, EstateSigns } from './EstateSigns';

const ROAD_Y = 0.012;

/** Flat strip following a path, `half` wide on each side. */
function ribbon(path: [number, number][], half: number, y: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  path.forEach(([x, z], i) => {
    const [ax, az] = path[Math.max(0, i - 1)];
    const [bx, bz] = path[Math.min(path.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    pos.push(x + nx * half, y, z + nz * half, x - nx * half, y, z - nz * half);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function River({ map }: { map: CityMap }) {
  const water = useMemo(() => ribbon(map.riverDraw, map.riverHalf, 0.02), [map]);
  const bank = useMemo(() => ribbon(map.riverDraw, map.riverHalf + 0.35, 0.014), [map]);
  // River Kaduna is muddy brown; the Lagos Lagoon is salt water between sandy banks.
  const lagoon = map.id === 'lagos';
  return (
    <group>
      <mesh geometry={bank} receiveShadow>
        <meshStandardMaterial color={lagoon ? '#dcc88f' : '#b9895b'} side={2} />
      </mesh>
      <mesh geometry={water}>
        <meshStandardMaterial color={lagoon ? '#3f8fae' : '#746b50'} roughness={lagoon ? 0.4 : 0.82} metalness={0.02} side={2} />
      </mesh>
      <RiverFlow map={map} />
      <RiverNames map={map} />
    </group>
  );
}

/** Lakes: still blue water with a sandy shore, and the name painted on it. */
function Lakes({ map }: { map: CityMap }) {
  return (
    <group>
      {map.lakes.map((l) => (
        <group key={l.name} position={[l.x, 0, l.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} scale={[l.rx + 0.4, l.rz + 0.4, 1]} receiveShadow>
            <circleGeometry args={[1, 40]} />
            <meshStandardMaterial color="#d8c08a" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[l.rx, l.rz, 1]}>
            <circleGeometry args={[1, 40]} />
            <meshStandardMaterial color="#4a9bb5" roughness={0.35} metalness={0.05} />
          </mesh>
          {/* Lighter shallows in the middle, so it reads as water and not a blue floor. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-l.rx * 0.12, 0.024, -l.rz * 0.1]} scale={[l.rx * 0.6, l.rz * 0.55, 1]}>
            <circleGeometry args={[1, 32]} />
            <meshBasicMaterial color="#8fd0e3" transparent opacity={0.28} depthWrite={false} />
          </mesh>
          <Html transform position={[0, 0.03, 0.4]} rotation={[-Math.PI / 2, 0, 0]} scale={0.18} zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
            <div className="river-name">{l.name}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function RiverFlow({ map }: { map: CityMap }) {
  const RIVER_DRAW = map.riverDraw;
  const refs = useRef<(Mesh | null)[]>([]);
  const { geometry, path, length } = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.32, 0);
    shape.quadraticCurveTo(-0.32, -0.018, -0.27, -0.022);
    shape.lineTo(0.24, -0.013);
    shape.quadraticCurveTo(0.34, 0, 0.24, 0.013);
    shape.lineTo(-0.27, 0.022);
    shape.quadraticCurveTo(-0.32, 0.018, -0.32, 0);

    let distance = 0;
    const path = RIVER_DRAW.map((point, i) => {
      if (i > 0) distance += Math.hypot(point[0] - RIVER_DRAW[i - 1][0], point[1] - RIVER_DRAW[i - 1][1]);
      return { x: point[0], z: point[1], distance };
    });
    return { geometry: new ShapeGeometry(shape), path, length: distance };
  }, [RIVER_DRAW]);

  useFrame(({ clock }) => {
    const count = refs.current.length;
    refs.current.forEach((streak, i) => {
      if (!streak) return;
      let distance = (clock.elapsedTime * 0.48 + (i * length) / count) % length;
      let segment = 1;
      while (segment < path.length - 1 && path[segment].distance < distance) segment++;

      const from = path[segment - 1];
      const to = path[segment];
      const span = to.distance - from.distance || 1;
      const t = (distance - from.distance) / span;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const tangentLength = Math.hypot(dx, dz) || 1;
      const side = Math.sin(clock.elapsedTime * 0.7 + i * 2.4) * 0.22;
      streak.position.set(
        from.x + dx * t - (dz / tangentLength) * side,
        0.035,
        from.z + dz * t + (dx / tangentLength) * side,
      );
      streak.rotation.y = Math.atan2(-dz, dx);
    });
  });

  return (
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => { refs.current[i] = mesh; }}
          geometry={geometry}
          rotation-x={-Math.PI / 2}
          scale={0.8 + (i % 3) * 0.2}
        >
          <meshBasicMaterial color="#c4b28a" transparent opacity={0.22} depthWrite={false} side={2} />
        </mesh>
      ))}
    </>
  );
}

/** "River Kaduna" painted on the water, following the bend, between the bridges. */
function RiverNames({ map }: { map: CityMap }) {
  const RIVER_DRAW = map.riverDraw;
  const spots = useMemo(
    () =>
      [18, 39].map((x) => {
        // Nearest point on the drawn river, and the river's direction there.
        let i = 0;
        RIVER_DRAW.forEach(([px], k) => {
          if (Math.abs(px - x) < Math.abs(RIVER_DRAW[i][0] - x)) i = k;
        });
        const [ax, az] = RIVER_DRAW[Math.max(0, i - 2)];
        const [bx, bz] = RIVER_DRAW[Math.min(RIVER_DRAW.length - 1, i + 2)];
        return { x: RIVER_DRAW[i][0], z: RIVER_DRAW[i][1], angle: Math.atan2(bz - az, bx - ax) };
      }),
    [RIVER_DRAW],
  );
  return (
    <>
      {spots.map((p, i) => (
        <Html key={i} transform position={[p.x, 0.03, p.z]} rotation={[-Math.PI / 2, 0, -p.angle]} scale={0.25} zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
          <div className="river-name">{map.riverName}</div>
        </Html>
      ))}
    </>
  );
}

/** Tarmac, darkened and given a sheen by rain (MapEffects). */
const ROAD = new Color('#555b63');
const ROAD_WET = new Color('#363b42');
const roadMat = new MeshStandardMaterial({ color: ROAD });

/** Every road tile, plus dashed centre lines on the main roads that stop at junctions. */
function Roads({ map }: { map: CityMap }) {
  const { tiles, dashes } = useMemo(() => {
    const { roads: ROADS, isRoad: cellIsRoad, isBridge: cellIsBridge } = map;
    const tiles: { x: number; z: number; bridge: boolean }[] = [];
    for (let x = 0; x < map.w; x++) for (let z = 0; z < map.h; z++) if (cellIsRoad(x, z)) tiles.push({ x, z, bridge: cellIsBridge(x, z) });

    const dashes: { x: number; z: number; horiz: boolean; y: number }[] = [];
    const isJunction = (r: (typeof ROADS)[number], x: number, z: number) =>
      ROADS.some((o) => o !== r && x >= o.x - 1 && x < o.x + o.w + 1 && z >= o.z - 1 && z < o.z + o.d + 1);
    for (const r of ROADS) {
      if (!r.main) continue;
      const horiz = r.w > r.d;
      const len = horiz ? r.w : r.d;
      for (let i = 0; i < len; i++) {
        const x = horiz ? r.x + i : r.x;
        const z = horiz ? r.z : r.z + i;
        const x2 = horiz ? x : x + 1;
        const z2 = horiz ? z + 1 : z;
        if (!cellIsRoad(x, z) || !cellIsRoad(x2, z2) || isJunction(r, x, z)) continue;
        const bridge = cellIsBridge(x, z);
        if (!bridge && map.groundY(x + 0.5, z + 0.5) > 0) continue; // under a ramp
        dashes.push({ x: horiz ? x + 0.5 : x + 1, z: horiz ? z + 1 : z + 0.5, horiz, y: (bridge ? BRIDGE_Y : ROAD_Y) + 0.006 });
      }
    }
    return { tiles, dashes };
  }, [map]);

  const tileRef = useRef<InstancedMesh>(null!);
  const dashRef = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    const o = new Object3D();
    tiles.forEach((t, i) => {
      o.position.set(t.x + 0.5, t.bridge ? BRIDGE_Y : ROAD_Y, t.z + 0.5);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      tileRef.current.setMatrixAt(i, o.matrix);
    });
    tileRef.current.instanceMatrix.needsUpdate = true;
    dashes.forEach((d, i) => {
      o.position.set(d.x, d.y, d.z);
      o.rotation.set(-Math.PI / 2, 0, d.horiz ? Math.PI / 2 : 0);
      o.updateMatrix();
      dashRef.current.setMatrixAt(i, o.matrix);
    });
    dashRef.current.instanceMatrix.needsUpdate = true;
  }, [tiles, dashes]);

  return (
    <group>
      <instancedMesh ref={tileRef} args={[undefined, roadMat, tiles.length]} receiveShadow>
        <planeGeometry args={[1.001, 1.001]} />
      </instancedMesh>
      <instancedMesh ref={dashRef} args={[undefined, undefined, dashes.length]}>
        <planeGeometry args={[0.07, 0.45]} />
        <meshBasicMaterial color="#f8fafc" />
      </instancedMesh>
    </group>
  );
}

const deadLampMat = new MeshStandardMaterial({ color: '#3f3f46' });

/** Road potholes: authentic broken asphalt craters revealing reddish laterite earth and murky puddles. */
/** Only this city's potholes still open on the server; guests see them all. */
function Potholes({ city }: { city: string }) {
  const open = useRoads((s) => s.open);
  const signedIn = useSession((s) => !!s.user);
  const list = useMemo(() => open.filter((i) => potholeCity(i) === city).map((i) => potholeOf(i)!), [open, city]);
  useEffect(() => {
    if (!signedIn) {
      useRoads.getState().reset();
      return;
    }
    void useRoads.getState().refresh();
    const id = window.setInterval(() => void useRoads.getState().refresh(), 2 * 60_000);
    return () => window.clearInterval(id);
  }, [signedIn]);
  // Instance counts are fixed when a mesh is made, so remake them when the set changes.
  return <PotholeMeshes key={`${city}|${open.join(',')}`} list={list} />;
}

function PotholeMeshes({ list }: { list: Pothole[] }) {
  const rimRef = useRef<InstancedMesh>(null!);
  const pitRef = useRef<InstancedMesh>(null!);
  const puddleRef = useRef<InstancedMesh>(null!);
  const rubbleRef = useRef<InstancedMesh>(null!);

  const puddles = useMemo(() => list.filter((p) => p.severity >= 2), [list]);

  const rubble = useMemo(() => {
    const chunks: { x: number; y: number; z: number; s: number; yaw: number }[] = [];
    list.forEach((p, idx) => {
      const count = p.severity === 1 ? 1 : p.severity === 2 ? 2 : 3;
      for (let k = 0; k < count; k++) {
        const ang = (idx * 1.7 + k * 2.1) % (Math.PI * 2);
        const dist = 0.52 + ((idx + k) % 3) * 0.1;
        const rx = p.x + Math.cos(ang) * (p.w * 0.5 * dist);
        const rz = p.z + Math.sin(ang) * (p.d * 0.5 * dist);
        chunks.push({
          x: rx,
          y: ROAD_Y + 0.008,
          z: rz,
          s: 0.04 + ((idx + k) % 4) * 0.015,
          yaw: ang,
        });
      }
    });
    return chunks;
  }, [list]);

  useLayoutEffect(() => {
    const o = new Object3D();
    // 1. Weathered broken asphalt rim (darker than main road)
    list.forEach((p, i) => {
      o.position.set(p.x, ROAD_Y + 0.002, p.z);
      o.rotation.set(-Math.PI / 2, 0, p.yaw);
      o.scale.set(p.w, p.d, 1);
      o.updateMatrix();
      rimRef.current.setMatrixAt(i, o.matrix);
    });
    rimRef.current.instanceMatrix.needsUpdate = true;

    // 2. Inner laterite dirt crater (Kaduna reddish-brown earth sub-base)
    list.forEach((p, i) => {
      o.position.set(p.x, ROAD_Y + 0.0035, p.z);
      o.rotation.set(-Math.PI / 2, 0, p.yaw + 0.25);
      o.scale.set(p.w * 0.76, p.d * 0.74, 1);
      o.updateMatrix();
      pitRef.current.setMatrixAt(i, o.matrix);
    });
    pitRef.current.instanceMatrix.needsUpdate = true;

    // 3. Murky rain puddle center for deeper holes
    puddles.forEach((p, i) => {
      o.position.set(p.x, ROAD_Y + 0.0045, p.z);
      o.rotation.set(-Math.PI / 2, 0, p.yaw + 0.4);
      o.scale.set(p.w * 0.48, p.d * 0.46, 1);
      o.updateMatrix();
      puddleRef.current.setMatrixAt(i, o.matrix);
    });
    puddleRef.current.instanceMatrix.needsUpdate = true;

    // 4. Chipped asphalt rubble chunks
    rubble.forEach((r, i) => {
      o.position.set(r.x, r.y, r.z);
      o.rotation.set(0.1, r.yaw, 0.15);
      o.scale.set(r.s, r.s * 0.6, r.s);
      o.updateMatrix();
      rubbleRef.current.setMatrixAt(i, o.matrix);
    });
    rubbleRef.current.instanceMatrix.needsUpdate = true;
  }, [list, puddles, rubble]);

  return (
    <group>
      {/* Broken asphalt rim: irregular polygon disc */}
      <instancedMesh ref={rimRef} args={[undefined, undefined, list.length]}>
        <circleGeometry args={[0.5, 8]} />
        <meshStandardMaterial color="#2c3036" roughness={0.96} />
      </instancedMesh>
      {/* Exposed Kaduna laterite red soil crater */}
      <instancedMesh ref={pitRef} args={[undefined, undefined, list.length]}>
        <circleGeometry args={[0.5, 7]} />
        <meshStandardMaterial color="#7a3e1c" roughness={0.92} />
      </instancedMesh>
      {/* Murky puddle center */}
      <instancedMesh ref={puddleRef} args={[undefined, undefined, puddles.length]}>
        <circleGeometry args={[0.5, 6]} />
        <meshStandardMaterial color="#1c1d20" roughness={0.25} metalness={0.1} />
      </instancedMesh>
      {/* Broken asphalt chunks */}
      <instancedMesh ref={rubbleRef} args={[undefined, undefined, rubble.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3d424a" roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  );
}

function Bridges({ map }: { map: CityMap }) {
  return (
    <group>
      {map.bridges.map((b, i) => {
        // Work in the bridge's own frame: `along` the road, `across` it.
        const along = b.horiz ? b.w : b.d;
        const across = b.horiz ? b.d : b.w;
        const slope = Math.atan2(BRIDGE_Y, BRIDGE_RAMP);
        const rampLen = Math.hypot(BRIDGE_Y, BRIDGE_RAMP);
        const piers = Array.from({ length: Math.max(1, Math.floor(along / 2)) }, (_, k) => ((k + 0.5) / Math.max(1, Math.floor(along / 2)) - 0.5) * along);
        return (
          <group key={i} position={[b.x + b.w / 2, 0, b.z + b.d / 2]} rotation={[0, b.horiz ? Math.PI / 2 : 0, 0]}>
            {/* Deck slab sits just under the road tiles so they never fight over the same depth. */}
            <B p={[0, BRIDGE_Y / 2, 0]} s={[across + 0.3, BRIDGE_Y - 0.01, along]} c="#a8a29e" />
            {piers.map((z) => (
              <B key={z} p={[0, 0.02, z]} s={[across - 0.2, 0.08, 0.3]} c="#78716c" />
            ))}
            {/* Ramps down to the road at each end. */}
            {[-1, 1].map((s) => (
              <group key={s} position={[0, BRIDGE_Y / 2 + 0.006, s * (along / 2 + BRIDGE_RAMP / 2)]} rotation={[s * slope, 0, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                  <planeGeometry args={[across, rampLen]} />
                  <meshStandardMaterial color="#555b63" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
                </mesh>
              </group>
            ))}
            {/* Rails on both sides. */}
            {[-1, 1].map((s) => (
              <B key={`r${s}`} p={[s * (across / 2 + 0.1), BRIDGE_Y + 0.14, 0]} s={[0.1, 0.28, along + 0.2]} c="#e5e7eb" />
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** The poles. The heads are LampHeads, outside the static batch, because which ones are out changes. */
function StreetLamps({ map }: { map: CityMap }) {
  return (
    <group>
      {streetLamps(map.id).map(({ x, z }, i) => (
        <B key={i} p={[x, 0.9, z]} s={[0.07, 1.8, 0.07]} c="#475569" />
      ))}
    </group>
  );
}

/** Street light heads: the working ones glow at night (MapEffects), the ones that are out stay dark until the government fixes them. */
function LampHeads({ city }: { city: string }) {
  const out = useRoads((s) => s.lamps);
  const sites = useMemo(() => lampSites(city), [city]);
  const lamps = streetLamps(city);
  const dead = useMemo(() => new Set(out.filter((site) => lampCity(site) === city).map((site) => sites.indexOf(site))), [out, sites, city]);
  // Instance counts are fixed when a mesh is made, so remake them when the set changes.
  return (
    <group key={[...dead].join(',')}>
      <LampHeadMeshes list={lamps.filter((_, i) => !dead.has(i))} lit />
      <LampHeadMeshes list={lamps.filter((_, i) => dead.has(i))} />
      <LampPools list={lamps.filter((_, i) => !dead.has(i))} />
    </group>
  );
}

function LampHeadMeshes({ list, lit }: { list: StreetLamp[]; lit?: boolean }) {
  const ref = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    // No lamps of this kind (a city with none broken): there is no mesh to fill.
    if (!list.length) return;
    const o = new Object3D();
    list.forEach((lamp, i) => {
      o.position.set(lamp.x, 1.82, lamp.z);
      // A dead lamp hangs a little crooked.
      o.rotation.set(0, 0, lit ? 0 : 0.35);
      o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [list, lit]);
  if (!list.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]} material={lit ? lampMat : deadLampMat}>
      <boxGeometry args={[0.28, 0.12, 0.28]} />
    </instancedMesh>
  );
}

interface Vehicle { kind: 'keke' | 'car' | 'bus' | 'bike'; colour: string; axis: 'x' | 'z'; line: number; from: number; to: number; speed: number; offset: number }

// line = the road's centre line. Nigerian traffic drives on the right.
const VEHICLES: Vehicle[] = [
  { kind: 'keke', colour: '', axis: 'z', line: 29, from: 0.5, to: 81.5, speed: 2.2, offset: 0 },
  { kind: 'car', colour: '#dc2626', axis: 'z', line: 29, from: 0.5, to: 81.5, speed: 3, offset: 40 },
  { kind: 'bus', colour: '', axis: 'z', line: 29, from: 0.5, to: 81.5, speed: 1.8, offset: 100 },
  { kind: 'car', colour: '#f8fafc', axis: 'z', line: 29, from: 0.5, to: 81.5, speed: 3.3, offset: 130 },
  { kind: 'car', colour: '#2563eb', axis: 'x', line: 17, from: 3.5, to: 56.5, speed: 3.2, offset: 10 },
  { kind: 'keke', colour: '', axis: 'x', line: 17, from: 3.5, to: 56.5, speed: 2, offset: 60 },
  { kind: 'car', colour: '#111827', axis: 'x', line: 28, from: 2.5, to: 57.5, speed: 2.9, offset: 25 },
  { kind: 'keke', colour: '', axis: 'x', line: 53, from: 6.5, to: 55.5, speed: 2.1, offset: 80 },
  { kind: 'car', colour: '#16a34a', axis: 'x', line: 53, from: 6.5, to: 55.5, speed: 3.4, offset: 5 },
  { kind: 'bus', colour: '', axis: 'z', line: 9, from: 8.5, to: 69.5, speed: 2.2, offset: 30 },
  { kind: 'car', colour: '#f59e0b', axis: 'z', line: 49, from: 6.5, to: 63.5, speed: 3, offset: 50 },
  { kind: 'keke', colour: '', axis: 'x', line: 65, from: 10.5, to: 51.5, speed: 2.1, offset: 15 },
  { kind: 'bike', colour: '#15803d', axis: 'z', line: 29, from: 0.5, to: 81.5, speed: 3.8, offset: 18 },
  { kind: 'bike', colour: '#2563eb', axis: 'x', line: 17, from: 3.5, to: 56.5, speed: 4.1, offset: 37 },
  { kind: 'bike', colour: '#dc2626', axis: 'x', line: 53, from: 6.5, to: 55.5, speed: 3.6, offset: 116 },
  { kind: 'bike', colour: '#f97316', axis: 'z', line: 9, from: 8.5, to: 69.5, speed: 3.9, offset: 73 },
];

const ABUJA_KINDS: Vehicle['kind'][] = ['car', 'bus', 'car', 'car'];
/** Green-and-white painted cabs, and the black, white and silver of the capital's convoys. */
const ABUJA_COLOURS = ['#15803d', '#111827', '#f8fafc', '#cbd5e1', '#15803d', '#1e3a8a'];
/** Lagos is danfo country: yellow buses with black stripes on every road, keke between them, and yellow cabs. */
const LAGOS_KINDS: Vehicle['kind'][] = ['bus', 'car', 'bus', 'keke', 'bus', 'bike'];
const DANFO = '#facc15';
const LAGOS_COLOURS = ['#facc15', '#111827', '#f8fafc', '#dc2626', '#facc15', '#1e3a8a'];
/** Kano runs on adaidaita sahu: tricycles on every road, and no okada among them. */
const KANO_KINDS: Vehicle['kind'][] = ['keke', 'car', 'keke', 'bus', 'keke', 'car'];
const KANO_COLOURS = ['#f8fafc', '#111827', '#a16207', '#1e3a8a', '#f8fafc', '#15803d'];
const BASE_SPEED: Record<Vehicle['kind'], number> = { car: 3, bus: 2, keke: 2.1, bike: 3.8 };

/** Most vehicles a city has on its roads at once, so the streets stay busy without jamming. */
const MAX_TRAFFIC = 10;

/** Kaduna's traffic is laid out by hand above. Any other city gets one vehicle on each main road: no keke in the capital, danfo in Lagos, keke everywhere in Kano. */
function trafficOf(map: CityMap): Vehicle[] {
  if (map.id === 'kaduna') return VEHICLES.filter((_, i) => i % 3 !== 2).slice(0, MAX_TRAFFIC);
  const lagos = map.id === 'lagos';
  const kinds = lagos ? LAGOS_KINDS : map.id === 'kano' ? KANO_KINDS : ABUJA_KINDS;
  const colours = lagos ? LAGOS_COLOURS : map.id === 'kano' ? KANO_COLOURS : ABUJA_COLOURS;
  return map.roads.filter((r) => r.main).flatMap((r, i) => {
    const horiz = r.w > r.d;
    // The stretch of the road that is on the island.
    const cells = Array.from({ length: horiz ? r.w : r.d }, (_, k) => (horiz ? r.x : r.z) + k).filter((a) => (horiz ? map.isRoad(a, r.z) : map.isRoad(r.x, a)));
    if (cells.length < 8) return [];
    return [i % 2].map((k): Vehicle => {
      const kind = kinds[(i * 2 + k) % kinds.length];
      return {
        kind, colour: kind === 'bus' ? (lagos ? DANFO : '') : colours[(i + k * 3) % colours.length], axis: horiz ? 'x' : 'z', line: (horiz ? r.z : r.x) + 1,
        from: cells[0] + 0.5, to: cells[cells.length - 1] + 0.5, speed: BASE_SPEED[kind] + ((i * 7 + k * 5) % 5) / 10, offset: i * 23 + k * 61,
      };
    });
  }).slice(0, MAX_TRAFFIC);
}

/** Sized against the people on the map (0.85 tall): a saloon reaches their shoulder, a bus stands over them. Lanes are one tile wide. */
const TRAFFIC_SCALE: Record<Vehicle['kind'], number> = { car: 1, bus: 1, keke: 0.68, bike: 0.62 };

/**
 * A stretch of road traffic drives along: one road (or several end to end) between the points where it leaves
 * the land or the map. `axis` is the way it runs, `c` its centre line, `half` how far right of that the lane
 * sits (each way of a two-tile road gets a whole tile), `a0`–`a1` its ends along the axis.
 */
interface Lane {
  axis: 'x' | 'z'; c: number; width: number; half: number; a0: number; a1: number;
  /** Where other roads cross or join, by the position along this one, and the ends. */
  stops: Stop[];
}
interface Stop {
  at: number;
  /** The roads met here and where along them this one's centre line is. Empty at an end. */
  links: { lane: number; at: number }[];
  /** The road ends here at the edge of the map: the way traffic comes in and goes out. */
  edge: boolean;
  /** The road ends here short of the edge: turn round. */
  end: boolean;
}

/**
 * One vehicle on the move. It keeps to the right-hand lane of the road it's on and only turns where another
 * road meets it: straight on, round the corner, or round and back at a dead end. In time it heads for a road
 * off the edge of the map, fades away on the last stretch, and another comes in.
 */
interface Drive {
  lane: number; dir: number;
  /** Where along its road the current piece of driving ends, and the junction it is pulling up to, if any. */
  s: number; pending: Stop | null; last: Stop | null;
  /** The piece being driven (start, bend, end) and how far along it the vehicle is. */
  p: [number, number, number, number, number, number];
  t: number; len: number;
  /** How hard it slows for this piece: 1 straight, less round a corner. */
  bend: number;
  x: number; z: number; yaw: number;
  mode: 'road' | 'fade';
  /** Pieces left before it fades away, and how many it fades over. */
  left: number; span: number;
  leaving: boolean;
  trips: number;
  limit: number;
  exit: { lane: number; at: number } | null;
  speed: number;
  roll: number;
  turn: number;
  /** 0 → 1 while it fades in where it appeared. */
  grow: number;
  /** Seconds spent held up behind another vehicle; past a few it squeezes through (negative, counting back up) rather than jam. */
  stuck: number;
}

/** The point `a` along a lane, on the right-hand side for traffic going `dir`. */
function lanePoint(l: Lane, a: number, dir: number): [number, number] {
  return l.axis === 'x' ? [a, l.c + dir * l.half] : [l.c - dir * l.half, a];
}

function setPiece(v: Drive, a: [number, number], k: [number, number] | null, b: [number, number], bend: number) {
  const [ax, az] = a, [bx, bz] = b;
  const [kx, kz] = k ?? [(ax + bx) / 2, (az + bz) / 2];
  v.p = [ax, az, kx, kz, bx, bz];
  v.len = (Math.hypot(kx - ax, kz - az) + Math.hypot(bx - kx, bz - kz) + Math.hypot(bx - ax, bz - az)) / 2 || 0.01;
  v.t = 0;
  v.bend = bend;
}

/** Every road on the map as lanes joined at their junctions. */
function laneNetwork(map: CityMap, open: (x: number, z: number) => boolean): Lane[] {
  // Roads that carry on from one another in a straight line are one lane: group them by line and width.
  const groups = new Map<string, { axis: 'x' | 'z'; c: number; width: number; cells: Set<number> }>();
  for (const r of map.roads) {
    if (r.w === r.d) continue;
    const axis = r.w > r.d ? 'x' : 'z';
    const width = axis === 'x' ? r.d : r.w;
    const from = axis === 'x' ? r.z : r.x;
    const c = from + width / 2;
    const key = `${axis}|${c}|${width}`;
    const g = groups.get(key) ?? { axis, c, width, cells: new Set<number>() };
    groups.set(key, g);
    const [a0, n] = axis === 'x' ? [r.x, r.w] : [r.z, r.d];
    for (let a = a0; a < a0 + n; a++) {
      let ok = true;
      for (let k = from; k < from + width; k++) if (!(axis === 'x' ? open(a, k) : open(k, a))) ok = false;
      if (ok) g.cells.add(a);
    }
  }
  const lanes: Lane[] = [];
  for (const g of groups.values()) {
    const cells = [...g.cells].sort((a, b) => a - b);
    // Split where the road leaves the land (water with no bridge).
    let start = 0;
    for (let i = 1; i <= cells.length; i++) {
      if (i < cells.length && cells[i] === cells[i - 1] + 1) continue;
      const a0 = cells[start], a1 = cells[i - 1] + 1;
      if (a1 - a0 >= 3) lanes.push({ axis: g.axis, c: g.c, width: g.width, half: g.width / 4, a0, a1, stops: [] });
      start = i;
    }
  }
  // Junctions: where a road along x meets one along z, each one's centre line crossing (or reaching) the other.
  const near = 0.01;
  lanes.forEach((h, hi) => {
    if (h.axis !== 'x') return;
    lanes.forEach((v, vi) => {
      if (v.axis !== 'z') return;
      if (v.c < h.a0 - v.width / 2 - near || v.c > h.a1 + v.width / 2 + near) return;
      if (h.c < v.a0 - h.width / 2 - near || h.c > v.a1 + h.width / 2 + near) return;
      // A road that stops at the side of another runs on to its centre line.
      h.a0 = Math.min(h.a0, v.c); h.a1 = Math.max(h.a1, v.c);
      v.a0 = Math.min(v.a0, h.c); v.a1 = Math.max(v.a1, h.c);
      const add = (l: Lane, at: number, other: number, otherAt: number) => {
        let s = l.stops.find((x) => Math.abs(x.at - at) < near);
        if (!s) l.stops.push((s = { at, links: [], edge: false, end: false }));
        s.links.push({ lane: other, at: otherAt });
      };
      add(h, v.c, vi, h.c);
      add(v, h.c, hi, v.c);
    });
  });
  for (const l of lanes) {
    const size = l.axis === 'x' ? map.w : map.h;
    for (const at of [l.a0, l.a1]) {
      if (l.stops.some((s) => Math.abs(s.at - at) < near)) continue;
      const edge = at <= 0 || at >= size;
      l.stops.push({ at, links: [], edge, end: !edge });
    }
    l.stops.sort((a, b) => a.at - b.at);
  }
  return lanes;
}

function Traffic({ map }: { map: CityMap }) {
  const refs = useRef<(Group | null)[]>([]);
  const vehicles = useMemo(() => trafficOf(map), [map]);

  const world = useMemo(() => {
    const inBounds = (x: number, z: number) => x >= 0 && z >= 0 && x < map.w && z < map.h;
    const open = (x: number, z: number) => inBounds(x, z) && (map.isRoad(x, z) || map.isBridge(x, z));
    const lanes = laneNetwork(map, open);
    // Ways in and out: a road that runs off the edge of the map, at least a few tiles long.
    const exits = lanes.flatMap((l, lane) => l.stops.filter((s) => s.edge && l.a1 - l.a0 >= 4).map((s) => ({ lane, at: s.at })));
    /** Room to move: how far a lane runs on past `at` going `dir`. */
    const runs = (l: Lane, at: number, dir: number) => (dir > 0 ? l.a1 - at : at - l.a0);
    const pos = (l: Lane, at: number): [number, number] => (l.axis === 'x' ? [at, l.c] : [l.c, at]);

    /** Nothing else is near the point (x, z). */
    const clear = (v: Drive, x: number, z: number, others: Drive[]) => others.every((o) => o === v || o.x === undefined || Math.hypot(o.x - x, o.z - z) > 1.6);

    /** The current piece is done: lay the next one. */
    const next = (v: Drive) => {
      const l = lanes[v.lane];
      const here = lanePoint(l, v.s, v.dir);
      const stop = v.pending;
      if (!stop) {
        // Drive on to the next junction or end of the road, pulling up at the near side of the road across.
        const ahead = l.stops.filter((s) => s !== v.last && (s.at - v.s) * v.dir > 0.001);
        const s = v.dir > 0 ? ahead[0] : ahead[ahead.length - 1];
        if (!s) { v.mode = 'fade'; v.left = v.span = 1; setPiece(v, here, null, lanePoint(l, v.s + v.dir, v.dir), 1); return; }
        // Off the edge only when it's going; anywhere else the end of the road is somewhere to turn round.
        const across = s.links.length ? Math.max(...s.links.map((k) => lanes[k.lane].width)) / 2 : s.edge && v.leaving ? 0 : Math.max(0.5, l.half * 2);
        let to = s.at - v.dir * across;
        if ((to - v.s) * v.dir < 0.001) to = v.s + v.dir * 0.001;
        const gaveUp = v.leaving && v.trips > v.limit + 40;
        setPiece(v, here, null, lanePoint(l, to, v.dir), 1);
        v.s = to;
        v.pending = s;
        if (gaveUp || (s.edge && v.leaving)) { v.mode = 'fade'; v.left = v.span = 1; }
        return;
      }
      v.pending = null;
      v.last = stop;
      v.trips++;
      if (!v.leaving && v.trips > v.limit) { v.leaving = true; v.exit = exits.length ? exits[Math.floor(Math.random() * exits.length)] : null; }

      // The ways on from here: straight over, or onto a road that meets this one, either way along it.
      type Way = { lane: number; dir: number; at: number; straight: boolean };
      const ways: Way[] = [];
      const crossing = stop.links.length ? Math.max(...stop.links.map((k) => lanes[k.lane].width)) / 2 : 0;
      if (runs(l, stop.at, v.dir) > crossing + 0.3) ways.push({ lane: v.lane, dir: v.dir, at: stop.at, straight: true });
      for (const k of stop.links) {
        for (const dir of [-1, 1]) if (runs(lanes[k.lane], k.at, dir) > l.width / 2 + 0.3) ways.push({ lane: k.lane, dir, at: k.at, straight: false });
      }
      if (!ways.length) {
        // End of the road, or nowhere to go: round and back.
        const k = pos(l, v.s + v.dir * l.half * 1.8);
        setPiece(v, here, k, lanePoint(l, v.s, -v.dir), 0.4);
        v.dir = -v.dir;
        return;
      }
      let best = ways[0];
      let bestScore = Infinity;
      for (const w of ways) {
        const wl = lanes[w.lane];
        const [px, pz] = pos(wl, w.at + w.dir * 3);
        const target = v.leaving && v.exit ? pos(lanes[v.exit.lane], v.exit.at) : null;
        const score = target
          ? Math.abs(px - target[0]) + Math.abs(pz - target[1]) + Math.random() * 2
          : Math.random() * 3 - (w.straight ? 1.6 : 0);
        if (score < bestScore) { bestScore = score; best = w; }
      }
      if (best.straight) { next(v); return; }
      // Round the corner: from this lane at the near side of the junction to the new lane at its far side,
      // bending where the two lanes cross.
      const nl = lanes[best.lane];
      const out = best.at + best.dir * (l.width / 2);
      const b = lanePoint(nl, out, best.dir);
      const [ax, az] = here;
      const k: [number, number] = l.axis === 'x' ? [b[0], az] : [ax, b[1]];
      setPiece(v, here, k, b, 0.55);
      v.lane = best.lane; v.dir = best.dir; v.s = out;
    };

    const spawn = (v: Drive, fresh: boolean, others: Drive[]) => {
      v.mode = 'road'; v.leaving = false; v.trips = 0; v.grow = fresh ? 1 : 0; v.limit = 8 + Math.floor(Math.random() * 14); v.exit = null; v.roll = 0; v.turn = 0; v.left = 0; v.span = 1; v.stuck = 0;
      v.pending = null; v.last = null;
      let placed = false;
      if (!fresh) {
        // Comes in on a road off the edge of the map, fading in on its last tile, wherever that is free.
        for (let tries = 0; tries < 12 && exits.length && !placed; tries++) {
          const e = exits[Math.floor(Math.random() * exits.length)];
          const l = lanes[e.lane];
          const dir = e.at <= l.a0 ? 1 : -1;
          const [x, z] = lanePoint(l, e.at, dir);
          if (!clear(v, x, z, others)) continue;
          v.lane = e.lane; v.dir = dir; v.s = e.at;
          v.last = l.stops.find((s) => s.at === e.at) ?? null;
          placed = true;
        }
      }
      // Otherwise somewhere along a road, out of the way of the others.
      const total = lanes.reduce((n, l) => n + l.a1 - l.a0, 0);
      for (let tries = 0; tries < 40 && total && !placed; tries++) {
        let pick = Math.random() * total;
        const lane = lanes.findIndex((l) => (pick -= l.a1 - l.a0) < 0);
        const l = lanes[lane];
        const dir = Math.random() < 0.5 ? 1 : -1;
        const s = l.a0 + 1 + Math.random() * Math.max(0, l.a1 - l.a0 - 2);
        const [x, z] = lanePoint(l, s, dir);
        if (!clear(v, x, z, others)) continue;
        v.lane = lane; v.dir = dir; v.s = s;
        placed = true;
        if (!fresh) v.grow = 0;
      }
      if (!placed) { v.lane = 0; v.dir = 1; v.s = lanes[0]?.a0 ?? 0; }
      [v.x, v.z] = lanes.length ? lanePoint(lanes[v.lane], v.s, v.dir) : [-100, -100];
      v.yaw = lanes[v.lane]?.axis === 'z' ? (v.dir > 0 ? 0 : Math.PI) : v.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (lanes.length) next(v);
    };
    return { inBounds, lanes, next, spawn };
  }, [map]);

  const drives = useMemo(() => {
    const out: Drive[] = [];
    for (const veh of vehicles) {
      const v = { speed: veh.speed, p: [0, 0, 0, 0, 0, 0], yaw: 0 } as unknown as Drive;
      world.spawn(v, true, out);
      v.speed = veh.speed;
      out.push(v);
    }
    return out;
  }, [vehicles, world]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    // The server numbers every city's potholes in one list: only this city's are on these roads.
    const openPotholes = useRoads.getState().open.filter((i) => potholeCity(i) === map.id).map((i) => potholeOf(i)!);

    vehicles.forEach((veh, i) => {
      const v = drives[i];
      const g = refs.current[i];
      if (!g || !v) return;

      // Ease off for a bend, and hang back from whatever is in front in the same lane.
      let want = veh.speed * v.bend;
      const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
      // Ones fading in or out don't hold anyone up, and nobody waits forever.
      if (v.stuck >= 0) {
        for (let j = 0; j < drives.length; j++) {
          if (j === i) continue;
          const o = drives[j];
          if (o.mode === 'fade' || o.grow < 1) continue;
          const ox = o.x - v.x, oz = o.z - v.z;
          const ahead = ox * sy + oz * cy;
          const side = ox * cy - oz * sy;
          if (ahead > 0 && ahead < 1.3 && Math.abs(side) < 0.3 && Math.cos(o.yaw - v.yaw) > 0) want *= Math.max(0, (ahead - 0.55) / 0.75);
        }
      }
      v.stuck = v.stuck < 0 ? Math.min(0, v.stuck + dt) : want < veh.speed * 0.15 ? v.stuck + dt : Math.max(0, v.stuck - dt * 2);
      if (v.stuck >= 3) v.stuck = -2;
      v.speed += (want - v.speed) * Math.min(1, dt * 3);

      v.t += (v.speed * dt) / v.len;
      while (v.t >= 1) {
        const over = (v.t - 1) * v.len;
        if (v.mode !== 'road' && --v.left <= 0) { world.spawn(v, false, drives); break; }
        world.next(v);
        v.t = over / v.len;
      }

      const [ax, az, kx, kz, bx, bz] = v.p;
      const t = v.t, u = 1 - t;
      v.x = u * u * ax + 2 * u * t * kx + t * t * bx;
      v.z = u * u * az + 2 * u * t * kz + t * t * bz;
      const tx = u * (kx - ax) + t * (bx - kx), tz = u * (kz - az) + t * (bz - kz);
      const yaw = Math.atan2(tx, tz);
      const turn = Math.atan2(Math.sin(yaw - v.yaw), Math.cos(yaw - v.yaw));
      v.yaw = yaw;
      v.turn += (turn / Math.max(dt, 0.001) - v.turn) * Math.min(1, dt * 6);

      // Suspension bump / roll when hitting a pothole; bikes lean into bends.
      const hit = openPotholes.some((p) => Math.hypot(v.x - p.x, v.z - p.z) < 0.45);
      const bumpY = hit ? Math.sin(clock.elapsedTime * 28) * 0.02 - 0.01 : 0;
      const bumpRoll = hit ? Math.sin(clock.elapsedTime * 24) * 0.06 : 0;
      const lean = Math.max(-0.4, Math.min(0.4, -v.turn * (veh.kind === 'bike' ? 0.12 : 0.02)));
      v.roll += (lean - v.roll) * Math.min(1, dt * 6);
      if (v.grow < 1) v.grow = Math.min(1, v.grow + dt);
      const fade = (v.mode === 'fade' ? Math.max(0.01, Math.min(1, (v.left - 1 + (1 - v.t)) / v.span)) : 1) * Math.max(0.01, v.grow);
      g.scale.setScalar(TRAFFIC_SCALE[veh.kind] * fade);
      const ground = world.inBounds(Math.floor(v.x), Math.floor(v.z)) ? map.groundY(v.x, v.z) : 0;
      g.position.set(v.x, ground + bumpY, v.z);
      g.rotation.order = 'YXZ';
      g.rotation.set(0, v.yaw, v.roll + bumpRoll);
    });
  });
  return (
    <group>
      {vehicles.map((v, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }} scale={TRAFFIC_SCALE[v.kind]}>
          <StaticBatch>
            {v.kind === 'keke' ? <Keke /> : v.kind === 'bus' ? (v.colour ? <Bus c={v.colour} stripe="#111827" /> : <Bus />) : v.kind === 'bike' ? <Bike colour={v.colour} rider /> : <Car c={v.colour} />}
          </StaticBatch>
        </group>
      ))}
    </group>
  );
}

/** Height of the helicopter's cabin off its skids: it pitches and banks about there. */
const HELI_PIVOT = 0.8;

/** Renders the selected ride around the avatar while their route is in progress. */
function PlayerRide() {
  const ride = useGame((s) =>
    s.view === 'city' && s.task?.actionId === 'enter' && s.task.phase === 'walking' && (s.task.travelMode ?? 'walk') !== 'walk'
      ? s.task.travelMode ?? 'walk'
      : null,
  );
  const carId = useGame((s) => s.task?.carId);
  // The state's fleet (game/civic.ts STATE_FLEET): a green-and-white helicopter, a black convoy car.
  const official = useGame((s) => !!s.task?.official);
  const ref = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const car = carId ? CAR_BY_ID[carId] : null;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const groundY = mapGroundY(avatar.x, avatar.z);
    ref.current.position.set(avatar.x, groundY, avatar.z);
    ref.current.rotation.set(0, avatar.yaw, 0);
    if (ride !== 'helicopter' || !tilt.current) return;
    // Flown in game/heli.ts (Avatar.tsx steps it); until its first frame it sits on the ground where you stand.
    const h = heli.trip === avatar.path ? heli : null;
    const alt = h ? h.alt : 0;
    // A slow, slight drift up and down in the air, none on the ground.
    const hover = Math.sin(clock.elapsedTime * 1.6) * 0.05 * Math.min(1, alt / 1.5);
    ref.current.position.y = (h ? h.base : groundY) + alt + hover;
    ref.current.rotation.y = h ? h.yaw : avatar.yaw;
    // Pitch and bank about the cabin, not the skids.
    tilt.current.rotation.set(h ? h.pitch : 0, 0, h ? -h.bank : 0);
    if (shadow.current) {
      shadow.current.position.set(avatar.x, groundY + 0.04, avatar.z);
      const lift = Math.min(1, alt / 7.5);
      const spread = 1 + lift * 0.9;
      shadow.current.scale.set(spread, spread, spread);
      (shadow.current.material as MeshStandardMaterial).opacity = 0.34 - lift * 0.18;
    }
  });

  if (!ride) return null;
  return (
    <>
      <group ref={ref} scale={ride === 'helicopter' ? 0.95 : ride === 'okada' ? 0.82 : ride === 'keke' ? 0.72 : 1}>
        {ride === 'helicopter' ? (
          <group ref={tilt} position-y={HELI_PIVOT}>
            <group position-y={-HELI_PIVOT}>
              <Helicopter official={official} power={heli} />
            </group>
          </group>
        ) : (
          <StaticBatch key={`${ride}|${carId}|${official}`}>
            {ride === 'keke' ? <Keke /> : ride === 'okada' ? <Bike colour="#facc15" /> : <Car c={ride === 'car' ? car?.color ?? '#2563eb' : official ? '#0a0a0a' : '#facc15'} />}
          </StaticBatch>
        )}
      </group>
      {ride === 'helicopter' && (
        <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.1, 20]} />
          <meshStandardMaterial color="#000000" transparent opacity={0.34} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

function PlaceLabel({ place }: { place: Place }) {
  const selected = useGame((s) => s.placeId === place.id);
  const target = useGame((s) => s.task?.actionId === 'enter' && s.task.placeId === place.id);
  const posY = place.ground ? 1.2 : 3.2;
  // A building the state has let fall apart: the governor gets a Fix badge, everyone else a spanner.
  const city = useGame((s) => s.destinationId);
  const broken = useRoads((s) => (s.data ? brokenAsset(city, place.id) : null));
  const mends = useCivic((s) => {
    const uid = useSession.getState().user?.uid;
    const p = s.data?.policies;
    // Whoever runs the city: its head, or the president while the seat is empty or its head impeached.
    const head = p?.[CITY_HEAD[city as CivicCity]];
    return !!broken && !!uid && (cityRunBy(p, uid) === city || (p?.president?.uid === uid && (!head || isSuspended(head))));
  });

  const handleSelect = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (broken && mends) {
      // Straight to the Treasury tab, where the repair is.
      useCivic.setState({ wantOpen: true, wantTreasury: true });
      useGame.getState().setPanel('phone');
      return;
    }
    useGame.getState().selectPlace(place.id);
  };

  return (
    <group position={[place.x + place.w / 2, posY, place.z + place.d / 2]}>
      {/* 3D hitbox behind the floating label so 3D raycasting also captures clicks on the pill/icon */}
      <mesh
        visible={false}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          useGame.getState().selectPlace(place.id);
        }}
        onPointerOver={(e) => onHover(e, null)}
        onPointerOut={offHover}
      >
        <planeGeometry args={[Math.max(2.6, place.name.length * 0.18), 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html center zIndexRange={[8, 1]} style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          className={`place-label ${selected || target ? 'on' : ''} ${place.id === 'home' ? 'home' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={handleSelect}
        >
          <span><Emoji char={place.icon} size="1em" /></span>
          <b>{place.name}</b>
          {broken && <i className={`place-fix ${mends ? 'gov' : ''}`} title={mends ? 'Fallen apart. Tap to repair' : 'Closed: fallen apart'}>{mends ? <><Emoji char="🛠️" size="1em" /> Fix</> : <Emoji char="🔧" size="1em" />}</i>}
        </button>
      </Html>
    </group>
  );
}

function PlaceMesh({ place }: { place: Place }) {
  const yaw = placeYaw(place);
  const side = Math.abs(Math.sin(yaw)) > 0.5;
  const selected = useGame((s) => s.placeId === place.id);

  const handleSelect = (e: any) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    useGame.getState().selectPlace(place.id);
  };

  // The building itself, for the hover outline (HoverOutline.tsx) when the pointer is on its plot or on it.
  const model = useRef<Group>(null);

  return (
    <group>
      {/* Ground plot footprint hitbox so clicking anywhere on the location's land/ground opens options */}
      <mesh
        visible={false}
        position={[place.x + place.w / 2, 0.015, place.z + place.d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleSelect}
        onPointerOver={(e) => onHover(e, model.current)}
        onPointerOut={offHover}
      >
        <planeGeometry args={[place.w, place.d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group
        ref={model}
        position={[place.x + place.w / 2, 0, place.z + place.d / 2]}
        rotation={[0, yaw, 0]}
        onClick={handleSelect}
        onPointerOver={(e) => onHover(e, model.current)}
        onPointerOut={offHover}
      >
        <PlaceModel model={place.model} w={side ? place.d : place.w} d={side ? place.w : place.d} />
      </group>
      {selected && (
        <mesh position={[place.x + place.w / 2, 0.06, place.z + place.d / 2]} rotation={[-Math.PI / 2, 0, 0]} userData={{ dynamic: true }}>
          <planeGeometry args={[place.w + 0.4, place.d + 0.4]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
      <PlaceLabel place={place} />
    </group>
  );
}

function LandmarkMesh({ l }: { l: Landmark }) {
  return (
    <group>
      <group position={[l.x + l.w / 2, 0, l.z + l.d / 2]}>
        <LandmarkModel model={l.model} w={l.w} d={l.d} />
      </group>
      {!l.quiet && (
        <Html position={[l.x + l.w / 2, 2.4, l.z + l.d / 2]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="place-label landmark">
            <span><Emoji char={l.icon} size="1em" /></span>
            <b>{l.name}</b>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Share of windows with a light on: most of them through the evening, fewer as the night wears on, a few early risers before dawn. */
function litShare(h: number) {
  if (h >= LIGHTS_ON) return 0.8;
  if (h < 4) return 0.8 - (h / 4) * 0.6;
  return 0.35;
}

/**
 * Windows and street lamps glow after dark, and the lamps throw pools of light on the road; rain leaves the roads
 * dark and shiny. Labels shrink to icons when zoomed out.
 */
function MapEffects() {
  const far = useRef(false);
  useFrame(({ camera }) => {
    const h = photoHour() ?? sceneHour(hourOf(useGame.getState().minutes));
    const night = h < 6.3 || h >= LIGHTS_ON ? 1 : 0;
    windowMat.emissiveIntensity = night * 0.9;
    // When NEPA takes the light, only the houses with a generator stay lit.
    windowsLit.value = litShare(h) * (gridOn() ? 1 : 0.4);
    lampMat.emissiveIntensity = night * 2.5;
    // The pools only show once it is actually getting dark: added onto bright late-afternoon ground they glared.
    // Wet tarmac throws more of the lamplight back.
    const dark = 1 - Math.min(1, Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) * 2.5);
    poolMat.opacity = night * dark * (0.42 + 0.35 * sky.wet);
    roadMat.color.copy(ROAD).lerp(ROAD_WET, sky.wet * 0.85);
    // Only a soft sheen: shinier tarmac threw the noon sun back as glare.
    roadMat.roughness = 1 - sky.wet * 0.35;
    // Icons only (styles.css body.map-far) until the camera comes in closer than the city's opening view (about 32 up).
    const isFar = camera.position.y > 24;
    if (isFar !== far.current) {
      far.current = isFar;
      document.body.classList.toggle('map-far', isFar);
    }
  });
  useLayoutEffect(() => () => document.body.classList.remove('map-far'), []);
  return null;
}

/** Who is in charge here: the president, and under them whoever runs this city. Nothing until the civic snapshot is in. */
function Leaders({ city }: { city: keyof typeof CITY_HEAD }) {
  const policies = useCivic((s) => s.data?.policies);
  if (!policies) return null;
  const head = CITY_HEAD[city];
  const chip = (office: PoliticalOffice, title: string) => {
    const holder = policies[office];
    const who = holder?.username ? `@${holder.username}` : holder?.name;
    return (
      <span className="region-leader">
        <small>{title}</small>
        <b className={who ? '' : 'vacant'}><Emoji char={OFFICE_ICON[office]} size={12} /> {who ?? 'Vacant'}</b>
      </span>
    );
  };
  return <div className="region-leaders">{chip('president', 'President')}{chip(head, head === 'minister' ? 'FCT Minister' : 'Governor')}</div>;
}

/** What this state makes, as icons, how many people live there and how much its treasury holds (once the civic snapshot is in). */
function StateFacts({ city }: { city: keyof typeof CITY_HEAD }) {
  const balance = useCivic((s) => s.data?.states?.[city]?.balance);
  const people = useCivic((s) => s.data?.states?.[city]?.people);
  const craze = crazeOf(people?.craze?.id);
  return (
    <div className="region-facts">
      <span className="region-goods" title={`Makes ${PRODUCES[city].map((p) => p.label).join(', ')}`}>
        {PRODUCES[city].map((p) => <Emoji key={p.label} char={p.icon} size={14} />)}
      </span>
      {craze && <span className="region-fact" title={`${craze.label} in this state right now`}><Emoji char={craze.icon} size={12} /> {craze.label}</span>}
      {people && <span className="region-fact" title={`Population: ${people.adults.toLocaleString('en-NG')} adults, ${people.kids.toLocaleString('en-NG')} children, ${people.players} players`}><Emoji char="👥" size={12} /> {populationOf(people).toLocaleString('en-NG')}</span>}
      {balance !== undefined && <span className="region-fact" title="State treasury"><Emoji char="💰" size={12} /> {nairaShort(balance)}</span>}
    </div>
  );
}

/**
 * The state's card over the map: its name, who runs it, what it makes and what it has in the bank. In the game it
 * carries two ways into the Civic app: the election board, where anyone can file to run, and this state's laws.
 * On the title screen, where there is no phone yet, it is only a sign. The weather sits just under it, and in the game
 * a pill beside it copies this state's invite link: whoever signs up from it is born here.
 */
function RegionBadge({ region }: { region: ReturnType<typeof regionOf> }) {
  const started = useGame((s) => s.started);
  const username = useSession((s) => s.user?.username);
  const [nickname, state] = region.tagline.split(' · ');
  const open = (want: Partial<{ wantLaws: PoliticalOffice }>) => {
    useCivic.setState({ wantOpen: true, ...want });
    useGame.getState().setPanel('phone');
  };
  // Like the place labels: a tap on the card is for the card, not a drag of the map under it.
  const keep = { onPointerDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onMouseDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onTouchStart: (e: { stopPropagation(): void }) => e.stopPropagation() };
  return (
    <div className="region-map-stack">
      <div className="region-map-badge" title={nickname} {...(started ? keep : {})}>
        <div className="region-head">
          <b>{region.name}</b>
          {state && <span className="region-state">{state}</span>}
        </div>
        <Leaders city={region.id} />
        <StateFacts city={region.id} />
        {started && (
          <div className="region-actions">
            <button type="button" onClick={() => open({})}><Emoji char="🗳️" size={13} /> Run for a post</button>
            <button type="button" onClick={() => open({ wantLaws: CITY_HEAD[region.id] })}><Emoji char="⚖️" size={13} /> State laws</button>
          </div>
        )}
      </div>
      <div className="region-pills">
        <WeatherChip city={region.id} />
        {started && (
          <button
            type="button"
            className="region-invite"
            title={`Copy a link that has whoever joins with it born in ${region.name}`}
            {...keep}
            onClick={() => void copyLink(stateLink(region.id, username), `Be born in ${region.name} on Naija City`, `🔗 Copied. Whoever joins with it is born in ${region.name}`)}
          >
            <Emoji char="🔗" size={12} /> Invite to {region.name}
          </button>
        )}
      </div>
    </div>
  );
}

export function City() {
  const destinationId = useGame((s) => s.destinationId);
  // Your house stands only in the state you were born in.
  const hasHome = useGame((s) => s.destinationId === s.homeState && (!s.started || s.origin !== 'almajiri' || s.properties.some((p) => p.stage >= STAGES.length)));
  const region = regionOf(destinationId);
  const map = cityMap(destinationId);
  const { w: CITY_W, h: CITY_H } = map;
  // Ad boards are booked per city (game/boards.ts).
  const kaduna = map.id === 'kaduna';
  const landmarks = regionLandmarks(destinationId);
  const places = regionPlaces(destinationId).filter((place) => place.id !== 'home' || hasHome);
  const buildings = useRef<Group>(null);
  const low = useLowPerf();
  // The season on the leaves, before anything with a tree in it is built (trees.ts).
  setTreeDust(seasonDust(map.id));
  return (
    <group key={map.id}>
      <MapEffects />
      <Slab outline={map.outline} depth={1.4} top={region.ground} />
      <IslandBase map={map} ground={region.ground} seed={destinationId.length + destinationId.charCodeAt(0)} />
      {map.riverDraw.length > 1 && <River map={map} />}
      <Lakes map={map} />
      <Roads map={map} />
      <Potholes city={map.id} />
      <LampHeads city={map.id} />
      {/* Everything that never moves, merged into a few draw calls (see StaticBatch). */}
      <StaticBatch key={`${destinationId}|${hasHome}`}>
        <group ref={buildings}>
          <Bridges map={map} />
          <StreetLamps map={map} />
          {map.houses.map((h, i) => (
            <group key={i} position={[h.x + h.w / 2, 0, h.z + h.d / 2]} rotation={[0, h.yaw, 0]}>
              <HouseModel {...h} />
            </group>
          ))}
          {mapTrees(map).map((t, i) => (
            <CityTree key={i} p={[t.x + 0.5, 0, t.z + 0.5]} s={t.s} kind={t.kind} />
          ))}
          {landmarks.map((l) => (
            <LandmarkMesh key={l.name} l={l} />
          ))}
          {places.map((p) => (
            <PlaceMesh key={p.id} place={p} />
          ))}
          <EstateSigns city={map.id} />
        </group>
      </StaticBatch>
      <EstateSignLabels city={map.id} />
      {/* A light touch of shade round the foot of each building: thicker looked smudged, and it costs a little. */}
      {!low && <GroundShade key={`shade|${destinationId}|${hasHome}`} source={buildings} strength={0.25} fade={0.45} />}
      <Html position={[CITY_W / 2, 27, 2]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'auto' }}>
        <RegionBadge region={region} />
      </Html>
      <CityBillboards region={map.id} />
      <SeaAds region={map.id} x={CITY_W / 2} z={CITY_H / 2} />
      <PlayerRide />
      <DriveLayer />
      <Traffic map={map} />
      {/* Clicking empty ground just closes the place card. */}
      {/* Tapping open water offers a sea billboard there. */}
      <mesh
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CITY_W / 2, -0.02, CITY_H / 2]}
        onClick={(e) => {
          if (e.delta > 8) return;
          for (const [w, d] of [[4, 2], [2, 1], [1, 1]]) {
            const r = { x: Math.floor(e.point.x - w / 2), z: Math.floor(e.point.z - d / 2), w, d, ...(kaduna ? {} : { region: map.id }) };
            if (seaWater(r)) { openAdsSheet(seaBoard(r)); return; }
          }
        }}
      >
        <planeGeometry args={[CITY_W + SEA_MARGIN * 2, CITY_H + SEA_MARGIN * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[CITY_W / 2, -0.01, CITY_H / 2]} onClick={(e) => e.delta <= 8 && useGame.getState().selectPlace(null)}>
        <planeGeometry args={[CITY_W, CITY_H]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
