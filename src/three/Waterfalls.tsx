// Water pouring off the island: where the river reaches the coast it runs on over the lip and falls away in a long
// arc, and a few springs spill out of the cliff face. Every fall is one curved ribbon in one merged mesh, drawn by a
// small shader that scrolls white streaks down it, foams at the lip and thins to nothing; the mist at the bottom is
// drawn with the clouds (IslandBase), so the water fades into them.
//
// The map camera looks almost straight down from the south, so a sheet hanging straight down would be seen edge on.
// Each fall leaves the lip moving outwards and drops along a parabola, which from above reads as a white jet
// reaching out from the coast and fading into the clouds.

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import type { CityMap, P2 } from '../game/city';
import { nearestRim, noise, rayToCoast, type Rim } from './islandShape';

export interface Fall {
  /** Where the water leaves the island, and the outward direction it leaves in. */
  lip: [number, number, number];
  out: P2;
  /** For a river: the river's last drawn point, so the flow runs on from it to the lip. */
  from?: P2;
  width: number;
  drop: number;
  reach: number;
  seed: number;
}

/** Where the bottom of a fall is: the mist and a bank of cloud gather there. */
export const fallBase = (f: Fall): [number, number, number] => [f.lip[0] + f.out[0] * f.reach, f.lip[1] - f.drop, f.lip[2] + f.out[1] * f.reach];

