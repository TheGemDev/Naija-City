// Nigeria from the air, under a flight (three/FlightCabin.tsx Sky): rolling bush cut by a wide brown river with a side
// channel braiding off it, a lake, laterite roads and a tarred highway, villages of round huts and tin roofs ringed by
// farm plots, granite domes, trees thickest along the water, and a thin layer of cloud far below. Greener and palm-dotted
// near Lagos, drier and tan towards Kano.
//
// One tile of land TILE_D deep along the flight is built once, from a random seeded by the route, and drawn twice end
// to end. The flight slides it back under the plane and wraps it a tile at a time, so everything on it scrolls together;
// every shape on it repeats every TILE_D along z, so the seam never shows. All of it is plain three geometry: a few
// merged meshes and one instanced mesh per kind of thing, a couple of dozen draw calls in all.

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Fog,
  IcosahedronGeometry, InstancedBufferAttribute, MeshStandardMaterial, Object3D, type Group, type InstancedMesh,
} from 'three';
import { useGame } from '../game/store';
import { useLowPerf } from '../game/quality';
import type { RegionId } from '../game/regions';

/** What the flight tells the land each frame: how far it has flown, how high it is (0 to 1), and how far through it is. */
export interface FlightMotion { travel: number; alt: number; progress: number }

const TILE_W = 640;
const TILE_D = 600;
const HALF_W = TILE_W / 2;
const HALF_D = TILE_D / 2;
const TAU = Math.PI * 2;
/** Plains lie at about 0.3 and hills climb to about 14. Water lies at WATER, over beds cut down to BED. */
const WATER = -0.3;
const BED = -1.4;
/** This close to the flight line the land is flat for the runway, and nothing stands tall while you are still on it. */
const RUNWAY_CLEAR = 15;
/** The cloud layer drifts slower than the land, so it reads as nearer. */
const CLOUD_DRIFT = 0.8;

/** How green each city's country is from the air: Lagos is rainforest and lagoon, Kano the edge of the Sahel. */
const WET: Record<RegionId, number> = { lagos: 1, abuja: 0.62, kaduna: 0.42, kano: 0.08 };

const smoothstep = (a: number, b: number, x: number) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Any z folded into the tile, [-HALF_D, HALF_D). */
const wrapZ = (z: number) => ((((z + HALF_D) % TILE_D) + TILE_D) % TILE_D) - HALF_D;

