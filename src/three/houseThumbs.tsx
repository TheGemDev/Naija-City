// House pictures for the House app, the going-home picker and anywhere a home is listed: the real house model
// (houseKit.tsx, the same one on the estate and the map) drawn once into one shared offscreen canvas and kept as an
// image, so a list of houses costs no WebGL context per card and nothing at all the second time it opens. Each
// picture is keyed by everything that changes the look (design, stage, paint, outside, extensions), so painting the
// house or adding a carport draws a fresh one and the rest stay cached.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, useThree, type ReconcilerRoot } from '@react-three/fiber';
import { Box3, Sphere, Vector3, type Group, type PerspectiveCamera } from 'three';
import { lampMat, windowMat } from './cityModels';
import { KitModel } from './placeKit';
import { drawHouse, HousePen, type HouseFrame, type HouseLook } from './houseKit';

const W = 360;
const H = 240;
const cache = new Map<string, string>();
const listeners = new Set<() => void>();
const queue: { key: string; look: HouseLook; frame: HouseFrame }[] = [];
let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
let busy = false;
let broken = false;

/** From the front-right and above, the way the estate camera looks at a house, a little higher to see over the wall. */
const VIEW = new Vector3(0.62, 0.95, 1.05).normalize();

function Shot({ look, frame, onDone }: { look: HouseLook; frame: HouseFrame; onDone: (url: string) => void }) {
  const ref = useRef<Group>(null!);
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    const sphere = new Box3().setFromObject(ref.current).getBoundingSphere(new Sphere());
    const cam = camera as PerspectiveCamera;
    const dist = sphere.radius / Math.sin(((cam.fov / 2) * Math.PI) / 180);
    cam.position.copy(sphere.center).addScaledVector(VIEW, dist * 0.82);
    cam.lookAt(sphere.center.x, sphere.center.y - sphere.radius * 0.08, sphere.center.z);
    cam.updateProjectionMatrix();
    // Always a daytime picture: the shared window and lamp materials are lit while the town is dark.
    const lit = [windowMat.emissiveIntensity, lampMat.emissiveIntensity];
    windowMat.emissiveIntensity = 0;
    lampMat.emissiveIntensity = 0;
    gl.render(scene, cam);
    [windowMat.emissiveIntensity, lampMat.emissiveIntensity] = lit;
    const webp = gl.domElement.toDataURL('image/webp', 0.86);
    onDone(webp.startsWith('data:image/webp') ? webp : gl.domElement.toDataURL('image/png'));
  }, []);
  return (
    <>
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#ffffff', '#9fb37a', 0.85]} />
      <directionalLight position={[4, 7, 5]} intensity={2.1} />
      <directionalLight position={[-5, 3, -2]} intensity={0.5} />
      <group ref={ref}>
        {/* A patch of grass the plot sits on, so the compound wall reads against something. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
          <planeGeometry args={[frame.w + 0.6, frame.d + 0.6]} />
          <meshStandardMaterial color="#8fb352" />
        </mesh>
        <KitModel
          deps={[]}
          build={(low) => {
            const k = new HousePen();
            drawHouse(k, look, frame, low);
            return k.done();
          }}
        />
      </group>
    </>
  );
}

async function pump() {
  if (busy || broken) return;
  busy = true;
  try {
    if (!root) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      root = createRoot(canvas);
      await root.configure({
        gl: { alpha: true, antialias: true, preserveDrawingBuffer: true },
        camera: { fov: 30, near: 0.05, far: 100 },
        size: { width: W, height: H, top: 0, left: 0 },
        dpr: 1,
        frameloop: 'never',
        flat: false,
      });
    }
    while (queue.length) {
      const job = queue.shift()!;
      if (cache.has(job.key)) continue;
      const url = await new Promise<string>((resolve) => root!.render(<Shot key={job.key} look={job.look} frame={job.frame} onDone={resolve} />));
      cache.set(job.key, url);
      listeners.forEach((l) => l());
    }
    // Nothing left to draw: unmount the scene so its geometry is freed (the canvas and context stay for next time).
    root.render(null);
  } catch (err) {
    console.warn('House pictures unavailable', err);
    broken = true;
  } finally {
    busy = false;
  }
}

/** The cache key for a look: everything that changes the picture. */
export const thumbKey = (look: HouseLook, frame: HouseFrame) => JSON.stringify([look, frame.w, frame.d, frame.house]);

/** Data-URL picture of a house, or null while it is being drawn (or where WebGL isn't available). */
export function useHouseThumb(look: HouseLook, frame: HouseFrame) {
  const key = thumbKey(look, frame);
  const [url, setUrl] = useState(() => cache.get(key) ?? null);
  useEffect(() => {
    const sync = () => setUrl(cache.get(key) ?? null);
    sync();
    if (cache.has(key)) return;
    listeners.add(sync);
    if (!queue.some((j) => j.key === key)) queue.push({ key, look, frame });
    void pump();
    return () => {
      listeners.delete(sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
