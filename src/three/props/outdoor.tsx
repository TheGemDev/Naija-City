// Open-air places: the stadium, the dusty pitch, parade grounds, the park, the polo club and the river bank.

import { CityTree, Horse } from '../cityModels';
import { B, Ball, Cyl, Label, STEEL, Table, TwoSided, type Model, type V3 } from '../propKit';

const FLAT: V3 = [-Math.PI / 2, 0, 0];
const CROWD = ['#dc2626', '#2563eb', '#f8fafc', '#16a34a', '#f59e0b', '#9333ea', '#0d9488', '#facc15', '#db2777', '#111827'];
const SKIN = ['#5a371e', '#7c4a24', '#4a2c17', '#8d5a2b'];

/** A painted line on the ground. */
function Line({ p, s, c = '#f8fafc' }: { p: [number, number]; s: [number, number]; c?: string }) {
  return (
    <mesh position={[p[0], 0.022, p[1]]} rotation={FLAT}>
      <planeGeometry args={s} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

/** A flat disc or ring on the ground. `arc` is [start, length] in radians for part of one. */
function Disc({ p, r, inner = 0, c, y = 0.02, arc }: { p: [number, number]; r: number; inner?: number; c: string; y?: number; arc?: [number, number] }) {
  return (
    <mesh position={[p[0], y, p[1]]} rotation={FLAT} receiveShadow>
      <ringGeometry args={[inner, r, 28, 1, arc?.[0] ?? 0, arc?.[1] ?? Math.PI * 2]} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

/** A shape with straight sides and round ends, lying on the ground (a running track, an infield). */
function Oval({ straight, r, c, y }: { straight: number; r: number; c: string; y: number }) {
  return (
    <group>
      <mesh position={[0, y, 0]} rotation={FLAT} receiveShadow>
        <planeGeometry args={[straight, r * 2]} />
        <meshStandardMaterial color={c} />
      </mesh>
      <Disc p={[-straight / 2, 0]} r={r} c={c} y={y} arc={[Math.PI / 2, Math.PI]} />
      <Disc p={[straight / 2, 0]} r={r} c={c} y={y} arc={[-Math.PI / 2, Math.PI]} />
    </group>
  );
}

/** Rows of people on a stepped stand: a body and a head each, in shirts of every colour. */
function Spectators({ w, rows, step, rise, seed }: { w: number; rows: number; step: number; rise: number; seed: number }) {
  const per = Math.floor(w / 0.55);
  return (
    <group>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: per }, (_, i) => {
          const k = (i * 7 + r * 13 + seed * 5) % 11;
          if (k === 3 || k === 8) return null;
          const x = -w / 2 + 0.3 + i * ((w - 0.6) / (per - 1));
          const y = rise * (r + 1);
          const z = 0.55 - r * step;
          return (
            <group key={`${r}-${i}`} position={[x, y, z]}>
              <B p={[0, 0.28, 0]} s={[0.34, 0.5, 0.24]} c={CROWD[(i * 3 + r * 5 + seed) % CROWD.length]} />
              <B p={[0, 0.64, 0]} s={[0.2, 0.2, 0.2]} c={SKIN[(i + r + seed) % SKIN.length]} />
            </group>
          );
        }),
      )}
    </group>
  );
}

/** Football pitch markings centred on the origin: `a` and `b` are half its length and width. */
function PitchLines({ a, b, c = '#f8fafc' }: { a: number; b: number; c?: string }) {
  const t = 0.07;
  return (
    <group>
      {[-b, b].map((z) => <Line key={z} p={[0, z]} s={[a * 2 + t, t]} c={c} />)}
      {[-a, 0, a].map((x) => <Line key={x} p={[x, 0]} s={[t, b * 2]} c={c} />)}
      <Disc p={[0, 0]} r={b * 0.3} inner={b * 0.3 - t} c={c} y={0.022} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Line p={[s * (a - b * 0.45), 0]} s={[t, b * 1.2]} c={c} />
          {[-1, 1].map((e) => <Line key={e} p={[s * (a - b * 0.225), e * b * 0.6]} s={[b * 0.45, t]} c={c} />)}
          <Line p={[s * (a - b * 0.16), 0]} s={[t, b * 0.5]} c={c} />
          {[-1, 1].map((e) => <Line key={`g${e}`} p={[s * (a - b * 0.08), e * b * 0.25]} s={[b * 0.16, t]} c={c} />)}
        </group>
      ))}
    </group>
  );
}

