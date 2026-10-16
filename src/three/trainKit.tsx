// The Nigerian Railway train, built in code: the Chinese-built standard-gauge stock that runs Abuja – Kaduna and Lagos –
// Ibadan, in the railway's white and green with a yellow line, behind a green diesel with a yellow nose. Used on the
// city map (StationModel), at the station's platform (StationPlatform) and outside your coach on a ride (TrainRide).
// Everything goes into a cabinKit Kit, so a whole train is a handful of draw calls.
//
// A car lies along z, centred on the origin, with the tops of the rails at y = 0. At scale 1 it is 1.8 wide: a coach
// at the station's platform. Scale it for the map, or for the coach you ride in.

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshBasicMaterial, MeshStandardMaterial, Vector3, type Group, type Material } from 'three';
import { Kit, KitMeshes, type Built, type Finish, type V3 } from './cabinKit';

export const RAIL_WHITE = '#f8fafc';
export const RAIL_GREEN = '#15803d';
export const RAIL_YELLOW = '#facc15';
const DARK = '#1f2937';
const TINT = '#1e293b';
/** Where the coach body starts above the rails, and how tall it is, at scale 1. */
export const BODY_Y = 0.95;
export const BODY_H = 2.05;
export const CAR_W = 1.8;

/** Two bogies under a car of length `len`: frames, wheels on both rails, and the underframe and its equipment boxes. */
function running(k: Kit, len: number) {
  for (const z of [-(len / 2 - 1.6), len / 2 - 1.6]) {
    k.box([1.5, 0.28, 2.1], [0, 0.45, z], DARK, 'satin');
    for (const dz of [-0.55, 0.55]) for (const x of [-0.78, 0.78]) k.cyl(0.3, 0.3, 0.1, [x, 0.3, z + dz], '#374151', 'metal', [0, 0, Math.PI / 2], 14);
  }
  k.box([1.6, 0.32, len - 0.6], [0, 0.78, 0], DARK, 'satin');
  for (const z of [-len * 0.12, len * 0.12]) k.box([1.2, 0.3, len * 0.16], [0, 0.6, z], '#374151', 'satin');
}

/**
 * A passenger coach: white, a green skirt with a yellow line over it, the tinted window band down both sides, a door
 * at each end of each side, a grey roof with its air-conditioning pods, and the gangway bellows at both ends.
 */
export function coach(k: Kit, len: number, opts: { roof?: boolean; band?: boolean } = {}) {
  running(k, len);
  const y = BODY_Y + BODY_H / 2;
  k.soft([CAR_W, BODY_H, len], [0, y, 0], RAIL_WHITE, 'satin', undefined, 0.08);
  k.box([CAR_W + 0.02, 0.36, len - 0.1], [0, BODY_Y + 0.18, 0], RAIL_GREEN, 'satin');
  k.box([CAR_W + 0.025, 0.05, len - 0.1], [0, BODY_Y + 0.4, 0], RAIL_YELLOW, 'satin');
  if (opts.band !== false) {
    k.box([CAR_W + 0.03, 0.55, len - 2.6], [0, BODY_Y + 1.1, 0], TINT, 'satin');
    const n = Math.max(2, Math.round((len - 2.6) / 1.1));
    for (let i = 1; i < n; i++) k.box([CAR_W + 0.035, 0.55, 0.07], [0, BODY_Y + 1.1, -(len - 2.6) / 2 + (i * (len - 2.6)) / n], RAIL_WHITE, 'satin');
  }
  for (const z of [-(len / 2 - 0.7), len / 2 - 0.7]) {
    k.box([CAR_W + 0.03, 1.6, 0.68], [0, BODY_Y + 0.85, z], '#d1d5db', 'satin');
    k.box([CAR_W + 0.04, 0.42, 0.36], [0, BODY_Y + 1.2, z], TINT, 'satin');
  }
  if (opts.roof !== false) {
    k.soft([CAR_W - 0.1, 0.24, len - 0.2], [0, BODY_Y + BODY_H + 0.06, 0], '#cbd5e1', 'satin', undefined, 0.1);
    for (const z of [-len * 0.28, len * 0.28]) k.soft([1.0, 0.22, 1.6], [0, BODY_Y + BODY_H + 0.25, z], '#e5e7eb', 'satin', undefined, 0.06);
  }
  for (const s of [-1, 1]) k.box([1.2, 1.8, 0.3], [0, BODY_Y + 0.95, s * (len / 2 + 0.12)], '#111827', 'matte');
}

