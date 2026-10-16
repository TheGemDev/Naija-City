// Banks, hospitals, police stations, offices and classrooms: the counters, beds, bars and benches that make
// each one read as itself. Same rules as the rest: centred on the footprint, on y=0, front facing +z.

import { B, CHROME, Cyl, Label, STEEL, type Model } from '../propKit';

const WOOD = '#7c4a24';
const DARK_WOOD = '#5a3418';
const POLICE_BLUE = '#1e3a8a';
const FOLDERS = ['#d6b98a', '#c2a878', '#86a789', '#d6b98a', '#b9c7e0', '#e6b7b0', '#d6b98a'];
const MEDS = ['#dc2626', '#2563eb', '#f59e0b', '#16a34a', '#f8fafc', '#7c3aed'];

/** Bars from rail to rail, at the given places along x. */
function Bars({ xs, c = '#475569', h = 2.2 }: { xs: number[]; c?: string; h?: number }) {
  return (
    <>
      {xs.map((x) => <B key={x} p={[x, h / 2, 0]} s={[0.05, h, 0.05]} c={c} />)}
    </>
  );
}

/** A bench desk: seat and backrest behind, writing top in front, as wide as you like. */
function BenchDesk({ w, c, top }: { w: number; c: string; top: string }) {
  return (
    <group>
      <B p={[0, 0.43, -0.25]} s={[w, 0.06, 0.34]} c={c} />
      <B p={[0, 0.74, -0.44]} s={[w, 0.3, 0.05]} c={c} />
      <B p={[0, 0.74, 0.22]} s={[w, 0.05, 0.4]} c={top} />
      <B p={[0, 0.45, 0.42]} s={[w, 0.6, 0.04]} c={c} />
      {[-1, 1].map((s) => <B key={s} p={[(s * w) / 2, 0.4, 0]} s={[0.06, 0.8, 0.92]} c={DARK_WOOD} />)}
    </group>
  );
}

/** A swivel chair facing +z. */
function TaskChair({ p, c = '#111827' }: { p: [number, number, number]; c?: string }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0.03, 0]} r={0.22} h={0.05} c="#334155" />
      <Cyl p={[0, 0.24, 0]} r={0.035} h={0.4} c={STEEL} />
      <B p={[0, 0.46, 0]} s={[0.46, 0.08, 0.46]} c={c} />
      <B p={[0, 0.8, -0.22]} s={[0.44, 0.5, 0.06]} c={c} />
    </group>
  );
}

