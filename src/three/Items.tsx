import { lazy, Suspense, useSyncExternalStore } from 'react';
import { Html } from '@react-three/drei';
import { ITEMS } from '../game/catalog';
import { ITEM_MODELS } from '../game/assets';
import { avatarCell } from '../game/avatar';
import { footprint, houseLayout, itemSize, itemTransform, placementError, type PlacedItem } from '../game/grid';

import { genHere, houseKeyOf, litHere, useGame } from '../game/store';
import { useVisit } from '../game/visits';
import { CAMERA } from '../game/security';
import { ItemModel, PaintProvider } from './models';
import { paintKey, paintMap } from '../game/paint';
import { StaticBatch } from './StaticBatch';
import { audio } from '../game/audio';
import { openRepair } from '../game/breakdowns';
import { Spanner } from './Spanner';
import { TvAd } from './TvAds';

// Only a piece swapped for a .glb file needs the model loader, so the loader stays out of the first download.
const GlbModel = lazy(() => import('./GlbModel'));

function Model({ type, powered, running, paint }: { type: string; powered: boolean; running: boolean; paint?: (string | null)[] }) {
  const url = ITEM_MODELS[type];
  if (url)
    return (
      <Suspense fallback={<ItemModel type={type} />}>
        <GlbModel url={url} type={type} />
      </Suspense>
    );
  return (
    <PaintProvider value={paintMap(type, paint)}>
      <StaticBatch key={`${type}|${powered}|${running}|${paintKey(paint)}`}>
        <ItemModel type={type} powered={powered} running={running} />
      </StaticBatch>
    </PaintProvider>
  );
}

/** The floor area a CCTV camera watches, so owners can aim it and burglars can see what to avoid. */
function CameraCone({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  return (
    <mesh position={[x, 0.035, z]} rotation={[-Math.PI / 2, 0, yaw]} raycast={() => null}>
      <circleGeometry args={[CAMERA.range, 24, -Math.PI / 2 - CAMERA.fov / 2, CAMERA.fov]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.18} depthWrite={false} />
    </mesh>
  );
}

function SpeakerLabel({ x, z }: { x: number; z: number }) {
  useSyncExternalStore(audio.subscribe, audio.getVersion);
  if (!audio.radioOn) return null;
  return (
    <Html position={[x, 1.6, z]} center zIndexRange={[5, 0]}>
      <div className="speaker-label">🔊</div>
    </Html>
  );
}

function Item({ item, powered, running, selected, readOnly }: { item: PlacedItem; powered: boolean; running: boolean; selected: boolean; readOnly: boolean }) {
  const { cx, cz, yaw } = itemTransform(item);
  const { w, d } = itemSize(item.type, item.rot);
  return (
    <group>
      <group
        position={[cx, 0, cz]}
        rotation={[0, yaw, 0]}
        onClick={(e) => {
          if (e.delta > 8) return;
          const s = useGame.getState();
          if (readOnly) {
            const visit = useVisit.getState().current;
            if (!visit) return;
            e.stopPropagation();
            useVisit.setState({ current: { ...visit, selectedItemId: item.id } });
            return;
          }
          if (s.placing || (s.mode === 'buy' && s.wallMode)) return; // let the click plane handle placement / walls
          e.stopPropagation();
          if (item.broken && s.mode === 'live') openRepair(item.id);
          else s.select(item.id);
        }}
        onPointerOver={(e) => {
          if (readOnly && !useVisit.getState().current) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <Model type={item.type} powered={powered && !item.broken} running={running} paint={item.paint} />
        {item.broken && <Spanner />}
        {item.type === 'tv' && powered && !item.broken && <TvAd />}
      </group>
      {ITEMS[item.type]?.camera && <CameraCone x={cx} z={cz} yaw={yaw} />}
      {item.type === 'speaker' && powered && !item.broken && <SpeakerLabel x={cx} z={cz} />}
      {selected && (
        <mesh position={[cx, 0.03, cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function Items({ items: override, readOnly = false }: { items?: PlacedItem[]; readOnly?: boolean }) {
  const savedItems = useGame((s) => s.items);
  const items = override ?? savedItems;
  const selectedId = useGame((s) => s.selectedId);
  const visitSelectedId = useVisit((s) => s.current?.selectedItemId);
  const moveId = useGame((s) => s.placing?.moveId);
  // A visited house is lit by its owner's supply, yours by your own.
  const powered = useGame(litHere);
  // Only the set wired to the house runs: the biggest one in it.
  const running = useGame(genHere);
  return (
    <group>
      {items
        .filter((i) => i.id !== moveId)
        .map((i) => (
          <Item key={i.id} item={i} powered={powered} running={running === i.type} selected={readOnly ? i.id === visitSelectedId : i.id === selectedId} readOnly={readOnly} />
        ))}
    </group>
  );
}

/** Translucent preview of the item being placed in Buy mode. */
export function PlacementGhost() {
  const visiting = useVisit((s) => !!s.current);
  const placing = useGame((s) => s.placing);
  const hover = useGame((s) => s.hover);
  const items = useGame((s) => s.items);
  const design = useGame((s) => s.properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId))?.design);
  const walls = useGame((s) => s.wallEdits[houseKeyOf(s)]);
  if (visiting || !placing || !hover) return null;
  const cand = { id: '__ghost', type: placing.type, x: hover.x, z: hover.z, rot: placing.rot };
  const err = placementError(cand, items, avatarCell(), placing.moveId, houseLayout(design, walls));
  const { cx, cz, yaw } = itemTransform(cand);
  return (
    <group>
      <group position={[cx, 0, cz]} rotation={[0, yaw, 0]}>
        <ItemModel type={placing.type} />
      </group>
      {footprint(cand).map((c) => (
        <mesh key={`${c.x},${c.z}`} position={[c.x + 0.5, 0.04, c.z + 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.94, 0.94]} />
          <meshBasicMaterial color={err ? '#ef4444' : '#22c55e'} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
