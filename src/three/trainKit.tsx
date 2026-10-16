// The Nigerian Railway train, built in code like the place models (placeKit.tsx): the Chinese-built standard-gauge
// stock that runs Abuja – Kaduna and Lagos – Ibadan, in the railway's white, green and yellow, behind a green diesel
// with a yellow nose. Used on the city map (StationModel), at the station's platform (StationPlatform) and outside your
// coach on a ride (TrainRide).
//
// A train is built along x with the nose of its diesel at x = 0 and the coaches trailing towards -x, the tops of the
// rails at y = 0. At scale 1 a car is 1.8 wide: a coach at the station's platform. Every plain colour is merged into one
// vertex-coloured mesh; the window panes ('glass') share the city's window material, so they light one by one at night
// (cityModels.tsx windowMat, a seed per pane), and the lamps ('lamp') the street lamps', so the headlights come on with
// them. Three meshes a train, and the beam of its headlights after dark.

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Color, Matrix4, MeshStandardMaterial, Vector3, type Group, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Glow, Kit, NightGlow, unitCyl, type RGB, type V3 } from './placeKit';
import { lampMat, windowMat } from './nightMats';

export const RAIL_WHITE = '#f4f6f8';
export const RAIL_GREEN = '#0f7a3a';
export const RAIL_YELLOW = '#f5c400';
const GREEN_DARK = '#0b5a2b';
const DARK = '#1c2026';
const STEEL = '#3a414b';
const WHEEL = '#2b2f36';
const ROOF = '#c5ccd4';
const ROOF_DARK = '#9aa3ad';
const SURROUND = '#18202a';
const DOOR = '#dde3ea';
const RAIL_SILVER = '#d7dde4';
const SCREEN = '#22303f';
const BEAM: RGB = [0.95, 0.82, 0.55];

/** Where the car body starts above the rails, and how tall and wide it is, at scale 1. */
const BODY_Y = 0.98;
const BODY_H = 2.0;
const CAR_W = 1.8;
const GAUGE = 0.72;

const WHEEL_DISC = unitCyl(12, 1);

/** A wheel: a disc standing across the track (its axle along z). */
function wheel(k: Kit, x: number, z: number, r: number) {
  k.shape(WHEEL, WHEEL_DISC, [x, r, z], [r, 0.09, r], [Math.PI / 2, 0, 0]);
  k.shape(STEEL, WHEEL_DISC, [x, r, z + Math.sign(z) * 0.05], [r * 0.45, 0.04, r * 0.45], [Math.PI / 2, 0, 0]);
}

/** A bogie at `x`: its frame, side frames with springs, and `axles` wheelsets on both rails. */
function bogie(k: Kit, x: number, axles: number, low: boolean) {
  const span = axles === 3 ? 0.78 : 1.1;
  k.box(DARK, [x, 0.52, 0], [axles === 3 ? 2.3 : 2.0, 0.22, 1.2]);
  for (const s of [-1, 1]) {
    k.box(STEEL, [x, 0.42, s * (GAUGE + 0.08)], [axles === 3 ? 2.4 : 2.1, 0.2, 0.08]);
    if (!low) for (const dx of [-0.35, 0.35]) k.box('#565e69', [x + dx, 0.62, s * (GAUGE + 0.08)], [0.16, 0.18, 0.1]);
  }
  for (let i = 0; i < axles; i++) {
    const wx = x + (axles === 1 ? 0 : -span + (i * 2 * span) / (axles - 1)) * (axles === 3 ? 1 : 0.5);
    for (const s of [-1, 1]) wheel(k, wx, s * GAUGE, 0.32);
  }
}

/**
 * Digits made of bars, like a painted number: `text` (digits only), `h` tall, starting at `p` (its left end as you face
 * it), on a face looking along `out` (one of ±x, ±z), so it reads the right way round from that side.
 */
