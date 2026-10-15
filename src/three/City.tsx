// The town map: seen from above. Tap a building to travel there and go in.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Object3D, Shape, ShapeGeometry, type Group, type InstancedMesh, type Mesh } from 'three';
import {
  BRIDGE_RAMP, BRIDGE_Y, cityMap, isOpen, placeYaw, mapGroundY, potholeCity, potholeOf, type CityMap, type Landmark, type Place, type Pothole,
} from '../game/city';
import { hourOf, nairaShort, useGame } from '../game/store';
import { producesLine } from '../game/trade';
import { STAGES } from '../game/property';
import { photoHour } from '../game/photo';
import { LIGHTS_ON, sceneHour } from '../game/theme';
import { regionLandmarks, regionOf, regionPlaces } from '../game/regions';
import { CAR_BY_ID } from '../game/cars';
import { avatar } from '../game/avatar';
import { B, Bike, Helicopter, Keke } from './models';
import { Bus, Car, CityTree, HouseModel, LandmarkModel, lampMat, PlaceModel, windowMat } from './cityModels';
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
import { useCivic } from '../net/civic';
import { CITY_HEAD, OFFICE_ICON, type CivicCity, type PoliticalOffice } from '../game/civic';
import { Emoji } from '../ui/Icons';

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
      <instancedMesh ref={tileRef} args={[undefined, undefined, tiles.length]} receiveShadow>
        <planeGeometry args={[1.001, 1.001]} />
        <meshStandardMaterial color="#555b63" />
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

/** Kaduna's traffic is laid out by hand above. Any other city gets two vehicles on each main road: no keke in the capital, danfo in Lagos, keke everywhere in Kano. */
function trafficOf(map: CityMap): Vehicle[] {
  if (map.id === 'kaduna') return VEHICLES;
  const lagos = map.id === 'lagos';
  const kinds = lagos ? LAGOS_KINDS : map.id === 'kano' ? KANO_KINDS : ABUJA_KINDS;
  const colours = lagos ? LAGOS_COLOURS : map.id === 'kano' ? KANO_COLOURS : ABUJA_COLOURS;
  return map.roads.filter((r) => r.main).flatMap((r, i) => {
    const horiz = r.w > r.d;
    // The stretch of the road that is on the island.
    const cells = Array.from({ length: horiz ? r.w : r.d }, (_, k) => (horiz ? r.x : r.z) + k).filter((a) => (horiz ? map.isRoad(a, r.z) : map.isRoad(r.x, a)));
    if (cells.length < 8) return [];
    return [0, 1].map((k): Vehicle => {
      const kind = kinds[(i * 2 + k) % kinds.length];
      return {
        kind, colour: kind === 'bus' ? (lagos ? DANFO : '') : colours[(i + k * 3) % colours.length], axis: horiz ? 'x' : 'z', line: (horiz ? r.z : r.x) + 1,
        from: cells[0] + 0.5, to: cells[cells.length - 1] + 0.5, speed: BASE_SPEED[kind] + ((i * 7 + k * 5) % 5) / 10, offset: i * 23 + k * 61,
      };
    });
  });
}

/** Sized against the people on the map (0.85 tall): a saloon reaches their shoulder, a bus stands over them. Lanes are one tile wide. */
const TRAFFIC_SCALE: Record<Vehicle['kind'], number> = { car: 1, bus: 1, keke: 0.68, bike: 0.62 };

/**
 * One vehicle on the move. It crosses the map a tile at a time along a curve that keeps it in the
 * right-hand lane: straight through, round the corner at a junction, or back the other way at a
 * dead end. In time it heads for the edge of the map and drives off, and another comes in.
 */
interface Drive {
  /** The tile being crossed, the way it came in, and the way it will leave. */
  cx: number; cz: number; dx: number; dz: number; ex: number; ez: number;
  /** The curve across this tile (start, bend, end) and how far along it the vehicle is. */
  p: [number, number, number, number, number, number];
  t: number; len: number;
  x: number; z: number; yaw: number;
  mode: 'road' | 'off' | 'fade';
  /** Tiles left before it leaves the road (off the edge, or fading out where no road reaches the edge). */
  left: number;
  leaving: boolean;
  trips: number;
  limit: number;
  exit: { x: number; z: number; dx: number; dz: number } | null;
  speed: number;
  roll: number;
  turn: number;
}

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** How far right of a tile's centre line a vehicle keeps, so oncoming traffic passes side by side. */
const LANE = 0.25;

