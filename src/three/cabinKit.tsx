// Building cabin fittings in code, cheaply: hundreds of little boxes and cylinders (seats, bins, lights, panels) are
// baked into one mesh per finish, coloured per vertex, so a whole furnished cabin costs a handful of draw calls rather
// than one or two per part. Seated people who never get up can be baked the same way (Baked).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Box3, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute,
  FrontSide, Matrix3, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, ShapeGeometry, Sphere, SphereGeometry,
  Vector3, type Group, type Material, type Mesh, type Object3D, type Shape, type Side,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
/**
 * How a surface takes the light: cloth and carpet (matte), leather, veneer and plastic (satin), gold and chrome
 * (metal), and lamps, screens and the sky through the windows, which give light rather than take it (glow).
 */
export type Finish = 'matte' | 'satin' | 'metal' | 'glow';
const FINISHES: Finish[] = ['matte', 'satin', 'metal', 'glow'];

/** One material per finish, shared by every cabin: the colour is in the vertices. */
const FINISH_MATERIAL: Record<Finish, Material> = {
  matte: new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
  satin: new MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }),
  metal: new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.75 }),
  glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

/** Shapes are made once at each size and copied in wherever they are needed. */
const templates = new Map<string, BufferGeometry>();
function template(key: string, make: () => BufferGeometry) {
  let g = templates.get(key);
  if (!g) templates.set(key, (g = make()));
  return g;
}

interface Bucket { pos: number[]; nor: number[]; col: number[]; idx: number[] }

const m4 = new Matrix4();
const n3 = new Matrix3();
const v = new Vector3();
const q = new Quaternion();
const e = new Euler();
const s = new Vector3();
const c = new Color();

/** Collects parts, each placed and coloured, then builds them into one geometry per finish. */
export class Kit {
  private buckets = new Map<Finish, Bucket>();
  private stack: Matrix4[] = [new Matrix4()];
  /** On a slow device rounded corners become plain ones and round things get fewer sides. */
  constructor(readonly low = false) {}

  /** Everything added until the matching `pop` is placed relative to this: a seat, a window, a cabinet. */
  push(at: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
    this.stack.push(this.top().clone().multiply(compose(at, rot, scale)));
    return this;
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  private top() {
    return this.stack[this.stack.length - 1];
  }

  /** Copies `g` in, moved to `at`, turned by `rot` and sized by `scale`, in one colour. */
  add(g: BufferGeometry, colour: string, finish: Finish = 'matte', at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
    let b = this.buckets.get(finish);
    if (!b) this.buckets.set(finish, (b = { pos: [], nor: [], col: [], idx: [] }));
    const m = m4.copy(this.top()).multiply(compose(at, rot, scale));
    n3.getNormalMatrix(m);
    c.set(colour);
    const base = b.pos.length / 3;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(n3).normalize();
      b.nor.push(v.x, v.y, v.z);
      b.col.push(c.r, c.g, c.b);
    }
    const flip = m.determinant() < 0;
    const index = g.getIndex();
    const tris = index ? index.count : pos.count;
    for (let i = 0; i < tris; i += 3) {
      const a = index ? index.getX(i) : i, bb = index ? index.getX(i + 1) : i + 1, cc = index ? index.getX(i + 2) : i + 2;
      if (flip) b.idx.push(base + a, base + cc, base + bb);
      else b.idx.push(base + a, base + bb, base + cc);
    }
    return this;
  }

  box(size: V3, at: V3, colour: string, finish: Finish = 'matte', rot?: V3) {
    return this.add(template('box', () => new BoxGeometry(1, 1, 1)), colour, finish, at, rot, size);
  }

  /** A box with its edges rounded off by `r`: cushions, panels, cabinets. */
  soft(size: V3, at: V3, colour: string, finish: Finish = 'satin', rot?: V3, r = 0.05) {
    if (this.low) return this.box(size, at, colour, finish, rot);
    const [w, h, d] = size;
    const k = Math.min(r, Math.min(w, h, d) * 0.45);
    const g = template(`soft:${w}:${h}:${d}:${k}`, () => new RoundedBoxGeometry(w, h, d, 2, k));
    return this.add(g, colour, finish, at, rot);
  }

