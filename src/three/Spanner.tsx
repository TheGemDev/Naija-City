import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace, type Sprite } from 'three';

/** How high the badge hangs over the floor. */
const HEIGHT = 2.1;

let badge: CanvasTexture | null = null;
/** An amber disc with a spanner on it, drawn once and shared by every spoilt item. */
function badgeTexture() {
  if (badge) return badge;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fillStyle = '#f59e0b';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#fff';
  g.stroke();
  g.font = '62px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🔧', 64, 69);
  badge = new CanvasTexture(canvas);
  badge.colorSpace = SRGBColorSpace;
  return badge;
}

/**
 * The spanner that bobs over a spoilt appliance (game/breakdowns.ts). It sits inside the item's own group,
 * so tapping it is tapping the item.
 */
export function Spanner() {
  const ref = useRef<Sprite>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = HEIGHT + Math.sin(clock.elapsedTime * 4) * 0.08;
  });
  return (
    <sprite ref={ref} position={[0, HEIGHT, 0]} scale={1.1} renderOrder={10}>
      <spriteMaterial map={badgeTexture()} depthTest={false} toneMapped={false} />
    </sprite>
  );
}
