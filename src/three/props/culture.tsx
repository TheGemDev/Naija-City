// Props for the mosque, the cathedral, the legislative chamber, the archive, the museum, the viewing centre,
// the boutique and the mall. Centred on the footprint, on y=0, front facing +z.

import { B, Ball, CHROME, Cyl, Label, STEEL, Table, type Model, type V3 } from '../propKit';

const GOLD = '#ca8a04';
const WOOD = '#7c4a24';
const DARK_WOOD = '#4a2c17';
const TERRACOTTA = '#b45309';

/** Half a disc standing up, flat face to +z: the top of an arch. */
function Arch({ p, r, c, t = 0.05, e }: { p: V3; r: number; c: string; t?: number; e?: string }) {
  return (
    <mesh position={p} rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r, t, 16, 1, false, -Math.PI / 2, Math.PI]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} flatShading />
    </mesh>
  );
}

/** A Nok-style head: long face, bun of hair, pierced eyes. */
function NokHead({ p, s = 1, c = TERRACOTTA }: { p: V3; s?: number; c?: string }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0.08, 0]} r={0.09} h={0.16} c={c} />
      <Ball p={[0, 0.36, 0]} r={0.2} c={c} s={[0.9, 1.3, 0.9]} />
      <Ball p={[0, 0.64, -0.02]} r={0.1} c={c} />
      {[-0.07, 0.07].map((x) => <B key={x} p={[x, 0.4, 0.17]} s={[0.06, 0.03, 0.02]} c="#1c1917" />)}
      <B p={[0, 0.25, 0.17]} s={[0.08, 0.025, 0.02]} c="#1c1917" />
    </group>
  );
}

const FIXTURES = [['ARS v MUN', '5:30'], ['CHE v LIV', '8:00'], ['RMA v BAR', '9:00']];
const PANES = ['#dc2626', '#2563eb', '#facc15', '#16a34a', '#9333ea', '#f97316'];
const SPINES = ['#14532d', '#7f1d1d', '#1e3a8a', '#a16207'];

