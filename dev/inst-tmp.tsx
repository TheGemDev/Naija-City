// TEMPORARY dev page for the institutions/transport/industry rework: delete when done.
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect } from 'react';
import { PlaceModel, LandmarkModel, lampMat, windowMat } from '../src/three/cityModels';
import { StaticBatch } from '../src/three/StaticBatch';
import { useQuality } from '../src/game/quality';
import * as NEW from '../src/three/places/institutions';

const q = new URLSearchParams(location.search);
const model = q.get('m') ?? 'school';
const w = Number(q.get('w') ?? 7), d = Number(q.get('d') ?? 4);
const night = q.has('night');
const cam = q.get('cam') ?? 'map';
const land = q.has('land');
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
    (window as never as Record<string, unknown>).__measure = () => {
      let meshes = 0, tris = 0;
      scene.getObjectByName('model')!.traverse((o) => {
        const m = o as unknown as { isMesh?: boolean; geometry: { index: { count: number } | null; attributes: { position: { count: number } } } };
        if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }
      });
      gl.info.autoReset = false; gl.info.reset(); gl.render(scene, camera);
      const r = { calls: gl.info.render.calls, rendered: gl.info.render.triangles };
      gl.info.autoReset = true;
      return { meshes, tris, ...r };
    };
  }, [gl, scene, camera]);
  return null;
}

const span = Math.max(w, d);
const pos: [number, number, number] = cam === 'close' ? [span * 0.55, span * 0.45, span * 0.85]
  : cam === 'close2' ? [-span * 0.6, span * 0.35, span * 0.7]
  : cam === 'back' ? [span * 0.3, span * 0.5, -span * 0.9]
  : cam === 'top' ? [0, span * 2, 0.01]
  : [0, span * 1.75 + 4, (span * 1.75 + 4) * 0.38];
function App() {
  const name = model === 'nda' ? 'Nda' : model === 'compvillage' ? 'CompVillage' : model === 'techhub' ? 'TechHub' : model === 'motorpark' ? 'MotorPark' : model[0].toUpperCase() + model.slice(1);
  const N = (NEW as Record<string, unknown>)[name] as ((p: { w: number; d: number }) => JSX.Element) | undefined;
  const M = q.has('old') || !N ? (land ? LandmarkModel : PlaceModel) : ({ w, d }: { model: string; w: number; d: number }) => N({ w, d });
  return (
    <Canvas shadows camera={{ position: pos, fov: 35 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[night ? '#0b1020' : '#cfe3ef']} />
      <hemisphereLight args={['#fff8ec', '#6b5a3a', night ? 0.18 : 1.25]} />
      <directionalLight position={[10, 15, 8]} intensity={night ? 0.15 : 2.35} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#b9a27a" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.005, d / 2 + 0.6]}><planeGeometry args={[60, 1.2]} /><meshStandardMaterial color="#4b5057" /></mesh>
      <group position={[-8, 0, -8]}><StaticBatch><group position={[8, 0, 8]} name="model"><M model={model} w={w} d={d} /></group></StaticBatch></group>
      <Info />
      <OrbitControls target={[0, cam === 'map' || cam === 'top' ? 0 : 0.6, 0]} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
