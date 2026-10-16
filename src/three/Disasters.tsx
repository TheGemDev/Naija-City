// What a natural disaster looks like on the town map (rules in game/disasters.ts, the list in net/disasters.ts): a river
// spilling over its banks and rising, a flash flood pooling in a low street, a building on fire with a smoke column you
// can see from across the city, a windstorm throwing roofing sheets about, and a bushfire creeping in from the edge of
// town. Each leaves a trace when it is over (mud, scorch marks, blue tarpaulins on the roofs) that fades as the
// aftermath runs out. Everything is drawn in code from a handful of shared materials, with instanced meshes and point
// clouds whose counts drop in low mode, and nothing at all is mounted while no disaster is near.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry, Float32BufferAttribute, IcosahedronGeometry,
  MeshBasicMaterial, MeshStandardMaterial, Object3D, PointsMaterial, RingGeometry, ShaderMaterial, SpriteMaterial, Vector2, Vector3,
  type InstancedMesh, type LineSegments, type Mesh, type PointLight, type Points, type Sprite,
} from 'three';
import { cityMap, type CityMap } from '../game/city';
import { aftermathOf, DISASTER_RULES, DISASTERS, intensityOf, phaseOf, seeded, type Disaster } from '../game/disasters';
import { regionOf } from '../game/regions';
import { useGame } from '../game/store';
import { useLowPerf } from '../game/quality';
import { disasterNow, startDisasters, useCityDisasters } from '../net/disasters';

/* ---------- Shared pieces ---------- */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

let puffTex: CanvasTexture | null = null;
/** A soft white blob: smoke, dust, glow and cloud shadow are all made of it. */
function puff() {
  if (puffTex) return puffTex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return (puffTex = new CanvasTexture(c));
}