function number(k: Kit, colour: string, text: string, p: V3, h: number, out: V3) {
  const W = h * 0.55, t = h * 0.13;
  // Reading direction on that face: to your right as you look at it.
  const right: V3 = out[2] > 0 ? [1, 0, 0] : out[2] < 0 ? [-1, 0, 0] : out[0] > 0 ? [0, 0, -1] : [0, 0, 1];
  const along = Math.abs(right[0]) > 0;
  const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
  [...text].forEach((ch, i) => {
    const u0 = i * (W + t * 1.6);
    const segs: Record<string, [number, number, number, number]> = {
      a: [u0 + W / 2, h, W, t], g: [u0 + W / 2, h / 2, W, t], d: [u0 + W / 2, 0, W, t],
      f: [u0, h * 0.75, t, h / 2], b: [u0 + W, h * 0.75, t, h / 2], e: [u0, h * 0.25, t, h / 2], c: [u0 + W, h * 0.25, t, h / 2],
    };
    for (const sg of SEG[ch] ?? '') {
      const [u, v, su, sv] = segs[sg];
      const c: V3 = [p[0] + right[0] * u + out[0] * 0.006, p[1] + v, p[2] + right[2] * u + out[2] * 0.006];
      k.box(colour, c, along ? [su, sv, 0.012] : [0.012, sv, su]);
    }
  });
}

/**
 * A passenger coach of length `len`, centred on `x`: white, a green skirt under a yellow line, a green pinstripe over the
 * windows, a dark band with separate panes in it, a door near each end of each side, air-conditioning pods on the roof,
 * gangway bellows at both ends, couplers, and two bogies.
 */
export function coach(k: Kit, x: number, len: number, opts: { low?: boolean; no?: string } = {}) {
  const low = !!opts.low;
  const top = BODY_Y + BODY_H;
  for (const s of [-1, 1]) bogie(k, x + s * (len / 2 - 1.4), 2, low);
  k.box(DARK, [x, 0.82, 0], [len - 0.7, 0.3, 1.5]);
  if (!low) for (const dx of [-0.9, 0.8]) k.box(STEEL, [x + dx, 0.7, 0], [1.1, 0.34, 1.1]);
  k.box(RAIL_WHITE, [x, BODY_Y + BODY_H / 2, 0], [len, BODY_H, CAR_W]);
  // Livery: the green skirt, the yellow line over it, a green pinstripe high up
  k.box(RAIL_GREEN, [x, BODY_Y + 0.22, 0], [len + 0.01, 0.44, CAR_W + 0.02]);
  k.box(RAIL_YELLOW, [x, BODY_Y + 0.48, 0], [len + 0.01, 0.07, CAR_W + 0.03]);
  k.box(RAIL_GREEN, [x, BODY_Y + 1.62, 0], [len + 0.01, 0.05, CAR_W + 0.02]);
  // The window band, and a pane in it every metre, each its own window at night
  const band = len - 2.6;
  k.box(SURROUND, [x, BODY_Y + 1.13, 0], [band, 0.66, CAR_W + 0.015]);
  const panes = Math.max(2, Math.round(band / 1.0));
  for (let i = 0; i < panes; i++) {
    const px = x - band / 2 + (i + 0.5) * (band / panes);
    for (const s of [-1, 1]) k.box('glass', [px, BODY_Y + 1.13, s * (CAR_W / 2 + 0.012)], [band / panes - 0.16, 0.5, 0.02]);
  }
  // Doors near each end: a lighter leaf pair with a window in each, a dark edge and grab rails
  for (const e of [-1, 1]) {
    const dx = x + e * (len / 2 - 0.72);
    k.box(DOOR, [dx, BODY_Y + 0.92, 0], [0.78, 1.66, CAR_W + 0.022]);
    k.box(SURROUND, [dx, BODY_Y + 0.92, 0], [0.02, 1.66, CAR_W + 0.03]);
    for (const s of [-1, 1]) {
      for (const leaf of [-0.19, 0.19]) k.box('glass', [dx + leaf, BODY_Y + 1.3, s * (CAR_W / 2 + 0.016)], [0.24, 0.42, 0.02]);
      if (!low) k.box('#9aa3ad', [dx + e * 0.47, BODY_Y + 0.8, s * (CAR_W / 2 + 0.03)], [0.03, 0.7, 0.03]);
    }
    k.box(RAIL_YELLOW, [dx, BODY_Y + 0.06, 0], [0.8, 0.05, CAR_W + 0.04]);
  }
  // The coach's number, by the door
  if (opts.no && !low) for (const s of [-1, 1]) number(k, GREEN_DARK, opts.no, [x + s * (len / 2 - 2.4), BODY_Y + 1.7, s * (CAR_W / 2 + 0.01)], 0.18, [0, 0, s]);
  // Roof: a curved crown, and two air-conditioning pods with their grilles
  k.box(ROOF, [x, top + 0.06, 0], [len - 0.04, 0.12, CAR_W - 0.08]);
  k.box(ROOF, [x, top + 0.15, 0], [len - 0.2, 0.08, CAR_W - 0.5]);
  for (const s of [-1, 1]) {
    const px = x + s * len * 0.27;
    k.box(ROOF_DARK, [px, top + 0.3, 0], [1.3, 0.24, 1.05]);
    if (!low) k.box(DARK, [px, top + 0.43, 0], [1.0, 0.03, 0.75]);
  }
  // Gangway bellows and couplers at both ends
  for (const e of [-1, 1]) {
    k.box('#14171c', [x + e * (len / 2 + 0.11), BODY_Y + 0.98, 0], [0.24, 1.9, 1.25]);
    if (!low) for (const y of [0.4, 0.98, 1.56]) k.box('#262a31', [x + e * (len / 2 + 0.11), BODY_Y + y, 0], [0.26, 0.06, 1.3]);
    k.box(STEEL, [x + e * (len / 2 + 0.1), 0.86, 0], [0.3, 0.14, 0.22]);
  }
}