export const OUTDOOR_PROPS: Record<string, Model> = {
  /* ---------- Stadium ---------- */

  // The whole playing area as one piece of ground you walk on: clay track round a striped pitch.
  stadium_field: () => (
    <group>
      <Oval straight={11} r={5.4} c="#b4532a" y={0.012} />
      {[4.95, 4.5, 4.05].map((r) => (
        <group key={r}>
          {[-r, r].map((z) => <Line key={z} p={[0, z]} s={[11, 0.05]} />)}
          <Disc p={[-5.5, 0]} r={r + 0.025} inner={r - 0.025} c="#f8fafc" y={0.022} arc={[Math.PI / 2, Math.PI]} />
          <Disc p={[5.5, 0]} r={r + 0.025} inner={r - 0.025} c="#f8fafc" y={0.022} arc={[-Math.PI / 2, Math.PI]} />
        </group>
      ))}
      <Oval straight={11} r={3.6} c="#3f9d52" y={0.016} />
      {[-5, -3, -1, 1, 3, 5].map((x) => (
        <mesh key={x} position={[x, 0.019, 0]} rotation={FLAT} receiveShadow>
          <planeGeometry args={[1, 6.4]} />
          <meshStandardMaterial color="#4cb562" />
        </mesh>
      ))}
      <PitchLines a={6.5} b={3.2} />
      {[[-6.5, -3.2], [6.5, -3.2], [-6.5, 3.2], [6.5, 3.2]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <B p={[0, 0.3, 0]} s={[0.03, 0.6, 0.03]} c="#f8fafc" />
          <B p={[0.08, 0.52, 0]} s={[0.16, 0.12, 0.02]} c="#dc2626" />
        </group>
      ))}
      {/* Start line and the lane numbers on the home straight */}
      <Line p={[-4.5, 4.5]} s={[0.1, 1.5]} />
      <Line p={[4.5, 4.5]} s={[0.1, 1.5]} />
    </group>
  ),
  // Open terracing packed with supporters.
  terrace: () => (
    <group>
      {[0, 1, 2, 3].map((r) => <B key={r} p={[0, 0.2 + r * 0.2, 0.62 - r * 0.42]} s={[5.9, 0.4 + r * 0.4, 0.44]} c={r % 2 ? '#15803d' : '#f1f5f9'} />)}
      <B p={[0, 1.15, -0.95]} s={[5.9, 2.3, 0.1]} c="#cbd5e1" />
      {[-2.95, 2.95].map((x) => <B key={x} p={[x, 0.7, -0.1]} s={[0.08, 1.4, 1.8]} c="#94a3b8" />)}
      <Spectators w={5.7} rows={4} step={0.42} rise={0.4} seed={3} />
      <B p={[0, 0.5, 0.88]} s={[5.9, 0.06, 0.04]} c={STEEL} />
      {[-2.9, -1.45, 0, 1.45, 2.9].map((x) => <B key={x} p={[x, 0.25, 0.88]} s={[0.05, 0.5, 0.05]} c={STEEL} />)}
    </group>
  ),
  floodlight: () => (
    <group>
      <B p={[0, 0.15, 0]} s={[0.5, 0.3, 0.5]} c="#64748b" />
      <Cyl p={[0, 3.6, 0]} r={0.09} rt={0.06} h={7} c={STEEL} seg={8} />
      <group position={[0, 7.2, 0]} rotation={[0.5, Math.PI / 4, 0]}>
        <B p={[0, 0, 0]} s={[1.5, 0.9, 0.14]} c="#334155" />
        {[-0.5, 0, 0.5].map((x) => [-0.22, 0.22].map((y) => <B key={`${x}${y}`} p={[x, y, 0.08]} s={[0.36, 0.3, 0.02]} c="#fef9c3" e="#fde68a" />))}
      </group>
    </group>
  ),
  scoreboard: () => (
    <group>
      {[-1.6, 1.6].map((x) => <B key={x} p={[x, 1.3, 0]} s={[0.14, 2.6, 0.14]} c="#475569" />)}
      <B p={[0, 3.2, 0]} s={[3.9, 1.7, 0.2]} c="#0b1220" />
      <Table p={[0, 3.2, 0.105]} w={3.7} h={1.5} title="FULL TIME · 78'" rows={[['HOME', '2'], ['AWAY', '1']]} accent="#4ade80" />
    </group>
  ),
  // You push through it on the way in.
  turnstile: () => (
    <group>
      {[-0.42, 0.42].map((x) => <B key={x} p={[x, 0.55, 0]} s={[0.14, 1.1, 0.7]} c="#15803d" />)}
      {[-0.42, 0.42].map((x) => <B key={`t${x}`} p={[x, 1.12, 0]} s={[0.18, 0.05, 0.74]} c="#f8fafc" />)}
      {[0, 2.1, 4.2].map((a) => (
        <group key={a} position={[-0.3, 0.8, 0]} rotation={[a, 0, 0]}>
          <Cyl p={[0.18, 0.2, 0]} r={0.02} h={0.44} c={STEEL} rot={[0, 0, -1.2]} />
        </group>
      ))}
    </group>
  ),
  // A little shop or office with a hatch and a sign: tickets, the score pool, pure water.
  booth: ({ text = 'TICKETS' }) => (
    <group>
      <B p={[0, 1.0, -0.1]} s={[1.8, 2.0, 0.7]} c="#f8fafc" />
      <B p={[0, 0.5, 0.26]} s={[1.8, 1.0, 0.02]} c="#15803d" />
      <B p={[0, 1.35, 0.26]} s={[1.3, 0.6, 0.02]} c="#0f172a" />
      <B p={[0, 1.02, 0.34]} s={[1.5, 0.05, 0.22]} c="#e2e8f0" />
      <B p={[0, 2.06, 0.05]} s={[2.0, 0.08, 1.1]} c="#b91c1c" />
      <B p={[0, 1.86, 0.5]} s={[1.9, 0.34, 0.05]} c="#111827" />
      <Label p={[0, 1.86, 0.53]} w={1.8} h={0.28} text={text} bg="#facc15" fg="#111827" />
    </group>
  ),
  changing_room: () => (
    <group>
      <B p={[0, 1.1, -0.1]} s={[1.9, 2.2, 0.75]} c="#e2e8f0" />
      <B p={[0, 2.24, -0.05]} s={[2.0, 0.08, 0.9]} c="#15803d" />
      <B p={[-0.45, 0.95, 0.285]} s={[0.7, 1.9, 0.02]} c="#1e3a8a" />
      <B p={[0.5, 1.2, 0.285]} s={[0.6, 1.5, 0.02]} c="#bfe6f5" o={0.5} />
      <Cyl p={[0.5, 1.9, 0.4]} r={0.09} h={0.05} c={STEEL} />
      <B p={[0.5, 2.0, 0.34]} s={[0.04, 0.2, 0.14]} c={STEEL} />
      <Label p={[0, 2.42, 0.3]} w={1.6} h={0.26} text="CHANGING ROOM" bg="#0f172a" />
    </group>
  ),

  /* ---------- Neighbourhood pitch ---------- */

  // Bare sand with chalk lines, worn brown in front of each goal.
  dust_pitch: () => (
    <group position={[-0.5, 0, 0]}>
      <mesh position={[0, 0.012, 0]} rotation={FLAT} receiveShadow>
        <planeGeometry args={[11.6, 5.6]} />
        <meshStandardMaterial color="#d2a56c" />
      </mesh>
      {[-4.6, 4.6].map((x) => <Disc key={x} p={[x, 0]} r={1.3} c="#b98a55" y={0.016} />)}
      <Disc p={[0, 0]} r={1.1} c="#c4975f" y={0.016} />
      {[[-2.6, 1.8], [2.2, -1.9], [3.4, 1.6], [-3.2, -1.5]].map(([x, z], i) => <Disc key={i} p={[x, z]} r={0.5} c="#9bb065" y={0.017} />)}
      <PitchLines a={5.6} b={2.6} c="#f5efe0" />
    </group>
  ),
  // Old tyres sunk halfway into the ground and painted: a fence, and seats for small boys.
  tyre_row: () => (
    <group>
      {[-0.66, 0, 0.66].map((x, i) => (
        <mesh key={x} position={[x, 0.02, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[0.28, 0.1, 6, 12, Math.PI]} />
          <meshStandardMaterial color={['#f8fafc', '#15803d', '#f8fafc'][i]} flatShading />
        </mesh>
      ))}
    </group>
  ),

  /* ---------- Squares and parade grounds ---------- */

  lamp_post: () => (
    <group>
      <Cyl p={[0, 0.1, 0]} r={0.12} h={0.2} c="#334155" />
      <Cyl p={[0, 1.7, 0]} r={0.045} h={3.4} c="#334155" seg={8} />
      <B p={[0.25, 3.36, 0]} s={[0.6, 0.06, 0.08]} c="#334155" />
      <B p={[0.5, 3.28, 0]} s={[0.36, 0.1, 0.2]} c="#fef9c3" e="#fde68a" />
    </group>
  ),
  // Where the salute is taken: steps up, a lectern, and a canopy in the colours.
  dais: () => (
    <group>
      <B p={[0, 0.2, -0.1]} s={[2.9, 0.4, 1.7]} c="#e7e5e4" />
      <B p={[0, 0.1, 0.85]} s={[1.4, 0.2, 0.3]} c="#d6d3d1" />
      <B p={[0, 0.42, -0.1]} s={[2.5, 0.03, 1.3]} c="#991b1b" />
      {[[-1.35, -0.85], [1.35, -0.85], [-1.35, 0.65], [1.35, 0.65]].map(([x, z], i) => <B key={i} p={[x, 1.5, z]} s={[0.08, 2.2, 0.08]} c="#f8fafc" />)}
      {[-0.97, 0, 0.97].map((x, i) => <B key={x} p={[x, 2.65, -0.1]} s={[0.97, 0.1, 1.9]} c={i === 1 ? '#f8fafc' : '#15803d'} />)}
      <B p={[0, 0.95, 0.45]} s={[0.5, 1.0, 0.36]} c="#5a3418" />
      <B p={[0, 1.46, 0.45]} s={[0.56, 0.04, 0.42]} c="#3f2410" />
      <Cyl p={[0.12, 1.62, 0.45]} r={0.02} h={0.3} c="#1f2937" />
    </group>
  ),
  // Stone figure on a stepped plinth.
  monument: () => (
    <group>
      <B p={[0, 0.15, 0]} s={[1.9, 0.3, 1.9]} c="#d6d3d1" />
      <B p={[0, 0.45, 0]} s={[1.4, 0.3, 1.4]} c="#e7e5e4" />
      <B p={[0, 1.3, 0]} s={[0.8, 1.4, 0.8]} c="#f5f5f4" />
      <B p={[0, 1.2, 0.41]} s={[0.5, 0.36, 0.02]} c="#a16207" />
      <B p={[0, 2.5, 0]} s={[0.4, 1.0, 0.3]} c="#57534e" />
      <B p={[0, 3.14, 0]} s={[0.26, 0.28, 0.26]} c="#57534e" />
      <group position={[0.3, 2.7, 0]} rotation={[0, 0, -0.9]}>
        <B p={[0, 0.3, 0]} s={[0.12, 0.7, 0.12]} c="#57534e" />
      </group>
    </group>
  ),
  // An old field gun kept as a monument.
  cannon: () => (
    <group>
      <B p={[0, 0.08, 0]} s={[0.9, 0.16, 1.8]} c="#d6d3d1" />
      {[-0.42, 0.42].map((x) => <Cyl key={x} p={[x, 0.55, 0.15]} r={0.4} h={0.1} c="#1f2937" seg={14} rot={[0, 0, Math.PI / 2]} />)}
      <B p={[0, 0.55, 0.15]} s={[0.7, 0.3, 0.5]} c="#3f5d3a" />
      <Cyl p={[0, 0.78, 0.75]} r={0.09} rt={0.07} h={1.7} c="#3f5d3a" seg={10} rot={[1.35, 0, 0]} />
      <B p={[0, 0.9, 0.1]} s={[0.8, 0.6, 0.06]} c="#4d6b46" />
      <B p={[0, 0.3, -0.55]} s={[0.12, 0.12, 1.0]} c="#3f5d3a" />
    </group>
  ),
  sentry_box: () => (
    <group>
      <B p={[0, 1.05, -0.1]} s={[0.84, 2.1, 0.7]} c="#f8fafc" />
      <B p={[0, 0.9, 0.26]} s={[0.5, 1.6, 0.02]} c="#1f2937" />
      {[0.3, 0.7, 1.1, 1.5, 1.9].map((y, i) => <B key={y} p={[-0.33, y, 0.26]} s={[0.16, 0.2, 0.021]} c={i % 2 ? '#f8fafc' : '#dc2626'} />)}
      <mesh position={[0, 2.35, -0.1]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.75, 0.5, 4]} />
        <meshStandardMaterial color="#14532d" flatShading />
      </mesh>
    </group>
  ),
  // Assault-course wall with a climbing rope.
  obstacle_wall: () => (
    <group>
      {[0.2, 0.6, 1.0, 1.4, 1.8].map((y, i) => <B key={y} p={[0, y, 0]} s={[1.8, 0.36, 0.14]} c={i % 2 ? '#7c4a24' : '#92400e'} />)}
      {[-0.9, 0.9].map((x) => <B key={x} p={[x, 1.1, 0]} s={[0.14, 2.2, 0.2]} c="#5a3418" />)}
      <B p={[0.4, 1.0, 0.1]} s={[0.05, 2.0, 0.05]} c="#e7d3b1" />
    </group>
  ),
  // You swing along it hand over hand, and walk under it.
  monkey_bars: () => (
    <group>
      {[-1.4, 1.4].map((x) => [-0.4, 0.4].map((z) => <B key={`${x}${z}`} p={[x, 1.15, z]} s={[0.08, 2.3, 0.08]} c="#3f5d3a" />))}
      {[-0.4, 0.4].map((z) => <B key={z} p={[0, 2.3, z]} s={[2.9, 0.08, 0.08]} c="#3f5d3a" />)}
      {[-1.05, -0.7, -0.35, 0, 0.35, 0.7, 1.05].map((x) => <B key={x} p={[x, 2.3, 0]} s={[0.05, 0.05, 0.8]} c="#facc15" />)}
    </group>
  ),
  tyre_run: () => (
    <group>
      {[-0.6, 0, 0.6].map((x) => [-0.22, 0.22].map((z, j) => (
        <mesh key={`${x}${z}`} position={[x + (j ? 0.3 : 0), 0.08, z]} rotation={FLAT} castShadow>
          <torusGeometry args={[0.2, 0.08, 6, 12]} />
          <meshStandardMaterial color="#1f2937" flatShading />
        </mesh>
      )))}
    </group>
  ),
  // Long table and benches under canvas. You sit on the front bench.
  mess_table: () => (
    <group>
      <B p={[0, 0.76, -0.1]} s={[2.8, 0.06, 0.8]} c="#f8fafc" />
      {[-1.3, 1.3].map((x) => <B key={x} p={[x, 0.38, -0.1]} s={[0.08, 0.76, 0.7]} c="#5a3418" />)}
      {[-0.75, 0.55].map((z) => (
        <group key={z}>
          <B p={[0, 0.44, z]} s={[2.8, 0.06, 0.34]} c="#7c4a24" />
          {[-1.3, 1.3].map((x) => <B key={x} p={[x, 0.22, z]} s={[0.06, 0.44, 0.3]} c="#5a3418" />)}
        </group>
      ))}
      {[-0.9, 0, 0.9].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.81, 0]} r={0.16} h={0.03} c="#e2e8f0" />
          <Cyl p={[x + 0.3, 0.85, -0.25]} r={0.05} h={0.12} c="#bfe6f5" />
        </group>
      ))}
      {[[-1.45, -1.0], [1.45, -1.0], [-1.45, 0.9], [1.45, 0.9]].map(([x, z], i) => <B key={i} p={[x, 1.25, z]} s={[0.07, 2.5, 0.07]} c="#3f5d3a" />)}
      <B p={[0, 2.52, -0.05]} s={[3.1, 0.06, 2.1]} c="#4d6b46" />
    </group>
  ),

  /* ---------- Park ---------- */

  swing: () => (
    <group>
      {[-0.9, 0.9].map((x) => [-0.4, 0.4].map((z) => (
        <group key={`${x}${z}`} position={[x, 1.0, z / 2]} rotation={[z > 0 ? -0.3 : 0.3, 0, 0]}>
          <B p={[0, 0, 0]} s={[0.07, 2.1, 0.07]} c="#dc2626" />
        </group>
      )))}
      <B p={[0, 2.0, 0]} s={[1.95, 0.08, 0.08]} c="#dc2626" />
      {[-0.4, 0.4].map((x) => (
        <group key={x}>
          {[-0.14, 0.14].map((d) => <B key={d} p={[x + d, 1.2, 0]} s={[0.02, 1.6, 0.02]} c={STEEL} />)}
          <B p={[x, 0.4, 0]} s={[0.36, 0.04, 0.18]} c="#1d4ed8" />
        </group>
      ))}
    </group>
  ),
  slide: () => (
    <group>
      <B p={[0, 0.75, -0.6]} s={[0.7, 0.06, 0.6]} c="#facc15" />
      {[[-0.3, -0.85], [0.3, -0.85], [-0.3, -0.35], [0.3, -0.35]].map(([x, z], i) => <B key={i} p={[x, 0.75, z]} s={[0.06, 1.5, 0.06]} c="#1d4ed8" />)}
      <group position={[0, 0.74, -0.3]} rotation={[0.52, 0, 0]}>
        <B p={[0, 0, 0.75]} s={[0.56, 0.05, 1.5]} c="#dc2626" />
        {[-0.3, 0.3].map((x) => <B key={x} p={[x, 0.08, 0.75]} s={[0.05, 0.16, 1.5]} c="#f97316" />)}
      </group>
      {[0.2, 0.45, 0.7].map((y) => <B key={y} p={[0, y, -0.9]} s={[0.56, 0.04, 0.05]} c="#1d4ed8" />)}
    </group>
  ),
  seesaw: () => (
    <group>
      <B p={[0, 0.25, 0]} s={[0.2, 0.5, 0.3]} c="#15803d" />
      <group position={[0, 0.52, 0]} rotation={[0, 0, 0.22]}>
        <B p={[0, 0, 0]} s={[1.9, 0.06, 0.24]} c="#facc15" />
        {[-0.8, 0.8].map((x) => <B key={x} p={[x * 0.85, 0.15, 0]} s={[0.04, 0.26, 0.3]} c="#dc2626" />)}
      </group>
    </group>
  ),
  flower_bed: () => (
    <group>
      <B p={[0, 0.1, 0]} s={[1.9, 0.2, 0.9]} c="#a8a29e" />
      <B p={[0, 0.2, 0]} s={[1.7, 0.06, 0.7]} c="#5a3418" />
      {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => [-0.2, 0.2].map((z, j) => (
        <group key={`${x}${z}`}>
          <Ball p={[x, 0.32, z]} r={0.14} c="#15803d" />
          <Ball p={[x, 0.46, z]} r={0.08} c={['#dc2626', '#facc15', '#db2777', '#f97316', '#f8fafc'][(i + j * 2) % 5]} />
        </group>
      )))}
    </group>
  ),
  // Push cart under an umbrella: ice cream, kunu, puff-puff.
  food_cart: ({ text = 'ICE CREAM' }) => (
    <group>
      <B p={[0, 0.6, 0]} s={[1.3, 0.7, 0.7]} c="#f8fafc" />
      <B p={[0, 0.6, 0.355]} s={[1.3, 0.3, 0.01]} c="#db2777" />
      <Label p={[0, 0.6, 0.362]} w={1.1} h={0.22} text={text} bg="#db2777" />
      <B p={[0, 0.97, 0]} s={[1.36, 0.05, 0.76]} c="#e2e8f0" />
      {[-0.45, 0.45].map((x) => <Cyl key={x} p={[x, 0.24, 0.3]} r={0.24} h={0.06} c="#1f2937" rot={[Math.PI / 2, 0, 0]} />)}
      <B p={[0.8, 0.8, 0]} s={[0.4, 0.05, 0.05]} c={STEEL} />
      <Cyl p={[-0.3, 1.6, 0]} r={0.025} h={1.3} c={STEEL} />
      <Cyl p={[-0.3, 2.3, 0]} r={0.95} rt={0.04} h={0.3} c="#f59e0b" seg={8} />
    </group>
  ),

  /* ---------- Polo club ---------- */

  // Polo goals have no bar and no net: two tall posts, wrapped in the club's colours.
  polo_goal: () => (
    <group>
      {[-1.2, 1.2].map((z) => (
        <group key={z}>
          <Cyl p={[0, 1.6, z]} r={0.07} h={3.2} c="#f8fafc" seg={8} />
          {[0.6, 1.4, 2.2].map((y) => <Cyl key={y} p={[0, y, z]} r={0.075} h={0.3} c="#b91c1c" seg={8} />)}
          <B p={[0.14, 3.0, z]} s={[0.3, 0.2, 0.02]} c="#15803d" />
        </group>
      ))}
    </group>
  ),
  // Loose boxes with a pony looking out over each half door.
  stable: () => (
    <group>
      <B p={[0, 1.1, -0.35]} s={[2.9, 2.2, 1.2]} c="#7c4a24" />
      <B p={[0, 2.3, -0.2]} s={[3.1, 0.12, 1.7]} c="#14532d" />
      {[-0.95, 0, 0.95].map((x, i) => (
        <group key={x} position={[x, 0, 0.26]}>
          <B p={[0, 1.55, 0]} s={[0.7, 0.9, 0.02]} c="#1c1917" />
          <B p={[0, 0.55, 0.01]} s={[0.76, 1.1, 0.05]} c="#5a3418" />
          <B p={[0, 0.55, 0.04]} s={[0.6, 0.06, 0.02]} c="#f8fafc" />
          <B p={[0, 1.45, 0.18]} s={[0.22, 0.5, 0.3]} c={['#7c2d12', '#e7e5e4', '#44403c'][i]} />
          <B p={[0, 1.38, 0.42]} s={[0.18, 0.2, 0.3]} c={['#7c2d12', '#e7e5e4', '#44403c'][i]} />
        </group>
      ))}
    </group>
  ),
  // White marquee on the lawn, a laid table and a bucket of something cold. You sit along the front.
  marquee: () => (
    <group>
      {[[-1.9, -1.3], [1.9, -1.3], [-1.9, 1.3], [1.9, 1.3]].map(([x, z], i) => <B key={i} p={[x, 1.2, z]} s={[0.08, 2.4, 0.08]} c="#f8fafc" />)}
      <mesh position={[0, 2.95, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.45, 1, 1]} castShadow>
        <coneGeometry args={[2.1, 1.1, 4]} />
        <meshStandardMaterial color="#f8fafc" flatShading />
      </mesh>
      {[-1.5, -0.5, 0.5, 1.5].map((x) => <B key={x} p={[x, 2.3, 1.36]} s={[0.9, 0.3, 0.03]} c={Math.abs(x) > 1 ? '#15803d' : '#f8fafc'} />)}
      <B p={[0, 0.74, -0.3]} s={[2.8, 0.05, 0.9]} c="#f8fafc" />
      <B p={[0, 0.37, -0.3]} s={[2.6, 0.74, 0.7]} c="#e2e8f0" />
      <Cyl p={[0, 0.9, -0.3]} r={0.16} rt={0.2} h={0.26} c="#cbd5e1" />
      <Cyl p={[0.03, 1.08, -0.3]} r={0.045} h={0.3} c="#14532d" />
      {[-0.9, 0.9].map((x) => <Cyl key={x} p={[x, 0.84, -0.2]} r={0.04} h={0.14} c="#fde68a" o={0.8} />)}
      {[-1.5, -0.5, 0.5, 1.5].map((x) => (
        <group key={x} position={[x, 0, 0.7]}>
          <B p={[0, 0.44, 0]} s={[0.5, 0.06, 0.46]} c="#f8fafc" />
          <B p={[0, 0.75, -0.22]} s={[0.5, 0.6, 0.05]} c="#f8fafc" />
          <B p={[0, 0.22, 0]} s={[0.4, 0.44, 0.36]} c="#e2e8f0" />
        </group>
      ))}
    </group>
  ),
  // A pony standing saddled, mallet leaning on the rail.
  polo_pony: () => (
    <group>
      <group scale={1.5}><Horse /></group>
      <B p={[0.5, 0.75, 0.3]} s={[0.04, 1.5, 0.04]} c="#e7d3b1" />
      <B p={[0.5, 0.06, 0.3]} s={[0.1, 0.1, 0.3]} c="#7c4a24" />
    </group>
  ),
  trophy_table: () => (
    <group>
      <B p={[0, 0.4, 0]} s={[0.9, 0.8, 0.7]} c="#14532d" />
      <B p={[0, 0.82, 0]} s={[1.0, 0.04, 0.8]} c="#f8fafc" />
      <Cyl p={[0, 0.9, 0]} r={0.12} h={0.1} c="#3f2410" />
      <Cyl p={[0, 1.02, 0]} r={0.03} h={0.16} c="#eab308" />
      <Cyl p={[0, 1.24, 0]} r={0.08} rt={0.18} h={0.3} c="#eab308" e="#854d0e" />
    </group>
  ),

  /* ---------- River bank ---------- */

  // Planks out over the water. You walk on it.
  jetty: () => (
    <group>
      {[-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].map((z, i) => <B key={z} p={[0, 0.1, z]} s={[1.8, 0.07, 0.44]} c={i % 2 ? '#8b5a2b' : '#7c4a24'} />)}
      {[[-0.85, -1.4], [0.85, -1.4], [-0.85, 0], [0.85, 0], [-0.85, 1.4], [0.85, 1.4]].map(([x, z], i) => <Cyl key={i} p={[x, 0.2, z]} r={0.07} h={0.7} c="#5a3418" seg={8} />)}
    </group>
  ),
  canoe: () => (
    <group position={[0, 0.02, 0]}>
      <B p={[0, 0.14, 0]} s={[0.7, 0.24, 2.0]} c="#7c2d12" />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.14, s * 1.2]} rotation={[s * Math.PI / 2, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.49, 0.5, 4]} />
          <meshStandardMaterial color="#7c2d12" flatShading />
        </mesh>
      ))}
      <B p={[0, 0.2, 0]} s={[0.56, 0.14, 1.8]} c="#a16207" />
      {[-0.5, 0.4].map((z) => <B key={z} p={[0, 0.27, z]} s={[0.6, 0.04, 0.16]} c="#5a3418" />)}
      <group position={[0.2, 0.34, 0]} rotation={[0, 0.3, 0]}>
        <B p={[0, 0, 0]} s={[0.05, 0.04, 1.7]} c="#e7d3b1" />
        <B p={[0, 0, 0.9]} s={[0.16, 0.03, 0.34]} c="#e7d3b1" />
      </group>
      <B p={[-0.1, 0.3, -0.75]} s={[0.36, 0.14, 0.3]} c="#94a3b8" />
    </group>
  ),
  reeds: () => (
    <group>
      {[[-0.25, -0.2, 1.3], [0.1, 0.15, 1.6], [0.3, -0.25, 1.1], [-0.1, 0.3, 1.4], [0.25, 0.3, 1.2], [-0.3, 0.1, 1.5]].map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, 0, (i % 3 - 1) * 0.08]}>
          <B p={[0, h / 2, 0]} s={[0.04, h, 0.04]} c={i % 2 ? '#4d7c0f' : '#65a30d'} />
          {i % 2 === 0 && <B p={[0, h, 0]} s={[0.08, 0.26, 0.08]} c="#78350f" />}
        </group>
      ))}
    </group>
  ),
  // The day's catch split and hung over a smoky fire.
  fish_rack: () => (
    <group>
      {[-0.85, 0.85].map((x) => <B key={x} p={[x, 0.65, 0]} s={[0.07, 1.3, 0.07]} c="#5a3418" />)}
      <B p={[0, 1.28, 0]} s={[1.8, 0.06, 0.06]} c="#5a3418" />
      {[-0.6, -0.3, 0, 0.3, 0.6].map((x, i) => <B key={x} p={[x, 1.02, 0]} s={[0.14, 0.44, 0.04]} c={i % 2 ? '#a8a29e' : '#78716c'} />)}
      <Cyl p={[0, 0.06, 0]} r={0.4} h={0.12} c="#44403c" seg={8} />
      <B p={[0, 0.14, 0]} s={[0.4, 0.06, 0.3]} c="#f97316" e="#c2410c" />
    </group>
  ),
  palm: () => (
    <group>
      <Cyl p={[0.08, 1.4, 0]} r={0.13} rt={0.09} h={2.8} c="#8b5a2b" seg={7} rot={[0, 0, -0.06]} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={i} position={[0.16, 2.8, 0]} rotation={[0, (i * Math.PI) / 3, 0.5]}>
          <B p={[0.75, 0, 0]} s={[1.5, 0.05, 0.36]} c={i % 2 ? '#15803d' : '#16a34a'} />
        </group>
      ))}
      {[[0.05, 0.1], [0.28, -0.08]].map(([x, z], i) => <Ball key={i} p={[x, 2.62, z]} r={0.12} c="#5a3418" />)}
    </group>
  ),
  rock_pile: () => (
    <group>
      {[[0, 0.16, 0, 0.3], [0.28, 0.1, 0.18, 0.18], [-0.26, 0.1, 0.12, 0.2], [0.05, 0.08, -0.3, 0.16], [-0.2, 0.06, -0.2, 0.12]].map(([x, y, z, r], i) => (
        <Ball key={i} p={[x, y, z]} r={r} c={['#78716c', '#a8a29e', '#57534e'][i % 3]} s={[1.2, 0.7, 1]} />
      ))}
    </group>
  ),
  shade_tree: () => <CityTree p={[0, 0, 0]} s={1.0} />,
  // A sign on two legs at the edge of a field.
  field_sign: ({ text = '' }) => (
    <group>
      {[-0.7, 0.7].map((x) => <B key={x} p={[x, 0.5, 0]} s={[0.07, 1.0, 0.07]} c="#5a3418" />)}
      <TwoSided p={[0, 1.15, 0]} w={1.7} h={0.5} text={text} bg="#14532d" />
    </group>
  ),
};