export const CULTURE_PROPS: Record<string, Model> = {
  /* ---------- Mosque ---------- */

  // The niche in the qibla wall that the rows face.
  mosque_mihrab: () => (
    <group position={[0, 0, -0.36]}>
      <B p={[0, 1.25, 0]} s={[1.9, 2.5, 0.26]} c="#f5f0e1" />
      <B p={[0, 1.0, 0.1]} s={[1.26, 2.0, 0.1]} c={GOLD} />
      <Arch p={[0, 2.0, 0.1]} r={0.63} c={GOLD} t={0.1} />
      <B p={[0, 1.0, 0.13]} s={[1.06, 2.0, 0.08]} c="#0f5132" />
      <Arch p={[0, 2.0, 0.13]} r={0.53} c="#0f5132" t={0.08} />
      {[0.5, 1.0, 1.5].map((y) => <B key={y} p={[0, y, 0.175]} s={[0.16, 0.16, 0.01]} c={GOLD} />)}
      <B p={[0, 0.1, 0.2]} s={[1.06, 0.2, 0.12]} c="#e9d8a6" />
      <Cyl p={[0, 2.25, 0.24]} r={0.012} h={0.3} c={GOLD} />
      <Cyl p={[0, 2.02, 0.24]} r={0.08} rt={0.05} h={0.18} c="#fde68a" e="#b45309" />
      {[-0.85, 0.85].map((x) => <B key={x} p={[x, 1.25, 0.135]} s={[0.1, 2.5, 0.02]} c="#0f766e" />)}
    </group>
  ),
  // Steps up to where the khutbah is given, against the wall beside the mihrab.
  mosque_minbar: () => (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <group key={i}>
          <B p={[0, (i + 1) * 0.14, 0.72 - i * 0.36]} s={[0.8, (i + 1) * 0.28, 0.36]} c={WOOD} />
          <B p={[0, (i + 1) * 0.28 + 0.012, 0.72 - i * 0.36]} s={[0.56, 0.024, 0.36]} c="#15803d" />
        </group>
      ))}
      <B p={[0, 0.62, -0.72]} s={[0.8, 1.24, 0.5]} c={WOOD} />
      <B p={[0, 1.7, -0.93]} s={[0.8, 1.0, 0.08]} c={DARK_WOOD} />
      {[-0.37, 0.37].map((x) => <B key={x} p={[x, 1.75, -0.5]} s={[0.06, 1.0, 0.06]} c={DARK_WOOD} />)}
      <B p={[0, 2.28, -0.72]} s={[0.9, 0.08, 0.56]} c="#15803d" />
      <Ball p={[0, 2.42, -0.72]} r={0.09} c={GOLD} />
      {[-0.4, 0.4].map((x) => <B key={`r${x}`} p={[x, 0.75, 0.2]} s={[0.04, 0.05, 1.5]} c={DARK_WOOD} />)}
    </group>
  ),
  // Arched lattice window. On the wall at the +z edge of its cells (rot 2 on the back wall, 1 on the left).
  mosque_window: () => (
    <group position={[0, 0, 0.41]} rotation-y={Math.PI}>
      <B p={[0, 1.35, 0]} s={[1.2, 1.3, 0.05]} c="#e7dfc9" />
      <Arch p={[0, 2.0, 0]} r={0.6} c="#e7dfc9" />
      <B p={[0, 1.35, 0.03]} s={[1.0, 1.2, 0.02]} c="#bae6fd" e="#38bdf8" />
      <Arch p={[0, 1.95, 0.03]} r={0.5} c="#bae6fd" t={0.02} e="#38bdf8" />
      {[-0.25, 0, 0.25].map((x) => <B key={x} p={[x, 1.5, 0.045]} s={[0.035, 1.6, 0.02]} c="#f8fafc" />)}
      {[0.95, 1.25, 1.55, 1.85, 2.15].map((y) => <B key={y} p={[0, y, 0.045]} s={[y > 2 ? 0.8 : 1.0, 0.035, 0.02]} c="#f8fafc" />)}
    </group>
  ),
  mosque_shelf: () => (
    <group>
      <B p={[0, 0.6, -0.15]} s={[0.9, 1.2, 0.45]} c={WOOD} />
      {[0.3, 0.7].map((y, r) => (
        <group key={y}>
          <B p={[0, y - 0.14, 0.09]} s={[0.8, 0.03, 0.06]} c={DARK_WOOD} />
          {[-0.28, -0.14, 0, 0.14, 0.28].map((x, i) => <B key={x} p={[x, y + 0.02, 0.085]} s={[0.1, 0.28, 0.04]} c={SPINES[(i + r) % 4]} />)}
        </group>
      ))}
      {/* Qur'an open on its stand */}
      <B p={[-0.1, 1.27, -0.15]} s={[0.22, 0.03, 0.3]} c={DARK_WOOD} />
      <B p={[0.1, 1.27, -0.15]} s={[0.22, 0.03, 0.3]} c={DARK_WOOD} />
      <B p={[0, 1.31, -0.15]} s={[0.36, 0.03, 0.26]} c="#fef9c3" />
    </group>
  ),
  // Taps over a tiled trough, a stool at each, and the plastic kettles.
  mosque_ablution: () => (
    <group>
      <B p={[0, 0.75, -0.38]} s={[1.9, 1.5, 0.18]} c="#e0f2fe" />
      <B p={[0, 1.05, -0.28]} s={[1.9, 0.08, 0.02]} c="#0e7490" />
      <B p={[0, 0.24, -0.1]} s={[1.9, 0.24, 0.42]} c="#93c5fd" />
      <B p={[0, 0.37, -0.1]} s={[1.7, 0.02, 0.26]} c="#38bdf8" />
      {[-0.6, 0, 0.6].map((x) => (
        <group key={x}>
          <B p={[x, 0.8, -0.22]} s={[0.05, 0.05, 0.16]} c={CHROME} />
          <B p={[x, 0.74, -0.14]} s={[0.04, 0.1, 0.04]} c={CHROME} />
          <Cyl p={[x, 0.15, 0.3]} r={0.16} h={0.3} c="#f8fafc" />
        </group>
      ))}
      {[[-0.9, '#16a34a'], [0.9, '#2563eb']].map(([x, c]) => (
        <group key={x}>
          <Cyl p={[x as number, 0.16, 0.3]} r={0.09} rt={0.06} h={0.3} c={c as string} />
          <B p={[(x as number) * 0.92, 0.2, 0.42]} s={[0.03, 0.14, 0.12]} c={c as string} />
        </group>
      ))}
    </group>
  ),
  mosque_toilet: () => (
    <group>
      <B p={[0, 1.1, -0.06]} s={[0.92, 2.2, 0.84]} c="#e2e8f0" />
      <B p={[0, 0.98, 0.37]} s={[0.64, 1.9, 0.03]} c="#0f766e" />
      <B p={[0.22, 1.0, 0.395]} s={[0.05, 0.12, 0.03]} c={CHROME} />
      <Label p={[0, 2.06, 0.365]} w={0.7} h={0.2} text="TOILET" bg="#0f766e" />
    </group>
  ),
  // Shoes come off at the door.
  mosque_shoes: () => (
    <group>
      {[-0.92, 0.92].map((x) => <B key={x} p={[x, 0.55, -0.1]} s={[0.06, 1.1, 0.5]} c={WOOD} />)}
      {[0.12, 0.48, 0.84].map((y, r) => (
        <group key={y}>
          <B p={[0, y, -0.1]} s={[1.8, 0.04, 0.5]} c="#a16207" />
          {[-0.65, -0.3, 0.05, 0.4, 0.72].map((x, i) =>
            (i + r) % 4 === 3 ? null : (
              <group key={x}>
                <B p={[x - 0.06, y + 0.07, -0.05]} s={[0.09, 0.08, 0.3]} c={['#1f2937', '#7c2d12', '#e5e7eb', '#1d4ed8', '#b45309'][(i + r * 2) % 5]} />
                <B p={[x + 0.06, y + 0.07, -0.05]} s={[0.09, 0.08, 0.3]} c={['#1f2937', '#7c2d12', '#e5e7eb', '#1d4ed8', '#b45309'][(i + r * 2) % 5]} />
              </group>
            ),
          )}
        </group>
      ))}
    </group>
  ),
  mosque_sadaqah: () => (
    <group>
      <B p={[0, 0.4, 0]} s={[0.3, 0.8, 0.3]} c={DARK_WOOD} />
      <B p={[0, 1.0, 0]} s={[0.6, 0.5, 0.45]} c="#15803d" />
      <B p={[0, 1.26, 0]} s={[0.26, 0.02, 0.05]} c="#0b0f14" />
      <B p={[0, 0.9, 0.23]} s={[0.1, 0.14, 0.03]} c={GOLD} />
      <Label p={[0, 1.08, 0.23]} w={0.52} h={0.16} text="SADAQAH" bg="#f8fafc" fg="#14532d" />
    </group>
  ),

  /* ---------- Church ---------- */

  // Table dressed in white, candles either end, and the cross on the wall behind.
  church_altar: () => (
    <group>
      <B p={[0, 0.08, 0]} s={[2, 0.16, 1]} c="#5b1616" />
      <B p={[0, 0.62, 0]} s={[1.7, 0.92, 0.62]} c="#fafaf9" />
      <B p={[0, 1.09, 0]} s={[1.78, 0.04, 0.7]} c="#facc15" />
      <B p={[0, 0.66, 0.315]} s={[0.5, 0.92, 0.01]} c="#6d28d9" />
      <B p={[0, 0.7, 0.325]} s={[0.07, 0.4, 0.01]} c="#facc15" />
      <B p={[0, 0.78, 0.325]} s={[0.24, 0.07, 0.01]} c="#facc15" />
      {[-0.7, 0.7].map((x) => (
        <group key={x}>
          <Cyl p={[x, 1.14, 0]} r={0.07} h={0.06} c={GOLD} />
          <Cyl p={[x, 1.36, 0]} r={0.03} h={0.4} c="#fafaf9" />
          <B p={[x, 1.6, 0]} s={[0.04, 0.07, 0.04]} c="#fde68a" e="#f59e0b" />
        </group>
      ))}
      <Cyl p={[0.2, 1.2, 0.05]} r={0.06} rt={0.09} h={0.2} c={GOLD} />
      <B p={[-0.2, 1.13, 0.05]} s={[0.34, 0.05, 0.26]} c="#f5f5f4" />
      <B p={[0, 1.9, -0.42]} s={[0.16, 1.5, 0.08]} c={WOOD} />
      <B p={[0, 2.2, -0.42]} s={[0.9, 0.16, 0.08]} c={WOOD} />
    </group>
  ),
  church_pulpit: () => (
    <group>
      <Cyl p={[0, 0.1, 0]} r={0.46} h={0.2} c={DARK_WOOD} seg={8} />
      <Cyl p={[0, 0.75, 0]} r={0.38} h={1.1} c={WOOD} seg={8} />
      <Cyl p={[0, 1.32, 0]} r={0.42} h={0.06} c={DARK_WOOD} seg={8} />
      <group position={[0, 1.42, 0.12]} rotation={[0.5, 0, 0]}>
        <B p={[0, 0, 0]} s={[0.5, 0.04, 0.36]} c={DARK_WOOD} />
        <B p={[0, 0.03, 0]} s={[0.36, 0.03, 0.26]} c="#fafaf9" />
      </group>
      <B p={[0, 0.82, 0.37]} s={[0.06, 0.4, 0.02]} c="#facc15" />
      <B p={[0, 0.9, 0.37]} s={[0.24, 0.06, 0.02]} c="#facc15" />
    </group>
  ),
  // Bench with a high back and a book ledge in front.
  church_choir: () => (
    <group>
      <B p={[0, 0.22, 0]} s={[2.84, 0.44, 0.5]} c={WOOD} />
      <B p={[0, 0.9, -0.3]} s={[2.84, 1.8, 0.1]} c={DARK_WOOD} />
      {[-1, 0, 1].map((x) => <B key={x} p={[x, 1.2, -0.24]} s={[0.7, 0.9, 0.02]} c="#7f1d1d" />)}
      <B p={[0, 0.4, 0.44]} s={[2.84, 0.8, 0.06]} c={WOOD} />
      <B p={[0, 0.82, 0.4]} s={[2.84, 0.04, 0.18]} c={DARK_WOOD} />
      {[-0.9, 0.1, 1].map((x) => <B key={`b${x}`} p={[x, 0.86, 0.4]} s={[0.26, 0.04, 0.14]} c="#1e3a8a" />)}
    </group>
  ),
  church_organ: () => (
    <group>
      <B p={[0, 0.55, 0.1]} s={[1.6, 1.1, 0.6]} c={WOOD} />
      <B p={[0, 1.0, 0.36]} s={[1.3, 0.05, 0.22]} c="#fafaf9" />
      <B p={[0, 1.12, 0.3]} s={[1.3, 0.05, 0.18]} c="#fafaf9" />
      <B p={[0, 1.5, 0.05]} s={[0.5, 0.36, 0.04]} c="#fef9c3" />
      <B p={[0, 1.3, -0.25]} s={[1.8, 0.5, 0.3]} c={DARK_WOOD} />
      {[-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75].map((x, i) => (
        <Cyl key={x} p={[x, 1.55 + (0.5 + Math.abs(3 - i) * 0.16) / 2, -0.25]} r={0.09} h={0.5 + Math.abs(3 - i) * 0.16} c="#d4a017" seg={8} />
      ))}
      <B p={[0, 0.25, 0.75]} s={[0.9, 0.5, 0.3]} c={DARK_WOOD} />
    </group>
  ),
  // Stained glass in a pointed frame. On the wall at the +z edge of its cell.
  church_window: () => (
    <group position={[0, 0, 0.41]} rotation-y={Math.PI}>
      <B p={[0, 1.45, 0]} s={[0.74, 1.3, 0.05]} c="#78716c" />
      <Arch p={[0, 2.1, 0]} r={0.37} c="#78716c" />
      <Arch p={[0, 2.1, 0.03]} r={0.28} c="#fde047" t={0.02} e="#eab308" />
      {[0, 1, 2].map((r) => [-0.15, 0.15].map((x, i) => {
        const c = PANES[(r * 2 + i) % PANES.length];
        return <B key={`${r}${x}`} p={[x, 0.98 + r * 0.4, 0.03]} s={[0.25, 0.35, 0.02]} c={c} e={c} />;
      }))}
    </group>
  ),
  church_offering: () => (
    <group>
      <B p={[0, 0.45, 0]} s={[0.36, 0.9, 0.36]} c={DARK_WOOD} />
      <B p={[0, 1.08, 0]} s={[0.64, 0.4, 0.5]} c={WOOD} />
      <B p={[0, 1.29, 0]} s={[0.28, 0.02, 0.05]} c="#0b0f14" />
      <B p={[0, 1.14, 0.255]} s={[0.07, 0.26, 0.01]} c="#facc15" />
      <B p={[0, 1.19, 0.255]} s={[0.2, 0.06, 0.01]} c="#facc15" />
      <Label p={[0, 0.72, 0.185]} w={0.34} h={0.12} text="OFFERING" bg="#fef3c7" fg="#451a03" />
    </group>
  ),

  /* ---------- Legislative chamber ---------- */

  // High-backed chair on a dais under a carved canopy.
  lugard_chair: () => (
    <group>
      <B p={[0, 0.12, 0]} s={[1.9, 0.24, 1.9]} c="#7f1d1d" />
      <B p={[0, 0.3, -0.25]} s={[1.5, 0.12, 1.3]} c="#991b1b" />
      <B p={[0, 0.6, -0.3]} s={[0.84, 0.5, 0.7]} c={DARK_WOOD} />
      <B p={[0, 0.88, -0.26]} s={[0.7, 0.1, 0.6]} c="#14532d" />
      <B p={[0, 1.55, -0.66]} s={[0.96, 1.8, 0.14]} c={DARK_WOOD} />
      <B p={[0, 1.5, -0.58]} s={[0.66, 1.1, 0.03]} c="#14532d" />
      {[-0.44, 0.44].map((x) => <B key={x} p={[x, 1.08, -0.3]} s={[0.1, 0.36, 0.7]} c={DARK_WOOD} />)}
      <B p={[0, 2.5, -0.5]} s={[1.3, 0.14, 0.6]} c={DARK_WOOD} />
      {[-0.6, 0.6].map((x) => <B key={`p${x}`} p={[x, 1.5, -0.74]} s={[0.1, 2.0, 0.1]} c={DARK_WOOD} />)}
      <Ball p={[0, 2.26, -0.57]} r={0.13} c={GOLD} />
      <B p={[0, 2.5, -0.19]} s={[1.3, 0.14, 0.02]} c={GOLD} />
      {[-0.85, 0.85].map((x) => (
        <group key={`b${x}`}>
          <Cyl p={[x, 0.7, 0.8]} r={0.035} h={0.9} c={GOLD} />
          <Ball p={[x, 1.2, 0.8]} r={0.07} c={GOLD} />
        </group>
      ))}
    </group>
  ),
  // Green baize, the mace on its rests, and the order books.
  lugard_table: () => (
    <group>
      <B p={[0, 0.4, 0]} s={[1.6, 0.8, 0.66]} c={DARK_WOOD} />
      <B p={[0, 0.82, 0]} s={[1.84, 0.06, 0.84]} c={WOOD} />
      <B p={[0, 0.86, 0]} s={[1.6, 0.02, 0.64]} c="#166534" />
      {[-0.5, 0.5].map((x) => <B key={x} p={[x, 0.93, 0.12]} s={[0.06, 0.12, 0.1]} c={GOLD} />)}
      <Cyl p={[0, 1.01, 0.12]} r={0.035} h={1.3} c={GOLD} rot={[0, 0, Math.PI / 2]} />
      <Ball p={[0.7, 1.01, 0.12]} r={0.11} c="#facc15" />
      <B p={[-0.5, 0.92, -0.18]} s={[0.36, 0.1, 0.24]} c="#7f1d1d" />
      <B p={[-0.5, 1.0, -0.18]} s={[0.3, 0.06, 0.2]} c="#1e3a8a" />
      <B p={[0.4, 0.89, -0.18]} s={[0.3, 0.03, 0.22]} c="#fef9c3" />
    </group>
  ),
  // Members' bench in green leather, with a rail to write on.
  lugard_bench: () => (
    <group>
      <B p={[0, 0.2, 0]} s={[2.84, 0.4, 0.56]} c={DARK_WOOD} />
      <B p={[0, 0.43, 0.02]} s={[2.84, 0.08, 0.52]} c="#166534" />
      <B p={[0, 0.82, -0.27]} s={[2.84, 0.72, 0.1]} c="#14532d" />
      <B p={[0, 1.2, -0.27]} s={[2.9, 0.06, 0.14]} c={DARK_WOOD} />
      {[-1.42, 1.42].map((x) => <B key={x} p={[x, 0.5, 0]} s={[0.08, 1.0, 0.6]} c={DARK_WOOD} />)}
      {[-0.95, 0, 0.95].map((x) => <B key={`g${x}`} p={[x, 1.0, -0.215]} s={[0.05, 0.05, 0.01]} c={GOLD} />)}
    </group>
  ),
  // Marks the floor under the dome.
  lugard_medallion: () => (
    <group>
      <Cyl p={[0, 0.012, 0]} r={0.96} h={0.02} c={GOLD} seg={24} />
      <Cyl p={[0, 0.016, 0]} r={0.84} h={0.022} c="#0f3d26" seg={24} />
      <Cyl p={[0, 0.02, 0]} r={0.56} h={0.024} c="#f8fafc" seg={24} />
      {[0, Math.PI / 4].map((r) => (
        <group key={r} rotation-y={r}>
          <B p={[0, 0.034, 0]} s={[0.6, 0.012, 0.6]} c={GOLD} />
        </group>
      ))}
      <Cyl p={[0, 0.042, 0]} r={0.16} h={0.012} c="#15803d" seg={12} />
    </group>
  ),

  /* ---------- Archive ---------- */

  // Mahogany desk as it was left: lamp, telephone, papers, and the chair pushed back.
  arewa_desk: () => (
    <group>
      <B p={[0, 0.78, 0]} s={[1.84, 0.08, 0.86]} c={DARK_WOOD} />
      <B p={[0, 0.83, 0.05]} s={[1.2, 0.02, 0.5]} c="#14532d" />
      {[-0.62, 0.62].map((x) => <B key={x} p={[x, 0.37, 0]} s={[0.5, 0.74, 0.78]} c={WOOD} />)}
      <B p={[0, 0.5, 0.37]} s={[0.76, 0.4, 0.04]} c={WOOD} />
      <Cyl p={[-0.7, 0.84, -0.2]} r={0.09} h={0.04} c={GOLD} />
      <Cyl p={[-0.7, 1.0, -0.2]} r={0.02} h={0.3} c={GOLD} />
      <B p={[-0.7, 1.16, -0.14]} s={[0.36, 0.1, 0.16]} c="#15803d" e="#14532d" />
      <B p={[0.65, 0.88, -0.15]} s={[0.24, 0.1, 0.2]} c="#111827" />
      <B p={[0.65, 0.95, -0.15]} s={[0.3, 0.05, 0.07]} c="#111827" />
      <B p={[0.05, 0.85, 0.1]} s={[0.36, 0.02, 0.28]} c="#fef9c3" />
      <B p={[0.3, 0.86, 0.02]} s={[0.3, 0.02, 0.22]} c="#f5f5f4" />
      {/* Chair behind it */}
      <B p={[0, 0.45, -0.72]} s={[0.56, 0.12, 0.5]} c="#7f1d1d" />
      <B p={[0, 0.22, -0.72]} s={[0.46, 0.44, 0.4]} c={DARK_WOOD} />
      <B p={[0, 0.98, -0.94]} s={[0.56, 1.0, 0.08]} c="#7f1d1d" />
    </group>
  ),
  arewa_lectern: () => (
    <group>
      <B p={[0, 0.04, 0]} s={[0.6, 0.08, 0.5]} c={DARK_WOOD} />
      <B p={[0, 0.6, -0.02]} s={[0.4, 1.1, 0.3]} c={WOOD} />
      <group position={[0, 1.2, 0.02]} rotation={[0.45, 0, 0]}>
        <B p={[0, 0, 0]} s={[0.62, 0.05, 0.46]} c={DARK_WOOD} />
        <B p={[0, 0.035, 0.02]} s={[0.4, 0.02, 0.3]} c="#fef9c3" />
      </group>
      <Cyl p={[0.2, 1.42, -0.12]} r={0.012} h={0.36} c={STEEL} />
      <B p={[0.2, 1.62, -0.12]} s={[0.08, 0.12, 0.08]} c={CHROME} />
      <B p={[0, 0.7, 0.135]} s={[0.22, 0.22, 0.01]} c={GOLD} />
    </group>
  ),
  // Babban riga and turban on a stand, under glass.
  arewa_regalia: () => (
    <group>
      <B p={[0, 0.2, 0]} s={[0.84, 0.4, 0.84]} c="#292524" />
      <Cyl p={[0, 0.9, 0]} r={0.03} h={1.0} c={DARK_WOOD} />
      <B p={[0, 0.95, 0]} s={[0.46, 0.9, 0.24]} c="#f8fafc" />
      <B p={[0, 1.28, 0]} s={[0.7, 0.3, 0.26]} c="#f8fafc" />
      <B p={[0, 1.2, 0.135]} s={[0.16, 0.44, 0.01]} c={GOLD} />
      <Ball p={[0, 1.66, 0]} r={0.17} c="#f8fafc" s={[1, 0.85, 1]} />
      <B p={[0, 1.22, 0]} s={[0.8, 1.64, 0.8]} c="#bfe6f5" o={0.2} />
      {[-0.4, 0.4].map((x) => [-0.4, 0.4].map((z) => <B key={`${x}${z}`} p={[x, 1.22, z]} s={[0.035, 1.64, 0.035]} c="#292524" />))}
      <B p={[0, 2.06, 0]} s={[0.84, 0.05, 0.84]} c="#292524" />
    </group>
  ),

  /* ---------- Museum ---------- */

  // One piece on a plinth, lit from the lid, under glass.
  museum_case: () => (
    <group>
      <B p={[0, 0.45, 0]} s={[0.72, 0.9, 0.72]} c="#3f3f46" />
      <B p={[0, 0.66, 0.365]} s={[0.4, 0.14, 0.01]} c="#e9d8a6" />
      <NokHead p={[0, 0.9, 0]} s={0.8} />
      <B p={[0, 1.3, 0]} s={[0.68, 0.8, 0.68]} c="#bfe6f5" o={0.2} />
      {[-0.34, 0.34].map((x) => [-0.34, 0.34].map((z) => <B key={`${x}${z}`} p={[x, 1.3, z]} s={[0.035, 0.8, 0.035]} c="#3f3f46" />))}
      <B p={[0, 1.72, 0]} s={[0.72, 0.05, 0.72]} c="#3f3f46" />
      <B p={[0, 1.69, 0]} s={[0.5, 0.02, 0.5]} c="#fde68a" e="#a16207" />
    </group>
  ),
  // Lit cabinet against the wall: pots, masks and small heads on two shelves.
  museum_wallcase: ({ text }) => (
    <group>
      <B p={[0, 1.15, -0.22]} s={[1.92, 2.3, 0.5]} c="#292524" />
      <B p={[0, 1.2, 0.035]} s={[1.72, 1.56, 0.02]} c="#fef3c7" e="#92400e" />
      {[0.5, 1.2].map((y, r) => (
        <group key={y}>
          <B p={[0, y, 0.14]} s={[1.72, 0.04, 0.24]} c="#44403c" />
          <Cyl p={[-0.62, y + 0.18, 0.14]} r={0.1} rt={0.15} h={0.32} c={r ? '#92400e' : TERRACOTTA} />
          <NokHead p={[-0.2, y + 0.02, 0.14]} s={0.55} c={r ? TERRACOTTA : '#a16207'} />
          <B p={[0.22, y + 0.24, 0.14]} s={[0.24, 0.42, 0.06]} c={r ? '#78350f' : '#57534e'} />
          <Cyl p={[0.62, y + 0.12, 0.14]} r={0.14} rt={0.08} h={0.2} c={r ? '#a16207' : '#78350f'} />
        </group>
      ))}
      <B p={[0, 1.2, 0.27]} s={[1.72, 1.56, 0.02]} c="#bfe6f5" o={0.16} />
      {text && <Label p={[0, 2.14, 0.035]} w={1.7} h={0.22} text={text} bg="#292524" fg="#e9d8a6" />}
    </group>
  ),
  // The star of the collection, bigger than a man's head, on a round plinth.
  museum_centerpiece: () => (
    <group>
      <Cyl p={[0, 0.3, 0]} r={0.82} h={0.6} c="#44403c" seg={18} />
      <Cyl p={[0, 0.62, 0]} r={0.86} h={0.05} c={GOLD} seg={18} />
      <Cyl p={[0, 0.82, 0]} r={0.3} h={0.4} c={TERRACOTTA} />
      <Ball p={[0, 1.5, 0]} r={0.5} c={TERRACOTTA} s={[0.9, 1.3, 0.9]} />
      {[[-0.22, 2.14], [0.22, 2.14], [0, 2.3]].map(([x, y], i) => <Ball key={i} p={[x, y, -0.05]} r={0.17} c="#9a3412" />)}
      {[-0.17, 0.17].map((x) => <B key={x} p={[x, 1.62, 0.42]} s={[0.15, 0.07, 0.04]} c="#1c1917" />)}
      <B p={[0, 1.4, 0.45]} s={[0.1, 0.2, 0.06]} c="#9a3412" />
      <B p={[0, 1.18, 0.4]} s={[0.2, 0.05, 0.04]} c="#1c1917" />
      {[-0.46, 0.46].map((x) => <B key={`e${x}`} p={[x, 1.5, 0]} s={[0.06, 0.3, 0.14]} c="#9a3412" />)}
      <B p={[0, 0.36, 0.83]} s={[0.5, 0.2, 0.01]} c="#e9d8a6" />
    </group>
  ),
  // What you are looking at, in a few lines. On the wall at the +z edge of its cell.
  museum_panel: () => (
    <group position={[0, 1.5, 0.42]} rotation-y={Math.PI}>
      <B p={[0, 0, 0]} s={[0.84, 1.2, 0.04]} c="#1c1917" />
      <B p={[0, 0.42, 0.025]} s={[0.7, 0.14, 0.01]} c="#e9d8a6" />
      <B p={[0, 0.1, 0.025]} s={[0.4, 0.4, 0.01]} c={TERRACOTTA} />
      {[-0.22, -0.32, -0.42].map((y, i) => <B key={y} p={[i === 2 ? -0.1 : 0, y, 0.025]} s={[i === 2 ? 0.5 : 0.7, 0.04, 0.01]} c="#a8a29e" />)}
    </group>
  ),
  museum_desk: () => (
    <group>
      <B p={[0, 0.5, 0]} s={[1.8, 1.0, 0.6]} c={DARK_WOOD} />
      <B p={[0, 1.03, 0]} s={[1.86, 0.06, 0.68]} c="#e7e5e4" />
      <Label p={[0, 0.6, 0.305]} w={1.2} h={0.3} text="TICKETS" bg="#e9d8a6" fg="#292524" />
      <B p={[-0.6, 1.2, -0.05]} s={[0.3, 0.28, 0.2]} c="#f8fafc" />
      {[0.4, 0.55, 0.7].map((x, i) => <B key={x} p={[x, 1.16, 0]} s={[0.1, 0.2, 0.16]} c={[TERRACOTTA, '#15803d', '#1d4ed8'][i]} />)}
    </group>
  ),

  /* ---------- Viewing centre ---------- */

  // The match, projected big; decoder and speakers on the table under it.
  viewing_screen: () => (
    <group>
      {[-1.82, 1.82].map((x) => <B key={x} p={[x, 1.3, -0.3]} s={[0.1, 2.6, 0.1]} c="#5a3418" />)}
      <B p={[0, 1.7, -0.3]} s={[3.6, 1.9, 0.08]} c="#0b0f14" />
      <B p={[0, 1.7, -0.25]} s={[3.4, 1.7, 0.02]} c="#22a34f" e="#15803d" />
      <B p={[0, 1.7, -0.235]} s={[0.04, 1.7, 0.01]} c="#f8fafc" />
      <Cyl p={[0, 1.7, -0.235]} r={0.32} h={0.01} c="#bbf7d0" seg={18} rot={[Math.PI / 2, 0, 0]} />
      {[-1.5, 1.5].map((x) => <B key={`g${x}`} p={[x, 1.7, -0.235]} s={[0.4, 0.8, 0.01]} c="#4ade80" />)}
      {[[-0.9, 1.9, '#dc2626'], [-0.4, 1.4, '#dc2626'], [0.5, 2.0, '#2563eb'], [0.9, 1.5, '#2563eb'], [-1.1, 1.3, '#2563eb'], [0.3, 1.25, '#dc2626']].map(([x, y, c], i) => (
        <B key={i} p={[x as number, y as number, -0.23]} s={[0.09, 0.14, 0.01]} c={c as string} e={c as string} />
      ))}
      <Label p={[-1.15, 2.4, -0.23]} w={0.9} h={0.2} text="LIVE  2 - 1" bg="#dc2626" glow={0.6} />
      <B p={[0, 0.3, -0.15]} s={[1.5, 0.6, 0.5]} c="#7c4a24" />
      <B p={[-0.3, 0.65, -0.15]} s={[0.5, 0.08, 0.3]} c="#111827" />
      <B p={[-0.14, 0.65, 0.005]} s={[0.05, 0.03, 0.01]} c="#22c55e" e="#22c55e" />
      {[-1.4, 1.4].map((x) => (
        <group key={`s${x}`}>
          <B p={[x, 0.45, -0.1]} s={[0.5, 0.9, 0.4]} c="#18181b" />
          <Cyl p={[x, 0.6, 0.105]} r={0.15} h={0.02} c="#3f3f46" rot={[Math.PI / 2, 0, 0]} />
          <Cyl p={[x, 0.25, 0.105]} r={0.09} h={0.02} c="#3f3f46" rot={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
    </group>
  ),
  // Today's games in chalk. On the wall at the +z edge of its cells.
  viewing_board: () => (
    <group position={[0, 1.6, 0.42]} rotation-y={Math.PI}>
      <B p={[0, 0, 0]} s={[1.84, 1.24, 0.05]} c="#5a3418" />
      <Table p={[0, 0, 0.03]} w={1.7} h={1.1} title="TODAY" rows={FIXTURES} accent="#e5e7eb" />
    </group>
  ),
  // Crates of minerals stacked by a basin of ice.
  viewing_crates: () => (
    <group>
      {['#dc2626', '#1d4ed8', '#dc2626'].map((c, i) => (
        <group key={i} position={[-0.15, i * 0.3, -0.1]}>
          <B p={[0, 0.14, 0]} s={[0.5, 0.26, 0.36]} c={c} />
          {[-0.15, 0, 0.15].map((x) => <Cyl key={x} p={[x, 0.3, 0]} r={0.035} h={0.08} c="#fef3c7" />)}
        </group>
      ))}
      <Cyl p={[0.22, 0.14, 0.22]} r={0.24} rt={0.28} h={0.28} c="#0ea5e9" />
      <Cyl p={[0.22, 0.29, 0.22]} r={0.25} h={0.02} c="#e0f2fe" />
      {[[0.14, 0.2], [0.3, 0.26], [0.22, 0.1]].map(([x, z], i) => <Cyl key={i} p={[x, 0.36, z]} r={0.035} h={0.16} c={['#7c2d12', '#f97316', '#16a34a'][i]} />)}
    </group>
  ),
  // Vuvuzelas, a drum and the club flag.
  viewing_fans: () => (
    <group>
      <Cyl p={[-0.15, 0.25, 0.1]} r={0.22} h={0.5} c="#7c2d12" />
      <Cyl p={[-0.15, 0.51, 0.1]} r={0.22} h={0.02} c="#fef3c7" />
      {[['#dc2626', 0.2, 0.15], ['#facc15', 0.3, -0.05], ['#16a34a', 0.12, -0.2]].map(([c, x, z], i) => (
        <group key={i} position={[x as number, 0, z as number]} rotation={[0.12 * (i - 1), 0, -0.1]}>
          <Cyl p={[0, 0.45, 0]} r={0.09} rt={0.02} h={0.9} c={c as string} seg={8} />
        </group>
      ))}
      <Cyl p={[-0.35, 0.9, -0.3]} r={0.02} h={1.8} c="#57534e" />
      <B p={[-0.07, 1.55, -0.3]} s={[0.56, 0.38, 0.02]} c="#dc2626" />
      <B p={[-0.07, 1.55, -0.288]} s={[0.56, 0.1, 0.01]} c="#f8fafc" />
    </group>
  ),

  /* ---------- Boutique ---------- */

  // Agbada on a mannequin; `text` is its colour.
  boutique_mannequin: ({ text }) => {
    const c = text ?? '#1e3a8a';
    const trim = c === '#f8fafc' ? '#94a3b8' : '#facc15';
    return (
      <group>
        <Cyl p={[0, 0.06, 0]} r={0.36} h={0.12} c="#111827" seg={16} />
        <Cyl p={[0, 0.13, 0]} r={0.38} h={0.02} c={GOLD} seg={16} />
        <B p={[0, 0.5, 0]} s={[0.3, 0.74, 0.2]} c={c} />
        <B p={[0, 1.2, 0]} s={[0.92, 0.84, 0.26]} c={c} />
        <B p={[0, 0.82, 0]} s={[0.7, 0.14, 0.24]} c={c} />
        <B p={[0, 1.36, 0.135]} s={[0.2, 0.42, 0.01]} c={trim} />
        <B p={[0, 1.6, 0.135]} s={[0.36, 0.05, 0.01]} c={trim} />
        <Cyl p={[0, 1.68, 0]} r={0.06} h={0.12} c="#d6d3d1" />
        <Ball p={[0, 1.84, 0]} r={0.13} c="#d6d3d1" />
        <Cyl p={[0, 1.99, 0]} r={0.135} rt={0.12} h={0.12} c={c} />
      </group>
    );
  },
  // Two cubicles behind heavy curtains, one drawn back.
  boutique_fitting: () => (
    <group>
      <B p={[0, 1.15, -0.42]} s={[1.9, 2.3, 0.08]} c="#f5e6f7" />
      {[-0.93, 0, 0.93].map((x) => <B key={x} p={[x, 1.15, -0.02]} s={[0.06, 2.3, 0.8]} c="#e9d5ff" />)}
      <B p={[0.47, 1.2, -0.37]} s={[0.56, 1.5, 0.02]} c="#dbeafe" />
      <Cyl p={[0, 2.12, 0.36]} r={0.02} h={1.9} c={GOLD} rot={[0, 0, Math.PI / 2]} />
      <B p={[-0.47, 1.1, 0.36]} s={[0.84, 2.0, 0.05]} c="#9d174d" />
      {[-0.7, -0.47, -0.24].map((x) => <B key={`f${x}`} p={[x, 1.1, 0.39]} s={[0.04, 2.0, 0.02]} c="#831843" />)}
      <B p={[0.8, 1.1, 0.36]} s={[0.2, 2.0, 0.08]} c="#9d174d" />
      <B p={[0.47, 0.22, 0.05]} s={[0.4, 0.44, 0.4]} c="#fbcfe8" />
      <B p={[0, 2.42, 0.34]} s={[1.92, 0.3, 0.08]} c="#111827" />
      <Label p={[0, 2.42, 0.385]} w={1.8} h={0.22} text="FITTING ROOM" bg="#111827" fg="#fde68a" />
    </group>
  ),
  boutique_mirror: () => (
    <group>
      <B p={[0, 0.05, -0.15]} s={[0.8, 0.1, 0.4]} c={GOLD} />
      <group position={[0, 0.1, -0.2]} rotation={[-0.08, 0, 0]}>
        <B p={[0, 1.05, 0]} s={[0.86, 2.1, 0.08]} c="#d4a017" />
        <B p={[0, 1.05, 0.045]} s={[0.68, 1.9, 0.01]} c="#dbeafe" e="#1e3a5f" />
        <B p={[-0.12, 1.3, 0.052]} s={[0.05, 1.0, 0.005]} c="#f8fafc" />
        <Ball p={[0, 2.16, 0]} r={0.12} c="#d4a017" />
      </group>
    </group>
  ),
  // Gold under glass, and the till where the price gets argued.
  boutique_counter: () => (
    <group>
      <B p={[0, 0.36, 0]} s={[1.84, 0.72, 0.62]} c="#1c1917" />
      <B p={[0, 0.2, 0.315]} s={[1.84, 0.05, 0.01]} c={GOLD} />
      <B p={[0, 0.75, 0]} s={[1.7, 0.06, 0.5]} c="#7f1d1d" />
      {[-0.65, -0.4, -0.15, 0.1, 0.35].map((x, i) =>
        i % 2 ? (
          <Cyl key={x} p={[x, 0.8, 0.02]} r={0.06} h={0.03} c="#facc15" e="#a16207" />
        ) : (
          <B key={x} p={[x, 0.81, 0]} s={[0.12, 0.05, 0.12]} c="#facc15" e="#a16207" />
        ),
      )}
      <B p={[0, 0.93, 0]} s={[1.84, 0.4, 0.62]} c="#bfe6f5" o={0.22} />
      <B p={[0, 1.14, 0]} s={[1.88, 0.03, 0.66]} c={GOLD} />
      <B p={[0.62, 1.26, -0.05]} s={[0.36, 0.2, 0.34]} c="#111827" />
      <B p={[0.62, 1.42, -0.12]} s={[0.3, 0.16, 0.04]} c="#38bdf8" e="#0284c7" />
      <B p={[-0.55, 1.28, 0]} s={[0.22, 0.26, 0.12]} c="#fdf4ff" />
      <B p={[-0.3, 1.25, 0.05]} s={[0.18, 0.2, 0.1]} c="#111827" />
    </group>
  ),
  boutique_shelf: () => (
    <group>
      <B p={[0, 1.1, -0.28]} s={[1.92, 2.2, 0.36]} c="#fafaf9" />
      {[0.35, 0.95, 1.55].map((y, r) => (
        <group key={y}>
          <B p={[0, y, -0.02]} s={[1.84, 0.04, 0.36]} c={GOLD} />
          {[-0.68, -0.23, 0.23, 0.68].map((x, i) =>
            (i + r) % 2 ? (
              <group key={x}>
                <B p={[x, y + 0.17, 0]} s={[0.3, 0.26, 0.14]} c={['#7f1d1d', '#111827', '#a16207', '#be185d'][(i + r) % 4]} />
                <B p={[x, y + 0.34, 0]} s={[0.16, 0.08, 0.03]} c={GOLD} />
              </group>
            ) : (
              <group key={x}>
                <B p={[x - 0.08, y + 0.08, 0]} s={[0.1, 0.1, 0.28]} c={['#111827', '#7c2d12', '#f8fafc', '#1e3a8a'][(i + r * 2) % 4]} />
                <B p={[x + 0.08, y + 0.08, 0]} s={[0.1, 0.1, 0.28]} c={['#111827', '#7c2d12', '#f8fafc', '#1e3a8a'][(i + r * 2) % 4]} />
              </group>
            ),
          )}
        </group>
      ))}
    </group>
  ),

  /* ---------- Mall ---------- */

  // A shop behind glass with its name over the door; `text` says what it sells.
  mall_shopfront: ({ text = 'SHOP' }) => {
    const phones = /PHONE/.test(text);
    return (
      <group>
        <B p={[0, 1.05, -0.36]} s={[2.9, 2.1, 0.1]} c="#fef3c7" e="#5c3a0a" />
        {[-1.42, 1.42].map((x) => <B key={x} p={[x, 1.2, 0]} s={[0.12, 2.4, 0.8]} c="#e2e8f0" />)}
        <B p={[0, 2.3, 0.05]} s={[2.96, 0.46, 0.8]} c="#111827" />
        <Label p={[0, 2.3, 0.455]} w={2.5} h={0.34} text={text} bg="#111827" fg={phones ? '#7dd3fc' : '#f9a8d4'} glow={0.6} />
        {/* Window on the left, the way in on the right */}
        <B p={[-0.42, 1.05, 0.34]} s={[1.86, 2.0, 0.03]} c="#bfe6f5" o={0.2} />
        <B p={[0.53, 1.05, 0.34]} s={[0.05, 2.1, 0.06]} c={STEEL} />
        <B p={[0.95, 0.012, 0.3]} s={[0.76, 0.02, 0.5]} c="#334155" />
        <B p={[-0.42, 0.4, -0.02]} s={[1.7, 0.8, 0.5]} c="#f8fafc" />
        {phones
          ? [-1.0, -0.7, -0.4, -0.1, 0.2].map((x, i) => (
              <group key={x} position={[x, 0.96, 0]} rotation={[-0.3, 0, 0]}>
                <B p={[0, 0, 0]} s={[0.16, 0.3, 0.03]} c="#0f172a" />
                <B p={[0, 0, 0.018]} s={[0.13, 0.26, 0.005]} c={['#38bdf8', '#a78bfa', '#4ade80', '#f472b6', '#facc15'][i]} e={['#0284c7', '#7c3aed', '#16a34a', '#db2777', '#ca8a04'][i]} />
              </group>
            ))
          : [-0.95, -0.42, 0.1].map((x, i) => (
              <group key={x}>
                <Cyl p={[x, 1.0, 0]} r={0.025} h={0.4} c={CHROME} />
                <B p={[x, 1.42, 0]} s={[0.4, 0.6, 0.2]} c={['#be185d', '#1e3a8a', '#ca8a04'][i]} />
                <Ball p={[x, 1.84, 0]} r={0.1} c="#d6d3d1" />
              </group>
            ))}
      </group>
    );
  },
  // Two flights side by side, climbing to the landing on the right.
  mall_escalator: () => (
    <group>
      <group position={[-0.35, 1.02, 0]} rotation={[0, 0, 0.6]}>
        <B p={[0, 0, 0]} s={[3.9, 0.5, 1.76]} c="#64748b" />
        {[-0.44, 0.44].map((z) => <B key={z} p={[0, 0.27, z]} s={[3.9, 0.04, 0.62]} c="#1f2937" />)}
        {[-1.6, -1.1, -0.6, -0.1, 0.4, 0.9, 1.4].map((x) => <B key={x} p={[x, 0.295, 0]} s={[0.04, 0.01, 1.5]} c="#facc15" />)}
        {[-0.86, 0, 0.86].map((z) => (
          <group key={`r${z}`}>
            <B p={[0, 0.55, z]} s={[3.9, 0.56, 0.03]} c="#bfe6f5" o={0.3} />
            <B p={[0, 0.86, z]} s={[3.96, 0.07, 0.08]} c="#0f172a" />
          </group>
        ))}
      </group>
      <B p={[-1.9, 0.02, 0]} s={[0.36, 0.04, 1.7]} c={CHROME} />
      <B p={[1.66, 2.16, 0]} s={[0.7, 0.14, 1.9]} c={STEEL} />
      <B p={[1.72, 1.04, 0]} s={[0.34, 2.1, 1.5]} c="#cbd5e1" />
      <B p={[1.98, 2.6, 0]} s={[0.05, 0.8, 1.9]} c="#bfe6f5" o={0.3} />
      <B p={[1.98, 3.02, 0]} s={[0.08, 0.06, 1.94]} c="#0f172a" />
      <Label p={[1.72, 1.5, 0.755]} w={0.3} h={0.3} text="↑" bg="#15803d" />
    </group>
  ),
  // Testers out on a lit white counter.
  mall_perfume: () => (
    <group>
      <B p={[0, 0.5, 0]} s={[1.84, 1.0, 0.6]} c="#f8fafc" />
      <B p={[0, 1.02, 0]} s={[1.9, 0.05, 0.66]} c="#fde68a" e="#a16207" />
      <Label p={[0, 0.55, 0.305]} w={1.3} h={0.26} text="PERFUMES" bg="#111827" fg="#fde68a" />
      {[-0.7, -0.42, -0.14, 0.14, 0.42, 0.7].map((x, i) => (
        <group key={x}>
          <B p={[x, 1.15, i % 2 ? 0.1 : -0.08]} s={[0.14, 0.2, 0.1]} c={['#be185d', '#0ea5e9', '#f59e0b', '#7c3aed', '#16a34a', '#e11d48'][i]} />
          <B p={[x, 1.28, i % 2 ? 0.1 : -0.08]} s={[0.05, 0.07, 0.05]} c={GOLD} />
        </group>
      ))}
    </group>
  ),
  mall_popcorn: () => (
    <group>
      <B p={[0, 0.5, 0]} s={[0.8, 1.0, 0.6]} c="#dc2626" />
      {[-0.26, 0, 0.26].map((x) => <B key={x} p={[x, 0.5, 0.305]} s={[0.1, 1.0, 0.01]} c="#f8fafc" />)}
      <Ball p={[0, 1.12, 0]} r={0.3} c="#fde047" s={[1.1, 0.6, 0.8]} />
      <B p={[0, 1.3, 0]} s={[0.78, 0.6, 0.58]} c="#bfe6f5" o={0.25} />
      <B p={[0, 1.66, 0]} s={[0.9, 0.12, 0.7]} c="#dc2626" />
      <Label p={[0, 1.66, 0.355]} w={0.84} h={0.1} text="POPCORN" bg="#facc15" fg="#7f1d1d" />
      {[-0.3, 0.3].map((x) => <Cyl key={x} p={[x, 0.1, 0.32]} r={0.1} h={0.05} c="#1f2937" rot={[Math.PI / 2, 0, 0]} />)}
    </group>
  ),
};