/**
 * The diesel, `len` long, centred on `x`, its cab at the +x end: a long green hood with walkways and handrails either
 * side, grilles, radiator fans and an exhaust stack on top, a cab with side windows and a windscreen leaning back over a
 * yellow nose, headlamps and marker lights, horns on the cab roof, a number on each side and on the nose, a buffer
 * beam and a coupler, a fuel tank slung between two three-axle bogies.
 */
export function loco(k: Kit, x: number, len: number, opts: { low?: boolean; no?: string } = {}, glow?: Glow) {
  const low = !!opts.low;
  const front = x + len / 2;
  const no = opts.no ?? '2401';
  for (const s of [-1, 1]) bogie(k, x + s * (len / 2 - 1.45), 3, low);
  k.box(STEEL, [x, 0.66, 0], [2.0, 0.5, 1.35]);
  k.box(DARK, [x, BODY_Y - 0.06, 0], [len, 0.14, CAR_W + 0.06]);
  k.box(RAIL_YELLOW, [x, BODY_Y - 0.06, 0], [len + 0.01, 0.04, CAR_W + 0.08]);
  // The long hood behind the cab
  const hoodLen = len - 2.0;
  const hx = front - 2.0 - hoodLen / 2;
  k.box(RAIL_GREEN, [hx, BODY_Y + 0.9, 0], [hoodLen, 1.8, 1.5]);
  k.box(RAIL_WHITE, [hx, BODY_Y + 0.45, 0], [hoodLen + 0.01, 0.36, 1.52]);
  k.box(RAIL_YELLOW, [hx, BODY_Y + 0.23, 0], [hoodLen + 0.01, 0.06, 1.53]);
  // Grilles and doors along the hood, fans and the exhaust on top
  for (let i = 0; i < 4; i++) {
    const gx = hx - hoodLen / 2 + 0.55 + i * ((hoodLen - 1.1) / 3);
    k.box(GREEN_DARK, [gx, BODY_Y + 1.2, 0], [0.6, 0.62, 1.52]);
    if (!low) for (let j = 0; j < 4; j++) k.box('#083f1f', [gx, BODY_Y + 0.98 + j * 0.15, 0], [0.56, 0.03, 1.53]);
  }
  for (const fx of [hx - hoodLen * 0.28, hx + hoodLen * 0.05]) {
    k.post(DARK, [fx, BODY_Y + 1.8, 0], 0.32, 0.08, 12);
    if (!low) k.box(STEEL, [fx, BODY_Y + 1.89, 0], [0.62, 0.02, 0.06]);
  }
  k.post(SURROUND, [hx + hoodLen * 0.32, BODY_Y + 1.8, 0], 0.09, 0.32, 8);
  k.box(STEEL, [hx, BODY_Y + 1.84, 0], [hoodLen - 0.4, 0.06, 0.5]);
  // Walkway handrails either side of the hood
  if (!low) for (const s of [-1, 1]) {
    const z = s * (CAR_W / 2 - 0.02);
    k.box('#e5e7eb', [hx, BODY_Y + 0.82, z], [hoodLen, 0.035, 0.035]);
    for (let px = hx - hoodLen / 2 + 0.2; px <= hx + hoodLen / 2; px += 0.8) k.box('#e5e7eb', [px, BODY_Y + 0.41, z], [0.035, 0.82, 0.035]);
  }
  // The cab: green sides with windows, a white band, its roof, horns and a beacon
  const cx = front - 1.25;
  k.box(RAIL_GREEN, [cx, BODY_Y + 1.12, 0], [1.5, 2.24, CAR_W]);
  k.box(RAIL_WHITE, [cx, BODY_Y + 0.45, 0], [1.51, 0.36, CAR_W + 0.01]);
  k.box(RAIL_YELLOW, [cx, BODY_Y + 0.23, 0], [1.51, 0.06, CAR_W + 0.015]);
  for (const s of [-1, 1]) {
    k.box(SURROUND, [cx + 0.05, BODY_Y + 1.6, s * (CAR_W / 2 + 0.005)], [1.0, 0.62, 0.02]);
    k.box('glass', [cx + 0.05, BODY_Y + 1.6, s * (CAR_W / 2 + 0.012)], [0.86, 0.5, 0.02]);
    number(k, RAIL_WHITE, no, [hx - s * 0.75, BODY_Y + 1.12, s * 0.76], 0.26, [0, 0, s]);
  }
  k.box(ROOF, [cx - 0.05, BODY_Y + 2.29, 0], [1.6, 0.1, CAR_W - 0.06]);
  for (const s of [-1, 1]) k.post(RAIL_SILVER, [cx - 0.3, BODY_Y + 2.34, s * 0.22], 0.05, 0.22, 6, 0.4);
  k.box('lamp', [cx + 0.35, BODY_Y + 2.38, 0], [0.12, 0.08, 0.12]);
  // The nose: windscreen leaning back over it, the yellow front, headlamps, markers, buffer beam and coupler
  const nose = front - 0.25;
  k.box(RAIL_YELLOW, [nose, BODY_Y + 0.68, 0], [0.5, 1.36, CAR_W - 0.02]);
  // The windscreen leans back from the top of the nose to the cab roof: a green frame with the dark glass on its face.
  k.box(RAIL_GREEN, [front - 0.62, BODY_Y + 1.82, 0], [0.42, 0.95, CAR_W - 0.04], [0, 0, 0.36]);
  k.box(SCREEN, [front - 0.39, BODY_Y + 1.86, 0], [0.03, 0.7, CAR_W - 0.32], [0, 0, 0.36]);
  k.box(DARK, [front - 0.385, BODY_Y + 1.86, 0], [0.035, 0.7, 0.05], [0, 0, 0.36]);
  number(k, DARK, no, [front, BODY_Y + 1.04, 0.25], 0.15, [1, 0, 0]);
  for (const s of [-1, 1]) {
    k.box(SURROUND, [front + 0.005, BODY_Y + 0.62, s * 0.58], [0.04, 0.24, 0.32]);
    k.box('lamp', [front + 0.02, BODY_Y + 0.62, s * 0.58], [0.03, 0.17, 0.25]);
    k.box('#b91c1c', [front + 0.02, BODY_Y + 0.3, s * 0.72], [0.03, 0.1, 0.12]);
  }
  k.box(DARK, [front + 0.05, 0.86, 0], [0.12, 0.34, CAR_W]);
  if (!low) for (let i = -3; i <= 3; i++) k.box(RAIL_YELLOW, [front + 0.115, 0.86, i * 0.24], [0.01, 0.3, 0.09], [0.6, 0, 0]);
  k.box(STEEL, [front + 0.22, 0.86, 0], [0.3, 0.14, 0.22]);
  k.box(DARK, [front + 0.12, 0.48, 0], [0.2, 0.26, 1.5]);
  // The far end: a short rear cab wall with a window, and its coupler
  const rear = x - len / 2;
  k.box(RAIL_GREEN, [rear + 0.2, BODY_Y + 0.9, 0], [0.4, 1.8, 1.6]);
  k.box(STEEL, [rear - 0.1, 0.86, 0], [0.3, 0.14, 0.22]);
  // The beam of the headlamps on the track ahead, after dark
  if (glow) {
    const y = 0.08;
    glow.quad([front + 0.3, y, -0.6], [front + 0.3, y, 0.6], [front + 5, y, 1.5], [front + 5, y, -1.5], BEAM, BEAM, [0, 0, 0], [0, 0, 0]);
  }
}

