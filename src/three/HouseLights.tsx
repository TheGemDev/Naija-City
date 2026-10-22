// Night lighting inside a house: the lamps you placed (game/finishes.ts LIGHTS), POP downlights, and the mood.
//
// Cost: no real light per lamp. Bulbs are glowing balls and bars drawn as two instanced meshes; the light they throw
// is faked with additive glow decals on the floor and up the walls (two more instanced meshes, like CityFx's
// LampPools). On top of that at most two real point lights follow you: the two lamps nearest you, or your room's
// ceiling bulb. Low mode has no real lights and no wall washes. When NEPA takes light the house goes dark, unless a
// generator (dim, with a flicker) or solar carries it.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry,
  type PointLight,
} from 'three';
import type { HouseLayout, PlacedItem } from '../game/grid';
import { baseY, centreOf, mountOf, yawOf, WALL_TALL } from '../game/mount';
import { CEILING_BY_ID, LIGHTS, interiorRooms, lampLevel, lampTone, moodOf, roomAt, toneHex, type HouseFinish, type MoodDef } from '../game/finishes';
import { genHere, hourOf, litHere, useGame, type GameState } from '../game/store';
import { useVisit } from '../game/visits';
import { avatar } from '../game/avatar';
import { photoHour } from '../game/photo';
import { sceneHour } from '../game/theme';
import { useLowPerf } from '../game/quality';
import { coveMat, glassMat } from './HouseShell';

// ── State the scene reads ────────────────────────────────────────────────────────────────────────

/** 0 by day, 1 at full night: the same curve the sky uses (Scene.tsx DayNight). */
export function nightNow(s: Pick<GameState, 'minutes'>) {
  const h = photoHour() ?? sceneHour(hourOf(s.minutes));
  const day = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
  return 1 - Math.min(1, day * 2.5);
}

/**
 * How much light the house's supply gives: full on NEPA or solar, dim on a generator (with a flicker), none in a
 * blackout. A house you are visiting runs on its owner's supply (store.ts litHere / genHere).
 */
export function lightSupply(s: GameState, t = 0) {
  if (!litHere(s)) return 0;
  if (genHere(s)) return 0.45 + Math.sin(t * 13.1) * 0.025 + Math.sin(t * 31.7) * 0.02;
  return 1;
}

/** The finish of the house in view: the one you are visiting, or your own. */
export function finishInView(s: GameState): HouseFinish | undefined {
  const visit = useVisit.getState().current;
  if (visit) return visit.save.finish;
  return s.houseFinish?.[s.activeHouseId ?? s.homePropertyId ?? 'starter'];
}

/** A mood's or lamp's colour right now ('rgb' turns slowly round the wheel; `phase` keeps lamps apart). */
function liveColour(tone: string, t: number, out: Color, phase = 0) {
  if (tone === 'rgb') return out.setHSL(((t * 0.08 + phase) % 1 + 1) % 1, 0.95, 0.55);
  return out.set(toneHex(tone));
}

const glowColour = new Color();
/**
 * The house's general bulb light for the sky light in Scene.tsx: how much (0-1, before night) and its colour.
 * Ceiling light by mood, plus a little from the lamps, all times the supply.
 */
export function houseGlow(s: GameState, t: number): { level: number; color: Color } {
  const mood = moodOf(finishInView(s));
  const power = lightSupply(s, t);
  liveColour(mood.colour, t, glowColour);
  return { level: power * (mood.ceiling + 0.2 * Math.min(1, mood.lamps)), color: glowColour };
}

// ── Emitters ─────────────────────────────────────────────────────────────────────────────────────

interface Emitter {
  /** Lamp colour tone ('warm', 'rgb', '#rrggbb'...) and its brightness, times the lamp type's strength. */
  tone: string;
  level: number;
  strip: boolean;
  /** Bulbs in house space: centre and radius, or a bar (centre, length, yaw). */
  balls: { x: number; y: number; z: number; r: number }[];
  bar?: { x: number; y: number; z: number; len: number; yaw: number };
  pool: { x: number; z: number; r: number };
  wash?: { x: number; y: number; z: number; w: number; h: number; yaw: number };
  /** Where a real light would hang, and how strong. */
  real: { x: number; y: number; z: number; k: number };
  /** POP downlights follow the mood's colour and ceiling level instead of a lamp's. */
  ceiling?: boolean;
  phase: number;
}

