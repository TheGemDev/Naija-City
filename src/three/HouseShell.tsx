// The inside of a house beyond its bare walls: finishes on floors and walls (game/finishes.ts), skirting, cornices,
// POP ceilings, door frames and doors, sockets and switches, and real windows you can see through.
//
// Cost: finish surfaces are built straight into one merged geometry per finish (so a tiled floor in five rooms is one
// draw call), and the small trim pieces go through StaticBatch, which folds them into a few meshes per colour. Window
// glass is one shared transparent material. Nothing here moves on its own: the parts on the outer walls follow their
// side's height (World.tsx WallSide) by scale or by being shown only while the wall stands tall.

import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, MeshBasicMaterial, MeshStandardMaterial, type Group } from 'three';
import type { Edge, HouseLayout, HouseRoom } from '../game/grid';
import { edgeHasWindow, WALL_SHORT, WALL_TALL, WALL_THICK } from '../game/mount';
import {
  CEILING_BY_ID, FLOOR_BY_ID, faceValue, interiorRooms, roomAt, roomFaces, faceCell, type Face, type HouseFinish,
} from '../game/finishes';
import { finishMaterial } from './finishTextures';
import { StaticBatch } from './StaticBatch';

const TALL = WALL_TALL;
const SHORT = WALL_SHORT;
const T = WALL_THICK;
/** Finish skins sit this far off the wall's centre line: just proud of the wall's own face. */
const SKIN = T / 2 + 0.003;
/** The window opening along an edge (0-1) and its sill and head heights. game/mount.ts curtains assume 1.1-1.9. */
const WIN_A = 0.15, WIN_B = 0.85, SILL = 1.1, HEAD = 1.9;
/** Front door height. */
const DOOR_H = 2.1;

type V3 = [number, number, number];

// ── Shared materials ─────────────────────────────────────────────────────────────────────────────

/**
 * Window glass, one material for every window in every house: faintly tinted, a little reflective (the scene's room
 * environment in high mode), and more opaque at grazing angles, like real glass. At night HouseLights warms its glow
 * when the house has light. Transparent, so the hover outline and the cut-away sort leave it alone.
 */
