// Built-in models made from primitives. Each is centred on its footprint,
// sits on y=0 and faces +z. Swap any of them for a .glb via ITEM_MODELS in assets.ts.

import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, type Group } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useLowPerf } from '../game/quality';

type V3 = [number, number, number];

/** Owner's colour choices for one placed item: model colour -> replacement (game/paint.ts). */
const PaintCtx = createContext<Record<string, string> | null>(null);
export const PaintProvider = PaintCtx.Provider;
const useTint = (c: string) => useContext(PaintCtx)?.[c] ?? c;

/**
 * Furniture and props (ItemModel, PropModel) are seen up close, so their boxes get softly rounded edges and a
 * little sheen (not in low performance mode). The town's thousands of boxes stay plain: they are seen from afar and phones pay for every triangle.
 */
export const SoftCtx = createContext(false);

/** Rounded boxes are shared by size: a room full of furniture reuses a few dozen of them. */
const softBoxes = new Map<string, BoxGeometry>();
function softBox([w, h, d]: V3, r?: number): BoxGeometry {
  const key = `${w},${h},${d},${r ?? ''}`;
  let g = softBoxes.get(key);
  if (!g) {
    const min = Math.min(w, h, d);
    // A sheet thinner than a few centimetres reads as flat anyway: a plain box with smooth-looking edges is enough.
    g = min < 0.025 ? new BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, min < 0.1 ? 1 : 2, Math.min(r ?? 0.045, min * (r ? 0.5 : 0.28)));
    softBoxes.set(key, g);
  }
  return g;
}

/** A box. `r` rounds its corners that much (cushions, mattresses); only furniture (SoftCtx) is ever rounded. `m` is metal or glass sheen. */
export function B({ p, s, c: base, e, o, r, m }: { p: V3; s: V3; c: string; e?: string; o?: number; r?: number; m?: boolean }) {
  const c = useTint(base);
  const soft = useContext(SoftCtx);
  if (soft) {
    return (
      <mesh position={p} geometry={softBox(s, r)} castShadow receiveShadow dispose={null}>
        <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} transparent={o !== undefined} opacity={o ?? 1} roughness={m ? 0.28 : 0.62} metalness={m ? 0.45 : 0} />
      </mesh>
    );
  }
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} transparent={o !== undefined} opacity={o ?? 1} flatShading />
    </mesh>
  );
}

function Cyl({ p, r, h, c: base, rt, seg = 24 }: { p: V3; r: number; h: number; c: string; rt?: number; seg?: number }) {
  const c = useTint(base);
  // Square and five-sided posts keep their edges; anything rounder is drawn round, with twice the sides.
  const facets = seg < 6;
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, facets ? seg : Math.max(seg * 2, 16)]} />
      <meshStandardMaterial color={c} flatShading={facets} />
    </mesh>
  );
}

function Ball({ p, r, c: base, detail = 0, s }: { p: V3; r: number; c: string; detail?: number; s?: V3 }) {
  const c = useTint(base);
  return (
    <mesh position={p} scale={s} castShadow>
      <icosahedronGeometry args={[r, Math.max(detail, 3)]} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

const legs = (w: number, d: number, h: number, c: string, t = 0.06) =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
    <B key={i} p={[(sx * (w - t)) / 2, h / 2, (sz * (d - t)) / 2]} s={[t, h, t]} c={c} />
  ));

/** Four round legs narrowing toward the floor, set in from the corners of a w×d top. */
const roundLegs = (w: number, d: number, h: number, c: string, r = 0.03, inset = 0.07) =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
    <Cyl key={i} p={[sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset)]} r={r * 0.7} rt={r} h={h} c={c} />
  ));