function emittersOf(items: PlacedItem[], layout: HouseLayout, finish?: HouseFinish): Emitter[] {
  const out: Emitter[] = [];
  items.forEach((it, idx) => {
    const spec = LIGHTS[it.type];
    if (!spec) return;
    const { cx, cz } = centreOf(it);
    const yaw = yawOf(it);
    const y0 = baseY(it);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (p: [number, number, number]) => ({ x: cx + p[0] * c + p[2] * s, y: y0 + p[1], z: cz - p[0] * s + p[2] * c });
    const balls = spec.glow.map((g) => ({ ...toWorld(g.p), r: g.r }));
    const bar = spec.strip ? { ...toWorld(spec.strip.p), len: spec.strip.len, yaw } : undefined;
    const src = balls[0] ?? bar!;
    const wall = mountOf(it) === 'wall';
    // Light lands in front of a wall lamp, straight under anything else.
    const front = wall ? toWorld([0, 0, -0.05]) : src;
    let wash: Emitter['wash'];
    if (spec.wash) {
      // On the wall behind: a wall item's own wall, or the floor lamp's back (only drawn if it is near one).
      const back = toWorld([0, 0, -0.425]);
      const h = Math.min(spec.wash * 1.2, WALL_TALL);
      const y = Math.min(Math.max(src.y, h / 2), WALL_TALL - h / 2);
      if (wall || it.type === 'floor_lamp') wash = { x: back.x, y, z: back.z, w: spec.wash, h, yaw };
    }
    out.push({
      tone: lampTone(it.light), level: lampLevel(it.light) * spec.strength, strip: !!spec.strip,
      balls, bar, pool: { x: front.x, z: front.z, r: spec.pool * (0.75 + lampLevel(it.light) * 0.3) }, wash,
      real: { x: src.x, y: Math.min(src.y, 2.3), z: src.z, k: spec.real }, phase: idx * 0.13,
    });
  });
  // POP ceilings: a ring of downlights inside the border, each a soft pool on the floor.
  for (const r of interiorRooms(layout)) {
    const pop = finish?.ceiling?.[r.name];
    if (!pop || !CEILING_BY_ID[pop] || pop === 'plain') continue;
    const inset = 0.75;
    const xs = spots(r.x0 + inset, r.x1 - inset), zs = spots(r.z0 + inset, r.z1 - inset);
    const ring: [number, number][] = [];
    for (const x of xs) for (const z of zs) if (x === xs[0] || x === xs[xs.length - 1] || z === zs[0] || z === zs[zs.length - 1]) ring.push([x, z]);
    for (const [x, z] of ring)
      out.push({ tone: 'mood', level: 0.55, strip: false, balls: [], pool: { x, z, r: 1.7 }, real: { x, y: 2.4, z, k: 0.6 }, ceiling: true, phase: 0 });
  }
  return out;
}

/** Evenly spaced spots about 1.8 m apart between a and b (at least one). */
function spots(a: number, b: number) {
  if (b <= a) return [(a + b) / 2];
  const n = Math.max(1, Math.round((b - a) / 1.8));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

// ── Drawing ──────────────────────────────────────────────────────────────────────────────────────

/** A round fall-off of light, white so instance colours tint it. */
function glowTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}
const glowTex = typeof document !== 'undefined' ? glowTexture() : null;
const additive = () => new MeshBasicMaterial({
  map: glowTex, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});
const poolMat = additive();
const washMat = additive();
const bulbMat = new MeshBasicMaterial({ toneMapped: false });
const ballGeo = new IcosahedronGeometry(1, 2);
const barGeo = new BoxGeometry(1, 1, 1);
const flatGeo = new PlaneGeometry(1, 1);

const OFF = new Color('#efe7d2');
const tmp = new Color();
const moodCol = new Color();
const o = new Object3D();

function Instanced({ count, build, update, geometry, material }: {
  count: number; build: (m: InstancedMesh) => void; update: (m: InstancedMesh) => void;
  geometry: BoxGeometry | IcosahedronGeometry | PlaneGeometry; material: MeshBasicMaterial;
}) {
  const ref = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    build(m);
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [build]);
  useFrame(() => {
    const m = ref.current;
    if (!m || !m.instanceColor) return;
    update(m);
    m.instanceColor.needsUpdate = true;
  });
  if (!count) return null;
  return <instancedMesh key={count} ref={ref} args={[geometry, material, count]} raycast={() => null} frustumCulled={false} userData={{ dynamic: true }} />;
}

