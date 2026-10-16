// TEMPORARY dev page for the stadium redesign: delete when done.
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect } from 'react';
import { PlaceModel, lampMat, windowMat } from '../src/three/cityModels';
import { StaticBatch } from '../src/three/StaticBatch';
import { useQuality } from '../src/game/quality';

const q = new URLSearchParams(location.search);
const w = Number(q.get('w') ?? 8), d = Number(q.get('d') ?? 7);
const night = q.has('night');
const cam = q.get('cam') ?? 'map';
if (q.has('low')) useQuality.setState({ quality: 'low' } as never);

function Info() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    lampMat.emissiveIntensity = night ? 2.5 : 0;
    windowMat.emissiveIntensity = night ? 0.9 : 0;
  });
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    (window as never as Record<string, unknown>).__measure = () => {
      gl.info.autoReset = false; gl.info.reset(); gl.render(scene, camera);
      const r = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
      gl.info.autoReset = true;
      let meshes = 0, tris = 0; scene.traverse((o) => { const m = o as unknown as { isMesh?: boolean; visible: boolean; geometry: { index: { count: number } | null; attributes: { position: { count: number } } } }; if (m.isMesh && m.visible) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
      return { ...r, meshes, tris };
    };
    const t = setTimeout(() => {
      gl.info.autoReset = false;
      gl.info.reset();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        (window as never as Record<string, unknown>).__info = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
        let meshes = 0; scene.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh && o.visible) meshes++; });
        (window as never as Record<string, unknown>).__meshes = meshes;
        gl.info.autoReset = true;
      }));
    }, 1500);
    return () => clearTimeout(t);
  }, [gl, scene, camera]);
  return null;
}

const pos: [number, number, number] = cam === 'close' ? [5, 4, 8] : cam === 'top' ? [0, 16, 0.01] : [0, 14, 12];
function App() {
  return (
    <Canvas shadows camera={{ position: pos, fov: 40 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[night ? '#0b1020' : '#cfe3ef']} />
      <hemisphereLight args={['#fff8ec', '#6b5a3a', night ? 0.18 : 1.25]} />
      <directionalLight position={[10, 15, 8]} intensity={night ? 0.15 : 2.35} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      {!q.has('noground') && <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#c9a46a" /></mesh>}
      <group position={[-8, 0, -8]}><StaticBatch><group position={[8, 0, 8]}><PlaceModel model="stadium" w={w} d={d} /></group></StaticBatch></group>
      <Info />
      <OrbitControls target={[0, 0.5, 0]} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
