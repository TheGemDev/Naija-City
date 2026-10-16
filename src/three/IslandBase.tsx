// What a city floats on: one craggy mass of banded rock under the map that narrows to a point, a grassy lip
// overhanging the coast with roots and vines hanging off it, a few loose chunks floating beside it, and soft clouds
// drifting far below, so the map reads as a floating island and not a slab on a table.
//
// Built once per city from its outline: the rock, lip, roots and chunks are a single merged mesh with one shared
// material; the clouds are one more mesh of camera-facing puffs drawn by a small shader. The camera looks almost straight down, so the rock mostly shows as the banded cliff along the south coast
// and, zoomed out, the underside peeking past the edges; the clouds moving at a different speed from the map as you
// pan are what really sell the height.

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial, ShaderMaterial, UniformsLib, UniformsUtils, Vector2 } from 'three';
import type { CityMap, P2 } from '../game/city';
import { useLowPerf } from '../game/quality';
import { noise, rimOf, skyLight, vnoise, type Rim } from './islandShape';

/** How deep the rock hangs, as a share of the island's radius. */
const DEPTH = 0.75;
/** Rock starts just under the grass lip. */
const ROCK_TOP = -0.3;

/** Rock colours from just under the soil down to the tip: laterite reds and ochres, sandstone, then grey. */
const STRATA: [number, string][] = [
  [0, '#4e3a26'], [0.035, '#9b5130'], [0.09, '#b97a45'], [0.15, '#c9a46e'], [0.2, '#a65e36'], [0.27, '#d0b07a'],
  [0.36, '#8a7563'], [0.46, '#a7743f'], [0.58, '#76665a'], [0.72, '#5d5249'], [0.86, '#4a4038'], [1, '#3a332e'],
];
const STRATA_C = STRATA.map(([t, c]) => [t, new Color(c)] as const);

function strata(t: number, out: Color) {
  const u = Math.min(1, Math.max(0, t));
  let i = 1;
  while (i < STRATA_C.length - 1 && STRATA_C[i][0] < u) i++;
  const [a, ca] = STRATA_C[i - 1];
  const [b, cb] = STRATA_C[i];
  // Hard-ish steps between layers, so they read as bands rather than a gradient.
  const k = Math.min(1, Math.max(0, (u - a) / (b - a)));
  return out.copy(ca).lerp(cb, k * k * (3 - 2 * k));
}

/** Share of the depth that is sheer cliff before the rock starts to narrow. */
const CLIFF = 0.18;
/**
 * The rock's outline at depth t (0 top, 1 tip): a sheer cliff first, then a bulging taper to a point. The camera looks
 * almost straight down, so only a sheer face shows at all: anything sloping in from the very top would be hidden.
 */
const taper = (t: number) => (t < CLIFF ? 1 : Math.pow(Math.max(0, 1 - Math.pow((t - CLIFF) / (1 - CLIFF), 1.7)), 0.75));

