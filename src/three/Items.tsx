import { lazy, Suspense, useMemo, useSyncExternalStore } from 'react';
import { Html } from '@react-three/drei';
import { ITEMS } from '../game/catalog';
import { ITEM_MODELS } from '../game/assets';
import { houseLayout, itemTransform, type PlacedItem } from '../game/grid';

import { genHere, houseKeyOf, litHere, useGame, activeDesignOf } from '../game/store';
import { useVisit } from '../game/visits';
import { CAMERA } from '../game/security';
import { ItemModel, PaintProvider } from './models';
import { paintKey, paintMap } from '../game/paint';
import { StaticBatch } from './StaticBatch';
import { audio } from '../game/audio';
import { openRepair } from '../game/breakdowns';
import { Spanner } from './Spanner';
import { TvAd } from './TvAds';
import { finishToolOn } from '../game/finishUi';
import { offHover, onHover } from './HoverOutline';
import { DecorGhost, DecorRig, OuterSide, PickMark, WALL_TV_AD_OFFSET, WallBacking, outerSideOf, pressItem, takeSwallowedClick } from './DecorEdit';
import { toggleSel, useDecor } from '../game/decor';
import { mountOf } from '../game/mount';
import { DEFAULT_INNER_WALL, paintHex } from '../game/paint';

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

function Item({ item, powered, running, selected, picked, readOnly }: { item: PlacedItem; powered: boolean; running: boolean; selected: boolean; picked?: boolean; readOnly: boolean }) {
  // Wall pieces sit at their height on the wall, table-top ones on their table, and any piece can be at a free angle.
  const { cx, cz, yaw, cy } = itemTransform(item);
  return (
    <group>
      <group
        position={[cx, cy, cz]}
        rotation={[0, yaw, 0]}
        onPointerDown={readOnly ? undefined : (e) => pressItem(item.id, e)}
        onClick={(e) => {
          if (e.delta > 8 || (!readOnly && takeSwallowedClick())) return;
          const s = useGame.getState();
          if (readOnly) {
            const visit = useVisit.getState().current;
            if (!visit) return;
            e.stopPropagation();
            useVisit.setState({ current: { ...visit, selectedItemId: item.id } });
            return;
          }
          if (s.placing || (s.mode === 'buy' && (s.wallMode || finishToolOn()))) return; // let the click plane handle placement / walls / finishes
          e.stopPropagation();
          // Picking several: select mode, or shift / ctrl / cmd-click.
          if (s.mode === 'buy' && (useDecor.getState().selectMode || e.shiftKey || e.ctrlKey || e.metaKey)) return toggleSel(item.id);
          if (item.broken && s.mode === 'live') openRepair(item.id);
          else s.select(item.id);
        }}
        onPointerOver={(e) => {
          if (readOnly && !useVisit.getState().current) return;
          onHover(e);
        }}
        onPointerOut={offHover}
      >
        <Model type={item.type} powered={powered && !item.broken} running={running} paint={item.paint} />
        {item.broken && <Spanner />}
        {item.type === 'tv' && powered && !item.broken && <TvAd />}
        {item.type === 'wall_tv' && powered && !item.broken && (
          <group position={WALL_TV_AD_OFFSET}>
            <TvAd />
          </group>
        )}
      </group>
      {ITEMS[item.type]?.camera && <CameraCone x={cx} z={cz} yaw={yaw} />}
      {item.type === 'speaker' && powered && !item.broken && <SpeakerLabel x={cx} z={cz} />}
      {(selected || picked) && <PickMark item={item} group={!!picked} />}
    </group>
  );
}

export function Items({ items: override, readOnly = false }: { items?: PlacedItem[]; readOnly?: boolean }) {
  const savedItems = useGame((s) => s.items);
  const items = override ?? savedItems;
  const selectedId = useGame((s) => s.selectedId);
  const visitSelectedId = useVisit((s) => s.current?.selectedItemId);
  const moveId = useGame((s) => s.placing?.moveId);
  const group = useGame((s) => s.placing?.group);
  const picked = useDecor((s) => s.sel);
  // A visited house is lit by its owner's supply, yours by your own.
  const powered = useGame(litHere);
  // Only the set wired to the house runs: the biggest one in it.
  const running = useGame(genHere);
  const visit = useVisit((s) => s.current);
  const design = useGame(activeDesignOf);
  const walls = useGame((s) => s.wallEdits[houseKeyOf(s)]);
  const innerPaint = useGame((s) => s.housePaint[houseKeyOf(s)]?.inner);
  const layout = readOnly && visit ? houseLayout(visit.save.design, visit.save.walls) : houseLayout(design, walls);
  const wallColour = paintHex(readOnly && visit ? visit.save.paint?.inner : innerPaint) ?? DEFAULT_INNER_WALL;
  // What is being moved is drawn as the ghost instead: the piece, its group, and what stands on them.
  const hidden = useMemo(() => {
    const ids = new Set<string>(group?.length ? group : moveId ? [moveId] : []);
    if (ids.size) for (const i of items) if (i.on && ids.has(i.on) && mountOf(i) === 'surface') ids.add(i.id);
    return ids;
  }, [items, moveId, group]);
  const shown = items.filter((i) => !hidden.has(i.id));
  // Pieces hung on an outer wall hide with that wall when it drops for the camera.
  const sides = new Map<string, PlacedItem[]>();
  const rest: PlacedItem[] = [];
  for (const i of shown) {
    const side = outerSideOf(i, layout);
    if (side) sides.set(side, [...(sides.get(side) ?? []), i]);
    else rest.push(i);
  }
  const item = (i: PlacedItem) => (
    <Item key={i.id} item={i} powered={powered} running={running === i.type} selected={readOnly ? i.id === visitSelectedId : i.id === selectedId} picked={!readOnly && picked.includes(i.id)} readOnly={readOnly} />
  );
  return (
    <group>
      {rest.map(item)}
      {[...sides].map(([side, list]) => (
        <OuterSide key={side} side={side}>
          {list.map(item)}
        </OuterSide>
      ))}
      <WallBacking items={shown} layout={layout} colour={wallColour} />
    </group>
  );
}

/** Translucent preview of the item being placed in Buy mode (three/DecorEdit.tsx). */
export function PlacementGhost() {
  return (
    <>
      <DecorRig />
      <DecorGhost />
    </>
  );
}
