// Inside the compound at home (three/World.tsx): the carport over the car bay and the doors out of the house.
// The bay is part of the house grid (game/grid.ts BAY_ROWS), so you walk to your cars from the front or side door
// and tap one for its actions (ui/ParkedCar.tsx). The canopy is the owner's carport style and colour from the outside
// settings (game/exterior.ts), like the one on the estate plot: a sloped sheet, a curved polycarbonate canopy or a
// tensile shade, on slim steel posts over interlocking pavers. Merged per colour with the place kit.

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, MeshStandardMaterial, type Group } from 'three';
import { sky } from '../game/weather';
import type { HouseLayout } from '../game/grid';
import { exteriorHex, type Exterior } from '../game/exterior';
import './cityModels';
import { KitModel } from './placeKit';
import { HousePen, shade } from './houseKit';

const STEEL = '#64748b';
const PAVER = '#8f8a81';

/** The carport over the cars standing in the bay, sized to them. */
export function HomeCarport({ layout, ext }: { layout: HouseLayout; ext: Pick<Exterior, 'carport' | 'carportColour'> }) {
  if (!layout.bay || !layout.cars.length) return null;
  const sig = `${layout.cars.map((c) => `${c.x},${c.z}`).join('|')}|${ext.carport}|${ext.carportColour}`;
  return (
    <KitModel
      deps={[sig]}
      build={(low) => {
        const k = new HousePen();
        const bay = layout.bay!;
        const x0 = Math.min(...layout.cars.map((c) => c.x)) - 0.45;
        const x1 = Math.max(...layout.cars.map((c) => c.x)) + 2.45;
        const z0 = bay.z0 + 0.55, z1 = bay.z0 + 5.45;
        const h = 2.45;
        const colour = exteriorHex(ext.carportColour, '#94a3b8');
        // Pavers: the joints of an interlocking floor over the bay.
        if (!low) {
          for (let z = bay.z0 + 0.5; z < bay.z1; z += 0.5) k.flat('#7e796f', x0 - 0.3, z - 0.02, x1 + 0.3, z + 0.02, 0.012);
          for (let x = Math.ceil(x0); x < x1; x += 1) k.flat('#7e796f', x - 0.02, bay.z0 + 0.1, x + 0.02, bay.z1 - 0.1, 0.012);
        } else {
          k.flat(PAVER, x0 - 0.3, bay.z0 + 0.1, x1 + 0.3, bay.z1 - 0.1, 0.01);
        }
        // Posts down both long sides, one between every two cars.
        const n = Math.max(2, layout.cars.length + 1);
        for (let i = 0; i < n; i++) {
          const x = x0 + ((x1 - x0) * i) / (n - 1);
          for (const z of [z0, z1]) {
            k.post(STEEL, [x, 0, z], 0.06, h + (ext.carport === 'sloped' && z === z0 ? 0.35 : 0), 8);
            k.box('#4b5563', [x, 0.04, z], [0.22, 0.08, 0.22]);
          }
        }
        if (ext.carport === 'curved') {
          // Bent polycarbonate: strips round an arch over the depth, the steel ribs under them.
          const seg = low ? 4 : 8, rise = 0.8, half = (z1 - z0) / 2 + 0.25, zc = (z0 + z1) / 2;
          const at = (a: number): [number, number] => [zc - Math.cos(a) * half, h + Math.sin(a) * rise];
          for (let i = 0; i < seg; i++) {
            const [za, ya] = at((Math.PI * i) / seg), [zb, yb] = at((Math.PI * (i + 1)) / seg);
            k.quad(colour, [x0 - 0.3, ya, za], [x1 + 0.3, ya, za], [x1 + 0.3, yb, zb], [x0 - 0.3, yb, zb], [0, 1, 0]);
            k.quad(shade(colour, 0.8), [x1 + 0.3, ya, za], [x0 - 0.3, ya, za], [x0 - 0.3, yb, zb], [x1 + 0.3, yb, zb], [0, -1, 0]);
          }
          for (let i = 0; i < n; i++) {
            const x = x0 + ((x1 - x0) * i) / (n - 1);
            for (let j = 0; j < seg; j++) {
              const [za, ya] = at((Math.PI * j) / seg), [zb, yb] = at((Math.PI * (j + 1)) / seg);
              k.bar(STEEL, [x, ya - 0.04, za], [x, yb - 0.04, zb], 0.07);
            }
          }
        } else if (ext.carport === 'tensile') {
          // Fabric sails off tall masts at the back, pulled down to the front posts.
          const masts = Math.max(1, layout.cars.length);
          for (let i = 0; i < masts; i++) {
            const a = x0 + ((x1 - x0) * i) / masts, b = x0 + ((x1 - x0) * (i + 1)) / masts, m = (a + b) / 2;
            k.post(STEEL, [m, 0, z0 - 0.15], 0.07, h + 1.1, 8);
            const top: [number, number, number] = [m, h + 1.1, z0 - 0.15];
            const fl: [number, number, number] = [a, h - 0.1, z1 + 0.2], fr: [number, number, number] = [b, h - 0.1, z1 + 0.2];
            const mid: [number, number, number] = [m, h + 0.25, z1 + 0.3];
            k.tri(colour, top, fl, mid, [0, 1, 0.4]);
            k.tri(shade(colour, 0.85), top, mid, fl, [0, -1, -0.4]);
            k.tri(colour, top, mid, fr, [0, 1, 0.4]);
            k.tri(shade(colour, 0.85), top, fr, mid, [0, -1, -0.4]);
            k.bar('#334155', top, fl, 0.02);
            k.bar('#334155', top, fr, 0.02);
          }
        } else {
          // One run of long-span sheets falling to the front, ribbed.
          const tilt = Math.atan2(0.35, z1 - z0);
          k.box(colour, [(x0 + x1) / 2, h + 0.2, (z0 + z1) / 2], [x1 - x0 + 0.6, 0.06, z1 - z0 + 0.5], [tilt, 0, 0]);
          if (!low) for (let x = x0 - 0.2; x <= x1 + 0.2; x += 0.35) k.box(shade(colour, 0.82), [x, h + 0.25, (z0 + z1) / 2], [0.04, 0.04, z1 - z0 + 0.5], [tilt, 0, 0]);
          k.box(STEEL, [(x0 + x1) / 2, h + 0.36, z0], [x1 - x0 + 0.2, 0.1, 0.1]);
          k.box(STEEL, [(x0 + x1) / 2, h + 0.02, z1], [x1 - x0 + 0.2, 0.1, 0.1]);
        }
        // A light under the canopy for the night.
        k.box('lamp1', [(x0 + x1) / 2, h - 0.05, (z0 + z1) / 2], [0.5, 0.06, 0.14]);
        k.pool((x0 + x1) / 2, (z0 + z1) / 2, 2.2, 0.25);
        return k.done();
      }}
    />
  );
}