  /** An upright cylinder (or a cone, with different ends), `h` tall, centred on `at`. */
  cyl(rTop: number, rBot: number, h: number, at: V3, colour: string, finish: Finish = 'satin', rot?: V3, sides = 16) {
    const n = this.low ? Math.max(6, Math.round(sides / 2)) : sides;
    const r = Math.max(rTop, rBot);
    const top = +(rTop / r).toFixed(3), bot = +(rBot / r).toFixed(3);
    return this.add(template(`cyl:${top}:${bot}:${n}`, () => new CylinderGeometry(top, bot, 1, n)), colour, finish, at, rot, [r, h, r]);
  }

  ball(r: number, at: V3, colour: string, finish: Finish = 'satin', scale: V3 = [1, 1, 1]) {
    const n = this.low ? 8 : 14;
    return this.add(template(`ball:${n}`, () => new SphereGeometry(1, n, Math.round(n * 0.7))), colour, finish, at, undefined, [r * scale[0], r * scale[1], r * scale[2]]);
  }

  /** A flat shape in the XY plane, facing +z: window panes and their frames. */
  shape(sh: Shape, key: string, at: V3, colour: string, finish: Finish = 'satin', rot?: V3, scale?: V3) {
    return this.add(template(`shape:${key}:${this.low}`, () => new ShapeGeometry(sh, this.low ? 4 : 10)), colour, finish, at, rot, scale);
  }

  build(): Built {
    const out: Built = {};
    for (const f of FINISHES) {
      const b = this.buckets.get(f);
      if (!b || !b.idx.length) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new Float32BufferAttribute(b.nor, 3));
      g.setAttribute('color', new Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      out[f] = g;
    }
    return out;
  }
}
export type Built = Partial<Record<Finish, BufferGeometry>>;

function compose(at: V3, rot: V3, scale: V3) {
  return new Matrix4().compose(v.set(...at).clone(), q.setFromEuler(e.set(...rot)).clone(), s.set(...scale).clone());
}

/** Draws a built kit: one mesh per finish. Lamps and windows cast no shadow. */
export function KitMeshes({ kit, shadows = true }: { kit: Built; shadows?: boolean }) {
  useEffect(() => () => Object.values(kit).forEach((g) => g?.dispose()), [kit]);
  return (
    <>
      {FINISHES.map((f) => kit[f] && (
        <mesh key={f} geometry={kit[f]} material={FINISH_MATERIAL[f]} castShadow={shadows && f !== 'glow'} receiveShadow={f !== 'glow'} />
      ))}
    </>
  );
}

/* ---------- Baking people ---------- */

interface Part { geometry: BufferGeometry; material: Material }

/** Plain materials, one per way of taking the light, coloured per vertex (people's materials are all MeshStandardMaterial). */
const plain = new Map<string, MeshStandardMaterial>();
function plainMaterial(rough: number, metal: number, side: Side) {
  const k = `${rough}|${metal}|${side}`;
  let m = plain.get(k);
  if (!m) plain.set(k, (m = new MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side })));
  return m;
}

/**
 * Bakes everything under `root` into a few meshes, as it stands right now: one for each way the surfaces take the light,
 * plus one for each printed fabric, which keeps its own material and texture. Positions are relative to `root`.
 */