/** Long leaves arching out of a pot from height y: `n` of them, alternating two greens. */
function Leaves({ y, n, len, c1, c2, spread = 0.9 }: { y: number; n: number; len: number; c1: string; c2: string; spread?: number }) {
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const yaw = (i / n) * Math.PI * 2 + (i % 2) * 0.4;
        const tilt = spread * (0.45 + (i % 3) * 0.18);
        const l = len * (0.8 + ((i * 7) % 5) * 0.08);
        return (
          <group key={i} rotation={[0, yaw, 0]}>
            <group rotation={[tilt, 0, 0]}>
              <Ball p={[0, l * 0.5, 0]} r={0.1} s={[0.55, l * 5, 0.16]} c={i % 2 ? c2 : c1} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** A pillow: plump, with rounded corners. */
const Pillow = ({ p, w, d, c = '#fff' }: { p: V3; w: number; d: number; c?: string }) => <B p={p} s={[w, 0.15, d]} c={c} r={0.07} />;

function Spin({ children, speed = 6 }: { children: ReactNode; speed?: number }) {
  const ref = useRef<Group>(null!);
  useFrame((_, dt) => (ref.current.rotation.z -= dt * speed));
  return <group ref={ref} userData={{ dynamic: true }}>{children}</group>;
}

function Shake({ children, on }: { children: ReactNode; on: boolean }) {
  const ref = useRef<Group>(null!);
  useFrame(({ clock }) => {
    ref.current.position.x = on ? Math.sin(clock.elapsedTime * 60) * 0.01 : 0;
  });
  return <group ref={ref} userData={{ dynamic: true }}>{children}</group>;
}

export interface ModelProps {
  type: string;
  powered?: boolean;
  running?: boolean;
}

export function ItemModel(props: ModelProps) {
  // Low performance mode keeps the plain boxes: a rounded one costs 9 to 25 times the triangles.
  const soft = !useLowPerf();
  return <SoftCtx.Provider value={soft}>{itemShape(props)}</SoftCtx.Provider>;
}

function itemShape({ type, powered, running }: ModelProps): ReactNode {
  switch (type) {
    case 'bed_foam':
      return (
        <group>
          {roundLegs(1.9, 2.9, 0.09, '#5a371e', 0.04, 0.12)}
          <B p={[0, 0.2, 0]} s={[1.9, 0.24, 2.9]} c="#6b4426" />
          <B p={[0, 0.42, 0.05]} s={[1.78, 0.22, 2.74]} c="#f5f1e8" r={0.08} />
          {/* the blanket hangs over the sides and the foot */}
          <B p={[0, 0.545, 0.46]} s={[1.84, 0.04, 1.9]} c="#2f6f4f" r={0.02} />
          <B p={[-0.91, 0.45, 0.46]} s={[0.04, 0.2, 1.9]} c="#2f6f4f" />
          <B p={[0.91, 0.45, 0.46]} s={[0.04, 0.2, 1.9]} c="#2f6f4f" />
          <B p={[0, 0.45, 1.4]} s={[1.84, 0.2, 0.04]} c="#2f6f4f" />
          <B p={[0, 0.56, -0.44]} s={[1.84, 0.06, 0.22]} c="#ece6d8" r={0.03} />
          <Pillow p={[-0.43, 0.6, -1.08]} w={0.72} d={0.42} />
          <Pillow p={[0.43, 0.6, -1.08]} w={0.72} d={0.42} />
          {/* headboard with a padded panel */}
          <B p={[0, 0.72, -1.42]} s={[1.98, 1.32, 0.1]} c="#5a371e" />
          <B p={[0, 0.88, -1.36]} s={[1.74, 0.78, 0.06]} c="#6b4426" r={0.03} />
        </group>
      );
    case 'bed_royal':
      return (
        <group>
          <B p={[0, 0.2, 0]} s={[1.95, 0.4, 2.95]} c="#4a2a14" />
          <B p={[0, 0.48, 0.05]} s={[1.85, 0.18, 2.8]} c="#fff8e7" />
          <B p={[0, 0.59, 0.45]} s={[1.87, 0.06, 1.9]} c="#7b1f3a" />
          <B p={[-0.45, 0.62, -1.1]} s={[0.7, 0.14, 0.4]} c="#f6d77a" />
          <B p={[0.45, 0.62, -1.1]} s={[0.7, 0.14, 0.4]} c="#f6d77a" />
          <B p={[0, 0.9, -1.44]} s={[1.95, 1.6, 0.1]} c="#c9a227" />
          {[[-0.92, -1.42], [0.92, -1.42], [-0.92, 1.42], [0.92, 1.42]].map(([x, z], i) => (
            <B key={i} p={[x, 1.1, z]} s={[0.08, 2.2, 0.08]} c="#c9a227" />
          ))}
          <B p={[0, 2.2, 0]} s={[1.95, 0.06, 2.95]} c="#7b1f3a" o={0.85} />
        </group>
      );
    case 'fridge':
      return (
        <group>
          <B p={[0, 0.04, 0]} s={[0.74, 0.08, 0.66]} c="#2b2f36" />
          <B p={[0, 0.89, 0]} s={[0.8, 1.62, 0.7]} c="#e9edf1" r={0.04} />
          {/* freezer door on top, fridge door below, a gap between */}
          <B p={[0, 1.42, 0.355]} s={[0.78, 0.5, 0.03]} c="#e9edf1" r={0.012} />
          <B p={[0, 0.69, 0.355]} s={[0.78, 0.98, 0.03]} c="#e9edf1" r={0.012} />
          <B p={[0, 1.165, 0.36]} s={[0.78, 0.012, 0.02]} c="#9aa5b1" />
          <B p={[0.31, 1.4, 0.385]} s={[0.03, 0.28, 0.03]} c="#6b7785" m />
          <B p={[0.31, 0.92, 0.385]} s={[0.03, 0.42, 0.03]} c="#6b7785" m />
          <B p={[-0.2, 1.57, 0.374]} s={[0.18, 0.04, 0.005]} c="#9aa5b1" />
        </group>
      );
    case 'washing_machine':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.7, 0.06, 0.64]} c="#9aa5b1" />
          <B p={[0, 0.48, 0]} s={[0.75, 0.86, 0.7]} c="#f1f4f7" r={0.035} />
          <B p={[0, 0.82, 0.355]} s={[0.7, 0.13, 0.02]} c="#9aa5b1" r={0.008} />
          <B p={[0.25, 0.82, 0.368]} s={[0.12, 0.06, 0.01]} c="#1f2329" />
          <group position={[-0.2, 0.82, 0.37]} rotation={[Math.PI / 2, 0, 0]}><Cyl p={[0, 0, 0]} r={0.035} h={0.02} c="#f1f4f7" /></group>
          {/* the round door: chrome ring, blue glass */}
          <group position={[0, 0.42, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
            <Cyl p={[0, 0.01, 0]} r={0.22} h={0.03} c="#cfd6dd" />
            <Cyl p={[0, 0.03, 0]} r={0.16} h={0.02} c="#3b6ea5" />
          </group>
        </group>
      );
    case 'cooker':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.74, 0.06, 0.64]} c="#2b2f36" />
          <B p={[0, 0.46, 0]} s={[0.8, 0.82, 0.7]} c="#d7dbe0" r={0.02} />
          <B p={[0, 0.885, 0]} s={[0.8, 0.03, 0.7]} c="#2b2f36" r={0.01} />
          {/* oven door with its window and handle, knobs along the top */}
          <B p={[0, 0.4, 0.355]} s={[0.7, 0.5, 0.02]} c="#d7dbe0" r={0.008} />
          <B p={[0, 0.38, 0.367]} s={[0.54, 0.3, 0.005]} c="#1f2329" />
          <B p={[0, 0.69, 0.385]} s={[0.56, 0.025, 0.025]} c="#9aa5b1" m />
          {[-0.27, -0.09, 0.09, 0.27].map((x) => <group key={x} position={[x, 0.8, 0.365]} rotation={[Math.PI / 2, 0, 0]}><Cyl p={[0, 0, 0]} r={0.025} h={0.03} c="#2b2f36" /></group>)}
          {[[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]].map(([x, z], i) => (
            <group key={i}>
              <Cyl p={[x, 0.905, z]} r={0.1} h={0.012} c="#4b5563" />
              <Cyl p={[x, 0.915, z]} r={0.05} h={0.012} c="#111" />
            </group>
          ))}
          <Cyl p={[0.2, 0.99, 0.15]} r={0.12} h={0.15} c="#b45309" />
          <Cyl p={[0.2, 1.07, 0.15]} r={0.125} h={0.015} c="#78350f" />
        </group>
      );
    case 'counter':
      return (
        <group>
          <B p={[0, 0.05, 0.03]} s={[1.86, 0.1, 0.6]} c="#3b2a1a" />
          <B p={[0, 0.48, 0]} s={[1.9, 0.76, 0.7]} c="#8b5a2b" r={0.015} />
          <B p={[0, 0.885, 0]} s={[1.95, 0.05, 0.74]} c="#efe8dc" r={0.015} />
          {[-0.475, 0.475].map((x) => (
            <group key={x}>
              <B p={[x, 0.48, 0.355]} s={[0.9, 0.68, 0.02]} c="#7a4e24" r={0.008} />
              <B p={[x > 0 ? x - 0.37 : x + 0.37, 0.66, 0.375]} s={[0.025, 0.16, 0.025]} c="#b8c2cc" m />
            </group>
          ))}
          {/* a sink with its tap */}
          <B p={[0.5, 0.9, 0]} s={[0.52, 0.02, 0.42]} c="#b8c2cc" m r={0.008} />
          <B p={[0.5, 0.895, 0]} s={[0.44, 0.02, 0.34]} c="#64748b" m />
          <Cyl p={[0.5, 0.98, -0.18]} r={0.018} h={0.16} c="#b8c2cc" />
          <group position={[0.5, 1.05, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <Cyl p={[0, 0, 0]} r={0.015} h={0.13} c="#b8c2cc" />
          </group>
          <B p={[-0.5, 0.925, 0]} s={[0.4, 0.03, 0.28]} c="#c08a5a" r={0.01} />
        </group>
      );
    case 'dining':
      return (
        <group>
          <B p={[0, 0.74, 0]} s={[1.6, 0.06, 1.2]} c="#7a4a26" r={0.025} />
          <B p={[0, 0.67, 0]} s={[1.44, 0.08, 1.04]} c="#5a3418" />
          {roundLegs(1.5, 1.1, 0.66, '#5a3418', 0.04, 0.08)}
          {[[0, 0.8, 0], [0, -0.8, Math.PI]].map(([x, z, r], i) => (
            <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
              <B p={[0, 0.45, 0]} s={[0.45, 0.05, 0.45]} c="#8b5a2b" r={0.02} />
              <B p={[0, 0.49, 0]} s={[0.4, 0.04, 0.4]} c="#f1e7d0" r={0.02} />
              {roundLegs(0.42, 0.42, 0.43, '#5a3418', 0.022, 0.04)}
              {[-0.19, 0.19].map((sx) => <B key={sx} p={[sx, 0.76, 0.2]} s={[0.04, 0.62, 0.04]} c="#8b5a2b" />)}
              <B p={[0, 1.0, 0.2]} s={[0.44, 0.12, 0.04]} c="#8b5a2b" r={0.015} />
              {[-0.07, 0.07].map((sx) => <B key={sx} p={[sx, 0.76, 0.2]} s={[0.04, 0.38, 0.025]} c="#8b5a2b" />)}
            </group>
          ))}
          {/* plates at each place and a bowl of stew in the middle */}
          {[-0.4, 0.4].map((z) => <Cyl key={z} p={[0, 0.775, z]} r={0.14} rt={0.16} h={0.015} c="#f8fafc" />)}
          <Cyl p={[0, 0.81, 0]} r={0.1} rt={0.16} h={0.1} c="#d97706" />
        </group>
      );
    case 'toilet':
      return (
        <group>
          <Cyl p={[0, 0.18, 0.06]} r={0.16} rt={0.2} h={0.36} c="#fafafa" />
          <group position={[0, 0.38, 0.12]} scale={[1, 1, 1.25]}>
            <Cyl p={[0, 0, 0]} r={0.2} rt={0.22} h={0.06} c="#fafafa" />
            <Cyl p={[0, 0.045, 0]} r={0.22} h={0.03} c="#f1f1f1" />
          </group>
          <B p={[0, 0.62, -0.27]} s={[0.46, 0.46, 0.2]} c="#fafafa" r={0.04} />
          <B p={[0, 0.865, -0.27]} s={[0.48, 0.04, 0.22]} c="#f1f1f1" r={0.015} />
          <Cyl p={[0, 0.9, -0.27]} r={0.03} h={0.02} c="#cbd5e1" />
        </group>
      );
    case 'shower':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.95, 0.06, 0.95]} c="#e0f2fe" />
          <B p={[-0.47, 1.0, 0]} s={[0.02, 2, 0.95]} c="#bae6fd" o={0.35} />
          <B p={[0, 1.0, -0.47]} s={[0.95, 2, 0.02]} c="#bae6fd" o={0.35} />
          <B p={[0.3, 1.9, -0.35]} s={[0.04, 0.04, 0.25]} c="#94a3b8" />
          <Cyl p={[0.3, 1.86, -0.22]} r={0.08} h={0.03} c="#94a3b8" />
        </group>
      );
    case 'water_heater':
      return (
        <group>
          <B p={[0, 0.05, 0]} s={[0.6, 0.1, 0.6]} c="#94a3b8" />
          <Cyl p={[0, 0.8, 0]} r={0.27} h={1.4} c="#f1f5f9" />
          <Cyl p={[0, 1.52, 0]} r={0.27} rt={0.2} h={0.08} c="#cbd5e1" />
          <B p={[0, 0.5, 0.28]} s={[0.22, 0.14, 0.04]} c="#1e293b" />
          <B p={[0.06, 0.5, 0.31]} s={[0.04, 0.04, 0.02]} c={powered === false ? '#7f1d1d' : '#ef4444'} e={powered === false ? undefined : '#ef4444'} />
          <Cyl p={[-0.12, 1.65, 0]} r={0.025} h={0.2} c="#94a3b8" />
          <Cyl p={[0.12, 1.65, 0]} r={0.025} h={0.2} c="#b45309" />
        </group>
      );
    case 'hot_shower':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.95, 0.06, 0.95]} c="#fde68a" />
          <B p={[-0.47, 1.0, 0]} s={[0.02, 2, 0.95]} c="#bae6fd" o={0.35} />
          <B p={[0, 1.0, -0.47]} s={[0.95, 2, 0.02]} c="#bae6fd" o={0.35} />
          <B p={[0.3, 1.9, -0.35]} s={[0.04, 0.04, 0.25]} c="#94a3b8" />
          <Cyl p={[0.3, 1.86, -0.22]} r={0.08} h={0.03} c="#94a3b8" />
          <B p={[0.3, 1.3, -0.44]} s={[0.3, 0.4, 0.1]} c="#f8fafc" />
          <B p={[0.3, 1.38, -0.385]} s={[0.12, 0.05, 0.02]} c="#f97316" e={powered === false ? undefined : '#f97316'} />
        </group>
      );
    case 'bathtub':
      return (
        <group>
          <B p={[0, 0.3, 0]} s={[1.9, 0.6, 0.95]} c="#f8fafc" />
          <B p={[0, 0.58, 0]} s={[1.7, 0.06, 0.75]} c="#7dd3fc" e="#0369a1" />
          <B p={[-0.8, 0.8, 0]} s={[0.3, 0.4, 0.95]} c="#f1f5f9" />
          <Cyl p={[0.75, 0.75, -0.3]} r={0.03} h={0.3} c="#cbd5e1" />
          <B p={[0.75, 0.9, -0.2]} s={[0.04, 0.04, 0.2]} c="#cbd5e1" />
        </group>
      );
    case 'corner_jacuzzi':
      return (
        <group>
          <Cyl p={[0, 0.3, 0]} r={0.98} h={0.6} c="#f1f5f9" seg={20} />
          <Cyl p={[0, 0.62, 0]} r={0.8} h={0.05} c="#22d3ee" seg={20} />
          {[[-0.4, -0.3], [0.3, -0.5], [0.5, 0.3], [-0.2, 0.45]].map(([x, z], i) => (
            <Ball key={i} p={[x, 0.68, z]} r={0.05 + (i % 2) * 0.02} c="#ecfeff" />
          ))}
          <B p={[0, 0.66, -0.88]} s={[0.4, 0.06, 0.08]} c="#d4af37" />
        </group>
      );
    case 'sink':
      return (
        <group>
          <B p={[0, 0.4, -0.1]} s={[0.6, 0.8, 0.4]} c="#f1f5f9" />
          <B p={[0, 0.84, -0.1]} s={[0.66, 0.08, 0.46]} c="#fafafa" />
          <B p={[0, 0.86, -0.08]} s={[0.4, 0.05, 0.28]} c="#bae6fd" />
          <Cyl p={[0, 0.98, -0.28]} r={0.025} h={0.18} c="#cbd5e1" />
          <B p={[0, 1.07, -0.22]} s={[0.04, 0.04, 0.14]} c="#cbd5e1" />
          <B p={[0, 1.45, -0.34]} s={[0.5, 0.6, 0.03]} c="#e0f2fe" />
        </group>
      );
    case 'bidet_toilet':
      return (
        <group>
          <Cyl p={[0, 0.2, 0.08]} r={0.2} rt={0.24} h={0.4} c="#fafafa" />
          <B p={[0, 0.42, 0.1]} s={[0.46, 0.04, 0.52]} c="#f1f1f1" />
          <B p={[0, 0.6, -0.28]} s={[0.46, 0.5, 0.2]} c="#fafafa" />
          <B p={[0.3, 0.5, 0.05]} s={[0.1, 0.12, 0.2]} c="#e2e8f0" />
          <B p={[0.3, 0.57, 0.12]} s={[0.04, 0.02, 0.04]} c="#38bdf8" e={powered === false ? undefined : '#0284c7'} />
        </group>
      );
    case 'squat_toilet':
      return (
        <group>
          <B p={[0, 0.02, 0]} s={[0.7, 0.04, 0.9]} c="#f8fafc" />
          <B p={[0, 0.045, 0.05]} s={[0.2, 0.01, 0.5]} c="#1f2937" />
          <B p={[-0.22, 0.06, -0.05]} s={[0.12, 0.04, 0.22]} c="#e2e8f0" />
          <B p={[0.22, 0.06, -0.05]} s={[0.12, 0.04, 0.22]} c="#e2e8f0" />
        </group>
      );
    case 'bath_mat':
      return (
        <group>
          <B p={[0, 0.012, 0]} s={[0.85, 0.02, 0.55]} c="#38bdf8" />
          <B p={[0, 0.024, 0]} s={[0.7, 0.01, 0.4]} c="#7dd3fc" />
        </group>
      );
    case 'towel_rail':
      return (
        <group>
          <B p={[-0.3, 0.55, -0.35]} s={[0.04, 1.1, 0.04]} c="#94a3b8" />
          <B p={[0.3, 0.55, -0.35]} s={[0.04, 1.1, 0.04]} c="#94a3b8" />
          <B p={[0, 1.08, -0.35]} s={[0.64, 0.04, 0.04]} c="#94a3b8" />
          <B p={[0, 0.85, -0.35]} s={[0.64, 0.04, 0.04]} c="#94a3b8" />
          <B p={[-0.12, 0.88, -0.32]} s={[0.3, 0.42, 0.04]} c="#f97316" />
          <B p={[0.14, 0.64, -0.32]} s={[0.3, 0.42, 0.04]} c="#38bdf8" />
        </group>
      );
    case 'bucket':
      return (
        <group>
          <Cyl p={[0, 0.22, 0]} r={0.17} rt={0.22} h={0.44} c="#1d4ed8" />
          <Cyl p={[0, 0.45, 0]} r={0.2} h={0.02} c="#7dd3fc" />
          <Cyl p={[0.3, 0.05, 0.25]} r={0.1} rt={0.13} h={0.1} c="#f59e0b" />
        </group>
      );
    case 'sofa':
      return (
        <group>
          {roundLegs(2.7, 0.8, 0.1, '#3b2a1a', 0.03, 0.1)}
          <B p={[0, 0.24, 0]} s={[2.8, 0.28, 0.85]} c="#7f1d1d" r={0.05} />
          {[-0.8, 0, 0.8].map((x) => <B key={x} p={[x, 0.45, 0.07]} s={[0.79, 0.16, 0.68]} c="#991b1b" r={0.07} />)}
          <B p={[0, 0.66, -0.34]} s={[2.8, 0.6, 0.18]} c="#7f1d1d" r={0.06} />
          {[-0.8, 0, 0.8].map((x) => (
            <group key={x} position={[x, 0.74, -0.2]} rotation={[-0.14, 0, 0]}>
              <B p={[0, 0, 0]} s={[0.78, 0.44, 0.14]} c="#991b1b" r={0.07} />
            </group>
          ))}
          <B p={[-1.3, 0.48, 0]} s={[0.22, 0.38, 0.86]} c="#6b1717" r={0.09} />
          <B p={[1.3, 0.48, 0]} s={[0.22, 0.38, 0.86]} c="#6b1717" r={0.09} />
          <group position={[-0.82, 0.66, -0.06]} rotation={[-0.25, 0.25, 0.12]}>
            <B p={[0, 0, 0]} s={[0.4, 0.36, 0.12]} c="#fbbf24" r={0.06} />
          </group>
        </group>
      );
    case 'plastic_chair':
      // The white monobloc chair of every Nigerian party: splayed legs, arms, and a slatted back.
      return (
        <group>
          <B p={[0, 0.43, 0.02]} s={[0.5, 0.035, 0.46]} c="#f8fafc" r={0.015} />
          <B p={[0, 0.41, 0.24]} s={[0.5, 0.05, 0.03]} c="#f8fafc" r={0.015} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <group key={i} position={[sx * 0.22, 0.42, sz * 0.2]} rotation={[sz * -0.1, 0, sx * 0.1]}>
              <Cyl p={[0, -0.21, 0]} r={0.018} rt={0.026} h={0.42} c="#e2e8f0" />
            </group>
          ))}
          {/* arms and their posts down to the seat */}
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <B p={[sx * 0.25, 0.63, 0.0]} s={[0.05, 0.03, 0.44]} c="#f8fafc" r={0.012} />
              <B p={[sx * 0.25, 0.53, 0.19]} s={[0.035, 0.2, 0.035]} c="#e2e8f0" />
            </group>
          ))}
          <group position={[0, 0.44, -0.21]} rotation={[-0.17, 0, 0]}>
            {[-1, 1].map((sx) => <B key={sx} p={[sx * 0.225, 0.26, 0]} s={[0.05, 0.52, 0.035]} c="#f8fafc" r={0.015} />)}
            <B p={[0, 0.48, 0]} s={[0.5, 0.1, 0.035]} c="#f8fafc" r={0.02} />
            {[0.14, 0.24, 0.34].map((y) => <B key={y} p={[0, y, 0]} s={[0.4, 0.045, 0.025]} c="#f8fafc" />)}
          </group>
        </group>
      );
    case 'aircon':
      return (
        <group>
          <B p={[0, 2.05, -0.3]} s={[1.6, 0.42, 0.32]} c="#f8fafc" />
          <B p={[0, 1.88, -0.13]} s={[1.5, 0.05, 0.03]} c="#cbd5e1" />
          <B p={[0.62, 2.16, -0.13]} s={[0.05, 0.05, 0.02]} c="#22c55e" e={powered === false ? undefined : '#22c55e'} />
          <B p={[0, 0.9, -0.44]} s={[0.04, 1.8, 0.04]} c="#e2e8f0" />
        </group>
      );
    case 'fan':
      return (
        <group>
          <Cyl p={[0, 0.03, 0]} r={0.22} rt={0.2} h={0.06} c="#334155" />
          <Cyl p={[0, 0.65, 0]} r={0.022} h={1.2} c="#64748b" />
          <Cyl p={[0, 1.0, 0]} r={0.03} h={0.1} c="#334155" />
          <group position={[0, 1.3, 0.05]}>
            <B p={[0, 0, -0.12]} s={[0.16, 0.16, 0.22]} c="#334155" r={0.07} />
            <Spin speed={powered ? 18 : 0}>
              {[0, 1, 2].map((i) => (
                <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
                  <Ball p={[0, 0.14, 0.02]} r={0.1} s={[0.9, 1.5, 0.08]} c="#93c5fd" />
                </group>
              ))}
              <Ball p={[0, 0, 0.04]} r={0.04} c="#334155" />
            </Spin>
            {/* the guard: a front ring with spokes */}
            <mesh position={[0, 0, 0.06]}>
              <torusGeometry args={[0.28, 0.008, 6, 40]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0, -0.03]}>
              <torusGeometry args={[0.28, 0.008, 6, 40]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.35} />
            </mesh>
            {Array.from({ length: 8 }, (_, i) => (
              <group key={i} rotation={[0, 0, (i * Math.PI) / 4]}>
                <B p={[0, 0.14, 0.06]} s={[0.006, 0.28, 0.006]} c="#cbd5e1" />
              </group>
            ))}
          </group>
        </group>
      );
    case 'tv':
      return (
        <group>
          <B p={[0, 0.27, -0.1]} s={[1.8, 0.44, 0.5]} c="#3b2a1a" r={0.03} />
          {[-0.45, 0.45].map((x) => <B key={x} p={[x, 0.27, 0.152]} s={[0.86, 0.36, 0.01]} c="#2a1d12" />)}
          {[-0.82, 0.82].map((x) => <B key={x} p={[x, 0.03, -0.1]} s={[0.08, 0.06, 0.44]} c="#111" />)}
          {/* screen on a slim stand, a soundbar in front */}
          <B p={[0, 0.53, -0.14]} s={[0.4, 0.02, 0.18]} c="#1f2937" m />
          <B p={[0, 0.6, -0.16]} s={[0.06, 0.14, 0.04]} c="#1f2937" m />
          <B p={[0, 1.08, -0.15]} s={[1.5, 0.86, 0.04]} c="#0b0f14" r={0.012} />
          <B p={[0, 1.09, -0.128]} s={[1.44, 0.8, 0.005]} c={powered ? '#1e40af' : '#111827'} e={powered ? '#3b82f6' : undefined} />
          <B p={[0, 0.53, 0.05]} s={[0.8, 0.06, 0.08]} c="#111" r={0.02} />
          <B p={[0.62, 0.52, 0.05]} s={[0.16, 0.03, 0.1]} c="#111" r={0.01} />
        </group>
      );
    case 'desk':
      return (
        <group>
          <B p={[0, 0.74, 0]} s={[1.8, 0.04, 0.75]} c="#e5e7eb" r={0.015} />
          {/* a steel frame: legs and a rail joining them */}
          {[-0.84, 0.84].map((x) => (
            <group key={x}>
              <B p={[x, 0.36, 0]} s={[0.05, 0.72, 0.62]} c="#374151" m />
              <B p={[x, 0.02, 0]} s={[0.06, 0.03, 0.7]} c="#374151" m />
            </group>
          ))}
          <B p={[0, 0.66, -0.3]} s={[1.64, 0.06, 0.03]} c="#374151" m />
          {/* drawer unit */}
          <B p={[0.55, 0.53, 0.02]} s={[0.4, 0.36, 0.62]} c="#e5e7eb" r={0.01} />
          <B p={[0.55, 0.53, 0.335]} s={[0.12, 0.02, 0.02]} c="#374151" m />
          <B p={[0, 0.775, 0.1]} s={[0.46, 0.015, 0.3]} c="#9ca3af" m r={0.007} />
          <group position={[0, 0.78, -0.06]} rotation={[-0.3, 0, 0]}>
            <B p={[0, 0.16, 0]} s={[0.46, 0.31, 0.014]} c="#4b5563" m r={0.006} />
            <B p={[0, 0.16, 0.008]} s={[0.42, 0.27, 0.004]} c={powered ? '#22c55e' : '#111827'} e={powered ? '#16a34a' : undefined} />
          </group>
          <Cyl p={[-0.65, 0.84, -0.15]} r={0.07} rt={0.08} h={0.16} c="#c2410c" />
          <Ball p={[-0.65, 0.98, -0.15]} r={0.12} c="#16a34a" />
        </group>
      );
    case 'bookshelf':
      return (
        <group>
          <B p={[0, 0.9, -0.33]} s={[0.9, 1.8, 0.03]} c="#6b4426" />
          {[-0.435, 0.435].map((x) => <B key={x} p={[x, 0.9, -0.15]} s={[0.03, 1.8, 0.4]} c="#6b4426" />)}
          {[0.04, 0.48, 0.93, 1.38, 1.785].map((y) => <B key={y} p={[0, y, -0.15]} s={[0.9, 0.03, 0.4]} c="#6b4426" />)}
          {[0.5, 0.95, 1.4].map((y, row) => {
            let x = -0.4;
            return Array.from({ length: 7 }, (_, i) => {
              const w = 0.05 + ((i * 3 + row) % 4) * 0.015;
              const h = 0.26 + ((i * 5 + row * 2) % 4) * 0.035;
              const at = x + w / 2;
              x += w + 0.008;
              const lean = row === 1 && i === 6;
              return (
                <group key={`${row}-${i}`} position={[lean ? at + 0.05 : at, y + 0.015, -0.12]} rotation={[0, 0, lean ? -0.35 : 0]}>
                  <B p={[0, h / 2, 0]} s={[w, h, 0.26]} c={['#b91c1c', '#1d4ed8', '#15803d', '#ca8a04', '#7c3aed', '#0f766e', '#f8fafc'][(i + row * 2) % 7]} r={0.006} />
                </group>
              );
            });
          })}
          <Cyl p={[0.28, 0.1, -0.12]} r={0.08} rt={0.1} h={0.1} c="#c2410c" />
          <Ball p={[-0.25, 0.14, -0.12]} r={0.09} c="#d4af37" />
        </group>
      );
    case 'prayer_mat':
      return (
        <group>
          <B p={[0, 0.012, 0]} s={[0.65, 0.02, 0.95]} c="#166534" />
          <B p={[0, 0.024, -0.28]} s={[0.4, 0.01, 0.25]} c="#ca8a04" />
          <B p={[0, 0.024, 0.15]} s={[0.5, 0.01, 0.5]} c="#14532d" />
        </group>
      );
    case 'generator':
      return (
        <Shake on={!!running}>
          {/* The small petrol set every compound has: tank on top, engine and alternator in a carry frame */}
          <B p={[-0.3, 0.025, 0]} s={[0.07, 0.05, 0.6]} c="#111827" />
          <B p={[0.3, 0.025, 0]} s={[0.07, 0.05, 0.6]} c="#111827" />
          <B p={[0, 0.065, 0]} s={[0.78, 0.03, 0.54]} c="#1f2937" />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <Tube key={i} p={[sx * 0.38, 0.38, sz * 0.26]} rot={[0, 0, 0]} r={0.022} h={0.62} c="#1f2937" />
          ))}
          <Tube p={[0, 0.69, 0.26]} rot={ACROSS} r={0.022} h={0.8} c="#1f2937" />
          <Tube p={[0, 0.69, -0.26]} rot={ACROSS} r={0.022} h={0.8} c="#1f2937" />
          <Tube p={[-0.38, 0.69, 0]} rot={ALONG} r={0.022} h={0.52} c="#1f2937" />
          <Tube p={[0.38, 0.69, 0]} rot={ALONG} r={0.022} h={0.52} c="#1f2937" />
          <B p={[0, 0.54, 0]} s={[0.66, 0.16, 0.44]} c="#dc2626" />
          <B p={[0, 0.635, 0]} s={[0.56, 0.04, 0.36]} c="#ef4444" />
          <Cyl p={[0.16, 0.67, 0]} r={0.05} h={0.04} c="#111827" />
          <B p={[0, 0.54, 0.222]} s={[0.44, 0.06, 0.01]} c="#facc15" />
          {/* Engine with its cooling fins and pull-start, then the alternator */}
          <B p={[-0.15, 0.25, -0.02]} s={[0.26, 0.3, 0.34]} c="#6b7280" />
          {[0.17, 0.25, 0.33].map((y) => <B key={y} p={[-0.15, y, -0.02]} s={[0.3, 0.025, 0.38]} c="#9ca3af" />)}
          <Tube p={[-0.31, 0.25, -0.02]} rot={ACROSS} r={0.13} h={0.05} c="#dc2626" />
          <B p={[-0.345, 0.33, 0.08]} s={[0.03, 0.03, 0.1]} c="#111827" />
          <Tube p={[0.17, 0.25, -0.04]} rot={ACROSS} r={0.15} h={0.32} c="#111827" />
          <Tube p={[0.34, 0.25, -0.04]} rot={ACROSS} r={0.09} h={0.03} c="#9ca3af" metal />
          {/* Control panel: socket, switch, and a light that is on while it runs */}
          <B p={[0.15, 0.27, 0.24]} s={[0.36, 0.28, 0.03]} c="#d1d5db" />
          <B p={[0.22, 0.23, 0.258]} s={[0.1, 0.1, 0.01]} c="#111827" />
          <B p={[0.06, 0.32, 0.258]} s={[0.05, 0.07, 0.012]} c="#dc2626" />
          <B p={[0.06, 0.2, 0.258]} s={[0.04, 0.04, 0.012]} c="#166534" e={running ? '#22c55e' : undefined} />
          <Tube p={[-0.08, 0.3, -0.25]} rot={ACROSS} r={0.06} h={0.34} c="#9ca3af" metal />
          <Tube p={[0.12, 0.3, -0.25]} rot={ACROSS} r={0.022} h={0.08} c="#374151" />
        </Shake>
      );
    case 'generator_3kva':
      return (
        <Shake on={!!running}>
          {/* The one on wheels: same idea as the small set, half as big again */}
          <B p={[0, 0.15, 0]} s={[0.86, 0.04, 0.6]} c="#1f2937" />
          <Tube p={[-0.3, 0.1, 0.34]} rot={ALONG} r={0.1} h={0.06} c="#111827" />
          <Tube p={[-0.3, 0.1, -0.34]} rot={ALONG} r={0.1} h={0.06} c="#111827" />
          <B p={[0.34, 0.065, 0]} s={[0.06, 0.13, 0.5]} c="#111827" />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <Tube key={i} p={[sx * 0.41, 0.53, sz * 0.28]} rot={[0, 0, 0]} r={0.025} h={0.74} c="#1f2937" />
          ))}
          <Tube p={[0, 0.9, 0.28]} rot={ACROSS} r={0.025} h={0.87} c="#1f2937" />
          <Tube p={[0, 0.9, -0.28]} rot={ACROSS} r={0.025} h={0.87} c="#1f2937" />
          <Tube p={[-0.41, 0.9, 0]} rot={ALONG} r={0.025} h={0.56} c="#1f2937" />
          <Tube p={[0.41, 0.9, 0]} rot={ALONG} r={0.025} h={0.56} c="#1f2937" />
          <B p={[0, 0.72, 0]} s={[0.72, 0.2, 0.48]} c="#1d4ed8" />
          <B p={[0, 0.835, 0]} s={[0.6, 0.04, 0.38]} c="#2563eb" />
          <Cyl p={[0.18, 0.87, 0]} r={0.055} h={0.04} c="#111827" />
          <B p={[0, 0.72, 0.242]} s={[0.46, 0.07, 0.01]} c="#f8fafc" />
          <B p={[-0.17, 0.38, -0.02]} s={[0.3, 0.4, 0.4]} c="#6b7280" />
          {[0.27, 0.38, 0.49].map((y) => <B key={y} p={[-0.17, y, -0.02]} s={[0.34, 0.03, 0.44]} c="#9ca3af" />)}
          <Tube p={[-0.35, 0.38, -0.02]} rot={ACROSS} r={0.15} h={0.05} c="#111827" />
          <Tube p={[0.18, 0.38, -0.04]} rot={ACROSS} r={0.19} h={0.36} c="#111827" />
          <B p={[0.17, 0.41, 0.26]} s={[0.42, 0.36, 0.03]} c="#d1d5db" />
          <B p={[0.08, 0.35, 0.278]} s={[0.1, 0.1, 0.01]} c="#111827" />
          <B p={[0.26, 0.35, 0.278]} s={[0.1, 0.1, 0.01]} c="#111827" />
          <B p={[0.26, 0.52, 0.278]} s={[0.07, 0.05, 0.012]} c="#dc2626" />
          <B p={[0.08, 0.52, 0.278]} s={[0.04, 0.04, 0.012]} c="#166534" e={running ? '#22c55e' : undefined} />
          <Tube p={[-0.06, 0.44, -0.28]} rot={ACROSS} r={0.07} h={0.42} c="#9ca3af" metal />
        </Shake>
      );
    case 'generator_10kva':
      return (
        <Shake on={!!running}>
          {/* Open diesel set on its tank: radiator, engine, alternator, with the control box on top */}
          <B p={[0, 0.11, 0]} s={[1.84, 0.22, 0.72]} c="#1f2937" />
          <Cyl p={[0.78, 0.245, 0.24]} r={0.05} h={0.05} c="#dc2626" />
          <B p={[-0.8, 0.64, 0]} s={[0.12, 0.84, 0.66]} c="#111827" />
          <B p={[-0.865, 0.64, 0]} s={[0.01, 0.7, 0.54]} c="#4b5563" />
          <B p={[-0.34, 0.54, 0]} s={[0.72, 0.64, 0.5]} c="#15803d" />
          <B p={[-0.34, 0.91, 0]} s={[0.6, 0.1, 0.34]} c="#166534" />
          {[-0.56, -0.34, -0.12].map((x) => <B key={x} p={[x, 0.54, 0.255]} s={[0.06, 0.5, 0.02]} c="#166534" />)}
          <Tube p={[-0.1, 1.04, 0.14]} rot={ACROSS} r={0.09} h={0.3} c="#111827" />
          <Cyl p={[-0.52, 1.24, -0.13]} r={0.045} h={0.56} c="#9ca3af" />
          <B p={[-0.52, 1.54, -0.13]} s={[0.13, 0.02, 0.13]} c="#374151" />
          <Tube p={[0.42, 0.54, 0]} rot={ACROSS} r={0.28} h={0.64} c="#6b7280" />
          <Tube p={[0.76, 0.54, 0]} rot={ACROSS} r={0.2} h={0.06} c="#374151" />
          <B p={[0.48, 0.98, 0]} s={[0.42, 0.3, 0.32]} c="#d1d5db" />
          <B p={[0.48, 1.0, 0.162]} s={[0.32, 0.18, 0.01]} c="#111827" />
          <B p={[0.38, 1.04, 0.17]} s={[0.05, 0.05, 0.01]} c="#166534" e={running ? '#22c55e' : undefined} />
          <B p={[0.58, 1.04, 0.17]} s={[0.06, 0.06, 0.012]} c="#dc2626" />
          <B p={[0.48, 0.95, 0.17]} s={[0.24, 0.04, 0.01]} c="#9ca3af" />
        </Shake>
      );
    case 'generator_silent':
      return (
        <Shake on={!!running}>
          {/* The estate big man's set: a soundproof canopy on a base tank, louvres at the ends, doors along the front */}
          <B p={[0, 0.13, 0]} s={[2.8, 0.26, 1.5]} c="#1f2937" />
          <B p={[0, 0.9, 0]} s={[2.7, 1.28, 1.4]} c="#eab308" />
          <B p={[0, 1.565, 0]} s={[2.76, 0.05, 1.46]} c="#ca8a04" />
          {[-0.9, 0, 0.9].map((x) => (
            <group key={x}>
              <B p={[x, 0.9, 0.705]} s={[0.84, 1.12, 0.01]} c="#facc15" />
              <B p={[x + 0.34, 0.9, 0.715]} s={[0.04, 0.18, 0.02]} c="#111827" />
            </group>
          ))}
          {[0.5, 0.7, 0.9, 1.1, 1.3].map((y) => (
            <group key={y}>
              <B p={[-1.355, y, 0]} s={[0.01, 0.12, 1.1]} c="#111827" />
              <B p={[1.355, y, 0]} s={[0.01, 0.12, 1.1]} c="#111827" />
            </group>
          ))}
          <B p={[0.9, 1.15, 0.712]} s={[0.42, 0.28, 0.01]} c="#111827" />
          <B p={[0.78, 1.2, 0.72]} s={[0.07, 0.07, 0.01]} c="#166534" e={running ? '#22c55e' : undefined} />
          <B p={[0.98, 1.2, 0.72]} s={[0.16, 0.08, 0.01]} c="#93c5fd" />
          <B p={[-0.9, 0.55, 0.712]} s={[0.3, 0.14, 0.006]} c="#dc2626" />
          <Cyl p={[-0.95, 1.75, -0.35]} r={0.08} h={0.34} c="#9ca3af" />
          <B p={[-0.95, 1.94, -0.35]} s={[0.22, 0.03, 0.22]} c="#374151" />
          {[[-1.1, 0.5], [1.1, 0.5], [-1.1, -0.5], [1.1, -0.5]].map(([x, z], i) => <B key={i} p={[x, 1.62, z]} s={[0.12, 0.07, 0.04]} c="#111827" />)}
        </Shake>
      );
    case 'stabilizer':
      return (
        <group>
          <B p={[0, 0.21, 0]} s={[0.44, 0.36, 0.52]} c="#e5e7eb" />
          <B p={[-0.16, 0.015, 0]} s={[0.06, 0.03, 0.46]} c="#374151" />
          <B p={[0.16, 0.015, 0]} s={[0.06, 0.03, 0.46]} c="#374151" />
          <B p={[0, 0.22, 0.262]} s={[0.38, 0.28, 0.01]} c="#1f2937" />
          <B p={[-0.07, 0.27, 0.268]} s={[0.18, 0.11, 0.01]} c="#fef3c7" e={powered === false ? undefined : '#f59e0b'} />
          <B p={[0.12, 0.3, 0.268]} s={[0.04, 0.04, 0.01]} c="#22c55e" e={powered === false ? undefined : '#22c55e'} />
          <B p={[0.12, 0.23, 0.268]} s={[0.04, 0.04, 0.01]} c="#7f1d1d" />
          <B p={[0.1, 0.13, 0.27]} s={[0.1, 0.06, 0.014]} c="#dc2626" />
          <B p={[-0.1, 0.13, 0.268]} s={[0.12, 0.07, 0.01]} c="#111827" />
          <B p={[0, 0.415, 0]} s={[0.22, 0.03, 0.06]} c="#374151" />
          {[-0.1, 0.02, 0.14].map((z) => <B key={z} p={[0.222, 0.26, z]} s={[0.006, 0.16, 0.05]} c="#9ca3af" />)}
        </group>
      );
    case 'standing_ac':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.58, 0.06, 0.46]} c="#cbd5e1" />
          <B p={[0, 0.95, 0]} s={[0.54, 1.78, 0.42]} c="#f8fafc" />
          <B p={[0, 1.855, 0]} s={[0.5, 0.03, 0.38]} c="#e2e8f0" />
          <B p={[0, 1.58, 0.212]} s={[0.44, 0.34, 0.01]} c="#1f2937" />
          {[1.48, 1.58, 1.68].map((y) => <B key={y} p={[0, y, 0.225]} s={[0.42, 0.02, 0.04]} c="#e2e8f0" />)}
          <B p={[0, 1.28, 0.212]} s={[0.22, 0.09, 0.01]} c="#0f172a" />
          <B p={[0, 1.28, 0.218]} s={[0.12, 0.045, 0.006]} c="#38bdf8" e={powered === false ? undefined : '#38bdf8'} />
          {[0.26, 0.4, 0.54, 0.68, 0.82].map((y) => <B key={y} p={[0, y, 0.212]} s={[0.42, 0.04, 0.01]} c="#cbd5e1" />)}
          <B p={[0, 1.08, 0.212]} s={[0.46, 0.012, 0.01]} c="#94a3b8" />
        </group>
      );
    case 'air_cooler':
      return (
        <group>
          {[[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.14], [0.2, 0.14]].map(([x, z], i) => <Ball key={i} p={[x, 0.04, z]} r={0.04} c="#111827" />)}
          <B p={[0, 0.52, 0]} s={[0.52, 0.88, 0.4]} c="#f1f5f9" />
          <B p={[0, 0.99, 0]} s={[0.54, 0.07, 0.42]} c="#0e7490" />
          <B p={[0, 0.66, 0.202]} s={[0.42, 0.44, 0.01]} c="#1f2937" />
          {[0.5, 0.58, 0.66, 0.74, 0.82].map((y) => <B key={y} p={[0, y, 0.21]} s={[0.4, 0.015, 0.02]} c="#94a3b8" />)}
          <B p={[0, 0.24, 0.202]} s={[0.3, 0.16, 0.01]} c="#7dd3fc" o={0.8} />
          <B p={[0, 0.2, 0.206]} s={[0.3, 0.08, 0.006]} c="#0284c7" />
          <Cyl p={[-0.14, 1.04, 0]} r={0.04} h={0.04} c="#e2e8f0" />
          <Cyl p={[0, 1.04, 0]} r={0.04} h={0.04} c="#e2e8f0" />
          <B p={[0.15, 1.03, 0]} s={[0.06, 0.02, 0.06]} c="#22c55e" e={powered === false ? undefined : '#22c55e'} />
        </group>
      );
    case 'rechargeable_fan':
      return (
        <group>
          <B p={[0, 0.1, 0]} s={[0.42, 0.2, 0.3]} c="#0f766e" />
          <B p={[0, 0.12, 0.152]} s={[0.3, 0.07, 0.01]} c="#fef9c3" e="#fde68a" />
          <B p={[0.15, 0.215, 0]} s={[0.05, 0.03, 0.05]} c="#f8fafc" />
          <Cyl p={[0, 0.34, -0.02]} r={0.03} h={0.3} c="#134e4a" />
          <group position={[0, 0.68, 0.02]}>
            <B p={[0, 0, -0.08]} s={[0.14, 0.14, 0.16]} c="#134e4a" />
            <Spin speed={14}>
              {[0, 1, 2].map((i) => (
                <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, 0.02]}>
                  <boxGeometry args={[0.07, 0.38, 0.01]} />
                  <meshStandardMaterial color="#99f6e4" transparent opacity={0.8} />
                </mesh>
              ))}
            </Spin>
            <mesh position={[0, 0, 0.03]}>
              <torusGeometry args={[0.22, 0.012, 4, 16]} />
              <meshStandardMaterial color="#0f766e" />
            </mesh>
          </group>
        </group>
      );
    case 'room_heater':
      return (
        <group>
          <Cyl p={[0, 0.025, 0]} r={0.24} h={0.05} c="#1f2937" />
          <B p={[0, 0.47, -0.02]} s={[0.44, 0.82, 0.14]} c="#374151" />
          <B p={[0, 0.5, 0.052]} s={[0.36, 0.62, 0.01]} c="#e5e7eb" />
          {[0.3, 0.5, 0.7].map((y) => <B key={y} p={[0, y, 0.062]} s={[0.3, 0.06, 0.012]} c="#fdba74" e={powered === false ? undefined : '#f97316'} />)}
          {[-0.1, 0, 0.1].map((x) => <B key={x} p={[x, 0.5, 0.074]} s={[0.012, 0.62, 0.008]} c="#9ca3af" />)}
          <B p={[0, 0.9, -0.02]} s={[0.2, 0.04, 0.06]} c="#111827" />
          <Cyl p={[0.16, 0.9, -0.02]} r={0.03} h={0.04} c="#dc2626" />
        </group>
      );
    case 'rice_cooker':
      return (
        <group>
          <B p={[0, 0.35, 0]} s={[0.8, 0.7, 0.55]} c="#8b5a2b" />
          <B p={[0, 0.72, 0]} s={[0.84, 0.04, 0.6]} c="#d6d3d1" />
          <Cyl p={[0, 0.87, 0]} r={0.2} h={0.26} c="#f8fafc" seg={12} />
          <Cyl p={[0, 1.03, 0]} r={0.2} rt={0.12} h={0.06} c="#d1d5db" seg={12} />
          <Ball p={[0, 1.08, 0]} r={0.035} c="#111827" />
          <B p={[-0.22, 0.92, 0]} s={[0.05, 0.03, 0.1]} c="#111827" />
          <B p={[0.22, 0.92, 0]} s={[0.05, 0.03, 0.1]} c="#111827" />
          <B p={[0, 0.83, 0.2]} s={[0.12, 0.12, 0.02]} c="#dc2626" />
          <B p={[0, 0.86, 0.212]} s={[0.03, 0.03, 0.01]} c="#fdba74" e={powered ? '#f97316' : undefined} />
        </group>
      );
    case 'electric_oven':
      return (
        <group>
          <B p={[0, 0.8, -0.02]} s={[0.86, 1.6, 0.74]} c="#4b5563" />
          <B p={[0, 0.12, 0.352]} s={[0.78, 0.18, 0.01]} c="#374151" />
          <B p={[0, 0.56, 0.352]} s={[0.74, 0.56, 0.02]} c="#0b0f14" />
          <B p={[0, 0.56, 0.364]} s={[0.56, 0.34, 0.006]} c="#1f2937" e={powered ? '#431407' : undefined} />
          <Tube p={[0, 0.88, 0.39]} rot={ACROSS} r={0.018} h={0.6} c={CHROME} metal />
          <B p={[0, 1.0, 0.352]} s={[0.78, 0.12, 0.01]} c="#d1d5db" />
          {[-0.28, -0.14, 0.14, 0.28].map((x) => <Ball key={x} p={[x, 1.0, 0.37]} r={0.035} c="#111827" />)}
          <B p={[0, 1.0, 0.36]} s={[0.14, 0.06, 0.006]} c="#0f172a" e={powered ? '#22d3ee' : undefined} />
          <B p={[0, 1.3, 0.352]} s={[0.74, 0.4, 0.02]} c="#0b0f14" />
          <Tube p={[0, 1.52, 0.39]} rot={ACROSS} r={0.018} h={0.6} c={CHROME} metal />
        </group>
      );
    case 'gas_cylinder':
      return (
        <group>
          <Cyl p={[0, 0.04, 0]} r={0.2} h={0.08} c="#7c2d12" seg={12} />
          <Cyl p={[0, 0.38, 0]} r={0.24} h={0.62} c="#ea580c" seg={12} />
          <Cyl p={[0, 0.75, 0]} r={0.24} rt={0.12} h={0.12} c="#ea580c" seg={12} />
          <Cyl p={[0, 0.84, 0]} r={0.05} h={0.08} c="#ca8a04" />
          <B p={[0.05, 0.9, 0]} s={[0.14, 0.05, 0.07]} c="#9ca3af" />
          <mesh position={[0, 0.86, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16, 0.018, 4, 12]} />
            <meshStandardMaterial color="#7c2d12" flatShading />
          </mesh>
          {[-0.14, 0.14].map((x) => <B key={x} p={[x, 0.81, 0]} s={[0.03, 0.1, 0.03]} c="#7c2d12" />)}
          <B p={[0, 0.42, 0.242]} s={[0.2, 0.14, 0.006]} c="#fef3c7" />
        </group>
      );
    case 'water_drum':
      return (
        <group>
          <Cyl p={[0, 0.48, 0]} r={0.36} h={0.96} c="#2563eb" seg={14} />
          {[0.32, 0.64].map((y) => <Cyl key={y} p={[0, y, 0]} r={0.375} h={0.05} c="#1d4ed8" seg={14} />)}
          <Cyl p={[0, 0.95, 0]} r={0.38} h={0.04} c="#1d4ed8" seg={14} />
          <Cyl p={[0, 0.965, 0]} r={0.33} h={0.012} c="#7dd3fc" seg={14} />
          <Cyl p={[0.1, 1.0, 0.06]} r={0.09} rt={0.13} h={0.08} c="#f97316" />
          <B p={[0.26, 1.03, 0.06]} s={[0.14, 0.02, 0.04]} c="#f97316" />
        </group>
      );
    case 'centre_table':
      return (
        <group>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <Cyl key={i} p={[sx * 0.68, 0.21, sz * 0.3]} r={0.025} h={0.42} c={CHROME} />
          ))}
          <B p={[0, 0.14, 0]} s={[1.3, 0.03, 0.56]} c="#5b3a1e" />
          <B p={[0, 0.435, 0]} s={[1.56, 0.03, 0.74]} c="#bfe6f5" o={0.45} />
          <B p={[-0.3, 0.165, 0.05]} s={[0.3, 0.02, 0.22]} c="#b91c1c" />
          <B p={[-0.28, 0.185, 0.05]} s={[0.28, 0.02, 0.2]} c="#f8fafc" />
          <Cyl p={[0.4, 0.52, 0]} r={0.06} rt={0.04} h={0.14} c="#f8fafc" />
          <Ball p={[0.4, 0.66, 0]} r={0.09} c="#16a34a" />
          <Ball p={[0.36, 0.7, 0.04]} r={0.04} c="#f472b6" />
        </group>
      );
    case 'satellite_dish':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.5, 0.06, 0.5]} c="#374151" />
          <Cyl p={[0, 0.72, 0]} r={0.04} h={1.34} c="#9ca3af" />
          <B p={[0, 1.4, 0]} s={[0.1, 0.14, 0.1]} c="#4b5563" />
          <Tube p={[0, 1.52, 0.1]} rot={[1.15, 0, 0]} r={0.44} rt={0.38} h={0.06} c="#e5e7eb" />
          <Tube p={[0, 1.535, 0.135]} rot={[1.15, 0, 0]} r={0.36} rt={0.34} h={0.02} c="#cbd5e1" />
          <Tube p={[0, 1.36, 0.42]} rot={[1.9, 0, 0]} r={0.012} h={0.52} c="#4b5563" />
          <B p={[0, 1.44, 0.66]} s={[0.07, 0.07, 0.12]} c="#111827" />
          <B p={[0.02, 0.7, -0.045]} s={[0.015, 1.3, 0.015]} c="#111827" />
        </group>
      );
    case 'cctv':
      return (
        <group>
          <B p={[0, 0.02, 0]} s={[0.3, 0.04, 0.3]} c="#374151" />
          <Cyl p={[0, 0.9, 0]} r={0.035} h={1.8} c="#9ca3af" />
          <B p={[0, 1.82, 0.12]} s={[0.16, 0.16, 0.36]} c="#f8fafc" />
          <B p={[0, 1.82, 0.31]} s={[0.11, 0.11, 0.03]} c="#111827" />
          <B p={[0.06, 1.9, 0.28]} s={[0.03, 0.03, 0.03]} c="#ef4444" e={powered === false ? undefined : '#ef4444'} />
        </group>
      );
    case 'solar':
      return (
        <group>
          <B p={[-0.7, 0.4, 0.5]} s={[0.06, 0.8, 0.06]} c="#64748b" />
          <B p={[0.7, 0.4, 0.5]} s={[0.06, 0.8, 0.06]} c="#64748b" />
          <B p={[-0.7, 0.8, -0.5]} s={[0.06, 1.6, 0.06]} c="#64748b" />
          <B p={[0.7, 0.8, -0.5]} s={[0.06, 1.6, 0.06]} c="#64748b" />
          <group position={[0, 1.2, 0]} rotation={[0.6, 0, 0]}>
            <B p={[0, 0, 0]} s={[1.8, 0.05, 1.4]} c="#1e3a8a" />
            <B p={[0, 0.03, 0]} s={[1.7, 0.01, 0.02]} c="#93c5fd" />
            <B p={[0, 0.03, 0]} s={[0.02, 0.01, 1.3]} c="#93c5fd" />
          </group>
          <B p={[0.7, 0.3, 0.8]} s={[0.4, 0.6, 0.25]} c="#e5e7eb" />
        </group>
      );
    case 'starlink':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.5, 0.06, 0.5]} c="#374151" />
          <Cyl p={[0, 0.85, 0]} r={0.04} h={1.6} c="#9ca3af" />
          <B p={[0, 1.66, 0]} s={[0.1, 0.12, 0.1]} c="#4b5563" />
          <group position={[0, 1.76, 0.02]} rotation={[0.45, 0, 0]}>
            <B p={[0, 0, 0]} s={[0.64, 0.04, 0.42]} c="#f8fafc" />
            <B p={[0, -0.035, 0]} s={[0.5, 0.03, 0.3]} c="#1f2937" />
          </group>
          <B p={[0.02, 0.5, -0.045]} s={[0.02, 1, 0.02]} c="#111827" />
          <B p={[0.14, 0.2, 0.14]} s={[0.16, 0.28, 0.07]} c="#f8fafc" />
          <B p={[0.14, 0.29, 0.18]} s={[0.03, 0.03, 0.01]} c="#22c55e" e={powered === false ? undefined : '#22c55e'} />
        </group>
      );
    case 'mango_tree':
      return (
        <group>
          <Cyl p={[0, 0.8, 0]} r={0.14} rt={0.1} h={1.6} c="#6b4423" seg={6} />
          <Ball p={[0, 2.1, 0]} r={0.95} c="#2f7d32" />
          <Ball p={[0.5, 1.75, 0.3]} r={0.6} c="#388e3c" />
          <Ball p={[-0.5, 1.8, -0.2]} r={0.6} c="#2e7d32" />
          {[[0.4, 1.4, 0.6], [-0.6, 1.5, 0.4], [0.7, 1.9, -0.3], [-0.2, 1.35, -0.7]].map((p, i) => (
            <Ball key={i} p={p as V3} r={0.09} c={i % 2 ? '#f59e0b' : '#84cc16'} />
          ))}
        </group>
      );
    case 'suya_grill':
      return (
        <group>
          {legs(0.6, 0.4, 0.6, '#1f2937', 0.04)}
          <B p={[0, 0.7, 0]} s={[0.7, 0.2, 0.45]} c="#111827" />
          <B p={[0, 0.81, 0]} s={[0.66, 0.02, 0.41]} c="#f97316" e="#ea580c" />
          {[-0.2, -0.07, 0.07, 0.2].map((x, i) => (
            <B key={i} p={[x, 0.85, 0]} s={[0.04, 0.04, 0.5]} c="#92400e" />
          ))}
        </group>
      );
    case 'gate':
      return (
        <group position={[0, 0, 0.5]}>
          <B p={[-0.5, 0.9, 0]} s={[0.22, 1.8, 0.22]} c="#e7dccb" />
          <B p={[0.5, 0.9, 0]} s={[0.22, 1.8, 0.22]} c="#e7dccb" />
          <B p={[0, 0.75, 0.06]} s={[0.78, 1.3, 0.04]} c="#0f5132" />
          {[-0.25, 0, 0.25].map((x, i) => (
            <B key={i} p={[x, 0.75, 0.09]} s={[0.04, 1.2, 0.02]} c="#facc15" />
          ))}
        </group>
      );
    case 'rug':
      return (
        <group>
          <B p={[0, 0.01, 0]} s={[1.9, 0.02, 1.9]} c="#991b1b" />
          <B p={[0, 0.021, 0]} s={[1.5, 0.01, 1.5]} c="#b45309" />
          <B p={[0, 0.026, 0]} s={[0.9, 0.01, 0.9]} c="#7f1d1d" />
        </group>
      );
    case 'plant':
      return (
        <group>
          <Cyl p={[0, 0.2, 0]} r={0.16} rt={0.22} h={0.4} c="#c2410c" />
          <Cyl p={[0, 0.41, 0]} r={0.235} h={0.05} c="#c2410c" />
          <Cyl p={[0, 0.42, 0]} r={0.2} h={0.03} c="#3f2a1d" />
          <Leaves y={0.42} n={9} len={0.62} c1="#15803d" c2="#16a34a" />
          <Leaves y={0.44} n={5} len={0.5} c1="#16a34a" c2="#15803d" spread={0.4} />
        </group>
      );

    // ── Luxury ───────────────────────────────────────────────
    case 'leather_sectional':
      return (
        <group>
          <B p={[0, 0.2, -0.5]} s={[2.9, 0.34, 0.95]} c="#e8dcc6" />
          <B p={[-0.2, 0.43, -0.45]} s={[2.4, 0.12, 0.78]} c="#f3ead9" />
          <B p={[0, 0.68, -0.9]} s={[2.9, 0.6, 0.18]} c="#d9c8a8" />
          <B p={[1.05, 0.2, 0.45]} s={[0.8, 0.34, 1.0]} c="#e8dcc6" />
          <B p={[1.05, 0.43, 0.42]} s={[0.7, 0.12, 0.95]} c="#f3ead9" />
          <B p={[1.4, 0.5, -0.05]} s={[0.14, 0.32, 1.9]} c="#d9c8a8" />
          <B p={[-1.4, 0.5, -0.5]} s={[0.14, 0.32, 0.95]} c="#d9c8a8" />
          {[-1.0, -0.2, 0.6].map((x, i) => (
            <B key={i} p={[x, 0.66, -0.74]} s={[0.42, 0.34, 0.12]} c={i === 1 ? '#7b1f3a' : '#d4af37'} />
          ))}
          <B p={[-0.6, 0.22, 0.55]} s={[0.9, 0.06, 0.6]} c="#d4af37" />
          <B p={[-0.6, 0.11, 0.55]} s={[0.8, 0.22, 0.5]} c="#111827" />
          <Cyl p={[-0.6, 0.32, 0.55]} r={0.08} h={0.14} c="#f8fafc" />
        </group>
      );
    case 'gold_throne':
      return (
        <group>
          <B p={[0, 0.06, 0]} s={[0.9, 0.12, 0.9]} c="#7b1f3a" />
          <B p={[0, 0.3, 0.02]} s={[0.72, 0.36, 0.66]} c="#d4af37" />
          <B p={[0, 0.5, 0.05]} s={[0.6, 0.08, 0.55]} c="#991b1b" />
          <B p={[0, 1.05, -0.3]} s={[0.72, 1.1, 0.12]} c="#d4af37" />
          <B p={[0, 1.0, -0.23]} s={[0.5, 0.8, 0.04]} c="#991b1b" />
          <B p={[-0.36, 0.65, 0.02]} s={[0.1, 0.3, 0.62]} c="#c9a227" />
          <B p={[0.36, 0.65, 0.02]} s={[0.1, 0.3, 0.62]} c="#c9a227" />
          <Ball p={[-0.36, 1.66, -0.3]} r={0.07} c="#f6d77a" />
          <Ball p={[0.36, 1.66, -0.3]} r={0.07} c="#f6d77a" />
          <Ball p={[0, 1.72, -0.3]} r={0.1} c="#ef4444" />
        </group>
      );
    case 'massage_chair':
      return (
        <group>
          <B p={[0, 0.2, 0.05]} s={[0.7, 0.4, 0.75]} c="#1f1f1f" />
          <B p={[0, 0.44, 0.08]} s={[0.56, 0.1, 0.62]} c="#3f3f46" />
          <group position={[0, 0.5, -0.3]} rotation={[-0.35, 0, 0]}>
            <B p={[0, 0.42, 0]} s={[0.66, 0.9, 0.2]} c="#1f1f1f" />
            <B p={[0, 0.42, 0.08]} s={[0.5, 0.8, 0.06]} c="#52525b" />
          </group>
          <B p={[-0.36, 0.55, 0.05]} s={[0.12, 0.35, 0.7]} c="#27272a" />
          <B p={[0.36, 0.55, 0.05]} s={[0.12, 0.35, 0.7]} c="#27272a" />
          <B p={[0.36, 0.74, 0.28]} s={[0.1, 0.02, 0.14]} c="#38bdf8" e={powered ? '#0284c7' : undefined} />
          <group position={[0, 0.3, 0.42]} rotation={[0.6, 0, 0]}>
            <B p={[0, -0.12, 0]} s={[0.5, 0.36, 0.14]} c="#27272a" />
          </group>
        </group>
      );
    case 'grand_piano':
      return (
        <group>
          {[[-0.55, 0.45], [0.55, 0.45], [0.2, -0.75]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.36, z]} r={0.05} h={0.72} c="#0a0a0a" />
          ))}
          <B p={[0, 0.82, 0.15]} s={[1.4, 0.26, 0.8]} c="#0b0b0f" />
          <Cyl p={[0.1, 0.82, -0.35]} r={0.62} h={0.26} c="#0b0b0f" seg={18} />
          <B p={[0, 0.98, 0.15]} s={[1.32, 0.04, 0.72]} c="#c9a227" />
          <group position={[-0.68, 0.96, -0.1]} rotation={[0, 0, -0.75]}>
            <B p={[0.65, 0, 0]} s={[1.3, 0.03, 1.3]} c="#111114" />
          </group>
          <B p={[0, 0.86, 0.62]} s={[1.3, 0.08, 0.2]} c="#f8fafc" />
          {Array.from({ length: 9 }, (_, i) => (
            <B key={i} p={[-0.56 + i * 0.14, 0.92, 0.58]} s={[0.05, 0.04, 0.1]} c="#111" />
          ))}
          <B p={[0, 0.48, 0.88]} s={[0.8, 0.08, 0.26]} c="#0b0b0f" />
          {legs(0.74, 0.22, 0.44, '#0b0b0f', 0.04).map((l, i) => (
            <group key={i} position={[0, 0, 0.88]}>{l}</group>
          ))}
        </group>
      );
    case 'home_cinema':
      return (
        <group>
          <B p={[0, 0.22, 0]} s={[2.4, 0.44, 0.5]} c="#1c1917" />
          <B p={[0, 0.3, 0.26]} s={[2.3, 0.2, 0.02]} c="#44403c" />
          <B p={[0, 1.35, -0.3]} s={[2.6, 1.5, 0.06]} c="#050505" />
          <B p={[0, 1.35, -0.26]} s={[2.5, 1.4, 0.01]} c={powered ? '#7c3aed' : '#0f0f12'} e={powered ? '#4c1d95' : undefined} />
          <B p={[0, 0.5, 0.05]} s={[1.6, 0.1, 0.16]} c="#18181b" />
          {[-1.38, 1.38].map((x, i) => (
            <group key={i}>
              <B p={[x, 0.65, 0]} s={[0.22, 1.3, 0.3]} c="#18181b" />
              <Cyl p={[x, 0.95, 0.16]} r={0.07} h={0.02} c="#d4af37" />
              <Cyl p={[x, 0.55, 0.16]} r={0.09} h={0.02} c="#d4af37" />
            </group>
          ))}
        </group>
      );
    case 'aquarium':
      return (
        <group>
          <B p={[0, 0.35, 0]} s={[1.9, 0.7, 0.6]} c="#1f2937" />
          <B p={[0, 0.72, 0]} s={[1.86, 0.06, 0.56]} c="#fde68a" />
          <B p={[0, 1.18, 0]} s={[1.86, 0.86, 0.56]} c="#22d3ee" o={0.35} />
          <B p={[0, 1.64, 0]} s={[1.92, 0.08, 0.62]} c="#111827" />
          {[[-0.6, 0.95], [-0.2, 1.0], [0.5, 0.92], [0.75, 1.05]].map(([x, h], i) => (
            <B key={i} p={[x, 0.75 + h / 4, -0.12]} s={[0.05, h / 2, 0.05]} c="#16a34a" />
          ))}
          {[[-0.4, 1.25, '#f97316'], [0.15, 1.1, '#facc15'], [0.45, 1.35, '#ef4444'], [-0.7, 1.4, '#3b82f6']].map(([x, y, c], i) => (
            <B key={i} p={[x as number, y as number, 0.05]} s={[0.14, 0.07, 0.04]} c={c as string} />
          ))}
          <Ball p={[0.1, 0.82, 0.1]} r={0.08} c="#a8a29e" />
        </group>
      );
    case 'marble_bar':
      return (
        <group>
          <B p={[0, 0.5, 0.05]} s={[1.9, 1.0, 0.6]} c="#f5f5f4" />
          <B p={[0, 1.02, 0.08]} s={[1.98, 0.05, 0.68]} c="#e7e5e4" />
          <B p={[0, 0.1, 0.36]} s={[1.9, 0.04, 0.02]} c="#d4af37" />
          <B p={[0, 0.98, 0.37]} s={[1.98, 0.03, 0.02]} c="#d4af37" />
          <B p={[0, 0.55, 0.36]} s={[1.6, 0.6, 0.01]} c="#a8a29e" />
          {[-0.7, -0.5, -0.3].map((x, i) => (
            <group key={i}>
              <Cyl p={[x, 1.17, -0.05]} r={0.045} h={0.25} c={['#14532d', '#78350f', '#1e3a8a'][i]} />
              <Cyl p={[x, 1.33, -0.05]} r={0.015} h={0.08} c="#d4af37" />
            </group>
          ))}
          <Cyl p={[0.45, 1.13, 0.05]} r={0.12} rt={0.14} h={0.18} c="#cbd5e1" />
          <Cyl p={[0.45, 1.27, 0.05]} r={0.04} h={0.22} c="#14532d" />
          {[0.1, 0.2].map((x, i) => (
            <Cyl key={i} p={[x, 1.12, 0.2]} r={0.03} rt={0.05} h={0.12} c="#fef3c7" />
          ))}
        </group>
      );
    case 'snooker':
      return (
        <group>
          {[[-1.25, -0.75], [1.25, -0.75], [-1.25, 0.75], [1.25, 0.75], [0, -0.75], [0, 0.75]].map(([x, z], i) => (
            <B key={i} p={[x, 0.35, z]} s={[0.14, 0.7, 0.14]} c="#3b1d0e" />
          ))}
          <B p={[0, 0.76, 0]} s={[2.9, 0.14, 1.9]} c="#5b2c12" />
          <B p={[0, 0.84, 0]} s={[2.6, 0.04, 1.6]} c="#166534" />
          {[[-1.3, -0.8], [0, -0.8], [1.3, -0.8], [-1.3, 0.8], [0, 0.8], [1.3, 0.8]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.84, z]} r={0.06} h={0.03} c="#0a0a0a" />
          ))}
          {[[0.5, 0], [0.62, 0.07], [0.62, -0.07], [0.74, 0.14], [0.74, 0], [0.74, -0.14]].map(([x, z], i) => (
            <Ball key={i} p={[x, 0.9, z]} r={0.04} c="#dc2626" detail={1} />
          ))}
          <Ball p={[-0.7, 0.9, 0.1]} r={0.04} c="#f8fafc" detail={1} />
          <Ball p={[0.2, 0.9, -0.3]} r={0.04} c="#facc15" detail={1} />
          <B p={[-0.2, 0.9, 0.35]} s={[1.5, 0.025, 0.025]} c="#d6b46a" />
        </group>
      );
    case 'arcade':
      return (
        <group>
          <B p={[0, 0.85, -0.05]} s={[0.7, 1.7, 0.7]} c="#4c1d95" />
          <B p={[-0.36, 0.85, -0.05]} s={[0.02, 1.7, 0.72]} c="#ec4899" e="#be185d" />
          <B p={[0.36, 0.85, -0.05]} s={[0.02, 1.7, 0.72]} c="#ec4899" e="#be185d" />
          <group position={[0, 1.25, 0.25]} rotation={[-0.25, 0, 0]}>
            <B p={[0, 0, 0]} s={[0.56, 0.45, 0.04]} c={powered ? '#22d3ee' : '#0f172a'} e={powered ? '#0e7490' : undefined} />
          </group>
          <B p={[0, 0.92, 0.3]} s={[0.66, 0.06, 0.25]} c="#1e1b4b" />
          <Cyl p={[-0.12, 0.99, 0.3]} r={0.02} h={0.1} c="#111" />
          <Ball p={[-0.12, 1.05, 0.3]} r={0.04} c="#ef4444" />
          {[0.06, 0.14, 0.22].map((x, i) => (
            <Cyl key={i} p={[x, 0.96, 0.32]} r={0.03} h={0.02} c={['#facc15', '#22c55e', '#3b82f6'][i]} />
          ))}
          <B p={[0, 1.6, 0.12]} s={[0.66, 0.14, 0.04]} c="#facc15" e="#ca8a04" />
        </group>
      );
    case 'home_gym':
      return (
        <group>
          <B p={[-0.35, 0.1, 0.05]} s={[1.1, 0.2, 0.6]} c="#18181b" />
          <B p={[-0.35, 0.21, 0.05]} s={[1.0, 0.02, 0.48]} c="#3f3f46" />
          <B p={[-0.85, 0.6, -0.17]} s={[0.05, 1.0, 0.05]} c="#71717a" />
          <B p={[-0.85, 0.6, 0.27]} s={[0.05, 1.0, 0.05]} c="#71717a" />
          <B p={[-0.85, 1.1, 0.05]} s={[0.16, 0.24, 0.55]} c="#27272a" />
          <B p={[-0.78, 1.12, 0.05]} s={[0.01, 0.16, 0.36]} c="#22c55e" e={powered ? '#15803d' : undefined} />
          <B p={[0.6, 0.35, -0.1]} s={[0.6, 0.06, 0.35]} c="#52525b" />
          {legs(0.56, 0.3, 0.33, '#3f3f46', 0.04).map((l, i) => (
            <group key={i} position={[0.6, 0, -0.1]}>{l}</group>
          ))}
          {[0.4, 0.55, 0.7, 0.85].map((x, i) => (
            <group key={i}>
              <Cyl p={[x, 0.45, -0.18]} r={0.045} h={0.05} c="#111" />
              <Cyl p={[x, 0.45, -0.02]} r={0.045} h={0.05} c="#111" />
            </group>
          ))}
          <B p={[0.6, 0.06, 0.3]} s={[0.7, 0.02, 0.35]} c="#7c3aed" />
        </group>
      );
    case 'jacuzzi':
      return (
        <group>
          <B p={[0, 0.3, 0]} s={[1.95, 0.6, 1.95]} c="#78350f" />
          <B p={[0, 0.62, 0]} s={[1.95, 0.05, 1.95]} c="#f5f5f4" />
          <B p={[0, 0.63, 0]} s={[1.6, 0.04, 1.6]} c="#22d3ee" e="#0e7490" />
          {[[-0.5, -0.4], [0.3, -0.6], [0.6, 0.3], [-0.2, 0.5], [0, 0]].map(([x, z], i) => (
            <Ball key={i} p={[x, 0.67, z]} r={0.05 + (i % 2) * 0.02} c="#ecfeff" />
          ))}
          {[[-0.88, -0.88], [0.88, -0.88]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.7, z]} r={0.05} h={0.1} c="#d4af37" />
          ))}
          <Cyl p={[0.8, 0.72, 0.8]} r={0.06} h={0.14} c="#fde68a" />
        </group>
      );
    case 'gold_toilet':
      return (
        <group>
          <Cyl p={[0, 0.2, 0.08]} r={0.2} rt={0.24} h={0.4} c="#d4af37" />
          <B p={[0, 0.42, 0.1]} s={[0.46, 0.04, 0.52]} c="#f6d77a" />
          <B p={[0, 0.62, -0.28]} s={[0.48, 0.52, 0.2]} c="#d4af37" />
          <B p={[0.12, 0.9, -0.28]} s={[0.1, 0.03, 0.06]} c="#fef3c7" />
          <B p={[0, 0.01, 0]} s={[0.9, 0.02, 0.9]} c="#111827" />
        </group>
      );
    case 'smart_fridge':
      return (
        <group>
          <B p={[0, 0.95, 0]} s={[1.6, 1.9, 0.75]} c="#9ca3af" />
          <B p={[0, 0.95, 0.38]} s={[0.02, 1.86, 0.02]} c="#4b5563" />
          <B p={[-0.08, 1.1, 0.4]} s={[0.04, 0.6, 0.04]} c="#e5e7eb" />
          <B p={[0.08, 1.1, 0.4]} s={[0.04, 0.6, 0.04]} c="#e5e7eb" />
          <B p={[-0.45, 1.25, 0.38]} s={[0.4, 0.55, 0.01]} c={powered ? '#38bdf8' : '#111827'} e={powered ? '#0369a1' : undefined} />
          <B p={[0.45, 1.3, 0.38]} s={[0.22, 0.3, 0.01]} c="#1f2937" />
        </group>
      );
    case 'chef_island':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[1.9, 0.9, 0.8]} c="#1f2937" />
          <B p={[0, 0.92, 0]} s={[1.98, 0.06, 0.88]} c="#f5f5f4" />
          <B p={[0, 0.06, 0.41]} s={[1.9, 0.02, 0.02]} c="#d4af37" />
          {[-0.62, -0.42].map((x) => [-0.12, 0.12].map((z) => (
            <Cyl key={`${x}${z}`} p={[x, 0.96, z]} r={0.08} h={0.02} c="#0a0a0a" />
          )))}
          <Cyl p={[-0.42, 1.04, 0.12]} r={0.13} h={0.14} c="#cbd5e1" />
          <B p={[0.4, 0.97, 0]} s={[0.5, 0.04, 0.32]} c="#a16207" />
          {[0.6, 0.75, 0.85].map((x, i) => (
            <Ball key={i} p={[x, 1.0, -0.25]} r={0.06} c={['#ef4444', '#f97316', '#22c55e'][i]} />
          ))}
          {[-0.5, 0.2].map((x, i) => (
            <group key={i} position={[x, 0, 0.7]}>
              <Cyl p={[0, 0.3, 0]} r={0.025} h={0.6} c="#d4af37" />
              <Cyl p={[0, 0.62, 0]} r={0.18} h={0.06} c="#111827" />
            </group>
          ))}
        </group>
      );
    case 'swimming_pool':
      return (
        <group>
          <B p={[0, 0.06, 0]} s={[2.98, 0.12, 2.98]} c="#e7e5e4" />
          <B p={[0, 0.125, 0]} s={[2.5, 0.02, 2.5]} c="#0ea5e9" e="#0369a1" />
          <B p={[0, 0.13, 0]} s={[2.2, 0.01, 2.2]} c="#38bdf8" o={0.6} />
          {[-0.4, 0.4].map((x, i) => (
            <group key={i}>
              <B p={[x + 0.8, 0.35, -1.3]} s={[0.03, 0.5, 0.03]} c="#d1d5db" />
            </group>
          ))}
          <B p={[1.2, 0.6, -1.3]} s={[0.84, 0.03, 0.03]} c="#d1d5db" />
          <group position={[-0.6, 0.15, 0.4]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.2, 0.07, 6, 14]} />
              <meshStandardMaterial color="#f43f5e" flatShading />
            </mesh>
          </group>
          <B p={[-1.25, 0.2, -1.25]} s={[0.4, 0.06, 0.4]} c="#f8fafc" />
        </group>
      );
    case 'fountain':
      return (
        <group>
          <Cyl p={[0, 0.2, 0]} r={0.95} h={0.4} c="#e7e5e4" seg={16} />
          <Cyl p={[0, 0.39, 0]} r={0.85} h={0.03} c="#38bdf8" seg={16} />
          <Cyl p={[0, 0.75, 0]} r={0.1} rt={0.14} h={0.7} c="#f5f5f4" />
          <Cyl p={[0, 1.12, 0]} r={0.15} rt={0.45} h={0.12} c="#e7e5e4" seg={14} />
          <Cyl p={[0, 1.4, 0]} r={0.06} h={0.5} c="#f5f5f4" />
          <Ball p={[0, 1.7, 0]} r={0.1} c="#d4af37" />
          <Cyl p={[0, 1.2, 0]} r={0.06} rt={0.25} h={0.25} c="#7dd3fc" />
        </group>
      );
    case 'chandelier_lamp':
      return (
        <group>
          <Cyl p={[0, 0.04, 0]} r={0.25} h={0.08} c="#d4af37" />
          <Cyl p={[0, 0.9, 0]} r={0.03} h={1.7} c="#d4af37" />
          <Cyl p={[0, 1.6, 0]} r={0.35} rt={0.15} h={0.12} c="#c9a227" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <B key={i} p={[Math.cos(a) * 0.3, 1.42, Math.sin(a) * 0.3]} s={[0.04, 0.26, 0.04]} c="#e0f2fe" e={powered ? '#bae6fd' : undefined} />;
          })}
          <Ball p={[0, 1.8, 0]} r={0.14} c="#fef9c3" />
          <Ball p={[0, 1.33, 0]} r={0.08} c="#e0f2fe" />
        </group>
      );
    case 'bronze_head':
      return (
        <group>
          <B p={[0, 0.5, 0]} s={[0.5, 1.0, 0.5]} c="#1c1917" />
          <B p={[0, 1.01, 0]} s={[0.54, 0.03, 0.54]} c="#d4af37" />
          <Cyl p={[0, 1.15, 0]} r={0.14} rt={0.12} h={0.25} c="#92400e" />
          <Ball p={[0, 1.42, 0.02]} r={0.2} c="#a16207" detail={1} />
          <Cyl p={[0, 1.66, -0.02]} r={0.17} rt={0.2} h={0.18} c="#92400e" />
          {[0.12, 0.2, 0.28].map((y, i) => (
            <Cyl key={i} p={[0, 1.02 + y, 0]} r={0.15} h={0.035} c="#b45309" />
          ))}
        </group>
      );
    case 'gilded_mirror':
      return (
        <group>
          <B p={[0, 0.05, -0.1]} s={[0.6, 0.1, 0.4]} c="#c9a227" />
          <B p={[0, 1.05, -0.2]} s={[0.75, 1.9, 0.08]} c="#d4af37" />
          <B p={[0, 1.05, -0.155]} s={[0.6, 1.72, 0.01]} c="#dbeafe" e="#1e3a8a" />
          <Ball p={[0, 2.05, -0.2]} r={0.1} c="#f6d77a" />
        </group>
      );
    case 'ming_vase':
      return (
        <group>
          <Cyl p={[0, 0.12, 0]} r={0.28} h={0.24} c="#d4af37" />
          <Cyl p={[0, 0.45, 0]} r={0.17} rt={0.3} h={0.42} c="#f8fafc" seg={14} />
          <Cyl p={[0, 0.82, 0]} r={0.3} rt={0.12} h={0.32} c="#f8fafc" seg={14} />
          <Cyl p={[0, 1.05, 0]} r={0.12} rt={0.16} h={0.14} c="#f8fafc" seg={14} />
          <Cyl p={[0, 0.63, 0]} r={0.305} h={0.06} c="#1e40af" seg={14} />
          <Cyl p={[0, 0.4, 0]} r={0.24} h={0.05} c="#1e40af" seg={14} />
          <Cyl p={[0, 1.0, 0]} r={0.14} h={0.03} c="#1e40af" seg={14} />
        </group>
      );
    case 'wine_cellar':
      return (
        <group>
          <B p={[0, 1.0, 0]} s={[0.95, 2.0, 0.6]} c="#1c1917" />
          <B p={[0, 1.0, 0.31]} s={[0.8, 1.84, 0.02]} c="#bae6fd" o={0.45} />
          {[0.3, 0.65, 1.0, 1.35, 1.7].map((y, i) => (
            <group key={i}>
              <B p={[0, y, 0]} s={[0.82, 0.03, 0.5]} c="#92400e" />
              {[-0.25, 0, 0.25].map((x, j) => (
                <Cyl key={j} p={[x, y + 0.1, 0]} r={0.06} h={0.18} c={j === 1 ? '#7f1d1d' : '#14532d'} />
              ))}
            </group>
          ))}
          <B p={[0.38, 1.0, 0.33]} s={[0.03, 0.3, 0.03]} c="#d4af37" />
        </group>
      );
    case 'cigar_lounge':
      return (
        <group>
          {[[-0.5, 0.45], [0.5, 0.45]].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <B p={[0, 0.25, 0]} s={[0.7, 0.5, 0.7]} c="#451a03" />
              <B p={[0, 0.65, -0.28]} s={[0.7, 0.5, 0.14]} c="#451a03" />
            </group>
          ))}
          <Cyl p={[0, 0.3, -0.35]} r={0.4} h={0.05} c="#1c1917" />
          <Cyl p={[0, 0.15, -0.35]} r={0.08} h={0.3} c="#d4af37" />
          <Cyl p={[-0.1, 0.4, -0.35]} r={0.05} rt={0.07} h={0.14} c="#bae6fd" />
          <Cyl p={[0.12, 0.38, -0.35]} r={0.04} h={0.1} c="#92400e" />
        </group>
      );
    case 'golden_bed':
      return (
        <group>
          <B p={[0, 0.25, 0]} s={[1.95, 0.5, 2.95]} c="#d4af37" />
          <B p={[0, 0.58, 0.05]} s={[1.8, 0.2, 2.7]} c="#fef3c7" />
          <B p={[0, 0.7, 0.55]} s={[1.8, 0.05, 1.6]} c="#7f1d1d" />
          <B p={[-0.4, 0.74, -1.0]} s={[0.55, 0.14, 0.35]} c="#fff" />
          <B p={[0.4, 0.74, -1.0]} s={[0.55, 0.14, 0.35]} c="#fff" />
          <B p={[0, 0.95, -1.45]} s={[2.0, 1.4, 0.1]} c="#c9a227" />
          {[[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]].map(([x, z], i) => (
            <group key={i}>
              <Cyl p={[x, 1.1, z]} r={0.06} h={2.2} c="#d4af37" />
              <Ball p={[x, 2.25, z]} r={0.1} c="#f6d77a" />
            </group>
          ))}
        </group>
      );
    case 'sauna':
      return (
        <group>
          <B p={[0, 1.0, 0]} s={[1.9, 2.0, 1.9]} c="#b45309" />
          <B p={[0, 1.0, 0.96]} s={[0.8, 1.7, 0.03]} c="#bae6fd" o={0.5} />
          <B p={[-0.5, 1.0, 0.97]} s={[0.04, 1.7, 0.04]} c="#78350f" />
          <B p={[0.6, 0.4, -0.6]} s={[0.5, 0.06, 1.0]} c="#92400e" />
          <B p={[0.6, 0.8, -0.6]} s={[0.5, 0.06, 1.0]} c="#92400e" />
          <B p={[0.9, 1.9, 0.9]} s={[0.1, 0.1, 0.1]} c="#fef9c3" e={powered ? '#fde68a' : undefined} />
        </group>
      );
    case 'trophy_cabinet':
      return (
        <group>
          <B p={[0, 1.0, 0]} s={[1.9, 2.0, 0.5]} c="#451a03" />
          <B p={[0, 1.0, 0.26]} s={[1.7, 1.8, 0.02]} c="#bae6fd" o={0.4} />
          {[0.45, 1.0, 1.55].map((y, i) => (
            <group key={i}>
              <B p={[0, y - 0.15, 0]} s={[1.7, 0.03, 0.4]} c="#78350f" />
              {[-0.55, 0, 0.55].map((x, j) => (
                <group key={j}>
                  <Cyl p={[x, y, 0]} r={0.08} rt={0.14} h={0.22} c="#fbbf24" />
                  <Cyl p={[x, y - 0.1, 0]} r={0.1} h={0.04} c="#d4af37" />
                </group>
              ))}
            </group>
          ))}
        </group>
      );
    case 'lion_statue':
      return (
        <group>
          <B p={[0, 0.25, 0]} s={[0.8, 0.5, 1.0]} c="#1c1917" />
          <B p={[0, 0.7, 0]} s={[0.4, 0.4, 0.8]} c="#d4af37" />
          <Ball p={[0, 1.05, 0.35]} r={0.22} c="#f6d77a" detail={1} />
          <Ball p={[0, 1.05, 0.28]} r={0.3} c="#c9a227" />
          <B p={[0, 0.9, 0.5]} s={[0.1, 0.1, 0.1]} c="#1c1917" />
          <B p={[0, 0.7, -0.5]} s={[0.1, 0.1, 0.45]} c="#c9a227" />
          <B p={[-0.14, 0.45, 0.3]} s={[0.1, 0.3, 0.1]} c="#d4af37" />
          <B p={[0.14, 0.45, 0.3]} s={[0.1, 0.3, 0.1]} c="#d4af37" />
        </group>
      );
    case 'microwave':
      return (
        <group>
          <B p={[0, 0.2, 0]} s={[0.8, 0.4, 0.55]} c="#d1d5db" r={0.025} />
          <B p={[-0.1, 0.2, 0.28]} s={[0.54, 0.32, 0.015]} c="#111827" r={0.01} />
          <B p={[-0.1, 0.2, 0.288]} s={[0.42, 0.22, 0.005]} c={powered ? '#fbbf24' : '#1f2937'} e={powered ? '#b45309' : undefined} />
          <B p={[0.28, 0.2, 0.28]} s={[0.14, 0.32, 0.015]} c="#6b7280" />
          <B p={[0.28, 0.32, 0.29]} s={[0.08, 0.04, 0.01]} c="#4ade80" e={powered ? '#22c55e' : undefined} />
          {[0.22, 0.14].map((y) => <group key={y} position={[0.28, y, 0.29]} rotation={[Math.PI / 2, 0, 0]}><Cyl p={[0, 0, 0]} r={0.025} h={0.02} c="#d1d5db" /></group>)}
        </group>
      );
    case 'blender':
      return (
        <group>
          <B p={[0, 0.2, 0]} s={[0.5, 0.4, 0.4]} c="#1f2937" />
          <Cyl p={[0, 0.6, 0]} r={0.14} rt={0.18} h={0.4} c="#bae6fd" />
          <Cyl p={[0, 0.83, 0]} r={0.19} h={0.06} c="#111827" />
          <Ball p={[0.18, 0.35, 0.21]} r={0.04} c="#ef4444" />
        </group>
      );
    case 'gas_cooker':
      return (
        <group>
          {roundLegs(1.8, 0.8, 0.08, '#111827', 0.03, 0.08)}
          <B p={[0, 0.44, 0]} s={[1.85, 0.74, 0.85]} c="#e5e7eb" r={0.025} />
          <B p={[0, 0.83, 0]} s={[1.85, 0.04, 0.85]} c="#111827" r={0.012} />
          {[[-0.45, -0.18], [0.45, -0.18], [-0.45, 0.2], [0.45, 0.2]].map(([x, z], i) => (
            <group key={i}>
              <Cyl p={[x, 0.855, z]} r={0.17} h={0.015} c="#4b5563" />
              <Cyl p={[x, 0.87, z]} r={0.09} h={0.02} c="#1f2937" />
              {[0, 1, 2, 3].map((k) => (
                <group key={k} position={[x, 0.885, z]} rotation={[0, (k * Math.PI) / 4, 0]}>
                  <B p={[0, 0, 0]} s={[0.36, 0.012, 0.02]} c="#111827" />
                </group>
              ))}
            </group>
          ))}
          <B p={[0, 0.4, 0.43]} s={[1.5, 0.48, 0.02]} c="#374151" r={0.008} />
          <B p={[0, 0.4, 0.442]} s={[1.1, 0.26, 0.005]} c="#111827" />
          <B p={[0, 0.68, 0.46]} s={[1.3, 0.03, 0.03]} c="#cbd5e1" m />
          {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
            <group key={i} position={[x, 0.76, 0.45]} rotation={[Math.PI / 2, 0, 0]}><Cyl p={[0, 0, 0]} r={0.045} h={0.04} c="#f59e0b" /></group>
          ))}
        </group>
      );
    case 'recliner':
      return (
        <group>
          <B p={[0, 0.22, 0]} s={[0.9, 0.44, 0.9]} c="#7c2d12" />
          <B p={[0, 0.7, -0.38]} s={[0.9, 0.9, 0.18]} c="#92400e" />
          <B p={[-0.5, 0.45, 0]} s={[0.12, 0.3, 0.8]} c="#7c2d12" />
          <B p={[0.5, 0.45, 0]} s={[0.12, 0.3, 0.8]} c="#7c2d12" />
          <B p={[0, 0.12, 0.6]} s={[0.7, 0.1, 0.45]} c="#92400e" />
        </group>
      );
    case 'xbox':
      return (
        <group>
          <B p={[0, 0.2, 0]} s={[0.9, 0.4, 0.5]} c="#374151" />
          <B p={[0, 0.7, 0]} s={[0.28, 0.5, 0.28]} c="#111827" />
          <B p={[0, 0.96, 0]} s={[0.22, 0.02, 0.22]} c="#22c55e" e={powered ? '#16a34a' : undefined} />
          <B p={[0.5, 0.15, 0.4]} s={[0.22, 0.05, 0.14]} c="#111827" />
        </group>
      );
    case 'karaoke':
      return (
        <group>
          <B p={[0, 0.5, 0]} s={[0.6, 1.0, 0.45]} c="#1f2937" />
          <B p={[0, 0.78, 0.23]} s={[0.4, 0.22, 0.01]} c="#38bdf8" e={powered ? '#0ea5e9' : undefined} />
          <Cyl p={[-0.15, 0.35, 0.23]} r={0.1} h={0.02} c="#111827" />
          <Cyl p={[0.15, 0.35, 0.23]} r={0.1} h={0.02} c="#111827" />
          <Cyl p={[0.45, 0.2, 0.2]} r={0.025} h={0.4} c="#9ca3af" />
          <Ball p={[0.45, 0.45, 0.2]} r={0.06} c="#111827" />
        </group>
      );
    case 'dartboard':
      return (
        <group>
          {/* board rotated so flat faces point outward (+z), mounted at wall height */}
          <group position={[0, 1.4, -0.45]} rotation={[-Math.PI / 2, 0, 0]}>
            <Cyl p={[0, 0, 0]} r={0.3} h={0.05} c="#111827" seg={20} />
            <Cyl p={[0, 0.03, 0]} r={0.25} h={0.02} c="#f5f5f4" seg={20} />
            <Cyl p={[0, 0.04, 0]} r={0.2} h={0.02} c="#dc2626" seg={20} />
            <Cyl p={[0, 0.05, 0]} r={0.15} h={0.02} c="#16a34a" seg={20} />
            <Cyl p={[0, 0.06, 0]} r={0.1} h={0.02} c="#dc2626" seg={20} />
            <Cyl p={[0, 0.07, 0]} r={0.05} h={0.02} c="#16a34a" seg={12} />
            <Cyl p={[0, 0.08, 0]} r={0.02} h={0.02} c="#dc2626" seg={10} />
          </group>
        </group>
      );
    case 'ankara_rug':
      return (
        <group>
          <B p={[0, 0.01, 0]} s={[1.9, 0.02, 1.9]} c="#ea580c" />
          <B p={[0, 0.02, 0]} s={[1.6, 0.01, 1.6]} c="#1d4ed8" />
          <B p={[0, 0.026, 0]} s={[1.1, 0.01, 1.1]} c="#facc15" />
          <B p={[0, 0.03, 0]} s={[0.5, 0.01, 0.5]} c="#15803d" />
        </group>
      );
    case 'wall_clock':
      return (
        <group>
          <B p={[0, 1.1, 0]} s={[0.55, 2.2, 0.4]} c="#451a03" />
          <Cyl p={[0, 1.7, 0.21]} r={0.2} h={0.02} c="#fef3c7" seg={20} />
          <B p={[0, 1.75, 0.23]} s={[0.02, 0.14, 0.01]} c="#111827" />
          <B p={[0.04, 1.7, 0.23]} s={[0.1, 0.02, 0.01]} c="#111827" />
          <B p={[0, 0.8, 0.21]} s={[0.35, 0.8, 0.01]} c="#bae6fd" o={0.4} />
          <Cyl p={[0, 0.5, 0.15]} r={0.08} h={0.02} c="#d4af37" />
        </group>
      );
    case 'water_tank':
      return (
        <group>
          {[[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0.6, z]} r={0.05} h={1.2} c="#6b7280" />
          ))}
          <Cyl p={[0, 1.7, 0]} r={0.5} h={1.0} c="#2563eb" seg={16} />
          <Cyl p={[0, 2.25, 0]} r={0.35} rt={0.1} h={0.15} c="#1d4ed8" seg={16} />
        </group>
      );
    case 'velvet_rug':
      return (
        <group>
          <B p={[0, 0.01, 0]} s={[2.9, 0.02, 1.9]} c="#d4af37" />
          <B p={[0, 0.02, 0]} s={[2.7, 0.01, 1.7]} c="#4c0519" />
          <B p={[0, 0.026, 0]} s={[1.6, 0.01, 0.9]} c="#7f1d1d" />
          <B p={[0, 0.03, 0]} s={[0.6, 0.01, 0.6]} c="#d4af37" />
        </group>
      );
    case 'bed_mat':
      return (
        <group>
          <B p={[0, 0.02, 0]} s={[0.85, 0.04, 1.85]} c="#d6a85c" />
          {[-0.6, -0.2, 0.2, 0.6].map((z, i) => (
            <B key={i} p={[0, 0.045, z]} s={[0.85, 0.01, 0.05]} c="#b8863b" />
          ))}
          <B p={[0, 0.07, -0.7]} s={[0.5, 0.06, 0.3]} c="#f5f1e8" />
        </group>
      );
    case 'bed_single':
      return (
        <group>
          {roundLegs(0.95, 1.95, 0.08, '#6b4426', 0.03, 0.08)}
          <B p={[0, 0.19, 0]} s={[0.95, 0.22, 1.95]} c="#8b5a2b" />
          <B p={[0, 0.38, 0.04]} s={[0.86, 0.18, 1.82]} c="#f5f1e8" r={0.07} />
          <B p={[0, 0.48, 0.34]} s={[0.9, 0.04, 1.24]} c="#1d4ed8" r={0.02} />
          <B p={[-0.44, 0.4, 0.34]} s={[0.03, 0.17, 1.24]} c="#1d4ed8" />
          <B p={[0.44, 0.4, 0.34]} s={[0.03, 0.17, 1.24]} c="#1d4ed8" />
          <B p={[0, 0.4, 0.96]} s={[0.9, 0.17, 0.03]} c="#1d4ed8" />
          <B p={[0, 0.49, -0.3]} s={[0.9, 0.05, 0.16]} c="#ece6d8" r={0.02} />
          <Pillow p={[0, 0.53, -0.72]} w={0.62} d={0.36} />
          <B p={[0, 0.5, -0.95]} s={[1.0, 0.92, 0.08]} c="#6b4426" />
          <B p={[0, 0.62, -0.9]} s={[0.84, 0.5, 0.04]} c="#8b5a2b" r={0.02} />
        </group>
      );
    case 'wardrobe':
      return (
        <group>
          <B p={[0, 0.05, 0.02]} s={[1.84, 0.1, 0.62]} c="#5a3418" />
          <B p={[0, 1.04, 0]} s={[1.9, 1.88, 0.7]} c="#7a4e24" r={0.02} />
          <B p={[0, 2.0, 0.01]} s={[1.98, 0.06, 0.76]} c="#7a4e24" r={0.02} />
          {[-0.47, 0.47].map((x) => (
            <group key={x}>
              <B p={[x, 1.04, 0.36]} s={[0.92, 1.78, 0.03]} c="#8b5a2b" r={0.01} />
              {/* raised panels on each door */}
              <B p={[x, 1.42, 0.38]} s={[0.7, 0.8, 0.02]} c="#7a4e24" r={0.008} />
              <B p={[x, 0.55, 0.38]} s={[0.7, 0.6, 0.02]} c="#7a4e24" r={0.008} />
            </group>
          ))}
          <B p={[-0.08, 1.04, 0.4]} s={[0.03, 0.34, 0.03]} c="#d4af37" m />
          <B p={[0.08, 1.04, 0.4]} s={[0.03, 0.34, 0.03]} c="#d4af37" m />
        </group>
      );
    case 'nightstand':
      return (
        <group>
          {roundLegs(0.52, 0.42, 0.1, '#6b4426', 0.022, 0.05)}
          <B p={[0, 0.36, 0]} s={[0.55, 0.52, 0.45]} c="#8b5a2b" r={0.02} />
          <B p={[0, 0.48, 0.23]} s={[0.47, 0.2, 0.02]} c="#6b4426" r={0.008} />
          <B p={[0, 0.25, 0.23]} s={[0.47, 0.2, 0.02]} c="#6b4426" r={0.008} />
          {[0.48, 0.25].map((y) => <Ball key={y} p={[0, y, 0.25]} r={0.018} c="#d4af37" />)}
          {/* a little lamp */}
          <Cyl p={[0.08, 0.64, -0.04]} r={0.08} rt={0.06} h={0.03} c="#374151" />
          <Cyl p={[0.08, 0.74, -0.04]} r={0.012} h={0.18} c="#9ca3af" />
          <Cyl p={[0.08, 0.86, -0.04]} r={0.11} rt={0.07} h={0.12} c="#fde68a" />
        </group>
      );
    case 'freezer':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[1.85, 0.9, 0.72]} c="#f1f4f7" />
          <B p={[0, 0.92, 0]} s={[1.88, 0.05, 0.75]} c="#cfd6dd" />
          <B p={[0.7, 0.8, 0.37]} s={[0.12, 0.05, 0.03]} c="#6b7785" />
        </group>
      );
    case 'water_dispenser':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[0.4, 0.9, 0.4]} c="#e5e7eb" />
          <Cyl p={[0, 1.15, 0]} r={0.17} h={0.45} c="#bae6fd" seg={14} />
          <B p={[-0.08, 0.7, 0.21]} s={[0.07, 0.05, 0.05]} c="#2563eb" />
          <B p={[0.08, 0.7, 0.21]} s={[0.07, 0.05, 0.05]} c="#dc2626" />
        </group>
      );
    case 'mortar':
      return (
        <group>
          <Cyl p={[0, 0.35, 0]} r={0.2} rt={0.28} h={0.7} c="#92602b" seg={12} />
          <Cyl p={[0, 0.7, 0]} r={0.2} h={0.02} c="#3b2412" seg={12} />
          <Cyl p={[0.12, 1.0, 0.05]} r={0.04} h={1.1} c="#b4783a" />
        </group>
      );
    case 'bathtub':
      return (
        <group>
          <B p={[0, 0.3, 0]} s={[1.9, 0.6, 0.95]} c="#f8fafc" />
          <B p={[0, 0.58, 0]} s={[1.6, 0.04, 0.65]} c="#7dd3fc" />
          <B p={[0.8, 0.8, -0.35]} s={[0.06, 0.3, 0.06]} c="#9aa5b1" />
          <B p={[0.8, 0.95, -0.25]} s={[0.06, 0.06, 0.25]} c="#9aa5b1" />
        </group>
      );
    case 'sink':
      return (
        <group>
          <B p={[0, 0.35, -0.1]} s={[0.15, 0.7, 0.15]} c="#e5e7eb" />
          <B p={[0, 0.78, 0]} s={[0.6, 0.12, 0.45]} c="#f8fafc" />
          <B p={[0, 0.85, 0]} s={[0.46, 0.02, 0.32]} c="#7dd3fc" />
          <B p={[0, 0.95, -0.17]} s={[0.05, 0.16, 0.05]} c="#9aa5b1" />
          <B p={[0, 1.4, -0.28]} s={[0.5, 0.6, 0.02]} c="#dbeafe" e="#1e3a8a" />
        </group>
      );
    case 'armchair':
      return (
        <group>
          {roundLegs(0.86, 0.8, 0.1, '#3b2a1a', 0.03, 0.08)}
          <B p={[0, 0.27, 0]} s={[0.9, 0.34, 0.85]} c="#9a3412" r={0.05} />
          <B p={[0, 0.5, 0.07]} s={[0.6, 0.15, 0.66]} c="#c2410c" r={0.07} />
          <B p={[0, 0.78, -0.36]} s={[0.9, 0.72, 0.16]} c="#9a3412" r={0.07} />
          <group position={[0, 0.8, -0.24]} rotation={[-0.12, 0, 0]}>
            <B p={[0, 0, 0]} s={[0.58, 0.48, 0.12]} c="#c2410c" r={0.06} />
          </group>
          <B p={[-0.38, 0.55, 0]} s={[0.15, 0.32, 0.85]} c="#7c2d12" r={0.07} />
          <B p={[0.38, 0.55, 0]} s={[0.15, 0.32, 0.85]} c="#7c2d12" r={0.07} />
        </group>
      );
    case 'ps5':
      return (
        <group>
          <B p={[-0.45, 0.35, -0.2]} s={[0.9, 0.7, 0.5]} c="#6b4426" />
          <B p={[-0.45, 0.95, -0.2]} s={[0.8, 0.5, 0.05]} c="#0f172a" e={powered ? '#38bdf8' : undefined} />
          <B p={[-0.2, 0.74, -0.2]} s={[0.1, 0.1, 0.28]} c="#f8fafc" />
          <B p={[0.45, 0.25, 0.55]} s={[0.55, 0.1, 0.55]} c="#111827" />
          <B p={[0.45, 0.7, 0.35]} s={[0.55, 0.8, 0.1]} c="#dc2626" />
          <Cyl p={[0.45, 0.12, 0.55]} r={0.05} h={0.24} c="#374151" />
        </group>
      );
    case 'speaker':
      return (
        <group>
          <B p={[0, 0.6, 0]} s={[0.5, 1.2, 0.4]} c="#171717" />
          <Cyl p={[0, 0.35, 0.21]} r={0.16} h={0.03} c="#404040" seg={14} />
          <Cyl p={[0, 0.85, 0.21]} r={0.1} h={0.03} c="#404040" seg={14} />
          <Ball p={[0, 1.05, 0.21]} r={0.04} c={powered ? '#22c55e' : '#525252'} />
        </group>
      );
    case 'ludo':
      return (
        <group>
          <Cyl p={[0, 0.35, 0]} r={0.08} h={0.7} c="#6b4426" />
          <B p={[0, 0.72, 0]} s={[0.9, 0.06, 0.9]} c="#8b5a2b" />
          <B p={[-0.2, 0.76, -0.2]} s={[0.3, 0.02, 0.3]} c="#ef4444" />
          <B p={[0.2, 0.76, -0.2]} s={[0.3, 0.02, 0.3]} c="#22c55e" />
          <B p={[-0.2, 0.76, 0.2]} s={[0.3, 0.02, 0.3]} c="#3b82f6" />
          <B p={[0.2, 0.76, 0.2]} s={[0.3, 0.02, 0.3]} c="#facc15" />
          <B p={[0, 0.25, 0.55]} s={[0.4, 0.05, 0.4]} c="#a16207" />
        </group>
      );
    case 'sewing_machine':
      return (
        <group>
          <B p={[0, 0.7, 0]} s={[0.8, 0.06, 0.45]} c="#8b5a2b" />
          {[[-0.35, -0.18], [0.35, -0.18], [-0.35, 0.18], [0.35, 0.18]].map(([x, z], i) => (
            <B key={i} p={[x, 0.35, z]} s={[0.05, 0.7, 0.05]} c="#374151" />
          ))}
          <B p={[0, 0.82, 0]} s={[0.4, 0.18, 0.2]} c="#1f2937" />
          <B p={[0.1, 1.0, 0]} s={[0.2, 0.2, 0.16]} c="#1f2937" />
          <Cyl p={[0.2, 0.95, 0.1]} r={0.05} h={0.04} c="#d4af37" />
        </group>
      );
    case 'easel':
      return (
        <group>
          <B p={[-0.3, 0.7, 0]} s={[0.05, 1.5, 0.05]} c="#8b5a2b" />
          <B p={[0.3, 0.7, 0]} s={[0.05, 1.5, 0.05]} c="#8b5a2b" />
          <B p={[0, 0.15, -0.3]} s={[0.05, 1.3, 0.05]} c="#8b5a2b" />
          <B p={[0, 1.0, 0.05]} s={[0.7, 0.8, 0.04]} c="#fefce8" />
          <B p={[-0.12, 1.1, 0.08]} s={[0.25, 0.2, 0.01]} c="#ef4444" />
          <B p={[0.14, 0.9, 0.08]} s={[0.25, 0.25, 0.01]} c="#2563eb" />
          <B p={[0, 0.55, 0.05]} s={[0.7, 0.05, 0.14]} c="#8b5a2b" />
        </group>
      );
    case 'drum_kit':
      return (
        <group>
          <Cyl p={[0, 0.4, -0.4]} r={0.32} h={0.5} c="#b91c1c" seg={16} />
          <Cyl p={[-0.5, 0.7, 0.1]} r={0.22} h={0.3} c="#b91c1c" seg={14} />
          <Cyl p={[0.5, 0.7, 0.1]} r={0.22} h={0.3} c="#b91c1c" seg={14} />
          <Cyl p={[0, 0.5, 0.2]} r={0.2} h={0.25} c="#b91c1c" seg={14} />
          <Cyl p={[-0.6, 1.2, -0.3]} r={0.25} h={0.02} c="#d4af37" seg={16} />
          <Cyl p={[0.6, 1.2, -0.3]} r={0.25} h={0.02} c="#d4af37" seg={16} />
          <B p={[-0.6, 0.6, -0.3]} s={[0.03, 1.2, 0.03]} c="#9ca3af" />
          <B p={[0.6, 0.6, -0.3]} s={[0.03, 1.2, 0.03]} c="#9ca3af" />
          <Cyl p={[0, 0.2, 0.75]} r={0.18} h={0.4} c="#78350f" seg={10} />
        </group>
      );
    case 'hammock':
      return (
        <group>
          <B p={[-0.9, 0.7, 0]} s={[0.08, 1.4, 0.08]} c="#6b4426" />
          <B p={[0.9, 0.7, 0]} s={[0.08, 1.4, 0.08]} c="#6b4426" />
          <B p={[0, 0.55, 0]} s={[1.5, 0.05, 0.5]} c="#fbbf24" />
          <B p={[-0.78, 0.9, 0]} s={[0.3, 0.02, 0.02]} c="#f5f1e8" />
          <B p={[0.78, 0.9, 0]} s={[0.3, 0.02, 0.02]} c="#f5f1e8" />
        </group>
      );
    case 'garden_bench':
      return (
        <group>
          <B p={[0, 0.42, 0]} s={[1.8, 0.07, 0.5]} c="#a16207" />
          <B p={[0, 0.75, -0.23]} s={[1.8, 0.4, 0.06]} c="#a16207" />
          <B p={[-0.8, 0.2, 0]} s={[0.07, 0.4, 0.45]} c="#374151" />
          <B p={[0.8, 0.2, 0]} s={[0.07, 0.4, 0.45]} c="#374151" />
        </group>
      );
    case 'palm_tree':
      return (
        <group>
          <Cyl p={[0, 1.2, 0]} r={0.12} rt={0.08} h={2.4} c="#92602b" />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return <B key={i} p={[Math.cos(a) * 0.35, 2.4, Math.sin(a) * 0.35]} s={[0.8, 0.05, 0.18]} c="#15803d" />;
          })}
          <Ball p={[0.1, 2.3, 0.1]} r={0.09} c="#78350f" />
          <Ball p={[-0.1, 2.3, 0.05]} r={0.09} c="#78350f" />
        </group>
      );
    case 'flower_bed':
      return (
        <group>
          <B p={[0, 0.1, 0]} s={[1.9, 0.2, 0.7]} c="#78350f" />
          {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
            <group key={i}>
              <B p={[x, 0.35, 0]} s={[0.03, 0.3, 0.03]} c="#15803d" />
              <Ball p={[x, 0.55, 0]} r={0.1} c={['#ef4444', '#facc15', '#ec4899', '#f97316', '#a855f7'][i]} />
            </group>
          ))}
        </group>
      );
    case 'floor_lamp':
      return (
        <group>
          <Cyl p={[0, 0.025, 0]} r={0.2} rt={0.18} h={0.05} c="#374151" />
          <Cyl p={[0, 0.8, 0]} r={0.018} h={1.5} c="#9ca3af" />
          {powered && <Ball p={[0, 1.58, 0]} r={0.06} c="#fff7d6" />}
          <mesh position={[0, 1.65, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.3, 0.36, 32, 1, true]} />
            <meshStandardMaterial color={powered ? '#fde68a' : '#fef3c7'} emissive={powered ? '#fbbf24' : '#000'} emissiveIntensity={powered ? 0.5 : 0} side={2} />
          </mesh>
        </group>
      );
    case 'coffee_table':
      return (
        <group>
          <B p={[0, 0.4, 0]} s={[1.6, 0.05, 0.7]} c="#8b5a2b" r={0.02} />
          <B p={[0, 0.12, 0]} s={[1.4, 0.03, 0.56]} c="#5a371e" r={0.01} />
          {roundLegs(1.6, 0.7, 0.38, '#5a371e', 0.035, 0.08)}
          <Cyl p={[-0.3, 0.47, 0]} r={0.05} rt={0.06} h={0.09} c="#f8fafc" />
          <B p={[0.3, 0.436, 0]} s={[0.3, 0.02, 0.2]} c="#2563eb" r={0.006} />
          <B p={[0.32, 0.454, 0.01]} s={[0.26, 0.016, 0.18]} c="#f8fafc" r={0.005} />
        </group>
      );
    case 'tv_cabinet':
      return (
        <group>
          {roundLegs(1.86, 0.46, 0.12, '#3b2a1a', 0.025, 0.08)}
          <B p={[0, 0.38, 0]} s={[1.9, 0.52, 0.5]} c="#6b4426" r={0.02} />
          <B p={[-0.475, 0.38, 0.252]} s={[0.92, 0.44, 0.02]} c="#7a4e24" r={0.008} />
          <B p={[0.475, 0.38, 0.252]} s={[0.92, 0.44, 0.02]} c="#7a4e24" r={0.008} />
          {[-0.08, 0.08].map((x) => <B key={x} p={[x, 0.42, 0.27]} s={[0.02, 0.14, 0.02]} c="#d4af37" m />)}
          <B p={[0, 0.655, 0]} s={[1.95, 0.04, 0.54]} c="#efe8dc" r={0.015} />
        </group>
      );
    case 'safe_box':
      return (
        <group>
          <B p={[0, 0.4, 0]} s={[0.7, 0.8, 0.6]} c="#374151" />
          <B p={[0, 0.4, 0.31]} s={[0.55, 0.65, 0.02]} c="#4b5563" />
          <Cyl p={[0.1, 0.4, 0.34]} r={0.1} h={0.04} c="#d4af37" seg={14} />
          <B p={[-0.17, 0.5, 0.33]} s={[0.1, 0.15, 0.03]} c="#111827" />
        </group>
      );
    case 'air_fryer':
      return (
        <group>
          <B p={[0, 0.35, 0]} s={[0.8, 0.7, 0.55]} c="#8b5a2b" />
          <B p={[0, 0.72, 0]} s={[0.84, 0.04, 0.6]} c="#d6d3d1" />
          <B p={[0, 0.94, 0]} s={[0.34, 0.4, 0.36]} c="#1f2937" />
          <B p={[0, 0.86, 0.185]} s={[0.28, 0.2, 0.02]} c="#111827" />
          <B p={[0, 0.86, 0.22]} s={[0.12, 0.04, 0.06]} c="#9ca3af" />
          <B p={[0, 1.06, 0.185]} s={[0.1, 0.05, 0.01]} c="#38bdf8" e={powered ? '#0ea5e9' : undefined} />
        </group>
      );
    case 'kettle':
      return (
        <group>
          <B p={[0, 0.6, 0]} s={[0.7, 0.05, 0.5]} c="#8b5a2b" />
          {legs(0.7, 0.5, 0.58, '#5a371e', 0.06)}
          <B p={[0, 0.635, 0]} s={[0.56, 0.02, 0.38]} c="#d4af37" />
          <Cyl p={[-0.12, 0.655, 0]} r={0.1} h={0.02} c="#111827" />
          <Cyl p={[-0.12, 0.77, 0]} r={0.09} rt={0.07} h={0.22} c="#e5e7eb" />
          <B p={[-0.23, 0.78, 0]} s={[0.04, 0.13, 0.03]} c="#111827" />
          <B p={[-0.12, 0.69, 0.092]} s={[0.03, 0.03, 0.01]} c="#f97316" e={powered ? '#f97316' : undefined} />
          <Cyl p={[0.14, 0.68, 0.06]} r={0.04} h={0.07} c="#f8fafc" />
          <Cyl p={[0.2, 0.68, -0.08]} r={0.04} h={0.07} c="#f8fafc" />
        </group>
      );
    case 'coffee_machine':
      return (
        <group>
          <B p={[0, 0.4, 0]} s={[0.85, 0.8, 0.55]} c="#3f3f46" />
          <B p={[0, 0.82, 0]} s={[0.9, 0.04, 0.6]} c="#e7e5e4" />
          <B p={[0, 1.06, -0.05]} s={[0.5, 0.44, 0.36]} c="#cbd5e1" />
          <B p={[0, 1.22, 0.13]} s={[0.5, 0.12, 0.14]} c="#94a3b8" />
          <Cyl p={[0, 1.12, 0.16]} r={0.04} h={0.08} c="#1f2937" />
          <B p={[0, 0.85, 0.16]} s={[0.3, 0.02, 0.2]} c="#1f2937" />
          <Cyl p={[0, 0.9, 0.16]} r={0.04} h={0.07} c="#f8fafc" />
          <B p={[0.18, 1.22, 0.205]} s={[0.04, 0.04, 0.01]} c="#ef4444" e={powered ? '#ef4444' : undefined} />
        </group>
      );
    case 'kerosene_stove':
      return (
        <group>
          <Cyl p={[0, 0.1, 0]} r={0.26} h={0.2} c="#166534" seg={12} />
          <Cyl p={[0, 0.3, 0]} r={0.16} h={0.22} c="#15803d" seg={12} />
          <B p={[0, 0.42, 0]} s={[0.5, 0.03, 0.5]} c="#1f2937" />
          <Cyl p={[0, 0.54, 0]} r={0.2} h={0.2} c="#9ca3af" seg={12} />
          <B p={[0, 0.6, 0]} s={[0.52, 0.03, 0.05]} c="#6b7280" />
        </group>
      );
    case 'clay_pot':
      return (
        <group>
          <Cyl p={[0, 0.06, 0]} r={0.22} rt={0.18} h={0.12} c="#6b4426" />
          <Ball p={[0, 0.42, 0]} r={0.33} c="#b45309" detail={1} />
          <Cyl p={[0, 0.76, 0]} r={0.13} rt={0.16} h={0.14} c="#92400e" seg={12} />
          <Cyl p={[0, 0.845, 0]} r={0.17} h={0.03} c="#d6d3d1" seg={12} />
          <Cyl p={[0, 0.9, 0]} r={0.05} h={0.09} c="#e5e7eb" />
        </group>
      );
    case 'mini_fridge':
      return (
        <group>
          <B p={[0, 0.4, 0]} s={[0.6, 0.8, 0.55]} c="#1f2937" />
          <B p={[0, 0.42, 0.28]} s={[0.5, 0.66, 0.01]} c="#bae6fd" o={0.45} />
          <B p={[0, 0.72, 0.287]} s={[0.46, 0.03, 0.01]} c="#f8fafc" e={powered ? '#e0f2fe' : undefined} />
          <B p={[0.26, 0.42, 0.3]} s={[0.02, 0.3, 0.03]} c="#9ca3af" />
          <Cyl p={[-0.12, 0.9, 0]} r={0.04} h={0.2} c="#78350f" />
          <Cyl p={[0.02, 0.9, 0.06]} r={0.04} h={0.2} c="#15803d" />
        </group>
      );
    case 'popcorn_machine':
      return (
        <group>
          <B p={[0, 0.4, 0]} s={[0.7, 0.8, 0.5]} c="#b91c1c" />
          <B p={[0, 0.5, 0.255]} s={[0.5, 0.2, 0.01]} c="#fde047" />
          <B p={[0, 0.92, 0]} s={[0.6, 0.22, 0.4]} c="#fde68a" />
          <Cyl p={[0, 1.22, 0]} r={0.1} h={0.12} c="#9ca3af" />
          <B p={[0, 1.1, 0]} s={[0.66, 0.6, 0.46]} c="#fef9c3" o={0.3} />
          <B p={[0, 1.43, 0]} s={[0.72, 0.06, 0.52]} c="#b91c1c" />
          <B p={[0, 1.37, 0.2]} s={[0.5, 0.03, 0.03]} c="#fef08a" e={powered ? '#fde047' : undefined} />
        </group>
      );
    case 'bean_bag':
      return (
        <group>
          <group scale={[1, 0.55, 1]}>
            <Ball p={[0, 0.35, 0.03]} r={0.44} c="#7c3aed" detail={1} />
          </group>
          <Ball p={[0, 0.45, -0.24]} r={0.3} c="#6d28d9" detail={1} />
        </group>
      );
    case 'rocking_chair':
      return (
        <group>
          <B p={[-0.26, 0.04, 0]} s={[0.05, 0.05, 0.9]} c="#5a371e" />
          <B p={[0.26, 0.04, 0]} s={[0.05, 0.05, 0.9]} c="#5a371e" />
          {legs(0.57, 0.5, 0.42, '#5a371e', 0.05)}
          <B p={[0, 0.43, 0]} s={[0.58, 0.05, 0.55]} c="#8b5a2b" />
          <group position={[0, 0.82, -0.3]} rotation={[-0.15, 0, 0]}>
            <B p={[0, 0, 0]} s={[0.58, 0.75, 0.05]} c="#8b5a2b" />
          </group>
          <B p={[-0.3, 0.64, 0]} s={[0.05, 0.04, 0.5]} c="#5a371e" />
          <B p={[0.3, 0.64, 0]} s={[0.05, 0.04, 0.5]} c="#5a371e" />
          <B p={[-0.3, 0.54, 0.2]} s={[0.04, 0.2, 0.04]} c="#5a371e" />
          <B p={[0.3, 0.54, 0.2]} s={[0.04, 0.2, 0.04]} c="#5a371e" />
        </group>
      );
    case 'leather_pouf':
      return (
        <group>
          <Cyl p={[0, 0.18, 0]} r={0.34} rt={0.3} h={0.36} c="#92400e" seg={12} />
          <Cyl p={[0, 0.18, 0]} r={0.335} rt={0.325} h={0.05} c="#fef3c7" seg={12} />
          <Cyl p={[0, 0.365, 0]} r={0.2} h={0.01} c="#f59e0b" seg={12} />
        </group>
      );
    case 'bunk_bed':
      return (
        <group>
          {[[-0.45, -0.95], [0.45, -0.95], [-0.45, 0.95], [0.45, 0.95]].map(([x, z], i) => (
            <B key={i} p={[x, 0.9, z]} s={[0.08, 1.8, 0.08]} c="#6b4426" />
          ))}
          <B p={[0, 0.2, 0]} s={[0.95, 0.12, 1.95]} c="#8b5a2b" />
          <B p={[0, 0.32, 0.03]} s={[0.86, 0.14, 1.8]} c="#f5f1e8" />
          <B p={[0, 0.41, 0.35]} s={[0.88, 0.05, 1.2]} c="#0f766e" />
          <B p={[0, 0.43, -0.72]} s={[0.6, 0.1, 0.32]} c="#fff" />
          <B p={[0, 1.3, 0]} s={[0.95, 0.12, 1.95]} c="#8b5a2b" />
          <B p={[0, 1.42, 0.03]} s={[0.86, 0.14, 1.8]} c="#f5f1e8" />
          <B p={[0, 1.51, 0.35]} s={[0.88, 0.05, 1.2]} c="#b45309" />
          <B p={[0, 1.53, -0.72]} s={[0.6, 0.1, 0.32]} c="#fff" />
          <B p={[-0.46, 1.62, 0]} s={[0.04, 0.06, 1.85]} c="#6b4426" />
          <B p={[0.46, 1.62, 0]} s={[0.04, 0.06, 1.85]} c="#6b4426" />
          {[0.5, 0.8, 1.1].map((y) => <B key={y} p={[0, y, 0.97]} s={[0.84, 0.04, 0.04]} c="#6b4426" />)}
        </group>
      );
    case 'net_bed':
      return (
        <group>
          <B p={[0, 0.15, 0]} s={[1.9, 0.3, 2.9]} c="#5a371e" />
          <B p={[0, 0.38, 0.05]} s={[1.8, 0.18, 2.7]} c="#f5f1e8" />
          <B p={[0, 0.5, 0.5]} s={[1.82, 0.06, 1.8]} c="#0e7490" />
          <B p={[-0.45, 0.52, -1.05]} s={[0.7, 0.12, 0.4]} c="#fff" />
          <B p={[0.45, 0.52, -1.05]} s={[0.7, 0.12, 0.4]} c="#fff" />
          <B p={[0, 0.6, -1.42]} s={[1.9, 1.0, 0.08]} c="#5a371e" />
          {[[-0.92, -1.42], [0.92, -1.42], [-0.92, 1.42], [0.92, 1.42]].map(([x, z], i) => (
            <B key={i} p={[x, 1.05, z]} s={[0.06, 2.1, 0.06]} c="#78716c" />
          ))}
          <B p={[0, 2.1, -1.42]} s={[1.9, 0.05, 0.05]} c="#78716c" />
          <B p={[0, 2.1, 1.42]} s={[1.9, 0.05, 0.05]} c="#78716c" />
          <B p={[-0.92, 2.1, 0]} s={[0.05, 0.05, 2.9]} c="#78716c" />
          <B p={[0.92, 2.1, 0]} s={[0.05, 0.05, 2.9]} c="#78716c" />
          {/* the net: no shadow, or the whole bed sits in the dark */}
          <mesh position={[0, 1.33, 0]}>
            <boxGeometry args={[1.84, 1.52, 2.84]} />
            <meshStandardMaterial color="#f8fafc" transparent opacity={0.2} depthWrite={false} />
          </mesh>
        </group>
      );
    case 'dressing_table':
      return (
        <group>
          <B p={[0, 0.72, -0.2]} s={[1.5, 0.06, 0.45]} c="#f5e6d3" />
          <B p={[-0.55, 0.35, -0.2]} s={[0.4, 0.7, 0.42]} c="#e7d3b8" />
          <B p={[0.55, 0.35, -0.2]} s={[0.4, 0.7, 0.42]} c="#e7d3b8" />
          {[-0.55, 0.55].map((x) => [0.22, 0.5].map((y) => <B key={`${x}${y}`} p={[x, y, 0.02]} s={[0.1, 0.03, 0.02]} c="#d4af37" />))}
          <B p={[0, 1.25, -0.4]} s={[0.8, 0.95, 0.05]} c="#d4af37" />
          <B p={[0, 1.25, -0.37]} s={[0.7, 0.85, 0.01]} c="#bae6fd" />
          <Cyl p={[0.42, 0.82, -0.2]} r={0.04} h={0.14} c="#ec4899" />
          <Cyl p={[0.54, 0.8, -0.14]} r={0.035} h={0.1} c="#a855f7" />
          <B p={[-0.45, 0.77, -0.18]} s={[0.2, 0.04, 0.12]} c="#111827" />
          <Cyl p={[0, 0.2, 0.05]} r={0.2} h={0.4} c="#be185d" seg={12} />
        </group>
      );
    case 'ironing_board':
      return (
        <group>
          <B p={[0, 0.85, 0]} s={[1.4, 0.04, 0.4]} c="#e0f2fe" />
          <B p={[0.78, 0.85, 0]} s={[0.2, 0.04, 0.28]} c="#e0f2fe" />
          <group position={[0, 0.42, 0.12]} rotation={[0, 0, 0.9]}>
            <B p={[0, 0, 0]} s={[0.04, 1.1, 0.04]} c="#9ca3af" />
          </group>
          <group position={[0, 0.42, -0.12]} rotation={[0, 0, -0.9]}>
            <B p={[0, 0, 0]} s={[0.04, 1.1, 0.04]} c="#9ca3af" />
          </group>
          <B p={[0.3, 0.88, 0]} s={[0.5, 0.02, 0.34]} c="#f8fafc" />
          <B p={[-0.3, 0.92, 0]} s={[0.24, 0.1, 0.14]} c="#2563eb" />
          <B p={[-0.3, 1.0, 0]} s={[0.18, 0.03, 0.04]} c="#1e3a8a" />
          <B p={[-0.2, 0.95, 0.073]} s={[0.03, 0.03, 0.01]} c="#f97316" e={powered ? '#f97316' : undefined} />
        </group>
      );
    case 'table_tennis':
      return (
        <group>
          {legs(2.4, 1.3, 0.72, '#374151', 0.06)}
          <B p={[0, 0.74, 0]} s={[2.7, 0.05, 1.5]} c="#1d4ed8" />
          <B p={[0, 0.768, 0]} s={[2.7, 0.005, 0.02]} c="#f8fafc" />
          <B p={[0, 0.768, 0.74]} s={[2.7, 0.005, 0.02]} c="#f8fafc" />
          <B p={[0, 0.768, -0.74]} s={[2.7, 0.005, 0.02]} c="#f8fafc" />
          <B p={[0, 0.84, 0]} s={[0.015, 0.15, 1.6]} c="#f8fafc" o={0.7} />
          <B p={[0, 0.84, 0.8]} s={[0.03, 0.18, 0.03]} c="#111827" />
          <B p={[0, 0.84, -0.8]} s={[0.03, 0.18, 0.03]} c="#111827" />
          <Cyl p={[-0.8, 0.775, 0.3]} r={0.09} h={0.02} c="#dc2626" />
          <B p={[-0.8, 0.775, 0.44]} s={[0.03, 0.02, 0.12]} c="#a16207" />
          <Cyl p={[0.8, 0.775, -0.3]} r={0.09} h={0.02} c="#111827" />
          <B p={[0.8, 0.775, -0.44]} s={[0.03, 0.02, 0.12]} c="#a16207" />
          <Ball p={[0.35, 0.79, 0.2]} r={0.025} c="#fb923c" />
        </group>
      );
    case 'foosball':
      return (
        <group>
          {legs(1.4, 0.7, 0.62, '#1f2937', 0.08)}
          <B p={[0, 0.75, 0]} s={[1.5, 0.3, 0.8]} c="#7c2d12" />
          <B p={[0, 0.905, 0]} s={[1.38, 0.01, 0.68]} c="#16a34a" />
          {[-0.5, -0.17, 0.17, 0.5].map((x, i) => (
            <group key={x}>
              <Tube p={[x, 1.0, 0]} rot={ALONG} r={0.012} h={0.92} c={CHROME} metal />
              <B p={[x, 1.0, i % 2 ? 0.47 : -0.47]} s={[0.05, 0.05, 0.08]} c="#111827" />
              {[-0.2, 0, 0.2].map((z) => <B key={z} p={[x, 0.97, z]} s={[0.04, 0.13, 0.04]} c={i % 2 ? '#2563eb' : '#dc2626'} />)}
            </group>
          ))}
        </group>
      );
    case 'dj_decks':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[1.7, 0.9, 0.6]} c="#111827" />
          <B p={[0, 0.5, 0.305]} s={[1.5, 0.5, 0.01]} c="#7c3aed" e={powered ? '#7c3aed' : undefined} />
          <B p={[0, 0.93, 0]} s={[1.6, 0.06, 0.5]} c="#1f2937" />
          <Cyl p={[-0.5, 0.97, 0]} r={0.2} h={0.02} c="#0a0a0a" seg={16} />
          <Cyl p={[0.5, 0.97, 0]} r={0.2} h={0.02} c="#0a0a0a" seg={16} />
          <Cyl p={[-0.5, 0.985, 0]} r={0.06} h={0.01} c="#f59e0b" />
          <Cyl p={[0.5, 0.985, 0]} r={0.06} h={0.01} c="#ef4444" />
          <B p={[0, 0.98, 0]} s={[0.3, 0.04, 0.4]} c="#374151" />
          {[-0.08, 0, 0.08].map((x) => <Cyl key={x} p={[x, 1.01, -0.1]} r={0.02} h={0.03} c="#e5e7eb" />)}
          <B p={[0, 1.005, 0.1]} s={[0.2, 0.01, 0.03]} c="#22c55e" e={powered ? '#22c55e' : undefined} />
          <B p={[0, 1.13, -0.22]} s={[0.36, 0.24, 0.02]} c="#0f172a" e={powered ? '#38bdf8' : undefined} />
        </group>
      );
    case 'vr_station':
      return (
        <group>
          <Cyl p={[0, 0.03, 0]} r={0.3} h={0.06} c="#1f2937" seg={14} />
          <Cyl p={[0, 0.6, 0]} r={0.03} h={1.1} c="#6b7280" />
          <B p={[0, 0.8, 0]} s={[0.4, 0.03, 0.05]} c="#6b7280" />
          <B p={[-0.16, 0.87, 0.02]} s={[0.06, 0.14, 0.06]} c="#f8fafc" />
          <B p={[0.16, 0.87, 0.02]} s={[0.06, 0.14, 0.06]} c="#f8fafc" />
          <B p={[0, 1.2, 0.02]} s={[0.3, 0.16, 0.2]} c="#f8fafc" />
          <B p={[0, 1.2, 0.125]} s={[0.26, 0.1, 0.01]} c="#0f172a" e={powered ? '#22d3ee' : undefined} />
          <B p={[0, 1.2, -0.14]} s={[0.24, 0.05, 0.14]} c="#374151" />
        </group>
      );
    case 'punching_bag':
      return (
        <group>
          <B p={[0, 0.04, 0]} s={[0.8, 0.08, 0.8]} c="#1f2937" />
          <B p={[0, 1.1, -0.35]} s={[0.08, 2.2, 0.08]} c="#374151" />
          <B p={[0, 2.16, -0.13]} s={[0.08, 0.08, 0.5]} c="#374151" />
          <B p={[0, 1.96, 0.05]} s={[0.02, 0.34, 0.02]} c="#9ca3af" />
          <Cyl p={[0, 1.25, 0.05]} r={0.2} h={1.1} c="#b91c1c" seg={12} />
          <Cyl p={[0, 1.25, 0.05]} r={0.205} h={0.1} c="#111827" seg={12} />
        </group>
      );
    case 'exercise_bike':
      return (
        <group>
          <B p={[0, 0.04, 0.4]} s={[0.5, 0.06, 0.08]} c="#1f2937" />
          <B p={[0, 0.04, -0.4]} s={[0.5, 0.06, 0.08]} c="#1f2937" />
          <B p={[0, 0.1, 0]} s={[0.08, 0.08, 0.8]} c="#374151" />
          <Tube p={[0, 0.36, 0.28]} rot={ACROSS} r={0.24} h={0.06} c="#dc2626" />
          <B p={[0, 0.45, -0.15]} s={[0.06, 0.7, 0.06]} c="#374151" />
          <B p={[0, 0.8, -0.15]} s={[0.2, 0.06, 0.3]} c="#111827" />
          <B p={[0, 0.62, 0.38]} s={[0.06, 1.0, 0.06]} c="#374151" />
          <B p={[0, 1.1, 0.38]} s={[0.5, 0.04, 0.04]} c="#111827" />
          <B p={[0, 1.18, 0.36]} s={[0.16, 0.1, 0.03]} c="#0f172a" />
          <B p={[0.14, 0.3, 0.02]} s={[0.1, 0.03, 0.08]} c="#9ca3af" />
          <B p={[-0.14, 0.4, 0.12]} s={[0.1, 0.03, 0.08]} c="#9ca3af" />
        </group>
      );
    case 'yoga_mat':
      return (
        <group>
          <B p={[0, 0.012, 0]} s={[0.62, 0.02, 1.8]} c="#7c3aed" />
          <B p={[0, 0.024, 0.72]} s={[0.62, 0.005, 0.05]} c="#c4b5fd" />
          <B p={[0, 0.024, -0.72]} s={[0.62, 0.005, 0.05]} c="#c4b5fd" />
        </group>
      );
    case 'radio':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[0.45, 0.05, 0.4]} c="#8b5a2b" />
          {legs(0.42, 0.37, 0.43, '#5a371e', 0.05)}
          <B p={[0, 0.59, 0]} s={[0.36, 0.22, 0.12]} c="#1f2937" />
          <B p={[-0.07, 0.59, 0.063]} s={[0.16, 0.16, 0.01]} c="#9ca3af" />
          <B p={[0.1, 0.62, 0.063]} s={[0.1, 0.05, 0.01]} c="#fde68a" />
          <B p={[0, 0.72, 0]} s={[0.2, 0.03, 0.03]} c="#111827" />
          <B p={[0.14, 0.86, -0.03]} s={[0.012, 0.32, 0.012]} c="#d1d5db" />
        </group>
      );
    case 'gramophone':
      return (
        <group>
          <B p={[0, 0.35, 0]} s={[0.6, 0.7, 0.55]} c="#5a371e" />
          <B p={[0, 0.76, 0]} s={[0.5, 0.12, 0.45]} c="#7a4a26" />
          <Cyl p={[0.03, 0.83, 0.03]} r={0.17} h={0.02} c="#0a0a0a" seg={16} />
          <Cyl p={[0.03, 0.845, 0.03]} r={0.05} h={0.01} c="#dc2626" />
          <Cyl p={[-0.18, 0.95, -0.17]} r={0.025} h={0.28} c="#d4af37" />
          <group position={[-0.16, 1.26, -0.06]} rotation={[0.9, 0, -0.25]}>
            <Cyl p={[0, 0, 0]} r={0.05} rt={0.3} h={0.5} c="#d4af37" seg={12} />
          </group>
        </group>
      );
    case 'parrot_cage':
      return (
        <group>
          <Cyl p={[0, 0.03, 0]} r={0.25} h={0.06} c="#374151" seg={12} />
          <Cyl p={[0, 0.5, 0]} r={0.03} h={0.95} c="#9ca3af" />
          <Cyl p={[0, 0.98, 0]} r={0.3} h={0.04} c="#d4af37" seg={12} />
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <B key={i} p={[Math.cos(a) * 0.28, 1.35, Math.sin(a) * 0.28]} s={[0.015, 0.7, 0.015]} c="#d4af37" />;
          })}
          <Cyl p={[0, 1.77, 0]} r={0.3} rt={0.04} h={0.14} c="#d4af37" seg={12} />
          <B p={[0, 1.25, 0]} s={[0.5, 0.02, 0.02]} c="#8b5a2b" />
          <Ball p={[0, 1.36, 0]} r={0.09} c="#6b7280" />
          <Ball p={[0, 1.48, 0.03]} r={0.06} c="#9ca3af" />
          <B p={[0, 1.47, 0.09]} s={[0.03, 0.03, 0.04]} c="#111827" />
          <B p={[0, 1.27, -0.08]} s={[0.05, 0.12, 0.04]} c="#dc2626" />
        </group>
      );
    case 'chess_table':
      return (
        <group>
          <Cyl p={[0, 0.35, 0]} r={0.08} h={0.7} c="#3f2a1a" />
          <B p={[0, 0.72, 0]} s={[0.8, 0.06, 0.8]} c="#5a371e" />
          <B p={[0, 0.755, 0]} s={[0.6, 0.01, 0.6]} c="#f5f1e8" />
          {[0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i + j) % 2 === 1 && (
            <B key={`${i}${j}`} p={[-0.225 + i * 0.15, 0.762, -0.225 + j * 0.15]} s={[0.15, 0.005, 0.15]} c="#1f2937" />
          )))}
          <Cyl p={[-0.225, 0.81, 0.225]} r={0.03} h={0.1} c="#f8fafc" />
          <Cyl p={[0.075, 0.8, 0.225]} r={0.025} h={0.07} c="#f8fafc" />
          <Cyl p={[0.225, 0.81, -0.225]} r={0.03} h={0.1} c="#111827" />
          <Cyl p={[-0.075, 0.8, -0.075]} r={0.025} h={0.07} c="#111827" />
          <Cyl p={[0, 0.21, -0.55]} r={0.18} h={0.42} c="#a16207" seg={12} />
        </group>
      );
    case 'keyboard':
      return (
        <group>
          <group position={[0, 0.38, 0.12]} rotation={[0, 0, 0.75]}>
            <B p={[0, 0, 0]} s={[0.05, 1.05, 0.05]} c="#6b7280" />
          </group>
          <group position={[0, 0.38, 0.12]} rotation={[0, 0, -0.75]}>
            <B p={[0, 0, 0]} s={[0.05, 1.05, 0.05]} c="#6b7280" />
          </group>
          <B p={[0, 0.8, 0.12]} s={[1.5, 0.1, 0.4]} c="#111827" />
          <B p={[0, 0.855, 0.04]} s={[1.4, 0.01, 0.2]} c="#f8fafc" />
          {Array.from({ length: 10 }, (_, i) => <B key={i} p={[-0.63 + i * 0.14, 0.865, 0.09]} s={[0.05, 0.015, 0.1]} c="#0a0a0a" />)}
          <B p={[0, 0.855, 0.25]} s={[0.4, 0.01, 0.06]} c="#22d3ee" e={powered ? '#22d3ee' : undefined} />
          <B p={[0, 0.43, -0.38]} s={[0.5, 0.06, 0.3]} c="#1f2937" />
          <B p={[-0.2, 0.2, -0.38]} s={[0.04, 0.4, 0.26]} c="#374151" />
          <B p={[0.2, 0.2, -0.38]} s={[0.04, 0.4, 0.26]} c="#374151" />
        </group>
      );
    case 'talking_drum':
      return (
        <group>
          <Cyl p={[0, 0.2, 0]} r={0.22} rt={0.18} h={0.4} c="#6b4426" />
          <Cyl p={[0, 0.405, 0]} r={0.18} h={0.02} c="#fef3c7" seg={12} />
          <Cyl p={[0, 0.54, 0]} r={0.17} rt={0.08} h={0.26} c="#92400e" seg={12} />
          <Cyl p={[0, 0.8, 0]} r={0.08} rt={0.17} h={0.26} c="#92400e" seg={12} />
          <Cyl p={[0, 0.94, 0]} r={0.18} h={0.02} c="#fef3c7" seg={12} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <B key={i} p={[Math.cos(a) * 0.17, 0.67, Math.sin(a) * 0.17]} s={[0.008, 0.52, 0.008]} c="#fde68a" />;
          })}
          <group position={[0.3, 0.3, 0.12]} rotation={[0, 0, -0.35]}>
            <B p={[0, 0, 0]} s={[0.02, 0.5, 0.02]} c="#3f2a1a" />
          </group>
        </group>
      );
    case 'telescope':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <group key={i} rotation={[0, (i / 3) * Math.PI * 2 + Math.PI / 2, 0]}>
              <group position={[0.2, 0.48, 0]} rotation={[0, 0, 0.4]}>
                <B p={[0, 0, 0]} s={[0.035, 1.05, 0.035]} c="#374151" />
              </group>
            </group>
          ))}
          <Cyl p={[0, 1.0, 0]} r={0.05} h={0.1} c="#111827" />
          <Tube p={[0, 1.17, 0.05]} rot={[Math.PI / 2 - 0.5, 0, 0]} r={0.07} h={0.9} c="#f8fafc" />
          <Tube p={[0, 1.39, 0.45]} rot={[Math.PI / 2 - 0.5, 0, 0]} r={0.085} h={0.08} c="#111827" />
          <Tube p={[0, 0.93, -0.39]} rot={[Math.PI / 2 - 0.5, 0, 0]} r={0.03} h={0.14} c="#111827" />
        </group>
      );
    case 'workbench':
      return (
        <group>
          {legs(1.7, 0.6, 0.82, '#374151', 0.08)}
          <B p={[0, 0.85, 0]} s={[1.8, 0.08, 0.7]} c="#a16207" />
          <B p={[0, 0.25, 0]} s={[1.6, 0.04, 0.55]} c="#78350f" />
          <B p={[0.4, 0.37, 0]} s={[0.5, 0.2, 0.25]} c="#dc2626" />
          <B p={[0, 1.4, -0.33]} s={[1.8, 1.0, 0.04]} c="#d6d3d1" />
          <B p={[-0.65, 1.45, -0.3]} s={[0.05, 0.4, 0.02]} c="#dc2626" />
          <B p={[-0.35, 1.4, -0.3]} s={[0.04, 0.4, 0.02]} c="#8b5a2b" />
          <B p={[-0.35, 1.6, -0.3]} s={[0.18, 0.07, 0.04]} c="#4b5563" />
          <B p={[-0.05, 1.45, -0.3]} s={[0.04, 0.36, 0.02]} c="#9ca3af" />
          <B p={[0.42, 1.45, -0.3]} s={[0.5, 0.14, 0.02]} c="#cbd5e1" />
          <B p={[0.72, 1.45, -0.3]} s={[0.12, 0.2, 0.03]} c="#f59e0b" />
          <B p={[0.6, 0.95, 0.2]} s={[0.2, 0.12, 0.2]} c="#1d4ed8" />
          <B p={[-0.3, 0.97, 0.05]} s={[0.36, 0.16, 0.14]} c="#1f2937" />
        </group>
      );
    case 'globe':
      return (
        <group>
          <Cyl p={[0, 0.03, 0]} r={0.2} h={0.06} c="#5a371e" seg={12} />
          <Cyl p={[0, 0.42, 0]} r={0.03} h={0.75} c="#7a4a26" />
          <Ball p={[0, 1.1, 0]} r={0.28} c="#2563eb" detail={1} />
          <Ball p={[0.08, 1.2, 0.18]} r={0.12} c="#16a34a" />
          <Ball p={[-0.15, 1.04, 0.17]} r={0.1} c="#16a34a" />
          <Ball p={[0.06, 1.0, -0.21]} r={0.11} c="#16a34a" />
          <mesh position={[0, 1.1, 0]} rotation={[0, 0, -Math.PI / 2 + 0.4]}>
            <torusGeometry args={[0.32, 0.012, 4, 16, Math.PI]} />
            <meshStandardMaterial color="#d4af37" flatShading />
          </mesh>
        </group>
      );
    case 'clothes_line':
      return (
        <group>
          <B p={[-0.9, 0.9, 0]} s={[0.07, 1.8, 0.07]} c="#6b4426" />
          <B p={[0.9, 0.9, 0]} s={[0.07, 1.8, 0.07]} c="#6b4426" />
          <B p={[0, 1.7, 0]} s={[1.8, 0.015, 0.015]} c="#f5f1e8" />
          <B p={[-0.5, 1.45, 0]} s={[0.34, 0.5, 0.02]} c="#dc2626" />
          <B p={[-0.05, 1.4, 0]} s={[0.34, 0.6, 0.02]} c="#2563eb" />
          <B p={[0.42, 1.48, 0]} s={[0.34, 0.44, 0.02]} c="#facc15" />
          <Cyl p={[0.4, 0.1, 0.2]} r={0.18} rt={0.24} h={0.2} c="#0ea5e9" seg={12} />
        </group>
      );
    case 'basketball_hoop':
      return (
        <group>
          <B p={[0, 0.06, -0.3]} s={[0.6, 0.12, 0.4]} c="#1f2937" />
          <Cyl p={[0, 1.4, -0.3]} r={0.045} h={2.7} c="#6b7280" />
          <B p={[0, 2.75, -0.22]} s={[0.9, 0.6, 0.04]} c="#f8fafc" />
          <B p={[0, 2.68, -0.195]} s={[0.36, 0.26, 0.01]} c="#dc2626" />
          <mesh position={[0, 2.55, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.18, 0.015, 6, 16]} />
            <meshStandardMaterial color="#ea580c" flatShading />
          </mesh>
          <Cyl p={[0, 2.42, 0]} r={0.11} rt={0.17} h={0.24} c="#f8fafc" />
          <Ball p={[0.25, 0.12, 0.25]} r={0.12} c="#ea580c" detail={1} />
        </group>
      );
    case 'fire_pit':
      return (
        <group>
          <Cyl p={[0, 0.02, 0]} r={0.32} h={0.04} c="#292524" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <Ball key={i} p={[Math.cos(a) * 0.32, 0.08, Math.sin(a) * 0.32]} r={0.1} c="#78716c" />;
          })}
          <group rotation={[0, 0.6, 0]}><Tube p={[0, 0.1, 0]} rot={ACROSS} r={0.045} h={0.45} c="#5a371e" /></group>
          <group rotation={[0, -0.6, 0]}><Tube p={[0, 0.12, 0]} rot={ACROSS} r={0.045} h={0.45} c="#5a371e" /></group>
          <mesh position={[0, 0.32, 0]}>
            <coneGeometry args={[0.13, 0.36, 6]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1} flatShading />
          </mesh>
          <mesh position={[0.05, 0.25, 0.05]}>
            <coneGeometry args={[0.08, 0.22, 5]} />
            <meshStandardMaterial color="#fde047" emissive="#fde047" emissiveIntensity={1} flatShading />
          </mesh>
        </group>
      );
    case 'dog_kennel':
      return (
        <group>
          <B p={[-0.45, 0.35, 0]} s={[0.85, 0.7, 0.85]} c="#a16207" />
          <B p={[-0.45, 0.78, 0]} s={[0.5, 0.16, 0.84]} c="#a16207" />
          <group position={[-0.67, 0.82, 0]} rotation={[0, 0, 0.6]}>
            <B p={[0, 0, 0]} s={[0.6, 0.06, 0.95]} c="#7f1d1d" />
          </group>
          <group position={[-0.23, 0.82, 0]} rotation={[0, 0, -0.6]}>
            <B p={[0, 0, 0]} s={[0.6, 0.06, 0.95]} c="#7f1d1d" />
          </group>
          <B p={[-0.45, 0.25, 0.43]} s={[0.36, 0.44, 0.01]} c="#1c1917" />
          <Cyl p={[0.12, 0.04, 0.3]} r={0.1} rt={0.12} h={0.08} c="#dc2626" />
          <B p={[0.58, 0.32, 0]} s={[0.22, 0.22, 0.5]} c="#b45309" />
          <B p={[0.58, 0.5, 0.3]} s={[0.2, 0.2, 0.22]} c="#b45309" />
          <B p={[0.58, 0.46, 0.44]} s={[0.1, 0.09, 0.1]} c="#78350f" />
          <B p={[0.5, 0.62, 0.26]} s={[0.05, 0.08, 0.05]} c="#78350f" />
          <B p={[0.66, 0.62, 0.26]} s={[0.05, 0.08, 0.05]} c="#78350f" />
          {[[0.5, 0.18], [0.66, 0.18], [0.5, -0.18], [0.66, -0.18]].map(([x, z], i) => (
            <B key={i} p={[x, 0.11, z]} s={[0.06, 0.22, 0.06]} c="#b45309" />
          ))}
          <B p={[0.58, 0.46, -0.27]} s={[0.04, 0.18, 0.04]} c="#b45309" />
        </group>
      );
    case 'chicken_coop':
      return (
        <group>
          {[[-0.81, -0.33], [-0.09, -0.33], [-0.81, 0.33], [-0.09, 0.33]].map(([x, z], i) => (
            <B key={i} p={[x, 0.15, z]} s={[0.06, 0.3, 0.06]} c="#6b4426" />
          ))}
          <B p={[-0.45, 0.6, 0]} s={[0.85, 0.6, 0.8]} c="#d6b98c" />
          <B p={[-0.45, 0.52, 0.405]} s={[0.24, 0.3, 0.01]} c="#1c1917" />
          <group position={[-0.45, 0.98, 0]} rotation={[0.25, 0, 0]}>
            <B p={[0, 0, 0]} s={[0.95, 0.05, 0.95]} c="#7f1d1d" />
          </group>
          <B p={[0.93, 0.3, 0.4]} s={[0.04, 0.6, 0.04]} c="#6b4426" />
          <B p={[0.93, 0.3, -0.4]} s={[0.04, 0.6, 0.04]} c="#6b4426" />
          <B p={[0.47, 0.6, 0.4]} s={[0.96, 0.04, 0.04]} c="#6b4426" />
          <B p={[0.47, 0.6, -0.4]} s={[0.96, 0.04, 0.04]} c="#6b4426" />
          <B p={[0.93, 0.6, 0]} s={[0.04, 0.04, 0.8]} c="#6b4426" />
          <B p={[0.47, 0.3, 0.4]} s={[0.9, 0.56, 0.01]} c="#d1d5db" o={0.3} />
          <B p={[0.47, 0.3, -0.4]} s={[0.9, 0.56, 0.01]} c="#d1d5db" o={0.3} />
          <B p={[0.93, 0.3, 0]} s={[0.01, 0.56, 0.78]} c="#d1d5db" o={0.3} />
          {([[0.32, 0.05, '#f8fafc'], [0.68, -0.12, '#92400e']] as [number, number, string][]).map(([x, z, c]) => (
            <group key={x}>
              <Ball p={[x, 0.14, z]} r={0.1} c={c} />
              <Ball p={[x, 0.26, z + 0.08]} r={0.05} c={c} />
              <B p={[x, 0.32, z + 0.08]} s={[0.02, 0.04, 0.04]} c="#dc2626" />
              <B p={[x, 0.25, z + 0.14]} s={[0.02, 0.02, 0.04]} c="#f59e0b" />
            </group>
          ))}
        </group>
      );
    case 'veg_garden':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[1.9, 0.06, 1.9]} c="#5b3a1e" />
          {[-0.6, 0, 0.6].map((z, row) => (
            <group key={z}>
              <B p={[0, 0.1, z]} s={[1.7, 0.1, 0.36]} c="#6b4423" />
              {[-0.65, -0.22, 0.22, 0.65].map((x) => (
                <group key={x}>
                  {row === 0 && <Ball p={[x, 0.25, z]} r={0.14} c="#15803d" />}
                  {row === 1 && <Ball p={[x, 0.24, z]} r={0.11} c="#16a34a" />}
                  {row === 1 && <Ball p={[x + 0.08, 0.26, z + 0.07]} r={0.045} c="#dc2626" />}
                  {row === 2 && <B p={[x, 0.36, z]} s={[0.03, 0.44, 0.03]} c="#65a30d" />}
                  {row === 2 && <B p={[x, 0.42, z]} s={[0.22, 0.02, 0.05]} c="#4d7c0f" />}
                  {row === 2 && <B p={[x + 0.03, 0.3, z]} s={[0.05, 0.12, 0.05]} c="#facc15" />}
                </group>
              ))}
            </group>
          ))}
        </group>
      );
    case 'parasol_set':
      return (
        <group>
          <Cyl p={[0, 0.03, 0]} r={0.22} h={0.06} c="#374151" seg={12} />
          <Cyl p={[0, 1.15, 0]} r={0.025} h={2.3} c="#9ca3af" />
          <Cyl p={[0, 0.72, 0]} r={0.45} h={0.04} c="#f8fafc" seg={16} />
          <Cyl p={[0, 2.2, 0]} r={0.95} rt={0.03} h={0.3} c="#dc2626" seg={8} />
          {[-1, 1].map((side) => (
            <group key={side} position={[0, 0, side * 0.65]}>
              <B p={[0, 0.42, 0]} s={[0.42, 0.05, 0.42]} c="#f8fafc" />
              <B p={[0, 0.7, side * 0.2]} s={[0.42, 0.5, 0.04]} c="#f8fafc" />
              {legs(0.4, 0.4, 0.4, '#e2e8f0', 0.05)}
            </group>
          ))}
        </group>
      );
    case 'garden_swing':
      return (
        <group>
          {[-0.92, 0.92].map((x) => [-0.22, 0.22].map((tilt) => (
            <group key={`${x}${tilt}`} position={[x, 1.9, 0]} rotation={[tilt, 0, 0]}>
              <B p={[0, -0.97, 0]} s={[0.06, 1.95, 0.06]} c="#f8fafc" />
            </group>
          )))}
          <B p={[0, 1.9, 0]} s={[1.9, 0.07, 0.07]} c="#f8fafc" />
          <B p={[0, 2.0, 0]} s={[1.9, 0.04, 0.8]} c="#0ea5e9" />
          <B p={[-0.68, 1.2, 0]} s={[0.02, 1.4, 0.02]} c="#9ca3af" />
          <B p={[0.68, 1.2, 0]} s={[0.02, 1.4, 0.02]} c="#9ca3af" />
          <B p={[0, 0.5, 0]} s={[1.4, 0.06, 0.45]} c="#fbbf24" />
          <B p={[0, 0.8, -0.22]} s={[1.4, 0.5, 0.05]} c="#fbbf24" />
        </group>
      );
    case 'well':
      return (
        <group>
          <Cyl p={[0, 0.3, 0]} r={0.42} h={0.6} c="#a8a29e" seg={12} />
          <Cyl p={[0, 0.605, 0]} r={0.34} h={0.01} c="#0c4a6e" seg={12} />
          <B p={[-0.4, 0.95, 0]} s={[0.07, 1.3, 0.07]} c="#6b4426" />
          <B p={[0.4, 0.95, 0]} s={[0.07, 1.3, 0.07]} c="#6b4426" />
          <Tube p={[0, 1.45, 0]} rot={ACROSS} r={0.04} h={0.9} c="#5a371e" />
          <group position={[0, 1.72, -0.2]} rotation={[-0.5, 0, 0]}>
            <B p={[0, 0, 0]} s={[1.0, 0.05, 0.5]} c="#7f1d1d" />
          </group>
          <group position={[0, 1.72, 0.2]} rotation={[0.5, 0, 0]}>
            <B p={[0, 0, 0]} s={[1.0, 0.05, 0.5]} c="#7f1d1d" />
          </group>
          <B p={[0, 1.12, 0]} s={[0.015, 0.66, 0.015]} c="#fef3c7" />
          <Cyl p={[0, 0.72, 0]} r={0.1} rt={0.13} h={0.18} c="#9ca3af" />
        </group>
      );
    case 'security_light':
      return (
        <group>
          <B p={[0, 0.02, 0]} s={[0.3, 0.04, 0.3]} c="#374151" />
          <Cyl p={[0, 1.3, 0]} r={0.04} h={2.6} c="#6b7280" />
          <B p={[0, 2.6, 0]} s={[0.5, 0.05, 0.05]} c="#374151" />
          {[-0.2, 0.2].map((x) => (
            <group key={x} position={[x, 2.55, 0.08]} rotation={[0.5, 0, 0]}>
              <B p={[0, 0, 0]} s={[0.2, 0.16, 0.1]} c="#1f2937" />
              <B p={[0, 0, 0.055]} s={[0.17, 0.13, 0.01]} c="#fef9c3" e={powered ? '#fef08a' : undefined} />
            </group>
          ))}
        </group>
      );
    case 'garden_lamp':
      return (
        <group>
          <Cyl p={[0, 0.05, 0]} r={0.14} h={0.1} c="#1f2937" />
          <Cyl p={[0, 0.85, 0]} r={0.035} h={1.6} c="#1f2937" />
          <B p={[0, 1.78, 0]} s={[0.22, 0.26, 0.22]} c={powered ? '#fde68a' : '#fef3c7'} e={powered ? '#fde68a' : undefined} />
          <Cyl p={[0, 1.96, 0]} r={0.2} rt={0.03} h={0.1} c="#1f2937" seg={8} />
        </group>
      );
    case 'wall_art':
      return (
        <group>
          <B p={[0, 1.45, -0.46]} s={[0.8, 0.6, 0.04]} c="#5a371e" />
          <B p={[0, 1.45, -0.435]} s={[0.7, 0.5, 0.01]} c="#f59e0b" />
          <B p={[-0.18, 1.45, -0.428]} s={[0.2, 0.36, 0.005]} c="#1d4ed8" />
          <group position={[0.15, 1.45, -0.428]} rotation={[0, 0, Math.PI / 4]}>
            <B p={[0, 0, 0]} s={[0.2, 0.2, 0.005]} c="#dc2626" />
            <B p={[0, 0, 0.004]} s={[0.08, 0.08, 0.005]} c="#facc15" />
          </group>
        </group>
      );
    case 'calabash_display':
      return (
        <group>
          <B p={[-0.38, 0.27, 0]} s={[0.04, 0.54, 0.4]} c="#5a371e" />
          <B p={[0.38, 0.27, 0]} s={[0.04, 0.54, 0.4]} c="#5a371e" />
          <B p={[0, 0.1, 0]} s={[0.8, 0.05, 0.4]} c="#8b5a2b" />
          <B p={[0, 0.52, 0]} s={[0.8, 0.05, 0.4]} c="#8b5a2b" />
          <Ball p={[-0.2, 0.22, 0]} r={0.1} c="#92400e" />
          <Ball p={[0.12, 0.24, 0]} r={0.11} c="#ca8a04" />
          <Cyl p={[0.12, 0.38, 0]} r={0.03} h={0.1} c="#ca8a04" />
          <Ball p={[-0.2, 0.66, 0]} r={0.14} c="#d97706" />
          <Ball p={[0.18, 0.64, 0.02]} r={0.11} c="#b45309" />
        </group>
      );
    case 'shoe_rack':
      return (
        <group>
          <B p={[-0.4, 0.36, 0]} s={[0.03, 0.72, 0.35]} c="#78350f" />
          <B p={[0.4, 0.36, 0]} s={[0.03, 0.72, 0.35]} c="#78350f" />
          {[0.15, 0.4, 0.65].map((y, row) => (
            <group key={y}>
              <B p={[0, y, 0]} s={[0.8, 0.03, 0.35]} c="#a16207" />
              {[-0.25, 0, 0.25].map((x, i) => (
                <B key={x} p={[x, y + 0.055, 0.02]} s={[0.16, 0.08, 0.26]} c={['#111827', '#f8fafc', '#b91c1c', '#1d4ed8', '#78350f'][(row * 2 + i) % 5]} />
              ))}
            </group>
          ))}
        </group>
      );
    case 'snake_plant':
      return (
        <group>
          <Cyl p={[0, 0.18, 0]} r={0.18} rt={0.24} h={0.36} c="#f5f5f4" />
          {([[-0.08, 0.02, 0.9, 0.1], [0.07, -0.04, 1.05, -0.08], [0, 0.08, 0.75, 0.05], [0.1, 0.07, 0.6, -0.16], [-0.1, -0.07, 0.7, 0.15]] as number[][]).map(([x, z, h, tilt], i) => (
            <group key={i} position={[x, 0.34, z]} rotation={[0, i * 0.7, tilt]}>
              <B p={[0, h / 2, 0]} s={[0.08, h, 0.025]} c={i % 2 ? '#15803d' : '#166534'} />
            </group>
          ))}
        </group>
      );
    case 'room_divider':
      return (
        <group>
          {[-0.6, 0, 0.6].map((x, i) => (
            <group key={x} position={[x, 0.9, 0]} rotation={[0, i % 2 ? -0.35 : 0.35, 0]}>
              <B p={[0, 0, 0]} s={[0.63, 1.8, 0.04]} c="#5a371e" />
              <B p={[0, 0.2, 0.022]} s={[0.46, 1.0, 0.01]} c="#d6b98c" />
              <B p={[0, 0.2, -0.022]} s={[0.46, 1.0, 0.01]} c="#d6b98c" />
              <B p={[0, -0.6, 0.022]} s={[0.46, 0.3, 0.01]} c="#7a4a26" />
              <B p={[0, -0.6, -0.022]} s={[0.46, 0.3, 0.01]} c="#7a4a26" />
            </group>
          ))}
        </group>
      );
    case 'console_table':
      return (
        <group>
          <group position={[0, 0, -0.15]}>{legs(1.5, 0.35, 0.78, '#3f2a1a', 0.05)}</group>
          <B p={[0, 0.8, -0.15]} s={[1.6, 0.05, 0.4]} c="#3f2a1a" />
          <B p={[0, 0.3, -0.15]} s={[1.5, 0.03, 0.34]} c="#5a371e" />
          <B p={[0.1, 0.36, -0.15]} s={[0.3, 0.08, 0.22]} c="#7f1d1d" />
          <Cyl p={[-0.45, 0.96, -0.15]} r={0.08} rt={0.12} h={0.28} c="#0e7490" />
          <B p={[-0.45, 1.2, -0.15]} s={[0.015, 0.25, 0.015]} c="#15803d" />
          <Ball p={[-0.45, 1.35, -0.15]} r={0.07} c="#f472b6" />
          <Ball p={[-0.38, 1.27, -0.11]} r={0.05} c="#fde047" />
          <B p={[0.4, 0.97, -0.22]} s={[0.24, 0.3, 0.03]} c="#d4af37" />
          <B p={[0.4, 0.97, -0.203]} s={[0.18, 0.24, 0.005]} c="#f5f1e8" />
        </group>
      );
    case 'saddle_stand':
      return (
        <group>
          {[[-0.2, -0.28], [0.2, -0.28], [-0.2, 0.28], [0.2, 0.28]].map(([x, z], i) => (
            <B key={i} p={[x, 0.42, z]} s={[0.06, 0.85, 0.06]} c="#5a371e" />
          ))}
          <Tube p={[0, 0.9, 0]} rot={ALONG} r={0.12} h={0.7} c="#6b4426" />
          <B p={[0, 0.99, 0]} s={[0.44, 0.04, 0.6]} c="#b91c1c" />
          <B p={[-0.21, 0.82, 0]} s={[0.03, 0.36, 0.6]} c="#b91c1c" />
          <B p={[0.21, 0.82, 0]} s={[0.03, 0.36, 0.6]} c="#b91c1c" />
          <B p={[-0.215, 0.66, 0]} s={[0.035, 0.05, 0.6]} c="#facc15" />
          <B p={[0.215, 0.66, 0]} s={[0.035, 0.05, 0.6]} c="#facc15" />
          <B p={[0, 1.05, 0]} s={[0.3, 0.08, 0.44]} c="#3f2a1a" />
          <B p={[0, 1.15, 0.2]} s={[0.14, 0.16, 0.06]} c="#d4af37" />
          <B p={[0, 1.13, -0.2]} s={[0.24, 0.14, 0.05]} c="#3f2a1a" />
          <B p={[-0.25, 0.52, 0.05]} s={[0.02, 0.3, 0.02]} c="#9ca3af" />
          <B p={[0.25, 0.52, 0.05]} s={[0.02, 0.3, 0.02]} c="#9ca3af" />
          <B p={[-0.25, 0.37, 0.05]} s={[0.03, 0.03, 0.1]} c="#d4af37" />
          <B p={[0.25, 0.37, 0.05]} s={[0.03, 0.03, 0.1]} c="#d4af37" />
        </group>
      );
    default:
      return <B p={[0, 0.4, 0]} s={[0.8, 0.8, 0.8]} c="#f0f" />;
  }
}