/** Wall heights in World.tsx: a wall facing the camera drops from TALL to SHORT so you can see in. */
const TALL = 2.6;
const SHORT = 0.9;

/** Doors in the doorways out of the house: the front door (a panelled double door) and the side door to the yard. */
export function HouseDoors({ layout, trim }: { layout: HouseLayout; trim: string }) {
  // Each wall's doors drop with that wall when it faces the camera, like the wall itself does.
  const faces = new Map<string, HouseLayout['doors']>();
  for (const d of layout.doors) {
    const key = d.dir === 'h' ? (d.z === 0 ? '0,-1' : '0,1') : d.x === 0 ? '-1,0' : '1,0';
    faces.set(key, [...(faces.get(key) ?? []), d]);
  }
  return (
    <group>
      {[...faces].map(([key, doors]) => (
        <FollowWall key={key} normal={key.split(',').map(Number) as [number, number]} center={{ x: layout.width / 2, z: layout.depth / 2 }}>
          <DoorSet doors={doors} trim={trim} />
        </FollowWall>
      ))}
    </group>
  );
}

function FollowWall({ normal, center, children }: { normal: [number, number]; center: { x: number; z: number }; children: ReactNode }) {
  const ref = useRef<Group>(null!);
  const k = useRef(1);
  useFrame(({ camera }, dt) => {
    const facing = normal[0] * (camera.position.x - center.x) + normal[1] * (camera.position.z - center.z) > 0;
    k.current += ((facing ? SHORT / TALL : 1) - k.current) * Math.min(1, dt * 8);
    ref.current.scale.y = k.current;
  });
  return <group ref={ref}>{children}</group>;
}

