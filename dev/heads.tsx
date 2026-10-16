// Temporary: a lineup of heads to judge face shape, hair and headwear fit. ?set=hair|hats  ?view=close|game  ?yaw=0.6
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import { Person, type Clip } from '../src/three/Person';
import { encodeLook, defaultAppearance, type Appearance, type HairStyle } from '../src/game/wardrobe';

const q = new URLSearchParams(location.search);
const set = q.get('set') ?? 'hair';
const view = q.get('view') ?? 'close';
const yaw = Number(q.get('yaw') ?? 0);

const look = (body: 'm' | 'f', skin: number, hair: HairStyle, head?: string, eyes?: string) => {
  const a: Appearance = defaultAppearance(body);
  return encodeLook({ ...a, skin, hair, outfit: { ...a.outfit, head, eyes } });
};
const SETS: Record<string, string[]> = {
  hair: [
    look('m', 5, 'low'), look('m', 3, 'fade', undefined, 'shades_black'), look('m', 1, 'bald', undefined, 'glasses_round_gold'), look('m', 4, 'afro'),
    look('m', 2, 'dreads'), look('m', 3, 'cornrows', undefined, 'shades_aviator'), look('m', 5, 'mohawk', undefined, 'shades_sport_red'), look('f', 3, 'braids'),
    look('f', 4, 'bun', undefined, 'glasses_cateye'), look('f', 0, 'ponytail', undefined, 'glasses_reading'), look('f', 2, 'puffs'), look('f', 5, 'curls'),
  ],
  hats: [
    look('m', 4, 'low', 'cap_black'), look('m', 2, 'dreads', 'snapback_green'), look('m', 3, 'fade', 'zanna_cap'), look('m', 5, 'low', 'fila_kente'),
    look('m', 1, 'afro', 'beanie_orange'), look('m', 3, 'low', 'bucket_ankara'), look('m', 4, 'cornrows', 'durag_blue'), look('m', 2, 'low', 'turban_white', 'glasses_reading'),
    look('f', 3, 'braids', 'gele_gold'), look('f', 4, 'bun', 'hijab_black'), look('f', 1, 'ponytail', 'headtie_ankara'), look('f', 5, 'puffs', 'cap_red', 'shades_gold'),
  ],
};
const page = Number(q.get('page') ?? 0);
const list = view === 'close' ? SETS[set].slice(page * 6, page * 6 + 6) : SETS[set];
const GAP = view === 'close' ? 0.4 : 0.9;

function One({ l }: { l: string }) {
  const clip = useRef<Clip>('sit');
  // 'sit' keeps the head still-ish; we want a stable pose for screenshots.
  return <Person look={l} clipRef={clip} />;
}

function App() {
  const n = list.length;
  const span = n * GAP;
  const camPos: [number, number, number] = view === 'close' ? [0, 1.66, 2.4] : [0, 4.5, 9];
  return (
    <Canvas shadows camera={{ position: camPos, fov: view === 'close' ? 35 : 34, near: 0.05, far: 200 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={['#cfe3ef']} />
      <hemisphereLight args={['#fff8ec', '#6b5a3a', 1.25]} />
      <directionalLight position={[3, 6, 5]} intensity={2.35} castShadow shadow-mapSize={[2048, 2048]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#d9d3c4" /></mesh>
      {list.map((l, i) => (
        <group key={i} position={[(i - (n - 1) / 2) * GAP, 0, 0]} rotation-y={yaw}>
          <One l={l} />
        </group>
      ))}
      <OrbitControls target={[0, view === 'close' ? 1.6 : 0.9, 0]} />
      {/* span unused but keeps lineup width readable */}
      <group userData={{ span }} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