/** Lays the curve across the vehicle's tile: in on the right of `d`, out on the right of `e`. */
function laneCurve(v: Drive) {
  const mx = v.cx + 0.5, mz = v.cz + 0.5;
  const ax = mx - v.dx * 0.5 - v.dz * LANE, az = mz - v.dz * 0.5 + v.dx * LANE;
  const bx = mx + v.ex * 0.5 - v.ez * LANE, bz = mz + v.ez * 0.5 + v.ex * LANE;
  let kx: number, kz: number;
  if (v.ex === v.dx && v.ez === v.dz) { kx = (ax + bx) / 2; kz = (az + bz) / 2; }
  else if (v.ex === -v.dx && v.ez === -v.dz) { kx = mx + v.dx * 0.55; kz = mz + v.dz * 0.55; }
  else {
    // Where the lane coming in meets the lane going out.
    const k = (bx - ax) * v.dx + (bz - az) * v.dz;
    kx = ax + v.dx * k; kz = az + v.dz * k;
  }
  v.p = [ax, az, kx, kz, bx, bz];
  v.len = (Math.hypot(kx - ax, kz - az) + Math.hypot(bx - kx, bz - kz) + Math.hypot(bx - ax, bz - az)) / 2 || 1;
  v.t = 0;
}

function Traffic({ map }: { map: CityMap }) {
  const refs = useRef<(Group | null)[]>([]);
  const vehicles = useMemo(() => trafficOf(map), [map]);

  const world = useMemo(() => {
    const inBounds = (x: number, z: number) => x >= 0 && z >= 0 && x < map.w && z < map.h;
    const open = (x: number, z: number) => inBounds(x, z) && (map.isRoad(x, z) || map.isBridge(x, z));
    const cells: [number, number][] = [];
    const exits: NonNullable<Drive['exit']>[] = [];
    for (let x = 0; x < map.w; x++) {
      for (let z = 0; z < map.h; z++) {
        if (!open(x, z)) continue;
        cells.push([x, z]);
        for (const [dx, dz] of STEPS) if (!inBounds(x + dx, z + dz)) exits.push({ x, z, dx, dz });
      }
    }

    /** Arrived in tile (cx, cz) heading (dx, dz): choose the way out of it. */
    const choose = (v: Drive) => {
      if (v.mode !== 'road' || !inBounds(v.cx, v.cz)) { v.ex = v.dx; v.ez = v.dz; return; }
      v.trips++;
      if (!v.leaving && v.trips > v.limit) v.leaving = true;
      if (v.leaving) {
        if (!exits.length || v.trips > v.limit + 90) { v.mode = 'fade'; v.left = 3; v.ex = v.dx; v.ez = v.dz; return; }
        if (!v.exit) v.exit = exits[Math.floor(Math.random() * exits.length)];
        if (v.cx === v.exit.x && v.cz === v.exit.z) { v.mode = 'off'; v.left = 10; v.ex = v.exit.dx; v.ez = v.exit.dz; return; }
      }
      const ways = STEPS.filter(([x, z]) => !(x === -v.dx && z === -v.dz) && open(v.cx + x, v.cz + z));
      if (!ways.length) {
        // End of the road: off the edge of the map, or round and back.
        if (!inBounds(v.cx + v.dx, v.cz + v.dz)) { v.mode = 'off'; v.left = 10; v.ex = v.dx; v.ez = v.dz; return; }
        v.ex = -v.dx; v.ez = -v.dz;
        return;
      }
      let best = ways[0];
      let bestScore = Infinity;
      for (const w of ways) {
        const straight = w[0] === v.dx && w[1] === v.dz;
        const score = v.leaving && v.exit
          ? Math.abs(v.cx + w[0] - v.exit.x) + Math.abs(v.cz + w[1] - v.exit.z) + Math.random() * 1.5
          : Math.random() * 3 - (straight ? 2 : 0);
        if (score < bestScore) { bestScore = score; best = w; }
      }
      v.ex = best[0]; v.ez = best[1];
    };

    const spawn = (v: Drive, fresh: boolean) => {
      v.mode = 'road'; v.leaving = false; v.trips = 0; v.limit = 14 + Math.floor(Math.random() * 26); v.exit = null; v.roll = 0; v.turn = 0; v.left = 0;
      if (!fresh && exits.length && Math.random() < 0.75) {
        // Rolls in from beyond the edge of the map.
        const e = exits[Math.floor(Math.random() * exits.length)];
        v.dx = -e.dx; v.dz = -e.dz; v.cx = e.x + e.dx * 6; v.cz = e.z + e.dz * 6;
      } else {
        let placed = false;
        for (let tries = 0; tries < 40 && cells.length && !placed; tries++) {
          const [x, z] = cells[Math.floor(Math.random() * cells.length)];
          const ways = STEPS.filter(([dx, dz]) => open(x - dx, z - dz) || open(x + dx, z + dz));
          if (!ways.length) continue;
          [v.dx, v.dz] = ways[Math.floor(Math.random() * ways.length)];
          v.cx = x; v.cz = z;
          placed = true;
        }
        if (!placed) { v.cx = v.cz = -100; v.dx = 1; v.dz = 0; }
      }
      choose(v);
      laneCurve(v);
      if (fresh) v.t = Math.random();
    };
    return { inBounds, open, cells, exits, choose, spawn };
  }, [map]);

  const drives = useMemo(() => vehicles.map((veh) => {
    const v = { speed: veh.speed, p: [0, 0, 0, 0, 0, 0] } as unknown as Drive;
    world.spawn(v, true);
    v.speed = veh.speed;
    return v;
  }), [vehicles, world]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    // The server numbers every city's potholes in one list: only this city's are on these roads.
    const openPotholes = useRoads.getState().open.filter((i) => potholeCity(i) === map.id).map((i) => potholeOf(i)!);

    vehicles.forEach((veh, i) => {
      const v = drives[i];
      const g = refs.current[i];
      if (!g || !v) return;

      // Ease off for a bend, and hang back from whatever is in front in the same lane.
      const bend = v.ex === v.dx && v.ez === v.dz ? 1 : v.ex === -v.dx && v.ez === -v.dz ? 0.4 : 0.6;
      let want = veh.speed * bend;
      const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
      for (let j = 0; j < drives.length; j++) {
        if (j === i) continue;
        const o = drives[j];
        const ox = o.x - v.x, oz = o.z - v.z;
        const ahead = ox * sy + oz * cy;
        const side = ox * cy - oz * sy;
        if (ahead > 0 && ahead < 1.3 && Math.abs(side) < 0.3 && Math.cos(o.yaw - v.yaw) > 0) want *= Math.max(0, (ahead - 0.55) / 0.75);
      }
      v.speed += (want - v.speed) * Math.min(1, dt * 3);

      v.t += (v.speed * dt) / v.len;
      while (v.t >= 1) {
        const over = (v.t - 1) * v.len;
        if (v.mode !== 'road' && --v.left <= 0) { world.spawn(v, false); break; }
        v.cx += v.ex; v.cz += v.ez; v.dx = v.ex; v.dz = v.ez;
        world.choose(v);
        laneCurve(v);
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
      const fade = v.mode === 'fade' ? Math.max(0.01, Math.min(1, (v.left - 1 + (1 - v.t)) / 2)) : 1;
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
  const shadow = useRef<Mesh>(null);
  const car = carId ? CAR_BY_ID[carId] : null;
  // A helicopter lifts off, cruises above the roofs, tilts into its speed, banks into turns and settles at the end.
  const flight = useRef({ total: 0, yaw: 0, bank: 0 });
  useEffect(() => { flight.current = { total: 0, yaw: avatar.yaw, bank: 0 }; }, [ride]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const groundY = mapGroundY(avatar.x, avatar.z);
    ref.current.position.set(avatar.x, groundY, avatar.z);
    ref.current.rotation.set(0, avatar.yaw, 0);
    if (ride !== 'helicopter') return;
    const f = flight.current;
    const left = avatar.path.length;
    if (left > f.total) f.total = left;
    const progress = f.total ? 1 - left / f.total : 0;
    // Up over the first stretch, down over the last: smooth, never a pop.
    const edge = Math.min(1, Math.min(progress, 1 - progress) / 0.18);
    const lift = edge * edge * (3 - 2 * edge);
    const height = 0.4 + lift * 8;
    ref.current.position.y = groundY + height;
    // Turn rate of the heading, smoothed, becomes the bank.
    let turn = avatar.yaw - f.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    f.yaw = avatar.yaw;
    const want = Math.max(-0.45, Math.min(0.45, (turn / Math.max(dt, 0.001)) * 0.35));
    f.bank += (want - f.bank) * Math.min(1, dt * 4);
    ref.current.rotation.order = 'YXZ';
    ref.current.rotation.set(lift * 0.16, avatar.yaw, -f.bank);
    if (shadow.current) {
      shadow.current.position.set(avatar.x, groundY + 0.04, avatar.z);
      const spread = 1 + lift * 0.9;
      shadow.current.scale.set(spread, spread, spread);
      (shadow.current.material as MeshStandardMaterial).opacity = 0.34 - lift * 0.16;
    }
  });

  if (!ride) return null;
  return (
    <>
      <group ref={ref} scale={ride === 'helicopter' ? 1.1 : ride === 'okada' ? 0.82 : ride === 'keke' ? 0.72 : 1}>
        {ride === 'helicopter' ? (
          <Helicopter official={official} />
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
  const open = useGame((s) => isOpen(place, hourOf(s.minutes)));
  const selected = useGame((s) => s.placeId === place.id);
  const target = useGame((s) => s.task?.actionId === 'enter' && s.task.placeId === place.id);
  const posY = place.ground ? 1.2 : 3.2;
  // A building the state has let fall apart: the governor gets a Fix badge, everyone else a spanner.
  const city = useGame((s) => s.destinationId);
  const broken = useRoads((s) => (s.data ? brokenAsset(city, place.id) : null));
  const mends = useCivic((s) => {
    const uid = useSession.getState().user?.uid;
    return !!broken && !!uid && s.data?.policies[CITY_HEAD[city as CivicCity]]?.uid === uid;
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
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[Math.max(2.6, place.name.length * 0.18), 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html center zIndexRange={[8, 1]} style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          className={`place-label ${selected || target ? 'on' : ''} ${open ? '' : 'closed'} ${place.id === 'home' ? 'home' : ''}`}
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

  return (
    <group>
      {/* Ground plot footprint hitbox so clicking anywhere on the location's land/ground opens options */}
      <mesh
        visible={false}
        position={[place.x + place.w / 2, 0.015, place.z + place.d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleSelect}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[place.w, place.d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group
        position={[place.x + place.w / 2, 0, place.z + place.d / 2]}
        rotation={[0, yaw, 0]}
        onClick={handleSelect}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
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

/** Windows and street lamps glow after dark; labels shrink to icons when zoomed out. */
function MapEffects() {
  const far = useRef(false);
  useFrame(({ camera }) => {
    const h = photoHour() ?? sceneHour(hourOf(useGame.getState().minutes));
    const night = h < 6.3 || h >= LIGHTS_ON ? 1 : 0;
    windowMat.emissiveIntensity = night * 0.9;
    lampMat.emissiveIntensity = night * 2.5;
    const isFar = camera.position.y > 48;
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
  const line = (office: PoliticalOffice, title: string) => {
    const holder = policies[office];
    return <span className="region-leader">{OFFICE_ICON[office]} {title}: <i>{holder?.username ? `@${holder.username}` : holder?.name ?? 'Vacant'}</i></span>;
  };
  return <>{line('president', 'President')}{line(head, head === 'minister' ? 'FCT Minister' : 'Governor')}</>;
}

/** What this state makes, and how much its treasury holds (once the civic snapshot is in). */
function StateFacts({ city }: { city: keyof typeof CITY_HEAD }) {
  const balance = useCivic((s) => s.data?.states?.[city]?.balance);
  return (
    <>
      <span className="region-fact">Makes {producesLine(city)}</span>
      {balance !== undefined && <span className="region-fact"><Emoji char="💰" size={11} /> Treasury <i>{nairaShort(balance)}</i></span>}
    </>
  );
}

/**
 * The city's name card over the map. In the game it is a button: it opens the phone on the Civic app's election board,
 * where anyone can file to run. On the title screen, where there is no phone yet, it is only a sign.
 */
function RegionBadge({ region }: { region: ReturnType<typeof regionOf> }) {
  const started = useGame((s) => s.started);
  const inside = (
    <>
      <b>{region.name}</b><span>{region.tagline}</span>
      <Leaders city={region.id} />
      <StateFacts city={region.id} />
    </>
  );
  if (!started) return <div className="region-map-badge">{inside}</div>;
  return (
    <button
      type="button"
      className="region-map-badge"
      title="Open Civic: elections and posts"
      // Like the place labels: the tap is for the card, not a drag of the map under it.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={() => {
        useCivic.setState({ wantOpen: true });
        useGame.getState().setPanel('phone');
      }}
    >
      {inside}
      <span className="region-run"><Emoji char="🗳️" size={11} /> Run for a post ›</span>
    </button>
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
  return (
    <group key={map.id}>
      <MapEffects />
      <Slab outline={map.outline} depth={1.4} top={region.ground} />
      <IslandBase outline={map.outline} seed={destinationId.length + destinationId.charCodeAt(0)} />
      {map.riverDraw.length > 1 && <River map={map} />}
      <Lakes map={map} />
      <Roads map={map} />
      <Potholes city={map.id} />
      <LampHeads city={map.id} />
      {/* Everything that never moves, merged into a few draw calls (see StaticBatch). */}
      <StaticBatch key={`${destinationId}|${hasHome}`}>
        <Bridges map={map} />
        <StreetLamps map={map} />
        {map.houses.map((h, i) => (
          <group key={i} position={[h.x + h.w / 2, 0, h.z + h.d / 2]} rotation={[0, h.yaw, 0]}>
            <HouseModel {...h} />
          </group>
        ))}
        {map.trees.map((t, i) => (
          <CityTree key={i} p={[t.x + 0.5, 0, t.z + 0.5]} s={t.s} c={i % 3 ? region.accent : '#b88b49'} />
        ))}
        {landmarks.map((l) => (
          <LandmarkMesh key={l.name} l={l} />
        ))}
        {places.map((p) => (
          <PlaceMesh key={p.id} place={p} />
        ))}
      </StaticBatch>
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