export function HouseLights({ items, layout, finish }: { items: PlacedItem[]; layout: HouseLayout; finish?: HouseFinish }) {
  const low = useLowPerf();
  const em = useMemo(() => emittersOf(items, layout, finish), [items, layout, finish]);
  const balls = useMemo(() => em.flatMap((e, i) => e.balls.map((b) => ({ ...b, i }))), [em]);
  const bars = useMemo(() => em.flatMap((e, i) => (e.bar ? [{ ...e.bar, i }] : [])), [em]);
  const washes = useMemo(() => (low ? [] : em.flatMap((e, i) => (e.wash ? [{ ...e.wash, i }] : []))), [em, low]);
  const lights = useRef<(PointLight | null)[]>([]);
  // Each emitter's colour and strength this frame, worked out once and read by every mesh.
  const live = useRef<{ col: Color[]; k: number[] }>({ col: [], k: [] });
  const mood = useRef<MoodDef>(moodOf(finish));
  mood.current = moodOf(finish);

  useFrame(({ clock }) => {
    const s = useGame.getState();
    const t = clock.elapsedTime;
    const night = nightNow(s);
    const power = lightSupply(s, t);
    const m = mood.current;
    const on = night * power;
    liveColour(m.colour, t, moodCol);
    const L = live.current;
    em.forEach((e, i) => {
      const col = (L.col[i] ??= new Color());
      if (e.ceiling) {
        col.copy(moodCol);
        L.k[i] = on * e.level * m.ceiling;
      } else {
        liveColour(m.id === 'party' ? 'rgb' : e.tone, t, col, e.phase);
        L.k[i] = on * e.level * (e.strip ? m.strips : m.lamps);
      }
    });
    // The POP cove line and the glass pick up the room's light.
    coveMat.color.copy(OFF).lerp(moodCol, Math.min(1, on * m.ceiling * 1.5)).multiplyScalar(0.55 + 0.45 * Math.min(1, on * (m.ceiling + m.strips) + (1 - night)));
    glassMat.emissive.copy(moodCol);
    glassMat.emissiveIntensity = on * Math.min(1, m.ceiling + 0.3) * 0.08;

    // Real lights: the two strongest lamps near you, else your room's ceiling bulb.
    if (!low) {
      const ranked = em
        .map((e, i) => ({ e, i, d: Math.hypot(e.real.x - avatar.x, e.real.z - avatar.z) }))
        .filter((r) => L.k[r.i] > 0.03 && r.d < 6)
        .sort((a, b) => a.d - b.d);
      const room = roomAt(layout, { x: Math.floor(avatar.x), z: Math.floor(avatar.z) });
      lights.current.forEach((l, j) => {
        if (!l) return;
        const r = ranked[j];
        if (r) {
          l.position.set(r.e.real.x, r.e.real.y, r.e.real.z);
          l.color.copy(L.col[r.i]);
          l.intensity = L.k[r.i] * r.e.real.k * 1.1;
        } else if (j === ranked.length && room && on * m.ceiling > 0.01) {
          l.position.set((room.x0 + room.x1) / 2, 2.3, (room.z0 + room.z1) / 2);
          l.color.copy(moodCol);
          l.intensity = on * m.ceiling * 1.4;
        } else l.intensity = 0;
      });
    }
  });

  const buildBalls = useMemo(() => (mesh: InstancedMesh) => {
    balls.forEach((b, j) => {
      o.position.set(b.x, b.y, b.z);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(b.r);
      o.updateMatrix();
      mesh.setMatrixAt(j, o.matrix);
      mesh.setColorAt(j, OFF);
    });
  }, [balls]);
  const buildBars = useMemo(() => (mesh: InstancedMesh) => {
    bars.forEach((b, j) => {
      o.position.set(b.x, b.y, b.z);
      o.rotation.set(0, b.yaw, 0);
      o.scale.set(b.len, 0.014, 0.034);
      o.updateMatrix();
      mesh.setMatrixAt(j, o.matrix);
      mesh.setColorAt(j, OFF);
    });
  }, [bars]);
  const buildPools = useMemo(() => (mesh: InstancedMesh) => {
    em.forEach((e, j) => {
      o.position.set(e.pool.x, 0.035, e.pool.z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(e.pool.r * 2, e.pool.r * 2, 1);
      o.updateMatrix();
      mesh.setMatrixAt(j, o.matrix);
      mesh.setColorAt(j, tmp.setRGB(0, 0, 0));
    });
  }, [em]);
  const buildWashes = useMemo(() => (mesh: InstancedMesh) => {
    washes.forEach((w, j) => {
      o.position.set(w.x, w.y, w.z);
      o.rotation.set(0, w.yaw, 0);
      o.scale.set(w.w, w.h, 1);
      o.updateMatrix();
      mesh.setMatrixAt(j, o.matrix);
      mesh.setColorAt(j, tmp.setRGB(0, 0, 0));
    });
  }, [washes]);

  const L = live.current;
  const bulb = (i: number, mesh: InstancedMesh, j: number) => {
    const k = L.k[i] ?? 0;
    mesh.setColorAt(j, tmp.copy(OFF).multiplyScalar(0.92).lerp(L.col[i] ?? OFF, Math.min(1, k * 1.6)));
  };

  return (
    <group>
      <Instanced count={balls.length} geometry={ballGeo} material={bulbMat} build={buildBalls} update={(mesh) => balls.forEach((b, j) => bulb(b.i, mesh, j))} />
      <Instanced count={bars.length} geometry={barGeo} material={bulbMat} build={buildBars} update={(mesh) => bars.forEach((b, j) => bulb(b.i, mesh, j))} />
      <Instanced count={em.length} geometry={flatGeo} material={poolMat} build={buildPools}
        update={(mesh) => em.forEach((e, j) => mesh.setColorAt(j, tmp.copy(L.col[j] ?? OFF).multiplyScalar((L.k[j] ?? 0) * (e.ceiling ? 0.1 : 0.22))))} />
      <Instanced count={washes.length} geometry={flatGeo} material={washMat} build={buildWashes}
        update={(mesh) => washes.forEach((w, j) => mesh.setColorAt(j, tmp.copy(L.col[w.i] ?? OFF).multiplyScalar((L.k[w.i] ?? 0) * 0.42)))} />
      {!low && [0, 1].map((j) => (
        <pointLight key={j} ref={(l) => { lights.current[j] = l; }} intensity={0} distance={5.5} decay={1.6} color="#ffd9a0" />
      ))}
    </group>
  );
}
