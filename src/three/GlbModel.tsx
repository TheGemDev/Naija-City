import { useGLTF } from '@react-three/drei';
import { ITEMS } from '../game/catalog';

/** A catalogue piece drawn from a .glb file (ITEM_MODELS in game/assets.ts). */
export default function GlbModel({ url, type }: { url: string; type: string }) {
  const { scene } = useGLTF(url);
  const def = ITEMS[type];
  return <primitive object={scene.clone()} scale={Math.min(def.w, def.d)} />;
}
