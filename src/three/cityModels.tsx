// Town buildings for the map, built from primitives with trim, framed windows and smooth curves. Each model is centred on its footprint (w along x,
// d along z, in tiles), sits on y=0 and has its entrance on the +z side.

import { TrainStation } from './StationModel';
import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { B } from './models';
import { useLowPerf } from '../game/quality';
import { bushKind, mapTreeSize, treeDust, treeGeometry, treePick, type TreeKind } from './trees';
import { Stadium } from './Stadium';
import { Airport, Campus, Church, CompVillage, Flyover, Hospital, Jetty, Mill, MotorPark, Mosque, Nda, Poly, Port, Refinery, School, TechHub } from './places/institutions';
import * as Commerce from './places/commerce';
import * as Heritage from './places/heritage';
import { AsoRockModel, CbnModel, CityGateModel, EcowasModel, GovHouseModel, NassModel, NationalMosqueModel, NnpcModel, SecretariatModel, SupremeCourtModel, WtcModel, ZumaRockModel } from './places/civic';

type V3 = [number, number, number];

/** Shared materials so windows and street lamps can all light up at night in one go. */
export const windowMat = new MeshStandardMaterial({ color: '#5f8fb0', emissive: '#ffcf7a', emissiveIntensity: 0, roughness: 0.18, metalness: 0.55 });

/** The share of windows with a light on (0 to 1), set by the map at night (City.tsx MapEffects). */
export const windowsLit = { value: 1 };

