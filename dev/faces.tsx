// TEMP harness (delete after): faces close up and at game distance. ?set=main|hats
import { createRoot } from 'react-dom/client';
import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Person, type Clip } from '../src/three/Person';
import { encodeLook, type Appearance } from '../src/game/wardrobe';

const q = new URLSearchParams(location.search);
const set = q.get('set') ?? 'main';
const L = (body: 'm' | 'f', skin: number, hair: Appearance['hair'], outfit: Appearance['outfit'] = {}, hairColor = 0) =>
  encodeLook({ body, skin, hair, hairColor, outfit: { top: body === 'm' ? 'tee_white' : 'blouse_yellow', bottom: 'jeans_blue', ...outfit } });
type P = { look: string; kid?: boolean };
const MAIN: P[] = [
  { look: L('m', 0, 'low') },
  { look: L('m', 3, 'fade') },
  { look: L('m', 5, 'bald', { head: 'cap_red' }) },
  { look: L('m', 4, 'dreads') },
  { look: L('f', 1, 'braids') },
  { look: L('f', 3, 'puffs') },
  { look: L('f', 5, 'bun', { head: 'hijab_cream' }) },
  { look: L('f', 2, 'afro') },
  { look: L('m', 3, 'curls'), kid: true },
];
const HATS: P[] = [
  { look: L('m', 3, 'low', { head: 'zanna_cap' }) },
  { look: L('m', 2, 'low', { head: 'fila_kente' }) },
  { look: L('m', 4, 'fade', { head: 'snapback_black' }) },
  { look: L('m', 1, 'low', { head: 'beanie_orange' }) },
  { look: L('m', 5, 'low', { head: 'bucket_khaki' }) },
  { look: L('m', 3, 'low', { head: 'turban_white' }) },
  { look: L('m', 2, 'low', { head: 'durag_blue', eyes: 'glasses_reading' }) },
  { look: L('f', 4, 'braids', { head: 'gele_gold' }) },
  { look: L('f', 2, 'braids', { head: 'headtie_ankara', eyes: 'shades_black' }) },
  { look: L('f', 3, 'cornrows', { head: 'hijab_black' }) },
];
const CLOSE: P[] = [MAIN[1], MAIN[0], MAIN[5], MAIN[4], MAIN[8]];
const people = set === 'hats' ? HATS : set === 'close' ? CLOSE : MAIN;
const GAP = 0.42;
const W = 2400;

function Who({ p, i, yaw }: { p: P; i: number; yaw: number }) {
  const clip = useRef<Clip>('idle');
  const x = (i - (people.length - 1) / 2) * GAP;
  return p.kid ? (
    <group position={[x, 0.49, 0]} rotation={[0, yaw, 0]}>
      <group scale={0.68}><Person look={p.look} clipRef={clip} headScale={1.22} /></group>
    </group>
  ) : (
    <group position={[x, 0, 0]} rotation={[0, yaw, 0]}><Person look={p.look} clipRef={clip} /></group>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#fff8ec', '#6b5a3a', 1.2]} />
      <directionalLight position={[3, 6, 5]} intensity={2.2} />
    </>
  );
}

function Row({ yaw, game }: { yaw: number; game?: boolean }) {
  const w = people.length * GAP;
  const h = set === 'close' ? 520 : 300;
  return (
    <div className="row" style={{ width: W, height: game ? 420 : h }}>
      {game ? (
        <Canvas frameloop="demand" dpr={1} camera={{ position: [3.0, 4.0, 3.0], fov: 35 }} onCreated={({ camera }) => camera.lookAt(0, 1, 0)} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <Lights />
          {people.map((p, i) => <Who key={i} p={p} i={i} yaw={Math.PI / 4} />)}
        </Canvas>
      ) : (
        <Canvas frameloop="demand" dpr={1} orthographic camera={{ position: [0, 1.6, 5], zoom: W / w, near: 0.1, far: 20 }} onCreated={({ camera }) => camera.lookAt(0, set === 'close' ? 1.57 : 1.6, 0)} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <Lights />
          {people.map((p, i) => <Who key={i} p={p} i={i} yaw={yaw} />)}
        </Canvas>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <>
    <Row yaw={0} />
    <Row yaw={0.65} />
    <Row yaw={Math.PI / 2} />
    {set === 'main' && <Row yaw={0} game />}
  </>,
);
