// TEMP harness (delete after): renders the real estate scene with a fixed camera. ?slot=3&night=1&low=1&dist=6
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { useGame } from '../src/game/store';
import { useQuality } from '../src/game/quality';
import { slotOrigin, PLOT } from '../src/game/estate';
import { Estate } from '../src/three/Estate';
import { lampMat, windowMat, windowsLit } from '../src/three/cityModels';

const q = new URLSearchParams(location.search);
const night = q.get('night') === '1';
const slot = Number(q.get('slot') ?? 3);
const dist = Number(q.get('dist') ?? 6.5);
if (q.get('low') === '1') useQuality.setState({ quality: 'low' });
const mk = (id: string, slot: number, design: string | null, plot: 'half' | 'full' | 'double', stage = 4, extra = {}) => ({ id, region: 'gwarinpa', plot, design, stage, building: stage < 4 && stage > 0 ? { contractor: 'standard', startedAt: 0, doneAt: 1e12 } : null, constructionPlan: null, stock: {}, boughtAt: 0, spent: 1, rented: false, rentFrom: 0, slot, items: [], ...extra });
useGame.setState({
  started: true, estateId: 'gwarinpa', estateNo: 0, view: 'estate', minutes: night ? 22 * 60 : 13 * 60,
  properties: [mk('h1', 3, 'mansion', 'double'), mk('h2', 4, 'duplex', 'full'), mk('h3', 5, 'bungalow', 'full'), mk('h4', 6, 'flats', 'double'), mk('h5', 7, 'selfcon', 'half'),
    mk('h8', 11, 'duplex', 'full', 2), mk('h9', 12, null, 'full', 0), mk('h10', 13, 'mansion', 'double', 3), mk('h11', 14, 'bungalow', 'half'), mk('h12', 2, 'selfcon', 'full'), mk('h13', 10, 'flats', 'full', 1)] as never,
  housePaint: { h1: { outer: 'sky' }, h2: { outer: 'terracotta' }, h4: { outer: 'cream' } },
});
if (q.get('custom') === '1') useGame.setState((s) => ({
  housePaint: { ...s.housePaint, h3: { outer: 'blush' }, h5: { outer: 'sage' } },
  properties: s.properties.map((p) => ({
    h1: { exterior: { fence: 'railing', gate: 'ornate', roofColour: 'green', paving: 'checker', carport: 'tensile', carportColour: 'red' } },
    h2: { exterior: { fence: 'stone', gate: 'sliding', roof: 'flat', items: ['tank', 'genhouse', 'carport', 'pool', 'palm', 'lawn'] }, extensions: ['bq', 'balcony', 'terrace'] },
    h3: { exterior: { fence: 'hedge', roof: 'gable', roofFinish: 'tile', roofColour: 'terracotta', items: ['mango', 'gazebo', 'grill', 'tank', 'garden'] }, extensions: ['floor2', 'balcony'] },
    h5: { exterior: { fence: 'block', fenceColour: 'white', roof: 'hipped', roofColour: 'blue', items: ['tank', 'bar', 'palm'] }, extensions: ['bq'] },
  } as Record<string, object>)[p.id] ? { ...p, ...({ h1: { exterior: { fence: 'railing', gate: 'ornate', roofColour: 'green', paving: 'checker', carport: 'tensile', carportColour: 'red' } }, h2: { exterior: { fence: 'stone', gate: 'sliding', roof: 'flat', items: ['tank', 'genhouse', 'carport', 'pool', 'palm', 'lawn'] }, extensions: ['bq', 'balcony', 'terrace'] }, h3: { exterior: { fence: 'hedge', roof: 'gable', roofFinish: 'tile', roofColour: 'terracotta', items: ['mango', 'gazebo', 'grill', 'tank', 'garden'] }, extensions: ['floor2', 'balcony'] }, h5: { exterior: { fence: 'block', fenceColour: 'white', roof: 'hipped', roofColour: 'blue', items: ['tank', 'bar', 'palm'] }, extensions: ['bq'] } } as Record<string, object>)[p.id] } : p) as never,
}));

function Cam() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const o = slotOrigin(slot);
    const c = { x: o.x + PLOT / 2, z: o.z + PLOT / 2 };
    camera.position.set(c.x + dist * 0.55, dist * 0.75, c.z + dist * 0.95);
    camera.lookAt(c.x, 0.6, c.z);
  }, [camera]);
  useFrame(() => {
    if (night) { windowMat.emissiveIntensity = 0.9; lampMat.emissiveIntensity = 2.5; windowsLit.value = 0.8; }
  });
  return null;
}

createRoot(document.getElementById('root')!).render(
  <Canvas shadows camera={{ fov: 40, near: 0.1, far: 200 }} gl={{ preserveDrawingBuffer: true }} style={{ background: night ? '#0b1730' : '#bfe0f5' }}>
    <ambientLight intensity={night ? 0.25 : 0.9} />
    <hemisphereLight args={[night ? '#3a4a7a' : '#ffffff', night ? '#101418' : '#8a9a6a', night ? 0.35 : 0.9]} />
    <directionalLight position={[12, 20, 8]} intensity={night ? 0.15 : 2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
    <Cam />
    <Estate />
  </Canvas>,
);