// Not every room is lit at once. Each window has a seed from where it stands (StaticBatch.tsx): the ones under
// `windowsLit` glow, a few with the cold white of a fluorescent tube instead of a warm bulb, each a little
// brighter or dimmer. By day the seed gives some panes a slightly darker glass (never a brighter one).
windowMat.onBeforeCompile = (shader) => {
  shader.uniforms.uLit = windowsLit;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float seed;\nvarying float vSeed;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeed = seed;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uLit;\nvarying float vSeed;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.84 + 0.16 * fract(vSeed * 53.0);')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 tube = vec3(0.62, 0.92, 1.45);
      totalEmissiveRadiance *= step(vSeed, uLit) * mix(vec3(1.0), tube, step(0.8, fract(vSeed * 37.0))) * (0.55 + 0.9 * fract(vSeed * 91.0));`);
};
export const lampMat = new MeshStandardMaterial({ color: '#fff4cf', emissive: '#ffd27a', emissiveIntensity: 0 });

const FRAME = '#f1ede4';
const SILL = '#cfc8ba';

/** A glazed window: the glass, a frame round it, a glazing bar or two and a sill under it. Works on any wall: the thinnest side of `s` is its depth. */
function Win({ p, s }: { p: V3; s: V3 }) {
  const pane = (
    <mesh position={p} material={windowMat}>
      <boxGeometry args={s} />
    </mesh>
  );
  const deep = s[0] < s[2] ? 0 : 2;
  if (s[1] < Math.min(s[0], s[2])) return pane;
  const wide = deep === 0 ? 2 : 0;
  const t = 0.035;
  const box = (w: number, h: number, dd: number): V3 => (wide === 0 ? [w, h, dd] : [dd, h, w]);
  const at = (a: number, y: number, out = 0): V3 => {
    const q: V3 = [...p];
    q[wide] += a;
    q[1] += y;
    q[deep] += out * Math.sign(p[deep] || 1);
    return q;
  };
  const W = s[wide], H = s[1], D = s[deep];
  return (
    <group>
      {pane}
      <B p={at(0, H / 2 + t / 2)} s={box(W + t * 2, t, D + 0.02)} c={FRAME} />
      <B p={at(0, -H / 2 - t / 2)} s={box(W + t * 2, t, D + 0.02)} c={FRAME} />
      <B p={at(-W / 2 - t / 2, 0)} s={box(t, H, D + 0.02)} c={FRAME} />
      <B p={at(W / 2 + t / 2, 0)} s={box(t, H, D + 0.02)} c={FRAME} />
      {W > 0.2 && <B p={at(0, 0, 0.004)} s={box(0.02, H, D + 0.01)} c={FRAME} />}
      {H > 0.32 && <B p={at(0, H * 0.12, 0.004)} s={box(W, 0.02, D + 0.01)} c={FRAME} />}
      <B p={at(0, -H / 2 - t - 0.018, 0.03)} s={box(W + 0.14, 0.036, D + 0.08)} c={SILL} />
    </group>
  );
}

function Cyl({ p, r, h, c, rt, seg = 24, e }: { p: V3; r: number; h: number; c: string; rt?: number; seg?: number; e?: string }) {
  // Square and five-sided posts keep their edges; anything rounder is drawn round, with twice the sides.
  const facets = seg < 6;
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, facets ? seg : Math.max(seg * 2, 16)]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} flatShading={facets} />
    </mesh>
  );
}

function Dome({ p, r, c }: { p: V3; r: number; c: string }) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={c} roughness={0.55} />
    </mesh>
  );
}

/**
 * A unit wedge for gable ends: a triangle across z (-0.5 to 0.5 at y=0, apex at y=1, z=0), x from -0.5 to 0.5.
 * Flat faces, built once and shared.
 */
const PRISM = (() => {
  const a: V3 = [0, 0, -0.5], b: V3 = [0, 0, 0.5], c: V3 = [0, 1, 0];
  const at = (q: V3, x: number): V3 => [x, q[1], q[2]];
  const faces: V3[][] = [
    [at(a, -0.5), at(c, -0.5), at(b, -0.5)], [at(a, 0.5), at(b, 0.5), at(c, 0.5)],
    [at(a, -0.5), at(b, -0.5), at(b, 0.5), at(a, 0.5)],
    [at(b, -0.5), at(c, -0.5), at(c, 0.5), at(b, 0.5)],
    [at(c, -0.5), at(a, -0.5), at(a, 0.5), at(c, 0.5)],
  ];
  const pos: number[] = [];
  for (const face of faces) {
    const f = [...face].reverse(); // listed clockwise above; faces point out counter-clockwise
    const tris = f.length === 3 ? [f] : [[f[0], f[1], f[2]], [f[0], f[2], f[3]]];
    for (const t of tris) for (const v of t) pos.push(...v);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
})();

/** `c` a shade darker (k < 1) or lighter (k > 1). */
const shade = (c: string, k: number) => `#${new Color(c).multiplyScalar(k).getHexString()}`;

/**
 * Pitched roof with its ridge along x: two sloping sheets from the ridge out past the walls, a ridge cap, and
 * the wall's own colour filling the triangle at each end. `p` is the middle of the eaves line (the top of the
 * walls), `w` the roof's length, `d` the depth of the walls it covers and `h` the rise to the ridge.
 */
function Gable({ p, w, d, h, c, wall, eave = 0.18 }: { p: V3; w: number; d: number; h: number; c: string; wall?: string; eave?: number }) {
  const half = d / 2;
  const ang = Math.atan2(h, half);
  const t = 0.05;
  const len = Math.hypot(half, h) + eave / Math.cos(ang);
  return (
    <group position={p}>
      {[1, -1].map((s) => (
        <group key={s} position={[0, h - (len / 2) * Math.sin(ang) + (t / 2) * Math.cos(ang), s * ((len / 2) * Math.cos(ang) + (t / 2) * Math.sin(ang))]} rotation={[s * ang, 0, 0]}>
          <B p={[0, 0, 0]} s={[w, t, len]} c={c} />
          {/* the sheet's lower edge: a fascia board along the eaves */}
          <B p={[0, -t, s * (len / 2 - 0.02)]} s={[w + 0.02, t * 1.6, 0.05]} c={shade(c, 0.72)} />
        </group>
      ))}
      <B p={[0, h + t * 0.9, 0]} s={[w + 0.04, 0.07, 0.13]} c={shade(c, 0.78)} />
      <mesh geometry={PRISM} scale={[w - eave * 1.4, h, d]} castShadow receiveShadow>
        <meshStandardMaterial color={wall ?? shade(c, 0.85)} flatShading />
      </mesh>
    </group>
  );
}

/** Low wall round the top of a flat roof, with a coping strip along it. `y` is the roof's top. */
function Parapet({ w, d, y, c, h = 0.2, cap = '#ece6da' }: { w: number; d: number; y: number; c: string; h?: number; cap?: string }) {
  const t = 0.07;
  return (
    <>
      <B p={[0, y + h / 2, d / 2 - t / 2]} s={[w, h, t]} c={c} />
      <B p={[0, y + h / 2, -d / 2 + t / 2]} s={[w, h, t]} c={c} />
      <B p={[w / 2 - t / 2, y + h / 2, 0]} s={[t, h, d - t * 2]} c={c} />
      <B p={[-w / 2 + t / 2, y + h / 2, 0]} s={[t, h, d - t * 2]} c={c} />
      <B p={[0, y + h + 0.02, d / 2 - t / 2]} s={[w + 0.04, 0.04, t + 0.04]} c={cap} />
      <B p={[0, y + h + 0.02, -d / 2 + t / 2]} s={[w + 0.04, 0.04, t + 0.04]} c={cap} />
      <B p={[w / 2 - t / 2, y + h + 0.02, 0]} s={[t + 0.04, 0.04, d]} c={cap} />
      <B p={[-w / 2 + t / 2, y + h + 0.02, 0]} s={[t + 0.04, 0.04, d]} c={cap} />
    </>
  );
}

/**
 * A tree on the map or in a scene of its own: one mesh from the shared tree kit (trees.ts), which StaticBatch folds into
 * the town's buckets. `s` is about a third of its height; `kind` the species (a shade tree or oil palm by default).
 */
function Tree({ p, s = 0.6, kind, seed = 0 }: { p: V3; s?: number; kind?: TreeKind; seed?: number }) {
  const low = useLowPerf();
  const k = kind ?? bushKind(p[0], p[2]);
  const pick = treePick(k, p[0], p[2], seed);
  const size = mapTreeSize(k, s) * pick.scale;
  return (
    // noShade: the ground shade is for buildings, and a tree's bounds would read as one.
    <mesh geometry={treeGeometry(k, pick.variant, pick.palette, low, treeDust())} position={p} rotation={[pick.lx, pick.yaw, pick.lz]} scale={size} castShadow receiveShadow dispose={null} userData={{ noShade: true }}>
      <meshStandardMaterial vertexColors flatShading emissiveIntensity={0} />
    </mesh>
  );
}

/** Row of windows along the front (+z) face. */
function WindowRow({ w, d, y, n, inset = 0.4, hood, skip }: { w: number; d: number; y: number; n: number; inset?: number; hood?: string; skip?: number }) {
  const span = w - inset * 2;
  const ww = (span / n) * 0.55;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        if (i === skip) return null;
        const x = -span / 2 + (span / n) * (i + 0.5);
        return (
          <group key={i}>
            <Win p={[x, y, d / 2 + 0.01]} s={[ww, 0.45, 0.04]} />
            {/* the concrete sunshade over a window, as on most houses in the north */}
            {hood && <B p={[x, y + 0.31, d / 2 + 0.09]} s={[ww + 0.16, 0.04, 0.18]} c={hood} />}
          </group>
        );
      })}
    </>
  );
}

