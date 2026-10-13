// Props for the places of trade and transport: the train station, the refinery control room, the textile mill,
// the buka, the market, the suya spot and the motor park. Centred on the footprint, on y=0, front facing +z.

import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { B, BAGS, Ball, CHROME, Cyl, Label, STEEL, Table, type Model, type V3 } from '../propKit';

const ACROSS: V3 = [0, 0, Math.PI / 2];
const ALONG: V3 = [Math.PI / 2, 0, 0];
const WOOD = '#7c4a24';
const DARK_WOOD = '#5a3418';
const GREEN = '#15803d';
const CLOTH = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0d9488', '#db2777'];

function Cone({ p, r, h, c, e }: { p: V3; r: number; h: number; c: string; e?: string }) {
  return (
    <mesh position={p} castShadow>
      <coneGeometry args={[r, h, 8]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} flatShading />
    </mesh>
  );
}

/** Puffs rising off a fire. Moves, so it sits outside the merged static meshes. */
function Smoke({ p, s = 1 }: { p: V3; s?: number }) {
  const ref = useRef<Group>(null!);
  useFrame(({ clock }) => {
    ref.current.children.forEach((m, i) => {
      const t = (clock.elapsedTime * 0.45 + i / 4) % 1;
      m.position.set(Math.sin(t * 6 + i) * 0.18 * s, t * 1.9 * s, 0);
      m.scale.setScalar((0.12 + t * 0.28) * s);
      ((m as Mesh).material as MeshStandardMaterial).opacity = 0.45 * (1 - t);
    });
  });
  return (
    <group ref={ref} position={p} userData={{ dynamic: true }}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#d6d3d1" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A trader's table: plank top on four legs, the goods go on y=0.76. */
function Trestle({ w = 1.8, children }: { w?: number; children?: ReactNode }) {
  return (
    <group position={[0, 0, 0.1]}>
      <B p={[0, 0.72, 0]} s={[w, 0.07, 0.66]} c={WOOD} />
      {[-1, 1].map((sx) => [-1, 1].map((sz) => <B key={`${sx}${sz}`} p={[(sx * (w - 0.12)) / 2, 0.35, sz * 0.27]} s={[0.07, 0.7, 0.07]} c={DARK_WOOD} />))}
      {children}
    </group>
  );
}

/** Enamel basin heaped with something. */
function Basin({ p, c, heap, r = 0.2 }: { p: V3; c: string; heap: string; r?: number }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0.06, 0]} r={r * 0.8} rt={r} h={0.12} c={c} />
      <Cone p={[0, 0.2, 0]} r={r * 0.9} h={0.2} c={heap} />
    </group>
  );
}

function Ram({ p, c, ry = 0 }: { p: V3; c: string; ry?: number }) {
  return (
    <group position={p} rotation-y={ry}>
      <B p={[0, 0.55, 0]} s={[0.36, 0.38, 0.8]} c={c} />
      <B p={[0, 0.78, 0.48]} s={[0.24, 0.26, 0.3]} c={c} />
      <B p={[0, 0.9, 0.42]} s={[0.4, 0.08, 0.1]} c="#44403c" />
      {[-0.12, 0.12].map((x) => [-0.28, 0.28].map((z) => <B key={`${x}${z}`} p={[x, 0.18, z]} s={[0.07, 0.36, 0.07]} c="#44403c" />))}
    </group>
  );
}

/** The colour a loom or vat works in, from the word the layout gives it. */
const DYES: Record<string, string> = { red: '#dc2626', blue: '#1d4ed8', green: '#16a34a', yellow: '#f59e0b', purple: '#9333ea', indigo: '#312e81', pink: '#db2777', teal: '#0d9488' };
const dye = (text?: string) => DYES[text ?? ''] ?? '#2563eb';

const TRAINS = [
  ['KT 01', 'KANO', '07:10', 'BOARDING'],
  ['LG 14', 'LAGOS', '08:30', 'ON TIME'],
  ['ZR 05', 'ZARIA', '09:00', 'ON TIME'],
  ['MN 22', 'MINNA', '10:15', 'DELAYED'],
  ['KF 08', 'KAFANCHAN', '11:40', 'ON TIME'],
];
const MENU = [['TUWO & MIYA', '800'], ['MASA (4)', '500'], ['INDOMIE + EGG', '1,200'], ['DANWAKE', '400'], ['SHAYI & BREAD', '300']];