export const CIVIC_PROPS: Record<string, Model> = {
  /* ---------- Bank ---------- */

  // One window of the teller line: counter, glass, and its number over the top.
  bank_teller: ({ text = 'TELLER' }) => (
    <group>
      <B p={[0, 0.55, 0]} s={[2, 1.1, 0.6]} c={DARK_WOOD} />
      <B p={[0, 0.6, 0.305]} s={[1.84, 0.66, 0.01]} c={WOOD} />
      <B p={[0, 0.14, 0.31]} s={[2, 0.1, 0.01]} c="#ca8a04" />
      <B p={[0, 1.13, 0]} s={[2.04, 0.06, 0.7]} c="#f5f5f4" />
      <B p={[0, 1.56, 0.18]} s={[1.9, 0.8, 0.03]} c="#bfe6f5" o={0.3} />
      {[-0.98, 0.98].map((x) => <B key={x} p={[x, 1.56, 0.18]} s={[0.06, 0.86, 0.06]} c={STEEL} />)}
      <B p={[0, 2.09, 0.18]} s={[2, 0.26, 0.1]} c="#14532d" />
      <Label p={[0, 2.09, 0.235]} w={1.9} h={0.2} text={text} bg="#14532d" fg="#fde68a" />
      <B p={[-0.5, 1.32, -0.15]} s={[0.4, 0.28, 0.04]} c="#0f172a" />
      <B p={[0.35, 1.19, -0.05]} s={[0.4, 0.06, 0.24]} c="#15803d" />
    </group>
  ),
  // The strongroom door: round, steel, with the wheel you'd have to spin.
  bank_vault: () => (
    <group>
      <B p={[0, 1.25, -0.3]} s={[1.96, 2.5, 0.36]} c="#475569" />
      <Cyl p={[0, 1.15, -0.08]} r={0.9} h={0.14} c={CHROME} seg={20} rot={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 1.15, 0.02]} r={0.7} h={0.1} c={STEEL} seg={20} rot={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 1.15, 0.1]} r={0.14} h={0.12} c="#334155" rot={[Math.PI / 2, 0, 0]} />
      <B p={[0, 1.15, 0.12]} s={[0.9, 0.07, 0.05]} c="#e2e8f0" />
      <B p={[0, 1.15, 0.12]} s={[0.07, 0.9, 0.05]} c="#e2e8f0" />
      {[[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]].map(([x, y], i) => <B key={i} p={[x, 1.15 + y, 0.08]} s={[0.1, 0.1, 0.04]} c="#334155" />)}
      {[1.65, 0.65].map((y) => <B key={y} p={[-0.9, y, -0.06]} s={[0.14, 0.3, 0.14]} c="#334155" />)}
      <Label p={[0, 2.3, -0.115]} w={0.8} h={0.2} text="VAULT" bg="#facc15" fg="#111827" />
      <B p={[0.82, 2.3, -0.1]} s={[0.16, 0.22, 0.04]} c="#0f172a" />
      <B p={[0.82, 2.36, -0.075]} s={[0.06, 0.04, 0.01]} c="#ef4444" e="#ef4444" />
    </group>
  ),
  // Stand-up desk for filling a deposit slip, pen on a chain.
  bank_slip_desk: () => (
    <group>
      <Cyl p={[0, 0.03, 0]} r={0.26} h={0.06} c="#334155" />
      <Cyl p={[0, 0.52, 0]} r={0.05} h={1.0} c={STEEL} />
      <B p={[0, 1.05, 0]} s={[0.84, 0.05, 0.5]} c={DARK_WOOD} />
      <B p={[-0.18, 1.09, 0.02]} s={[0.3, 0.03, 0.2]} c="#f8fafc" />
      <B p={[0.2, 1.1, -0.08]} s={[0.26, 0.05, 0.18]} c="#bbf7d0" />
      <B p={[0.3, 1.1, 0.14]} s={[0.16, 0.02, 0.02]} c="#111827" />
    </group>
  ),

  /* ---------- Hospital ---------- */

  // Ward bed, head towards -z. Whoever is on it lies with their head on the pillow (three/Patrons.tsx).
  hosp_bed: () => (
    <group>
      {[-0.86, 0.86].map((z) => <B key={z} p={[0, 0.2, z]} s={[0.9, 0.4, 0.06]} c={STEEL} />)}
      <B p={[0, 0.4, 0]} s={[0.92, 0.08, 1.9]} c="#e2e8f0" />
      <B p={[0, 0.52, 0]} s={[0.86, 0.16, 1.84]} c="#f8fafc" />
      <B p={[0, 0.62, 0.34]} s={[0.88, 0.05, 1.12]} c="#9fd8c8" />
      <B p={[0, 0.64, -0.68]} s={[0.6, 0.1, 0.34]} c="#e0f2fe" />
      <B p={[0, 0.82, -0.94]} s={[0.92, 0.72, 0.05]} c={CHROME} />
      <B p={[0, 0.6, 0.94]} s={[0.92, 0.36, 0.05]} c={CHROME} />
      <B p={[0, 0.62, 0.975]} s={[0.24, 0.3, 0.02]} c="#fef3c7" />
    </group>
  ),
  // What stands between two beds: the curtain, the locker and the drip.
  hosp_bedside: () => (
    <group>
      <B p={[0.1, 2.0, 0]} s={[0.04, 0.04, 1.9]} c={STEEL} />
      <B p={[0.1, 1.16, 0]} s={[0.05, 1.66, 1.8]} c="#7fc8b6" />
      <B p={[-0.26, 0.33, -0.72]} s={[0.4, 0.66, 0.42]} c="#f8fafc" />
      <B p={[-0.26, 0.68, -0.72]} s={[0.44, 0.04, 0.46]} c="#cbd5e1" />
      <Cyl p={[-0.26, 0.8, -0.72]} r={0.05} h={0.2} c="#93c5fd" />
      <Cyl p={[-0.3, 0.03, -0.2]} r={0.16} h={0.05} c="#475569" />
      <Cyl p={[-0.3, 0.9, -0.2]} r={0.02} h={1.8} c={STEEL} />
      <B p={[-0.3, 1.6, -0.2]} s={[0.16, 0.26, 0.06]} c="#bae6fd" />
    </group>
  ),
  // Shelves of medicine against the wall, the dispensing counter in front.
  hosp_pharmacy: () => (
    <group>
      <B p={[0, 1.1, -0.78]} s={[2.9, 2.2, 0.4]} c="#f8fafc" />
      {[0.5, 1.05, 1.6].map((y, r) => (
        <group key={y}>
          <B p={[0, y, -0.56]} s={[2.8, 0.04, 0.3]} c={CHROME} />
          {[-1.05, -0.35, 0.35, 1.05].map((x, i) => <B key={x} p={[x, y + 0.15, -0.56]} s={[0.56, 0.26, 0.22]} c={MEDS[(i + r * 2) % MEDS.length]} />)}
        </group>
      ))}
      <B p={[0, 0.5, 0.62]} s={[2.9, 1.0, 0.6]} c="#f8fafc" />
      <B p={[0, 0.72, 0.925]} s={[2.9, 0.14, 0.01]} c="#16a34a" />
      <B p={[0, 1.03, 0.62]} s={[2.96, 0.06, 0.68]} c="#e2e8f0" />
      <B p={[0, 1.44, 0.8]} s={[2.0, 0.74, 0.03]} c="#bfe6f5" o={0.3} />
      {[-1.42, 1.42].map((x) => <B key={x} p={[x, 1.2, 0.8]} s={[0.06, 2.4, 0.06]} c={STEEL} />)}
      <B p={[0, 2.25, 0.8]} s={[2.9, 0.4, 0.08]} c="#166534" />
      <Label p={[-0.2, 2.25, 0.845]} w={2.1} h={0.32} text="PHARMACY" bg="#166534" />
      <B p={[1.2, 2.25, 0.85]} s={[0.3, 0.1, 0.02]} c="#4ade80" e="#22c55e" />
      <B p={[1.2, 2.25, 0.85]} s={[0.1, 0.3, 0.02]} c="#4ade80" e="#22c55e" />
    </group>
  ),
  hosp_reception: () => (
    <group>
      <B p={[0, 0.52, 0]} s={[2.9, 1.04, 0.6]} c="#f8fafc" />
      <B p={[0, 0.2, 0.305]} s={[2.9, 0.18, 0.01]} c="#0d9488" />
      <B p={[0, 1.07, 0]} s={[2.96, 0.06, 0.68]} c="#e2e8f0" />
      <Label p={[-0.35, 0.66, 0.306]} w={1.7} h={0.3} text="RECEPTION" bg="#0d9488" />
      <B p={[1.05, 0.66, 0.306]} s={[0.4, 0.4, 0.01]} c="#fee2e2" />
      <B p={[1.05, 0.66, 0.312]} s={[0.28, 0.09, 0.01]} c="#dc2626" />
      <B p={[1.05, 0.66, 0.312]} s={[0.09, 0.28, 0.01]} c="#dc2626" />
      <B p={[-0.7, 1.28, -0.1]} s={[0.42, 0.3, 0.04]} c="#0f172a" />
      {[0, 1, 2].map((i) => <B key={i} p={[0.6, 1.13 + i * 0.05, -0.05]} s={[0.4, 0.04, 0.3]} c={FOLDERS[i + 1]} />)}
    </group>
  ),
  // Examination couch with its paper sheet.
  hosp_exam: () => (
    <group>
      {[-0.85, 0.85].map((x) => <B key={x} p={[x, 0.33, 0]} s={[0.06, 0.66, 0.6]} c={STEEL} />)}
      <B p={[0, 0.34, 0]} s={[1.7, 0.05, 0.5]} c={STEEL} />
      <B p={[0, 0.72, 0]} s={[1.9, 0.12, 0.66]} c={POLICE_BLUE} />
      <B p={[0.1, 0.785, 0]} s={[1.3, 0.01, 0.5]} c="#f8fafc" />
      <B p={[-0.7, 0.85, 0]} s={[0.45, 0.1, 0.6]} c="#bfdbfe" />
    </group>
  ),
  // Recliner for giving blood, the bag filling on its stand.
  hosp_donor: () => (
    <group>
      <B p={[0, 0.2, 0]} s={[0.5, 0.4, 0.9]} c="#64748b" />
      <B p={[0, 0.46, -0.05]} s={[0.7, 0.12, 0.6]} c="#0f766e" />
      <group position={[0, 0.5, -0.38]} rotation={[-0.45, 0, 0]}>
        <B p={[0, 0.4, 0]} s={[0.7, 0.8, 0.1]} c="#0f766e" />
      </group>
      <group position={[0, 0.44, 0.26]} rotation={[0.3, 0, 0]}>
        <B p={[0, 0, 0.3]} s={[0.66, 0.08, 0.6]} c="#0f766e" />
      </group>
      {[-0.42, 0.42].map((x) => <B key={x} p={[x, 0.66, -0.05]} s={[0.12, 0.06, 0.6]} c="#334155" />)}
      <Cyl p={[0.44, 0.03, -0.8]} r={0.15} h={0.05} c="#475569" />
      <Cyl p={[0.44, 0.9, -0.8]} r={0.02} h={1.8} c={STEEL} />
      <B p={[0.44, 1.58, -0.8]} s={[0.18, 0.26, 0.06]} c="#b91c1c" />
    </group>
  ),
  hosp_fridge: () => (
    <group>
      <B p={[0, 0.9, -0.05]} s={[0.8, 1.8, 0.7]} c="#f8fafc" />
      <B p={[0, 0.9, 0.305]} s={[0.66, 1.3, 0.01]} c="#bae6fd" e="#0ea5e9" o={0.6} />
      {[0.5, 0.9, 1.3].map((y) => <B key={y} p={[0, y, 0.2]} s={[0.5, 0.2, 0.14]} c="#b91c1c" />)}
      <Label p={[0, 1.68, 0.305]} w={0.7} h={0.16} text="BLOOD BANK" bg="#b91c1c" />
    </group>
  ),
  hosp_gurney: () => (
    <group>
      {[-0.7, 0.7].map((z) => <B key={z} p={[0, 0.3, z]} s={[0.6, 0.5, 0.05]} c={STEEL} />)}
      {[-0.7, 0.7].map((z) => <B key={`w${z}`} p={[0, 0.06, z]} s={[0.7, 0.12, 0.12]} c="#1f2937" />)}
      <B p={[0, 0.58, 0]} s={[0.72, 0.06, 1.8]} c={CHROME} />
      <B p={[0, 0.67, 0]} s={[0.66, 0.12, 1.74]} c="#f8fafc" />
      <B p={[0, 0.76, -0.62]} s={[0.46, 0.08, 0.3]} c="#e0f2fe" />
      <B p={[0, 0.74, 0.3]} s={[0.68, 0.03, 1.0]} c="#fca5a5" />
      {[-0.37, 0.37].map((x) => <B key={x} p={[x, 0.86, 0]} s={[0.03, 0.03, 1.2]} c={STEEL} />)}
    </group>
  ),
  hosp_wheelchair: () => (
    <group>
      <B p={[0, 0.46, 0]} s={[0.5, 0.06, 0.48]} c="#1e3a8a" />
      <B p={[0, 0.78, -0.24]} s={[0.5, 0.56, 0.05]} c="#1e3a8a" />
      {[-0.3, 0.3].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.3, -0.08]} r={0.3} h={0.05} c="#1f2937" seg={14} rot={[0, 0, Math.PI / 2]} />
          <Cyl p={[x, 0.3, -0.08]} r={0.2} h={0.06} c={CHROME} seg={14} rot={[0, 0, Math.PI / 2]} />
          <B p={[x, 0.62, 0]} s={[0.05, 0.05, 0.46]} c={STEEL} />
          <B p={[x * 0.8, 0.1, 0.34]} s={[0.06, 0.2, 0.06]} c={STEEL} />
        </group>
      ))}
      <B p={[0, 0.14, 0.42]} s={[0.44, 0.03, 0.16]} c={STEEL} />
      <B p={[0, 1.04, -0.3]} s={[0.56, 0.04, 0.04]} c="#111827" />
    </group>
  ),

  /* ---------- Police station ---------- */

  // One run of the holding cell's bars. `text` is the plate on the top rail.
  police_bars: ({ text = 'CELL' }) => (
    <group>
      {[0.06, 1.15, 2.2].map((y) => <B key={y} p={[0, y, 0]} s={[3, 0.08, 0.08]} c="#334155" />)}
      <Bars xs={Array.from({ length: 13 }, (_, i) => -1.44 + i * 0.24)} />
      <B p={[0, 2.2, 0.04]} s={[0.8, 0.26, 0.04]} c="#111827" />
      <Label p={[0, 2.2, 0.065]} w={0.74} h={0.2} text={text} bg="#facc15" fg="#111827" />
    </group>
  ),
  // The side of the cell with the door in it, padlocked.
  police_cell_door: () => (
    <group>
      {[0.06, 2.2].map((y) => <B key={y} p={[0, y, 0]} s={[3, 0.08, 0.08]} c="#334155" />)}
      <Bars xs={[-1.44, -1.2, -0.96, -0.72, 0.72, 0.96, 1.2, 1.44]} />
      {[-0.5, 0.5].map((x) => <B key={x} p={[x, 1.13, 0]} s={[0.1, 2.2, 0.1]} c="#1f2937" />)}
      <Bars xs={[-0.25, 0, 0.25]} c="#64748b" />
      <B p={[0, 1.15, 0]} s={[0.94, 0.07, 0.07]} c="#1f2937" />
      <B p={[0.4, 1.02, 0.07]} s={[0.14, 0.2, 0.07]} c="#ca8a04" />
      <B p={[0.4, 1.15, 0.07]} s={[0.1, 0.08, 0.03]} c="#94a3b8" />
    </group>
  ),
  // The counter every complaint starts at.
  police_counter: ({ text = 'CHARGE ROOM' }) => (
    <group>
      <B p={[0, 0.62, 0]} s={[3.9, 1.24, 0.6]} c={POLICE_BLUE} />
      <B p={[0, 1.0, 0.305]} s={[3.9, 0.1, 0.01]} c="#facc15" />
      <B p={[0, 0.12, 0.305]} s={[3.9, 0.1, 0.01]} c="#facc15" />
      <B p={[0, 1.27, 0]} s={[3.96, 0.06, 0.72]} c={WOOD} />
      <Label p={[0, 0.56, 0.306]} w={2.4} h={0.36} text={text} bg={POLICE_BLUE} fg="#fde68a" />
      <B p={[-1.1, 1.33, 0]} s={[0.56, 0.06, 0.4]} c="#14532d" />
      <B p={[-1.1, 1.37, 0]} s={[0.5, 0.02, 0.34]} c="#fef3c7" />
      <Cyl p={[0.3, 1.34, 0.1]} r={0.08} rt={0.03} h={0.08} c="#facc15" />
      <B p={[1.3, 1.36, 0]} s={[0.3, 0.12, 0.3]} c="#111827" />
      <B p={[1.3, 1.33, 0.17]} s={[0.3, 0.03, 0.08]} c="#111827" />
    </group>
  ),
  // On the wall at the +z edge of its cells: faces you'd get paid for pointing out.
  police_wanted: () => (
    <group position={[0, 1.55, 0.42]}>
      <B p={[0, 0, 0]} s={[1.7, 1.14, 0.05]} c="#3f2410" />
      <Label p={[0, 0.4, -0.03]} w={1.56} h={0.26} text="WANTED" bg="#b91c1c" ry={Math.PI} />
      {[-0.52, 0, 0.52].map((x) => (
        <group key={x}>
          <B p={[x, -0.14, -0.03]} s={[0.44, 0.66, 0.01]} c="#fef3c7" />
          <B p={[x, 0, -0.038]} s={[0.2, 0.2, 0.01]} c="#5a371e" />
          <B p={[x, -0.18, -0.038]} s={[0.32, 0.14, 0.01]} c="#1f2937" />
          <B p={[x, -0.36, -0.038]} s={[0.3, 0.05, 0.01]} c="#111827" />
        </group>
      ))}
    </group>
  ),
  police_lockers: ({ text = 'EXHIBITS' }) => (
    <group>
      <B p={[0, 0.95, -0.1]} s={[1.9, 1.9, 0.6]} c="#64748b" />
      {[-0.475, 0, 0.475].map((x) => <B key={x} p={[x, 0.85, 0.205]} s={[0.03, 1.6, 0.01]} c="#334155" />)}
      {[-0.71, -0.24, 0.24, 0.71].map((x) => (
        <group key={x}>
          <B p={[x, 1.3, 0.205]} s={[0.26, 0.08, 0.01]} c="#475569" />
          <B p={[x + 0.14, 0.9, 0.21]} s={[0.05, 0.1, 0.03]} c="#ca8a04" />
        </group>
      ))}
      <Label p={[0, 1.76, 0.205]} w={1.3} h={0.2} text={text} bg="#facc15" fg="#111827" />
    </group>
  ),

  /* ---------- Secretariat ---------- */

  // Counter with a grille: stamp pad, stamps and the tray your file disappears into.
  sec_registry: ({ text = 'REGISTRY' }) => (
    <group>
      <B p={[0, 0.55, 0]} s={[2.9, 1.1, 0.6]} c={WOOD} />
      <B p={[0, 0.55, 0.305]} s={[2.6, 0.7, 0.01]} c="#92400e" />
      <B p={[0, 1.13, 0]} s={[2.96, 0.06, 0.7]} c={DARK_WOOD} />
      {[-1.42, 0, 1.42].map((x) => <B key={x} p={[x, 1.6, 0.2]} s={[0.06, 0.9, 0.06]} c="#3f2410" />)}
      <B p={[0, 1.58, 0.2]} s={[2.8, 0.72, 0.02]} c="#bfe6f5" o={0.25} />
      <B p={[0, 2.14, 0.2]} s={[2.9, 0.32, 0.08]} c="#3f2410" />
      <Label p={[0, 2.14, 0.245]} w={2.7} h={0.26} text={text} bg="#14532d" fg="#fef3c7" />
      <B p={[-0.7, 1.18, 0.05]} s={[0.3, 0.04, 0.2]} c={POLICE_BLUE} />
      {[-0.35, -0.2].map((x) => <Cyl key={x} p={[x, 1.24, 0.05]} r={0.045} h={0.16} c="#3f2410" />)}
      <B p={[0.8, 1.2, 0]} s={[0.46, 0.1, 0.34]} c="#57534e" />
      <B p={[0.8, 1.26, 0]} s={[0.4, 0.04, 0.28]} c="#f8fafc" />
    </group>
  ),
  // A tower of files that has been "on the table" for years.
  sec_files: () => (
    <group>
      {FOLDERS.map((c, i) => (
        <group key={i} position={[(i % 2 ? 0.05 : -0.04) + (i > 4 ? 0.04 : 0), 0.1 + i * 0.19, i % 3 === 0 ? 0.03 : -0.02]} rotation={[0, (i % 3) * 0.12 - 0.1, 0]}>
          <B p={[0, 0, 0]} s={[0.56, 0.18, 0.42]} c={c} />
        </group>
      ))}
      <group position={[0.04, 1.44, 0]} rotation={[0, 0.5, 0]}>
        <B p={[0, 0, 0]} s={[0.4, 0.02, 0.3]} c="#f8fafc" />
      </group>
    </group>
  ),

  /* ---------- Tech hub ---------- */

  // Two seats at a shared desk: the monitors face the chairs.
  tech_desk: () => (
    <group>
      <B p={[0, 0.74, 0.45]} s={[1.9, 0.05, 0.78]} c="#f8fafc" />
      {[-0.92, 0.92].map((x) => <B key={x} p={[x, 0.37, 0.45]} s={[0.05, 0.74, 0.7]} c="#111827" />)}
      {[-0.48, 0.48].map((x, i) => (
        <group key={x}>
          <B p={[x, 0.82, 0.66]} s={[0.08, 0.12, 0.08]} c="#334155" />
          <B p={[x, 1.08, 0.66]} s={[0.62, 0.38, 0.04]} c="#0f172a" />
          <B p={[x, 1.08, 0.638]} s={[0.56, 0.32, 0.01]} c={i ? '#a78bfa' : '#38bdf8'} e={i ? '#7c3aed' : '#0284c7'} />
          <B p={[x, 0.78, 0.36]} s={[0.4, 0.02, 0.14]} c="#1f2937" />
          <TaskChair p={[x, 0, -0.45]} c={i ? '#f97316' : '#111827'} />
        </group>
      ))}
      <Cyl p={[0, 0.83, 0.3]} r={0.045} h={0.12} c="#f8fafc" />
    </group>
  ),
  // Low stage under the big screen: lectern, mic, and the banner for tonight's demo.
  tech_stage: () => (
    <group>
      <B p={[0, 0.1, 0]} s={[3.9, 0.2, 0.92]} c="#1f2937" />
      <B p={[0, 0.1, 0.465]} s={[3.9, 0.05, 0.01]} c="#22d3ee" e="#06b6d4" />
      <B p={[-1.45, 0.7, 0.1]} s={[0.5, 1.0, 0.4]} c="#f8fafc" />
      <B p={[-1.45, 0.7, 0.305]} s={[0.36, 0.5, 0.01]} c="#7c3aed" />
      <Cyl p={[-1.3, 1.36, 0.1]} r={0.015} h={0.32} c="#111827" />
      <Cyl p={[-1.3, 1.54, 0.1]} r={0.04} h={0.08} c="#111827" />
      <Cyl p={[1.6, 0.23, 0]} r={0.16} h={0.05} c="#334155" />
      <Cyl p={[1.6, 1.1, -0.04]} r={0.015} h={1.8} c={STEEL} />
      <B p={[1.6, 1.15, 0]} s={[0.7, 1.7, 0.03]} c="#0f172a" />
      <Label p={[1.6, 1.15, 0.02]} w={0.64} h={1.6} text={'DEMO\nDAY'} bg="#7c3aed" />
    </group>
  ),
  // On the wall at the +z edge of its cells: sticky notes and a diagram nobody rubbed off.
  tech_whiteboard: () => (
    <group position={[0, 1.6, 0.42]}>
      <B p={[0, 0, 0]} s={[1.8, 1.1, 0.05]} c={CHROME} />
      <B p={[0, 0, -0.03]} s={[1.7, 1.0, 0.01]} c="#ffffff" />
      {[[-0.6, 0.3, '#fde047'], [-0.36, 0.3, '#f9a8d4'], [-0.6, 0.06, '#86efac'], [-0.36, 0.06, '#fde047'], [-0.6, -0.18, '#7dd3fc'], [-0.36, -0.18, '#fdba74']].map(([x, y, c], i) => (
        <B key={i} p={[x as number, y as number, -0.04]} s={[0.2, 0.2, 0.01]} c={c as string} />
      ))}
      <B p={[0.4, 0.2, -0.04]} s={[0.5, 0.26, 0.01]} c="#2563eb" />
      <B p={[0.4, -0.2, -0.04]} s={[0.5, 0.26, 0.01]} c="#dc2626" />
      <B p={[0.4, 0, -0.04]} s={[0.03, 0.16, 0.01]} c="#111827" />
      <B p={[0, -0.56, -0.06]} s={[1.2, 0.04, 0.1]} c={STEEL} />
    </group>
  ),
  tech_server: () => (
    <group>
      <B p={[0, 1.0, 0]} s={[0.72, 2.0, 0.8]} c="#0f172a" />
      <B p={[0, 1.0, 0.405]} s={[0.58, 1.84, 0.01]} c="#1e293b" />
      {[0.3, 0.65, 1.0, 1.35, 1.7].map((y, i) => (
        <group key={y}>
          <B p={[0, y, 0.41]} s={[0.5, 0.1, 0.01]} c="#334155" />
          <B p={[-0.14, y, 0.416]} s={[0.14, 0.03, 0.01]} c={i % 2 ? '#38bdf8' : '#22c55e'} e={i % 2 ? '#0ea5e9' : '#22c55e'} />
        </group>
      ))}
    </group>
  ),
  tech_coffee: ({ text = 'FREE COFFEE' }) => (
    <group>
      <B p={[0, 0.5, 0]} s={[1.9, 1.0, 0.6]} c="#111827" />
      <B p={[0, 1.03, 0]} s={[1.96, 0.06, 0.68]} c="#d6b98a" />
      <Label p={[0, 0.58, 0.306]} w={1.5} h={0.3} text={text} bg="#111827" fg="#fde68a" />
      <B p={[-0.5, 1.28, -0.05]} s={[0.56, 0.44, 0.4]} c="#dc2626" />
      <B p={[-0.5, 1.52, -0.05]} s={[0.58, 0.05, 0.42]} c={CHROME} />
      <B p={[-0.5, 1.12, 0.2]} s={[0.4, 0.04, 0.12]} c={CHROME} />
      {[0.1, 0.25, 0.4].map((x) => <Cyl key={x} p={[x, 1.12, 0.1]} r={0.05} h={0.12} c="#f8fafc" />)}
      <Cyl p={[0.7, 1.2, -0.05]} r={0.1} h={0.28} c="#7c4a24" o={0.8} />
    </group>
  ),

  /* ---------- Polytechnic ---------- */

  // Lecture-hall bench for three.
  poly_bench: () => (
    <group>
      <BenchDesk w={2.84} c={WOOD} top="#a16207" />
      <B p={[-0.8, 0.79, 0.2]} s={[0.3, 0.04, 0.22]} c="#1d4ed8" />
      <B p={[0.6, 0.78, 0.22]} s={[0.26, 0.02, 0.2]} c="#f8fafc" />
    </group>
  ),
  poly_lectern: () => (
    <group>
      <B p={[0, 0.5, 0]} s={[0.6, 1.0, 0.45]} c={DARK_WOOD} />
      <group position={[0, 1.06, 0]} rotation={[0.3, 0, 0]}>
        <B p={[0, 0, 0]} s={[0.68, 0.05, 0.54]} c={WOOD} />
        <B p={[0, 0.04, 0.02]} s={[0.4, 0.02, 0.3]} c="#f8fafc" />
      </group>
      <Cyl p={[0.2, 1.3, -0.15]} r={0.015} h={0.36} c="#111827" />
      <B p={[0, 0.6, 0.23]} s={[0.36, 0.36, 0.01]} c="#facc15" />
    </group>
  ),
  // Library table for two: books, a lamp and no talking.
  poly_study: () => (
    <group>
      <B p={[0, 0.74, 0.45]} s={[1.9, 0.06, 0.8]} c={DARK_WOOD} />
      {[-0.88, 0.88].map((x) => <B key={x} p={[x, 0.37, 0.45]} s={[0.07, 0.74, 0.72]} c="#3f2410" />)}
      <B p={[0, 0.95, 0.82]} s={[1.9, 0.36, 0.04]} c="#3f2410" />
      {[-0.5, 0.5].map((x, i) => (
        <group key={x}>
          <B p={[x, 0.79, 0.34]} s={[0.4, 0.04, 0.3]} c="#fef3c7" />
          <B p={[x + 0.3, 0.84, 0.56]} s={[0.24, 0.14, 0.3]} c={i ? '#7f1d1d' : '#1e3a8a'} />
          <B p={[x, 0.44, -0.45]} s={[0.46, 0.06, 0.46]} c={WOOD} />
          <B p={[x, 0.76, -0.66]} s={[0.46, 0.5, 0.05]} c={WOOD} />
          <B p={[x, 0.22, -0.45]} s={[0.4, 0.44, 0.06]} c="#3f2410" />
        </group>
      ))}
      <Cyl p={[0, 0.95, 0.66]} r={0.03} h={0.36} c="#a16207" />
      <Cyl p={[0, 1.16, 0.62]} r={0.14} rt={0.06} h={0.12} c="#16a34a" e="#14532d" />
    </group>
  ),

  /* ---------- Primary school ---------- */

  // Two pupils to a bench, the desk scratched with a hundred names.
  school_bench: () => (
    <group>
      <BenchDesk w={1.84} c="#a16207" top="#b98d5f" />
      <B p={[-0.4, 0.78, 0.22]} s={[0.3, 0.02, 0.22]} c="#f8fafc" />
      <B p={[0.45, 0.79, 0.2]} s={[0.24, 0.04, 0.18]} c="#16a34a" />
    </group>
  ),
  // The brass bell that starts assembly, hung on its post.
  school_bell: () => (
    <group>
      <Cyl p={[0, 0.04, 0]} r={0.24} h={0.08} c="#57534e" />
      <B p={[-0.25, 1.05, 0]} s={[0.08, 2.1, 0.08]} c={DARK_WOOD} />
      <B p={[0, 2.06, 0]} s={[0.7, 0.08, 0.08]} c={DARK_WOOD} />
      <Cyl p={[0.15, 1.96, 0]} r={0.015} h={0.14} c="#44403c" />
      <Cyl p={[0.15, 1.72, 0]} r={0.2} rt={0.09} h={0.3} c="#eab308" seg={12} />
      <Cyl p={[0.15, 1.54, 0]} r={0.22} h={0.04} c="#ca8a04" seg={12} />
      <Cyl p={[0.15, 1.36, 0]} r={0.012} h={0.36} c="#f8fafc" />
    </group>
  ),
  // On the wall at the +z edge of its cells: whatever the class is chanting this term.
  school_chart: ({ text = 'A B C D\nE F G H\nI J K L' }) => (
    <group position={[0, 1.6, 0.42]}>
      <B p={[0, 0, 0]} s={[1.7, 1.1, 0.04]} c="#dc2626" />
      <Label p={[0, 0, -0.025]} w={1.56} h={0.96} text={text} bg="#fef9c3" fg="#1d4ed8" ry={Math.PI} glow={0.15} />
    </group>
  ),
  school_map: () => (
    <group position={[0, 1.6, 0.42]}>
      <B p={[0, 0, 0]} s={[1.7, 1.2, 0.04]} c={DARK_WOOD} />
      <B p={[0, 0, -0.025]} s={[1.56, 1.06, 0.01]} c="#bfdbfe" />
      <B p={[0, 0.08, -0.034]} s={[0.9, 0.5, 0.01]} c="#16a34a" />
      <B p={[-0.1, -0.22, -0.034]} s={[0.6, 0.22, 0.01]} c="#22c55e" />
      <B p={[0.36, 0.3, -0.034]} s={[0.36, 0.16, 0.01]} c="#15803d" />
      <B p={[0.05, 0.02, -0.04]} s={[0.07, 0.07, 0.01]} c="#dc2626" />
      <Label p={[0, -0.43, -0.034]} w={1.1} h={0.14} text="MAP OF NIGERIA" bg="#bfdbfe" fg="#111827" ry={Math.PI} glow={0.1} />
    </group>
  ),

  /* ---------- Prison ---------- */

  // High in the wall at the +z edge of its cells: a strip of sky behind bars.
  prison_window: () => (
    <group position={[0, 2.05, 0.42]}>
      <B p={[0, 0, 0]} s={[1.3, 0.56, 0.06]} c="#475569" />
      <B p={[0, 0, -0.035]} s={[1.14, 0.42, 0.01]} c="#bfe6f5" e="#7dd3fc" />
      {[-0.42, -0.21, 0, 0.21, 0.42].map((x) => <B key={x} p={[x, 0, -0.05]} s={[0.04, 0.42, 0.03]} c="#1f2937" />)}
    </group>
  ),
  /* ---------- Police cells (game/cells.ts) ---------- */

  // The barred gate in the back wall of the charge room that leads through to the cells (rot 2 puts it on the wall).
  cellblock_gate: ({ text = 'CELLS' }) => (
    <group position={[0, 0, 0.44]}>
      <B p={[0, 1.12, 0.05]} s={[1.24, 2.24, 0.02]} c="#1f2937" />
      {[-0.66, 0.66].map((x) => <B key={x} p={[x, 1.2, 0]} s={[0.16, 2.4, 0.16]} c="#9ca3af" />)}
      <B p={[0, 2.36, 0]} s={[1.48, 0.16, 0.16]} c="#9ca3af" />
      {[0.08, 1.1, 2.18].map((y) => <B key={y} p={[0, y, -0.02]} s={[1.16, 0.07, 0.06]} c="#334155" />)}
      <Bars xs={[-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5]} h={2.2} />
      <B p={[0.38, 1.0, -0.07]} s={[0.12, 0.18, 0.06]} c="#ca8a04" />
      <B p={[0, 2.62, -0.02]} s={[1.44, 0.3, 0.04]} c="#111827" />
      <Label p={[0, 2.62, -0.045]} w={1.38} h={0.24} text={text} bg="#facc15" fg="#111827" ry={Math.PI} />
      <B p={[0, 0.006, -0.62]} s={[1.6, 0.012, 0.08]} c="#facc15" />
    </group>
  ),
  // A concrete ledge built out from the back wall, with a thin foam mattress and a folded blanket at the head.
  cell_bunk: () => (
    <group>
      <B p={[0, 0.22, 0]} s={[0.92, 0.44, 1.94]} c="#9ca3af" />
      <B p={[0, 0.45, 0]} s={[0.96, 0.03, 1.98]} c="#cbd5e1" />
      <B p={[0, 0.49, 0.03]} s={[0.78, 0.06, 1.78]} c="#a8a29e" />
      <B p={[0, 0.54, -0.68]} s={[0.62, 0.06, 0.32]} c="#57534e" />
    </group>
  ),
  // A slit of sky high in the back wall (rot 2), three bars across it.
  cell_window: () => (
    <group position={[0, 2.05, 0.42]}>
      <B p={[0, 0, 0]} s={[0.74, 0.4, 0.06]} c="#475569" />
      <B p={[0, 0, -0.035]} s={[0.62, 0.28, 0.01]} c="#bfe6f5" e="#7dd3fc" />
      {[-0.18, 0, 0.18].map((x) => <B key={x} p={[x, 0, -0.05]} s={[0.04, 0.3, 0.03]} c="#1f2937" />)}
    </group>
  ),
  // The front of a cell: bars either side of the doorway, the frame, and the cell's number over it. The door itself
  // slides, so three/CellBlock.tsx draws it.
  cell_front: ({ text = 'CELL' }) => (
    <group>
      {[0.06, 1.15].map((y) => [-1, 1].map((sx) => <B key={`${y}${sx}`} p={[sx, y, 0]} s={[1.0, 0.07, 0.07]} c="#334155" />))}
      <B p={[0, 2.36, 0]} s={[3, 0.1, 0.1]} c="#334155" />
      <Bars xs={[-1.44, -1.24, -1.04, -0.84, -0.64, 0.64, 0.84, 1.04, 1.24, 1.44]} h={2.34} />
      {[-0.52, 0.52].map((x) => <B key={x} p={[x, 1.2, 0]} s={[0.1, 2.4, 0.12]} c="#1f2937" />)}
      <B p={[0, 2.5, 0.02]} s={[0.84, 0.24, 0.04]} c="#111827" />
      <Label p={[0, 2.5, 0.045]} w={0.78} h={0.19} text={text} bg="#facc15" fg="#111827" />
      <B p={[0, 0.006, 0.47]} s={[3, 0.012, 0.06]} c="#facc15" />
    </group>
  ),
  // The block wall between two cells, from the back wall to the bars, with a pillar where it meets them.
  cell_partition: () => (
    <group>
      <B p={[0, 1.3, -0.25]} s={[0.3, 2.6, 4.5]} c="#cbd5e1" />
      <B p={[0, 2.63, -0.25]} s={[0.34, 0.06, 4.5]} c="#1f4e3d" />
      <B p={[0, 1.3, 2.0]} s={[1.0, 2.6, 0.36]} c="#94a3b8" />
      <B p={[0, 0.08, -0.25]} s={[0.34, 0.16, 4.5]} c="#64748b" />
    </group>
  ),
  // Scratched into the plaster: days counted in fives.
  prison_tally: () => (
    <group position={[0, 1.3, 0.425]}>
      {[-0.26, 0.26].map((gx) =>
        [0.2, -0.2].map((gy) => (
          <group key={`${gx}${gy}`} position={[gx, gy, 0]}>
            {[-0.12, -0.04, 0.04, 0.12].map((x) => <B key={x} p={[x, 0, 0]} s={[0.02, 0.26, 0.01]} c="#57534e" />)}
            <group rotation={[0, 0, 0.9]}>
              <B p={[0, 0, -0.004]} s={[0.02, 0.42, 0.01]} c="#57534e" />
            </group>
          </group>
        )),
      )}
    </group>
  ),
};