/* ---------- Landmarks ---------- */

/** Glass for vehicles: the window material (it lights up at night with the rest) without a house window's frame and sill. */
function Glass({ p, s }: { p: V3; s: V3 }) {
  return (
    <mesh position={p} material={windowMat}>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** A box narrowing toward its top (a car's glasshouse): `w`×`d` at the foot, `top` of that at the head. */
function Frustum({ p, w, h, d, top, c, glass }: { p: V3; w: number; h: number; d: number; top: number; c?: string; glass?: boolean }) {
  const k = 1 / Math.SQRT2;
  return (
    <group position={p} scale={[w * k, h, d * k]}>
      <mesh rotation={[0, Math.PI / 4, 0]} material={glass ? windowMat : undefined} castShadow={!glass}>
        <cylinderGeometry args={[top, 1, 1, 4, 1]} />
        {!glass && <meshStandardMaterial color={c} flatShading />}
      </mesh>
    </group>
  );
}

const WHEELS = (x: number, z: number, r: number, t: number) =>
  [[-x, -z], [x, -z], [-x, z], [x, z]].map(([wx, wz], i) => (
    <group key={i} position={[wx, r, wz]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, t, 12]} />
        <meshStandardMaterial color="#0b0b0c" />
      </mesh>
      <mesh position={[Math.sign(wx) * (t / 2 + 0.005), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r * 0.55, r * 0.55, 0.02, 8]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
    </group>
  ));

/** A danfo: the flat-fronted minibus, windows all round between pillars, a roof rack and a stripe down the side. */
function Bus({ c = '#f8fafc', stripe = '#15803d' }: { c?: string; stripe?: string }) {
  const dark = '#1f2937';
  return (
    <group>
      <B p={[0, 0.38, 0]} s={[0.84, 0.44, 2]} c={c} />
      <B p={[0, 0.52, 0]} s={[0.86, 0.08, 2.02]} c={stripe} />
      <Glass p={[0, 0.74, 0.01]} s={[0.82, 0.3, 1.9]} />
      {/* the pillars between the windows, front to back */}
      {[-0.5, -0.05, 0.4].map((z) => (
        <B key={z} p={[0, 0.74, z]} s={[0.845, 0.3, 0.06]} c={c} />
      ))}
      {/* corner posts, leaving the windscreen and back window clear */}
      {[-0.39, 0.39].flatMap((x) => [-0.95, 0.95].map((z) => (
        <B key={`${x}${z}`} p={[x, 0.74, z]} s={[0.07, 0.3, 0.1]} c={c} />
      )))}
      <B p={[0, 0.74, 0.95]} s={[0.04, 0.3, 0.1]} c={c} />
      <B p={[0, 0.94, 0]} s={[0.84, 0.1, 2]} c={c} />
      <B p={[0, 0.995, 0]} s={[0.78, 0.02, 1.9]} c={shade(c, 0.9)} />
      {/* roof rack */}
      {[-0.32, 0.32].map((x) => (
        <B key={x} p={[x, 1.05, -0.1]} s={[0.035, 0.035, 1.5]} c={dark} />
      ))}
      {[-0.7, -0.1, 0.5].map((z) => (
        <B key={z} p={[0, 1.05, z]} s={[0.68, 0.03, 0.035]} c={dark} />
      ))}
      {/* lights, grille, bumpers and mirrors */}
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          <B p={[x, 0.36, 1.005]} s={[0.14, 0.08, 0.02]} c="#fef9c3" e="#fde68a" />
          <B p={[x, 0.4, -1.005]} s={[0.1, 0.12, 0.02]} c="#fecaca" e="#dc2626" />
          <B p={[x * 1.55, 0.72, 0.9]} s={[0.04, 0.1, 0.04]} c={dark} />
        </group>
      ))}
      <B p={[0, 0.36, 1.005]} s={[0.3, 0.08, 0.02]} c={dark} />
      <B p={[0, 0.17, 1.02]} s={[0.86, 0.08, 0.06]} c={dark} />
      <B p={[0, 0.17, -1.02]} s={[0.86, 0.08, 0.06]} c={dark} />
      <B p={[0, 0.2, 0]} s={[0.86, 0.06, 1.4]} c={dark} />
      {WHEELS(0.38, 0.68, 0.16, 0.1)}
    </group>
  );
}