export const TRADE_PROPS: Record<string, Model> = {
  /* ---------- Train station ---------- */

  // Doors in the back wall out to the platform: yellow tactile mat, open glass leaves, the platform's name over them.
  station_gate: ({ text = 'PLATFORM 1' }) => (
    <group>
      <B p={[0, 0.012, 0]} s={[1.7, 0.02, 0.92]} c="#facc15" />
      {[-0.6, -0.2, 0.2, 0.6].map((x) => <B key={x} p={[x, 0.024, 0]} s={[0.1, 0.012, 0.7]} c="#ca8a04" />)}
      <group position={[0, 0, -0.5]}>
        {[-0.92, 0.92].map((x) => <B key={x} p={[x, 1.15, 0]} s={[0.12, 2.3, 0.24]} c={GREEN} />)}
        <B p={[0, 2.36, 0]} s={[1.96, 0.14, 0.24]} c={GREEN} />
        {[-0.68, 0.68].map((x) => <B key={`d${x}`} p={[x, 1.14, 0.02]} s={[0.36, 2.2, 0.04]} c="#bfe6f5" o={0.4} />)}
        <B p={[0, 2.72, 0.06]} s={[2.0, 0.52, 0.1]} c="#111827" />
        <Label p={[0, 2.72, 0.115]} w={1.9} h={0.42} text={text} bg="#14532d" glow={0.45} />
      </group>
    </group>
  ),
  // Two ticket barriers side by side: you walk through.
  station_turnstile: () => (
    <group>
      {[-0.92, 0, 0.92].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <B p={[0, 0.5, 0]} s={[0.2, 1.0, 0.86]} c={CHROME} />
          <B p={[0, 1.02, 0]} s={[0.22, 0.04, 0.88]} c="#475569" />
          <B p={[0, 1.045, 0.3]} s={[0.12, 0.012, 0.14]} c="#22c55e" e="#22c55e" />
        </group>
      ))}
      {[-0.46, 0.46].map((x) => (
        <group key={`g${x}`}>
          <B p={[x - 0.2, 0.7, -0.1]} s={[0.22, 0.4, 0.03]} c="#f97316" o={0.75} />
          <B p={[x + 0.2, 0.7, -0.1]} s={[0.22, 0.4, 0.03]} c="#f97316" o={0.75} />
        </group>
      ))}
    </group>
  ),
  // Ticket office: two windows behind glass, the clerk sits inside.
  station_tickets: ({ text = 'TICKETS' }) => (
    <group>
      <B p={[0, 0.55, 0.28]} s={[2.84, 1.1, 0.36]} c="#f8fafc" />
      <B p={[0, 0.5, 0.465]} s={[2.84, 0.22, 0.01]} c={GREEN} />
      <B p={[0, 1.12, 0.3]} s={[2.9, 0.05, 0.44]} c="#e2e8f0" />
      <B p={[0, 1.6, 0.42]} s={[2.8, 0.9, 0.03]} c="#bfe6f5" o={0.3} />
      {[-1.4, 0, 1.4].map((x) => <B key={x} p={[x, 1.2, 0.42]} s={[0.08, 2.4, 0.1]} c="#475569" />)}
      {[-0.7, 0.7].map((x) => <B key={`s${x}`} p={[x, 1.2, 0.44]} s={[0.4, 0.12, 0.02]} c="#0f172a" />)}
      {[-0.7, 0.7].map((x) => <B key={`m${x}`} p={[x + 0.3, 1.3, 0.1]} s={[0.36, 0.26, 0.04]} c="#0f172a" />)}
      <B p={[0, 2.28, 0.2]} s={[2.9, 0.46, 0.6]} c="#14532d" />
      <Label p={[0, 2.28, 0.505]} w={2.7} h={0.36} text={text} bg="#14532d" fg="#fef3c7" />
    </group>
  ),
  // On the wall at the +z edge of its cells (rot 1 on the left wall).
  station_board: () => (
    <group position={[0, 0, 0.4]}>
      <B p={[0, 1.75, 0]} s={[2.9, 1.5, 0.1]} c="#0b1220" />
      <Table p={[0, 1.75, -0.055]} w={2.76} h={1.36} title="DEPARTURES" rows={TRAINS} ry={Math.PI} accent="#4ade80" />
    </group>
  ),

  /* ---------- Refinery control room ---------- */

  // Operators' desk under the window: sloped panel of lamps and buttons, a row of low screens.
  refinery_console: () => (
    <group>
      <B p={[0, 0.42, 0]} s={[2.84, 0.84, 0.74]} c="#475569" />
      <group position={[0, 0.9, 0.12]} rotation={[-0.42, 0, 0]}>
        <B p={[0, 0, 0]} s={[2.8, 0.08, 0.6]} c="#1f2937" />
        {[-1.15, -0.75, -0.35, 0.05, 0.45, 0.85, 1.2].map((x, i) => {
          const c = ['#22c55e', '#ef4444', '#facc15', '#22c55e', '#3b82f6', '#f97316', '#22c55e'][i];
          return <B key={x} p={[x, 0.06, i % 2 ? 0.1 : -0.1]} s={[0.16, 0.04, 0.16]} c={c} e={c} />;
        })}
      </group>
      {[-0.95, 0, 0.95].map((x, i) => (
        <group key={x}>
          <B p={[x, 1.18, -0.24]} s={[0.78, 0.44, 0.06]} c="#0f172a" />
          <B p={[x, 1.18, -0.205]} s={[0.7, 0.36, 0.01]} c={['#14532d', '#0c4a6e', '#14532d'][i]} e={['#16a34a', '#0284c7', '#16a34a'][i]} />
        </group>
      ))}
      <B p={[1.25, 0.9, 0.28]} s={[0.2, 0.08, 0.14]} c="#dc2626" />
    </group>
  ),
  // The plant drawn as a diagram on the wall, lamps showing what is running (hung at the +z edge of its cells).
  refinery_mimic: () => (
    <group position={[0, 1.7, 0.4]}>
      <B p={[0, 0, 0]} s={[2.9, 1.5, 0.1]} c="#0f172a" />
      <Label p={[0, 0.6, -0.055]} w={2.7} h={0.22} text="PROCESS OVERVIEW" bg="#facc15" fg="#111827" ry={Math.PI} />
      {[0.25, -0.15, -0.5].map((y, i) => <B key={y} p={[0, y, -0.056]} s={[2.5, 0.04, 0.01]} c={['#38bdf8', '#f59e0b', '#38bdf8'][i]} e={['#0ea5e9', '#d97706', '#0ea5e9'][i]} />)}
      {[-0.9, -0.3, 0.4, 1.0].map((x, i) => (
        <group key={x}>
          <B p={[x, 0.05, -0.057]} s={[0.04, 0.4, 0.01]} c="#f59e0b" e="#d97706" />
          <B p={[x, -0.32, -0.06]} s={[0.3, 0.34, 0.01]} c="#e5e7eb" />
          <B p={[x, 0.36, -0.06]} s={[0.1, 0.1, 0.01]} c={i === 2 ? '#ef4444' : '#22c55e'} e={i === 2 ? '#ef4444' : '#22c55e'} />
        </group>
      ))}
    </group>
  ),
  // Pipe manifold with its valve wheels and gauges.
  refinery_valves: () => (
    <group>
      {[0.45, 0.95].map((y, i) => <Cyl key={y} p={[0, y, -0.15]} r={0.1} h={1.96} c={i ? '#9ca3af' : '#f59e0b'} rot={ACROSS} />)}
      {[-0.6, 0.6].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Cyl p={[0, 0.7, -0.15]} r={0.09} h={1.4} c="#9ca3af" />
          <Cyl p={[0, 1.42, -0.15]} r={0.14} h={0.06} c="#64748b" />
          <Cyl p={[0, 0.7, 0.08]} r={0.03} h={0.3} c="#475569" rot={ALONG} />
          <Cyl p={[0, 0.7, 0.24]} r={0.2} h={0.04} c="#dc2626" seg={10} rot={ALONG} />
          <Cyl p={[0.25, 1.2, 0]} r={0.11} h={0.04} c="#f8fafc" seg={10} rot={ALONG} />
          <B p={[0.25, 1.22, 0.025]} s={[0.02, 0.08, 0.01]} c="#dc2626" />
        </group>
      ))}
      {[-0.95, 0.95].map((x) => <B key={x} p={[x, 0.2, -0.15]} s={[0.1, 0.4, 0.3]} c="#475569" />)}
    </group>
  ),
  // Hard hats on their pegs, hi-vis jackets, and the extinguisher by the door.
  refinery_ppe: () => (
    <group>
      <B p={[0, 1.2, -0.38]} s={[1.9, 1.7, 0.06]} c="#334155" />
      <B p={[0, 1.75, -0.2]} s={[1.9, 0.05, 0.36]} c="#64748b" />
      {[-0.7, -0.25, 0.25, 0.7].map((x, i) => (
        <group key={x}>
          <Ball p={[x, 1.86, -0.2]} r={0.17} c={['#facc15', '#f8fafc', '#facc15', '#dc2626'][i]} s={[1, 0.7, 1.1]} />
          <B p={[x, 1.8, -0.06]} s={[0.26, 0.03, 0.14]} c={['#facc15', '#f8fafc', '#facc15', '#dc2626'][i]} />
        </group>
      ))}
      {[-0.55, 0, 0.55].map((x) => (
        <group key={`v${x}`}>
          <B p={[x, 1.15, -0.3]} s={[0.4, 0.7, 0.1]} c="#f97316" />
          <B p={[x, 1.1, -0.245]} s={[0.4, 0.07, 0.01]} c="#e5e7eb" />
        </group>
      ))}
      <Cyl p={[0.8, 0.32, -0.1]} r={0.1} h={0.56} c="#dc2626" />
      <Cyl p={[0.8, 0.64, -0.1]} r={0.04} h={0.1} c="#111827" />
      <B p={[-0.5, 0.12, -0.15]} s={[0.6, 0.24, 0.3]} c="#1f2937" />
    </group>
  ),
  // Steel door out to the plant, set in the back wall: hazard stripes, a warning sign over it.
  refinery_door: ({ text = 'PLANT AREA' }) => (
    <group>
      <B p={[0, 0.012, 0]} s={[1.7, 0.02, 0.92]} c="#facc15" />
      {[-0.6, -0.2, 0.2, 0.6].map((x) => <B key={x} p={[x, 0.024, 0]} s={[0.2, 0.012, 0.92]} c="#111827" />)}
      <group position={[0, 0, -0.5]}>
        {[-0.9, 0.9].map((x) => <B key={x} p={[x, 1.15, 0]} s={[0.14, 2.3, 0.24]} c="#facc15" />)}
        <B p={[0, 2.36, 0]} s={[1.94, 0.14, 0.24]} c="#facc15" />
        <B p={[-0.42, 1.14, 0.02]} s={[0.82, 2.2, 0.06]} c="#64748b" />
        <B p={[-0.42, 1.5, 0.055]} s={[0.4, 0.3, 0.01]} c="#bfe6f5" />
        <group position={[0.84, 0, 0.02]} rotation={[0, -1.1, 0]}>
          <B p={[-0.41, 1.14, 0]} s={[0.82, 2.2, 0.06]} c="#64748b" />
        </group>
        <B p={[0, 2.72, 0.06]} s={[1.9, 0.5, 0.1]} c="#111827" />
        <Label p={[0, 2.72, 0.115]} w={1.8} h={0.4} text={text} bg="#dc2626" glow={0.4} />
      </group>
    </group>
  ),
  refinery_drum: () => (
    <group>
      {[[-0.22, -0.18, '#1d4ed8'], [0.22, -0.1, '#dc2626'], [0, 0.26, '#1d4ed8']].map(([x, z, c], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <Cyl p={[0, 0.42, 0]} r={0.21} h={0.84} c={c as string} />
          <Cyl p={[0, 0.3, 0]} r={0.22} h={0.03} c="#1f2937" />
          <Cyl p={[0, 0.58, 0]} r={0.22} h={0.03} c="#1f2937" />
        </group>
      ))}
    </group>
  ),

  /* ---------- Textile mill ---------- */

  // Power loom: warp beam at the back, harness in the middle, the woven cloth rolling up at the front.
  mill_loom: ({ text }) => {
    const c = dye(text);
    return (
      <group>
        {[-0.92, 0.92].map((x) => (
          <group key={x}>
            <B p={[x, 0.75, -0.3]} s={[0.1, 1.5, 0.1]} c="#44403c" />
            <B p={[x, 0.5, 0.32]} s={[0.1, 1.0, 0.1]} c="#44403c" />
            <B p={[x, 0.3, 0]} s={[0.08, 0.1, 0.72]} c="#44403c" />
          </group>
        ))}
        <B p={[0, 1.5, -0.3]} s={[1.94, 0.1, 0.12]} c="#57534e" />
        <Cyl p={[0, 0.95, -0.3]} r={0.18} h={1.7} c="#f5f0e6" rot={ACROSS} />
        <B p={[0, 1.18, -0.05]} s={[1.7, 0.5, 0.04]} c="#78716c" />
        {[-0.7, -0.42, -0.14, 0.14, 0.42, 0.7].map((x) => <B key={x} p={[x, 1.18, -0.02]} s={[0.03, 0.46, 0.02]} c="#f5f0e6" />)}
        <group position={[0, 0.98, 0.14]} rotation={[0.25, 0, 0]}>
          <B p={[0, 0, 0]} s={[1.6, 0.02, 0.42]} c={c} />
          {[-0.5, 0, 0.5].map((x) => <B key={x} p={[x, 0.012, 0]} s={[0.12, 0.01, 0.42]} c="#fde68a" />)}
        </group>
        <Cyl p={[0, 0.86, 0.34]} r={0.14} h={1.66} c={c} rot={ACROSS} />
        <B p={[1.0, 0.4, -0.3]} s={[0.24, 0.5, 0.34]} c={GREEN} />
      </group>
    );
  },
  // Dye vat, full to the brim, a length of cloth over the rim.
  mill_vat: ({ text }) => {
    const c = dye(text);
    return (
      <group>
        <Cyl p={[0, 0.42, 0]} r={0.44} h={0.84} c="#78716c" seg={14} />
        <Cyl p={[0, 0.845, 0]} r={0.39} h={0.02} c={c} seg={14} />
        <B p={[0.3, 0.7, 0.25]} s={[0.3, 0.5, 0.06]} c={c} />
        <group position={[-0.12, 0.9, -0.05]} rotation={[0.3, 0, 0.35]}>
          <Cyl p={[0, 0.3, 0]} r={0.025} h={1.1} c={DARK_WOOD} />
        </group>
      </group>
    );
  },
  mill_bale: () => (
    <group>
      <B p={[0, 0.26, 0]} s={[0.86, 0.5, 0.7]} c="#f5f5f4" />
      {[-0.25, 0.25].map((x) => <B key={x} p={[x, 0.26, 0]} s={[0.05, 0.52, 0.72]} c="#57534e" />)}
      <group position={[0, 0.52, 0]} rotation-y={0.3}>
        <B p={[0, 0.24, 0]} s={[0.8, 0.46, 0.64]} c="#e7e5e4" />
        {[-0.22, 0.22].map((x) => <B key={x} p={[x, 0.24, 0]} s={[0.05, 0.48, 0.66]} c="#57534e" />)}
      </group>
    </group>
  ),
  // Creel of thread cones feeding the looms.
  mill_spools: () => (
    <group>
      {[-0.92, 0.92].map((x) => <B key={x} p={[x, 0.85, -0.2]} s={[0.07, 1.7, 0.07]} c="#44403c" />)}
      {[0.5, 1.0, 1.5].map((y, r) => (
        <group key={y}>
          <B p={[0, y, -0.2]} s={[1.84, 0.05, 0.1]} c="#57534e" />
          {[-0.7, -0.42, -0.14, 0.14, 0.42, 0.7].map((x, i) => <Cyl key={x} p={[x, y + 0.14, -0.14]} r={0.085} rt={0.035} h={0.22} c={CLOTH[(i + r * 2) % CLOTH.length]} />)}
        </group>
      ))}
    </group>
  ),
  // Finished cloth, folded and shelved for sale.
  mill_shelf: () => (
    <group>
      <B p={[0, 1.05, -0.3]} s={[1.9, 2.1, 0.08]} c={DARK_WOOD} />
      {[-0.95, 0.95].map((x) => <B key={x} p={[x, 1.05, -0.08]} s={[0.06, 2.1, 0.5]} c={DARK_WOOD} />)}
      {[0.1, 0.75, 1.4, 2.05].map((y) => <B key={y} p={[0, y, -0.08]} s={[1.9, 0.05, 0.5]} c={WOOD} />)}
      {[0.14, 0.79, 1.44].map((y, r) =>
        [-0.66, -0.22, 0.22, 0.66].map((x, i) => (
          <group key={`${r}${i}`}>
            <B p={[x, y + 0.14, -0.06]} s={[0.38, 0.22, 0.42]} c={CLOTH[(i + r * 3) % CLOTH.length]} />
            <B p={[x, y + 0.36, -0.06]} s={[0.36, 0.2, 0.4]} c={CLOTH[(i * 2 + r + 1) % CLOTH.length]} />
          </group>
        )),
      )}
    </group>
  ),
  // Cutting table: a length of ankara rolled out, tape and shears.
  mill_table: () => (
    <group>
      <B p={[0, 0.78, 0]} s={[1.9, 0.06, 0.8]} c={WOOD} />
      {[-0.85, 0.85].map((x) => [-0.32, 0.32].map((z) => <B key={`${x}${z}`} p={[x, 0.38, z]} s={[0.08, 0.76, 0.08]} c={DARK_WOOD} />))}
      <B p={[-0.1, 0.82, 0]} s={[1.3, 0.02, 0.7]} c="#f59e0b" />
      {[-0.5, -0.1, 0.3].map((x) => <B key={x} p={[x, 0.835, 0]} s={[0.14, 0.01, 0.7]} c="#1d4ed8" />)}
      <B p={[-0.1, 0.55, 0.41]} s={[1.3, 0.5, 0.02]} c="#f59e0b" />
      <Cyl p={[0.72, 0.9, 0]} r={0.1} h={0.74} c="#f59e0b" rot={ALONG} />
      <B p={[0.3, 0.845, 0.2]} s={[0.3, 0.02, 0.05]} c="#94a3b8" />
      <B p={[-0.6, 0.845, -0.22]} s={[0.5, 0.015, 0.04]} c="#fef3c7" />
    </group>
  ),
  // Dyed lengths hung up to dry along the wall (at the +z edge of its cells).
  mill_dryline: () => (
    <group position={[0, 0, 0.3]}>
      <B p={[0, 2.3, 0]} s={[2.9, 0.03, 0.03]} c="#d6c39a" />
      {[-1.42, 1.42].map((x) => <B key={x} p={[x, 2.2, 0.06]} s={[0.06, 0.3, 0.1]} c="#44403c" />)}
      {[-1.1, -0.55, 0, 0.55, 1.1].map((x, i) => <B key={x} p={[x, 1.6 + (i % 2) * 0.12, 0]} s={[0.46, 1.36 - (i % 2) * 0.24, 0.03]} c={['#312e81', '#dc2626', '#f59e0b', '#16a34a', '#9333ea'][i]} />)}
    </group>
  ),
  mill_cart: () => (
    <group>
      <B p={[0, 0.42, 0]} s={[0.7, 0.5, 0.8]} c="#475569" />
      <B p={[0, 0.94, -0.42]} s={[0.6, 0.05, 0.05]} c={STEEL} />
      {[-0.28, 0.28].map((x) => <B key={x} p={[x, 0.78, -0.42]} s={[0.04, 0.3, 0.04]} c={STEEL} />)}
      {[[-0.26, -0.3], [0.26, -0.3], [-0.26, 0.3], [0.26, 0.3]].map(([x, z], i) => <Cyl key={i} p={[x, 0.09, z]} r={0.09} h={0.06} c="#111827" rot={ACROSS} />)}
      {[[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.2], [0.18, 0.2], [0, 0]].map(([x, z], i) => <Cyl key={`c${i}`} p={[x, 0.78, z]} r={0.1} rt={0.04} h={0.24} c={CLOTH[i]} />)}
    </group>
  ),

  /* ---------- Buka ---------- */

  // Two big sooty pots on firewood, the kitchen of every buka.
  buka_fire: () => (
    <group>
      <B p={[0, 0.02, 0]} s={[1.9, 0.04, 0.9]} c="#57483a" />
      {[-0.5, 0.5].map((x, i) => (
        <group key={x} position={[x, 0, -0.05]}>
          {[0, 2.1, 4.2].map((a) => <B key={a} p={[Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3]} s={[0.2, 0.24, 0.2]} c="#78716c" />)}
          {[0.5, 2.6].map((a) => (
            <group key={`l${a}`} rotation-y={a}>
              <B p={[0.34, 0.06, 0]} s={[0.6, 0.08, 0.09]} c="#5a3418" />
            </group>
          ))}
          <Cone p={[0, 0.2, 0]} r={0.16} h={0.26} c="#f97316" e="#ea580c" />
          <Cyl p={[0, 0.5, 0]} r={0.3} rt={0.36} h={0.5} c="#1c1917" />
          <Cyl p={[0, 0.76, 0]} r={0.33} h={0.02} c={i ? '#fde68a' : '#7f1d1d'} />
          <B p={[0.42, 0.66, 0]} s={[0.12, 0.05, 0.1]} c="#1c1917" />
          <B p={[-0.42, 0.66, 0]} s={[0.12, 0.05, 0.1]} c="#1c1917" />
        </group>
      ))}
      <group position={[0.5, 0.78, -0.05]} rotation={[0, 0, -0.5]}>
        <Cyl p={[0, 0.3, 0]} r={0.025} h={0.8} c={WOOD} />
      </group>
      <Smoke p={[-0.5, 0.9, -0.05]} s={0.7} />
    </group>
  ),
  // Serving counter: food flasks, a basin of masa, stacked plates, and the promise painted on the front.
  buka_counter: ({ text = 'FOOD IS READY' }) => (
    <group>
      <B p={[0, 0.45, 0.12]} s={[2.84, 0.9, 0.56]} c={WOOD} />
      <B p={[0, 0.92, 0.12]} s={[2.9, 0.05, 0.64]} c="#a16207" />
      <Label p={[0, 0.48, 0.405]} w={2.5} h={0.4} text={text} bg="#b91c1c" fg="#fef3c7" glow={0.15} />
      {[-1.05, -0.5, 0.05].map((x, i) => (
        <group key={x}>
          <Cyl p={[x, 1.12, 0.1]} r={0.22} h={0.34} c={['#1d4ed8', '#dc2626', '#15803d'][i]} />
          <Cyl p={[x, 1.31, 0.1]} r={0.23} h={0.05} c="#f8fafc" />
        </group>
      ))}
      <Cyl p={[0.65, 1.0, 0.1]} r={0.2} rt={0.26} h={0.12} c="#e5e7eb" />
      {[[0.58, 0.05], [0.72, 0.14], [0.66, 0.02], [0.6, 0.2]].map(([x, z], i) => <Ball key={i} p={[x, 1.1, z]} r={0.07} c="#fef3c7" s={[1, 0.6, 1]} />)}
      <Cyl p={[1.15, 1.04, 0.1]} r={0.14} h={0.2} c="#f8fafc" />
    </group>
  ),
  // Backless wooden form, the bench of buka and mai shayi alike.
  buka_form: () => (
    <group>
      <B p={[0, 0.42, 0]} s={[2.8, 0.06, 0.32]} c="#92400e" />
      {[-1.1, 1.1].map((x) => (
        <group key={x}>
          <B p={[x, 0.2, 0]} s={[0.07, 0.4, 0.3]} c={DARK_WOOD} />
          <B p={[x, 0.03, 0]} s={[0.1, 0.05, 0.4]} c={DARK_WOOD} />
        </group>
      ))}
    </group>
  ),
  buka_table: () => (
    <group>
      <B p={[0, 0.74, 0]} s={[2.8, 0.06, 0.7]} c="#92400e" />
      {[-1.2, 1.2].map((x) => <B key={x} p={[x, 0.36, 0]} s={[0.08, 0.72, 0.6]} c={DARK_WOOD} />)}
      {[-0.9, 0, 0.9].map((x, i) => (
        <group key={x}>
          <Cyl p={[x, 0.79, 0.05]} r={0.17} h={0.03} c="#f8fafc" seg={12} />
          <Ball p={[x, 0.84, 0.05]} r={0.1} c={['#fef3c7', '#d97706', '#fef3c7'][i]} s={[1, 0.6, 1]} />
        </group>
      ))}
      <Cyl p={[-0.45, 0.84, -0.12]} r={0.05} h={0.14} c="#7f1d1d" />
      <Cyl p={[0.45, 0.84, 0.15]} r={0.05} h={0.14} c="#e0f2fe" o={0.7} />
    </group>
  ),
  // Mai shayi: kettle on the stove, bread and eggs, and the wall of milk and Milo tins behind him.
  buka_shayi: () => (
    <group>
      <B p={[0, 0.74, 0.1]} s={[1.84, 0.06, 0.66]} c="#1d4ed8" />
      {[-0.82, 0.82].map((x) => [-0.16, 0.36].map((z) => <B key={`${x}${z}`} p={[x, 0.36, z]} s={[0.06, 0.72, 0.06]} c="#1e3a8a" />))}
      <B p={[0, 1.4, -0.4]} s={[1.84, 1.3, 0.06]} c="#1e3a8a" />
      {[1.05, 1.45, 1.85].map((y, r) => (
        <group key={y}>
          <B p={[0, y - 0.1, -0.3]} s={[1.76, 0.04, 0.18]} c="#1d4ed8" />
          {[-0.7, -0.42, -0.14, 0.14, 0.42, 0.7].map((x, i) => <Cyl key={x} p={[x, y + 0.02, -0.3]} r={0.08} h={0.2} c={['#dc2626', '#15803d', '#f8fafc', '#facc15'][(i + r) % 4]} />)}
        </group>
      ))}
      <B p={[-0.55, 0.84, 0.15]} s={[0.34, 0.14, 0.3]} c="#374151" />
      <Cone p={[-0.55, 0.9, 0.15]} r={0.07} h={0.1} c="#3b82f6" e="#2563eb" />
      <Cyl p={[-0.55, 1.06, 0.15]} r={0.15} rt={0.1} h={0.28} c="#e5e7eb" />
      <B p={[-0.38, 1.1, 0.15]} s={[0.14, 0.04, 0.04]} c="#e5e7eb" />
      {[0.05, 0.25].map((x) => <B key={x} p={[x, 0.86, 0.05]} s={[0.16, 0.16, 0.4]} c="#d97706" />)}
      <B p={[0.62, 0.82, 0.02]} s={[0.34, 0.08, 0.34]} c="#fef3c7" />
      {[0.5, 0.62, 0.74].map((x) => <Cyl key={x} p={[x, 0.82, 0.32]} r={0.045} h={0.1} c="#fde68a" o={0.8} />)}
    </group>
  ),
  // Chalkboard of what is cooking, hung at the +z edge of its cells.
  buka_menu: () => (
    <group position={[0, 1.7, 0.42]}>
      <B p={[0, 0, 0]} s={[1.8, 1.1, 0.05]} c={DARK_WOOD} />
      <Table p={[0, 0, -0.03]} w={1.66} h={0.98} title="TODAY" rows={MENU} ry={Math.PI} accent="#facc15" />
    </group>
  ),

  /* ---------- Market ---------- */

  market_spice: () => (
    <Trestle>
      {[-0.66, -0.22, 0.22, 0.66].map((x, i) => <Basin key={x} p={[x, 0.76, 0.05]} c={['#f8fafc', '#1d4ed8', '#f8fafc', '#dc2626'][i]} heap={['#b91c1c', '#facc15', '#78350f', '#ea580c'][i]} />)}
      {[-0.44, 0, 0.44].map((x, i) => <Cyl key={x} p={[x, 0.82, -0.24]} r={0.06} h={0.14} c={['#15803d', '#fde68a', '#7f1d1d'][i]} />)}
    </Trestle>
  ),
  market_fruit: () => (
    <Trestle>
      {[[-0.72, 0.05], [-0.54, 0.05], [-0.63, -0.1], [-0.63, 0.2]].map(([x, z], i) => <Ball key={i} p={[x, 0.84, z]} r={0.1} c="#f97316" />)}
      <Ball p={[-0.63, 0.99, 0.05]} r={0.1} c="#f97316" />
      {[-0.18, 0.12].map((x) => <Ball key={x} p={[x, 0.9, 0.05]} r={0.17} c="#166534" s={[1, 0.9, 1.25]} />)}
      {[0.45, 0.55, 0.65].map((x, i) => <B key={x} p={[x, 0.8 + i * 0.03, 0.12]} s={[0.08, 0.07, 0.36]} c="#facc15" />)}
      <Ball p={[0.52, 0.86, -0.2]} r={0.11} c="#ca8a04" s={[1, 1.5, 1]} />
      <Cone p={[0.52, 1.08, -0.2]} r={0.08} h={0.16} c="#15803d" />
      {[0.74, 0.84].map((x) => <Ball key={x} p={[x, 0.83, -0.1]} r={0.08} c="#dc2626" />)}
    </Trestle>
  ),
  // Butcher's table with strips of kilishi drying on the line over it.
  market_meat: () => (
    <Trestle>
      <B p={[-0.5, 0.8, 0.02]} s={[0.5, 0.1, 0.36]} c="#b91c1c" />
      <B p={[-0.5, 0.86, 0.02]} s={[0.3, 0.04, 0.2]} c="#fecaca" />
      <B p={[0.1, 0.79, 0.08]} s={[0.4, 0.08, 0.3]} c="#7f1d1d" />
      <B p={[0.6, 0.78, 0]} s={[0.36, 0.04, 0.5]} c="#d6c39a" />
      <B p={[0.6, 0.82, 0.05]} s={[0.1, 0.02, 0.3]} c="#94a3b8" />
      {[-0.9, 0.9].map((x) => <B key={x} p={[x, 1.25, -0.3]} s={[0.05, 1.1, 0.05]} c={DARK_WOOD} />)}
      <B p={[0, 1.78, -0.3]} s={[1.84, 0.03, 0.03]} c="#d6c39a" />
      {[-0.65, -0.3, 0.05, 0.4, 0.72].map((x, i) => <B key={x} p={[x, 1.52 + (i % 2) * 0.05, -0.3]} s={[0.26, 0.48 - (i % 2) * 0.1, 0.02]} c={i % 2 ? '#7c2d12' : '#9a3412'} />)}
    </Trestle>
  ),
  // Baskets of tomatoes, pepper, onions and okra on the ground.
  market_veg: () => (
    <group>
      {[[-0.6, 0.15, '#dc2626'], [0, 0.2, '#ea580c'], [0.6, 0.15, '#7e22ce'], [-0.3, -0.25, '#16a34a'], [0.32, -0.25, '#dc2626']].map(([x, z, c], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <Cyl p={[0, 0.16, 0]} r={0.2} rt={0.27} h={0.32} c="#a16207" />
          <Ball p={[0, 0.36, 0]} r={0.24} c={c as string} s={[1, 0.55, 1]} />
        </group>
      ))}
    </group>
  ),
  // Bolts of wax print stacked on a low table, with lengths hung up behind to show the pattern.
  market_cloth: () => (
    <group>
      <B p={[0, 0.3, 0.1]} s={[1.84, 0.6, 0.66]} c={WOOD} />
      {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
        <group key={x}>
          <B p={[x, 0.68, 0.1]} s={[0.3, 0.16, 0.6]} c={CLOTH[i]} />
          <B p={[x, 0.84, 0.1]} s={[0.28, 0.16, 0.56]} c={CLOTH[(i + 3) % CLOTH.length]} />
        </group>
      ))}
      {[-0.9, 0.9].map((x) => <B key={x} p={[x, 0.95, -0.36]} s={[0.05, 1.9, 0.05]} c={DARK_WOOD} />)}
      <B p={[0, 1.88, -0.36]} s={[1.84, 0.04, 0.04]} c={DARK_WOOD} />
      {[-0.6, -0.2, 0.2, 0.6].map((x, i) => <B key={`h${x}`} p={[x, 1.45, -0.36]} s={[0.36, 0.82, 0.02]} c={CLOTH[(i * 2 + 1) % CLOTH.length]} />)}
    </group>
  ),
  // Open sacks of rice and beans with the measuring bowl on top.
  market_sacks: () => (
    <group>
      {[[-0.2, -0.12, '#f8fafc'], [0.22, 0.02, '#92400e'], [-0.05, 0.3, '#fde68a']].map(([x, z, c], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <Cyl p={[0, 0.28, 0]} r={0.22} rt={0.2} h={0.56} c="#d6c39a" />
          <Cyl p={[0, 0.57, 0]} r={0.18} h={0.03} c={c as string} />
        </group>
      ))}
      <Cyl p={[0.22, 0.64, 0.02]} r={0.07} rt={0.09} h={0.1} c="#94a3b8" />
    </group>
  ),
  market_yams: () => (
    <group>
      {[[-0.2, 0.1, 0, 0.2], [0.05, 0.1, -0.15, -0.3], [0.2, 0.1, 0.12, 0.5], [-0.05, 0.27, 0, 0.1], [0.12, 0.27, -0.05, -0.5], [0, 0.43, 0, 0.3]].map(([x, y, z, a], i) => (
        <group key={i} position={[x, y, z]} rotation-y={a}>
          <B p={[0, 0, 0]} s={[0.17, 0.17, 0.7]} c={i % 2 ? '#78350f' : '#92400e'} />
        </group>
      ))}
    </group>
  ),
  // Okrika, bend-down-select: a heap of second-hand clothes on a tarpaulin, shoes lined along the edge.
  market_okrika: () => (
    <group>
      <B p={[0, 0.012, 0]} s={[1.9, 0.02, 1.9]} c="#1d4ed8" />
      {[[-0.4, -0.3, 0.4], [0.3, -0.35, 0.36], [0, 0, 0.46], [-0.45, 0.3, 0.3], [0.45, 0.2, 0.34], [0.05, -0.1, 0.3]].map(([x, z, r], i) => (
        <Ball key={i} p={[x, i === 5 ? 0.5 : 0.18, z]} r={r} c={CLOTH[i]} s={[1.2, 0.6, 1]} />
      ))}
      {[-0.7, -0.4, -0.1, 0.2, 0.5].map((x, i) => (
        <group key={x}>
          <B p={[x, 0.07, 0.8]} s={[0.1, 0.1, 0.24]} c={['#111827', '#f8fafc', '#7c2d12', '#dc2626', '#111827'][i]} />
          <B p={[x + 0.13, 0.07, 0.8]} s={[0.1, 0.1, 0.24]} c={['#111827', '#f8fafc', '#7c2d12', '#dc2626', '#111827'][i]} />
        </group>
      ))}
    </group>
  ),
  // Kasuwan rago: rams penned for Sallah.
  market_rampen: () => (
    <group>
      <B p={[0, 0.012, 0]} s={[2.9, 0.02, 1.9]} c="#a8895c" />
      {[-1.42, -0.47, 0.47, 1.42].map((x) => [-0.92, 0.92].map((z) => <B key={`${x}${z}`} p={[x, 0.45, z]} s={[0.08, 0.9, 0.08]} c={DARK_WOOD} />))}
      {[0.35, 0.75].map((y) => (
        <group key={y}>
          {[-0.92, 0.92].map((z) => <B key={z} p={[0, y, z]} s={[2.9, 0.06, 0.05]} c={WOOD} />)}
          {[-1.42, 1.42].map((x) => <B key={x} p={[x, y, 0]} s={[0.05, 0.06, 1.84]} c={WOOD} />)}
        </group>
      ))}
      <Ram p={[-0.85, 0, -0.1]} c="#f5f5f4" ry={0.3} />
      <Ram p={[0.05, 0, 0.2]} c="#a8a29e" ry={-0.4} />
      <Ram p={[0.9, 0, -0.2]} c="#f5f5f4" ry={0.1} />
      <B p={[0.6, 0.1, 0.6]} s={[0.5, 0.2, 0.3]} c="#65a30d" />
    </group>
  ),
  // Phone village kiosk: handsets under glass, cases and chargers on the board behind.
  market_phones: ({ text = 'PHONES' }) => (
    <group>
      <B p={[0, 0.45, 0.14]} s={[1.84, 0.9, 0.6]} c="#f8fafc" />
      <B p={[0, 0.3, 0.445]} s={[1.84, 0.3, 0.01]} c="#facc15" />
      <B p={[0, 1.02, 0.14]} s={[1.84, 0.24, 0.6]} c="#bfe6f5" o={0.35} />
      {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
        <group key={x}>
          <B p={[x, 0.94, 0.16]} s={[0.16, 0.03, 0.3]} c="#111827" />
          <B p={[x, 0.96, 0.16]} s={[0.13, 0.01, 0.26]} c={['#38bdf8', '#a78bfa', '#4ade80', '#f472b6', '#38bdf8'][i]} e={['#0ea5e9', '#7c3aed', '#16a34a', '#db2777', '#0ea5e9'][i]} />
        </group>
      ))}
      <B p={[0, 1.4, -0.36]} s={[1.84, 1.9, 0.06]} c="#1e293b" />
      {[1.0, 1.35, 1.7].map((y, r) => [-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => <B key={`${r}${i}`} p={[x, y, -0.32]} s={[0.2, 0.26, 0.02]} c={CLOTH[(i + r * 2) % CLOTH.length]} />))}
      <B p={[0, 2.2, -0.3]} s={[1.9, 0.36, 0.1]} c="#111827" />
      <Label p={[0, 2.2, -0.245]} w={1.8} h={0.28} text={text} bg="#facc15" fg="#111827" />
    </group>
  ),
  // "Original Rolex, grade one": watches and shades pinned to a tilted board.
  market_watches: () => (
    <group>
      {[-0.3, 0.3].map((x) => <B key={x} p={[x, 0.45, -0.2]} s={[0.05, 0.9, 0.05]} c={DARK_WOOD} />)}
      <group position={[0, 0.95, 0]} rotation={[-0.5, 0, 0]}>
        <B p={[0, 0, 0]} s={[0.84, 0.05, 0.84]} c="#111827" />
        {[-0.27, 0, 0.27].map((x) => [-0.25, 0, 0.25].map((z, j) => (
          <Cyl key={`${x}${z}`} p={[x, 0.04, z]} r={j === 2 ? 0.05 : 0.07} h={0.03} c={j === 2 ? '#1f2937' : j ? '#e5e7eb' : '#eab308'} seg={10} />
        )))}
      </group>
    </group>
  ),
  // Pure water in a cooler on a stool.
  market_water: () => (
    <group>
      <B p={[0, 0.2, 0]} s={[0.4, 0.4, 0.4]} c={WOOD} />
      <B p={[0, 0.6, 0]} s={[0.66, 0.4, 0.5]} c="#1d4ed8" />
      <B p={[0, 0.82, 0]} s={[0.7, 0.05, 0.54]} c="#f8fafc" />
      {[[-0.15, 0.08], [0.12, -0.05], [0.02, 0.14]].map(([x, z], i) => <B key={i} p={[x, 0.88, z]} s={[0.18, 0.06, 0.14]} c="#e0f2fe" o={0.85} />)}
    </group>
  ),
  // The porter's wheelbarrow, loaded.
  market_barrow: () => (
    <group rotation-y={0.4}>
      <group position={[0, 0.42, 0]} rotation={[0.12, 0, 0]}>
        <B p={[0, 0, 0]} s={[0.6, 0.26, 0.8]} c="#166534" />
        <B p={[0, 0.24, -0.05]} s={[0.5, 0.26, 0.6]} c="#d6c39a" />
        <B p={[0, 0.46, 0]} s={[0.44, 0.2, 0.5]} c="#c2a878" />
      </group>
      <Cyl p={[0, 0.2, 0.52]} r={0.2} h={0.1} c="#111827" rot={ACROSS} />
      {[-0.26, 0.26].map((x) => (
        <group key={x}>
          <B p={[x, 0.42, -0.6]} s={[0.05, 0.05, 0.6]} c="#475569" />
          <B p={[x, 0.16, -0.3]} s={[0.05, 0.32, 0.05]} c="#475569" />
        </group>
      ))}
    </group>
  ),

  /* ---------- Suya spot ---------- */

  // Mai suya's stand: long charcoal grill out front, the prep table beside it, his sign on the board behind.
  suya_stand: ({ text = 'MAI SUYA' }) => (
    <group>
      <B p={[0, 0.6, -0.88]} s={[2.84, 1.2, 0.1]} c="#f8f1e3" />
      {[-1.36, 1.36].map((x) => <B key={x} p={[x, 1.25, -0.88]} s={[0.08, 2.5, 0.08]} c={DARK_WOOD} />)}
      <B p={[0, 1.95, -0.88]} s={[2.7, 0.62, 0.07]} c="#111827" />
      <Label p={[0, 1.95, -0.84]} w={2.6} h={0.52} text={text} bg="#b91c1c" fg="#facc15" glow={0.4} />
      <B p={[0, 2.5, -0.66]} s={[3.0, 0.07, 0.6]} c="#b91c1c" />
      {/* Grill, coals and skewers */}
      <B p={[-0.45, 0.78, 0.4]} s={[1.7, 0.24, 0.56]} c="#111827" />
      {[-1.2, 0.3].map((x) => [0.2, 0.6].map((z) => <B key={`${x}${z}`} p={[x, 0.33, z]} s={[0.06, 0.66, 0.06]} c="#374151" />))}
      <B p={[-0.45, 0.91, 0.4]} s={[1.6, 0.03, 0.46]} c="#f97316" e="#ea580c" />
      {[-1.1, -0.84, -0.58, -0.32, -0.06, 0.2].map((x, i) => (
        <group key={x}>
          <B p={[x, 0.95, 0.4]} s={[0.03, 0.02, 0.62]} c="#d6c39a" />
          <B p={[x, 0.97, 0.38]} s={[0.1, 0.05, 0.36]} c={i % 2 ? '#7c2d12' : '#9a3412'} />
        </group>
      ))}
      {/* Prep table: wraps of newspaper, onion and tomato, the yaji bowl */}
      <B p={[0.95, 0.76, 0.4]} s={[0.84, 0.06, 0.6]} c={WOOD} />
      {[0.6, 1.3].map((x) => <B key={x} p={[x, 0.37, 0.4]} s={[0.07, 0.74, 0.5]} c={DARK_WOOD} />)}
      <B p={[0.78, 0.83, 0.5]} s={[0.3, 0.08, 0.22]} c="#e5e7eb" />
      <Cyl p={[1.12, 0.84, 0.3]} r={0.13} rt={0.16} h={0.1} c="#f8fafc" />
      <Ball p={[1.12, 0.9, 0.3]} r={0.1} c="#dc2626" s={[1, 0.5, 1]} />
      <Cyl p={[1.15, 0.83, 0.58]} r={0.09} h={0.08} c="#7c2d12" />
      <Smoke p={[-0.45, 1.05, 0.4]} />
    </group>
  ),
  // White plastic table: a plate of suya on paper, two cold minerals.
  suya_table: () => (
    <group>
      <Cyl p={[0, 0.36, 0]} r={0.06} h={0.72} c="#e5e7eb" />
      <Cyl p={[0, 0.03, 0]} r={0.26} h={0.05} c="#e5e7eb" />
      <Cyl p={[0, 0.74, 0]} r={0.44} h={0.05} c="#f8fafc" seg={14} />
      <B p={[0, 0.78, 0.05]} s={[0.36, 0.01, 0.3]} c="#d6d3d1" />
      {[-0.08, 0, 0.08].map((x) => <B key={x} p={[x, 0.8, 0.05]} s={[0.05, 0.03, 0.26]} c="#7c2d12" />)}
      <Cyl p={[-0.24, 0.88, -0.14]} r={0.04} h={0.22} c="#166534" />
      <Cyl p={[0.24, 0.88, -0.1]} r={0.04} h={0.22} c="#7c2d12" />
    </group>
  ),
  suya_crates: () => (
    <group>
      {['#dc2626', '#facc15', '#dc2626'].map((c, i) => (
        <group key={i} position={[-0.15, 0.15 + i * 0.3, -0.1]}>
          <B p={[0, 0, 0]} s={[0.5, 0.28, 0.4]} c={c} />
          <B p={[0, 0.145, 0]} s={[0.42, 0.01, 0.32]} c="#1f2937" />
        </group>
      ))}
      <B p={[0.25, 0.2, 0.25]} s={[0.44, 0.4, 0.36]} c="#0ea5e9" />
      <B p={[0.25, 0.42, 0.25]} s={[0.46, 0.05, 0.38]} c="#f8fafc" />
    </group>
  ),
  suya_charcoal: () => (
    <group>
      <Cyl p={[-0.12, 0.35, -0.1]} r={0.26} rt={0.22} h={0.7} c="#d6c39a" />
      <Cyl p={[-0.12, 0.71, -0.1]} r={0.2} h={0.04} c="#1c1917" />
      {[0, 1, 2].map((i) => <Cyl key={i} p={[0.25, 0.08 + (i === 2 ? 0.13 : 0), 0.2 + (i === 1 ? 0.16 : i === 2 ? 0.08 : 0)]} r={0.07} h={0.7} c={DARK_WOOD} seg={6} rot={ACROSS} />)}
    </group>
  ),
  // A string of bulbs between two poles: you walk under it.
  suya_lights: () => (
    <group>
      {[-1.92, 1.92].map((x) => <B key={x} p={[x, 1.35, 0]} s={[0.07, 2.7, 0.07]} c={DARK_WOOD} />)}
      <B p={[0, 2.6, 0]} s={[3.84, 0.02, 0.02]} c="#1f2937" />
      {[-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((x, i) => {
        const c = ['#fde68a', '#fca5a5', '#fde68a', '#86efac', '#fde68a', '#93c5fd', '#fde68a'][i];
        return <B key={x} p={[x, 2.5, 0]} s={[0.1, 0.14, 0.1]} c={c} e={c} />;
      })}
    </group>
  ),
  // A customer's okada on its stand.
  suya_okada: () => (
    <group>
      {[-0.62, 0.62].map((z) => <Cyl key={z} p={[0, 0.3, z]} r={0.3} h={0.1} c="#111827" seg={12} rot={ACROSS} />)}
      <B p={[0, 0.5, 0]} s={[0.14, 0.14, 1.0]} c="#374151" />
      <B p={[0, 0.72, 0.18]} s={[0.26, 0.24, 0.44]} c="#dc2626" />
      <B p={[0, 0.74, -0.3]} s={[0.26, 0.1, 0.6]} c="#111827" />
      <group position={[0, 0.6, 0.55]} rotation={[-0.35, 0, 0]}>
        <B p={[0, 0.2, 0]} s={[0.08, 0.7, 0.08]} c={STEEL} />
      </group>
      <B p={[0, 1.0, 0.44]} s={[0.6, 0.05, 0.05]} c="#111827" />
      <B p={[0, 0.86, 0.6]} s={[0.16, 0.16, 0.08]} c="#fde68a" e="#facc15" />
      <Cyl p={[0.16, 0.36, -0.4]} r={0.05} h={0.6} c={CHROME} rot={ALONG} />
      <B p={[0, 0.5, -0.66]} s={[0.24, 0.04, 0.3]} c="#dc2626" />
    </group>
  ),

  /* ---------- Motor park ---------- */

  // 18-seater in its bay, nose out, roof rack loaded; where it is going is on the board over the windscreen.
  park_bus: ({ text = 'ZARIA' }) => {
    const [body, stripe] = [['#f8fafc', GREEN], ['#facc15', '#111827'], ['#f8fafc', '#1d4ed8']][text.length % 3];
    return (
      <group>
        <B p={[0, 1.2, 0]} s={[1.8, 1.6, 4.5]} c={body} />
        <B p={[0, 0.82, 0]} s={[1.83, 0.2, 4.52]} c={stripe} />
        <B p={[0, 1.55, -0.2]} s={[1.84, 0.5, 3.6]} c="#1e293b" />
        <B p={[0, 1.5, 2.2]} s={[1.6, 0.6, 0.14]} c="#1e293b" />
        <B p={[0, 0.5, 2.28]} s={[1.8, 0.2, 0.1]} c="#334155" />
        {[-0.65, 0.65].map((x) => <B key={x} p={[x, 0.86, 2.27]} s={[0.26, 0.14, 0.04]} c="#fef9c3" e="#fde68a" />)}
        {[-0.9, 0.9].map((x) => [-1.4, 1.5].map((z) => <Cyl key={`${x}${z}`} p={[x, 0.36, z]} r={0.36} h={0.2} c="#111827" seg={12} rot={ACROSS} />))}
        <B p={[0, 2.08, 2.1]} s={[1.6, 0.36, 0.1]} c="#111827" />
        <Label p={[0, 2.08, 2.155]} w={1.5} h={0.28} text={text} bg="#111827" fg="#facc15" glow={0.5} />
        {/* Roof rack and the load on it */}
        <B p={[0, 2.06, -0.5]} s={[1.6, 0.06, 3.2]} c="#475569" />
        {[[-0.4, 0.6, 0], [0.35, 0.5, 1], [-0.3, -0.5, 2], [0.4, -0.7, 3], [0, -1.6, 4]].map(([x, z, i]) => (
          <B key={i} p={[x, 2.3, z - 0.5]} s={[0.7, 0.42, 0.8]} c={['#1d4ed8', '#dc2626', '#d6c39a', '#1d4ed8', '#7c2d12'][i]} />
        ))}
        <B p={[-0.4, 2.3, 0.1]} s={[0.72, 0.1, 0.82]} c="#f8fafc" />
      </group>
    );
  },
  // Park office: cream block, red roof, a ticket hatch.
  park_shed: ({ text = 'TICKETS' }) => (
    <group>
      <B p={[0, 1.1, -0.2]} s={[2.8, 2.2, 1.5]} c="#fef3c7" />
      <B p={[0, 2.28, 0]} s={[3.1, 0.14, 2.1]} c="#b91c1c" />
      <B p={[-0.5, 1.25, 0.56]} s={[1.1, 0.7, 0.04]} c="#1e293b" />
      <B p={[-0.5, 0.86, 0.66]} s={[1.2, 0.06, 0.26]} c={WOOD} />
      <B p={[0.85, 0.95, 0.56]} s={[0.7, 1.9, 0.04]} c={GREEN} />
      <Label p={[-0.5, 1.86, 0.565]} w={1.2} h={0.3} text={text} bg="#b91c1c" fg="#fef3c7" />
    </group>
  ),
  // Ghana-must-go bags, a sack and a jerrycan waiting to go up on the roof.
  park_luggage: () => (
    <group>
      <B p={[-0.18, 0.2, -0.12]} s={[0.56, 0.4, 0.4]} c="#1d4ed8" />
      <B p={[-0.18, 0.2, -0.12]} s={[0.58, 0.1, 0.42]} c="#f8fafc" />
      <B p={[0.22, 0.18, 0.2]} s={[0.5, 0.36, 0.4]} c="#dc2626" />
      <B p={[0.22, 0.18, 0.2]} s={[0.52, 0.1, 0.42]} c="#f8fafc" />
      <B p={[-0.1, 0.56, -0.05]} s={[0.5, 0.3, 0.36]} c={BAGS[0]} />
      <Cyl p={[0.3, 0.6, -0.25]} r={0.18} h={0.5} c="#d6c39a" />
      <B p={[-0.32, 0.2, 0.32]} s={[0.22, 0.4, 0.26]} c="#facc15" />
      <Cyl p={[-0.32, 0.43, 0.38]} r={0.04} h={0.06} c="#111827" />
    </group>
  ),
  park_toilet: () => (
    <group>
      <B p={[0, 1.05, -0.05]} s={[0.92, 2.1, 0.86]} c="#e7e5e4" />
      <B p={[0, 2.14, 0]} s={[1.0, 0.08, 1.0]} c="#64748b" />
      <B p={[0, 0.95, 0.39]} s={[0.66, 1.8, 0.03]} c={GREEN} />
      <Label p={[0, 1.6, 0.41]} w={0.56} h={0.2} text="TOILET" bg="#f8fafc" fg="#111827" />
    </group>
  ),
  // Vulcanizer's corner: tyres and the compressor.
  park_tyres: () => (
    <group>
      {[0, 1, 2, 3].map((i) => <Cyl key={i} p={[-0.12, 0.11 + i * 0.22, -0.1]} r={0.34} h={0.2} c="#111827" seg={12} />)}
      <Cyl p={[0.32, 0.34, 0.26]} r={0.34} h={0.2} c="#1f2937" seg={12} rot={[Math.PI / 2 - 0.3, 0, 0]} />
      <B p={[0.34, 0.2, -0.3]} s={[0.3, 0.4, 0.26]} c="#dc2626" />
    </group>
  ),
};
