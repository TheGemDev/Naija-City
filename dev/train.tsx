// Dev-only train harness. ?view=ride (default) | station (the map model) | hall (the station interior) | desk (ticket UI)
// ride: ?p=0.5 frozen or live, ?cls=business, ?from=abuja&to=kaduna, ?low=1, ?zoom=, ?az=, ?tz=
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PCFSoftShadowMap } from 'three';
import { useGame } from '../src/game/store';
import { useQuality } from '../src/game/quality';
import { TrainRide } from '../src/three/TrainRide';
import { TrainStation } from '../src/three/StationModel';
import { Interior } from '../src/three/Interior';
import { TrainDesk } from '../src/ui/TrainDesk';
import { FlightDesk } from '../src/ui/Airport';
import '../src/styles.css';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'ride';
const frozen = q.get('p');
const low = q.get('low') === '1';
const from = q.get('from') ?? 'abuja';
const to = q.get('to') ?? 'kaduna';
const cls = q.get('cls') === 'business' ? '_biz' : '';
const TOTAL = Number(q.get('min') ?? 32);
let seed = 4242;
Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
useQuality.setState({ quality: low ? 'low' : 'high' });
const w = window as unknown as Record<string, any>;
w.__frames = [] as any[];
w.__start = performance.now();
const setR = (R: number) => useGame.setState({ destinationId: from, task: { itemId: null, placeId: 'station', actionId: `train_${to}${cls}`, label: 'Train', icon: '🚆', phase: 'doing', remaining: R, total: TOTAL, flight: 'train' } as never });
if (view === 'ride') setR(frozen ? TOTAL * (1 - Number(frozen)) : TOTAL);
if (view === 'hall' || view === 'desk') useGame.setState({ destinationId: from, view: 'place', insideId: q.get('inside') ?? 'station', task: null, money: 500_000 } as never);
if (view === 'desk') useGame.setState({ flightDesk: true, fares: { air: Number(q.get('air') ?? 30), rail: Number(q.get('rail') ?? 50), funded: q.get('dry') !== '1' } } as never);
let lastTick = -1;

function Render() {
  const { gl, scene, camera } = useThree();
  w.__scene = scene; w.__gl = gl;
  useFrame(() => {
    const t0 = performance.now();
    gl.render(scene, camera);
    const t = useGame.getState().task;
    const rec = { at: t0, rnd: performance.now() - t0, calls: gl.info.render.calls, tris: gl.info.render.triangles, p: t && t.total ? 1 - t.remaining / t.total : 0 };
    w.__frames.push(rec);
    if (w.__frames.length % 15 === 0) document.getElementById('hud')!.textContent = `${view} p ${rec.p.toFixed(3)} calls ${rec.calls} tris ${rec.tris} rnd ${rec.rnd.toFixed(2)}`;
  }, 1);
  return null;
}

const zoom = Number(q.get('zoom') ?? 1);
const az = Number(q.get('az') ?? 0);
const target: [number, number, number] = view === 'station' ? [0, 0.4, 0] : view === 'hall' ? [7, 0.5, 2] : [0, 0.8, Number(q.get('tz') ?? 0)];
const d = (view === 'station' ? 12 : view === 'hall' ? 24 : 22) * zoom / Math.hypot(1, 1.15, 1);
const camPos: [number, number, number] = [target[0] + d * Math.SQRT2 * Math.sin(Math.PI / 4 + az), target[1] + 1.15 * d, target[2] + d * Math.SQRT2 * Math.cos(Math.PI / 4 + az)];

function Driver() {
  useFrame(() => {
    if (view === 'ride' && !frozen) {
      const el = (performance.now() - w.__start) / 1000;
      if (lastTick < 0 || el - lastTick >= 0.1) { lastTick = el; setR(Math.max(0, TOTAL - el)); }
    }
  }, -1000);
  return null;
}

createRoot(document.getElementById('root')!).render(
  view === 'desk' ? null : (
  <Canvas shadows={low ? false : { type: PCFSoftShadowMap }} dpr={low ? 0.75 : Math.min(2, devicePixelRatio)} gl={{ antialias: !low }}
    camera={{ position: camPos, fov: 35, near: 0.1, far: 500 }}
    onCreated={({ camera }) => camera.lookAt(...target)}>
    <color attach="background" args={['#bfe3f5']} />
    <hemisphereLight args={['#fff8ec', '#6b5a3a', 1]} />
    <directionalLight position={[20, 24, 10]} intensity={2.2} castShadow={!low} shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} />
    <Driver />
    <Render />
    {view === 'ride' && <TrainRide />}
    {view === 'station' && (
      <>
        <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow><planeGeometry args={[30, 30]} /><meshStandardMaterial color="#c9b98f" /></mesh>
        <TrainStation w={Number(q.get('w') ?? 6)} d={Number(q.get('d') ?? 5)} />
      </>
    )}
    {view === 'hall' && <Interior />}
  </Canvas>),
);
if (view === 'desk') {
  createRoot(document.getElementById('ui')!).render(<div className="app">{q.get('inside') === 'airport' ? <FlightDesk /> : <TrainDesk />}</div>);
}

w.__rep = () => {
  const F = w.__frames.slice(-60);
  const avg = (k: string) => F.reduce((a: number, f: any) => a + f[k], 0) / F.length;
  return `calls ${avg('calls').toFixed(0)} tris ${(avg('tris') / 1e6).toFixed(3)}M rnd ${avg('rnd').toFixed(2)}ms`;
};
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => { throw new Error('harness: reload skipped'); });
  import.meta.hot.on('vite:beforeUpdate', () => { throw new Error('harness: update skipped'); });
}