function DoorSet({ doors, trim }: { doors: HouseLayout['doors']; trim: string }) {
  const sig = doors.map((d) => `${d.dir}${d.x},${d.z}${d.front ? 'f' : ''}`).join('|');
  return (
    <KitModel
      deps={[sig, trim]}
      build={() => {
        const k = new HousePen();
        for (const d of doors) {
          const H = 2.15, W = 1;
          // Along the wall (x for a south/north wall, z for a west/east one) and out of it.
          const along = d.dir === 'h';
          const cx = along ? d.x + 0.5 : d.x, cz = along ? d.z : d.z + 0.5;
          const jamb = (o: number): [number, number, number] => (along ? [cx + o, H / 2, cz] : [cx, H / 2, cz + o]);
          k.box(trim, jamb(-W / 2 + 0.04), along ? [0.1, H, 0.2] : [0.2, H, 0.1]);
          k.box(trim, jamb(W / 2 - 0.04), along ? [0.1, H, 0.2] : [0.2, H, 0.1]);
          k.box(trim, along ? [cx, H + 0.05, cz] : [cx, H + 0.05, cz], along ? [W, 0.12, 0.22] : [0.22, 0.12, W]);
          // The leaf, swung open into the room so the doorway stays clear.
          const leaf = d.front ? '#5b3317' : '#475569';
          const lw = (W - 0.12) / (d.front ? 2 : 1);
          const leaves = d.front ? [-1, 1] : [1];
          for (const s of leaves) {
            const hinge = s * (W / 2 - 0.08);
            const open = 1.25; // radians from shut
            const ang = s * open;
            const mx = Math.cos(ang) * (lw / 2), mz = Math.sin(ang) * (lw / 2);
            // In from the wall (towards -z for a south wall, -x for an east one).
            const pos: [number, number, number] = along ? [cx + hinge - s * mx, (H - 0.1) / 2, cz - Math.abs(mz)] : [cx - Math.abs(mz), (H - 0.1) / 2, cz + hinge - s * mx];
            const rot: [number, number, number] = along ? [0, ang, 0] : [0, ang + Math.PI / 2, 0];
            k.box(leaf, pos, [lw, H - 0.1, 0.06], rot);
            k.box('#d4a72c', [pos[0], 1.05, pos[2]], [0.06, 0.06, 0.1], rot);
          }
          // The step outside.
          k.box('#a8a29e', along ? [cx, 0.05, cz + 0.35] : [cx + 0.35, 0.05, cz], along ? [W + 0.3, 0.1, 0.5] : [0.5, 0.1, W + 0.3]);
        }
        return k.done();
      }}
    />
  );
}

/**
 * Rain puddles on the compound's open ground, never inside the house: flat sheets of water that fade in with the wet
 * (game/weather.ts sky.wet, which lingers after the rain stops) and dry away again. Placed from the layout alone, so
 * the same yard always has its puddles in the same hollows, clear of the cars' bay, the gate path and the fence.
 */
export function YardPuddles({ layout, low }: { layout: HouseLayout; low?: boolean }) {
  const group = useRef<Group>(null!);
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#8fb4d0', roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: DoubleSide }), []);
  const puddles = useMemo(() => {
    let seed = (layout.gridW * 73856093) ^ (layout.gridH * 19349663) ^ (layout.depth * 83492791);
    const rnd = () => {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909);
      return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
    };
    const out: { x: number; z: number; rx: number; rz: number; yaw: number }[] = [];
    const want = low ? 4 : 9;
    for (let tries = 0; out.length < want && tries < 200; tries++) {
      const rx = 0.45 + rnd() * 0.7, rz = rx * (0.55 + rnd() * 0.4);
      const x = 0.8 + rnd() * (layout.gridW - 1.6), z = 0.8 + rnd() * (layout.gridH - 1.6);
      // Open ground only: not under the house, not in the cars' bay, not on the path from the gate, not on another puddle.
      const inHouse = x > -rx && x < layout.width + rx && z > -rz && z < layout.depth + rz;
      const inBay = !!layout.bay && z > layout.bay.z0 - rz && z < layout.bay.z1 + rz && layout.cars.length > 0;
      const onPath = Math.abs(x - (layout.gate.x + 0.5)) < 0.9 + rx;
      const clash = out.some((o) => Math.hypot(o.x - x, o.z - z) < o.rx + rx + 0.4);
      if (inHouse || inBay || onPath || clash) continue;
      out.push({ x, z, rx, rz, yaw: rnd() * Math.PI });
    }
    return out;
  }, [layout, low]);
  useFrame(() => {
    const wet = sky.wet;
    group.current.visible = wet > 0.04;
    mat.opacity = 0.72 * wet;
  });
  return (
    <group ref={group} visible={false}>
      {puddles.map((p, i) => (
        <mesh key={i} position={[p.x, 0.018, p.z]} rotation={[-Math.PI / 2, 0, p.yaw]} scale={[p.rx, p.rz, 1]} material={mat} raycast={() => null}>
          <circleGeometry args={[1, 20]} />
        </mesh>
      ))}
    </group>
  );
}
