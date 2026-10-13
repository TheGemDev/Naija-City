// Catalogue thumbnails: renders each item's real 3D model once into a single offscreen
// canvas and caches it as an image, so shop cards show the model instead of an emoji
// without spinning up a WebGL context per card.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, useThree, type ReconcilerRoot } from '@react-three/fiber';
import { Box3, Sphere, Vector3, type Group, type PerspectiveCamera } from 'three';
import { ItemModel } from './models';

const SIZE = 256;
const cache = new Map<string, string>();
const listeners = new Set<() => void>();
const queue: string[] = [];
let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
let canvas: HTMLCanvasElement | null = null;
let busy = false;
let broken = false;

const VIEW = new Vector3(0.9, 0.75, 1.25).normalize();

function Shot({ type, onDone }: { type: string; onDone: (url: string) => void }) {
  const ref = useRef<Group>(null!);
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    const sphere = new Box3().setFromObject(ref.current).getBoundingSphere(new Sphere());
    const cam = camera as PerspectiveCamera;
    const dist = sphere.radius / Math.sin(((cam.fov / 2) * Math.PI) / 180);
    cam.position.copy(sphere.center).addScaledVector(VIEW, dist * 1.02);
    cam.lookAt(sphere.center);
    cam.updateProjectionMatrix();
    gl.render(scene, cam);
    onDone(gl.domElement.toDataURL('image/png'));
  }, [type]);
  return (
    <>
      <ambientLight intensity={1.4} />
      <hemisphereLight args={['#ffffff', '#c7b79b', 0.8]} />
      <directionalLight position={[3, 6, 4]} intensity={2.2} />
      <directionalLight position={[-4, 3, -2]} intensity={0.6} />
      <group ref={ref}>
        <ItemModel type={type} powered />
      </group>
    </>
  );
}

async function pump() {
  if (busy || broken) return;
  busy = true;
  try {
    if (!root) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      root = createRoot(canvas);
      await root.configure({
        gl: { alpha: true, antialias: true, preserveDrawingBuffer: true },
        camera: { fov: 28, near: 0.05, far: 100 },
        size: { width: SIZE, height: SIZE, top: 0, left: 0 },
        dpr: 1,
        frameloop: 'never',
        flat: false,
      });
    }
    while (queue.length) {
      const type = queue.shift()!;
      if (cache.has(type)) continue;
      const url = await new Promise<string>((resolve) => root!.render(<Shot key={type} type={type} onDone={resolve} />));
      cache.set(type, url);
      listeners.forEach((l) => l());
    }
  } catch (err) {
    console.warn('Item thumbnails unavailable', err);
    broken = true;
  } finally {
    busy = false;
  }
}

/** Data-URL snapshot of an item's 3D model, or null while it's being drawn. */
export function useItemThumb(type: string) {
  const [url, setUrl] = useState(() => cache.get(type) ?? null);
  useEffect(() => {
    const sync = () => setUrl(cache.get(type) ?? null);
    sync();
    if (cache.has(type)) return;
    listeners.add(sync);
    if (!queue.includes(type)) queue.push(type);
    void pump();
    return () => {
      listeners.delete(sync);
    };
  }, [type]);
  return url;
}

/** Shop/catalogue picture for an item: its rendered model, falling back to the emoji. */
export function ItemThumb({ type, icon, className = 'card-icon' }: { type: string; icon: string; className?: string }) {
  const url = useItemThumb(type);
  if (url) return <img className={`item-thumb ${className}`} src={url} alt="" draggable={false} />;
  return <span className={className}>{icon}</span>;
}