export const glassMat = new MeshStandardMaterial({
  color: '#d4ecf2', transparent: true, opacity: 0.12, roughness: 0.08, metalness: 0, depthWrite: false,
  emissive: new Color('#ffcf8a'), emissiveIntensity: 0, envMapIntensity: 1.2,
});
glassMat.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
    diffuseColor.a = mix(diffuseColor.a, 0.42, fres);`,
  );
};
glassMat.customProgramCacheKey = () => 'naija-glass';

/** The LED cove line in a POP ceiling: HouseLights sets its colour from the mood and the power. */
export const coveMat = new MeshBasicMaterial({ color: '#f7f5f0', toneMapped: false });

// ── Faces and quads ──────────────────────────────────────────────────────────────────────────────

/** Unit vectors for a face: along the edge, and out from the wall into the room it looks at. */
function frame(f: { dir: 'h' | 'v'; x: number; z: number; side: 'a' | 'b' }) {
  const s = f.side === 'a' ? -1 : 1;
  return f.dir === 'h'
    ? { o: [f.x, 0, f.z] as V3, u: [1, 0, 0] as V3, n: [0, 0, s] as V3 }
    : { o: [f.x, 0, f.z] as V3, u: [0, 0, 1] as V3, n: [s, 0, 0] as V3 };
}
const at = (o: V3, u: V3, n: V3, a: number, y: number, off: number): V3 => [o[0] + u[0] * a + n[0] * off, y, o[2] + u[2] * a + n[2] * off];

interface QuadSet { pos: number[]; uv: number[]; nor: number[] }

/** Flat quads, gathered per finish and built into one geometry each. */
class Quads {
  sets = new Map<string, QuadSet>();
  /** A quad from p0 along to p1, up to height; uvs in metres (u along, v up), facing n. */
  add(value: string, p0: V3, p1: V3, y0: number, y1: number, n: V3, u0: number, u1: number, v0: number, v1: number) {
    let s = this.sets.get(value);
    if (!s) this.sets.set(value, (s = { pos: [], uv: [], nor: [] }));
    const a: V3 = [p0[0], y0, p0[2]], b: V3 = [p1[0], y0, p1[2]], c: V3 = [p1[0], y1, p1[2]], d: V3 = [p0[0], y1, p0[2]];
    // Wind so the front faces n.
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cz = e1[0] * e2[1] - e1[1] * e2[0], cy = e1[2] * e2[0] - e1[0] * e2[2];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const tri = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    const uvs = flip ? [[u0, v0], [u1, v1], [u1, v0], [u0, v0], [u0, v1], [u1, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
    tri.forEach((p, i) => {
      s!.pos.push(...p);
      s!.uv.push(...uvs[i]);
      s!.nor.push(...n);
    });
  }
  /** A flat floor rectangle. */
  floor(value: string, x0: number, z0: number, x1: number, z1: number, y: number) {
    let s = this.sets.get(value);
    if (!s) this.sets.set(value, (s = { pos: [], uv: [], nor: [] }));
    const pts: [number, number][] = [[x0, z1], [x1, z1], [x1, z0], [x0, z1], [x1, z0], [x0, z0]];
    for (const [x, z] of pts) {
      s.pos.push(x, y, z);
      s.uv.push(x, -z);
      s.nor.push(0, 1, 0);
    }
  }
}

/** Draws gathered quads: one mesh per finish, its material shared with every other house. */
function QuadMeshes({ quads }: { quads: Quads }) {
  const meshes = useMemo(() => [...quads.sets].flatMap(([value, s]) => {
    const material = finishMaterial(value);
    if (!material) return [];
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(s.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(s.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(s.uv, 2));
    g.computeBoundingSphere();
    return [{ value, g, material }];
  }), [quads]);
  useLayoutEffect(() => () => meshes.forEach((m) => m.g.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m) => (
        <mesh key={m.value} geometry={m.g} material={m.material} receiveShadow raycast={() => null} />
      ))}
    </>
  );
}

/** A box along a face: `a0`-`a1` along the edge, `y0`-`y1` up, `d0`-`d1` out from the wall's centre line. */
function FaceBox({ f, a0, a1, y0, y1, d0, d1, c, m, e }: { f: Face | { dir: 'h' | 'v'; x: number; z: number; side: 'a' | 'b' }; a0: number; a1: number; y0: number; y1: number; d0: number; d1: number; c: string; m?: boolean; e?: string }) {
  const { o, u, n } = frame(f);
  const mid = at(o, u, n, (a0 + a1) / 2, (y0 + y1) / 2, (d0 + d1) / 2);
  const len = a1 - a0, dep = Math.abs(d1 - d0), h = y1 - y0;
  const size: V3 = f.dir === 'h' ? [len, h, dep] : [dep, h, len];
  return (
    <mesh position={mid} castShadow={h > 0.2} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={c} roughness={m ? 0.3 : 0.7} metalness={m ? 0.6 : 0} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} />
    </mesh>
  );
}

const darker = (hex: string, k: number) => `#${new Color(hex).multiplyScalar(k).getHexString()}`;

/** Both faces of a wall edge, each with the room it looks into (null outside the house). */
function edgeFaces(layout: HouseLayout, e: { dir: 'h' | 'v'; x: number; z: number }) {
  return (['a', 'b'] as const).map((side) => {
    const f: Face = { dir: e.dir, x: e.x, z: e.z, side };
    return { f, room: roomAt(layout, faceCell(f)) };
  });
}

/** Signature of what changes the built geometry, so batches remount when (and only when) it changes. */
const layoutIds = new WeakMap<HouseLayout, number>();
let nextLayoutId = 1;
const sig = (layout: HouseLayout, finish?: HouseFinish, extra = '') => {
  if (!layoutIds.has(layout)) layoutIds.set(layout, nextLayoutId++);
  return `${layoutIds.get(layout)}|${JSON.stringify(finish ?? {})}|${extra}`;
};

// ── Floors, partitions, skirting, doors ──────────────────────────────────────────────────────────

/** Doorways: one-tile gaps in a run of inside wall. */
function doorways(layout: HouseLayout) {
  const has = (k: string) => layout.edgeSet.has(k);
  const out: { dir: 'h' | 'v'; x: number; z: number }[] = [];
  for (let x = 0; x < layout.width; x++)
    for (let z = 1; z < layout.depth; z++)
      if (!has(`h:${x}:${z}`) && (x === 0 || has(`h:${x - 1}:${z}`)) && (x === layout.width - 1 || has(`h:${x + 1}:${z}`)) && (has(`h:${x - 1}:${z}`) || has(`h:${x + 1}:${z}`)))
        out.push({ dir: 'h', x, z });
  for (let x = 1; x < layout.width; x++)
    for (let z = 0; z < layout.depth; z++)
      if (!has(`v:${x}:${z}`) && (z === 0 || has(`v:${x}:${z - 1}`)) && (z === layout.depth - 1 || has(`v:${x}:${z + 1}`)) && (has(`v:${x}:${z - 1}`) || has(`v:${x}:${z + 1}`)))
        out.push({ dir: 'v', x, z });
  return out;
}