export function Car({ c = '#2563eb' }: { c?: string }) {
  const dark = '#1f2937';
  return (
    <group>
      {/* Body: a long lower shell, bonnet and boot a step up, and the glasshouse narrowing to a painted roof */}
      <B p={[0, 0.27, 0]} s={[0.74, 0.24, 1.46]} c={c} />
      <B p={[0, 0.41, 0.46]} s={[0.7, 0.05, 0.52]} c={c} />
      <B p={[0, 0.41, -0.56]} s={[0.7, 0.05, 0.34]} c={c} />
      <B p={[0, 0.42, -0.08]} s={[0.72, 0.07, 0.72]} c={c} />
      <Frustum p={[0, 0.58, -0.08]} w={0.66} h={0.22} d={0.8} top={0.72} glass />
      <B p={[0, 0.7, -0.08]} s={[0.5, 0.04, 0.56]} c={c} />
      {/* the pillar between the doors */}
      <B p={[0, 0.57, -0.06]} s={[0.66, 0.2, 0.05]} c={c} />
      {/* Lights, grille, plates and bumpers */}
      {[-0.25, 0.25].map((x) => (
        <group key={x}>
          <B p={[x, 0.33, 0.735]} s={[0.15, 0.07, 0.02]} c="#fef9c3" e="#fde68a" />
          <B p={[x, 0.33, -0.735]} s={[0.15, 0.07, 0.02]} c="#fecaca" e="#dc2626" />
          <B p={[x * 1.45, 0.5, 0.2]} s={[0.08, 0.05, 0.05]} c={c} />
        </group>
      ))}
      <B p={[0, 0.32, 0.735]} s={[0.28, 0.06, 0.02]} c={dark} />
      {[0.76, -0.76].map((z) => (
        <group key={z}>
          <B p={[0, 0.17, z * 0.98]} s={[0.76, 0.08, 0.06]} c="#374151" />
          <B p={[0, 0.23, z * 1.0]} s={[0.2, 0.05, 0.01]} c="#f8fafc" />
        </group>
      ))}
      {/* sills, and dark arches over the wheels */}
      <B p={[0, 0.17, 0]} s={[0.76, 0.05, 0.62]} c={dark} />
      {[-0.46, 0.46].map((z) => (
        <B key={z} p={[0, 0.28, z]} s={[0.755, 0.1, 0.36]} c={dark} />
      ))}
      {WHEELS(0.37, 0.46, 0.15, 0.1)}
    </group>
  );
}

function Horse({ c = '#7c2d12' }: { c?: string }) {
  return (
    <group>
      <B p={[0, 0.55, 0]} s={[0.22, 0.25, 0.7]} c={c} />
      <B p={[0, 0.8, 0.38]} s={[0.14, 0.35, 0.16]} c={c} />
      <B p={[0, 0.92, 0.5]} s={[0.12, 0.12, 0.22]} c={c} />
      {[[-0.08, -0.28], [0.08, -0.28], [-0.08, 0.28], [0.08, 0.28]].map(([x, z], i) => (
        <B key={i} p={[x, 0.22, z]} s={[0.06, 0.44, 0.06]} c="#3f1d0b" />
      ))}
      <B p={[0, 0.72, -0.05]} s={[0.24, 0.05, 0.25]} c="#1d4ed8" />
    </group>
  );
}

/* ---------- Landmarks (not enterable) ---------- */

/* ---------- Abuja ---------- */

export function LandmarkModel({ model, w, d }: { model: string; w: number; d: number }) {
  switch (model) {
    case 'govhouse': return <GovHouseModel w={w} d={d} />;
    case 'flyover': return <Flyover w={w} d={d} />;
    case 'golf': return <Commerce.Golf w={w} d={d} />;
    case 'tradefair': return <Commerce.TradeFair w={w} d={d} />;
    case 'asorock': return <AsoRockModel w={w} d={d} />;
    case 'zumarock': return <ZumaRockModel w={w} d={d} />;
    case 'citygate': return <CityGateModel w={w} d={d} />;
    case 'supremecourt': return <SupremeCourtModel w={w} d={d} />;
    case 'cbn': return <CbnModel w={w} d={d} />;
    case 'nnpc': return <NnpcModel w={w} d={d} />;
    case 'milltower': return <Heritage.MillenniumTower w={w} d={d} />;
    case 'campus': return <Campus w={w} d={d} />;
    case 'fountain': return <Heritage.Fountain w={w} d={d} />;
    case 'wtc': return <WtcModel w={w} d={d} />;
    case 'ecowas': return <EcowasModel w={w} d={d} />;
    case 'glorydome': return <Commerce.GloryDome w={w} d={d} />;
    case 'nationaltheatre': return <Heritage.NationalTheatre w={w} d={d} />;
    case 'port': return <Port w={w} d={d} />;
    case 'compvillage': return <CompVillage w={w} d={d} />;
    case 'beach': return <Commerce.Beach w={w} d={d} />;
    case 'citywall': return <Heritage.CityWall w={w} d={d} />;
    case 'kofar': return <Heritage.Kofar w={w} d={d} />;
    case 'emirpalace': return <Heritage.EmirPalace w={w} d={d} />;
    case 'dala': return <Heritage.DalaHill w={w} d={d} />;
    case 'dyepits': return <Heritage.DyePits w={w} d={d} />;
    case 'pyramids': return <Heritage.Pyramids w={w} d={d} />;
    default: return null;
  }
}

