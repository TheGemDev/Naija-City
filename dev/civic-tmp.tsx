// TEMPORARY dev page for the civic place models: delete when done.
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect } from 'react';
import { PlaceModel, LandmarkModel, lampMat, windowMat, windowsLit } from '../src/three/cityModels';
import { StaticBatch } from '../src/three/StaticBatch';
import { useQuality } from '../src/game/quality';

const LANDMARKS = new Set(['asorock', 'zumarock', 'citygate', 'supremecourt', 'cbn', 'nnpc', 'wtc', 'ecowas']);
const q = new URLSearchParams(location.search);
const model = q.get('m') ?? 'govhouse';
const w = Number(q.get('w') ?? 6), d = Number(q.get('d') ?? 4);
const night = q.has('night');
const cam = q.get('cam') ?? 'map';
const dist = Number(q.get('dist') ?? 16);
const yaw = Number(q.get('yaw') ?? 0);
if (q.has('low')) useQuality.setState({ quality: 'low' } as never);

function Info() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    lampMat.emissiveIntensity = night ? 2.5 : 0;
    windowMat.emissiveIntensity = night ? 0.9 : 0;
    windowsLit.value = Number(q.get('lit') ?? 0.55);
  });
  useEffect(() => {
    (window as never as Record<string, unknown>).__tris = () => {
      // The model's own meshes are the ones StaticBatch hid; the glow is the additive one.
      let meshes = 0, tris = 0, glow = 0;
      scene.traverse((o) => {
        const m = o as unknown as { isMesh?: boolean; visible: boolean; material: { blending?: number }; geometry: { index: { count: number } | null; attributes: { position: { count: number } } }; userData: Record<string, unknown> };
        if (!m.isMesh || m.userData.ground) return;
        const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        if (m.material.blending === 2) { glow += t; return; }
        if (m.visible) return;
        meshes++; tris += t;
      });
      return { meshes, tris, glow, calls: gl.info.render.calls };
    };
  }, [gl, scene]);
  return null;
}

const L = Math.hypot(0, 1, 0.38);
const pos: [number, number, number] = cam === 'close'
  ? [Math.sin(yaw) * dist * 0.75, dist * 0.45, Math.cos(yaw) * dist * 0.75]
  : [0, dist / L, (0.38 * dist) / L];
const target: [number, number, number] = [0, cam === 'close' ? Number(q.get('ty') ?? 1) : 0, 0];
function App() {
  const M = LANDMARKS.has(model) ? LandmarkModel : PlaceModel;
  return (
    <Canvas shadows camera={{ position: pos, fov: 35 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[night ? '#0b1020' : '#cfe3ef']} />
      <hemisphereLight args={['#fff8ec', '#6b5a3a', night ? 0.18 : 1.25]} />
      <directionalLight position={[10, 15, 8]} intensity={night ? 0.15 : 2.35} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow userData={{ ground: true }}><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#c9a46a" /></mesh>
      {/* the footprint outline, to check the model stays inside it */}
      {q.has('fp') && <mesh rotation-x={-Math.PI / 2} position-y={0.005} userData={{ ground: true }}><planeGeometry args={[w + 0.06, d + 0.06]} /><meshBasicMaterial color="#ef4444" /></mesh>}
      <group position={[-8, 0, -8]}><StaticBatch><group position={[8, 0, 8]}><M model={model} w={w} d={d} /></group></StaticBatch></group>
      <Info />
      <OrbitControls target={target} />
    </Canvas>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
