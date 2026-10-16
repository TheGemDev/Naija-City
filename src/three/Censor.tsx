// The Sims-style bath blur: a soft-edged mosaic of blue pixels over a bathing body, always turned to the camera and
// shimmering a little (game/bathing.ts). One small canvas texture, redrawn a few times a second.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { CanvasTexture, NearestFilter, type Mesh } from 'three';

const CELLS_X = 6;
const CELLS_Y = 9;
const BLUES = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#38bdf8', '#0ea5e9', '#7dd3fc'];

/** Draws the mosaic: random blues, fading out towards the edges so it reads as a blur, not a box. */
function paint(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, CELLS_X, CELLS_Y);
  for (let y = 0; y < CELLS_Y; y++) {
    for (let x = 0; x < CELLS_X; x++) {
      const ex = Math.min(x + 0.5, CELLS_X - x - 0.5) / (CELLS_X / 2);
      const ey = Math.min(y + 0.5, CELLS_Y - y - 0.5) / (CELLS_Y / 2);
      const edge = Math.min(ex, ey);
      ctx.globalAlpha = Math.min(1, 0.35 + edge * 1.6) * (0.85 + Math.random() * 0.15);
      ctx.fillStyle = BLUES[Math.floor(Math.random() * BLUES.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

/** `height`: where the middle of the body is; `w` × `h`: how much it covers. */
export function Censor({ height = 0.86, w = 0.52, h = 0.84 }: { height?: number; w?: number; h?: number }) {
  const { tex, ctx } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CELLS_X;
    c.height = CELLS_Y;
    const ctx = c.getContext('2d')!;
    paint(ctx);
    const tex = new CanvasTexture(c);
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    return { tex, ctx };
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const last = useRef(0);
  const mesh = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.16) return;
    last.current = clock.elapsedTime;
    paint(ctx);
    tex.needsUpdate = true;
  });
  return (
    <Billboard position={[0, height, 0]}>
      <mesh ref={mesh} renderOrder={5} raycast={() => null}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}
