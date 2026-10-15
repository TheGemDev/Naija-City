// Dev-only gallery of the code-built models: /dev/models.html?set=people|cars|items|props|places|landmarks|aircraft
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { useEffect, useRef, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Person, type Clip } from '../src/three/Person';
import { CarModel } from '../src/three/CarModel';
import { ItemModel, Keke, Bike } from '../src/three/models';
import { PropModel } from '../src/three/interiorModels';
import { PlaceModel, LandmarkModel, HouseModel, Car } from '../src/three/cityModels';
import { Airliner, PrivateJet } from '../src/three/aircraft';
import { CARS } from '../src/game/cars';
import { ITEMS } from '../src/game/catalog';
import { encodeLook, defaultAppearance, HAIRS } from '../src/game/wardrobe';

const q = new URLSearchParams(location.search);
const set = q.get('set') ?? 'people';
const only = q.get('only')?.split(',');
const start = Number(q.get('from') ?? 0);
const count = Number(q.get('n') ?? 24);

function Idle({ look }: { look: string }) {
  const clip = useRef<Clip>((q.get('clip') as Clip) ?? 'idle');
  return <Person look={look} clipRef={clip} />;
}

type Cell = { name: string; node: ReactNode; size: number };
function cells(): Cell[] {
  switch (set) {
    case 'people': {
      const out: Cell[] = [];
      for (const body of ['m', 'f'] as const) for (let skin = 0; skin < 6; skin += 2) {
        const a = { ...defaultAppearance(body), skin, hair: HAIRS.filter((h) => !h.body || h.body === body)[skin % 4].id };
        out.push({ name: `${body} skin${skin} ${a.hair}`, node: <Idle look={encodeLook(a)} />, size: 1.1 });
      }
      return out;
    }
    case 'cars': return CARS.filter((c) => !c.id.startsWith('jet')).map((c) => ({ name: c.id, node: <CarModel carId={c.id} position={[0, 0, 0]} rotation={[0, Math.PI / 4, 0]} />, size: 5.5 }))
      .concat([{ name: 'city Car', node: <Car />, size: 5.5 }, { name: 'keke', node: <Keke />, size: 4 }, { name: 'bike', node: <Bike rider />, size: 3 }]);
    case 'items': return Object.keys(ITEMS).map((t) => ({ name: t, node: <ItemModel type={t} powered running />, size: 3 }));
    case 'props': return PROPS.map((t) => ({ name: t, node: <PropModel type={t} text="Sign" />, size: 3 }));
    case 'aircraft': return [
      { name: 'airliner', node: <group rotation-y={-0.7}><Airliner /></group>, size: 16 },
      { name: 'private jet', node: <group rotation-y={-0.7}><PrivateJet /></group>, size: 16 },
      { name: 'map airport', node: <PlaceModel model="airport" w={16} d={5} />, size: 16 },
    ];
    case 'places': return PLACES.map((m) => ({ name: m, node: <PlaceModel model={m} w={14} d={14} />, size: 18 }))
      .concat([0, 1, 2, 3].map((s) => ({ name: `house ${s}`, node: <HouseModel w={10} d={10} style={s} wall="#f1e3c8" roof="#9a3412" storeys={1 + (s % 2)} />, size: 14 })));
    default: return LANDMARKS.map((m) => ({ name: m, node: <LandmarkModel model={m} w={20} d={20} />, size: 26 }));
  }
}
const PROPS = ['cooler', 'umbrella', 'pot_counter', 'bench', 'kettle_table', 'pew', 'neem', 'fabric_stall', 'food_stall', 'produce_stall', 'info_desk', 'office_desk', 'filing', 'cinema_seat', 'icecream', 'shop_rack', 'statue', 'gazebo', 'beanbag', 'coffee', 'keke', 'corn_roaster', 'goal', 'sun_lounger', 'dj_booth', 'vip_booth', 'club_bar', 'bar_stool', 'reception', 'luggage_cart', 'minibar'];
const PLACES = ['home', 'suya', 'school', 'church', 'buka', 'mosque', 'market', 'bank', 'hospital', 'mall', 'boutique', 'hotel', 'station', 'motorpark', 'club', 'techhub'];
const LANDMARKS = ['govhouse', 'asorock', 'citygate', 'supremecourt', 'cbn', 'nnpc', 'milltower', 'nationaltheatre', 'glorydome', 'emirpalace', 'kofar', 'pyramids'];

let list = cells();
if (only) list = list.filter((c) => only.includes(c.name));
list = list.slice(start, start + count);
const cols = Math.ceil(Math.sqrt(list.length * 1.6));
const size = Math.max(...list.map((c) => c.size));

/** ?env=0.4: the game's room environment light at that strength, to match high quality mode. */
function Env({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene, intensity]);
  return null;
}
const ENV = q.get('env');
const GAME = q.has('game');

function App() {
  const rows = Math.ceil(list.length / cols);
  const span = Math.max(cols, rows * 1.6) * size;
  const h = set === 'people' ? 0.9 : size * 0.15;
  const tilt = Number(q.get('tilt') ?? 0.45);
  return (
    <Canvas shadows camera={{ position: [0, h + span * tilt, span * 0.95], fov: 34, near: 0.05, far: 5000 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={['#cfe3ef']} />
      {ENV && <Env intensity={Number(ENV)} />}
      <hemisphereLight args={GAME ? ['#fff8ec', '#6b5a3a', Number(q.get('hemi') ?? 1.25)] : ['#ffffff', '#8a7a60', 1.1]} />
      <directionalLight position={[span, span * 1.5, span * 0.8]} intensity={GAME ? 2.35 : 2.2} castShadow shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} shadow-camera-far={span * 5} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[span * 4, span * 4]} /><meshStandardMaterial color="#d9d3c4" /></mesh>
      {list.map((c, i) => {
        const x = ((i % cols) - (cols - 1) / 2) * size;
        const z = (Math.floor(i / cols) - (rows - 1) / 2) * size;
        return (
          <group key={c.name} position={[x, 0, z]}>
            {c.node}
            <Html position={[0, 0, size * 0.42]} center style={{ whiteSpace: 'nowrap', background: '#0008', color: '#fff', padding: '1px 4px', borderRadius: 4 }}>{c.name}</Html>
          </group>
        );
      })}
      <OrbitControls target={[0, h, 0]} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
