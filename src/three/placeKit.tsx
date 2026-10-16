// The kit every place model on the city map is built with (the stadium first: Stadium.tsx). Parts are merged into
// one geometry per colour, so a whole building is a handful of plain meshes that the map's StaticBatch folds into the
// town's own buckets: next to no new draw calls. Two colour keys are special: 'lamp…' parts share lampMat and
// 'glass…' parts share windowMat, so they light up at night with the street lamps and windows. Night-only light
// (floodlight pools, lit signs) goes in a Glow, drawn additively and only after dark.
//
// Rules of thumb (learned on the stadium): give plain parts their own colour key rather than sharing a material
// (a material shared between meshes gets its own StaticBatch bucket instead of joining the houses'); read the
// low-performance switch once when the city loads (KitModel does); keep the glow to one mesh.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Euler, Float32BufferAttribute, Matrix4,
  MeshBasicMaterial, Quaternion, Vector3, type EulerOrder, type Mesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useLowPerf } from '../game/quality';
import { lampMat, windowMat } from './cityModels';
import { seedAt } from './StaticBatch';

export type V3 = [number, number, number];
export type RGB = [number, number, number];

/* ---------- A kit of merged parts: one geometry per colour ---------- */

export function prep(g: BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  return n;
}
export const UNIT_BOX = prep(new BoxGeometry(1, 1, 1));
const cyls = new Map<string, BufferGeometry>();
/** A post of radius 1 and height 1, `seg` sided, its top `taper` times as wide as its foot. */
export function unitCyl(seg: number, taper: number) {
  const key = `${seg}|${taper}`;
  let g = cyls.get(key);
  if (!g) cyls.set(key, (g = prep(new CylinderGeometry(taper, 1, 1, seg))));
  return g;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/** A frame to place parts in: a position and a turn. */
export const frame = (p: V3, r: V3, order: EulerOrder = 'XYZ') => new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2], order)), new Vector3(1, 1, 1));

export class Kit {
  private parts = new Map<string, BufferGeometry[]>();
  private raw = new Map<string, number[]>();
  private rawSeed = new Map<string, number[]>();

  private put(key: string, g: BufferGeometry) {
    // Glass gets a seed per pane, from where the pane is, so windowMat lights some rooms and not others at night
    // (cityModels.tsx): one seed for the whole merged mesh would light every window of a building at once.
    if (key.startsWith('glass') && !g.getAttribute('seed')) {
      g.computeBoundingBox();
      g.boundingBox!.getCenter(_a);
      g.setAttribute('seed', new Float32BufferAttribute(new Array(g.attributes.position.count).fill(seedAt(_a.x, _a.y, _a.z)), 1));
    }
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
  }

  /** A shape of unit size, scaled to `s`, turned by `r` and moved to `p`, inside `f` if given. */
  shape(key: string, g: BufferGeometry, p: V3, s: V3, r: V3 = [0, 0, 0], f?: Matrix4, order: EulerOrder = 'XYZ') {
    _m.compose(_p.set(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2], order)), _s.set(...s));
    if (f) _m.premultiply(f);
    const k = g.clone();
    k.applyMatrix4(_m);
    this.put(key, k);
  }

  box(key: string, p: V3, s: V3, r?: V3, f?: Matrix4, order?: EulerOrder) {
    this.shape(key, UNIT_BOX, p, s, r, f, order);
  }

  /** A post standing on `p` (its foot), `seg` sided. */
  post(key: string, p: V3, r: number, h: number, seg = 6, taper = 1, f?: Matrix4) {
    this.shape(key, unitCyl(seg, taper), [p[0], p[1] + h / 2, p[2]], [r, h, r], [0, 0, 0], f);
  }

  /** A bar from one point to another, `t` thick. */
  bar(key: string, a: V3, b: V3, t: number) {
    _a.set(...a);
    _b.set(...b);
    const len = _a.distanceTo(_b);
    _p.addVectors(_a, _b).multiplyScalar(0.5);
    _q.setFromUnitVectors(new Vector3(0, 1, 0), _b.sub(_a).normalize());
    _m.compose(_p, _q, _s.set(t, len, t));
    const k = UNIT_BOX.clone();
    k.applyMatrix4(_m);
    this.put(key, k);
  }

  /** One triangle, wound so it faces along `out`. */
  tri(key: string, a: V3, b: V3, c: V3, out: V3, seed?: number) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    let list = this.raw.get(key);
    if (!list) this.raw.set(key, (list = []));
    list.push(...a, ...(flip ? c : b), ...(flip ? b : c));
    if (key.startsWith('glass')) {
      let seeds = this.rawSeed.get(key);
      if (!seeds) this.rawSeed.set(key, (seeds = []));
      const s = seed ?? seedAt((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3);
      seeds.push(s, s, s);
    }
  }

  quad(key: string, a: V3, b: V3, c: V3, d: V3, out: V3) {
    // Both halves of a pane share one seed, so a window is lit or dark as a whole.
    const s = key.startsWith('glass') ? seedAt((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2) : undefined;
    this.tri(key, a, b, c, out, s);
    this.tri(key, a, c, d, out, s);
  }

  /** A flat rectangle on the ground, x0..x1 by z0..z1, at height y. */
  flat(key: string, x0: number, z0: number, x1: number, z1: number, y: number) {
    this.quad(key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]);
  }

  build() {
    for (const [key, pos] of this.raw) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const seeds = this.rawSeed.get(key);
      if (seeds) g.setAttribute('seed', new Float32BufferAttribute(seeds, 1));
      g.computeVertexNormals();
      this.put(key, g);
    }
    return [...this.parts].map(([key, list]) => {
      const g = mergeGeometries(list)!;
      list.forEach((p) => p.dispose());
      return { key, g };
    });
  }
}

