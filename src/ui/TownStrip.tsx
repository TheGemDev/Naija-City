import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { Bus, Car, CityTree, Horse, LandmarkModel, PlaceModel } from '../three/cityModels';
import { Person, type Clip } from '../three/Person';
import { Slab } from '../three/Slab';
import { encodeLook } from '../game/wardrobe';

/** Half the width of the little island, and how far the traffic runs before it fades out at the edges. */
const HALF = 8.5;
const RUN = 7.6;

/**
 * Each lane is a convoy moving at one speed, so a faster vehicle never drives through a slower one.
 * Right-hand traffic: the near lane (z > 0) goes left to right.
 */
const LANES = [
  { z: 0.95, dir: 1 as const, speed: 2.4, vehicles: [{ kind: 'car', colour: '#dc2626', at: 0 }, { kind: 'keke', colour: '', at: 5 }, { kind: 'bus', colour: '#f8fafc', at: 9.5 }, { kind: 'car', colour: '#f8fafc', at: 14 }] },
  { z: -0.95, dir: -1 as const, speed: 2.1, vehicles: [{ kind: 'keke', colour: '', at: 2 }, { kind: 'car', colour: '#2563eb', at: 7 }, { kind: 'keke', colour: '', at: 11 }, { kind: 'car', colour: '#f59e0b', at: 15 }] },
];
const LOOP = RUN * 2 + 3;

/** The slimmest keke that still reads as one: yellow body, black roof, three wheels. Smaller than the cars it drives beside. */
function MiniKeke() {
  return (
    <group>
      <mesh position={[0, 0.34, -0.05]}>
        <boxGeometry args={[0.62, 0.34, 0.95]} />
        <meshStandardMaterial color="#facc15" flatShading />
      </mesh>
      <mesh position={[0, 0.34, 0.5]}>
        <boxGeometry args={[0.3, 0.28, 0.28]} />
        <meshStandardMaterial color="#eab308" flatShading />
      </mesh>
      <mesh position={[0, 0.84, -0.12]}>
        <boxGeometry args={[0.7, 0.07, 0.75]} />
        <meshStandardMaterial color="#171717" flatShading />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.6, -0.4]}>
            <boxGeometry args={[0.04, 0.5, 0.04]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
          <mesh position={[x, 0.6, 0.18]}>
            <boxGeometry args={[0.04, 0.5, 0.04]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
        </group>
      ))}
      {[[-0.32, -0.32], [0.32, -0.32], [0, 0.55]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.15, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 10]} />
          <meshStandardMaterial color="#17202a" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Traffic() {
  const refs = useRef<(Group | null)[][]>([[], []]);
  useFrame(({ clock }) => {
    LANES.forEach((lane, li) =>
      lane.vehicles.forEach((v, vi) => {
        const g = refs.current[li][vi];
        if (!g) return;
        const x = ((((clock.elapsedTime * lane.speed + v.at) % LOOP) + LOOP) % LOOP) - RUN - 1.5;
        // Ease in and out near the ends so nothing drives off the edge of the island.
        const f = Math.max(0, Math.min(1, (RUN + 1.2 - Math.abs(x)) / 1.4));
        g.position.set(x * lane.dir, 0, lane.z);
        g.scale.setScalar(Math.max(0.001, f) * (v.kind === 'keke' ? 0.9 : 0.78));
        g.rotation.y = lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }),
    );
  });
  return (
    <group>
      {LANES.map((lane, li) =>
        lane.vehicles.map((v, vi) => (
          <group key={`${li}-${vi}`} ref={(g) => { refs.current[li][vi] = g; }}>
            {v.kind === 'bus' ? <Bus /> : v.kind === 'keke' ? <MiniKeke /> : <Car c={v.colour} />}
          </group>
        )),
      )}
    </group>
  );
}

/** A horse (Kaduna has the polo club) ambling along the far pavement. */
function WalkingHorse() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const x = -RUN + ((clock.elapsedTime * 0.8) % (RUN * 2));
    g.position.set(x, Math.abs(Math.sin(clock.elapsedTime * 5)) * 0.03, -2.7);
    g.rotation.y = Math.PI / 2;
  });
  return (
    <group ref={ref} scale={0.9}>
      <Horse />
    </group>
  );
}

/** Almajiri boys in worn kaftans heading down the pavement, one each way. */
function Almajiri({ z, dir, speed, offset, look }: { z: number; dir: 1 | -1; speed: number; offset: number; look: string }) {
  const ref = useRef<Group>(null);
  const clip = useRef<Clip>('walk');
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const span = RUN * 2;
    const x = (((clock.elapsedTime * speed + offset) % span) + span) % span - RUN;
    g.position.set(x * dir, 0, z);
    g.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
  });
  return (
    <group ref={ref} scale={0.5}>
      <Person look={look} clipRef={clip} />
    </group>
  );
}