let scorchTex: CanvasTexture | null = null;
/** A burnt patch: dark in the middle, blotchy at the edge. */
function scorch() {
  if (scorchTex) return scorchTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rand = seeded(42);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * size * 0.28;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const rr = size * (0.12 + rand() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, rr);
    grad.addColorStop(0, 'rgba(20,16,12,0.55)');
    grad.addColorStop(1, 'rgba(20,16,12,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return (scorchTex = new CanvasTexture(c));
}

// Materials shared by every disaster on the map (each disaster that needs its own opacity makes its own, below).
const flameOuter = new MeshBasicMaterial({ color: '#ff6a14', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
const flameInner = new MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
const zincMat = new MeshStandardMaterial({ color: '#ffffff', metalness: 0.55, roughness: 0.45 });
const tarpMat = new MeshStandardMaterial({ color: '#1d5fd8', roughness: 0.7 });
const canopyMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
const flameGeo = new ConeGeometry(0.32, 1, 7, 1, true).translate(0, 0.5, 0);
const sheetGeo = new BoxGeometry(0.55, 0.025, 0.36);
const discGeo = new CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const blobGeo = new IcosahedronGeometry(1, 1);
const ringGeo = new RingGeometry(0.95, 1, 72).rotateX(-Math.PI / 2);

const WATER_RIVER = '#7c6a48';
const WATER_LAKE = '#5d8a8c';
const MUD = '#5e4630';
const dummy = new Object3D();

/** The current moment of a disaster, worked out once a frame by whoever needs it. */
function stateOf(d: Disaster) {
  const now = disasterNow();
  const phase = phaseOf(d, now);
  const level = intensityOf(d, now);
  const after = aftermathOf(d, now);
  // The storm builds over the last stretch of the warning, before anything breaks.
  const warnT = clamp01((now - d.at) / Math.max(1, d.strikesAt - d.at));
  const pre = phase === 'warning' ? smooth(0.4, 1, warnT) * 0.45 : 0;
  const progress = clamp01((now - d.strikesAt) / Math.max(1, d.endsAt - d.strikesAt));
  return { now, phase, level, after, pre, progress };
}

/* ---------- Water ---------- */

/** A strip along the stretch of river near the disaster, whose width is rewritten each frame as the water rises. */
function useRiverStrip(d: Disaster, map: CityMap) {
  return useMemo(() => {
    const path = map.riverDraw;
    let best = 0;
    let bd = Infinity;
    path.forEach(([x, z], i) => {
      const dd = Math.hypot(x - d.x, z - d.z);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    const reach = d.r * 1.3;
    let i0 = best;
    let i1 = best;
    while (i0 > 0 && Math.hypot(path[i0 - 1][0] - d.x, path[i0 - 1][1] - d.z) < reach) i0--;
    while (i1 < path.length - 1 && Math.hypot(path[i1 + 1][0] - d.x, path[i1 + 1][1] - d.z) < reach) i1++;
    const pts = path.slice(i0, i1 + 1);
    const normals: [number, number][] = [];
    const taper: number[] = [];
    pts.forEach(([x, z], i) => {
      const [ax, az] = pts[Math.max(0, i - 1)];
      const [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      normals.push([-(bz - az) / len, (bx - ax) / len]);
      // Deepest where it broke the bank, thinning out up- and downstream.
      taper.push(1 - smooth(d.r * 0.45, d.r * 1.25, Math.hypot(x - d.x, z - d.z)));
    });
    const idx: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const make = () => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(new Float32Array(pts.length * 6), 3));
      g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(pts.length * 6).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
      g.setIndex(idx);
      return g;
    };
    /** Write the strip `half(i)` wide on each side at height y. */
    const write = (g: BufferGeometry, half: (i: number) => number, y: number) => {
      const pos = g.getAttribute('position') as Float32BufferAttribute;
      const arr = pos.array as Float32Array;
      pts.forEach(([x, z], i) => {
        const h = half(i);
        const [nx, nz] = normals[i];
        arr.set([x + nx * h, y, z + nz * h, x - nx * h, y, z - nz * h], i * 6);
      });
      pos.needsUpdate = true;
      g.computeBoundingSphere();
    };
    return { make, write, taper, ok: pts.length > 1 };
  }, [d, map]);
}

/** River Kaduna (or the lagoon, or the Challawa) over its banks: brown water spreading out and rising, then mud left behind. */
function RiverFlood({ d, map }: { d: Disaster; map: CityMap }) {
  const strip = useRiverStrip(d, map);
  const lagoon = map.id === 'lagos';
  const [water, foam, mud] = useMemo(() => [strip.make(), strip.make(), strip.make()], [strip]);
  const mats = useMemo(() => ({
    water: new MeshStandardMaterial({ color: lagoon ? '#4f7f86' : WATER_RIVER, roughness: 0.3, metalness: 0.15, transparent: true, opacity: 0.9 }),
    foam: new MeshBasicMaterial({ color: '#c9b48c', transparent: true, opacity: 0.3, depthWrite: false }),
    mud: new MeshBasicMaterial({ color: MUD, transparent: true, opacity: 0, depthWrite: false }),
  }), [lagoon]);
  useLayoutEffect(() => () => {
    water.dispose(); foam.dispose(); mud.dispose();
    Object.values(mats).forEach((m) => m.dispose());
  }, [water, foam, mud, mats]);
  const refs = { water: useRef<Mesh>(null!), foam: useRef<Mesh>(null!), mud: useRef<Mesh>(null!) };
  const spread = DISASTER_RULES.floodSpread;
  const half0 = map.riverHalf;
  // The mud covers everywhere the water got to: written once, it never moves.
  useLayoutEffect(() => strip.write(mud, (i) => half0 + spread * strip.taper[i] + 0.3, 0.024), [strip, mud, half0, spread]);
  useFrame(({ clock }) => {
    const { level, after, phase } = stateOf(d);
    const rise = Math.max(level, phase === 'warning' ? 0 : 0);
    const wet = rise > 0.01;
    refs.water.current.visible = wet;
    refs.foam.current.visible = wet;
    if (wet) {
      const lap = Math.sin(clock.elapsedTime * 1.4) * 0.12;
      strip.write(water, (i) => half0 + 0.1 + (spread * strip.taper[i] + lap * strip.taper[i]) * rise, 0.03 + 0.04 * rise);
      strip.write(foam, (i) => half0 + 0.35 + (spread * strip.taper[i] + lap * strip.taper[i]) * rise, 0.027 + 0.04 * rise);
    }
    const mudLevel = phase === 'active' ? 0.85 : phase === 'aftermath' ? 0.85 * after : 0;
    refs.mud.current.visible = mudLevel > 0.01;
    mats.mud.opacity = mudLevel;
  });
  if (!strip.ok) return null;
  return (
    <group>
      <mesh ref={refs.mud} geometry={mud} material={mats.mud} renderOrder={1} visible={false} />
      <mesh ref={refs.foam} geometry={foam} material={mats.foam} renderOrder={2} visible={false} />
      <mesh ref={refs.water} geometry={water} material={mats.water} receiveShadow renderOrder={3} visible={false} />
    </group>
  );
}

/** Jabi Lake (Abuja has no river) creeping out over its shore towards the side the alarm was raised on. */
function LakeFlood({ d, map }: { d: Disaster; map: CityMap }) {
  const lake = map.lakes.reduce((a, l) => (Math.hypot(l.x - d.x, l.z - d.z) < Math.hypot(a.x - d.x, a.z - d.z) ? l : a), map.lakes[0]);
  const mats = useMemo(() => ({
    water: new MeshStandardMaterial({ color: WATER_LAKE, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.88 }),
    mud: new MeshBasicMaterial({ color: MUD, transparent: true, opacity: 0, depthWrite: false }),
  }), []);
  useLayoutEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const water = useRef<Mesh>(null!);
  const mud = useRef<Mesh>(null!);
  const spread = DISASTER_RULES.floodSpread;
  // Lean the spill towards where it broke out.
  const lean = new Vector2(d.x - lake.x, d.z - lake.z).normalize();
  useFrame(({ clock }) => {
    const { level, after, phase } = stateOf(d);
    water.current.visible = level > 0.01;
    const s = spread * level * (1 + Math.sin(clock.elapsedTime * 1.3) * 0.03);
    water.current.scale.set(lake.rx + s, 1, lake.rz + s * 0.8);
    water.current.position.set(lake.x + lean.x * s * 0.45, 0.03 + 0.03 * level, lake.z + lean.y * s * 0.45);
    const m = phase === 'active' ? 0.8 : phase === 'aftermath' ? 0.8 * after : 0;
    mud.current.visible = m > 0.01;
    mats.mud.opacity = m;
  });
  if (!lake) return null;
  return (
    <group>
      <mesh ref={mud} geometry={discGeo} material={mats.mud} position={[lake.x + lean.x * spread * 0.45, 0.024, lake.z + lean.y * spread * 0.45]} scale={[lake.rx + spread + 0.4, 1, lake.rz + spread * 0.8 + 0.4]} visible={false} />
      <mesh ref={water} geometry={discGeo} material={mats.water} visible={false} />
    </group>
  );
}

/** A flash flood: muddy pools joining up across a low stretch of road, then a skin of mud when they drain. */
function Puddles({ d }: { d: Disaster }) {
  const low = useLowPerf();
  const pools = useMemo(() => {
    const rand = seeded(d.id * 977 + 5);
    return Array.from({ length: low ? 5 : 8 }, (_, i) => {
      const a = rand() * Math.PI * 2;
      const r = i === 0 ? 0 : Math.sqrt(rand()) * d.r * 0.7;
      return { x: d.x + Math.cos(a) * r, z: d.z + Math.sin(a) * r, s: 1.3 + rand() * 1.4, k: 0.7 + rand() * 0.6 };
    });
  }, [d, low]);
  const mats = useMemo(() => ({
    water: new MeshStandardMaterial({ color: '#86704c', roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.85 }),
    mud: new MeshBasicMaterial({ color: MUD, transparent: true, opacity: 0, depthWrite: false }),
  }), []);
  useLayoutEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const water = useRef<InstancedMesh>(null!);
  const mud = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    pools.forEach((p, i) => {
      dummy.position.set(p.x, 0.022, p.z);
      dummy.scale.set(p.s * 1.15, 1, p.s * p.k * 1.15);
      dummy.rotation.set(0, i, 0);
      dummy.updateMatrix();
      mud.current.setMatrixAt(i, dummy.matrix);
    });
    mud.current.instanceMatrix.needsUpdate = true;
  }, [pools]);
  useFrame(({ clock }) => {
    const { level, after, phase } = stateOf(d);
    water.current.visible = level > 0.01;
    if (level > 0.01) {
      pools.forEach((p, i) => {
        const grow = clamp01(level * 1.3 - i * 0.04);
        dummy.position.set(p.x, 0.03 + 0.03 * level, p.z);
        dummy.scale.setScalar(Math.max(0.001, p.s * grow * (1 + Math.sin(clock.elapsedTime * 1.7 + i) * 0.03)));
        dummy.scale.z *= p.k;
        dummy.rotation.set(0, i, 0);
        dummy.updateMatrix();
        water.current.setMatrixAt(i, dummy.matrix);
      });
      water.current.instanceMatrix.needsUpdate = true;
    }
    const m = phase === 'active' ? 0.75 : phase === 'aftermath' ? 0.75 * after : 0;
    mud.current.visible = m > 0.01;
    mats.mud.opacity = m;
  });
  return (
    <group>
      <instancedMesh ref={mud} args={[discGeo, mats.mud, pools.length]} frustumCulled={false} renderOrder={1} visible={false} />
      <instancedMesh ref={water} args={[discGeo, mats.water, pools.length]} frustumCulled={false} renderOrder={3} visible={false} />
    </group>
  );
}

/* ---------- Weather over it ---------- */

const RAIN_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uWind;
  uniform vec3 uCenter;
  uniform float uRadius;
  attribute vec4 seed;
  attribute float tip;
  varying float vFade;
  void main() {
    float speed = 20.0 * (0.8 + 0.4 * seed.w);
    float f = fract(seed.y - uTime * speed / uHeight);
    float y = f * uHeight;
    float a = seed.x * 6.2832;
    float r = sqrt(seed.z) * uRadius;
    vec3 p = uCenter + vec3(cos(a) * r + uWind * y, y, sin(a) * r);
    p += normalize(vec3(uWind, 1.0, 0.0)) * 0.9 * tip;
    vFade = (1.0 - tip * 0.85) * smoothstep(0.0, 0.05, f) * smoothstep(1.0, 0.7, f) * (1.0 - smoothstep(0.75, 1.0, sqrt(seed.z)));
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const RAIN_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vFade;
  void main() { gl_FragColor = vec4(0.88, 0.92, 0.97, uOpacity * vFade); }
`;

/** A downpour over just this area: the storm cell that brought the flood (or the squall), whatever the sky elsewhere is doing. */
function LocalRain({ d, wind = 0.15, strength = 1 }: { d: Disaster; wind?: number; strength?: number }) {
  const low = useLowPerf();
  const count = low ? 180 : 450;
  const geo = useMemo(() => {
    const seed: number[] = [];
    const tip: number[] = [];
    const rand = seeded(d.id * 31 + 1);
    for (let i = 0; i < count; i++) {
      const s = [rand(), rand(), rand(), rand()];
      seed.push(...s, ...s);
      tip.push(0, 1);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 6), 3));
    g.setAttribute('seed', new Float32BufferAttribute(seed, 4));
    g.setAttribute('tip', new Float32BufferAttribute(tip, 1));
    return g;
  }, [count, d.id]);
  const mat = useMemo(() => new ShaderMaterial({
    vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uHeight: { value: 13 }, uWind: { value: wind }, uCenter: { value: new Vector3(d.x, 0, d.z) }, uRadius: { value: d.r * 1.15 }, uOpacity: { value: 0 } },
  }), [d, wind]);
  useLayoutEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const ref = useRef<LineSegments>(null!);
  useFrame(({ clock }) => {
    const { level, pre } = stateOf(d);
    const on = Math.max(level, pre) * strength;
    ref.current.visible = on > 0.02;
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uOpacity.value = Math.min(1, on) * 0.75;
  });
  return <lineSegments ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} visible={false} />;
}

/** The storm cloud's shadow: the area goes dark while it is overhead. */
function CloudShadow({ d }: { d: Disaster }) {
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#0b1220', map: puff(), transparent: true, opacity: 0, depthWrite: false }), []);
  useLayoutEffect(() => () => mat.dispose(), [mat]);
  const ref = useRef<Mesh>(null!);
  useFrame(() => {
    const { level, pre } = stateOf(d);
    mat.opacity = Math.max(level, pre) * 0.32;
    ref.current.visible = mat.opacity > 0.01;
  });
  return <mesh ref={ref} geometry={discGeo} material={mat} position={[d.x, 0.07, d.z]} scale={[d.r * 1.6, 1, d.r * 1.6]} renderOrder={4} visible={false} />;
}

/* ---------- Fire ---------- */

interface FlameSource { x: number; y: number; z: number; s: number; ign: number }

/** Where the flames are: across the burning building and the houses next to it, or scattered through the bush, each lighting in turn. */
function flameSources(d: Disaster, map: CityMap, low: boolean, bush: boolean): FlameSource[] {
  const rand = seeded(d.id * 13 + 7);
  const out: FlameSource[] = [];
  if (!bush && d.place && map.placeById[d.place]) {
    const p = map.placeById[d.place];
    const n = low ? 7 : 12;
    for (let i = 0; i < n; i++) {
      const x = p.x + 0.3 + rand() * (p.w - 0.6);
      const z = p.z + 0.3 + rand() * (p.d - 0.6);
      const roof = rand() < 0.55;
      out.push({ x, z, y: roof ? 1.1 + rand() * 0.9 : 0.05, s: 0.9 + rand() * 0.9, ign: (Math.hypot(x - d.x, z - d.z) / Math.max(p.w, p.d)) * 0.25 });
    }
    // The fire jumps to the houses round it.
    const near = map.houses.filter((h) => Math.hypot(h.x + h.w / 2 - d.x, h.z + h.d / 2 - d.z) < d.r).slice(0, low ? 3 : 6);
    for (const h of near) {
      const dist = Math.hypot(h.x + h.w / 2 - d.x, h.z + h.d / 2 - d.z);
      out.push({ x: h.x + h.w / 2 + (rand() - 0.5) * h.w * 0.4, z: h.z + h.d / 2 + (rand() - 0.5) * h.d * 0.4, y: h.storeys === 2 ? 2.3 : 1.3, s: 0.7 + rand() * 0.5, ign: 0.25 + (dist / d.r) * 0.4 });
    }
    return out;
  }
  // Bush: the front starts at the far side of the area and burns in towards town.
  const inward = new Vector2(map.w / 2 - d.x, map.h / 2 - d.z).normalize();
  const n = low ? 12 : 22;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * d.r;
    const x = d.x + Math.cos(a) * r;
    const z = d.z + Math.sin(a) * r;
    const along = ((x - d.x) * inward.x + (z - d.z) * inward.y) / d.r;
    if (!map.isLand(Math.floor(x), Math.floor(z))) continue;
    out.push({ x, z, y: 0.02, s: 0.45 + rand() * 0.45, ign: clamp01((along + 1) / 2) * 0.65 + rand() * 0.08 });
  }
  return out;
}

/** Flames, a smoke column, the glow on everything round it, and the scorched ground it leaves. */
function Fire({ d, map, bush = false }: { d: Disaster; map: CityMap; bush?: boolean }) {
  const low = useLowPerf();
  const sources = useMemo(() => flameSources(d, map, low, bush), [d, map, low, bush]);
  const outer = useRef<InstancedMesh>(null!);
  const inner = useRef<InstancedMesh>(null!);
  const smoke = useRef<Points>(null!);
  const glow = useRef<Sprite>(null!);
  const light = useRef<PointLight>(null);
  const char = useRef<Mesh>(null!);
  const burnFor = bush ? 0.45 : 1.4;
  const smokeCount = low ? 26 : 56;
  const smokeData = useMemo(() => {
    const rand = seeded(d.id * 71 + 3);
    return Array.from({ length: smokeCount }, () => ({ off: rand(), sp: 0.7 + rand() * 0.6, jx: rand() - 0.5, jz: rand() - 0.5, src: Math.floor(rand() * 1e6) }));
  }, [d.id, smokeCount]);
  const smokeGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(smokeCount * 3), 3));
    return g;
  }, [smokeCount]);
  const mats = useMemo(() => ({
    smoke: new PointsMaterial({ color: bush ? '#8c8174' : '#3d3a37', map: puff(), size: bush ? 2.6 : 3.4, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }),
    glow: new SpriteMaterial({ color: '#ff7a2a', map: puff(), blending: AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }),
    char: new MeshBasicMaterial({ color: '#ffffff', map: scorch(), transparent: true, opacity: 0, depthWrite: false }),
  }), [bush]);
  useLayoutEffect(() => () => { smokeGeo.dispose(); Object.values(mats).forEach((m) => m.dispose()); }, [smokeGeo, mats]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { level, after, phase, pre, progress } = stateOf(d);
    // Flames: each source lights at its turn, burns, and (in the bush) dies down as the front moves on.
    let lit = 0;
    sources.forEach((s, i) => {
      const on = level > 0.01 ? smooth(s.ign, s.ign + 0.08, progress) * (1 - smooth(s.ign + burnFor - 0.1, s.ign + burnFor, progress)) * Math.min(1, level * 1.4) : 0;
      if (on > 0.05) lit++;
      const flick = 0.75 + 0.3 * Math.sin(t * 9 + i * 1.7) + 0.12 * Math.sin(t * 23 + i * 3.1);
      const k = Math.max(0.0001, s.s * on);
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, t * 0.5 + i, Math.sin(t * 3 + i) * 0.12);
      dummy.scale.set(k * (0.85 + 0.15 * Math.sin(t * 7 + i)), k * flick * 1.5, k * (0.85 + 0.15 * Math.cos(t * 6 + i)));
      dummy.updateMatrix();
      outer.current.setMatrixAt(i, dummy.matrix);
      dummy.scale.multiplyScalar(0.55);
      dummy.updateMatrix();
      inner.current.setMatrixAt(i, dummy.matrix);
    });
    outer.current.instanceMatrix.needsUpdate = true;
    inner.current.instanceMatrix.needsUpdate = true;
    outer.current.visible = inner.current.visible = lit > 0;
    const burning = sources.length ? lit / sources.length : 0;

    // Smoke: thin while it is only smouldering in the warning, a thick column at the height of it, wisps in the aftermath.
    const smokeLevel = phase === 'active' ? Math.max(0.35, burning) * Math.min(1, level * 1.3) : phase === 'warning' ? pre * 1.2 : phase === 'aftermath' ? smooth(0.55, 1, after) * 0.6 : 0;
    smoke.current.visible = smokeLevel > 0.01;
    if (smokeLevel > 0.01 && sources.length) {
      const pos = smokeGeo.getAttribute('position') as Float32BufferAttribute;
      const arr = pos.array as Float32Array;
      const height = bush ? 8 : 15;
      smokeData.forEach((p, j) => {
        const s = sources[p.src % sources.length];
        const life = (t * 0.07 * p.sp + p.off) % 1;
        arr[j * 3] = s.x + p.jx * (0.6 + life * 3) + life * life * 5;
        arr[j * 3 + 1] = s.y + 0.6 + life * height;
        arr[j * 3 + 2] = s.z + p.jz * (0.6 + life * 3) - life * 1.5;
      });
      pos.needsUpdate = true;
      smokeGeo.computeBoundingSphere();
      mats.smoke.opacity = 0.55 * smokeLevel;
    }

    // Glow: an orange haze over the fire that reads from across the map, and real light on the buildings round it.
    const flare = (0.85 + 0.15 * Math.sin(t * 11) + 0.08 * Math.sin(t * 27)) * Math.max(burning, level > 0.01 ? 0.25 : 0) * Math.min(1, level * 1.5);
    mats.glow.opacity = Math.min(0.85, flare);
    glow.current.visible = flare > 0.01;
    glow.current.scale.setScalar((bush ? d.r * 1.6 : d.r * 1.3) * (0.9 + 0.1 * Math.sin(t * 5)));
    if (light.current) light.current.intensity = flare * (bush ? 4 : 7);

    // The scorched ground spreads as it burns and stays for the aftermath.
    const charLevel = phase === 'active' ? smooth(0, 0.5, progress) * 0.9 : phase === 'aftermath' ? 0.9 * (0.3 + 0.7 * after) : 0;
    mats.char.opacity = charLevel;
    char.current.visible = charLevel > 0.01;
  });

  return (
    <group>
      <mesh ref={char} geometry={discGeo} material={mats.char} position={[d.x, 0.029, d.z]} scale={[d.r * (bush ? 1.15 : 0.95), 1, d.r * (bush ? 1.15 : 0.95)]} renderOrder={1} visible={false} />
      <instancedMesh ref={outer} args={[flameGeo, flameOuter, sources.length]} frustumCulled={false} renderOrder={6} visible={false} />
      <instancedMesh ref={inner} args={[flameGeo, flameInner, sources.length]} frustumCulled={false} renderOrder={7} visible={false} />
      <points ref={smoke} geometry={smokeGeo} material={mats.smoke} frustumCulled={false} renderOrder={8} visible={false} />
      <sprite ref={glow} material={mats.glow} position={[d.x, bush ? 1 : 1.8, d.z]} renderOrder={9} visible={false} />
      {!low && <pointLight ref={light} position={[d.x, 2.2, d.z]} color="#ff8a3d" distance={d.r * 3.5} decay={1.6} intensity={0} />}
    </group>
  );
}

/* ---------- Wind ---------- */

/** Roofing sheets torn off and spinning round the squall, dust whipped up off the ground, and the trees bending. */
function Windstorm({ d, map }: { d: Disaster; map: CityMap }) {
  const low = useLowPerf();
  const accent = regionOf(map.id).accent;
  const sheets = useMemo(() => {
    const rand = seeded(d.id * 17 + 9);
    return Array.from({ length: low ? 12 : 26 }, () => ({ a: rand() * Math.PI * 2, rr: 0.2 + rand() * 0.8, h: rand(), sp: 0.6 + rand() * 0.9, rust: rand() < 0.4 }));
  }, [d.id, low]);
  const dustCount = low ? 30 : 72;
  const dust = useMemo(() => {
    const rand = seeded(d.id * 23 + 4);
    return Array.from({ length: dustCount }, () => ({ a: rand() * Math.PI * 2, rr: Math.sqrt(rand()), h: rand(), sp: 0.5 + rand() }));
  }, [d.id, dustCount]);
  const trees = useMemo(() => map.trees
    .map((t, i) => ({ ...t, i }))
    .filter((t) => Math.hypot(t.x + 0.5 - d.x, t.z + 0.5 - d.z) < d.r)
    .slice(0, low ? 16 : 40), [map, d, low]);
  const roofs = useMemo(() => {
    const rand = seeded(d.id * 5 + 2);
    return map.houses.filter((h) => Math.hypot(h.x + h.w / 2 - d.x, h.z + h.d / 2 - d.z) < d.r).slice(0, low ? 10 : 22)
      .map((h) => ({ h, yaw: rand() * Math.PI, ox: (rand() - 0.5) * h.w * 0.3, oz: (rand() - 0.5) * h.d * 0.3 }));
  }, [map, d, low]);
  const litter = useMemo(() => {
    const rand = seeded(d.id * 41 + 8);
    return Array.from({ length: low ? 10 : 22 }, () => {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * d.r;
      return { x: d.x + Math.cos(a) * r, z: d.z + Math.sin(a) * r, yaw: rand() * Math.PI, tilt: (rand() - 0.5) * 0.3, rust: rand() < 0.4 };
    }).filter((p) => map.walkable(Math.floor(p.x), Math.floor(p.z)));
  }, [map, d, low]);
  const dustGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(dustCount * 3), 3));
    return g;
  }, [dustCount]);
  const dustMat = useMemo(() => new PointsMaterial({ color: '#b39a74', map: puff(), size: 1.8, transparent: true, opacity: 0, depthWrite: false }), []);
  useLayoutEffect(() => () => { dustGeo.dispose(); dustMat.dispose(); }, [dustGeo, dustMat]);
  const flying = useRef<InstancedMesh>(null!);
  const canopies = useRef<InstancedMesh>(null!);
  const tarps = useRef<InstancedMesh>(null!);
  const ground = useRef<InstancedMesh>(null!);
  const dustRef = useRef<Points>(null!);

  // Colours and the still pieces (tarpaulins on the damaged roofs, sheets lying in the street) are set once.
  useLayoutEffect(() => {
    const zinc = new Color('#a9b2ba');
    const rust = new Color('#8f5531');
    sheets.forEach((s, i) => flying.current.setColorAt(i, s.rust ? rust : zinc));
    if (flying.current.instanceColor) flying.current.instanceColor.needsUpdate = true;
    trees.forEach((t, i) => canopies.current.setColorAt(i, new Color(t.i % 3 ? accent : '#b88b49')));
    if (canopies.current.instanceColor) canopies.current.instanceColor.needsUpdate = true;
    roofs.forEach(({ h, yaw, ox, oz }, i) => {
      dummy.position.set(h.x + h.w / 2 + ox, (h.storeys === 2 ? 2.2 : 1.2) + 0.55, h.z + h.d / 2 + oz);
      dummy.rotation.set(0.12, yaw, -0.08);
      dummy.scale.set(h.w * 0.85, 1.4, h.d * 0.75);
      dummy.updateMatrix();
      tarps.current.setMatrixAt(i, dummy.matrix);
    });
    tarps.current.instanceMatrix.needsUpdate = true;
    litter.forEach((p, i) => {
      dummy.position.set(p.x, 0.03, p.z);
      dummy.rotation.set(p.tilt, p.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ground.current.setMatrixAt(i, dummy.matrix);
      ground.current.setColorAt(i, p.rust ? rust : zinc);
    });
    ground.current.instanceMatrix.needsUpdate = true;
    if (ground.current.instanceColor) ground.current.instanceColor.needsUpdate = true;
  }, [sheets, trees, roofs, litter, accent]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { level, after, phase, progress } = stateOf(d);
    const on = level > 0.02;
    // The squall wanders about inside the area.
    const cx = d.x + Math.sin(t * 0.13) * d.r * 0.3;
    const cz = d.z + Math.cos(t * 0.11) * d.r * 0.3;
    flying.current.visible = on;
    if (on) {
      sheets.forEach((s, i) => {
        const a = s.a + t * (1.1 + s.sp);
        const r = s.rr * d.r * 0.75;
        dummy.position.set(cx + Math.cos(a) * r, 0.4 + s.h * 3.5 * level * (0.55 + 0.45 * Math.sin(t * 2.1 * s.sp + s.a)), cz + Math.sin(a) * r);
        dummy.rotation.set(t * 5 * s.sp, t * 3 + i, t * 4 * s.sp);
        dummy.scale.setScalar(Math.min(1, level * 1.5));
        dummy.updateMatrix();
        flying.current.setMatrixAt(i, dummy.matrix);
      });
      flying.current.instanceMatrix.needsUpdate = true;
    }
    dustRef.current.visible = on;
    if (on) {
      const arr = (dustGeo.getAttribute('position') as Float32BufferAttribute).array as Float32Array;
      dust.forEach((p, j) => {
        const a = p.a + t * 1.6 * p.sp;
        const r = p.rr * d.r;
        arr[j * 3] = cx + Math.cos(a) * r;
        arr[j * 3 + 1] = 0.3 + p.h * 2.2;
        arr[j * 3 + 2] = cz + Math.sin(a) * r;
      });
      dustGeo.getAttribute('position').needsUpdate = true;
      dustGeo.computeBoundingSphere();
      dustMat.opacity = 0.5 * level;
    }
    // The trees bend with the gusts: a crown drawn over each, leaning away from the wind.
    canopies.current.visible = on && trees.length > 0;
    if (on) {
      trees.forEach((tr, i) => {
        const gust = level * (0.55 + 0.45 * Math.sin(t * 2.6 + tr.i * 0.7)) * (0.8 + 0.2 * Math.sin(t * 7.3 + tr.i));
        dummy.position.set(tr.x + 0.5 + gust * 0.42 * tr.s, 2.45 * tr.s - gust * 0.1 * tr.s, tr.z + 0.5 + gust * 0.12 * tr.s);
        dummy.rotation.set(0, 0, -gust * 0.5);
        dummy.scale.set(1.02 * tr.s * (1 + gust * 0.12), 0.98 * tr.s * (1 - gust * 0.1), 1.02 * tr.s);
        dummy.updateMatrix();
        canopies.current.setMatrixAt(i, dummy.matrix);
      });
      canopies.current.instanceMatrix.needsUpdate = true;
    }
    // Roofs that went: blue tarpaulins from the second half of the storm through the aftermath; sheets in the street.
    const torn = phase === 'aftermath' || (phase === 'active' && progress > 0.5);
    tarps.current.visible = torn && roofs.length > 0;
    ground.current.visible = (phase === 'active' && progress > 0.3) || (phase === 'aftermath' && after > 0.05);
  });

  return (
    <group>
      <instancedMesh ref={flying} args={[sheetGeo, zincMat, sheets.length]} frustumCulled={false} castShadow visible={false} />
      <instancedMesh ref={ground} args={[sheetGeo, zincMat, Math.max(1, litter.length)]} count={litter.length} frustumCulled={false} visible={false} />
      <instancedMesh ref={canopies} args={[blobGeo, canopyMat, Math.max(1, trees.length)]} count={trees.length} frustumCulled={false} visible={false} />
      <instancedMesh ref={tarps} args={[sheetGeo, tarpMat, Math.max(1, roofs.length)]} count={roofs.length} frustumCulled={false} visible={false} />
      <points ref={dustRef} geometry={dustGeo} material={dustMat} frustumCulled={false} renderOrder={8} visible={false} />
    </group>
  );
}

/* ---------- Marker ---------- */

const RING = { warning: '#f59e0b', active: '#ef4444', aftermath: '#94a3b8', over: '#94a3b8' } as const;

/** A ring round the danger area and a floating tag over it, readable at any zoom: what it is, and how long until it hits or ends. */
function Marker({ d }: { d: Disaster }) {
  const def = DISASTERS[d.kind];
  const mat = useMemo(() => new MeshBasicMaterial({ color: RING.warning, transparent: true, opacity: 0.7, depthWrite: false }), []);
  useLayoutEffect(() => () => mat.dispose(), [mat]);
  const ring = useRef<Mesh>(null!);
  const tag = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLElement>(null);
  const time = useRef<HTMLElement>(null);
  const last = useRef('');
  useFrame(({ clock }) => {
    const { now, phase } = stateOf(d);
    ring.current.visible = phase === 'warning' || phase === 'active';
    mat.color.set(RING[phase]);
    mat.opacity = (phase === 'warning' ? 0.45 : 0.6) + 0.3 * Math.sin(clock.elapsedTime * (phase === 'warning' ? 3 : 5));
    // The tag's words only change once a second.
    const left = phase === 'warning' ? d.strikesAt - now : phase === 'active' ? d.endsAt - now : 0;
    const s = Math.max(0, Math.ceil(left / 1000));
    const text = phase === 'warning' ? `${def.agency} warning · ${def.title}` : phase === 'active' ? def.title : `After the ${def.title.toLowerCase()}`;
    const clock2 = phase === 'warning' ? `hits in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : phase === 'active' ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left` : d.area;
    const key = `${phase}|${text}|${clock2}`;
    if (key === last.current) return;
    last.current = key;
    if (tag.current) tag.current.className = `disaster-pin ${phase}`;
    if (label.current) label.current.textContent = text;
    if (time.current) time.current.textContent = clock2;
  });
  return (
    <group>
      <mesh ref={ring} geometry={ringGeo} material={mat} position={[d.x, 0.08, d.z]} scale={[d.r, 1, d.r]} renderOrder={4} />
      <Html position={[d.x, 4.2, d.z]} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={tag} className="disaster-pin warning">
          <span className="disaster-pin-icon">{def.icon}</span>
          <span className="disaster-pin-text">
            <b ref={label}>{def.title}</b>
            <small ref={time}>{d.area}</small>
          </span>
        </div>
      </Html>
    </group>
  );
}

/* ---------- The layer ---------- */

function DisasterView({ d, map }: { d: Disaster; map: CityMap }) {
  switch (d.kind) {
    case 'flood':
      return (
        <group>
          {map.riverDraw.length > 1 ? <RiverFlood d={d} map={map} /> : map.lakes.length ? <LakeFlood d={d} map={map} /> : <Puddles d={d} />}
          <CloudShadow d={d} />
          <LocalRain d={d} />
          <Marker d={d} />
        </group>
      );
    case 'flashflood':
      return (
        <group>
          <Puddles d={d} />
          <CloudShadow d={d} />
          <LocalRain d={d} strength={1.2} />
          <Marker d={d} />
        </group>
      );
    case 'fire':
      return (
        <group>
          <Fire d={d} map={map} />
          <Marker d={d} />
        </group>
      );
    case 'windstorm':
      return (
        <group>
          <Windstorm d={d} map={map} />
          <CloudShadow d={d} />
          <LocalRain d={d} wind={0.9} strength={0.7} />
          <Marker d={d} />
        </group>
      );
    case 'bushfire':
      return (
        <group>
          <Fire d={d} map={map} bush />
          <Marker d={d} />
        </group>
      );
  }
}

/** Every disaster that can be seen in the city on screen. Mounted beside the town map (three/Scene.tsx). */
export function Disasters() {
  const city = useGame((s) => s.destinationId);
  const map = cityMap(city);
  useEffect(() => startDisasters(), []);
  const list = useCityDisasters(city);
  // Phases pass on their own; look again now and then so one that is over is taken down.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(id);
  }, []);
  if (!list.length) return null;
  return (
    <group>
      {list.map((d) => (
        <DisasterView key={d.id} d={d} map={map} />
      ))}
    </group>
  );
}