/** Additive glow, made of coloured triangles: black adds nothing, so the colour is the brightness. */
export class Glow {
  pos: number[] = [];
  col: number[] = [];
  tri(a: V3, b: V3, c: V3, ca: RGB, cb: RGB = ca, cc: RGB = cb) {
    this.pos.push(...a, ...b, ...c);
    this.col.push(...ca, ...cb, ...cc);
  }
  quad(a: V3, b: V3, c: V3, d: V3, ca: RGB, cb: RGB = ca, cc: RGB = cb, cd: RGB = cc) {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }
  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    return g;
  }
}

export const glowMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false, opacity: 0 });

/** The same random numbers for the same building every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/* ---------- Drawing a built kit ---------- */

export interface Built { parts: { key: string; g: BufferGeometry }[]; glow?: BufferGeometry }

/**
 * Builds a place once (`build(low)`, low performance mode read once when the city loads: StaticBatch merges the
 * meshes then and would not see a later swap) and draws it: one mesh per colour key, lamps and glass on the shared
 * night materials, and the glow if there is one.
 */
export function KitModel({ build, deps }: { build: (low: boolean) => Built; deps: unknown[] }) {
  const lowNow = useLowPerf();
  const [low] = useState(lowNow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => build(low), [low, ...deps]);
  useEffect(() => () => {
    built.parts.forEach((p) => p.g.dispose());
    built.glow?.dispose();
  }, [built]);
  return (
    // noShade: CityFx's GroundShade reads building footprints off mesh bounds, which a merged colour mesh doesn't have.
    <group userData={{ noShade: true }}>
      {built.parts.map(({ key, g }) =>
        key.startsWith('lamp') ? (
          <mesh key={key} geometry={g} material={lampMat} />
        ) : key.startsWith('glass') ? (
          <mesh key={key} geometry={g} material={windowMat} />
        ) : (
          <mesh key={key} geometry={g} castShadow receiveShadow>
            <meshStandardMaterial color={key} emissiveIntensity={0} flatShading />
          </mesh>
        ),
      )}
      {built.glow && <NightGlow geometry={built.glow} />}
    </group>
  );
}

/** Night-only light: shown once the street lamps come on, and gone by day so it costs nothing. */
export function NightGlow({ geometry }: { geometry: BufferGeometry }) {
  const ref = useRef<Mesh>(null!);
  useFrame(() => {
    const k = clamp(lampMat.emissiveIntensity / 2.5, 0, 1);
    glowMat.opacity = k;
    ref.current.visible = k > 0.01;
  });
  return (
    <group userData={{ dynamic: true }}>
      <mesh ref={ref} geometry={geometry} material={glowMat} visible={false} renderOrder={2} raycast={() => null} />
    </group>
  );
}