/** The diesel at the head of the train, its cab at the +z end: green, a white band, a yellow nose, a sloped windscreen and headlamps. */
export function loco(k: Kit, len: number) {
  running(k, len);
  const front = len / 2;
  k.soft([CAR_W, 2.0, len - 1.4], [0, BODY_Y + 1.0, -0.7], RAIL_GREEN, 'satin', undefined, 0.08);
  k.box([CAR_W + 0.02, 0.32, len - 0.2], [0, BODY_Y + 0.55, -0.1], RAIL_WHITE, 'satin');
  k.box([CAR_W + 0.025, 0.06, len - 0.2], [0, BODY_Y + 0.33, -0.1], RAIL_YELLOW, 'satin');
  // The cab, its windscreen leaning back over a yellow nose
  k.soft([CAR_W, 2.2, 1.5], [0, BODY_Y + 1.1, front - 1.35], RAIL_GREEN, 'satin', undefined, 0.08);
  k.box([CAR_W - 0.1, 1.0, 0.6], [0, BODY_Y + 0.5, front - 0.35], RAIL_YELLOW, 'satin');
  k.box([CAR_W - 0.2, 0.75, 0.08], [0, BODY_Y + 1.55, front - 0.55], TINT, 'satin', [-0.45, 0, 0]);
  for (const x of [-0.55, 0.55]) k.box([0.22, 0.12, 0.04], [x, BODY_Y + 0.75, front - 0.03], '#fef9c3', 'glow');
  k.box([1.6, 0.12, 0.25], [0, BODY_Y + 0.08, front - 0.1], '#374151', 'metal');
  // Grilles along the roof, and the handrail down the side
  for (let i = 0; i < 4; i++) k.box([1.2, 0.08, 0.9], [0, BODY_Y + 2.04, -front + 1.2 + i * 1.1], '#14532d', 'satin');
  for (const s of [-1, 1]) k.box([0.03, 0.03, len - 2.4], [s * (CAR_W / 2 + 0.04), BODY_Y + 1.2, -0.9], '#e5e7eb', 'metal');
}

/** A whole train built along z from `head` backwards: the diesel, then `coaches` coaches, with a gap at each coupling. */
export function train(k: Kit, coaches: number, coachLen = 7, locoLen = 5.2, gap = 0.3) {
  k.push([0, 0, -locoLen / 2]);
  loco(k, locoLen);
  k.pop();
  for (let i = 0; i < coaches; i++) {
    k.push([0, 0, -locoLen - gap - coachLen / 2 - i * (coachLen + gap)]);
    coach(k, coachLen);
    k.pop();
  }
  return locoLen + coaches * (coachLen + gap);
}

/* ---------- A train that comes and goes ---------- */

/**
 * The train's materials with a cut along one direction: nothing of it is drawn outside [lo, hi] along `axis` (world
 * space). A train can then glide in from beyond the end of a platform or a map plot and out again, with nothing of
 * it showing where it would run through the neighbours.
 */
function clipped() {
  const uniforms = { clipAxis: { value: new Vector3(1, 0, 0) }, clipLo: { value: -1e9 }, clipHi: { value: 1e9 } };
  const make = <T extends Material>(m: T) => {
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vClipAt;\nuniform vec3 clipAxis;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvClipAt = dot((modelMatrix * vec4(transformed, 1.0)).xyz, clipAxis);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vClipAt;\nuniform float clipLo;\nuniform float clipHi;')
        .replace('void main() {', 'void main() {\n  if (vClipAt < clipLo || vClipAt > clipHi) discard;');
    };
    m.customProgramCacheKey = () => 'clip-x';
    return m;
  };
  const materials: Record<Finish, Material> = {
    matte: make(new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })),
    satin: make(new MeshStandardMaterial({ vertexColors: true, roughness: 0.42 })),
    metal: make(new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.75 })),
    glow: make(new MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
  };
  return { materials, uniforms };
}

/** Arrives, stands, leaves, is gone a while: how far along its track the train is at time `t` (seconds) of a `cycle`. */
export function shuttle(t: number, stop: number, reach: number, cycle = 40) {
  const u = ((t % cycle) + cycle) % cycle;
  if (u < 9) { const k = 1 - u / 9; return stop - reach * k * k; } // braking in
  if (u < 22) return stop; // at the platform
  if (u < 31) { const k = (u - 22) / 9; return stop + reach * k * k; } // pulling away
  return stop + reach * 2; // gone (cut away)
}

/**
 * A train running along this group's x axis, seen only between `from` and `to` (in this group's x): it pulls in, stands
 * at `stop` with its nose there, and pulls out again, on a loop. `children` is anything else to draw (not cut).
 */
export function PassingTrain({ build, from, to, stop, at = [0, 0, 0], scale = 1, cycle = 40, phase = 0, children }: {
  build: (k: Kit) => number; from: number; to: number; stop: number; at?: V3; scale?: number; cycle?: number; phase?: number; children?: ReactNode;
}) {
  const holder = useRef<Group>(null!);
  const mover = useRef<Group>(null!);
  const { kit, length } = useMemo(() => { const k = new Kit(false); const length = build(k); return { kit: k.build() as Built, length }; }, [build]);
  const clip = useMemo(clipped, []);
  useEffect(() => () => Object.values(clip.materials).forEach((m) => m.dispose()), [clip]);
  const reach = (to - from) + length * scale + 2;
  const a = useMemo(() => new Vector3(), []);
  const b = useMemo(() => new Vector3(), []);
  useFrame(({ clock }) => {
    mover.current.position.x = shuttle(clock.elapsedTime + phase, stop, reach, cycle);
    // The cut, in world space, from this group's x axis: the map or the room may be turned any way.
    holder.current.updateWorldMatrix(true, false);
    a.set(from, 0, 0).applyMatrix4(holder.current.matrixWorld);
    b.set(to, 0, 0).applyMatrix4(holder.current.matrixWorld);
    const axis = clip.uniforms.clipAxis.value.copy(b).sub(a).normalize();
    clip.uniforms.clipLo.value = a.dot(axis);
    clip.uniforms.clipHi.value = b.dot(axis);
  });
  return (
    <group ref={holder} position={at}>
      {/* Built along z with its nose at z = 0; turned to run along x, nose first. */}
      <group ref={mover}>
        <group rotation-y={Math.PI / 2} scale={scale}>
          <KitMeshes kit={kit} shadows={false} materials={clip.materials} />
        </group>
      </group>
      {children}
    </group>
  );
}