/** Collects triangles with per-vertex colours; everything static ends up in one geometry. */
class Builder {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, c: Color) {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }
  /** Quads between consecutive rings of equal length (closed loops), facing away from (cx, cz). */
  rings(rings: number[][], cx: number, cz: number, closed = true) {
    for (let r = 0; r < rings.length - 1; r++) {
      const a = rings[r], b = rings[r + 1];
      const n = closed ? a.length : a.length - 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % a.length;
        this.quad(a[i], a[j], b[i], b[j], cx, cz);
      }
    }
  }
  quad(a0: number, a1: number, b0: number, b1: number, cx: number, cz: number) {
    this.tri(a0, b0, a1, cx, cz);
    this.tri(a1, b0, b1, cx, cz);
  }
  /** A triangle wound so it faces outwards from the vertical axis through (cx, cz). */
  tri(a: number, b: number, c: number, cx: number, cz: number) {
    const p = this.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
    const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
    const mx = (ax + p[b * 3] + p[c * 3]) / 3 - cx, mz = (az + p[b * 3 + 2] + p[c * 3 + 2]) / 3 - cz;
    if (nx * mx + nz * mz >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }
  /** A thin hanging strand (root or vine): a three-sided tube following `path`, tapering to a point. */
  strand(path: [number, number, number][], r0: number, c: Color) {
    const rings = path.map(([x, y, z], k) => {
      const r = r0 * (1 - k / path.length);
      return [0, 1, 2].map((s) => this.vert(x + Math.cos((s * Math.PI * 2) / 3) * r, y, z + Math.sin((s * Math.PI * 2) / 3) * r, c));
    });
    const [lx, , lz] = path[path.length - 1];
    rings.forEach((ring, k) => {
      if (k === rings.length - 1) return;
      const [x, , z] = path[k];
      for (let s = 0; s < 3; s++) this.quad(ring[s], ring[(s + 1) % 3], rings[k + 1][s], rings[k + 1][(s + 1) % 3], x, z);
    });
    const tip = this.vert(lx, path[path.length - 1][1] - r0 * 2, lz, c);
    const last = rings[rings.length - 1];
    for (let s = 0; s < 3; s++) this.tri(last[s], last[(s + 1) % 3], tip, lx, lz);
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function rockGeometry(rim: Rim, ground: string, seed: number, low: boolean) {
  const b = new Builder();
  const { pts, normals, cx, cz, radius } = rim;
  const n = pts.length;
  const H = radius * DEPTH;
  const c = new Color();
  const grass = new Color(ground);
  const grassDark = grass.clone().multiplyScalar(0.62);
  const soil = new Color('#4e3a26');
  // Grassy lip: a skirt of turf curling over the edge with a ragged fringe hanging under it.
  const lipRows: [number, number, (i: number) => Color][] = [
    [-0.08, 0.03, () => grass],
    [0.45, 0.0, () => grass],
    [0.72, -0.24, (i) => c.copy(grass).lerp(grassDark, 0.4 + 0.2 * noise(seed + i))],
  ];
  const lip = lipRows.map(([off, y, col]) => pts.map(([x, z], i) => b.vert(x + normals[i][0] * off, y, z + normals[i][1] * off, col(i))));
  lip.push(pts.map(([x, z], i) => {
    // Alternate long and short points so the fringe hangs like turf, not a clean hem.
    const hang = 0.4 + (i % 2) * 0.25 + noise(seed * 3 + i) * 0.45;
    return b.vert(x + normals[i][0] * 0.68, -0.24 - hang, z + normals[i][1] * 0.68, c.copy(grassDark).lerp(soil, 0.55));
  }));
  b.rings(lip, cx, cz);

  // The rock: rings stepping down and in, with ridges running down it and ledges across it.
  const RINGS = low ? 11 : 20;
  const rockAt = (i: number, t: number): [number, number, number] => {
    const [x, z] = pts[i];
    const ridge = (vnoise(i / 3 + t * 1.5, seed * 31) - 0.5) * 0.7 + (vnoise(i / 8 + t * 4, seed * 37 + 50) - 0.5) * 0.5;
    const ledge = (t * 7 + vnoise(i / 10, seed * 41) * 0.6) % 1;
    // Down the cliff, crags and ledges stand out in world units; buttresses jut out past the grass lip in places, so
    // even from overhead the rock shows under the edge. Below the cliff they scale with the narrowing rock.
    const cliff = Math.min(1, t / CLIFF);
    const buttress = Math.max(0, vnoise(i / 4, seed * 47) - 0.45) * 4.5 * Math.sin(Math.PI * Math.min(1, t / 0.3));
    const off = 0.5 + buttress + (ridge * 0.8 + ledge * 0.6) * cliff;
    const below = Math.min(1, Math.max(0, (t - CLIFF) / 0.15));
    const s = taper(t) * (1 + (ridge * 0.09 + ledge * 0.03) * below);
    const px = x + normals[i][0] * off - cx, pz = z + normals[i][1] * off - cz;
    const y = ROCK_TOP - H * t + (noise(seed * 7 + i * 13 + t * 97) - 0.5) * (H / RINGS) * 0.5 * Math.min(1, t * 8);
    return [cx + px * s, y, cz + pz * s];
  };
  const rock: number[][] = [];
  for (let j = 0; j < RINGS; j++) {
    // Rings bunch up near the top, where the cliff shows from the map camera.
    const t = Math.pow(j / RINGS, 1.35);
    rock.push(pts.map((_, i) => {
      const [x, y, z] = rockAt(i, t);
      // Bands tilt a little round the island, and every face is a shade off its neighbour.
      strata(t + (vnoise(i / 12, seed * 43) - 0.5) * 0.05, c).multiplyScalar(0.84 + noise(seed * 5 + i * 7 + j * 3) * 0.3);
      if (j === 0) c.lerp(soil, 0.6);
      return b.vert(x, y, z, c);
    }));
  }
  b.rings(rock, cx, cz);
  // Close it off at a point, a little off-centre like a real crag.
  const tip = b.vert(cx + (noise(seed) - 0.5) * radius * 0.15, ROCK_TOP - H * 1.06, cz + (noise(seed + 1) - 0.5) * radius * 0.15, strata(1, c));
  const lastRing = rock[rock.length - 1];
  for (let i = 0; i < n; i++) b.tri(lastRing[i], lastRing[(i + 1) % n], tip, cx, cz);

  // Roots and vines: hanging off the lip all round, and a few long ones trailing from the underside.
  const root = new Color('#4a3424');
  const vine = grass.clone().multiplyScalar(0.55);
  const ROOTS = low ? 14 : 44;
  for (let k = 0; k < ROOTS; k++) {
    const i = Math.floor(noise(seed * 13 + k * 1.7) * n);
    const deep = k % 4 === 3;
    const t = deep ? 0.25 + noise(seed + k * 5) * 0.55 : 0;
    const [sx, sy, sz] = deep ? rockAt(i, t) : [pts[i][0] + normals[i][0] * 0.62, -0.5, pts[i][1] + normals[i][1] * 0.62];
    const len = deep ? 4 + noise(seed * 3 + k) * 7 : 1.2 + noise(seed * 3 + k) * 3.2;
    const segs = low ? 3 : 5;
    const sway = noise(seed * 17 + k) * Math.PI * 2;
    const path: [number, number, number][] = [];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const curl = Math.sin(u * 3 + sway) * 0.25 * len * 0.15;
      path.push([sx + normals[i][0] * (0.15 * u + curl), sy - len * u, sz + normals[i][1] * (0.15 * u + curl)]);
    }
    b.strand(path, deep ? 0.14 : 0.07 + noise(k) * 0.04, k % 3 === 1 ? vine : root);
  }

  // Loose chunks: little floating islets of their own, grass on top, rock tapering beneath.
  const CHUNKS = low ? 4 : 8;
  for (let k = 0; k < CHUNKS; k++) {
    const i = Math.floor(((k + noise(seed * 19 + k) * 0.6) / CHUNKS) * n) % n;
    const out = 2.5 + noise(seed * 23 + k) * 6;
    const px = pts[i][0] + normals[i][0] * out, pz = pts[i][1] + normals[i][1] * out;
    const y = -1.5 - noise(seed * 29 + k) * 8;
    const r = 0.7 + noise(seed * 31 + k) * 1.7;
    chunk(b, px, y, pz, r, grass, seed + k * 101, low);
  }
  return b.geometry();
}

/** One floating islet: a grassed cap and a small crag under it, with a bush on the bigger ones. */
function chunk(b: Builder, x: number, y: number, z: number, r: number, grass: Color, seed: number, low: boolean) {
  const m = low ? 7 : 10;
  const c = new Color();
  const radii = Array.from({ length: m }, (_, i) => r * (0.75 + noise(seed + i) * 0.45));
  const ring = (dy: number, s: number, col: (i: number) => Color) =>
    radii.map((rr, i) => {
      const a = (i / m) * Math.PI * 2;
      return b.vert(x + Math.cos(a) * rr * s, y + dy, z + Math.sin(a) * rr * s, col(i));
    });
  const top = ring(0, 1, () => grass);
  const centre = b.vert(x, y + 0.05, z, grass);
  for (let i = 0; i < m; i++) b.tri(top[i], top[(i + 1) % m], centre, x, z);
  // Cap faces up: fix its winding (the outward rule above does not apply to a flat lid).
  const capStart = b.idx.length - m * 3;
  for (let k = capStart; k < b.idx.length; k += 3) {
    const [a1, b1, c1] = [b.idx[k], b.idx[k + 1], b.idx[k + 2]];
    const p = b.pos;
    const ux = p[b1 * 3] - p[a1 * 3], uz = p[b1 * 3 + 2] - p[a1 * 3 + 2], vx = p[c1 * 3] - p[a1 * 3], vz = p[c1 * 3 + 2] - p[a1 * 3 + 2];
    if (uz * vx - ux * vz < 0) { b.idx[k + 1] = c1; b.idx[k + 2] = b1; }
  }
  const rings = [
    top,
    ring(-0.2, 1.05, () => c.copy(grass).multiplyScalar(0.7)),
    ring(-r * 0.4, 0.95, (i) => strata(0.06 + noise(seed + i * 3) * 0.05, c)),
    ring(-r * 1.0, 0.68, (i) => strata(0.25 + noise(seed + i * 5) * 0.1, c)),
    ring(-r * 1.6, 0.32, (i) => strata(0.6, c).multiplyScalar(0.9 + noise(seed + i) * 0.2)),
  ];
  b.rings(rings, x, z);
  const tip = b.vert(x + (noise(seed + 9) - 0.5) * r * 0.4, y - r * 2.2, z, strata(0.9, c));
  const last = rings[rings.length - 1];
  for (let i = 0; i < m; i++) b.tri(last[i], last[(i + 1) % m], tip, x, z);
  if (r > 1.4) {
    // A bush: a squat cone of leaves.
    const leaf = c.copy(grass).multiplyScalar(0.6).clone();
    const bx = x + (noise(seed + 4) - 0.5) * r * 0.5, bz = z + (noise(seed + 5) - 0.5) * r * 0.5;
    const base = Array.from({ length: 6 }, (_, i) => b.vert(bx + Math.cos((i / 6) * Math.PI * 2) * 0.55, y + 0.15, bz + Math.sin((i / 6) * Math.PI * 2) * 0.55, leaf));
    const apex = b.vert(bx, y + 1.3, bz, leaf.clone().multiplyScalar(1.25));
    for (let i = 0; i < 6; i++) b.tri(base[i], base[(i + 1) % 6], apex, bx, bz);
  }
}

/* ---------- Clouds ---------- */

/**
 * Puffs: camera-facing soft discs, one quad each, all in one geometry. aPuff = size, seed, drift speed, opacity.
 * They drift east and wrap round the island, fading out at the far end and back in at the near one.
 */
const PUFF_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWrap;
  attribute vec2 aCorner;
  attribute vec4 aPuff;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vec3 c = position;
    float size = aPuff.x, seed = aPuff.y;
    float x = mod(c.x - uWrap.x + uTime * aPuff.z + uWrap.y, 2.0 * uWrap.y) - uWrap.y;
    float alpha = aPuff.w * (1.0 - smoothstep(uWrap.y * 0.7, uWrap.y, abs(x)));
    c.x = uWrap.x + x;
    // A slow swell, so a cloud is never quite still.
    size *= 1.0 + 0.06 * sin(uTime * 0.25 + seed * 20.0);
    vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
    mvPosition.xy += aCorner * size;
    vUv = aCorner;
    vAlpha = alpha;
    vSeed = seed;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const PUFF_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uShade;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    float a = atan(vUv.y, vUv.x);
    // Lumpy rim, so a puff is a cloud and not a coin.
    float d = length(vUv) * (1.0 + 0.1 * sin(a * 5.0 + vSeed * 40.0) + 0.06 * sin(a * 9.0 - vSeed * 23.0));
    float m = 1.0 - smoothstep(0.3, 1.0, d);
    float alpha = m * m * vAlpha;
    if (alpha < 0.01) discard;
    // Sunlit in the middle and top, shaded round the bottom edge.
    vec3 col = mix(uShade, uTop, clamp(1.1 - d * d + vUv.y * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

interface Puff { x: number; y: number; z: number; size: number; speed: number; alpha: number; seed: number }

function cloudPuffs(rim: Rim, seed: number, low: boolean): Puff[] {
  const { pts, normals, cx, cz } = rim;
  const n = pts.length;
  const puffs: Puff[] = [];
  const q = low ? 0.5 : 1;
  // Three layers: wisps tucked under the coast, a ring further down, and a deep broad bank. Each cloud is a
  // cluster of a few puffs, sized so the layers stay thin: big soft quads stacked over the screen cost phones dearly.
  const layers = [
    { y: -8, clusters: Math.round(13 * q), per: 3, size: [1.4, 2.6], out: (i: number, k: number): P2 => {
      const o = 1.2 + noise(seed * 3 + k) * 4;
      return [pts[i][0] + normals[i][0] * o, pts[i][1] + normals[i][1] * o];
    }, speed: 0.22, alpha: 0.7 },
    { y: -17, clusters: Math.round(9 * q), per: 4, size: [2.4, 4], out: (i: number, k: number): P2 => {
      const s = 0.85 + noise(seed * 7 + k) * 0.55;
      return [cx + (pts[i][0] - cx) * s, cz + (pts[i][1] - cz) * s];
    }, speed: 0.16, alpha: 0.65 },
    { y: -30, clusters: Math.round(8 * q), per: 4, size: [3.5, 6], out: (i: number, k: number): P2 => {
      const s = 0.6 + noise(seed * 9 + k) * 1.1;
      return [cx + (pts[i][0] - cx) * s, cz + (pts[i][1] - cz) * s];
    }, speed: 0.1, alpha: 0.8 },
  ];
  layers.forEach((L, li) => {
    for (let k = 0; k < L.clusters; k++) {
      const i = Math.floor(((k + noise(seed * 37 + li * 11 + k)) / L.clusters) * n) % n;
      const [x, z] = L.out(i, k + li * 50);
      for (let p = 0; p < L.per; p++) {
        const r = noise(seed * 41 + li * 7 + k * 5 + p);
        const size = L.size[0] + (L.size[1] - L.size[0]) * r;
        puffs.push({
          x: x + (noise(seed * 43 + k * 3 + p + li) - 0.5) * size * 2.2,
          y: L.y + (noise(seed * 47 + k + p * 3 + li) - 0.5) * 2,
          z: z + (noise(seed * 53 + k * 7 + p + li) - 0.5) * size * 1.4,
          size, speed: L.speed, alpha: L.alpha, seed: noise(seed * 59 + k * 13 + p + li),
        });
      }
    }
  });
  return puffs;
}

function puffGeometry(puffs: Puff[]) {
  const pos: number[] = [], corner: number[] = [], info: number[] = [], idx: number[] = [];
  puffs.forEach((p, i) => {
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(p.x, p.y, p.z);
      corner.push(u, v);
      info.push(p.size, p.seed, p.speed, p.alpha);
    }
    const a = i * 4;
    idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
  g.setAttribute('aPuff', new Float32BufferAttribute(info, 4));
  g.setIndex(idx);
  // The puffs move in the shader and are pulled out to their size there, so the mesh is never culled (Clouds).
  return g;
}

const CLOUD_TOP = new Color('#ffffff');
const CLOUD_SHADE = new Color('#a9b8c9');
const NIGHT_CLOUD = new Color('#56688f');

function Clouds({ rim, seed, low }: { rim: Rim; seed: number; low: boolean }) {
  const geo = useMemo(() => puffGeometry(cloudPuffs(rim, seed, low)), [rim, seed, low]);
  const mat = useMemo(
    () => new ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG,
      uniforms: UniformsUtils.merge([UniformsLib.fog, {
        uTime: { value: 0 },
        uWrap: { value: new Vector2(0, 1) },
        uTop: { value: new Color() },
        uShade: { value: new Color() },
      }]),
      transparent: true,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    }),
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    (mat.uniforms.uWrap.value as Vector2).set(rim.cx, rim.radius * 1.9);
  }, [mat, rim]);
  useFrame(({ clock, scene }) => {
    const u = mat.uniforms;
    u.uTime.value = clock.elapsedTime;
    // Clouds take the sky's light: white by day, moonlit blue-grey at night, greyed or dusted by the weather.
    const bg = scene.background as Color | null;
    const k = bg?.isColor ? skyLight(bg) : 1;
    const top = u.uTop.value as Color, shade = u.uShade.value as Color;
    top.copy(CLOUD_TOP).lerp(NIGHT_CLOUD, 1 - k);
    shade.copy(CLOUD_SHADE).lerp(NIGHT_CLOUD, 1 - k).multiplyScalar(0.75 + 0.25 * k);
    if (bg?.isColor) {
      top.lerp(bg, 0.12);
      shade.lerp(bg, 0.3);
    }
  });
  // Drawn first of everything see-through: they are the furthest thing down, under the sea's ads and the weather.
  return <mesh geometry={geo} material={mat} renderOrder={-1} frustumCulled={false} raycast={() => null} />;
}

/* ---------- The island ---------- */

/** One material for every rock, lip, root and chunk: colour comes from the vertices, facets from flat shading. */
const rockMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });

export function IslandBase({ map, ground = '#9fbf5a', seed = 1 }: { map: CityMap; ground?: string; seed?: number }) {
  const low = useLowPerf();
  const rim = useMemo(() => rimOf(map.outline, low ? 64 : 120), [map, low]);
  const rock = useMemo(() => rockGeometry(rim, ground, seed, low), [rim, ground, seed, low]);
  useEffect(() => () => rock.dispose(), [rock]);
  return (
    <group>
      <mesh geometry={rock} material={rockMat} raycast={() => null} />
      <Clouds rim={rim} seed={seed} low={low} />
    </group>
  );
}