export function PlaceModel({ model, w, d }: { model: string; w: number; d: number }) {
  const props = { w, d };
  switch (model) {
    case 'home': return <Heritage.Home {...props} />;
    case 'suya': return <Commerce.Suya {...props} />;
    case 'school': return <School {...props} />;
    case 'pitch': return <Heritage.Pitch {...props} />;
    case 'viewing': return <Commerce.Viewing {...props} />;
    case 'church': return <Church {...props} />;
    case 'buka': return <Commerce.Buka {...props} />;
    case 'refinery': return <Refinery {...props} />;
    case 'mosque': return <Mosque {...props} />;
    case 'jetty': return <Jetty {...props} />;
    case 'market': return <Commerce.Market {...props} />;
    case 'lugard': return <Heritage.Lugard {...props} />;
    case 'square': return <Heritage.Square {...props} />;
    case 'secretariat': return <SecretariatModel {...props} />;
    case 'bank': return <Commerce.Bank {...props} />;
    case 'hospital': return <Hospital {...props} />;
    case 'mall': return <Commerce.Mall {...props} />;
    case 'boutique': return <Commerce.Boutique {...props} />;
    case 'museum': return <Heritage.Museum {...props} />;
    case 'park': return <Commerce.Park {...props} />;
    case 'techhub': return <TechHub {...props} />;
    case 'station': return <TrainStation {...props} />;
    case 'poly': return <Poly {...props} />;
    case 'motorpark': return <MotorPark {...props} />;
    case 'stadium': return <Stadium {...props} />;
    case 'nda': return <Nda {...props} />;
    case 'hotel': return <Commerce.Hotel {...props} />;
    case 'arewa': return <Commerce.Arewa {...props} />;
    case 'polo': return <Commerce.Polo {...props} />;
    case 'mill': return <Mill {...props} />;
    case 'airport': return <Airport {...props} />;
    case 'club': return <Commerce.Club {...props} />;
    case 'nationalmosque': return <NationalMosqueModel {...props} />;
    case 'nass': return <NassModel {...props} />;
    case 'govhouse': return <GovHouseModel {...props} />;
    default: return <B p={[0, 0.5, 0]} s={[w, 1, d]} c="#f0f" />;
  }
}

