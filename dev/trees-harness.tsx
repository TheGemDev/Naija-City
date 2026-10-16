// TEMP harness (delete after): ?mode=city&city=kaduna&night=1&low=1&x=..&z=.. | ?mode=species | ?mode=place&m=park
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { WebGLRenderer, type Object3D } from 'three';
import { useGame } from '../src/game/store';
import { useTour } from '../src/game/tour';
import { useQuality } from '../src/game/quality';
import { holdDaylight } from '../src/game/theme';
import { pinWeather, type WeatherKind } from '../src/game/weather';
import { avatar } from '../src/game/avatar';
import { Scene } from '../src/three/Scene';
import { CityTree, PlaceModel } from '../src/three/cityModels';
import { cityMap } from '../src/game/city';
(window as unknown as { __cm: unknown }).__cm = cityMap; (window as unknown as { __maps: unknown }).__maps = Object.fromEntries(['kaduna', 'abuja', 'lagos', 'kano'].map((c) => { const m = cityMap(c); return [c, { w: m.w, h: m.h, trees: m.trees.length, nearWater: m.trees.filter((t) => [[2,0],[-2,0],[0,2],[0,-2]].some(([a,b]) => m.isWater(t.x+a, t.z+b))).length }]; }));

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'city';
if (q.get('low') === '1') useQuality.setState({ quality: 'low' });
else useQuality.setState({ quality: 'high' });

// Every frame's numbers, for the driver to read.
const w = window as unknown as { __stats: Record<string, number>; __frames: number };
w.__frames = 0;
// three assigns render in the constructor: catch that assignment and wrap it.
Object.defineProperty(WebGLRenderer.prototype, 'render', {
  configurable: true,
  set(this: WebGLRenderer, fn: (s: Object3D, c: unknown) => void) {
    const gl = this;
    Object.defineProperty(this, 'render', { configurable: true, writable: true, value(scene: Object3D, camera: unknown) {
      fn.call(gl, scene, camera);
      if ((scene as { isScene?: boolean }).isScene && gl.getRenderTarget() === null) {
        let objects = 0, meshes = 0;
        scene.traverse((o) => { objects++; if ((o as { isMesh?: boolean }).isMesh && o.visible) meshes++; });
        w.__stats = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, objects, visibleMeshes: meshes };
        w.__frames++;
      }
    } });
  },
});
// Labels off: the shots are of the ground.
const st = document.createElement('style');
st.textContent = q.get('labels') === '1' ? '' : '#root canvas ~ div, .place-label, .river-name, .region-map-stack { display: none !important; }';
document.head.appendChild(st);

function Gallery({ children, dist = 6, y = 0.8 }: { children: React.ReactNode; dist?: number; y?: number }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, y + dist * 0.55, dist);
    camera.lookAt(0, y, 0);
  }, [camera, dist, y]);
  return (
    <>
      <hemisphereLight args={['#fff8ec', '#6b5a3a', 1.2]} />
      <directionalLight position={[8, 14, 10]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#a9c46a" /></mesh>
      {children}
    </>
  );
}

function Species() {
  return (
    <Gallery dist={Number(q.get('dist') ?? 7)} y={1}>
      {[-3, -1.5, 0, 1.5, 3].map((x, i) => <CityTree key={i} p={[x, 0, 0]} s={0.55 + i * 0.03} c={i % 3 ? '#3f7d2a' : '#b88b49'} />)}
    </Gallery>
  );
}

function Place() {
  const m = q.get('m') ?? 'park';
  const W = Number(q.get('w') ?? 8), D = Number(q.get('d') ?? 6);
  return (
    <Gallery dist={Number(q.get('dist') ?? 9)} y={0}>
      <PlaceModel model={m} w={W} d={D} />
    </Gallery>
  );
}

const root = createRoot(document.getElementById('root')!);
if (mode === 'city') {
  const city = q.get('city') ?? 'kaduna';
  const night = q.get('night') === '1';
  pinWeather((q.get('weather') as WeatherKind) ?? 'clear');
  if (q.get('notrees') === '1') cityMap(city).trees.splice(0);
  const x = q.get('x'), z = q.get('z');
  if (x && z) { avatar.x = Number(x); avatar.z = Number(z); }
  useGame.setState({ view: 'city', destinationId: city, minutes: night ? 22 * 60 : 12 * 60 });
  if (!(x && z)) { useTour.setState({ city: city as never }); if (!night) holdDaylight(true); }
  root.render(<Scene />);
} else {
  root.render(
    <Canvas shadows camera={{ fov: 40, near: 0.1, far: 200 }} gl={{ preserveDrawingBuffer: true }} style={{ background: '#bfe0f5' }}>
      {mode === 'species' ? <Species /> : <Place />}
    </Canvas>,
  );
}
