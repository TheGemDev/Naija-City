const q = new URLSearchParams(location.search);
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
import { Kit, KitModel } from '../src/three/placeKit';
import { plantTree, setTreeDust, treeGeometry } from '../src/three/trees';
(window as unknown as { __tg: unknown }).__tg = treeGeometry;
if (q.get('dust')) setTreeDust(Number(q.get('dust')));
import { cityMap } from '../src/game/city';
(window as unknown as { __cm: unknown }).__cm = cityMap; (window as unknown as { __maps: unknown }).__maps = Object.fromEntries(['kaduna', 'abuja', 'lagos', 'kano'].map((c) => { const m = cityMap(c); return [c, { w: m.w, h: m.h, trees: m.trees.length, nearWater: m.trees.filter((t) => [[2,0],[-2,0],[0,2],[0,-2]].some(([a,b]) => m.isWater(t.x+a, t.z+b))).length }]; }));

const mode = q.get('mode') ?? 'city';
if (q.get('month')) { const real = Date.now.bind(Date); const off = Date.UTC(2027, Number(q.get('month')), 10) - real(); Date.now = () => real() + off; }
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
    if (q.get('top') === '1') camera.position.set(0, y + dist * 0.92, dist * 0.38);
    else camera.position.set(0, y + dist * 0.55, dist);
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

const KINDS = ['neem', 'mango', 'coconut', 'oilpalm', 'baobab', 'flame', 'acacia', 'shrub'] as const;
function Species() {
  const only = q.get('kind');
  const kinds = only ? only.split(',') : KINDS;
  const gap = Number(q.get('gap') ?? 2.6);
  const shrubs = q.get('shrubs') === '1';
  return (
    <Gallery dist={Number(q.get('dist') ?? 11)} y={Number(q.get('y') ?? 1.2)}>
      {shrubs
        ? [0, 1, 2, 3, 4].map((pi) => <KitModel key={pi} deps={[pi]} build={(low) => { const k = new Kit(); plantTree(k, 'shrub', (pi - 2) * 0.9, 0, 2.2, { low, palette: pi }); return { parts: k.build() }; }} />)
        : kinds.map((k, i) => (
          <group key={k}>
            <CityTree p={[(i - (kinds.length - 1) / 2) * gap, 0, 0]} s={0.6} kind={k as never} seed={Number(q.get('seed') ?? 0)} />
          </group>
        ))}
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