/** Filler house: bungalow, gabled house, or flat-roof storey building, in its own walled compound. */
export function HouseModel({ w, d, style, wall, roof, storeys, kind }: { w: number; d: number; style: number; wall: string; roof: string; storeys: number; kind?: string }) {
  if (kind === 'chapel') return <Chapel w={w} d={d} />;
  if (kind === 'mosque') return <SmallMosque w={w} d={d} />;
  if (kind === 'shop') return <ShopRow w={w} d={d} wall={wall} />;
  if (kind === 'clinic') return <Clinic w={w} d={d} />;
  const bw = w - 0.7;
  const bd = d - 1;
  const h = storeys === 2 ? 2.2 : 1.2;
  const front = bd / 2;
  // The same house always gets the same touches: worked out from what it is, never at random.
  const pick = (Math.round(w * 7 + style * 3 + storeys * 5) + wall.charCodeAt(2) + roof.charCodeAt(3)) % 4;
  const trim = '#efe9dd';
  const fence = shade(wall, 0.9);
  const gate = ['#14532d', '#1f2937', '#7c2d12', '#1e3a8a'][pick];
  const walled = w >= 3;
  const fy = 0.42;
  const fz = d / 2 - 0.1;
  const gx = 0.25;
  // The ground-floor window the door would cut through is left out.
  const wins = Math.max(2, Math.round(bw));
  const doorWin = Math.min(wins - 1, Math.max(0, Math.floor(((gx + (bw - 0.5) / 2) / (bw - 0.5)) * wins)));
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#c98b5e" />
      {/* the compound wall: back and sides, and a front with a metal gate lined up with the door */}
      <B p={[0, 0.3, -d / 2 + 0.1]} s={[w - 0.1, 0.6, 0.08]} c={fence} />
      {walled && (
        <>
          {[-1, 1].map((sx) => (
            <B key={sx} p={[sx * (w / 2 - 0.09), fy / 2, 0]} s={[0.08, fy, d - 0.18]} c={fence} />
          ))}
          <B p={[(-w / 2 + 0.05 + gx - 0.32) / 2, fy / 2, fz]} s={[gx - 0.32 + w / 2 - 0.05, fy, 0.08]} c={fence} />
          <B p={[(w / 2 - 0.05 + gx + 0.32) / 2, fy / 2, fz]} s={[w / 2 - 0.05 - gx - 0.32, fy, 0.08]} c={fence} />
          <B p={[gx, 0.27, fz]} s={[0.6, 0.5, 0.04]} c={gate} />
          {[-1, 1].map((sx) => (
            <B key={sx} p={[gx + sx * 0.33, 0.29, fz]} s={[0.1, 0.58, 0.12]} c={trim} />
          ))}
          {/* coping along the top of the front wall */}
          <B p={[0, fy + 0.015, fz]} s={[w - 0.08, 0.03, 0.11]} c={trim} />
          {/* a paved path from the gate to the door */}
          <B p={[gx, 0.035, (fz + front - 0.2) / 2 + 0.05]} s={[0.42, 0.02, fz - front + 0.2]} c="#b8b1a3" />
        </>
      )}
      <group position={[0, 0, -0.2]}>
        <B p={[0, h / 2, 0]} s={[bw, h, bd]} c={wall} />
        {/* plinth along the foot of the walls, corner pilasters, and a band between floors */}
        <B p={[0, 0.08, 0]} s={[bw + 0.06, 0.16, bd + 0.06]} c="#8b7d6b" />
        {[-1, 1].map((sx) => (
          <B key={sx} p={[sx * (bw / 2 - 0.02), h / 2, front - 0.02]} s={[0.1, h, 0.1]} c={trim} />
        ))}
        {storeys === 2 && <B p={[0, 1.17, 0]} s={[bw + 0.05, 0.07, bd + 0.05]} c={trim} />}
        {style === 0 && <Gable p={[0, h, 0]} w={bw + 0.3} d={bd} h={0.55} c={roof} wall={wall} />}
        {style === 1 && (
          <>
            {/* hipped roof over a shallow fascia, so the eaves throw a line of shade */}
            <B p={[0, h + 0.03, 0]} s={[bw + 0.24, 0.07, bd + 0.24]} c={shade(roof, 0.7)} />
            <mesh position={[0, h + 0.36, 0]} rotation={[0, Math.PI / 4, 0]} scale={[(bw + 0.24) * 0.7071, 1, (bd + 0.24) * 0.7071]} castShadow>
              <coneGeometry args={[1, 0.6, 4]} />
              <meshStandardMaterial color={roof} flatShading />
            </mesh>
          </>
        )}
        {style === 2 && (
          <>
            <B p={[0, h + 0.05, 0]} s={[bw + 0.1, 0.1, bd + 0.1]} c={shade(wall, 0.85)} />
            <Parapet w={bw + 0.1} d={bd + 0.1} y={h + 0.1} c={wall} h={0.18} cap={roof} />
          </>
        )}
        {Array.from({ length: storeys }, (_, f) => (
          <WindowRow key={f} w={bw} d={bd} y={0.7 + f * 1} n={wins} inset={0.25} hood={trim} skip={f === 0 ? doorWin : undefined} />
        ))}
        {/* front door in a frame, a step up to it and a little porch roof on two posts */}
        <B p={[gx, 0.37, front + 0.015]} s={[0.4, 0.78, 0.03]} c={FRAME} />
        <B p={[gx, 0.35, front + 0.025]} s={[0.3, 0.7, 0.04]} c="#5a371e" />
        <B p={[gx + 0.09, 0.36, front + 0.05]} s={[0.03, 0.03, 0.03]} c="#d4af37" />
        <B p={[gx, 0.03, front + 0.14]} s={[0.56, 0.06, 0.28]} c="#a8a29e" />
        <B p={[gx, 0.82, front + 0.15]} s={[0.62, 0.05, 0.3]} c={roof} />
        {walled && [-1, 1].map((sx) => (
          <B key={sx} p={[gx + sx * 0.27, 0.41, front + 0.27]} s={[0.04, 0.78, 0.04]} c={trim} />
        ))}
        {/* an air conditioner on the side wall, or a satellite dish on the roof */}
        {pick % 2 === 0 ? (
          <group position={[bw / 2 + 0.07, storeys === 2 ? 1.55 : 0.55, -bd / 4]}>
            <B p={[0, 0, 0]} s={[0.14, 0.22, 0.36]} c="#e5e7eb" />
            <B p={[0.071, 0, 0]} s={[0.01, 0.15, 0.28]} c="#6b7280" />
          </group>
        ) : (
          <group position={[-bw / 2 + 0.3, h + (style === 1 ? 0.12 : style === 0 ? 0.1 : 0.1), front - 0.3]} rotation={[0.5, 0.6, 0]}>
            <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.05, 0.06, 10]} />
              <meshStandardMaterial color="#e5e7eb" />
            </mesh>
            <B p={[0, 0.07, -0.02]} s={[0.025, 0.16, 0.025]} c="#9ca3af" />
          </group>
        )}
        {kind === 'tank' && (
          <group position={[bw / 2 - 0.35, h, -bd / 4]}>
            {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z], i) => (
              <B key={i} p={[x, 0.3, z]} s={[0.05, 0.6, 0.05]} c="#78716c" />
            ))}
            <B p={[0, 0.58, 0]} s={[0.44, 0.04, 0.44]} c="#78716c" />
            {/* the black plastic tank most compounds pump water up to */}
            <Cyl p={[0, 0.85, 0]} r={0.26} rt={0.24} h={0.5} c="#1f2937" seg={10} />
            <Cyl p={[0, 1.12, 0]} r={0.09} h={0.05} c="#111827" seg={8} />
          </group>
        )}
      </group>
    </group>
  );
}