/** Bajaj-style Kaduna keke: the roof, short bonnet and three-wheel stance read clearly from above. */
// The keke is drawn in KekeModel.tsx.
export { Keke } from './KekeModel';

/** A round bar at any angle: fork legs, shocks, the exhaust, axles. */
function Tube({ p, rot, r, h, c: base, rt, metal = false }: { p: V3; rot: V3; r: number; h: number; c: string; rt?: number; metal?: boolean }) {
  const c = useTint(base);
  return (
    <mesh position={p} rotation={rot} castShadow>
      <cylinderGeometry args={[rt ?? r, r, h, 8]} />
      <meshStandardMaterial color={c} metalness={metal ? 0.5 : 0} roughness={metal ? 0.4 : 1} flatShading />
    </mesh>
  );
}

const CHROME = '#cbd5e1';
const ACROSS: V3 = [0, 0, Math.PI / 2];
const ALONG: V3 = [Math.PI / 2, 0, 0];

/**
 * Bajaj Boxer-style okada facing +z like the other road vehicles: long flat seat, rear carrier, crash bar and
 * raked forks. `rider` puts an okada man on it (traffic); the player's own bike carries the player instead.
 */
export function Bike({ colour = '#16a34a', rider = false }: { colour?: string; rider?: boolean }) {
  return (
    <group>
      {/* Wheels: tyre, rim and hub */}
      {[-0.53, 0.58].map((z) => (
        <group key={z} position={[0, 0.27, z]}>
          <mesh rotation={ACROSS} castShadow>
            <cylinderGeometry args={[0.27, 0.27, 0.11, 14]} />
            <meshStandardMaterial color="#111827" flatShading />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.185, 0.028, 6, 14]} />
            <meshStandardMaterial color={CHROME} metalness={0.4} roughness={0.45} />
          </mesh>
          <Tube p={[0, 0, 0]} rot={ACROSS} r={0.06} h={0.15} c="#64748b" metal />
        </group>
      ))}
      {/* Mudguards */}
      <B p={[0, 0.57, 0.6]} s={[0.14, 0.035, 0.34]} c={colour} />
      <B p={[0, 0.5, 0.8]} s={[0.14, 0.12, 0.035]} c={colour} />
      <B p={[0, 0.58, -0.56]} s={[0.15, 0.035, 0.42]} c={colour} />
      {/* Raked front forks up to the yoke */}
      {[-0.09, 0.09].map((x) => <Tube key={x} p={[x, 0.585, 0.485]} rot={[-0.29, 0, 0]} r={0.028} h={0.66} c={CHROME} metal />)}
      <B p={[0, 0.88, 0.4]} s={[0.24, 0.05, 0.08]} c="#1f2937" />
      {/* Frame, engine and crankcase */}
      <B p={[0, 0.6, 0.02]} s={[0.08, 0.08, 0.8]} c="#1f2937" />
      <Tube p={[0, 0.52, 0.31]} rot={[0.5, 0, 0]} r={0.035} h={0.5} c="#1f2937" />
      <B p={[0, 0.36, 0.06]} s={[0.22, 0.2, 0.34]} c="#475569" />
      <B p={[0, 0.5, 0.13]} s={[0.17, 0.12, 0.17]} c="#94a3b8" />
      <Tube p={[0, 0.34, 0]} rot={ACROSS} r={0.115} h={0.27} c="#94a3b8" metal />
      {/* Crash bar and foot pegs */}
      <B p={[0, 0.42, 0.27]} s={[0.46, 0.03, 0.03]} c={CHROME} />
      <B p={[0, 0.25, -0.04]} s={[0.44, 0.03, 0.06]} c="#1f2937" />
      {/* Swingarm, twin rear shocks, chain guard */}
      <B p={[0, 0.28, -0.3]} s={[0.2, 0.045, 0.5]} c="#1f2937" />
      {[-0.115, 0.115].map((x) => <Tube key={x} p={[x, 0.45, -0.45]} rot={[0.4, 0, 0]} r={0.03} h={0.4} c={CHROME} metal />)}
      <B p={[-0.1, 0.36, -0.3]} s={[0.025, 0.07, 0.42]} c="#334155" />
      {/* Exhaust down the right side */}
      <Tube p={[0.15, 0.3, -0.1]} rot={ALONG} r={0.028} h={0.5} c={CHROME} metal />
      <Tube p={[0.15, 0.33, -0.56]} rot={[Math.PI / 2 + 0.12, 0, 0]} r={0.05} rt={0.06} h={0.46} c={CHROME} metal />
      {/* Tank with a knee stripe, side panels */}
      <B p={[0, 0.74, 0.17]} s={[0.27, 0.15, 0.4]} c={colour} />
      <B p={[0, 0.83, 0.19]} s={[0.2, 0.04, 0.32]} c={colour} />
      <B p={[0, 0.74, 0.17]} s={[0.275, 0.035, 0.3]} c="#f8fafc" />
      <Cyl p={[0, 0.86, 0.26]} r={0.035} h={0.02} c={CHROME} seg={8} />
      <B p={[0, 0.56, -0.2]} s={[0.21, 0.15, 0.28]} c={colour} />
      {/* Long okada seat, grab rail and carrier */}
      <B p={[0, 0.72, -0.27]} s={[0.25, 0.09, 0.54]} c="#111827" />
      <B p={[0, 0.745, -0.47]} s={[0.24, 0.06, 0.16]} c="#1f2937" />
      <B p={[0, 0.73, -0.68]} s={[0.24, 0.025, 0.24]} c={CHROME} />
      {[-0.11, 0.11].map((x) => <B key={x} p={[x, 0.66, -0.62]} s={[0.025, 0.12, 0.025]} c={CHROME} />)}
      {/* Tail light, indicators and plate */}
      <B p={[0, 0.64, -0.79]} s={[0.12, 0.07, 0.04]} c="#ef4444" e="#b91c1c" />
      {[-0.13, 0.13].map((x) => <B key={x} p={[x, 0.64, -0.77]} s={[0.05, 0.04, 0.04]} c="#f59e0b" />)}
      <B p={[0, 0.5, -0.8]} s={[0.17, 0.1, 0.02]} c="#f8fafc" />
      {/* Handlebars, grips, mirrors, clocks and headlamp */}
      <B p={[0, 0.94, 0.38]} s={[0.6, 0.035, 0.035]} c="#334155" />
      {[-0.27, 0.27].map((x) => (
        <group key={x}>
          <B p={[x, 0.94, 0.38]} s={[0.11, 0.055, 0.055]} c="#0f172a" />
          <B p={[x * 0.82, 1.01, 0.38]} s={[0.02, 0.12, 0.02]} c="#334155" />
          <B p={[x * 0.86, 1.08, 0.37]} s={[0.09, 0.06, 0.02]} c="#0f172a" />
        </group>
      ))}
      <B p={[0, 0.93, 0.45]} s={[0.14, 0.06, 0.06]} c="#0f172a" />
      <B p={[0, 0.8, 0.5]} s={[0.2, 0.2, 0.08]} c="#1f2937" />
      <Tube p={[0, 0.8, 0.55]} rot={ALONG} r={0.085} h={0.05} c="#fef3c7" />
      <B p={[0, 0.8, 0.58]} s={[0.1, 0.1, 0.01]} c="#fef3c7" e="#fef08a" />
      {[-0.15, 0.15].map((x) => <B key={x} p={[x, 0.8, 0.49]} s={[0.05, 0.04, 0.04]} c="#f59e0b" />)}
      {rider && <BikeRider />}
    </group>
  );
}