export interface TrainBuild { body: BufferGeometry; glass?: BufferGeometry; lamp?: BufferGeometry; glow?: BufferGeometry; length: number }

const _c = new Color();
/** Merges every plain colour of a kit into one geometry, coloured per vertex; glass and lamps stay apart. */
function finish(k: Kit, glow?: Glow): Omit<TrainBuild, 'length'> {
  const parts = k.build();
  const plain: BufferGeometry[] = [];
  let glass: BufferGeometry | undefined, lamp: BufferGeometry | undefined;
  for (const { key, g } of parts) {
    if (key.startsWith('glass')) { glass = g; continue; }
    if (key.startsWith('lamp')) { lamp = g; continue; }
    _c.set(key);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    if (g.getAttribute('seed')) g.deleteAttribute('seed');
    plain.push(g);
  }
  const body = mergeGeometries(plain)!;
  plain.forEach((g) => g.dispose());
  return { body, glass, lamp, glow: glow?.pos.length ? glow.build() : undefined };
}

/** A whole train: the diesel with its nose at x = 0, then `coaches` coaches behind it towards -x. */
export function buildTrain(coaches: number, opts: { low?: boolean; coachLen?: number; locoLen?: number; gap?: number; glow?: boolean } = {}): TrainBuild {
  const k = new Kit();
  const glow = opts.glow ? new Glow() : undefined;
  const coachLen = opts.coachLen ?? 7;
  const locoLen = opts.locoLen ?? 6.2;
  const gap = opts.gap ?? 0.3;
  loco(k, -locoLen / 2, locoLen, opts, glow);
  for (let i = 0; i < coaches; i++) coach(k, -locoLen - gap - coachLen / 2 - i * (coachLen + gap), coachLen, { low: opts.low, no: String(201 + i) });
  return { ...finish(k, glow), length: locoLen + coaches * (coachLen + gap) };
}