/** Neighbourhood chapel: small gabled hall with a cross on the front. */
function Chapel({ w, d }: { w: number; d: number }) {
  const bw = w - 1;
  const bd = d - 0.8;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#d6d3d1" />
      <group position={[0, 0, -0.1]}>
        <B p={[0, 0.6, 0]} s={[bw, 1.2, bd]} c="#f5f5f4" />
        <B p={[0, 0.08, 0]} s={[bw + 0.06, 0.16, bd + 0.06]} c="#a8a29e" />
        {/* the gable faces the street, as on a church, with the cross on its peak */}
        <group rotation={[0, Math.PI / 2, 0]}>
          <Gable p={[0, 1.2, 0]} w={bd + 0.3} d={bw} h={0.75} c="#7f1d1d" wall="#f5f5f4" />
        </group>
        <B p={[0, 2.18, bd / 2 + 0.1]} s={[0.05, 0.42, 0.05]} c="#facc15" />
        <B p={[0, 2.26, bd / 2 + 0.1]} s={[0.24, 0.05, 0.05]} c="#facc15" />
        <Win p={[0, 1.45, bd / 2 + 0.02]} s={[0.18, 0.18, 0.04]} />
        {/* tall windows down each side */}
        {[-1, 1].map((sx) => [-0.25, 0.25].map((z) => (
          <Win key={`${sx}${z}`} p={[sx * (bw / 2 + 0.01), 0.7, z * bd]} s={[0.04, 0.5, 0.16]} />
        )))}
        <B p={[0, 0.36, bd / 2 + 0.015]} s={[0.4, 0.74, 0.03]} c={FRAME} />
        <B p={[0, 0.33, bd / 2 + 0.025]} s={[0.3, 0.66, 0.04]} c="#5a371e" />
        <B p={[0, 0.03, bd / 2 + 0.15]} s={[0.6, 0.06, 0.28]} c="#a8a29e" />
      </group>
    </group>
  );
}

/** Small prayer house: square hall, green dome and one slim minaret. */
function SmallMosque({ w, d }: { w: number; d: number }) {
  const bw = w - 1.2;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#e7e5e4" />
      <B p={[0, 0.55, -0.1]} s={[bw, 1.1, bw]} c="#fafaf9" />
      <B p={[0, 0.08, -0.1]} s={[bw + 0.06, 0.16, bw + 0.06]} c="#a8a29e" />
      <Parapet w={bw + 0.04} d={bw + 0.04} y={1.1} c="#fafaf9" h={0.12} cap="#15803d" />
      {/* a drum under the dome lifts it clear of the parapet */}
      <Cyl p={[0, 1.16, -0.1]} r={Math.min(0.5, bw / 2 - 0.15)} h={0.12} c="#f5f5f4" seg={12} />
      <Dome p={[0, 1.22, -0.1]} r={Math.min(0.5, bw / 2 - 0.15)} c="#15803d" />
      <B p={[0, 1.8, -0.1]} s={[0.04, 0.2, 0.04]} c="#facc15" />
      <group position={[bw / 2 + 0.1, 0, -bw / 2]}>
        <Cyl p={[0, 0.9, 0]} r={0.1} rt={0.08} h={1.8} c="#fafaf9" seg={8} />
        {/* the muezzin's balcony */}
        <Cyl p={[0, 1.55, 0]} r={0.14} h={0.06} c="#15803d" seg={8} />
        <mesh position={[0, 2.0, 0]}>
          <coneGeometry args={[0.11, 0.3, 8]} />
          <meshStandardMaterial color="#15803d" flatShading />
        </mesh>
      </group>
      <B p={[0, 0.38, bw / 2 - 0.085]} s={[0.4, 0.76, 0.03]} c="#15803d" />
      <B p={[0, 0.34, bw / 2 - 0.075]} s={[0.3, 0.68, 0.04]} c="#5a371e" />
      {[-1, 1].map((x) => (
        <Win key={x} p={[x * bw * 0.3, 0.65, bw / 2 - 0.08]} s={[0.18, 0.36, 0.04]} />
      ))}
    </group>
  );
}

