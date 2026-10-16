// TEMPORARY dev page for the commerce place redesign: delete when done.
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { PlaceModel, LandmarkModel, lampMat, windowMat } from '../src/three/cityModels';
import { StaticBatch } from '../src/three/StaticBatch';
import { useQuality } from '../src/game/quality';

const q = new URLSearchParams(location.search);
const model = q.get('m') ?? 'market';
const w = Number(q.get('w') ?? 6), d = Number(q.get('d') ?? 5);
const night = q.has('night');
const cam = q.get('cam') ?? 'map';
const LANDMARKS = ['golf', 'tradefair', 'glorydome', 'beach'];
if (q.has('low')) useQuality.setState({ quality: 'low' } as never);

function Info() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    lampMat.emissiveIntensity = night ? 2.5 : 0;
    windowMat.emissiveIntensity = night ? 0.9 : 0;
  });
  useEffect(() => {
    camera.lookAt(0, 0.4, 0);
    (window as never as Record<string, unknown>).__measure = () => {
      let meshes = 0, tris = 0;
      scene.traverse((o) => {
        const m = o as unknown as { isMesh?: boolean; visible: boolean; userData: { ground?: boolean }; geometry: { index: { count: number } | null; attributes: { position: { count: number } } } };
        if (m.isMesh && m.visible && !m.userData.ground) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }
      });
      return { meshes, tris };
    };
  }, [gl, scene, camera]);
  return null;
}

const span = Math.max(w, d * 1.3);
const dist = Math.max(14, span * 2.4);
const n = Math.hypot(1, 0.38);
const pos: [number, number, number] = cam === 'close' ? [span * 0.6, span * 0.5 + 0.8, span * 0.95] : cam === 'back' ? [-span * 0.6, span * 0.5, -span * 0.8] : [0, dist / n, (dist * 0.38) / n];
function App() {
  return (
    <Canvas shadows camera={{ position: pos, fov: 35 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[night ? '#0b1020' : '#cfe3ef']} />
      <hemisphereLight args={['#fff8ec', '#6b5a3a', night ? 0.18 : 1.25]} />
      <directionalLight position={[10, 15, 8]} intensity={night ? 0.15 : 2.35} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow userData={{ ground: true }}><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#c9a46a" /></mesh>
      {/* the road in front of the door, for scale */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0, d / 2 + 1]} userData={{ ground: true }}><planeGeometry args={[w + 6, 2]} /><meshStandardMaterial color="#555" /></mesh>
      <group position={[-8, 0, -8]}><StaticBatch><group position={[8, 0, 8]}>
        {LANDMARKS.includes(model) ? <LandmarkModel model={model} w={w} d={d} /> : <PlaceModel model={model} w={w} d={d} />}
      </group></StaticBatch></group>
      <Info />
    </Canvas>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
