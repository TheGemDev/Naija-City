// The furniture editor in the 3D view (game/decor.ts has the logic): the ghost of what you are placing, drag to
// move with a finger or the mouse, long-press to pick several, the selection marks, and the wall pieces' fittings.
// Only the ghost and an active drag do any work; a house you are not editing draws exactly as before.

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import { Raycaster, Vector2, type Camera, type Group, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { ITEMS } from '../game/catalog';
import { footprint, itemTransform, type HouseLayout, type PlacedItem } from '../game/grid';
import { useGame } from '../game/store';
import { useVisit } from '../game/visits';
import { aimAt, beginDrag, endDrag, grabGhost, toHouseRay, toggleSel, useDecor, type Guide, type Ray } from '../game/decor';
import { WALL_FACE, WALL_SHORT, WALL_TALL, WALL_THICK, centreOf, edgeAt, mountOf, wallEdgesOf, wallSpan, wallYOf, type Pose } from '../game/mount';
import { ItemModel, PaintProvider } from './models';
import { paintMap } from '../game/paint';
import { finishToolOn } from '../game/finishUi';

export const GOOD = '#22c55e';
export const BAD = '#ef4444';
const PICK = '#facc15';
const GROUP = '#22d3ee';

// ── Pointer → house ray ─────────────────────────────────────

const rig: { camera: Camera | null; el: HTMLElement | null; controls: { enabled: boolean } | null } = { camera: null, el: null, controls: null };
const caster = new Raycaster();
const ndc = new Vector2();

function rayAt(clientX: number, clientY: number): Ray | null {
  if (!rig.camera || !rig.el) return null;
  const r = rig.el.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  caster.setFromCamera(ndc, rig.camera);
  return toHouseRay(caster.ray.origin, caster.ray.direction);
}

/** Keeps the camera, canvas and orbit controls at hand for drags. Renders nothing and does nothing per frame. */
export function DecorRig() {
  const camera = useThree((s) => s.camera);
  const el = useThree((s) => s.gl.domElement);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  useEffect(() => {
    rig.camera = camera;
    rig.el = el;
    rig.controls = controls;
  }, [camera, el, controls]);
  return null;
}

// ── Press, drag, long-press ─────────────────────────────────

type Press = { id: string | null; x: number; y: number; pointerId: number; started: boolean; long: boolean; timer: number };
let press: Press | null = null;
/** A long-press picks; the click that follows it must not also select. */
let swallowClick = false;
export const takeSwallowedClick = () => {
  const s = swallowClick;
  swallowClick = false;
  return s;
};

const DRAG_PX = 7;
const LONG_MS = 450;

function stop(commit: boolean) {
  if (!press) return;
  clearTimeout(press.timer);
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  const was = press;
  press = null;
  if (rig.controls) rig.controls.enabled = true;
  if (was.started) {
    // Placed pieces land where they were dropped; a ghost being placed just stays put for the ✓ button.
    endDrag(commit && !!was.id);
    swallowClick = true;
  }
}

function onMove(e: PointerEvent) {
  if (!press || e.pointerId !== press.pointerId) return;
  if (!press.started) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) return;
    if (press.long) return;
    clearTimeout(press.timer);
    const ray = rayAt(press.x, press.y);
    if (!ray) return;
    press.started = true;
    if (press.id) {
      if (!beginDrag(press.id, ray)) return stop(false);
    } else grabGhost(ray);
  }
  const ray = rayAt(e.clientX, e.clientY);
  if (ray) aimAt(ray);
}
const onUp = (e: PointerEvent) => press && e.pointerId === press.pointerId && stop(true);
const onCancel = (e: PointerEvent) => press && e.pointerId === press.pointerId && stop(false);