/** One coach on its own, `len` long, centred on x = 0 (the cars either side of yours on a ride). */
export function buildCoach(len: number, opts: { low?: boolean; no?: string } = {}): TrainBuild {
  const k = new Kit();
  coach(k, 0, len, opts);
  return { ...finish(k), length: len };
}
/** The diesel on its own, `len` long, centred on x = 0, its cab at +x. */
export function buildLoco(len: number, opts: { low?: boolean; no?: string } = {}): TrainBuild {
  const k = new Kit();
  const glow = new Glow();
  loco(k, 0, len, opts, glow);
  return { ...finish(k, glow), length: len };
}

/* ---------- Drawing a train ---------- */

/** The body's material: flat-shaded like the place models, its colour in the vertices. */
const BODY_MAT = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55 });

/**
 * A dissolve along one direction in world space: nothing of the train is drawn beyond [lo, hi] along `axis`, and over
 * the last `fade` before each end it thins out (a screen-door dither, so no sorting), as if into the distance.
 */
function dissolving() {
  const uniforms = { cutAxis: { value: new Vector3(1, 0, 0) }, cutLo: { value: -1e9 }, cutHi: { value: 1e9 }, cutFade: { value: 1 } };
  const inject = (shader: Parameters<NonNullable<Material['onBeforeCompile']>>[0]) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCutAt;\nuniform vec3 cutAxis;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCutAt = dot((modelMatrix * vec4(transformed, 1.0)).xyz, cutAxis);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCutAt;\nuniform float cutLo;\nuniform float cutHi;\nuniform float cutFade;')
      .replace('void main() {', `void main() {
  float cutK = clamp((vCutAt - cutLo) / cutFade, 0.0, 1.0) * clamp((cutHi - vCutAt) / cutFade, 0.0, 1.0);
  if (cutK < 1.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > cutK) discard;`);
  };
  const body = BODY_MAT.clone();
  body.onBeforeCompile = inject;
  body.customProgramCacheKey = () => 'train-cut';
  // Copies of the city's window and lamp materials, with the cut; they follow the originals' night glow every frame.
  const glass = windowMat.clone();
  glass.onBeforeCompile = (shader, r) => { windowMat.onBeforeCompile(shader, r); inject(shader); };
  glass.customProgramCacheKey = () => 'train-cut-glass';
  const lamp = lampMat.clone();
  lamp.onBeforeCompile = inject;
  lamp.customProgramCacheKey = () => 'train-cut-lamp';
  return { uniforms, body, glass, lamp };
}

