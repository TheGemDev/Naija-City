// Dev-only: ?view=probe (what lies along each station's track) | map (the real city around the station) | loco (close-up)
import { cityMap, placeYaw } from '../src/game/city';
import '../src/game/regions';

const q = new URLSearchParams(location.search);
const w = window as unknown as Record<string, any>;
if (q.get('view') === 'probe') {
  const out: string[] = [];
  for (const id of ['kaduna', 'abuja', 'lagos', 'kano']) {
    const m = cityMap(id);
    const st = m.places.find((p) => p.id === 'station')!;
    const yaw = placeYaw(st);
    const side = Math.abs(Math.sin(yaw)) > 0.5;
    const lw = side ? st.d : st.w, ld = side ? st.w : st.d;
    const cx = st.x + st.w / 2, cz = st.z + st.d / 2;
    // local (x, z) to world: rotate by yaw about y
    const toW = (x: number, z: number) => ({ x: cx + x * Math.cos(yaw) + z * Math.sin(yaw), z: cz - x * Math.sin(yaw) + z * Math.cos(yaw) });
    const near = -ld / 2 + 0.5;
    out.push(`${id}: station x${st.x} z${st.z} w${st.w} d${st.d} yaw ${yaw.toFixed(2)} local w${lw} d${ld} map ${m.w}x${m.h}`);
    for (const dir of [-1, 1]) {
      const row: string[] = [];
      for (let s = lw / 2; s <= lw / 2 + 24; s += 1) {
        const p = toW(dir * s, near);
        const hit = m.places.find((o) => o.id !== 'station' && p.x >= o.x - 0.3 && p.x <= o.x + o.w + 0.3 && p.z >= o.z - 0.3 && p.z <= o.z + o.d + 0.3);
        const lm = m.landmarks.find((o: any) => o.x !== undefined && p.x >= o.x - 0.3 && p.x <= o.x + (o.w ?? 1) + 0.3 && p.z >= o.z - 0.3 && p.z <= o.z + (o.d ?? 1) + 0.3);
        const c = !m.isLand(p.x, p.z) ? '~' : m.isWater(p.x, p.z) ? 'W' : m.isRoad(p.x, p.z) ? 'R' : hit ? 'P' : lm ? 'L' : '.';
        row.push(c + (hit && c === 'P' ? `(${hit.id})` : ''));
      }
      out.push(`  dir ${dir > 0 ? '+x' : '-x'} from plot edge: ${row.join(' ')}`);
    }
  }
  w.__probe = out.join('\n');
  document.getElementById('hud')!.textContent = w.__probe;
}

// ---------- Rendering views ----------
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PCFSoftShadowMap } from 'three';
import { setActiveMap } from '../src/game/city';
import { useGame } from '../src/game/store';
import { useQuality } from '../src/game/quality';
import { City } from '../src/three/City';
import { buildTrain, TrainBody } from '../src/three/trainKit';
import { lampMat, windowMat } from '../src/three/cityModels';
import { useMemo } from 'react';

const view = q.get('view') ?? 'map';
const city = q.get('city') ?? 'kaduna';
const low = q.get('low') === '1';
const night = q.get('night') === '1';
useQuality.setState({ quality: low ? 'low' : 'high' });
if (view === 'map') {
  setActiveMap(city);
  // Day at noon, or nine at night.
  useGame.setState({ destinationId: city, view: 'city', minutes: (night ? 21 : 12) * 60 } as never);
}
const st = cityMap(city).places.find((p) => p.id === 'station')!;
const target: [number, number, number] = view === 'map' ? [st.x + st.w / 2 + Number(q.get('dx') ?? 0), 0, st.z + st.d / 2 + Number(q.get('dz') ?? 0)] : [0, 1.2, 0];
const zoom = Number(q.get('zoom') ?? 1);
const az = Number(q.get('az') ?? 0);
const el = Number(q.get('el') ?? 1.15);
const dist = (view === 'map' ? 26 : 9) * zoom;
const camPos: [number, number, number] = [target[0] + dist * Math.sin(az), target[1] + dist * el, target[2] + dist * Math.cos(az)];

function Render() {
  const { gl, scene, camera } = useThree();
  w.__scene = scene;
  useFrame(() => {
    if (view === 'loco' && night) { lampMat.emissiveIntensity = 2.5; windowMat.emissiveIntensity = 0.9; }
    gl.render(scene, camera);
    w.__last = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
    document.getElementById('hud')!.textContent = `${view} ${city} calls ${gl.info.render.calls} tris ${gl.info.render.triangles}`;
  }, 1);
  return null;
}
function Loco() {
  const t = useMemo(() => buildTrain(1, { low, glow: true }), []);
  return <group position={[1.5, 0, 0]}><TrainBody train={t} /></group>;
}
if (view !== 'probe') {
  createRoot(document.getElementById('root')!).render(
    <Canvas shadows={low ? false : { type: PCFSoftShadowMap }} dpr={low ? 0.75 : 2} gl={{ antialias: !low }}
      camera={{ position: camPos, fov: 35, near: 0.1, far: 600 }} onCreated={({ camera }) => camera.lookAt(...target)}>
      <color attach="background" args={[night ? '#0b1430' : '#bfe3f5']} />
      <hemisphereLight args={[night ? '#5a6fae' : '#fff8ec', '#6b5a3a', night ? 0.35 : 1]} />
      <directionalLight position={[20, 30, 14]} intensity={night ? 0.25 : 2.2} castShadow={!low} shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
      <Render />
      {view === 'map' && <City />}
      {view === 'map' && q.get('outline') !== '0' && (
        <group userData={{ dynamic: true }}>
          {[[st.x + st.w / 2, st.z, st.w + 0.08, 0.06], [st.x + st.w / 2, st.z + st.d, st.w + 0.08, 0.06], [st.x, st.z + st.d / 2, 0.06, st.d], [st.x + st.w, st.z + st.d / 2, 0.06, st.d]].map(([x, z, sx, sz], i) => (
            <mesh key={i} position={[x, 2.6, z]}><boxGeometry args={[sx, 0.04, sz]} /><meshBasicMaterial color="#ff00aa" depthTest={false} /></mesh>
          ))}
        </group>
      )}
      {view === 'loco' && (
        <>
          <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[40, 40]} /><meshStandardMaterial color={night ? '#2a2620' : '#8a8178'} /></mesh>
          <Loco />
        </>
      )}
    </Canvas>,
  );
}
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => { throw new Error('harness: reload skipped'); });
  import.meta.hot.on('vite:beforeUpdate', () => { throw new Error('harness: update skipped'); });
}