const FRAME_WOOD = '#6b4426';
const DOOR_WOOD = '#8b5a2b';

/** A panelled door leaf, hinged at the origin and `w` wide along +x when shut, `h` tall. */
function DoorLeaf({ w, h, c = DOOR_WOOD }: { w: number; h: number; c?: string }) {
  const panel = darker(c, 0.82);
  return (
    <group>
      <mesh position={[w / 2, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.04]} />
        <meshStandardMaterial color={c} roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) =>
        [0.28, 0.7].filter((k) => k * h + 0.2 < h).map((k) => (
          <mesh key={`${s}${k}`} position={[w / 2, h * k, s * 0.022]}>
            <boxGeometry args={[w * 0.66, Math.min(0.5, h * 0.3), 0.006]} />
            <meshStandardMaterial color={panel} roughness={0.6} />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[w - 0.08, Math.min(h - 0.08, 0.95), s * 0.035]}>
          <sphereGeometry args={[0.025, 10, 8]} />
          <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** An open inside door in a gap, cut down with the walls round it: frame both sides, the leaf swung back to the wall. */
function InnerDoor({ e }: { e: { dir: 'h' | 'v'; x: number; z: number } }) {
  const horiz = e.dir === 'h';
  const jamb: V3 = horiz ? [0.07, SHORT, T + 0.05] : [T + 0.05, SHORT, 0.07];
  const p = (a: number): V3 => (horiz ? [e.x + a, SHORT / 2, e.z] : [e.x, SHORT / 2, e.z + a]);
  // Hinged on the low end, standing open a little past square into the high side (+z or +x).
  const yaw = horiz ? -Math.PI * 0.6 : Math.PI * 0.1;
  const hinge: V3 = horiz ? [e.x + 0.06, 0, e.z + T / 2 + 0.02] : [e.x + T / 2 + 0.02, 0, e.z + 0.06];
  return (
    <group>
      <mesh position={p(0.035)} castShadow>
        <boxGeometry args={jamb} />
        <meshStandardMaterial color={FRAME_WOOD} roughness={0.6} />
      </mesh>
      <mesh position={p(1 - 0.035)} castShadow>
        <boxGeometry args={jamb} />
        <meshStandardMaterial color={FRAME_WOOD} roughness={0.6} />
      </mesh>
      <group position={hinge} rotation={[0, yaw, 0]}>
        <DoorLeaf w={0.84} h={SHORT - 0.04} />
      </group>
    </group>
  );
}

/** A 13 A socket: plate and three slots. */
function Socket({ f, a, y }: { f: Face; a: number; y: number }) {
  return (
    <group>
      <FaceBox f={f} a0={a - 0.045} a1={a + 0.045} y0={y - 0.045} y1={y + 0.045} d0={T / 2} d1={T / 2 + 0.012} c="#f4f4f2" />
      <FaceBox f={f} a0={a - 0.006} a1={a + 0.006} y0={y + 0.008} y1={y + 0.026} d0={T / 2 + 0.01} d1={T / 2 + 0.0135} c="#2a2a2a" />
      <FaceBox f={f} a0={a - 0.026} a1={a - 0.014} y0={y - 0.022} y1={y - 0.01} d0={T / 2 + 0.01} d1={T / 2 + 0.0135} c="#2a2a2a" />
      <FaceBox f={f} a0={a + 0.014} a1={a + 0.026} y0={y - 0.022} y1={y - 0.01} d0={T / 2 + 0.01} d1={T / 2 + 0.0135} c="#2a2a2a" />
    </group>
  );
}

/**
 * Everything inside that stands still: floor finishes, skins on the short inside walls and on the inside faces of the
 * outer walls are elsewhere (they move with their side). Skirting, sockets and the inside doors.
 */
export function HouseInterior({ layout, finish, innerColour }: { layout: HouseLayout; finish?: HouseFinish; innerColour: string }) {
  const rooms = useMemo(() => interiorRooms(layout), [layout]);
  const quads = useMemo(() => {
    const q = new Quads();
    for (const r of rooms) {
      const v = finish?.floor?.[r.name];
      if (v && FLOOR_BY_ID[v]) q.floor(v, r.x0, r.z0, r.x1, r.z1, 0.008);
    }
    // Skins on the short inside walls: both faces of each partition, up to its cut-down top.
    for (const e of layout.edges) {
      if (e.tall || e.kind !== 'wall') continue;
      for (const { f, room } of edgeFaces(layout, e)) {
        if (!room) continue;
        const v = faceValue(layout, finish, f);
        if (!v) continue;
        const { o, u, n } = frame(f);
        const along = e.dir === 'h' ? e.x : e.z;
        q.add(v, at(o, u, n, 0, 0, SKIN), at(o, u, n, 1, 0, SKIN), 0, SHORT, n, along, along + 1, 0, SHORT);
      }
    }
    return q;
  }, [layout, rooms, finish]);

  const doors = useMemo(() => doorways(layout), [layout]);

  // Skirting round every room, in a shade of its floor (tile skirting, the Nigerian way); a socket or two per room.
  const trims = useMemo(() => {
    const skirting: { f: Face; c: string }[] = [];
    const sockets: { f: Face; a: number }[] = [];
    for (const r of rooms) {
      const floor = finish?.floor?.[r.name];
      const c = darker(floor ? FLOOR_BY_ID[floor]?.base ?? r.a : r.a, 0.72);
      const faces = roomFaces(layout, r);
      for (const f of faces) skirting.push({ f, c });
      faces.forEach((f, i) => { if (i % 5 === 2) sockets.push({ f, a: 0.3 }); });
    }
    return { skirting, sockets };
  }, [layout, rooms, finish]);

  const key = sig(layout, finish, innerColour);
  return (
    <group>
      <QuadMeshes quads={quads} />
      <StaticBatch key={key}>
        {trims.skirting.map(({ f, c }, i) => (
          <FaceBox key={i} f={f} a0={-T / 2} a1={1 + T / 2} y0={0} y1={0.09} d0={T / 2} d1={T / 2 + 0.014} c={c} />
        ))}
        {trims.sockets.map(({ f, a }, i) => <Socket key={`s${i}`} f={f} a={a} y={0.32} />)}
        {doors.map((e) => <InnerDoor key={`${e.dir}${e.x}:${e.z}`} e={e} />)}
      </StaticBatch>
    </group>
  );
}

// ── The outer walls, side by side ────────────────────────────────────────────────────────────────

const inwardFaces = (layout: HouseLayout, e: Edge) => edgeFaces(layout, e).filter((x) => x.room);

/**
 * Parts of one outer side that stretch with it: the wall round each window (whole when the side is cut down, with
 * the opening when it stands), finish skins on its inside faces, and the front door with the wall over it.
 * Lives inside WallSide's scaled group, so everything is built one unit tall and the group stretches it.
 */
export function SideScaled({ edges, layout, finish, wall, innerColour, height }: {
  edges: Edge[]; layout: HouseLayout; finish?: HouseFinish; wall: string; innerColour: string; height: MutableRefObject<number>;
}) {
  const tallOnly = useRef<Group>(null!);
  const shortOnly = useRef<Group>(null!);
  useFrame(() => {
    const up = height.current > 2;
    if (tallOnly.current) tallOnly.current.visible = up;
    if (shortOnly.current) shortOnly.current.visible = !up;
  });
  const windows = useMemo(() => edges.filter((e) => edgeHasWindow(e, layout)), [edges, layout]);
  // Inside faces: a finish if the room has one, else the inside wall colour (not the outside paint, as it used to be).
  const { always, tall, short } = useMemo(() => {
    const always = new Quads(), tall = new Quads(), short = new Quads();
    const k = 1 / TALL;
    for (const e of edges) {
      const win = windows.includes(e);
      for (const { f } of inwardFaces(layout, e)) {
        const v = faceValue(layout, finish, f) ?? innerColour;
        const { o, u, n } = frame(f);
        const along = e.dir === 'h' ? e.x : e.z;
        const q = (into: Quads, a0: number, a1: number, y0: number, y1: number) =>
          into.add(v, at(o, u, n, a0, 0, SKIN), at(o, u, n, a1, 0, SKIN), y0 * k, y1 * k, n, along + a0, along + a1, y0, y1);
        if (!win) q(always, 0, 1, 0, TALL);
        else {
          q(short, 0, 1, 0, TALL);
          q(tall, 0, 1, 0, SILL);
          q(tall, 0, 1, HEAD, TALL);
          q(tall, 0, WIN_A, SILL, HEAD);
          q(tall, WIN_B, 1, SILL, HEAD);
        }
      }
    }
    return { always, tall, short };
  }, [edges, windows, layout, finish, innerColour]);

  // The wall round each window: whole, or cut round the opening.
  const k = 1 / TALL;
  const piece = (e: Edge, a0: number, a1: number, y0: number, y1: number, key: string) => {
    const horiz = e.dir === 'h';
    const len = a1 - a0 + (a0 === 0 ? T / 2 : 0) + (a1 === 1 ? T / 2 : 0);
    const mid = (a0 - (a0 === 0 ? T / 2 : 0) + a1 + (a1 === 1 ? T / 2 : 0)) / 2;
    return (
      <mesh key={key} position={horiz ? [e.x + mid, ((y0 + y1) / 2) * k, e.z] : [e.x, ((y0 + y1) / 2) * k, e.z + mid]} castShadow receiveShadow>
        <boxGeometry args={horiz ? [len, (y1 - y0) * k, T] : [T, (y1 - y0) * k, len]} />
        <meshStandardMaterial color={wall} flatShading />
      </mesh>
    );
  };

  // The front door, if it is on this side: wall over it, a frame, and the door standing open.
  const entry = layout.entry;
  const doorEdge = entry.side === 'south' ? { dir: 'h' as const, x: entry.at, z: layout.depth }
    : entry.side === 'north' ? { dir: 'h' as const, x: entry.at, z: 0 } : { dir: 'v' as const, x: 0, z: entry.at };
  const mine = edges.length > 0 && edges[0].dir === doorEdge.dir && (doorEdge.dir === 'h' ? edges[0].z === doorEdge.z : edges[0].x === doorEdge.x);
  const inward = entry.side === 'south' ? -1 : 1;

  const key = sig(layout, finish, `${wall}|${innerColour}|${windows.length}`);
  return (
    <group>
      <QuadMeshes quads={always} />
      <group ref={tallOnly}>
        <QuadMeshes quads={tall} />
        <StaticBatch key={`t${key}`}>
          {windows.flatMap((e, i) => [
            piece(e, 0, 1, 0, SILL, `${i}a`), piece(e, 0, 1, HEAD, TALL, `${i}b`),
            piece(e, 0, WIN_A, SILL, HEAD, `${i}c`), piece(e, WIN_B, 1, SILL, HEAD, `${i}d`),
          ])}
        </StaticBatch>
      </group>
      <group ref={shortOnly} visible={false}>
        <QuadMeshes quads={short} />
        <StaticBatch key={`s${key}`}>{windows.map((e, i) => piece(e, 0, 1, 0, TALL, `${i}`))}</StaticBatch>
      </group>
      {mine && (
        <group>
          <StaticBatch key={`d${key}`}>
            {piece({ ...doorEdge, kind: 'wall', tall: true }, 0, 1, DOOR_H, TALL, 'lintel')}
            {[0.035, 0.965].map((a) => (
              <mesh key={a} position={doorEdge.dir === 'h' ? [doorEdge.x + a, (DOOR_H / 2) * k, doorEdge.z] : [doorEdge.x, (DOOR_H / 2) * k, doorEdge.z + a]} castShadow>
                <boxGeometry args={doorEdge.dir === 'h' ? [0.07, DOOR_H * k, T + 0.05] : [T + 0.05, DOOR_H * k, 0.07]} />
                <meshStandardMaterial color={FRAME_WOOD} roughness={0.6} />
              </mesh>
            ))}
            <mesh position={doorEdge.dir === 'h' ? [doorEdge.x + 0.5, (DOOR_H - 0.03) * k, doorEdge.z] : [doorEdge.x, (DOOR_H - 0.03) * k, doorEdge.z + 0.5]}>
              <boxGeometry args={doorEdge.dir === 'h' ? [1, 0.06 * k, T + 0.05] : [T + 0.05, 0.06 * k, 1]} />
              <meshStandardMaterial color={FRAME_WOOD} roughness={0.6} />
            </mesh>
          </StaticBatch>
          {/* A heavy panelled front door, open into the house */}
          <group
            position={doorEdge.dir === 'h' ? [doorEdge.x + 0.07, 0, doorEdge.z + inward * (T / 2 + 0.02)] : [doorEdge.x + T / 2 + 0.02, 0, doorEdge.z + 0.07]}
            rotation={[0, doorEdge.dir === 'h' ? (inward < 0 ? Math.PI * 0.55 : -Math.PI * 0.55) : Math.PI * 0.05, 0]}
            scale={[1, k, 1]}
          >
            <DoorLeaf w={0.86} h={DOOR_H - 0.04} c="#5a3418" />
          </group>
        </group>
      )}
    </group>
  );
}

/** A window seen from inside and out: frame, mullion and transom, sills, glass, and burglar-proof bars. */
function Window({ e, normal }: { e: Edge; normal: [number, number] }) {
  // Faces: 'out' looks out of the house, 'in' into the room.
  const outSide: 'a' | 'b' = (e.dir === 'h' ? normal[1] : normal[0]) < 0 ? 'a' : 'b';
  const inSide: 'a' | 'b' = outSide === 'a' ? 'b' : 'a';
  const fin: Face = { dir: e.dir, x: e.x, z: e.z, side: inSide };
  const fout: Face = { ...fin, side: outSide };
  const W = '#3d3833'; // bronze aluminium
  const BAR = '#1d1f22';
  const mid = (WIN_A + WIN_B) / 2;
  const half = T / 2 + 0.01;
  return (
    <group>
      {/* Frame round the opening, through the wall's thickness */}
      <FaceBox f={fin} a0={WIN_A} a1={WIN_B} y0={SILL} y1={SILL + 0.05} d0={-half} d1={half} c={W} m />
      <FaceBox f={fin} a0={WIN_A} a1={WIN_B} y0={HEAD - 0.05} y1={HEAD} d0={-half} d1={half} c={W} m />
      <FaceBox f={fin} a0={WIN_A} a1={WIN_A + 0.05} y0={SILL} y1={HEAD} d0={-half} d1={half} c={W} m />
      <FaceBox f={fin} a0={WIN_B - 0.05} a1={WIN_B} y0={SILL} y1={HEAD} d0={-half} d1={half} c={W} m />
      {/* Mullion and a transom for the top vents */}
      <FaceBox f={fin} a0={mid - 0.02} a1={mid + 0.02} y0={SILL} y1={HEAD} d0={-0.03} d1={0.03} c={W} m />
      <FaceBox f={fin} a0={WIN_A} a1={WIN_B} y0={1.64} y1={1.675} d0={-0.03} d1={0.03} c={W} m />
      {/* Glass */}
      <mesh position={at(frame(fin).o, frame(fin).u, frame(fin).n, mid, (SILL + HEAD) / 2, 0)} material={glassMat} renderOrder={3} raycast={() => null} userData={{ dynamic: true }}>
        <boxGeometry args={e.dir === 'h' ? [WIN_B - WIN_A - 0.08, HEAD - SILL - 0.08, 0.008] : [0.008, HEAD - SILL - 0.08, WIN_B - WIN_A - 0.08]} />
      </mesh>
      {/* Sills: a tiled ledge inside, a sloped concrete one outside */}
      <FaceBox f={fin} a0={WIN_A - 0.06} a1={WIN_B + 0.06} y0={SILL - 0.035} y1={SILL} d0={0} d1={T / 2 + 0.09} c="#ece6da" />
      <FaceBox f={fout} a0={WIN_A - 0.05} a1={WIN_B + 0.05} y0={SILL - 0.06} y1={SILL - 0.01} d0={0} d1={T / 2 + 0.08} c="#cfc6b6" />
      {/* Burglar-proof: round bars, two flats and a diamond, on the inside */}
      {[0.22, 0.32, 0.42, 0.58, 0.68, 0.78].map((a) => (
        <FaceBox key={a} f={fin} a0={a - 0.009} a1={a + 0.009} y0={SILL + 0.03} y1={HEAD - 0.03} d0={T / 2 + 0.02} d1={T / 2 + 0.038} c={BAR} m />
      ))}
      {[1.3, 1.72].map((y) => (
        <FaceBox key={y} f={fin} a0={WIN_A + 0.03} a1={WIN_B - 0.03} y0={y} y1={y + 0.025} d0={T / 2 + 0.015} d1={T / 2 + 0.042} c={BAR} m />
      ))}
      <group position={at(frame(fin).o, frame(fin).u, frame(fin).n, mid, 1.51, T / 2 + 0.029)} rotation={[0, e.dir === 'h' ? 0 : Math.PI / 2, Math.PI / 4]}>
        <mesh>
          <boxGeometry args={[0.16, 0.16, 0.012]} />
          <meshStandardMaterial color={BAR} metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Parts of one outer side that only show while it stands tall (cut-down walls hide them): windows, the cornice or
 * POP ceiling along the top, and the light switch by each room's way in. Absolute heights, not scaled.
 */
export function SideTall({ edges, normal, layout, finish }: { edges: Edge[]; normal: [number, number]; layout: HouseLayout; finish?: HouseFinish }) {
  const windows = useMemo(() => edges.filter((e) => edgeHasWindow(e, layout)), [edges, layout]);
  const tops = useMemo(() => {
    const out: { f: Face; room: HouseRoom; pop: string | null }[] = [];
    for (const e of edges) for (const { f, room } of inwardFaces(layout, e)) {
      const c = finish?.ceiling?.[room!.name];
      out.push({ f, room: room!, pop: c && CEILING_BY_ID[c] && c !== 'plain' ? c : null });
    }
    return out;
  }, [edges, layout, finish]);
  // One switch per room on this side: on its face nearest a corner.
  const switches = useMemo(() => {
    const seen = new Set<string>();
    return tops.filter((t) => !windows.some((w) => w.dir === t.f.dir && w.x === t.f.x && w.z === t.f.z) && !seen.has(t.room.name) && seen.add(t.room.name));
  }, [tops, windows]);

  return (
    <StaticBatch key={sig(layout, finish, `${normal}`)}>
      {windows.map((e) => <Window key={`${e.x}:${e.z}`} e={e} normal={normal} />)}
      {tops.map(({ f, pop }, i) => pop ? (
        // Stepped POP border: a deep upper tier, a shallow lower one, and the cove where the light hides.
        <group key={i}>
          <FaceBox f={f} a0={-T / 2} a1={1 + T / 2} y0={TALL - 0.12} y1={TALL} d0={T / 2} d1={T / 2 + 0.46} c={CEILING_BY_ID[pop].trim} />
          <FaceBox f={f} a0={-T / 2} a1={1 + T / 2} y0={TALL - 0.24} y1={TALL - 0.12} d0={T / 2} d1={T / 2 + 0.24} c={darker(CEILING_BY_ID[pop].trim, 0.93)} />
          {/* The upturned lip that hides the cove light */}
          <FaceBox f={f} a0={-T / 2} a1={1 + T / 2} y0={TALL} y1={TALL + 0.05} d0={T / 2 + 0.42} d1={T / 2 + 0.46} c={darker(CEILING_BY_ID[pop].trim, 0.9)} />
          {pop === 'pop_gold' && <FaceBox f={f} a0={-T / 2} a1={1 + T / 2} y0={TALL - 0.135} y1={TALL - 0.115} d0={T / 2 + 0.24} d1={T / 2 + 0.465} c="#c9a227" m />}
          <mesh position={at(frame(f).o, frame(f).u, frame(f).n, 0.5, TALL + 0.006, T / 2 + 0.38)} material={coveMat} userData={{ dynamic: true }}>
            <boxGeometry args={f.dir === 'h' ? [1 + T, 0.012, 0.06] : [0.06, 0.012, 1 + T]} />
          </mesh>
        </group>
      ) : (
        <FaceBox key={i} f={f} a0={-T / 2} a1={1 + T / 2} y0={TALL - 0.08} y1={TALL} d0={T / 2} d1={T / 2 + 0.05} c="#f4f1ea" />
      ))}
      {switches.map(({ f }, i) => (
        <group key={`sw${i}`}>
          <FaceBox f={f} a0={0.82} a1={0.9} y0={1.21} y1={1.33} d0={T / 2} d1={T / 2 + 0.012} c="#f4f4f2" />
          <FaceBox f={f} a0={0.845} a1={0.875} y0={1.255} y1={1.29} d0={T / 2 + 0.01} d1={T / 2 + 0.018} c="#d9d9d6" />
        </group>
      ))}
    </StaticBatch>
  );
}