/** Draws a built train: its body, its window panes and its lamps (on the given materials, or the shared ones). */
export function TrainBody({ train, mats, shadows = true, beams = true }: {
  train: TrainBuild; mats?: { body: Material; glass: Material; lamp: Material }; shadows?: boolean; beams?: boolean;
}) {
  useEffect(() => () => { train.body.dispose(); train.glass?.dispose(); train.lamp?.dispose(); train.glow?.dispose(); }, [train]);
  return (
    <>
      <mesh geometry={train.body} material={mats?.body ?? BODY_MAT} castShadow={shadows} receiveShadow />
      {train.glass && <mesh geometry={train.glass} material={mats?.glass ?? windowMat} />}
      {train.lamp && <mesh geometry={train.lamp} material={mats?.lamp ?? lampMat} />}
      {beams && train.glow && <NightGlow geometry={train.glow} />}
    </>
  );
}

/** Arrives, stands, leaves, is gone a while: how far along its track the nose is at time `t` (seconds) of a `cycle`. */
export function shuttle(t: number, stop: number, from: number, to: number, cycle = 40) {
  const u = ((t % cycle) + cycle) % cycle;
  if (u < 10) { const k = 1 - u / 10; return stop - (stop - from) * k * k; } // braking in from the far end
  if (u < 23) return stop; // at the platform
  if (u < 33) { const k = (u - 23) / 10; return stop + (to - stop) * k * k; } // pulling away to the other far end
  return to; // gone
}

const _a = new Vector3();
const _b = new Vector3();
const _m = new Matrix4();

/**
 * A train running along this group's x axis (in `dir`), drawn only between `from` and `to` and thinning out over the
 * last `fade` at each end: it pulls in from beyond `from`, stands with its nose at `stop`, and pulls out past `to`, on a
 * loop. Cut by a dissolve rather than hidden, so it never pops; hidden altogether while it is out of sight, so a train
 * nobody can see draws nothing. Sits under `userData.dynamic`, so the map's StaticBatch leaves it moving.
 */
export function PassingTrain({ train, from, to, stop, dir = 1, at = [0, 0, 0], scale = 1, fade = 1.5, cycle = 40, phase = 0, children }: {
  train: TrainBuild; from: number; to: number; stop: number; dir?: 1 | -1; at?: V3; scale?: number; fade?: number; cycle?: number; phase?: number; children?: ReactNode;
}) {
  const holder = useRef<Group>(null!);
  const mover = useRef<Group>(null!);
  const cut = useMemo(dissolving, []);
  useEffect(() => () => { cut.body.dispose(); cut.glass.dispose(); cut.lamp.dispose(); }, [cut]);
  const len = train.length * scale;
  // In the train's own direction of travel: it comes in with its tail clear of `from` and leaves with its tail past `to`.
  const lo = dir > 0 ? from : -to, hi = dir > 0 ? to : -from, st = dir * stop;
  useFrame(({ clock }) => {
    const nose = shuttle(clock.elapsedTime + phase, st, lo - fade, hi + len + fade, cycle);
    mover.current.position.x = dir * nose;
    mover.current.visible = nose > lo - fade && nose - len < hi + fade;
    cut.glass.emissiveIntensity = windowMat.emissiveIntensity;
    cut.lamp.emissiveIntensity = lampMat.emissiveIntensity;
    // The cut in world space, from this group's x axis: the map may turn the station any way.
    holder.current.updateWorldMatrix(true, false);
    _m.copy(holder.current.matrixWorld);
    _a.set(from, 0, 0).applyMatrix4(_m);
    _b.set(to, 0, 0).applyMatrix4(_m);
    const axis = cut.uniforms.cutAxis.value.copy(_b).sub(_a);
    const span = axis.length();
    axis.normalize();
    cut.uniforms.cutLo.value = _a.dot(axis);
    cut.uniforms.cutHi.value = _b.dot(axis);
    cut.uniforms.cutFade.value = Math.max(0.01, fade * (span / Math.max(0.01, to - from)));
  });
  return (
    <group ref={holder} position={at} userData={{ dynamic: true }}>
      <group ref={mover}>
        <group rotation-y={dir > 0 ? 0 : Math.PI} scale={scale}>
          <TrainBody train={train} mats={cut} shadows={false} />
        </group>
      </group>
      {children}
    </group>
  );
}