/** The okada man: leaning into the bars, feet on the pegs. Built for the seat of `Bike`. */
function BikeRider() {
  const skin = '#6b4423';
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          {/* Thigh, shin and sandal */}
          <B p={[side * 0.17, 0.74, -0.06]} s={[0.12, 0.12, 0.36]} c="#1e293b" />
          <B p={[side * 0.19, 0.5, 0.06]} s={[0.1, 0.42, 0.11]} c="#1e293b" />
          <B p={[side * 0.2, 0.29, 0.1]} s={[0.1, 0.05, 0.2]} c="#451a03" />
          {/* Upper arm down to the grip */}
          <mesh position={[side * 0.24, 1.07, 0.15]} rotation={[0.44, side * 0.08, 0]} castShadow>
            <boxGeometry args={[0.09, 0.09, 0.56]} />
            <meshStandardMaterial color="#e2e8f0" flatShading />
          </mesh>
          <B p={[side * 0.27, 0.96, 0.38]} s={[0.08, 0.07, 0.08]} c={skin} />
        </group>
      ))}
      {/* Torso leaning forward, in a long kaftan-style shirt */}
      <group position={[0, 0.8, -0.24]} rotation={[0.2, 0, 0]}>
        <B p={[0, 0.25, 0]} s={[0.34, 0.5, 0.2]} c="#e2e8f0" />
        <B p={[0, 0.56, 0]} s={[0.1, 0.08, 0.1]} c={skin} />
        <Ball p={[0, 0.72, 0.01]} r={0.15} c={skin} detail={1} />
        {/* Cap */}
        <Cyl p={[0, 0.83, 0.01]} r={0.135} rt={0.12} h={0.1} c="#7f1d1d" seg={8} />
      </group>
    </group>
  );
}

export function Tree({ s = 1 }: { s?: number }) {
  return (
    <group scale={s}>
      <Cyl p={[0, 1, 0]} r={0.16} rt={0.11} h={2} c="#5b3a1e" seg={6} />
      <Ball p={[0, 2.5, 0]} r={1.1} c="#3f7d2a" />
      <Ball p={[0.6, 2.1, 0.3]} r={0.7} c="#4d8f31" />
    </group>
  );
}