function startPress(id: string | null, e: ThreeEvent<PointerEvent>) {
  const ne = e.nativeEvent;
  if (press || (ne.pointerType === 'mouse' && ne.button !== 0)) return;
  // Hold the camera still while a finger is on a piece.
  if (rig.controls) rig.controls.enabled = false;
  press = { id, x: ne.clientX, y: ne.clientY, pointerId: ne.pointerId, started: false, long: false, timer: 0 };
  if (id) {
    press.timer = window.setTimeout(() => {
      if (!press || press.started) return;
      press.long = true;
      toggleSel(id);
      swallowClick = true;
      if (rig.controls) rig.controls.enabled = true;
    }, LONG_MS);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

/** A placed piece pressed in Buy mode: drag it, or hold to pick it. */
export function pressItem(id: string, e: ThreeEvent<PointerEvent>) {
  const s = useGame.getState();
  if (s.mode !== 'buy' || s.wallMode || finishToolOn() || s.placing || useVisit.getState().current || ITEMS[s.items.find((i) => i.id === id)?.type ?? '']?.fixed) return;
  startPress(id, e);
}

/** The ghost pressed with a finger: slide it about (a mouse already moves it by hovering). */
function pressGhost(e: ThreeEvent<PointerEvent>) {
  if (e.nativeEvent.pointerType === 'mouse') return;
  startPress(null, e);
}

// ── The ghost ───────────────────────────────────────────────

/** A see-through copy of a piece, washed green or red. */
function GhostPiece({ item, colour, paint, onDown }: { item: Pose & { type: string }; colour: string; paint?: (string | null)[]; onDown?: (e: ThreeEvent<PointerEvent>) => void }) {
  const ref = useRef<Group>(null!);
  const { cx, cz, yaw, cy } = itemTransform(item);
  useLayoutEffect(() => {
    ref.current.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as MeshStandardMaterial[]) {
        m.transparent = true;
        m.opacity = Math.min(m.opacity ?? 1, 0.75);
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive.set(colour);
          m.emissiveIntensity = 0.42;
        }
      }
    });
  });
  return (
    <group ref={ref} position={[cx, cy, cz]} rotation={[0, yaw, 0]} onPointerDown={onDown}>
      <PaintProvider value={paintMap(item.type, paint)}>
        <ItemModel type={item.type} />
      </PaintProvider>
    </group>
  );
}

