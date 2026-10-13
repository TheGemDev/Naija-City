// Props that make a place look like what it is: signs you can read, counters, queues, and the kit of each
// kind of building. The ones any place can use and the airport's are here; the rest are in three/props/.

import { B, BAGS, Barrier, Ball, CHROME, Cyl, Label, STEEL, Suitcase, Table, TwoSided, type Model } from './propKit';
import { CIVIC_PROPS } from './props/civic';
import { CULTURE_PROPS } from './props/culture';
import { TRADE_PROPS } from './props/trade';
import { OUTDOOR_PROPS } from './props/outdoor';

const FLIGHTS = [
  ['W3 204', 'LAGOS', '08:15', 'BOARDING'],
  ['SW 118', 'KANO', '08:40', 'ON TIME'],
  ['GE 731', 'PORT HARCOURT', '09:05', 'ON TIME'],
  ['W3 512', 'MAIDUGURI', '09:30', 'DELAYED'],
  ['SW 046', 'SOKOTO', '10:10', 'ON TIME'],
  ['GE 290', 'ENUGU', '10:45', 'ON TIME'],
];

const RATES = [['USD', '1,520'], ['GBP', '1,940'], ['EUR', '1,650']];

const SHARED: Record<string, Model> = {
  /* ---------- Signs and dividers ---------- */

  // Hung on the wall at the +z edge of its cells, like wall_art: rot 2 on the back wall, 1 on the left.
  wall_sign: ({ text = '' }) => (
    <group position={[0, 2.12, 0.42]}>
      <B p={[0, 0, 0]} s={[1.9, 0.46, 0.05]} c="#14532d" />
      <Label p={[0, 0, -0.03]} w={1.8} h={0.38} text={text} bg="#14532d" ry={Math.PI} />
    </group>
  ),
  // Overhead sign across an aisle: you walk under it.
  gantry_sign: ({ text = '' }) => (
    <group>
      {[-1.9, 1.9].map((x) => <B key={x} p={[x, 1.45, 0]} s={[0.09, 2.9, 0.09]} c={STEEL} />)}
      <TwoSided p={[0, 2.62, 0]} w={3.7} h={0.52} text={text} bg="#0f172a" />
    </group>
  ),
  post_sign: ({ text = '' }) => (
    <group>
      <Cyl p={[0, 0.03, 0]} r={0.22} h={0.06} c="#475569" />
      <Cyl p={[0, 0.9, 0]} r={0.035} h={1.8} c={STEEL} />
      <TwoSided p={[0, 1.95, 0]} w={0.9} h={0.42} text={text} bg="#14532d" t={0.06} />
    </group>
  ),
  glass_partition: () => (
    <group>
      <B p={[0, 0.07, 0]} s={[2, 0.14, 0.1]} c={CHROME} />
      {[-0.98, 0, 0.98].map((x) => <B key={x} p={[x, 0.8, 0]} s={[0.05, 1.6, 0.07]} c={STEEL} />)}
      <B p={[0, 0.85, 0]} s={[1.94, 1.4, 0.03]} c="#bfe6f5" o={0.28} />
      <B p={[0, 1.58, 0]} s={[2, 0.05, 0.07]} c={STEEL} />
      <B p={[0, 1.05, 0.02]} s={[1.9, 0.07, 0.01]} c="#15803d" />
    </group>
  ),
  queue_rope: () => <Barrier w={2.8} n={4} post={CHROME} line="#1d4ed8" />,
  velvet_rope: () => <Barrier w={1.8} n={3} post="#d4a017" line="#9f1239" />,
  planter: () => (
    <group>
      <B p={[0, 0.3, 0]} s={[1.9, 0.6, 0.5]} c="#e7e5e4" />
      <B p={[0, 0.6, 0]} s={[1.8, 0.04, 0.4]} c="#5a3418" />
      {[-0.6, 0, 0.6].map((x, i) => <Ball key={x} p={[x, 0.82, 0]} r={0.3} c={['#15803d', '#16a34a', '#166534'][i]} s={[1, 0.9, 0.8]} />)}
    </group>
  ),
  atm: () => (
    <group>
      <B p={[0, 0.95, -0.1]} s={[0.72, 1.9, 0.6]} c="#1e3a8a" />
      <B p={[0, 1.3, 0.21]} s={[0.44, 0.34, 0.02]} c="#7dd3fc" e="#0ea5e9" />
      <B p={[0, 0.98, 0.26]} s={[0.4, 0.05, 0.14]} c="#cbd5e1" />
      <B p={[0, 0.78, 0.21]} s={[0.3, 0.04, 0.02]} c="#0f172a" />
      <Label p={[0, 1.7, 0.205]} w={0.6} h={0.2} text="ATM" bg="#facc15" fg="#111827" />
    </group>
  ),

  // On a stand indoors: green, white, green.
  flag_stand: () => (
    <group>
      <Cyl p={[0, 0.04, 0]} r={0.2} h={0.08} c="#a16207" />
      <Cyl p={[0, 1.1, 0]} r={0.025} h={2.2} c="#a16207" />
      <Cyl p={[0, 2.24, 0]} r={0.05} h={0.08} c="#facc15" />
      {['#15803d', '#f8fafc', '#15803d'].map((c, i) => <B key={i} p={[0.14 + i * 0.2, 1.75, 0]} s={[0.2, 0.75, 0.03]} c={c} />)}
    </group>
  ),
  // These hang on the wall at the +z edge of their cells, like wall_art (rot 2 on the back wall, 1 on the left).
  wall_portrait: () => (
    <group position={[0, 1.75, 0.42]}>
      <B p={[0, 0, 0]} s={[0.62, 0.8, 0.05]} c="#a16207" />
      <B p={[0, 0, -0.03]} s={[0.5, 0.68, 0.01]} c="#e7e5e4" />
      <B p={[0, -0.16, -0.036]} s={[0.36, 0.34, 0.01]} c="#14532d" />
      <B p={[0, 0.1, -0.038]} s={[0.2, 0.22, 0.01]} c="#7c4a24" />
      <B p={[0, 0.24, -0.04]} s={[0.22, 0.08, 0.01]} c="#f8fafc" />
    </group>
  ),
  notice_board: () => (
    <group position={[0, 1.6, 0.42]}>
      <B p={[0, 0, 0]} s={[1.7, 1.0, 0.05]} c="#7c4a24" />
      <B p={[0, 0, -0.03]} s={[1.56, 0.86, 0.01]} c="#b98d5f" />
      {[[-0.5, 0.15, '#f8fafc'], [-0.05, 0.2, '#fef3c7'], [0.45, 0.1, '#bfdbfe'], [-0.3, -0.22, '#fecaca'], [0.25, -0.2, '#f8fafc']].map(([x, y, c], i) => (
        <B key={i} p={[x as number, y as number, -0.04]} s={[0.36, 0.3, 0.01]} c={c as string} />
      ))}
    </group>
  ),
  wall_clock: () => (
    <group position={[0, 2.1, 0.44]}>
      <Cyl p={[0, 0, 0]} r={0.24} h={0.05} c="#1f2937" seg={16} rot={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 0, -0.03]} r={0.2} h={0.01} c="#f8fafc" seg={16} rot={[Math.PI / 2, 0, 0]} />
      <B p={[0, 0.06, -0.04]} s={[0.02, 0.14, 0.01]} c="#111827" />
      <B p={[0.05, 0, -0.04]} s={[0.1, 0.02, 0.01]} c="#111827" />
    </group>
  ),
  // Glass louvre blades behind burglar bars: the window of every office, classroom and clinic.
  louvre_window: () => (
    <group position={[0, 1.55, 0.41]}>
      <B p={[0, 0, 0]} s={[1.6, 1.2, 0.05]} c="#5a3418" />
      <B p={[0, 0, -0.03]} s={[1.44, 1.04, 0.02]} c="#7dd3fc" e="#38bdf8" />
      {[-0.4, -0.2, 0, 0.2, 0.4].map((y) => <B key={y} p={[0, y, -0.05]} s={[1.44, 0.03, 0.03]} c="#e0f2fe" />)}
      {[-0.48, 0, 0.48].map((x) => <B key={x} p={[x, 0, -0.07]} s={[0.03, 1.04, 0.02]} c="#44403c" />)}
    </group>
  ),

  /* ---------- Airport ---------- */

  // Desk at the front with the bag scale beside it; the belt that carries bags away runs along the back.
  checkin_desk: ({ text = 'CHECK-IN' }) => {
    const bag = BAGS[text.length % BAGS.length];
    return (
      <group>
        <B p={[-0.2, 0.52, 0.55]} s={[1.3, 1.04, 0.6]} c="#f8fafc" />
        <B p={[-0.2, 0.6, 0.86]} s={[1.3, 0.22, 0.02]} c="#15803d" />
        <B p={[-0.2, 1.06, 0.55]} s={[1.36, 0.05, 0.68]} c="#e2e8f0" />
        <B p={[-0.45, 1.27, 0.42]} s={[0.42, 0.3, 0.04]} c="#0f172a" />
        <B p={[-0.45, 1.1, 0.42]} s={[0.08, 0.06, 0.08]} c="#334155" />
        <B p={[0.1, 1.11, 0.62]} s={[0.3, 0.03, 0.2]} c="#fef3c7" />
        {/* Scale and feed belt */}
        <B p={[0.72, 0.18, 0.3]} s={[0.5, 0.36, 1.3]} c="#64748b" />
        <B p={[0.72, 0.37, 0.3]} s={[0.42, 0.02, 1.3]} c="#111827" />
        <Suitcase p={[0.72, 0.38, 0.5]} c={bag} ry={Math.PI / 2} />
        {/* Collector belt */}
        <B p={[0, 0.25, -0.62]} s={[2, 0.5, 0.62]} c="#64748b" />
        <B p={[0, 0.51, -0.62]} s={[2, 0.02, 0.5]} c="#111827" />
        <B p={[-0.55, 0.66, -0.62]} s={[0.5, 0.28, 0.34]} c={BAGS[(text.length + 3) % BAGS.length]} />
        {/* Airline board */}
        {[-0.96, 0.96].map((x) => <B key={x} p={[x, 1.2, -0.28]} s={[0.06, 2.4, 0.06]} c={STEEL} />)}
        <B p={[0, 2.14, -0.28]} s={[2, 0.5, 0.08]} c="#0f172a" />
        <Label p={[0, 2.14, -0.235]} w={1.9} h={0.42} text={text} bg="#15803d" />
      </group>
    );
  },
  kiosk: () => (
    <group>
      <B p={[0, 0.03, 0]} s={[0.5, 0.06, 0.45]} c="#475569" />
      <B p={[0, 0.55, -0.05]} s={[0.4, 1.0, 0.22]} c="#e2e8f0" />
      <group position={[0, 1.2, 0.02]} rotation={[-0.4, 0, 0]}>
        <B p={[0, 0, 0]} s={[0.5, 0.42, 0.06]} c="#0f172a" />
        <B p={[0, 0, 0.035]} s={[0.42, 0.34, 0.01]} c="#38bdf8" e="#0284c7" />
      </group>
      <B p={[0, 0.8, 0.07]} s={[0.26, 0.05, 0.03]} c="#15803d" />
    </group>
  ),
  // On the wall at the +z edge of its cells (rot 1 on the left wall).
  fids_board: () => (
    <group position={[0, 0, 0.4]}>
      <B p={[0, 1.75, 0]} s={[2.9, 1.5, 0.1]} c="#0b1220" />
      <Table p={[0, 1.75, -0.055]} w={2.76} h={1.36} title="✈ DEPARTURES" rows={FLIGHTS} ry={Math.PI} />
      {[-1.2, 1.2].map((x) => <B key={x} p={[x, 2.6, 0.02]} s={[0.06, 0.2, 0.06]} c={STEEL} />)}
    </group>
  ),
  // Bags ride the belt through the scanner (the belt runs front to back).
  xray: () => (
    <group>
      <B p={[0, 0.36, 0]} s={[0.74, 0.72, 2.84]} c={CHROME} />
      <B p={[0, 0.73, 0]} s={[0.6, 0.02, 2.84]} c="#111827" />
      <B p={[0, 1.08, 0]} s={[0.9, 0.72, 1.1]} c="#475569" />
      <B p={[0, 1.46, 0]} s={[0.94, 0.05, 1.14]} c="#334155" />
      {[-0.56, 0.56].map((z) => <B key={z} p={[0, 0.96, z]} s={[0.6, 0.44, 0.02]} c="#1f2937" />)}
      <B p={[0.46, 1.2, 0]} s={[0.02, 0.26, 0.5]} c="#22c55e" e="#16a34a" />
      {/* Trays going in and coming out */}
      <B p={[0, 0.78, 1.02]} s={[0.5, 0.08, 0.6]} c="#9ca3af" />
      <B p={[0, 0.9, 1.02]} s={[0.3, 0.18, 0.4]} c="#7c2d12" />
      <B p={[0, 0.78, -1.02]} s={[0.5, 0.08, 0.6]} c="#9ca3af" />
      <B p={[0.05, 0.88, -1.02]} s={[0.26, 0.12, 0.34]} c="#1d4ed8" />
      {/* Operator's screen */}
      <B p={[-0.3, 1.7, 0]} s={[0.05, 0.36, 0.5]} c="#0f172a" />
      <B p={[-0.33, 1.7, 0]} s={[0.01, 0.3, 0.44]} c="#fb923c" e="#c2410c" />
    </group>
  ),
  metal_detector: () => (
    <group>
      <B p={[0, 0.012, 0]} s={[0.78, 0.02, 0.95]} c="#374151" />
      {[-0.44, 0.44].map((x) => <B key={x} p={[x, 1.08, 0]} s={[0.12, 2.16, 0.5]} c={CHROME} />)}
      <B p={[0, 2.22, 0]} s={[1.0, 0.14, 0.5]} c={STEEL} />
      <B p={[0, 2.22, 0.255]} s={[0.36, 0.07, 0.01]} c="#22c55e" e="#22c55e" />
      {[-0.44, 0.44].map((x) => <B key={`l${x}`} p={[x, 1.5, 0.255]} s={[0.04, 0.5, 0.01]} c="#38bdf8" e="#0ea5e9" />)}
    </group>
  ),
  security_desk: () => (
    <group>
      <B p={[0, 0.55, 0]} s={[0.8, 1.1, 0.5]} c="#1e3a8a" />
      <B p={[0, 1.12, 0]} s={[0.86, 0.05, 0.56]} c="#e2e8f0" />
      <Label p={[0, 0.72, 0.255]} w={0.7} h={0.22} text="SECURITY" bg="#facc15" fg="#111827" />
      <B p={[0.2, 1.2, 0]} s={[0.24, 0.1, 0.3]} c="#9ca3af" />
    </group>
  ),
  // Three linked seats on a beam, the way every departure hall has them.
  gate_seat: () => (
    <group>
      <B p={[0, 0.28, -0.02]} s={[2.84, 0.07, 0.1]} c={STEEL} />
      {[-1.15, 1.15].map((x) => (
        <group key={x}>
          <B p={[x, 0.14, -0.02]} s={[0.07, 0.28, 0.07]} c={STEEL} />
          <B p={[x, 0.02, -0.02]} s={[0.1, 0.04, 0.6]} c={STEEL} />
        </group>
      ))}
      {[-1, 0, 1].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <B p={[0, 0.4, 0.02]} s={[0.6, 0.09, 0.52]} c="#1e40af" />
          <group position={[0, 0.44, -0.24]} rotation={[-0.14, 0, 0]}>
            <B p={[0, 0.28, 0]} s={[0.6, 0.56, 0.07]} c="#1e40af" />
          </group>
        </group>
      ))}
      {[-1.48, -0.5, 0.5, 1.48].map((x) => <B key={x} p={[x, 0.58, 0.02]} s={[0.05, 0.05, 0.44]} c={CHROME} />)}
    </group>
  ),
  gate_desk: () => (
    <group>
      <B p={[0, 0.55, 0]} s={[1.6, 1.1, 0.5]} c="#f8fafc" />
      <B p={[0, 0.7, 0.255]} s={[1.6, 0.2, 0.01]} c="#15803d" />
      <B p={[0, 1.12, 0]} s={[1.66, 0.05, 0.58]} c="#e2e8f0" />
      <B p={[-0.4, 1.32, -0.08]} s={[0.4, 0.28, 0.04]} c="#0f172a" />
      <B p={[0.45, 1.2, 0]} s={[0.16, 0.12, 0.2]} c="#334155" />
      <B p={[0.45, 1.27, 0.06]} s={[0.1, 0.02, 0.06]} c="#ef4444" e="#ef4444" />
    </group>
  ),
  // The way out to the aircraft, set in the back wall: mat, open sliding doors and the gate number over them.
  gate_door: ({ text = 'A1' }) => (
    <group>
      <B p={[0, 0.012, 0]} s={[1.7, 0.02, 0.92]} c="#15803d" />
      {[-0.5, 0, 0.5].map((x) => <B key={x} p={[x, 0.024, 0]} s={[0.12, 0.012, 0.6]} c="#f8fafc" />)}
      <group position={[0, 0, -0.5]}>
        {[-0.9, 0.9].map((x) => <B key={x} p={[x, 1.15, 0]} s={[0.12, 2.3, 0.24]} c="#334155" />)}
        <B p={[0, 2.36, 0]} s={[1.92, 0.14, 0.24]} c="#334155" />
        {[-0.66, 0.66].map((x) => <B key={`d${x}`} p={[x, 1.14, 0.02]} s={[0.36, 2.2, 0.04]} c="#bfe6f5" o={0.4} />)}
        <B p={[0, 2.74, 0.06]} s={[1.3, 0.6, 0.1]} c="#111827" />
        <Label p={[0, 2.74, 0.115]} w={1.2} h={0.5} text={text} bg="#facc15" fg="#111827" glow={0.5} />
      </group>
      {/* Boarding-pass reader */}
      <B p={[1.02, 0.5, -0.2]} s={[0.12, 1.0, 0.12]} c={STEEL} />
      <B p={[1.02, 1.04, -0.2]} s={[0.2, 0.1, 0.2]} c="#0f172a" />
      <B p={[1.02, 1.095, -0.2]} s={[0.12, 0.01, 0.12]} c="#22c55e" e="#22c55e" />
    </group>
  ),
  // Coin-in-the-slot binoculars at the window.
  viewer: () => (
    <group>
      <Cyl p={[0, 0.03, 0]} r={0.2} h={0.06} c="#475569" />
      <Cyl p={[0, 0.6, 0]} r={0.05} h={1.2} c={STEEL} />
      <group position={[0, 1.3, 0]} rotation={[0.15, 0, 0]}>
        <B p={[0, 0, 0]} s={[0.34, 0.22, 0.3]} c="#1d4ed8" />
        {[-0.09, 0.09].map((x) => <Cyl key={x} p={[x, 0, -0.22]} r={0.07} h={0.18} c="#0f172a" rot={[Math.PI / 2, 0, 0]} />)}
        {[-0.09, 0.09].map((x) => <Cyl key={`e${x}`} p={[x, 0, 0.19]} r={0.045} h={0.1} c="#0f172a" rot={[Math.PI / 2, 0, 0]} />)}
      </group>
    </group>
  ),
  // Hi-vis vests, ear defenders and the orange batons for waving a jet onto its stand.
  crew_station: () => (
    <group>
      <B p={[0, 0.95, -0.15]} s={[0.84, 1.9, 0.5]} c="#475569" />
      <B p={[0, 1.2, 0.11]} s={[0.7, 1.2, 0.02]} c="#1f2937" />
      {[-0.2, 0.2].map((x) => (
        <group key={x}>
          <B p={[x, 1.25, 0.14]} s={[0.3, 0.6, 0.05]} c="#facc15" />
          <B p={[x, 1.2, 0.17]} s={[0.3, 0.07, 0.01]} c="#e5e7eb" />
          <B p={[x, 1.36, 0.17]} s={[0.3, 0.07, 0.01]} c="#e5e7eb" />
        </group>
      ))}
      {[-0.12, 0.12].map((x) => <Cyl key={x} p={[x, 0.6, 0.16]} r={0.035} h={0.4} c="#f97316" e="#c2410c" />)}
      <B p={[0, 1.78, 0.11]} s={[0.5, 0.1, 0.02]} c="#f97316" />
    </group>
  ),
  // The belt goes round; bags ride it until somebody claims them.
  carousel: () => (
    <group>
      <B p={[0, 0.25, 0]} s={[3.2, 0.5, 1.7]} c={STEEL} />
      {[-1.6, 1.6].map((x) => <Cyl key={x} p={[x, 0.25, 0]} r={0.85} h={0.5} c={STEEL} seg={18} />)}
      <B p={[0, 0.51, 0]} s={[3.2, 0.02, 1.6]} c="#1f2937" />
      {[-1.6, 1.6].map((x) => <Cyl key={`b${x}`} p={[x, 0.51, 0]} r={0.8} h={0.02} c="#1f2937" seg={18} />)}
      <B p={[0, 0.62, 0]} s={[3.2, 0.24, 0.6]} c={CHROME} />
      {[-1.6, 1.6].map((x) => <Cyl key={`i${x}`} p={[x, 0.62, 0]} r={0.3} h={0.24} c={CHROME} seg={14} />)}
      {[[-1.5, 0.55], [-0.5, 0.55], [0.7, 0.55], [1.9, 0.3], [1.2, -0.55], [0, -0.55], [-1.2, -0.55], [-2.1, -0.1]].map(([x, z], i) => (
        <B key={i} p={[x, 0.68, z]} s={i % 3 === 1 ? [0.34, 0.3, 0.56] : [0.6, 0.26, 0.38]} c={BAGS[i % BAGS.length]} />
      ))}
      <B p={[0, 1.4, 0]} s={[0.08, 1.4, 0.08]} c={STEEL} />
      <TwoSided p={[0, 2.25, 0]} w={2.0} h={0.42} text="BAGGAGE CLAIM" bg="#0f172a" />
    </group>
  ),
  trolley: () => (
    <group>
      <B p={[0, 0.2, 0.05]} s={[0.52, 0.04, 0.8]} c={CHROME} />
      {[-0.24, 0.24].map((x) => <B key={x} p={[x, 0.55, -0.34]} s={[0.04, 0.72, 0.04]} c={CHROME} />)}
      <B p={[0, 0.92, -0.36]} s={[0.56, 0.05, 0.05]} c="#facc15" />
      <B p={[0, 0.5, -0.33]} s={[0.5, 0.3, 0.02]} c="#15803d" />
      {[[-0.22, 0.38], [0.22, 0.38], [0, -0.3]].map(([x, z], i) => <Cyl key={i} p={[x, 0.08, z]} r={0.08} h={0.05} c="#1f2937" rot={[0, 0, Math.PI / 2]} />)}
      <B p={[0, 0.4, 0.08]} s={[0.44, 0.36, 0.62]} c="#7c2d12" />
      <B p={[0, 0.7, 0.05]} s={[0.38, 0.22, 0.5]} c="#1d4ed8" />
    </group>
  ),
  // Lit shelves of perfume and bottles.
  dutyfree: () => (
    <group>
      <B p={[0, 1.1, -0.22]} s={[1.92, 2.2, 0.5]} c="#1c1917" />
      <B p={[0, 1.12, 0.035]} s={[1.76, 1.72, 0.02]} c="#fde68a" e="#b45309" />
      {[0.42, 0.98, 1.54].map((y, r) => (
        <group key={y}>
          <B p={[0, y, 0.12]} s={[1.76, 0.04, 0.26]} c="#f5f5f4" />
          {[-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72].map((x, i) =>
            (i + r) % 3 === 0 ? (
              <B key={x} p={[x, y + 0.14, 0.14]} s={[0.14, 0.24, 0.12]} c={['#be185d', '#0f766e', '#7c3aed'][(i + r) % 3]} />
            ) : (
              <group key={x}>
                <Cyl p={[x, y + 0.14, 0.14]} r={0.055} h={0.24} c={['#b45309', '#14532d', '#e7e5e4', '#7f1d1d'][(i + r * 2) % 4]} />
                <Cyl p={[x, y + 0.3, 0.14]} r={0.022} h={0.1} c="#ca8a04" />
              </group>
            ),
          )}
        </group>
      ))}
      <B p={[0, 2.36, 0.02]} s={[1.92, 0.34, 0.08]} c="#111827" />
      <Label p={[0, 2.36, 0.065]} w={1.84} h={0.28} text="DUTY FREE" bg="#ca8a04" fg="#111827" />
    </group>
  ),
  promo_stand: () => (
    <group>
      <Cyl p={[0, 0.45, 0]} r={0.38} h={0.9} c="#111827" seg={16} />
      <Cyl p={[0, 0.92, 0]} r={0.42} h={0.05} c="#ca8a04" seg={16} />
      {[[-0.15, 0.1], [0.15, 0.05], [0, -0.15]].map(([x, z], i) => (
        <group key={i}>
          <B p={[x, 1.06, z]} s={[0.13, 0.22, 0.09]} c={['#be185d', '#0ea5e9', '#f59e0b'][i]} />
          <B p={[x, 1.2, z]} s={[0.05, 0.06, 0.05]} c="#e7e5e4" />
        </group>
      ))}
    </group>
  ),
  cafe_kiosk: ({ text = 'CAFÉ' }) => (
    <group>
      <B p={[0, 0.5, 0.12]} s={[2.84, 1.0, 0.6]} c="#7c4a24" />
      <B p={[0, 0.3, 0.425]} s={[2.84, 0.5, 0.01]} c="#5a3418" />
      <B p={[0, 1.03, 0.12]} s={[2.9, 0.06, 0.68]} c="#f5f5f4" />
      {/* Espresso machine, cups and a case of meat pies */}
      <B p={[-0.9, 1.26, 0.08]} s={[0.6, 0.4, 0.4]} c="#111827" />
      <B p={[-0.9, 1.48, 0.08]} s={[0.62, 0.05, 0.42]} c={CHROME} />
      {[-0.5, -0.38].map((x) => <Cyl key={x} p={[x, 1.12, 0.26]} r={0.045} h={0.12} c="#f8fafc" />)}
      <B p={[0.6, 1.26, 0.14]} s={[1.3, 0.4, 0.5]} c="#bfe6f5" o={0.35} />
      {[0.15, 0.45, 0.75, 1.05].map((x, i) => <B key={x} p={[x, 1.13, 0.14]} s={[0.2, 0.1, 0.26]} c={i % 2 ? '#d97706' : '#b45309'} />)}
      {/* Menu board over the back */}
      {[-1.38, 1.38].map((x) => <B key={x} p={[x, 1.25, -0.38]} s={[0.07, 2.5, 0.07]} c="#3f2410" />)}
      <B p={[0, 2.2, -0.38]} s={[2.84, 0.6, 0.07]} c="#14532d" />
      <Label p={[0, 2.2, -0.34]} w={2.7} h={0.48} text={text} bg="#14532d" fg="#fef3c7" />
      {[-1.05, -0.35, 0.35, 1.05].map((x, i) => <B key={x} p={[x, 2.56, 0]} s={[0.7, 0.05, 0.9]} c={i % 2 ? '#f8fafc' : '#15803d'} />)}
    </group>
  ),
  // Stand-up table for a quick cup.
  cafe_table: () => (
    <group>
      <Cyl p={[0, 0.02, 0]} r={0.24} h={0.04} c="#475569" />
      <Cyl p={[0, 0.52, 0]} r={0.04} h={1.0} c={STEEL} />
      <Cyl p={[0, 1.04, 0]} r={0.36} h={0.05} c="#f5f5f4" seg={16} />
      <Cyl p={[0.12, 1.12, 0.05]} r={0.045} h={0.1} c="#7c4a24" />
      <B p={[-0.12, 1.08, -0.08]} s={[0.16, 0.03, 0.16]} c="#fde68a" />
    </group>
  ),
  bureau: () => (
    <group>
      <B p={[0, 0.55, 0]} s={[1.84, 1.1, 0.7]} c="#f8fafc" />
      <B p={[0, 0.16, 0.355]} s={[1.84, 0.16, 0.01]} c="#15803d" />
      <B p={[0, 1.12, 0]} s={[1.9, 0.05, 0.76]} c="#e2e8f0" />
      <B p={[0, 1.55, 0.3]} s={[1.8, 0.8, 0.03]} c="#bfe6f5" o={0.3} />
      {[-0.9, 0.9].map((x) => <B key={x} p={[x, 1.55, 0.3]} s={[0.06, 0.86, 0.06]} c={STEEL} />)}
      <B p={[0, 2.12, 0.2]} s={[1.9, 0.36, 0.3]} c="#111827" />
      <Label p={[0, 2.12, 0.355]} w={1.8} h={0.28} text="BUREAU DE CHANGE" bg="#facc15" fg="#111827" />
      <Table p={[0, 0.66, 0.356]} w={1.1} h={0.62} title="WE BUY" rows={RATES} accent="#4ade80" />
    </group>
  ),
  info_point: () => (
    <group>
      <B p={[0, 0.5, 0]} s={[1.7, 1.0, 0.6]} c="#1e3a8a" />
      <B p={[0, 1.03, 0]} s={[1.78, 0.06, 0.68]} c="#f8fafc" />
      <B p={[0, 0.5, 0.305]} s={[1.7, 0.12, 0.01]} c="#facc15" />
      <B p={[0.75, 1.5, -0.2]} s={[0.07, 0.9, 0.07]} c={STEEL} />
      <TwoSided p={[0.75, 2.2, -0.2]} w={0.5} h={0.5} text="i" bg="#1d4ed8" t={0.06} />
      <B p={[-0.4, 1.2, -0.05]} s={[0.36, 0.26, 0.04]} c="#0f172a" />
    </group>
  ),
};

export const PLACE_PROPS: Record<string, Model> = { ...SHARED, ...CIVIC_PROPS, ...CULTURE_PROPS, ...TRADE_PROPS, ...OUTDOOR_PROPS };