/** Row of lock-up shops: a painted signboard along the top, roller shutters (some pulled up on the goods inside) and an awning over each. */
function ShopRow({ w, d, wall }: { w: number; d: number; wall: string }) {
  const bw = w - 0.7;
  const n = Math.max(2, Math.round(bw / 0.8));
  const cw = bw / n;
  const cols = ['#b91c1c', '#15803d', '#1d4ed8', '#f59e0b'];
  const bd = d - 1.4;
  const front = -0.3 + bd / 2;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#c98b5e" />
      {/* a concrete apron in front of the shops */}
      <B p={[0, 0.04, front + 0.3]} s={[bw + 0.2, 0.04, 0.6]} c="#b8b1a3" />
      <B p={[0, 0.6, -0.3]} s={[bw, 1.2, bd]} c={wall} />
      <B p={[0, 0.08, -0.3]} s={[bw + 0.05, 0.16, bd + 0.05]} c="#8b7d6b" />
      <B p={[0, 1.24, -0.3]} s={[bw + 0.1, 0.08, bd + 0.1]} c="#94a3b8" />
      <Parapet w={bw + 0.1} d={bd + 0.1} y={1.28} c={wall} h={0.12} />
      {/* the long signboard, white with a coloured band */}
      <B p={[0, 1.02, front + 0.04]} s={[bw - 0.1, 0.22, 0.04]} c="#f8fafc" />
      <B p={[0, 0.94, front + 0.065]} s={[bw - 0.1, 0.05, 0.01]} c={cols[(Math.round(w) + 1) % 4]} />
      {Array.from({ length: n }, (_, i) => {
        const x = -bw / 2 + cw * (i + 0.5);
        const open = i % 2 === 0;
        return (
          <group key={i}>
            {/* piers between the shops */}
            <B p={[x - cw / 2 + 0.03, 0.45, front + 0.02]} s={[0.06, 0.9, 0.06]} c={shade(wall, 0.92)} />
            {open ? (
              <>
                {/* shutter rolled up, the shop dark inside with goods on a shelf */}
                <B p={[x, 0.79, front + 0.02]} s={[cw - 0.12, 0.1, 0.05]} c="#9ca3af" />
                <B p={[x, 0.37, front + 0.005]} s={[cw - 0.12, 0.74, 0.02]} c="#1f2937" />
                <B p={[x, 0.32, front + 0.03]} s={[cw - 0.2, 0.03, 0.08]} c="#78716c" />
                {[-1, 0, 1].map((k) => (
                  <B key={k} p={[x + k * (cw / 4), 0.4, front + 0.04]} s={[0.1, 0.12, 0.06]} c={cols[(i + k + 3) % 4]} />
                ))}
              </>
            ) : (
              <>
                <B p={[x, 0.42, front + 0.02]} s={[cw - 0.12, 0.84, 0.04]} c="#a1a1aa" />
                {[0.15, 0.3, 0.45, 0.6, 0.75].map((y) => (
                  <B key={y} p={[x, y, front + 0.045]} s={[cw - 0.12, 0.015, 0.01]} c="#71717a" />
                ))}
              </>
            )}
            <group position={[x, 0.86, front + 0.2]} rotation={[0.35, 0, 0]}>
              <B p={[0, 0, 0]} s={[cw - 0.06, 0.04, 0.4]} c={cols[(i + 1) % 4]} />
              <B p={[0, -0.04, 0.2]} s={[cw - 0.06, 0.06, 0.015]} c={shade(cols[(i + 1) % 4], 0.75)} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Primary health clinic: white block, green stripe and cross. */
function Clinic({ w, d }: { w: number; d: number }) {
  const bw = w - 0.7;
  const bd = d - 1.2;
  return (
    <group>
      <B p={[0, 0.015, 0]} s={[w - 0.1, 0.03, d - 0.1]} c="#d6d3d1" />
      <group position={[0, 0, -0.2]}>
        <B p={[0, 0.6, 0]} s={[bw, 1.2, bd]} c="#f8fafc" />
        <B p={[0, 0.08, 0]} s={[bw + 0.06, 0.16, bd + 0.06]} c="#94a3b8" />
        <B p={[0, 1.25, 0]} s={[bw + 0.15, 0.12, bd + 0.15]} c="#cbd5e1" />
        <Parapet w={bw + 0.15} d={bd + 0.15} y={1.31} c="#f8fafc" h={0.12} cap="#15803d" />
        <WindowRow w={bw} d={bd} y={0.65} n={Math.max(2, Math.round(bw))} inset={0.25} hood="#e2e8f0" skip={Math.max(2, Math.round(bw)) - 1} />
        {/* a canopy on posts over the entrance */}
        <B p={[bw / 2 - 0.35, 0.85, bd / 2 + 0.25]} s={[0.7, 0.05, 0.5]} c="#15803d" />
        {[-1, 1].map((sx) => (
          <B key={sx} p={[bw / 2 - 0.35 + sx * 0.3, 0.42, bd / 2 + 0.45]} s={[0.04, 0.84, 0.04]} c="#e2e8f0" />
        ))}
        <B p={[0, 1.08, bd / 2 + 0.01]} s={[bw, 0.1, 0.03]} c="#15803d" />
        {/* the red cross on a white board standing up from the roof */}
        <B p={[0, 1.62, bd / 2 + 0.04]} s={[0.5, 0.5, 0.04]} c="#ffffff" />
        <B p={[0, 1.62, bd / 2 + 0.065]} s={[0.12, 0.38, 0.02]} c="#dc2626" />
        <B p={[0, 1.62, bd / 2 + 0.065]} s={[0.38, 0.12, 0.02]} c="#dc2626" />
        <B p={[bw / 2 - 0.35, 0.3, bd / 2 + 0.02]} s={[0.3, 0.6, 0.04]} c="#475569" />
      </group>
    </group>
  );
}

export { Tree as CityTree, Bus, Horse };