/** A seeded random 0..1 (mulberry32): the same route always flies over the same land. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lattice(ix: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise 0..1 on a lattice `cell` wide. The lattice wraps every TILE_D along z (cell must divide it), so the tile's ends meet. */
function noise(x: number, z: number, cell: number, seed: number) {
  const P = Math.round(TILE_D / cell);
  const gx = x / cell, gz = z / cell;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const z0 = ((iz % P) + P) % P, z1 = (z0 + 1) % P;
  const a = lattice(ix, z0, seed), b = lattice(ix + 1, z0, seed), c = lattice(ix, z1, seed), d = lattice(ix + 1, z1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Four octaves of it: broad swells with smaller hills on them. */
const fbm = (x: number, z: number, seed: number) =>
  (noise(x, z, 150, seed) + noise(x, z, 75, seed + 1) * 0.5 + noise(x, z, 37.5, seed + 2) * 0.25 + noise(x, z, 18.75, seed + 3) * 0.125) / 1.875;

/**
 * A river or road: points every `step` along one axis, each pushed off it sideways, with a half width. Rivers and roads
 * that run with the flight (along z) wave in whole periods of the tile, so they join up with themselves across the seam.
 */
interface Curve { along: 'x' | 'z'; start: number; step: number; x: number[]; z: number[]; w: number[] }

function curve(along: 'x' | 'z', from: number, to: number, step: number, at: (u: number) => [number, number]): Curve {
  const c: Curve = { along, start: from, step, x: [], z: [], w: [] };
  for (let u = from; u <= to + 1e-6; u += step) {
    const [off, w] = at(u);
    c.x.push(along === 'x' ? u : off);
    c.z.push(along === 'x' ? off : u);
    c.w.push(w);
  }
  return c;
}

/** Where the curve lies across its axis at `u` along it. */
function crossAt(c: Curve, u: number) {
  const k = Math.max(0, Math.min(c.x.length - 1.001, (u - c.start) / c.step));
  const i = Math.floor(k);
  const off = c.along === 'x' ? c.z : c.x;
  return lerp(off[i], off[i + 1], k - i);
}

/** How far (x, z) is from the curve's edge, negative inside it. Looks only `reach` either way along it, so it never says more than that. */
function edge(c: Curve, x: number, z: number, reach = 60) {
  const u = c.along === 'x' ? x : z;
  const i0 = Math.max(0, Math.floor((u - reach - c.start) / c.step));
  const i1 = Math.min(c.x.length - 2, Math.ceil((u + reach - c.start) / c.step));
  let best = reach;
  for (let i = i0; i <= i1; i++) {
    const ax = c.x[i], az = c.z[i], dx = c.x[i + 1] - ax, dz = c.z[i + 1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - lerp(c.w[i], c.w[i + 1], t);
    if (d < best) best = d;
  }
  return best;
}

/** A colour for the dry north and one for the wet south: the land shifts between them over the flight. */
type Tone = [Color, Color];
const tone = (dry: string, wet: string): Tone => [new Color(dry), new Color(wet)];
const fixed = (c: string): Tone => tone(c, c);

/** Ground: open savanna, greener grass, woodland on the hills and by the water, bare laterite, and sand along the banks. */
const LAND: Tone[] = [
  tone('#c4ad6c', '#629b3f'),
  tone('#ab9f5b', '#4f8b36'),
  tone('#7f8044', '#30692a'),
  tone('#c99a66', '#a8714a'),
  tone('#e3cf9a', '#d4bd88'),
];
const SAVANNA = 0, GRASS = 1, WOOD = 2, SOIL = 3, SAND = 4;
/** Farm plots: millet stubble, maize, fresh ridges, cassava, fallow, rice by the water, groundnut. */
const CROPS: Tone[] = [
  tone('#d8b773', '#bca865'),
  tone('#9c9a52', '#6fa340'),
  tone('#8f5a36', '#6e4128'),
  tone('#8a9a4e', '#4f8f3a'),
  tone('#cdbb8a', '#97ae64'),
  tone('#a6b56a', '#7fc25a'),
  tone('#b39a5a', '#88a14d'),
];
const RICE = 5;
/** Tree crowns: savanna trees, the dark gallery forest along rivers, big shade trees in villages, low scrub, palms. */
const LEAVES: Tone[] = [
  tone('#6e7a3a', '#3f7a2e'),
  tone('#4d6a2e', '#285e25'),
  tone('#3f5f2a', '#2c5a24'),
  tone('#8b8349', '#5a8237'),
  tone('#5d7a34', '#3d7f2c'),
];
const SAVANNA_TREE = 0, GALLERY = 1, SHADE_TREE = 2, SCRUB = 3;
const MUD = [fixed('#a8643a'), fixed('#c08a5a'), fixed('#b9774a')];
const PLASTER = [fixed('#e8dcc0'), fixed('#d9c6a0'), fixed('#c9d6bd'), fixed('#e6c9a8')];
const THATCH = [fixed('#b8945a'), fixed('#a8834c'), fixed('#c4a46a')];
const TIN = [fixed('#a3abb0'), fixed('#8a4b2a'), fixed('#9c5a32'), fixed('#3b6ea5'), fixed('#b23b2e'), fixed('#7d8a8f')];
const GRANITE = [fixed('#8d8a83'), fixed('#9a958c'), fixed('#7c7a74')];
const WHITE = [fixed('#ffffff')];
const LATERITE = new Color('#a8552e');
const TARMAC = new Color('#4a4d52');

/** One thing on the land, standing on its base. `near` things stand by the runway, so they wait until you are off it. */
interface Item { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; tone: number; shade: number; near?: boolean }

/** One instanced mesh's worth: its items in draw order (by the runway last, each one's two tile copies together). */
interface Batch { geometry: BufferGeometry; material: MeshStandardMaterial; items: Item[]; far: number; tones: Tone[]; palms?: boolean }

function batch(list: Item[], geometry: BufferGeometry, material: MeshStandardMaterial, tones: Tone[], palms?: boolean): Batch {
  const sorted = [...list.filter((i) => !i.near), ...list.filter((i) => i.near)];
  const items = sorted.flatMap((i) => [i, { ...i, z: i.z + TILE_D }]);
  return { geometry, material, items, far: list.filter((i) => !i.near).length * 2, tones, palms };
}

/**
 * A ground-hugging mesh whose colours follow the climate. Each vertex carries its colour twice, as it is in the dry
 * north (`color`) and in the wet south (`wetColor`), both already lit or shaded, and the shader blends between them
 * (greening). Repainting the whole ground on the CPU and sending it to the GPU again, a few dozen times a flight, was
 * a hitch each time on a phone.
 */
function painted(pos: number[], index: number[], kinds: number[], shades: number[], tones: Tone[], normals?: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const dry = new Float32Array(pos.length), wet = new Float32Array(pos.length);
  kinds.forEach((kind, v) => {
    const [d, w] = tones[kind], k = shades[v];
    dry[v * 3] = d.r * k; dry[v * 3 + 1] = d.g * k; dry[v * 3 + 2] = d.b * k;
    wet[v * 3] = w.r * k; wet[v * 3 + 1] = w.g * k; wet[v * 3 + 2] = w.b * k;
  });
  geometry.setAttribute('color', new Float32BufferAttribute(dry, 3));
  geometry.setAttribute('wetColor', new Float32BufferAttribute(wet, 3));
  geometry.setIndex(index);
  if (normals) geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Teaches a material to blend each colour between its dry and its wet tone by `wet` (0 dry to 1 wet): `from` is the
 * dry colour the shader already has (vertex or instance colour), `to` the attribute holding the wet one.
 */
function greening(material: MeshStandardMaterial, wet: { value: number }, from: 'color' | 'instanceColor', to: string) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wet = wet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 ${to};\nuniform float wet;`)
      .replace('#include <color_vertex>', `#include <color_vertex>\nvColor.rgb = mix(${from}, ${to}, wet);`);
  };
  material.customProgramCacheKey = () => `greening:${from}:${to}`;
}

/** Palm fronds: a star of drooping leaves, seen from above as the green asterisk of an oil palm. */
function frondGeometry() {
  const pos: number[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    const side = (d: number, r: number, y: number) => [Math.cos(a + d) * r, y, Math.sin(a + d) * r];
    pos.push(0, 0.2, 0, ...side(-0.24, 0.8, 0.15), ...side(0, 1.7, -0.6), 0, 0.2, 0, ...side(0, 1.7, -0.6), ...side(0.24, 0.8, 0.15));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The shared shapes, each standing on y=0 so an item's y is the ground under it. */
function shapes() {
  const hipRoof = new ConeGeometry(Math.SQRT1_2, 1, 4);
  hipRoof.rotateY(Math.PI / 4);
  return {
    crown: new IcosahedronGeometry(1, 0),
    trunk: new CylinderGeometry(0.12, 0.2, 1, 5, 1, true).translate(0, 0.5, 0),
    palmTrunk: new CylinderGeometry(0.09, 0.14, 1, 5, 1, true).translate(0, 0.5, 0),
    fronds: frondGeometry(),
    hutWall: new CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0),
    hutRoof: new ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
    house: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    hipRoof: hipRoof.translate(0, 0.5, 0),
    rock: new IcosahedronGeometry(1, 1),
    cloud: new IcosahedronGeometry(1, 1),
  };
}

/** `wet` is how green the land is just now: the ground, the farm plots and the leaves follow it (greening). */
function materials(wet: { value: number }) {
  const m = {
    ground: new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    plots: new MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    roads: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    water: new MeshStandardMaterial({ color: '#3f7484', roughness: 0.22, metalness: 0.15 }),
    leaf: new MeshStandardMaterial({ flatShading: true, roughness: 1 }),
    frond: new MeshStandardMaterial({ flatShading: true, roughness: 1, side: DoubleSide }),
    bark: new MeshStandardMaterial({ color: '#5a3d26', roughness: 1 }),
    wall: new MeshStandardMaterial({ flatShading: true, roughness: 1 }),
    roof: new MeshStandardMaterial({ flatShading: true, roughness: 0.75 }),
    rock: new MeshStandardMaterial({ flatShading: true, roughness: 1 }),
    cloud: new MeshStandardMaterial({ color: '#ffffff', emissive: '#dbeafe', emissiveIntensity: 0.3, flatShading: true, transparent: true, opacity: 0, depthWrite: false }),
  };
  greening(m.ground, wet, 'color', 'wetColor');
  greening(m.plots, wet, 'color', 'wetColor');
  // Only the leaves change with the climate; walls, roofs and rocks are the same colour all the way.
  greening(m.leaf, wet, 'instanceColor', 'instanceWetColor');
  greening(m.frond, wet, 'instanceColor', 'instanceWetColor');
  return m;
}
type Shapes = ReturnType<typeof shapes>;
type Materials = ReturnType<typeof materials>;

/** Everything on one tile of land for a route. `climate` is how green the route is on average: it decides tin roofs over thatch. */
function buildLand(seed: number, low: boolean, climate: number, geo: Shapes, mat: Materials) {
  const rand = seeded(seed);
  const r = (a: number, b: number) => a + rand() * (b - a);
  const ph = () => rand() * TAU;
  const wave = (z: number, n: number, p: number) => Math.sin((n * TAU * z) / TILE_D + p);
  const dense = low ? 0.45 : 1;

  // Water and roads. The river crosses the flight; the side channel, the two laterite roads and the lake keep apart from
  // each other in their own bands, and the tarred highway crosses everything.
  const mz = r(-55, -30), p1 = ph(), p2 = ph(), p3 = ph();
  const river = curve('x', -HALF_W - 30, HALF_W + 30, 4, (x) => [mz + 32 * Math.sin(x / 55 + p1) + 13 * Math.sin(x / 23 + p2), 8 + 2.5 * Math.sin(x / 90 + p3)]);
  const q1 = ph(), q2 = ph(), q3 = ph();
  const channel = curve('z', -HALF_D - 64, HALF_D + 64, 4, (z) => [-165 + 34 * wave(z, 1, q1) + 12 * wave(z, 2, q2) + 5 * wave(z, 5, q3), 3.6 + wave(z, 3, q1)]);
  const lake = { x: r(160, 180), z: r(-215, -190), rx: r(32, 40), rz: r(20, 26), a: ph(), b: ph() };
  const s1 = ph(), s2 = ph(), s3 = ph(), s4 = ph(), s5 = ph();
  const roads = [
    curve('z', -HALF_D - 64, HALF_D + 64, 4, (z) => [-65 + 18 * wave(z, 1, s1) + 7 * wave(z, 3, s2), 1.1]),
    curve('z', -HALF_D - 64, HALF_D + 64, 4, (z) => [85 + 15 * wave(z, 1, s3) + 6 * wave(z, 4, s4), 1.1]),
    curve('x', -HALF_W - 30, HALF_W + 30, 4, (x) => [150 + 16 * Math.sin(x / 70 + s5), 1.6]),
  ];
  const lakeEdge = (x: number, z: number) => {
    const lx = (x - lake.x) / lake.rx, lz = (z - lake.z) / lake.rz;
    const a = Math.atan2(lz, lx);
    return (Math.hypot(lx, lz) - (1 + 0.16 * Math.sin(3 * a + lake.a) + 0.08 * Math.sin(5 * a + lake.b))) * Math.min(lake.rx, lake.rz);
  };
  const waterEdge = (x: number, z: number) => Math.min(edge(river, x, z), edge(channel, x, z), lakeEdge(x, z));
  const roadEdge = (x: number, z: number) => Math.min(...roads.map((c) => edge(c, x, z, 20)));

  // The ground: a grid of heights, with the plains flattened towards the water and the runway, and the river beds cut in.
  const step = low ? 6 : 4;
  const cols = TILE_W / step + 1, rows = TILE_D / step + 1;
  const hts = new Float32Array(cols * rows);
  const pos: number[] = [], kinds: number[] = [], shades: number[] = [], index: number[] = [];
  const cut = step * 1.5;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = -HALF_W + i * step, z = -HALF_D + j * step;
      const n = fbm(x, z, seed);
      const dw = waterEdge(x, z);
      let h = Math.max(0, n - 0.38) * 34 + noise(x, z, 18.75, seed + 9) * 0.8;
      h = 0.3 + h * Math.min(smoothstep(RUNWAY_CLEAR - 3, 55, Math.abs(x)), smoothstep(0, 45, dw));
      h = dw < cut ? BED : lerp(BED, h, smoothstep(cut, cut + 7, dw));
      hts[j * cols + i] = h;
      pos.push(x, h, z);
      // The tile's last row is its first again, so it is painted the same.
      const speck = lattice(i, j % (rows - 1), seed + 11);
      const kind = dw < cut + 3 ? SAND
        : noise(x, z, 18.75, seed + 7) * noise(x, z, 37.5, seed + 8) > 0.5 ? SOIL
        : h > 5 || dw < 22 ? WOOD
        : noise(x, z, 37.5, seed + 5) > 0.55 ? GRASS : SAVANNA;
      kinds.push(kind);
      shades.push(0.88 + speck * 0.22 + (kind === WOOD ? -Math.min(0.12, h * 0.01) : 0));
    }
  }
  const normals: number[] = [];
  const hAt = (i: number, j: number) => hts[(j < 0 ? j + rows - 1 : j >= rows ? j - rows + 1 : j) * cols + Math.max(0, Math.min(cols - 1, i))];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const nx = hAt(i - 1, j) - hAt(i + 1, j), nz = hAt(i, j - 1) - hAt(i, j + 1), ny = 2 * step;
      const l = Math.hypot(nx, ny, nz);
      normals.push(nx / l, ny / l, nz / l);
      if (i < cols - 1 && j < rows - 1) {
        const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        index.push(a, c, b, c, d, b);
      }
    }
  }
  const ground = painted(pos, index, kinds, shades, LAND, normals);

  /** The ground's height at (x, z), read off the same triangles the ground is drawn with, so nothing floats or sinks. */
  const surface = (x: number, z: number) => {
    const gx = Math.max(0, Math.min(cols - 1.001, (x + HALF_W) / step)), gz = Math.max(0, Math.min(rows - 1.001, (wrapZ(z) + HALF_D) / step));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = hts[j * cols + i], b = hts[j * cols + i + 1], c = hts[(j + 1) * cols + i], d = hts[(j + 1) * cols + i + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };

  // What is already built on, in 4-tile cells: trees keep off plots and compounds.
  const OCC = 4, occW = TILE_W / OCC, occD = TILE_D / OCC;
  const occ = new Uint8Array(occW * occD);
  const cell = (x: number, z: number) => {
    const i = Math.floor((x + HALF_W) / OCC), j = Math.floor((wrapZ(z) + HALF_D) / OCC);
    return i < 0 || i >= occW ? -1 : Math.min(occD - 1, j) * occW + i;
  };
  const taken = (x: number, z: number) => { const c = cell(x, z); return c < 0 || occ[c] === 1; };
  const take = (x: number, z: number) => { const c = cell(x, z); if (c >= 0) occ[c] = 1; };
  /** Dry, off the road, inside the tile, and (unless `runway`) clear of the flight line. */
  const open = (x: number, z: number, pad: number, runway = false) =>
    Math.abs(x) < HALF_W - 4 && (runway || Math.abs(x) > RUNWAY_CLEAR + pad) && waterEdge(x, z) > pad && roadEdge(x, z) > pad;

  // Villages: strung along the roads, on the riverbank, and a few out in the bush.
  const villages: { x: number; z: number; r: number; angle: number }[] = [];
  const village = (x: number, z: number, rad: number, angle: number) => {
    z = wrapZ(z);
    if (Math.abs(x) < 32 || !open(x, z, rad + 3)) return;
    if (villages.some((v) => Math.hypot(v.x - x, wrapZ(v.z - z)) < v.r + rad + 30)) return;
    villages.push({ x, z, r: rad, angle });
  };
  for (const road of [roads[0], roads[1]]) {
    for (let z = -HALF_D + r(0, 40); z < HALF_D; z += r(55, 100)) {
      const rad = r(10, 20);
      village(crossAt(road, z) + (rand() < 0.5 ? -1 : 1) * (rad + r(4, 10)), z, rad, r(-0.3, 0.3));
    }
  }
  for (let x = -HALF_W + 30; x < HALF_W - 30; x += r(60, 110)) {
    const rad = r(10, 18);
    village(x, crossAt(roads[2], x) + (rand() < 0.5 ? -1 : 1) * (rad + r(4, 10)), rad, Math.PI / 2 + r(-0.3, 0.3));
  }
  for (let k = 0; k < 4; k++) {
    const x = r(-HALF_W + 30, HALF_W - 30), rad = r(8, 14);
    village(x, crossAt(river, x) + (rand() < 0.5 ? -1 : 1) * (12 + rad + r(6, 14)), rad, ph());
  }
  for (let k = 0; k < 9; k++) village(r(-HALF_W + 30, HALF_W - 30), r(-HALF_D, HALF_D), r(7, 13), ph());

  // Farm plots in a rough grid round each village, thinning out at the edges, and along the river flats (fadama).
  const plotPos: number[] = [], plotIndex: number[] = [], plotKinds: number[] = [], plotShades: number[] = [];
  const plot = (cx: number, cz: number, ca: number, sa: number, w: number, d: number, crop: number) => {
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => [cx + (u * w * ca - v * d * sa) / 2, cz + (u * w * sa + v * d * ca) / 2]);
    if (corners.some(([x, z]) => !open(x, z, 1, true) || taken(x, z))) return false;
    const base = plotPos.length / 3, shade = r(0.86, 1.1);
    const N = 3;
    for (let b = 0; b <= N; b++) {
      for (let a = 0; a <= N; a++) {
        const u = (a / N - 0.5) * w, v = (b / N - 0.5) * d;
        const x = cx + u * ca - v * sa, z = cz + u * sa + v * ca;
        plotPos.push(x, surface(x, z) + 0.12, z);
        plotKinds.push(crop);
        plotShades.push(shade);
        if (a < N && b < N) {
          const p = base + b * (N + 1) + a;
          // The winding faces up whichever way the plot is turned: (a, c, b) in its own frame, as with the ground.
          plotIndex.push(p, p + N + 1, p + 1, p + N + 1, p + N + 2, p + 1);
        }
      }
    }
    return true;
  };
  const farm = (cx: number, cz: number, angle: number, inner: number, reach: number) => {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const size = r(9, 14), deep = size * r(0.7, 1.3);
    const done: [number, number][] = [];
    for (let v = -reach; v < reach; v += deep) {
      for (let u = -reach; u < reach; u += size) {
        const far = Math.hypot(u, v);
        if (far < inner || far > reach || rand() < (far / reach) ** 2 * 0.8) continue;
        const x = cx + u * ca - v * sa, z = cz + u * sa + v * ca;
        const crop = waterEdge(x, z) < 30 && rand() < 0.6 ? RICE : Math.floor(rand() * CROPS.length);
        if (plot(x, z, ca, sa, size - r(1, 2), deep - r(1, 2), crop)) done.push([x, z]);
      }
    }
    // Only now mark them, so the plots of one farm sit edge to edge.
    for (const [x, z] of done) for (let a = -size / 2; a <= size / 2; a += 2) for (let b = -deep / 2; b <= deep / 2; b += 2) take(x + a * ca - b * sa, z + a * sa + b * ca);
  };
  for (const v of villages) farm(v.x, v.z, v.angle, v.r + 4, v.r + r(28, 50));
  for (let k = 0; k < 5; k++) {
    const x = r(-HALF_W + 20, HALF_W - 20), z = crossAt(river, x);
    const t = Math.atan2(crossAt(river, x + 4) - z, 4);
    farm(x, z + (rand() < 0.5 ? -1 : 1) * r(30, 40), t, 0, r(18, 28));
  }

  // The compounds themselves: round huts with thatch in the dry north, plastered houses under tin further south.
  const walls: Item[] = [], cones: Item[] = [], houses: Item[] = [], roofs: Item[] = [];
  const tin = 0.25 + climate * 0.55;
  for (const v of villages) {
    const placed: [number, number][] = [];
    const n = Math.round(v.r * r(0.8, 1.2) * (low ? 0.6 : 1));
    for (let t = 0; t < n * 4 && placed.length < n; t++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * v.r;
      const x = v.x + Math.cos(a) * d, z = wrapZ(v.z + Math.sin(a) * d);
      if (!open(x, z, 2.5) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.6)) continue;
      placed.push([x, z]);
      take(x, z);
      const y = surface(x, z) - 0.2;
      if (rand() < tin) {
        const w = r(2.6, 4.2), dd = r(2.2, 3.2), h = r(1.3, 1.9), ry = v.angle + (rand() < 0.5 ? 0 : Math.PI / 2) + r(-0.15, 0.15);
        houses.push({ x, y, z, sx: w, sy: h, sz: dd, ry, tone: Math.floor(rand() * PLASTER.length), shade: r(0.9, 1.05) });
        roofs.push({ x, y: y + h, z, sx: w + 0.35, sy: r(0.6, 1.0), sz: dd + 0.35, ry, tone: Math.floor(rand() * TIN.length), shade: r(0.85, 1.1) });
      } else {
        const rad = r(1.0, 1.5), h = r(1.2, 1.6);
        walls.push({ x, y, z, sx: rad, sy: h, sz: rad, ry: ph(), tone: Math.floor(rand() * MUD.length), shade: r(0.9, 1.05) });
        cones.push({ x, y: y + h, z, sx: rad * 1.3, sy: rad * 1.1, sz: rad * 1.3, ry: ph(), tone: Math.floor(rand() * THATCH.length), shade: r(0.85, 1.1) });
      }
    }
  }

  // Trees: thick along the water, scattered over the bush (more on the hills), big shade trees in the villages, low scrub
  // everywhere, and oil palms that only show as the land gets wetter.
  const crowns: Item[] = [], trunks: Item[] = [];
  const palms: { trunk: Item; fronds: Item; rank: number }[] = [];
  const tree = (x: number, z: number, size: number, kind: number, flat: number) => {
    z = wrapZ(z);
    if (!open(x, z, 1.5, true) || taken(x, z)) return;
    const y = surface(x, z), near = Math.abs(x) < RUNWAY_CLEAR, h = size * r(0.9, 1.3), ry = ph();
    crowns.push({ x, y: y + h + size * flat * 0.6, z, sx: size, sy: size * flat, sz: size, ry, tone: kind, shade: r(0.82, 1.12), near });
    trunks.push({ x, y: y - 0.1, z, sx: size * 0.9, sy: h + 0.2, sz: size * 0.9, ry, tone: 0, shade: 1, near });
  };
  for (let t = 0, n = 1400 * dense; t < n * 3; t++) {
    const x = r(-HALF_W + 4, HALF_W - 4), z = r(-HALF_D, HALF_D);
    const hill = smoothstep(3, 9, surface(x, z));
    if (rand() > 0.12 + 0.6 * smoothstep(0.35, 0.75, noise(x, z, 75, seed + 3)) + 0.4 * hill) continue;
    // Savanna trees spread wide and flat; the hills carry rounder woodland.
    tree(x, z, r(1.5, 2.8), hill > 0.5 ? GALLERY : SAVANNA_TREE, hill > 0.5 ? 0.8 : r(0.42, 0.6));
  }
  const banks: [Curve, number][] = [[river, 0.6], [channel, 0.9], [river, 1]];
  for (let t = 0, n = 800 * dense; t < n; t++) {
    const pickR = rand();
    if (pickR < 0.1) {
      const a = ph(), k = 1 + 0.16 * Math.sin(3 * a + lake.a) + r(0.15, 0.6);
      tree(lake.x + Math.cos(a) * lake.rx * k, lake.z + Math.sin(a) * lake.rz * k, r(1.8, 2.8), GALLERY, 0.85);
      continue;
    }
    const c = banks.find(([, p]) => pickR < p)![0];
    const i = Math.floor(rand() * (c.x.length - 1));
    const dx = c.x[i + 1] - c.x[i], dz = c.z[i + 1] - c.z[i], l = Math.hypot(dx, dz);
    const off = (rand() < 0.5 ? -1 : 1) * (c.w[i] + cut + r(1, 16));
    tree(c.x[i] - (dz / l) * off + r(-2, 2), c.z[i] + (dx / l) * off + r(-2, 2), r(1.8, 3.0), GALLERY, r(0.75, 0.95));
  }
  for (let t = 0, n = 1300 * dense; t < n; t++) {
    const x = r(-HALF_W + 4, HALF_W - 4), z = wrapZ(r(-HALF_D, HALF_D));
    if (!open(x, z, 1, true) || taken(x, z)) continue;
    crowns.push({ x, y: surface(x, z) + 0.15, z, sx: r(0.7, 1.2), sy: r(0.4, 0.6), sz: r(0.7, 1.2), ry: ph(), tone: SCRUB, shade: r(0.85, 1.15), near: Math.abs(x) < RUNWAY_CLEAR });
  }
  for (const v of villages) {
    // Shade trees grow in among the compounds, so they skip the "built on" check.
    for (let k = 0, n = 2 + Math.floor(rand() * 4); k < n; k++) {
      const a = ph(), d = r(0.3, 1.1) * v.r, x = v.x + Math.cos(a) * d, z = wrapZ(v.z + Math.sin(a) * d);
      if (!open(x, z, 2)) continue;
      const size = r(2.4, 3.4), h = r(2.2, 3.0), y = surface(x, z);
      crowns.push({ x, y: y + h + size * 0.55, z, sx: size, sy: size * 0.8, sz: size, ry: ph(), tone: SHADE_TREE, shade: r(0.85, 1.05) });
      trunks.push({ x, y: y - 0.1, z, sx: size, sy: h + 0.2, sz: size, ry: 0, tone: 0, shade: 1 });
    }
    // Oil palms round the village and down to the water.
    for (let k = 0, n = Math.round(r(4, 9) * dense); k < n; k++) {
      const a = ph(), d = r(0.5, 2.2) * v.r, x = v.x + Math.cos(a) * d, z = wrapZ(v.z + Math.sin(a) * d);
      if (!open(x, z, 1.5) || taken(x, z)) continue;
      const h = r(3.5, 5.5), y = surface(x, z), s = r(1.0, 1.4);
      palms.push({
        trunk: { x, y: y - 0.1, z, sx: 1, sy: h + 0.1, sz: 1, ry: 0, tone: 0, shade: 1 },
        fronds: { x, y: y + h, z, sx: s, sy: s, sz: s, ry: ph(), tone: 4, shade: r(0.85, 1.1) },
        rank: rand(),
      });
    }
  }
  // Palms show in a fixed order as the land greens, so the same ones come first every time.
  palms.sort((a, b) => a.rank - b.rank);

  // Granite domes, the inselbergs round Abuja and Kaduna, each with boulders tumbled at its foot.
  const rocks: Item[] = [];
  for (let t = 0, made = 0; t < 400 && made < (low ? 5 : 9); t++) {
    const x = r(-HALF_W + 20, HALF_W - 20), z = r(-HALF_D + 15, HALF_D - 15);
    if (Math.abs(x) < 45 || fbm(x, z, seed) < 0.5 || !open(x, z, 14) || taken(x, z)) continue;
    const R = r(5, 11), y = surface(x, z);
    rocks.push({ x, y: y - R * 0.3, z, sx: R, sy: R * r(0.6, 1.0), sz: R * r(0.8, 1.15), ry: ph(), tone: Math.floor(rand() * GRANITE.length), shade: r(0.9, 1.08) });
    for (let k = 0, n = 2 + Math.floor(rand() * 3); k < n; k++) {
      const a = ph(), d = R * r(1.0, 1.5), bx = x + Math.cos(a) * d, bz = wrapZ(z + Math.sin(a) * d), b = R * r(0.18, 0.35);
      rocks.push({ x: bx, y: surface(bx, bz) - b * 0.3, z: bz, sx: b, sy: b * r(0.6, 0.9), sz: b, ry: ph(), tone: Math.floor(rand() * GRANITE.length), shade: r(0.85, 1.05) });
    }
    for (let a = -R; a <= R; a += OCC) for (let b = -R; b <= R; b += OCC) take(x + a, z + b);
    made++;
  }

  // Water: the river and the side channel as ribbons over their cut beds, the lake as a ragged disc.
  const waterPos: number[] = [], waterIndex: number[] = [];
  /** A strip down a curve between `from` and `to` along it, `y` high at each point, as (centre, left, right) rows. */
  const ribbon = (c: Curve, from: number, to: number, out: number[], idx: number[], y: (x: number, z: number) => number, colour?: (out: number[]) => void) => {
    const base = out.length / 3;
    let rowsMade = 0;
    for (let i = 0; i < c.x.length; i++) {
      const u = c.start + i * c.step;
      if (u < from - 1e-6 || u > to + 1e-6) continue;
      const a = Math.max(0, i - 1), b = Math.min(c.x.length - 1, i + 1);
      const dx = c.x[b] - c.x[a], dz = c.z[b] - c.z[a], l = Math.hypot(dx, dz);
      const nx = -dz / l * c.w[i], nz = dx / l * c.w[i];
      for (const [x, z] of [[c.x[i] - nx, c.z[i] - nz], [c.x[i], c.z[i]], [c.x[i] + nx, c.z[i] + nz]]) {
        out.push(x, y(x, z), z);
        colour?.(out);
      }
      if (rowsMade) {
        const p = base + (rowsMade - 1) * 3;
        // Right to centre, then centre to left: each a strip of upward-facing quads.
        idx.push(p, p + 1, p + 3, p + 1, p + 4, p + 3, p + 1, p + 2, p + 4, p + 2, p + 5, p + 4);
      }
      rowsMade++;
    }
  };
  ribbon(river, -HALF_W - 30, HALF_W + 30, waterPos, waterIndex, () => WATER);
  ribbon(channel, -HALF_D, HALF_D, waterPos, waterIndex, () => WATER);
  const lakeBase = waterPos.length / 3;
  waterPos.push(lake.x, WATER, lake.z);
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * TAU, s = 1 + 0.16 * Math.sin(3 * a + lake.a) + 0.08 * Math.sin(5 * a + lake.b);
    waterPos.push(lake.x + Math.cos(a) * lake.rx * s, WATER, lake.z + Math.sin(a) * lake.rz * s);
    if (k) waterIndex.push(lakeBase, lakeBase + k + 1, lakeBase + k);
  }
  const water = new BufferGeometry();
  water.setAttribute('position', new Float32BufferAttribute(waterPos, 3));
  water.setIndex(waterIndex);
  water.computeVertexNormals();
  water.computeBoundingSphere();

  // Roads draped over the ground, the laterite ones red and the highway grey; over water they ride up as a bridge.
  const roadPos: number[] = [], roadIndex: number[] = [], roadCol: number[] = [];
  roads.forEach((c, k) => {
    const lift = c.along === 'x' ? 0.16 : 0.12;
    const colour = c.along === 'x' ? TARMAC : LATERITE;
    ribbon(c, c.along === 'x' ? -HALF_W - 30 : -HALF_D, c.along === 'x' ? HALF_W + 30 : HALF_D, roadPos, roadIndex,
      (x, z) => Math.max(surface(x, z), WATER + 0.3) + lift + k * 0.01, () => roadCol.push(colour.r, colour.g, colour.b));
  });
  const roadGeo = new BufferGeometry();
  roadGeo.setAttribute('position', new Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('color', new Float32BufferAttribute(roadCol, 3));
  roadGeo.setIndex(roadIndex);
  roadGeo.computeVertexNormals();
  roadGeo.computeBoundingSphere();

  // Cloud far below the plane: flat puffs in loose rafts, mostly out on the side the camera looks across.
  const puffs: Item[] = [];
  for (let k = 0, n = low ? 9 : 16; k < n; k++) {
    const x = r(-220, 120), z = r(-HALF_D, HALF_D), y = r(-2, 3);
    if (Math.abs(x) < 30) continue;
    for (let j = 0, m = 3 + Math.floor(rand() * 3); j < m; j++) {
      puffs.push({ x: x + r(-14, 14), y: y + r(-0.6, 0.6), z: z + r(-10, 10), sx: r(9, 17), sy: r(1.5, 2.6), sz: r(6, 11), ry: r(-0.4, 0.4), tone: 0, shade: 1 });
    }
  }

  return {
    ground,
    plots: painted(plotPos, plotIndex, plotKinds, plotShades, CROPS),
    water,
    roads: roadGeo,
    batches: [
      batch(crowns, geo.crown, mat.leaf, LEAVES),
      batch(trunks, geo.trunk, mat.bark, []),
      batch(palms.map((p) => p.trunk), geo.palmTrunk, mat.bark, [], true),
      batch(palms.map((p) => p.fronds), geo.fronds, mat.frond, LEAVES, true),
      batch(walls, geo.hutWall, mat.wall, MUD),
      batch(cones, geo.hutRoof, mat.roof, THATCH),
      batch(houses, geo.house, mat.wall, PLASTER),
      batch(roofs, geo.hipRoof, mat.roof, TIN),
      batch(rocks, geo.rock, mat.rock, GRANITE),
    ],
    clouds: batch(puffs, geo.cloud, mat.cloud, WHITE),
  };
}