function Town() {
  const boys = useMemo(
    () => [
      encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_brown', shoes: 'slippers_palm', head: 'zanna_cap' } }),
      encodeLook({ body: 'm', skin: 3, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_white', shoes: 'slippers_black' } }),
      encodeLook({ body: 'm', skin: 5, hair: 'low', hairColor: 0, outfit: { top: 'tee_white', bottom: 'shorts_khaki', shoes: 'slippers_black' } }),
    ],
    [],
  );
  return (
    <group>
      {/* the island: grass on top, brown rounded edge, like the house on the title screen */}
      <Slab x0={-HALF} z0={-11} x1={HALF} z1={6.6} r={2.4} depth={1.3} top="#9fbf5a" side="#b06a3b" />
      {/* road and pavements */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[HALF * 2 - 0.4, 0.1, 4.2]} />
        <meshStandardMaterial color="#3b4350" />
      </mesh>
      <mesh position={[0, 0.04, 3.1]}>
        <boxGeometry args={[HALF * 2 - 0.4, 0.14, 1.6]} />
        <meshStandardMaterial color="#c9c4b5" />
      </mesh>
      <mesh position={[0, 0.04, -2.9]}>
        <boxGeometry args={[HALF * 2 - 0.4, 0.14, 1.4]} />
        <meshStandardMaterial color="#c9c4b5" />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-6.8 + i * 3.4, 0.085, 0]}>
          <boxGeometry args={[1.5, 0.02, 0.12]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}

      {/* Government House in the middle, the central mosque and Arewa House either side */}
      <group position={[0, 0, -7.4]} scale={0.8}>
        <LandmarkModel model="govhouse" w={6} d={5} />
      </group>
      <group position={[-5.7, 0, -7.4]} scale={0.62}>
        <PlaceModel model="mosque" w={5} d={5} />
      </group>
      <group position={[5.7, 0, -7.4]} scale={0.62}>
        <PlaceModel model="arewa" w={5} d={5} />
      </group>
      {[-7.4, -3.2, 3.2, 7.4].map((x, i) => (
        <CityTree key={i} p={[x, 0, -4.9]} s={0.55 + (i % 2) * 0.1} c={i % 2 ? '#3f7d2a' : '#b88b49'} />
      ))}
      {[-6.6, -1.2, 5.6].map((x, i) => (
        <CityTree key={`f${i}`} p={[x, 0, 5.2]} s={0.55 + (i % 2) * 0.12} c={i % 2 ? '#3f7d2a' : '#b88b49'} />
      ))}
      <group position={[2.4, 0, 5]} rotation={[0, -0.7, 0]} scale={0.8}>
        <Horse c="#f8fafc" />
      </group>

      <WalkingHorse />
      <Almajiri z={3.5} dir={1} speed={0.5} offset={0} look={boys[0]} />
      <Almajiri z={3.1} dir={1} speed={0.5} offset={1.6} look={boys[2]} />
      <Almajiri z={2.7} dir={-1} speed={0.45} offset={6} look={boys[1]} />

      <Traffic />
    </group>
  );
}

/** Zooms the camera so the whole island always fits the strip, whatever the screen shape. */
function FitCamera() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const tan = Math.tan((30 / 2) * (Math.PI / 180));
    // The island is about 17 wide and, seen from 30 degrees up, about 10.5 tall on screen; fit both with a little air.
    const dist = Math.max((HALF + 3) / (tan * aspect), 8.6 / tan, 16);
    camera.position.set(0, -0.4 + dist * 0.5, -2.2 + dist * 0.87);
    camera.lookAt(0, -0.4, -2.2);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

/** Redraw about 30 times a second, and not at all while the tab is hidden: it's a backdrop, not the game. */
function Throttle() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = setInterval(() => !document.hidden && invalidate(), 1000 / 30);
    return () => clearInterval(id);
  }, [invalidate]);
  return null;
}

/** A small slice of Kaduna: Government House behind a busy road on a little island. Cheap to draw (one small canvas, ~30fps). */
export function TownStrip() {
  return (
    <div className="town-strip">
      <Canvas dpr={1} frameloop="demand" camera={{ position: [0, 14, 24], fov: 30 }} gl={{ alpha: true, antialias: true }}>
        <FitCamera />
        <Throttle />
        <hemisphereLight args={['#fff8ec', '#6b5a3a', 1.2]} />
        <directionalLight position={[10, 16, 12]} intensity={2} />
        <Town />
      </Canvas>
    </div>
  );
}