/** Where a piece sits: its tiles, the patch of wall it covers, or a ring on the top it stands on. */
function Marks({ item, colour, opacity = 0.45 }: { item: Pose & { type: string }; colour: string; opacity?: number }) {
  const m = mountOf(item);
  const mat = <meshBasicMaterial color={colour} transparent opacity={opacity} depthWrite={false} />;
  if (m === 'wall') {
    const def = ITEMS[item.type];
    const { cx, cz } = centreOf(item);
    const back = [[0, -1], [1, 0], [0, 1], [-1, 0]][item.rot];
    const [lo, hi] = wallSpan(item);
    return (
      <group>
        <mesh position={[cx + back[0] * (WALL_FACE - 0.01), (lo + hi) / 2, cz + back[1] * (WALL_FACE - 0.01)]} rotation={[0, -item.rot * (Math.PI / 2), 0]} renderOrder={3} raycast={() => null}>
          <planeGeometry args={[def.w * 0.96, hi - lo + 0.08]} />
          {mat}
        </mesh>
        <mesh position={[cx + back[0] * 0.38, 0.04, cz + back[1] * 0.38]} rotation={[-Math.PI / 2, 0, -item.rot * (Math.PI / 2)]} raycast={() => null}>
          <planeGeometry args={[def.w * 0.94, 0.2]} />
          {mat}
        </mesh>
      </group>
    );
  }
  if (m === 'surface') {
    const { cx, cz } = centreOf(item);
    const r = ITEMS[item.type]?.small ?? 0.2;
    return (
      <mesh position={[cx, (item.y ?? 0) + 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3} raycast={() => null}>
        <ringGeometry args={[r * 0.8, r * 1.05, 28]} />
        <meshBasicMaterial color={colour} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    );
  }
  return (
    <group>
      {footprint(item).map((c) => (
        <mesh key={`${c.x},${c.z}`} position={[c.x + 0.5, 0.04, c.z + 0.5]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[0.94, 0.94]} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

function GuideLine({ g }: { g: Guide }) {
  const [ax, ay, az] = g.a, [bx, by, bz] = g.b;
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  if (len < 0.01) return null;
  return (
    <mesh position={[(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]} rotation={[0, -Math.atan2(bz - az, bx - ax), Math.atan2(by - ay, Math.hypot(bx - ax, bz - az))]} renderOrder={4} raycast={() => null}>
      <boxGeometry args={[len, 0.025, 0.025]} />
      <meshBasicMaterial color={GROUP} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

/** The piece being placed or dragged, where it would land: green if it fits, red (with the reason) if not. */
export function DecorGhost() {
  const visiting = useVisit((s) => !!s.current);
  const placing = useGame((s) => s.placing);
  const { pose, err, guides, extras } = useDecor(useShallow((s) => ({ pose: s.pose, err: s.err, guides: s.guides, extras: s.extras })));
  if (visiting || !placing || !pose || !ITEMS[placing.type]) return null;
  const cand = { type: placing.type, ...pose };
  const colour = err ? BAD : GOOD;
  const { cx, cz } = centreOf(cand);
  const def = ITEMS[placing.type];
  const top = def.mount === 'wall' ? wallSpan(cand)[1] : def.mount === 'ceiling' ? 2.7 : (pose.y ?? 0) + 1.2;
  return (
    <group>
      <GhostPiece item={cand} colour={colour} paint={placing.paint} onDown={pressGhost} />
      <Marks item={cand} colour={colour} />
      {extras.map((e) => (
        <group key={e.id}>
          <GhostPiece item={e} colour={colour} paint={e.paint} />
          <Marks item={e} colour={colour} opacity={0.3} />
        </group>
      ))}
      {guides.map((g, i) => <GuideLine key={i} g={g} />)}
      {err && (
        <Html position={[cx, top + 0.35, cz]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="ghost-err">{err}</div>
        </Html>
      )}
    </group>
  );
}

// ── Placed pieces: marks, wall fittings ─────────────────────

/** The yellow (one picked) or cyan (group) patch under a placed piece. */
export function PickMark({ item, group }: { item: PlacedItem; group: boolean }) {
  return <Marks item={item} colour={group ? GROUP : PICK} opacity={group ? 0.45 : 0.35} />;
}

/**
 * Inside walls are drawn cut down so you can see into the rooms. Where something hangs on one, that stretch of wall
 * stays up behind it, so the TV is on a wall and not floating.
 */
export function WallBacking({ items, layout, colour }: { items: PlacedItem[]; layout: HouseLayout; colour: string }) {
  const panels = useMemo(() => {
    const tops = new Map<string, { dir: 'h' | 'v'; x: number; z: number; top: number }>();
    for (const it of items) {
      if (mountOf(it) !== 'wall') continue;
      const hi = Math.min(WALL_TALL, wallSpan(it)[1] + 0.15);
      for (const e of wallEdgesOf(it)) {
        const edge = edgeAt(layout, e);
        if (!edge || edge.tall || hi <= WALL_SHORT) continue;
        const k = `${e.dir}:${e.x}:${e.z}`;
        const cur = tops.get(k);
        if (!cur || cur.top < hi) tops.set(k, { ...e, top: hi });
      }
    }
    return [...tops.values()];
  }, [items, layout]);
  if (!panels.length) return null;
  return (
    <group>
      {panels.map((p) => {
        const h = p.top - WALL_SHORT;
        const horiz = p.dir === 'h';
        return (
          <group key={`${p.dir}:${p.x}:${p.z}`}>
            <mesh position={[horiz ? p.x + 0.5 : p.x, WALL_SHORT + h / 2, horiz ? p.z : p.z + 0.5]} castShadow receiveShadow>
              <boxGeometry args={horiz ? [1, h, WALL_THICK] : [WALL_THICK, h, 1]} />
              <meshStandardMaterial color={colour} flatShading />
            </mesh>
            <mesh position={[horiz ? p.x + 0.5 : p.x, p.top + 0.03, horiz ? p.z : p.z + 0.5]}>
              <boxGeometry args={horiz ? [1, 0.06, WALL_THICK + 0.04] : [WALL_THICK + 0.04, 0.06, 1]} />
              <meshStandardMaterial color="#847b6a" flatShading />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Groups of wall pieces on each outer side, so they hide with their wall when it drops to let the camera see in. */
export const wallMountGroups = new Map<string, Set<Object3D>>();

/** Which outer side a wall piece hangs on (as three/World.tsx keys its wall sides), or null for inside walls. */
export function outerSideOf(it: PlacedItem, layout: HouseLayout): string | null {
  if (mountOf(it) !== 'wall') return null;
  const e = wallEdgesOf(it)[0];
  const edge = e && edgeAt(layout, e);
  if (!edge?.tall) return null;
  const n = edge.dir === 'h' ? (edge.z === 0 ? [0, -1] : [0, 1]) : edge.x === 0 ? [-1, 0] : [1, 0];
  return n.join(',');
}

export function OuterSide({ side, children }: { side: string; children: ReactNode }) {
  const ref = useRef<Group>(null!);
  useEffect(() => {
    const g = ref.current;
    let set = wallMountGroups.get(side);
    if (!set) wallMountGroups.set(side, (set = new Set()));
    set.add(g);
    return () => {
      set!.delete(g);
    };
  }, [side]);
  return <group ref={ref}>{children}</group>;
}

/** Where on a wall piece the TV ad picture goes (three/TvAds.tsx draws it for the floor TV's screen). */
export const WALL_TV_AD_OFFSET: [number, number, number] = [0, -1.0, -0.255];

export { wallYOf };