/** River mouths at the coast, plus a couple of springs on the cliffs the camera faces (south). Deterministic per city. */
export function planFalls(map: CityMap, rim: Rim, seed: number): Fall[] {
  const falls: Fall[] = [];
  const path = map.riverDraw;
  if (path.length > 2) {
    for (const [end, prev] of [[path[0], path[1]], [path[path.length - 1], path[path.length - 2]]] as const) {
      let dx = end[0] - prev[0], dz = end[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // Only where the river really runs off the edge: the drawn river stops a step short of the coast.
      const hit = rayToCoast(map.outline, end[0], end[1], dx, dz);
      if (hit === null || hit > 3) continue;
      const lx = end[0] + dx * hit, lz = end[1] + dz * hit;
      const [nx, nz] = rim.normals[nearestRim(rim, lx, lz)];
      // Leaves partly the way the river was going, mostly straight out from the coast.
      let ox = nx + dx * 0.5, oz = nz + dz * 0.5;
      const ol = Math.hypot(ox, oz) || 1;
      ox /= ol;
      oz /= ol;
      const width = map.riverHalf * 2;
      falls.push({ lip: [lx, 0.045, lz], out: [ox, oz], from: end, width, drop: 24 + width * 2, reach: 3.5 + width, seed: seed + falls.length * 7.3 });
    }
  }
  // Springs: on cliffs facing the camera, clear of the river falls and of each other.
  const want = falls.length + (falls.length ? 2 : 3);
  const n = rim.pts.length;
  for (let k = 0; k < 60 && falls.length < want; k++) {
    const i = Math.floor(noise(seed * 11 + k * 3.7) * n);
    const [nx, nz] = rim.normals[i];
    if (nz < 0.45) continue;
    const [px, pz] = rim.pts[i];
    if (falls.some((f) => Math.hypot(f.lip[0] - px, f.lip[2] - pz) < 14)) continue;
    const width = 0.8 + noise(seed * 5 + k) * 0.6;
    falls.push({ lip: [px + nx * 0.7, -1.05, pz + nz * 0.7], out: [nx, nz], width, drop: 15 + noise(seed * 9 + k) * 6, reach: 2 + width, seed: seed + k * 3.1 + 40 });
  }
  return falls;
}

/**
 * One ribbon per fall, all merged into one geometry. Each vertex sits on the fall's centre line and is pushed out to
 * the side in the shader: flat along the ground on the run to the lip, then turning to face the camera as it drops,
 * so a fall seen from straight above still shows as a full sheet rather than a line.
 * aTan: direction of flow. aSide: x, y the flat sideways direction (x, z), z how far to the side in world units.
 * aFlow: x across in world units, y flow time (so streaks speed up as they fall without smearing), z alpha.
 * aFall: x how far down the fall (0 at the lip, 1 at the bottom), y distance from the lip, z seed, w across (-1..1).
 */
function fallsGeometry(falls: Fall[], low: boolean) {
  const pos: number[] = [], tan: number[] = [], side: number[] = [], flow: number[] = [], info: number[] = [], idx: number[] = [];
  const ROWS = low ? 12 : 26;
  const COLS = low ? 2 : 4;
  let widest = 0;
  for (const f of falls) {
    const [ox, oz] = f.out;
    // The spine: [x, y, z, sideways x, z, drop fraction]
    const spine: number[][] = [];
    if (f.from) {
      // The river runs on over the ground to the lip, then a short way past it over the grass edge.
      const [ex, ez] = f.from;
      const rx = f.lip[0] - ex, rz = f.lip[2] - ez;
      const rl = Math.hypot(rx, rz) || 1;
      spine.push([ex, f.lip[1], ez, -rz / rl, rx / rl, 0]);
      spine.push([f.lip[0], f.lip[1], f.lip[2], -oz, ox, 0]);
    }
    const start: [number, number, number] = f.from ? [f.lip[0] + ox * 0.6, f.lip[1] - 0.02, f.lip[2] + oz * 0.6] : f.lip;
    for (let k = 0; k <= ROWS; k++) {
      // Rows bunch up at the top, where the water curls over the lip.
      const t = Math.pow(k / ROWS, 1.3);
      spine.push([start[0] + ox * f.reach * t, start[1] - f.drop * t * t, start[2] + oz * f.reach * t, -oz, ox, t]);
    }
    // Distance along the spine, and flow time: water speeds up as it falls, so streaks stretch lower down.
    const cum = [0];
    for (let r = 1; r < spine.length; r++) {
      const p = spine[r], q = spine[r - 1];
      cum.push(cum[r - 1] + Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    }
    const sLip = cum[f.from ? 2 : 0];
    let phi = 0;
    const base = pos.length / 3;
    spine.forEach((p, r) => {
      const s = cum[r];
      if (r > 0) phi += (s - cum[r - 1]) / (1.2 + Math.sqrt(2 * 9.8 * Math.max(0, start[1] - p[1])) * 0.35);
      const a = spine[Math.max(0, r - 1)], b = spine[Math.min(spine.length - 1, r + 1)];
      // Spreads a little as it falls.
      const half = (f.width / 2) * (1 + 0.35 * p[5]);
      widest = Math.max(widest, half);
      // The flat run fades in where it takes over from the drawn river.
      const fadeIn = f.from ? Math.min(1, s / 0.8) : 1;
      for (let c = 0; c <= COLS; c++) {
        const v = (c / COLS) * 2 - 1;
        pos.push(p[0], p[1], p[2]);
        tan.push(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        side.push(p[3], p[4], v * half);
        flow.push(v * half, phi, fadeIn);
        info.push(p[5], s - sLip, f.seed, v);
      }
      if (r > 0) {
        const i = base + (r - 1) * (COLS + 1), j = base + r * (COLS + 1);
        for (let c = 0; c < COLS; c++) idx.push(i + c, j + c, i + c + 1, i + c + 1, j + c, j + c + 1);
      }
    });
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aTan', new Float32BufferAttribute(tan, 3));
  g.setAttribute('aSide', new Float32BufferAttribute(side, 3));
  g.setAttribute('aFlow', new Float32BufferAttribute(flow, 3));
  g.setAttribute('aFall', new Float32BufferAttribute(info, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // The sides are pushed out in the shader, past the centre lines the bounds were taken from.
  if (g.boundingSphere) g.boundingSphere.radius += widest;
  return g;
}

const VERT = /* glsl */ `
  attribute vec3 aTan;
  attribute vec3 aSide;
  attribute vec3 aFlow;
  attribute vec4 aFall;
  varying vec3 vFlow;
  varying vec4 vFall;
  #include <fog_pars_vertex>
  void main() {
    vFlow = aFlow;
    vFall = aFall;
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 flatSide = vec3(aSide.x, 0.0, aSide.y);
    // Once it is falling, the sheet turns about its centre line to face the camera.
    vec3 camSide = cross(normalize(aTan), normalize(cameraPosition - world));
    float l = length(camSide);
    camSide = l > 0.001 ? camSide / l : flatSide;
    if (dot(camSide, flatSide) < 0.0) camSide = -camSide;
    vec3 dir = normalize(mix(flatSide, camSide, smoothstep(0.0, 0.25, aFall.x)));
    world += dir * aSide.z;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uWater;
  uniform vec3 uFoam;
  varying vec3 vFlow;
  varying vec4 vFall;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float f = vFall.x, lip = vFall.y, seed = vFall.z, v = vFall.w;
    // Streaks: fine across the sheet, long down it, scrolled by flow time so they race down the fall.
    vec2 q = vec2(vFlow.x * 2.4 + seed * 17.0, vFlow.y * 2.2 - uTime * 1.3);
    float n = vnoise(q) * 0.65 + vnoise(q * vec2(2.1, 1.7) + 7.0) * 0.35;
    float streak = smoothstep(0.4, 0.8, n);
    // The core tapers as it falls: ragged edges eat in from both sides.
    float edgeN = vnoise(vec2(vFlow.y * 1.5 - uTime * 0.8, seed * 5.0 + sign(v) * 3.0));
    float halfW = 1.0 - 0.55 * f;
    float edge = 1.0 - smoothstep(halfW - 0.3 - 0.25 * edgeN, halfW, abs(v));
    // Lower down the sheet breaks into strands, then spray, then nothing.
    float body = smoothstep(f * 0.85 - 0.1, f * 0.85 + 0.3, n + 0.2);
    float fade = 1.0 - smoothstep(0.5, 1.0, f);
    float foam = exp(-abs(lip) * 1.4) * (0.55 + 0.45 * n);
    float falling = smoothstep(-0.3, 0.5, lip);
    vec3 col = mix(uWater, uFoam, clamp(mix(streak * 0.35, 0.55 + 0.45 * streak, falling) + foam, 0.0, 1.0));
    float a = edge * vFlow.z * mix(0.92, body * fade * (0.8 + 0.2 * streak), falling);
    a = max(a, foam * edge * vFlow.z * 0.9);
    if (a < 0.06) discard;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

/** River water colour per city, for the run up to the lip; the falling sheet is mostly white. */
const WATER: Record<string, string> = { lagos: '#4f9ab8' };
const MUDDY = '#8a7d5e';

export function Waterfalls({ falls, city, low }: { falls: Fall[]; city: string; low: boolean }) {
  const geo = useMemo(() => fallsGeometry(falls, low), [falls, low]);
  const mat = useMemo(
    () => new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uWater: { value: new Color() }, uFoam: { value: new Color() } }]),
      transparent: true,
      // Writes depth where the water is solid, so the clouds behind a fall stay behind it.
      depthWrite: true,
      side: 2,
      fog: true,
      toneMapped: false,
    }),
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  const water = useMemo(() => new Color(WATER[city] ?? MUDDY), [city]);
  const white = useMemo(() => new Color('#f4fbff'), []);
  useFrame(({ clock, scene }) => {
    const u = mat.uniforms;
    u.uTime.value = clock.elapsedTime;
    // Lit like the sky it falls through: bright by day, moonlit grey-blue at night, greyed by the weather.
    const bg = scene.background as Color | null;
    const k = bg?.isColor ? skyLight(bg) : 1;
    (u.uFoam.value as Color).copy(white).lerp(NIGHT_TINT, (1 - k) * 0.5).multiplyScalar(0.25 + 0.75 * k);
    (u.uWater.value as Color).copy(water).multiplyScalar(0.3 + 0.7 * k);
  });
  if (!falls.length) return null;
  return <mesh geometry={geo} material={mat} renderOrder={-2} raycast={() => null} />;
}

const NIGHT_TINT = new Color('#7d93c4');

/** 0 at night, 1 in daylight, read off the sky colour (three/Scene.tsx), so it follows the weather's greying too. */
export function skyLight(bg: Color) {
  const m = Math.max(bg.r, bg.g, bg.b);
  const t = Math.min(1, Math.max(0, (m - 0.03) / 0.55));
  return t * t * (3 - 2 * t);
}