function bake(root: Object3D): Part[] {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { material: Material; textured: boolean; meshes: Mesh[] }>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (let p: Object3D | null = mesh; p && p !== root; p = p.parent) if (!p.visible) return;
    const mat = mesh.material as MeshStandardMaterial;
    const textured = !!mat.map;
    const key = textured ? mat.uuid : `${mat.roughness}|${mat.metalness}|${mat.side}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { material: textured ? mat : plainMaterial(mat.roughness, mat.metalness, mat.side ?? FrontSide), textured, meshes: [] }));
    g.meshes.push(mesh);
  });
  const out: Part[] = [];
  const m = new Matrix4();
  for (const g of groups.values()) {
    // Sized first, then filled: one pass to count, one to copy, straight into typed arrays.
    let verts = 0, tris = 0;
    for (const mesh of g.meshes) {
      const geo = mesh.geometry;
      verts += geo.getAttribute('position').count;
      tris += geo.getIndex()?.count ?? geo.getAttribute('position').count;
    }
    const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
    const uv = g.textured ? new Float32Array(verts * 2) : null;
    const col = g.textured ? null : new Float32Array(verts * 3);
    const idx = new Uint32Array(tris);
    let vo = 0, io = 0;
    const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of g.meshes) {
      m.multiplyMatrices(inv, mesh.matrixWorld);
      n3.getNormalMatrix(m);
      const e4 = m.elements, e3 = n3.elements;
      const geo = mesh.geometry;
      // People's shapes are plain (not interleaved) attributes, so their arrays are read directly: much the quickest.
      const P = geo.getAttribute('position') as BufferAttribute, N = geo.getAttribute('normal') as BufferAttribute | undefined, U = geo.getAttribute('uv') as BufferAttribute | undefined;
      const pa = P.array, na = N?.array, ua = U?.array;
      c.copy((mesh.material as MeshStandardMaterial).color);
      const base = vo;
      for (let i = 0; i < P.count; i++, vo++) {
        const x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2];
        const px = e4[0] * x + e4[4] * y + e4[8] * z + e4[12], py = e4[1] * x + e4[5] * y + e4[9] * z + e4[13], pz = e4[2] * x + e4[6] * y + e4[10] * z + e4[14];
        pos[vo * 3] = px;
        pos[vo * 3 + 1] = py;
        pos[vo * 3 + 2] = pz;
        if (px < lo.x) lo.x = px; if (px > hi.x) hi.x = px;
        if (py < lo.y) lo.y = py; if (py > hi.y) hi.y = py;
        if (pz < lo.z) lo.z = pz; if (pz > hi.z) hi.z = pz;
        const a = na ? na[i * 3] : 0, b = na ? na[i * 3 + 1] : 1, d = na ? na[i * 3 + 2] : 0;
        const nx = e3[0] * a + e3[3] * b + e3[6] * d, ny = e3[1] * a + e3[4] * b + e3[7] * d, nz = e3[2] * a + e3[5] * b + e3[8] * d;
        const len = Math.hypot(nx, ny, nz) || 1;
        nor[vo * 3] = nx / len;
        nor[vo * 3 + 1] = ny / len;
        nor[vo * 3 + 2] = nz / len;
        if (uv) {
          uv[vo * 2] = ua ? ua[i * 2] : 0;
          uv[vo * 2 + 1] = ua ? ua[i * 2 + 1] : 0;
        } else if (col) {
          col[vo * 3] = c.r;
          col[vo * 3 + 1] = c.g;
          col[vo * 3 + 2] = c.b;
        }
      }
      const flip = m.determinant() < 0;
      const ia = geo.getIndex()?.array;
      const n = ia ? ia.length : P.count;
      for (let i = 0; i < n; i += 3, io += 3) {
        const a = ia ? ia[i] : i, b = ia ? ia[i + 1] : i + 1, cc = ia ? ia[i + 2] : i + 2;
        idx[io] = base + a;
        idx[io + 1] = base + (flip ? cc : b);
        idx[io + 2] = base + (flip ? b : cc);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new BufferAttribute(nor, 3));
    if (uv) geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    if (col) geometry.setAttribute('color', new BufferAttribute(col, 3));
    geometry.setIndex(new BufferAttribute(idx, 1));
    // From the box gathered on the way: computing it over every vertex again took as long as the copy.
    geometry.boundingBox = new Box3(lo, hi);
    geometry.boundingSphere = new Sphere(lo.clone().add(hi).multiplyScalar(0.5), lo.distanceTo(hi) / 2);
    out.push({ geometry, material: g.material });
  }
  return out;
}

/**
 * People who stay in their seats the whole way (passengers, pilots), drawn as they first sit, then baked into a few
 * meshes. A person is some fifty parts and each cost a draw call or two; a full airliner of them was most of what a
 * phone drew in flight. They stop moving, but nobody is looking for the man in 14C to scratch his ear.
 */
export function Baked({ children, shadows = true }: { children: ReactNode; shadows?: boolean }) {
  const live = useRef<Group>(null!);
  const [parts, setParts] = useState<Part[] | null>(null);
  const frames = useRef(0);
  useFrame(() => {
    // Two frames: every person has set their pose by then (their own useFrame), however the frame loop orders us.
    if (parts || !live.current || ++frames.current < 2) return;
    setParts(bake(live.current));
  });
  useEffect(() => () => parts?.forEach((p) => p.geometry.dispose()), [parts]);
  if (parts) return <>{parts.map((p, i) => <mesh key={i} geometry={p.geometry} material={p.material} castShadow={shadows} receiveShadow />)}</>;
  // Not seen until baked: no one sees them pop into their pose.
  return <group ref={live} visible={false}>{children}</group>;
}

/** For a shade of a colour: k below 1 darker, above lighter. */
export const tone = (hex: string, k: number) => '#' + new Color(hex).multiplyScalar(k).getHexString();