const dummy = new Object3D();
function place(mesh: InstancedMesh, items: Item[]) {
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.ry, 0);
    dummy.scale.set(it.sx, it.sy, it.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/** Each thing's colour, dry and (if its kind changes with the climate) wet too, painted once: the shader blends them (greening). */
const shaded = new Color();
function colourIn(mesh: InstancedMesh, b: Batch) {
  if (!b.tones.length) return;
  b.items.forEach((it, i) => mesh.setColorAt(i, shaded.copy(b.tones[it.tone][0]).multiplyScalar(it.shade)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (b.tones.every(([dry, green]) => dry.equals(green))) return;
  const wet = new Float32Array(b.items.length * 3);
  b.items.forEach((it, i) => shaded.copy(b.tones[it.tone][1]).multiplyScalar(it.shade).toArray(wet, i * 3));
  b.geometry.setAttribute('instanceWetColor', new InstancedBufferAttribute(wet, 3));
}

/** Where you are flying from and to: from the city you are in, to the one in the flight's action id (fly_lagos, fly_kano_jet). */
function route() {
  const s = useGame.getState();
  const from = (s.destinationId in WET ? s.destinationId : 'kaduna') as RegionId;
  const to = /^fly_([a-z]+)/.exec(s.task?.actionId ?? '')?.[1];
  return { from, to: (to && to in WET ? to : from) as RegionId };
}

/** How many oil palms of each hundred show, for how green the land is. */
const palmShare = (wet: number) => smoothstep(0.3, 0.9, wet);

/**
 * The land under the plane. Sits inside the Sky's ground group (which rises and falls with the climb and the landing)
 * and reads how far you have flown from `motion`. It also hangs a haze over the far distance while you are in the air.
 */
export function FlightTerrain({ motion }: { motion: RefObject<FlightMotion> }) {
  const low = useLowPerf();
  const { from, to } = useMemo(route, []);
  const geo = useMemo(shapes, []);
  const wet = useMemo(() => ({ value: 0 }), []);
  const mat = useMemo(() => materials(wet), [wet]);
  const land = useMemo(() => {
    let seed = 7;
    for (const ch of `${from}>${to}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    return buildLand(seed, low, (WET[from] + WET[to]) / 2, geo, mat);
  }, [from, to, low, geo, mat]);
  const tile = useRef<Group>(null!);
  const cloudLayer = useRef<Group>(null!);
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const cloudMesh = useRef<InstancedMesh>(null!);
  const frames = useRef(0);
  const { scene, camera } = useThree();
  const fog = useMemo(() => new Fog('#bfe3f5', 100, 300), []);

  useEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mat).forEach((m) => m.dispose());
  }, [geo, mat]);
  useEffect(() => () => {
    land.ground.dispose();
    land.plots.dispose();
    land.water.dispose();
    land.roads.dispose();
  }, [land]);

  // Haze over the far distance, for depth and to hide the tile's edges. It starts beyond the plane, wherever the camera is.
  useLayoutEffect(() => {
    scene.fog = fog;
    return () => { if (scene.fog === fog) scene.fog = null; };
  }, [scene, fog]);

  useLayoutEffect(() => {
    land.batches.forEach((b, i) => { const m = meshes.current[i]; if (m) { place(m, b.items); colourIn(m, b); } });
    place(cloudMesh.current, land.clouds.items);
    colourIn(cloudMesh.current, land.clouds);
  }, [land]);

  useFrame(() => {
    const m = motion.current;
    tile.current.position.z = -(m.travel % TILE_D);
    cloudLayer.current.position.z = -((m.travel * CLOUD_DRIFT) % TILE_D);

    // The land greens or dries over the middle of the flight, from the city you left to the one you are flying to.
    // Only a number for the shaders (greening): nothing is repainted.
    wet.value = lerp(WET[from], WET[to], smoothstep(0.15, 0.85, m.progress));

    // Nothing tall by the runway while you are still on it; palms only as far as the land is green enough for them.
    const onRunway = m.alt < 0.3;
    land.batches.forEach((b, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      mesh.count = b.palms ? 2 * Math.round((b.items.length / 2) * palmShare(wet.value)) : onRunway ? b.far : b.items.length;
    });

    // The cloud layer only once you are well up, so it never drifts across the cabin. It is drawn (unseen, at no
    // opacity) for the first frame too: its shader is then built with everything else as the flight opens, not halfway
    // up the climb, where building it stalled a phone for a moment.
    const cloud = smoothstep(0.65, 0.9, m.alt);
    cloudLayer.current.visible = cloud > 0.01 || frames.current++ < 1;
    mat.cloud.opacity = cloud * 0.8;

    if (scene.background instanceof Color) fog.color.copy(scene.background);
    fog.near = camera.position.length() + 50;
    fog.far = fog.near + 240;
  });

  return (
    <>
      <group ref={tile}>
        {[0, TILE_D].map((z) => (
          <group key={z} position-z={z}>
            <mesh geometry={land.ground} material={mat.ground} />
            <mesh geometry={land.plots} material={mat.plots} />
            <mesh geometry={land.water} material={mat.water} />
            <mesh geometry={land.roads} material={mat.roads} />
          </group>
        ))}
        {land.batches.map((b, i) => (
          <instancedMesh
            key={i}
            ref={(m) => { meshes.current[i] = m; }}
            args={[b.geometry, b.material, Math.max(1, b.items.length)]}
            frustumCulled={false}
          />
        ))}
      </group>
      <group ref={cloudLayer} position-y={24}>
        <instancedMesh ref={cloudMesh} args={[land.clouds.geometry, land.clouds.material, Math.max(1, land.clouds.items.length)]} frustumCulled={false} />
      </group>
    </>
  );
}
