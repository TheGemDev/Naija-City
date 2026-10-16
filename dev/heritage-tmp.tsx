// TEMPORARY dev page for the heritage place models: delete when done.
// ?m=museum:4x3,lugard:6x5  (place models; prefix L for landmarks: Lkofar:1x4)  &cam=map|close|top|side  &night &low &dist=16
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect } from 'react';
import { PlaceModel, LandmarkModel, lampMat, windowMat } from '../src/three/cityModels';
import { StaticBatch } from '../src/three/StaticBatch';
import { useQuality } from '../src/game/quality';

const q = new URLSearchParams(location.search);
const night = q.has('night');
const cam = q.get('cam') ?? 'map';
if (q.has('low')) useQuality.setState({ quality: 'low' } as never);
const items = (q.get('m') ?? 'home:4x4').split(',').map((s) => {
  const [name, size, at] = s.split(':');
  const [w, d] = size.split('x').map(Number);
  const [x, z] = (at ?? '0_0').split('_').map(Number);
  const land = name.startsWith('L');
  return { model: land ? name.slice(1) : name, land, w, d, x, z };
});
document.getElementById('lbl')!.textContent = `${q.get('m')} ${cam}${night ? ' night' : ''}${q.has('low') ? ' low' : ''}`;

function Info() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    lampMat.emissiveIntensity = night ? 2.5 : 0;
    windowMat.emissiveIntensity = night ? 0.9 : 0;
  });
  useEffect(() => {
    (window as never as Record<string, unknown>).__measure = () => {
      let meshes = 0, tris = 0, hidden = 0, htris = 0;
      scene.traverse((o) => {
        const m = o as unknown as { isMesh?: boolean; visible: boolean; geometry: { index: { count: number } | null; attributes: { position: { count: number } } } };
        if (!m.isMesh) return;
        const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        if (m.visible) { meshes++; tris += t; } else { hidden++; htris += t; }
      });
      gl.info.autoReset = false; gl.info.reset(); gl.render(scene, camera);
      const r = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
      gl.info.autoReset = true;
      return { ...r, meshes, tris, hidden, htris };
    };
  }, [gl, scene, camera]);
  return null;
}

const D = Number(q.get('dist') ?? 16);
const tgt: [number, number, number] = [Number(q.get('tx') ?? 0), 0.4, Number(q.get('tz') ?? 0)];
const pos: [number, number, number] = cam === 'close' ? [tgt[0] + D * 0.45, D * 0.5, tgt[2] + D * 0.75] : cam === 'top' ? [tgt[0], D, tgt[2] + 0.01] : cam === 'side' ? [tgt[0] + D * 0.9, D * 0.2, tgt[2] + D * 0.3]
  : [tgt[0], D * Math.cos(0.42), tgt[2] + D * Math.sin(0.42)];
function App() {
  return (
    <Canvas shadows camera={{ position: pos, fov: 35 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[night ? '#0b1020' : '#cfe3ef']} />
      <hemisphereLight args={['#fff8ec', '#6b5a3a', night ? 0.18 : 1.25]} />
      <directionalLight position={[10, 15, 8]} intensity={night ? 0.15 : 2.35} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#a9c46a" /></mesh>
      <StaticBatch>
        {items.map((it, i) => (
          <group key={i} position={[it.x, 0, it.z]}>
            {it.land ? <LandmarkModel model={it.model} w={it.w} d={it.d} /> : <PlaceModel model={it.model} w={it.w} d={it.d} />}
            {q.has('outline') && <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}><planeGeometry args={[it.w, it.d]} /><meshBasicMaterial color="#f0f" wireframe /></mesh>}
          </group>
        ))}
      </StaticBatch>
      <Info />
      <OrbitControls target={tgt} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
