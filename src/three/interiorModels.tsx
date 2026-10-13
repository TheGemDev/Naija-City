// Props used inside town places. Centred on their footprint, sitting on y=0, front facing +z.
// Anything that is also a house item (dining, plastic_chair, desk...) falls back to ItemModel.

import { B, ItemModel, Keke } from './models';
import { CityTree } from './cityModels';
import { PLACE_PROPS } from './placeProps';

type V3 = [number, number, number];

function Cyl({ p, r, h, c, rt, seg = 10, e, o }: { p: V3; r: number; h: number; c: string; rt?: number; seg?: number; e?: string; o?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, seg]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} flatShading transparent={o !== undefined} opacity={o ?? 1} />
    </mesh>
  );
}

const legs = (w: number, d: number, h: number, c: string, t = 0.05) =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <B key={i} p={[(sx * (w - t)) / 2, h / 2, (sz * (d - t)) / 2]} s={[t, h, t]} c={c} />);

const GOODS = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0d9488', '#db2777'];

function Stall({ goods }: { goods: 'fabric' | 'food' | 'produce' }) {
  return (
    <group>
      <B p={[0, 0.4, 0]} s={[1.8, 0.8, 0.8]} c="#7c4a24" />
      {goods === 'fabric' &&
        [-0.6, -0.2, 0.2, 0.6].map((x, i) => <B key={x} p={[x, 0.95, 0]} s={[0.35, 0.3, 0.6]} c={GOODS[i * 2 % 7]} />)}
      {goods === 'food' &&
        [-0.55, 0, 0.55].map((x, i) => <Cyl key={x} p={[x, 0.9, 0]} r={0.2} rt={0.24} h={0.18} c={['#f59e0b', '#e5e7eb', '#b91c1c'][i]} />)}
      {goods === 'produce' &&
        [-0.6, -0.3, 0, 0.3, 0.6].map((x, i) => (
          <mesh key={x} position={[x, 0.92, 0]} castShadow>
            <icosahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial color={['#dc2626', '#16a34a', '#f97316', '#dc2626', '#facc15'][i]} flatShading />
          </mesh>
        ))}
      {[-0.85, 0.85].map((x) => <B key={x} p={[x, 1.1, -0.35]} s={[0.06, 2.2, 0.06]} c="#5a3418" />)}
      <B p={[0, 2.2, -0.05]} s={[2, 0.06, 1.1]} c={goods === 'food' ? '#15803d' : goods === 'fabric' ? '#b91c1c' : '#1d4ed8'} />
    </group>
  );
}

function Seats({ n, c }: { n: number; c: string }) {
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[-(n - 1) / 2 + i, 0, 0]}>
          <B p={[0, 0.4, 0]} s={[0.8, 0.12, 0.7]} c={c} />
          <B p={[0, 0.8, -0.32]} s={[0.8, 0.7, 0.1]} c={c} />
          <B p={[0, 0.2, 0]} s={[0.1, 0.4, 0.1]} c="#1f2937" />
        </group>
      ))}
    </group>
  );
}

export function PropModel({ type, text }: { type: string; text?: string }) {
  const Place = PLACE_PROPS[type];
  if (Place) return <Place text={text} />;
  switch (type) {
    case 'exit':
      return (
        <group>
          <B p={[0, 0.012, 0]} s={[0.9, 0.02, 0.9]} c="#facc15" o={0.85} />
          <B p={[0, 0.025, 0.1]} s={[0.15, 0.01, 0.5]} c="#1f2937" />
          <mesh position={[0, 0.026, -0.2]} rotation={[-Math.PI / 2, 0, Math.PI]}>
            <circleGeometry args={[0.22, 3]} />
            <meshBasicMaterial color="#1f2937" />
          </mesh>
        </group>
      );
    case 'cooler':
      return (
        <group>
          <B p={[0, 0.7, 0]} s={[0.8, 1.4, 0.7]} c="#dc2626" />
          <B p={[0, 0.75, 0.36]} s={[0.6, 1.0, 0.02]} c="#bae6fd" o={0.7} />
          {[0.45, 0.75, 1.05].map((y) => <B key={y} p={[0, y, 0.2]} s={[0.55, 0.18, 0.25]} c={y > 0.9 ? '#16a34a' : '#f59e0b'} />)}
        </group>
      );
    case 'umbrella':
      return (
        <group>
          <Cyl p={[0, 0.9, 0]} r={0.03} h={1.8} c="#64748b" />
          <Cyl p={[0, 1.8, 0]} r={0.85} rt={0.03} h={0.3} c="#16a34a" seg={8} />
          <B p={[0, 0.4, 0]} s={[0.6, 0.05, 0.6]} c="#f8fafc" />
        </group>
      );
    case 'pot_counter':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[1.9, 0.9, 0.8]} c="#92400e" />
          {[-0.6, 0, 0.6].map((x, i) => <Cyl key={x} p={[x, 1.02, 0]} r={0.24} rt={0.28} h={0.25} c={['#d97706', '#9ca3af', '#b91c1c'][i]} />)}
        </group>
      );
    case 'bench':
      return (
        <group>
          <B p={[0, 0.42, 0]} s={[1.8, 0.08, 0.45]} c="#92400e" />
          <B p={[0, 0.72, -0.2]} s={[1.8, 0.4, 0.06]} c="#92400e" />
          {legs(1.7, 0.4, 0.4, '#5a3418')}
        </group>
      );
    case 'kettle_table':
      return (
        <group>
          <B p={[0, 0.7, 0]} s={[0.9, 0.06, 0.7]} c="#1d4ed8" />
          {legs(0.85, 0.65, 0.68, '#1e3a8a')}
          <Cyl p={[-0.2, 0.86, 0]} r={0.12} rt={0.08} h={0.26} c="#e5e7eb" />
          <Cyl p={[0.2, 0.8, 0.1]} r={0.06} h={0.14} c="#fde68a" />
          <B p={[0.2, 0.82, -0.15]} s={[0.3, 0.12, 0.2]} c="#d97706" />
        </group>
      );
    case 'pew':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[2.8, 0.08, 0.5]} c="#7c4a24" />
          <B p={[0, 0.8, -0.24]} s={[2.8, 0.65, 0.06]} c="#6b3f1d" />
          {[-1.35, 1.35].map((x) => <B key={x} p={[x, 0.4, 0]} s={[0.08, 0.8, 0.55]} c="#5a3418" />)}
        </group>
      );
    case 'fishing_spot':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.9, 0.06, 0.9]} c="#8b5a2b" />
          <group position={[0.2, 0.1, -0.3]} rotation={[-0.9, 0, 0]}>
            <Cyl p={[0, 0.9, 0]} r={0.015} h={1.8} c="#3f3f46" />
          </group>
          <Cyl p={[-0.25, 0.15, 0.2]} r={0.15} rt={0.18} h={0.25} c="#1d4ed8" />
        </group>
      );
    case 'neem':
      return <CityTree p={[0, 0, 0]} s={0.75} />;
    case 'fabric_stall':
      return <Stall goods="fabric" />;
    case 'food_stall':
      return <Stall goods="food" />;
    case 'produce_stall':
      return <Stall goods="produce" />;
    case 'exhibit':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[1.6, 0.9, 0.7]} c="#44403c" />
          <B p={[0, 1.2, 0]} s={[1.5, 0.6, 0.6]} c="#e0f2fe" o={0.35} />
          {[-0.45, 0, 0.45].map((x, i) => (
            <mesh key={x} position={[x, 1.08, 0]} scale={[1, 1.3, 0.9]} castShadow>
              <icosahedronGeometry args={[0.13, 1]} />
              <meshStandardMaterial color={['#b45309', '#a16207', '#78350f'][i]} flatShading />
            </mesh>
          ))}
        </group>
      );
    case 'info_desk':
      return (
        <group>
          <B p={[0, 0.5, 0]} s={[1.8, 1, 0.6]} c="#7c4a24" />
          <B p={[0, 1.02, 0]} s={[1.85, 0.05, 0.65]} c="#e7e5e4" />
          <B p={[0.5, 1.1, 0]} s={[0.3, 0.1, 0.2]} c="#facc15" />
        </group>
      );
    case 'grandstand':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <B key={i} p={[0, 0.2 + i * 0.25, 0.5 - i * 0.45]} s={[5.6, 0.4 + i * 0.5, 0.5]} c="#e5e7eb" />
          ))}
          <B p={[0, 2.2, -0.2]} s={[6, 0.1, 1.8]} c="#15803d" />
          {[-2.8, 2.8].map((x) => <B key={x} p={[x, 1.1, 0.6]} s={[0.1, 2.2, 0.1]} c="#94a3b8" />)}
          <B p={[0, 1.4, 0.75]} s={[1.5, 0.35, 0.05]} c="#facc15" />
        </group>
      );
    case 'flagpole':
      return (
        <group>
          <Cyl p={[0, 1.5, 0]} r={0.03} h={3} c="#cbd5e1" />
          <B p={[0.2, 2.7, 0]} s={[0.15, 0.35, 0.02]} c="#15803d" />
          <B p={[0.35, 2.7, 0]} s={[0.15, 0.35, 0.02]} c="#ffffff" />
          <B p={[0.5, 2.7, 0]} s={[0.15, 0.35, 0.02]} c="#15803d" />
        </group>
      );
    case 'cone':
      return (
        <group>
          <B p={[0, 0.01, 0]} s={[0.9, 0.02, 0.9]} c="#b45309" />
          <mesh position={[0, 0.2, 0]} castShadow>
            <coneGeometry args={[0.15, 0.4, 8]} />
            <meshStandardMaterial color="#f97316" />
          </mesh>
        </group>
      );
    case 'office_desk':
      return (
        <group>
          <B p={[0, 0.74, 0]} s={[1.8, 0.06, 0.8]} c="#78350f" />
          <B p={[-0.85, 0.37, 0]} s={[0.08, 0.74, 0.75]} c="#5a3418" />
          <B p={[0.6, 0.37, 0]} s={[0.5, 0.74, 0.75]} c="#5a3418" />
          {[0, 1, 2].map((i) => <B key={i} p={[-0.4, 0.8 + i * 0.05, 0]} s={[0.45, 0.04, 0.32]} c={i % 2 ? '#fef3c7' : '#f8fafc'} />)}
          <B p={[0.3, 0.95, -0.2]} s={[0.4, 0.35, 0.05]} c="#111827" />
          <B p={[0, 0.5, 0.65]} s={[0.5, 0.06, 0.45]} c="#111827" />
        </group>
      );
    case 'filing':
      return (
        <group>
          <B p={[0, 0.7, 0]} s={[0.6, 1.4, 0.6]} c="#64748b" />
          {[0.35, 0.75, 1.15].map((y) => <B key={y} p={[0, y, 0.31]} s={[0.4, 0.04, 0.02]} c="#cbd5e1" />)}
        </group>
      );
    case 'cinema_seat':
      return <Seats n={3} c="#991b1b" />;
    case 'screen':
      return (
        <group>
          <B p={[0, 1.6, -0.3]} s={[5.6, 2.4, 0.08]} c="#0b0f14" />
          <B p={[0, 1.6, -0.25]} s={[5.3, 2.1, 0.02]} c="#60a5fa" e="#3b82f6" />
          <B p={[-2.9, 1.2, 0]} s={[0.2, 2.4, 0.4]} c="#7f1d1d" />
          <B p={[2.9, 1.2, 0]} s={[0.2, 2.4, 0.4]} c="#7f1d1d" />
        </group>
      );
    case 'icecream':
      return (
        <group>
          <B p={[0, 0.5, 0]} s={[1.8, 1, 0.7]} c="#fbcfe8" />
          <B p={[0, 1.05, 0]} s={[1.8, 0.1, 0.7]} c="#e0f2fe" o={0.6} />
          {[-0.55, -0.2, 0.15, 0.5].map((x, i) => <B key={x} p={[x, 0.98, 0]} s={[0.28, 0.06, 0.4]} c={['#fde68a', '#f9a8d4', '#a7f3d0', '#7c2d12'][i]} />)}
          <B p={[0, 1.9, -0.3]} s={[1.6, 0.4, 0.05]} c="#db2777" />
        </group>
      );
    case 'shop_rack':
      return (
        <group>
          <Cyl p={[-0.8, 0.8, 0]} r={0.03} h={1.6} c="#94a3b8" />
          <Cyl p={[0.8, 0.8, 0]} r={0.03} h={1.6} c="#94a3b8" />
          <B p={[0, 1.55, 0]} s={[1.7, 0.04, 0.04]} c="#94a3b8" />
          {[-0.6, -0.3, 0, 0.3, 0.6].map((x, i) => <B key={x} p={[x, 1.1, 0]} s={[0.22, 0.8, 0.4]} c={GOODS[i]} />)}
        </group>
      );
    case 'statue':
      return (
        <group>
          <B p={[0, 0.5, 0]} s={[0.6, 1, 0.6]} c="#e7e5e4" />
          <mesh position={[0, 1.35, 0]} scale={[1, 1.3, 0.9]} castShadow>
            <icosahedronGeometry args={[0.3, 1]} />
            <meshStandardMaterial color="#b45309" flatShading />
          </mesh>
        </group>
      );
    case 'gazebo':
      return (
        <group>
          <Cyl p={[0, 0.06, 0]} r={0.95} h={0.12} c="#e5e7eb" seg={8} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <B key={i} p={[Math.cos((i * Math.PI) / 3) * 0.8, 0.8, Math.sin((i * Math.PI) / 3) * 0.8]} s={[0.08, 1.4, 0.08]} c="#fafaf9" />
          ))}
          <mesh position={[0, 1.8, 0]} castShadow>
            <coneGeometry args={[1.2, 0.7, 8]} />
            <meshStandardMaterial color="#b91c1c" flatShading />
          </mesh>
        </group>
      );
    case 'picnic_mat':
      return (
        <group>
          <B p={[0, 0.012, 0]} s={[1.7, 0.02, 1.7]} c="#dc2626" />
          {[-0.6, 0, 0.6].map((x) => <B key={x} p={[x, 0.024, 0]} s={[0.2, 0.01, 1.7]} c="#fff" />)}
          <B p={[0.4, 0.12, 0.3]} s={[0.4, 0.2, 0.3]} c="#a16207" />
        </group>
      );
    case 'beanbag':
      return (
        <mesh position={[0, 0.25, 0]} scale={[1, 0.6, 1]} castShadow>
          <icosahedronGeometry args={[0.4, 1]} />
          <meshStandardMaterial color="#f97316" flatShading />
        </mesh>
      );
    case 'coffee':
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[0.8, 0.9, 0.6]} c="#e5e7eb" />
          <B p={[0, 1.15, 0]} s={[0.4, 0.5, 0.35]} c="#111827" />
          <Cyl p={[0.25, 0.98, 0.1]} r={0.06} h={0.12} c="#fff" />
        </group>
      );
    case 'blackboard':
      return (
        <group>
          <B p={[0, 1.4, -0.4]} s={[3.6, 1.4, 0.08]} c="#14532d" />
          <B p={[0, 0.72, -0.35]} s={[3.6, 0.06, 0.15]} c="#a16207" />
          <B p={[-0.6, 1.6, -0.35]} s={[1.2, 0.04, 0.01]} c="#fff" />
          <B p={[-0.4, 1.4, -0.35]} s={[1.6, 0.04, 0.01]} c="#fff" />
          <B p={[1.0, 0.4, 0.15]} s={[1, 0.8, 0.5]} c="#7c4a24" />
        </group>
      );
    case 'keke':
      return <group scale={0.85}><Keke /></group>;
    case 'corn_roaster':
      return (
        <group>
          <B p={[0, 0.4, 0]} s={[0.8, 0.08, 0.6]} c="#1f2937" />
          {legs(0.7, 0.5, 0.38, '#374151')}
          <B p={[0, 0.46, 0]} s={[0.7, 0.04, 0.5]} c="#f97316" e="#ea580c" />
          {[-0.2, 0, 0.2].map((x) => (
            <mesh key={x} position={[x, 0.53, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.35, 6]} />
              <meshStandardMaterial color="#facc15" flatShading />
            </mesh>
          ))}
        </group>
      );
    case 'stand':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <B key={i} p={[0, 0.25 + i * 0.3, 0.5 - i * 0.45]} s={[11.6, 0.5 + i * 0.6, 0.5]} c={i % 2 ? '#15803d' : '#f8fafc'} />
          ))}
          <B p={[0, 2.5, -0.3]} s={[12, 0.1, 1.6]} c="#334155" />
          {[-5.8, -2, 2, 5.8].map((x) => <B key={x} p={[x, 1.25, 0.5]} s={[0.1, 2.5, 0.1]} c="#94a3b8" />)}
        </group>
      );
    case 'goal':
      return (
        <group>
          <B p={[0, 0.6, -1.4]} s={[0.08, 1.2, 0.08]} c="#fff" />
          <B p={[0, 0.6, 1.4]} s={[0.08, 1.2, 0.08]} c="#fff" />
          <B p={[0, 1.2, 0]} s={[0.08, 0.08, 2.88]} c="#fff" />
          <B p={[-0.4, 0.6, 0]} s={[0.02, 1.2, 2.8]} c="#e5e7eb" o={0.4} />
        </group>
      );
    case 'ball':
      return (
        <mesh position={[0, 0.15, 0]} castShadow>
          <icosahedronGeometry args={[0.15, 1]} />
          <meshStandardMaterial color="#f8fafc" flatShading />
        </mesh>
      );
    case 'fabric_roll':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 0.2 + i * 0.32, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.85, 10]} />
              <meshStandardMaterial color={GOODS[i * 2]} />
            </mesh>
          ))}
        </group>
      );
    case 'rail':
      return (
        <group>
          {[-1.8, -0.6, 0.6, 1.8].map((x) => <B key={x} p={[x, 0.4, 0]} s={[0.08, 0.8, 0.08]} c="#fff" />)}
          <B p={[0, 0.7, 0]} s={[3.8, 0.06, 0.06]} c="#fff" />
          <B p={[0, 0.4, 0]} s={[3.8, 0.06, 0.06]} c="#fff" />
        </group>
      );
    case 'cadets':
      return (
        <group>
          {[-0.4, 0.4].map((z) =>
            [-1, -0.33, 0.33, 1].map((x) => (
              <group key={`${x}${z}`} position={[x, 0, z]}>
                <B p={[0, 0.45, 0]} s={[0.26, 0.9, 0.2]} c="#4d5d3a" />
                <B p={[0, 1.0, 0]} s={[0.2, 0.2, 0.2]} c="#7c4a24" />
                <B p={[0, 1.13, 0]} s={[0.24, 0.07, 0.24]} c="#7f1d1d" />
              </group>
            )),
          )}
        </group>
      );
    case 'pool_edge':
      return (
        <group>
          <B p={[0, 0.02, 0]} s={[0.9, 0.04, 0.9]} c="#e7e5e4" />
          <B p={[0, 0.4, -0.4]} s={[0.05, 0.8, 0.05]} c="#cbd5e1" />
          <B p={[0.25, 0.4, -0.4]} s={[0.05, 0.8, 0.05]} c="#cbd5e1" />
        </group>
      );
    case 'sun_lounger':
      return (
        <group>
          <B p={[0, 0.3, 0.2]} s={[0.6, 0.08, 1.2]} c="#f8fafc" />
          <group position={[0, 0.35, -0.45]} rotation={[0.6, 0, 0]}>
            <B p={[0, 0.25, 0]} s={[0.6, 0.5, 0.08]} c="#f8fafc" />
          </group>
          <B p={[0, 0.15, 0.2]} s={[0.55, 0.3, 1.1]} c="#94a3b8" />
          <B p={[0, 0.36, 0.2]} s={[0.55, 0.04, 1.0]} c="#38bdf8" />
        </group>
      );
    case 'archive_shelf':
      return (
        <group>
          <B p={[0, 1.0, -0.15]} s={[1.9, 2, 0.45]} c="#6b4426" />
          {[0.4, 0.95, 1.5].map((y, r) =>
            [-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
              <B key={`${r}${i}`} p={[x, y + 0.15, -0.05]} s={[0.28, 0.3, 0.3]} c={['#fef3c7', '#e7d3b1', '#d6c4a1', '#f5f5f4', '#c2a878'][(i + r) % 5]} />
            )),
          )}
        </group>
      );
    case 'reading_table':
      return (
        <group>
          <B p={[0, 0.74, 0]} s={[1.8, 0.06, 0.8]} c="#5a3418" />
          {legs(1.75, 0.75, 0.72, '#3f2410')}
          <B p={[-0.4, 0.8, 0]} s={[0.4, 0.04, 0.3]} c="#fef3c7" />
          <B p={[0.4, 0.82, 0.05]} s={[0.35, 0.06, 0.28]} c="#7f1d1d" />
          <Cyl p={[0.75, 0.95, -0.25]} r={0.06} h={0.3} c="#a16207" e="#facc15" />
        </group>
      );
    case 'prison_mat':
      return (
        <group>
          <B p={[0, 0.06, 0]} s={[0.85, 0.12, 1.8]} c="#a8a29e" />
          <B p={[0, 0.14, -0.7]} s={[0.6, 0.06, 0.3]} c="#d6d3d1" />
        </group>
      );
    case 'cell_door':
      // Bars across the doorway gap in the front wall, half a tile forward of the cell.
      return (
        <group position={[0, 0, 0.5]}>
          <B p={[0, 2.3, 0]} s={[1.1, 0.08, 0.08]} c="#334155" />
          <B p={[0, 1.2, 0]} s={[1.1, 0.06, 0.06]} c="#334155" />
          {[-0.45, -0.27, -0.09, 0.09, 0.27, 0.45].map((x) => <B key={x} p={[x, 1.17, 0]} s={[0.05, 2.34, 0.05]} c="#475569" />)}
          <B p={[0.38, 1.05, 0.06]} s={[0.12, 0.18, 0.06]} c="#ca8a04" />
        </group>
      );
    case 'bamboo_gate':
      // Crossed logs across the gap, tied with rope.
      return (
        <group position={[0, 0, 0.5]}>
          <B p={[-0.3, 0.8, 0]} s={[0.1, 1.6, 0.1]} c="#78350f" />
          <B p={[0.3, 0.8, 0]} s={[0.1, 1.6, 0.1]} c="#78350f" />
          <B p={[0, 0.55, 0]} s={[1.1, 0.09, 0.09]} c="#92400e" />
          <B p={[0, 1.15, 0]} s={[1.1, 0.09, 0.09]} c="#92400e" />
          <B p={[0, 0.55, 0.06]} s={[0.12, 0.14, 0.04]} c="#d6c39a" />
        </group>
      );
    case 'dj_booth':
      return (
        <group>
          {/* Main DJ Desk Console */}
          <B p={[0, 0.45, 0]} s={[2.8, 0.9, 1.2]} c="#0f172a" />
          <B p={[0, 0.45, 0.61]} s={[2.6, 0.06, 0.02]} c="#06b6d4" e="#06b6d4" />
          <B p={[0, 0.25, 0.61]} s={[2.4, 0.04, 0.02]} c="#ec4899" e="#ec4899" />
          <B p={[0, 0.92, 0]} s={[2.84, 0.06, 1.24]} c="#1e293b" />
          {/* Twin CDJ / Turntable Decks */}
          <B p={[-0.75, 0.96, 0]} s={[0.7, 0.04, 0.7]} c="#09090b" />
          <Cyl p={[-0.75, 0.99, 0]} r={0.28} h={0.03} c="#18181b" />
          <Cyl p={[-0.75, 1.01, 0]} r={0.08} h={0.02} c="#06b6d4" e="#06b6d4" />
          <B p={[0.75, 0.96, 0]} s={[0.7, 0.04, 0.7]} c="#09090b" />
          <Cyl p={[0.75, 0.99, 0]} r={0.28} h={0.03} c="#18181b" />
          <Cyl p={[0.75, 1.01, 0]} r={0.08} h={0.02} c="#ec4899" e="#ec4899" />
          {/* Central DJ Mixer */}
          <B p={[0, 0.97, 0]} s={[0.55, 0.06, 0.65]} c="#27272a" />
          {[-0.15, -0.05, 0.05, 0.15].map((x) => (
            <B key={x} p={[x, 1.01, 0.1]} s={[0.03, 0.03, 0.18]} c="#3f3f46" />
          ))}
          {/* Laptop Stand & Screen */}
          <B p={[-0.2, 1.15, -0.35]} s={[0.04, 0.4, 0.04]} c="#71717a" />
          <group position={[-0.2, 1.35, -0.35]} rotation={[-0.3, 0.1, 0]}>
            <B p={[0, 0, 0]} s={[0.42, 0.02, 0.3]} c="#d4d4d8" />
            <B p={[0, 0.15, -0.15]} s={[0.42, 0.28, 0.02]} c="#18181b" />
            <B p={[0, 0.15, -0.14]} s={[0.38, 0.24, 0.01]} c="#38bdf8" e="#38bdf8" />
          </group>
          {/* DJ Monitor Speakers */}
          <group position={[-1.25, 0.95, -0.2]}>
            <B p={[0, 0.3, 0]} s={[0.28, 0.5, 0.28]} c="#18181b" />
            <Cyl p={[0, 0.42, 0.15]} r={0.08} h={0.02} c="#f59e0b" e="#f59e0b" />
            <Cyl p={[0, 0.22, 0.15]} r={0.11} h={0.02} c="#3f3f46" />
          </group>
          <group position={[1.25, 0.95, -0.2]}>
            <B p={[0, 0.3, 0]} s={[0.28, 0.5, 0.28]} c="#18181b" />
            <Cyl p={[0, 0.42, 0.15]} r={0.08} h={0.02} c="#f59e0b" e="#f59e0b" />
            <Cyl p={[0, 0.22, 0.15]} r={0.11} h={0.02} c="#3f3f46" />
          </group>
          {/* Overhead DJ Truss & Spotlights */}
          <B p={[-1.3, 1.5, -0.5]} s={[0.08, 3.0, 0.08]} c="#475569" />
          <B p={[1.3, 1.5, -0.5]} s={[0.08, 3.0, 0.08]} c="#475569" />
          <B p={[0, 2.95, -0.5]} s={[2.7, 0.08, 0.08]} c="#64748b" />
          {[-0.9, -0.3, 0.3, 0.9].map((x, i) => (
            <group key={x} position={[x, 2.85, -0.5]} rotation={[0.4, 0, 0]}>
              <Cyl p={[0, 0, 0]} r={0.08} h={0.16} c="#0f172a" />
              <Cyl p={[0, -0.09, 0]} r={0.07} h={0.02} c={['#ec4899', '#8b5cf6', '#06b6d4', '#10b981'][i]} e={['#ec4899', '#8b5cf6', '#06b6d4', '#10b981'][i]} />
            </group>
          ))}
        </group>
      );
    case 'dance_floor': {
      const cols = ['#ec4899', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6'];
      return (
        <group>
          <B p={[0, 0.015, 0]} s={[5.9, 0.03, 4.9]} c="#09090b" />
          {[-2.2, -1.1, 0, 1.1, 2.2].map((x, xi) =>
            [-1.6, -0.55, 0.55, 1.6].map((z, zi) => {
              const color = cols[(xi + zi * 2) % cols.length];
              return (
                <group key={`${x},${z}`}>
                  <B p={[x, 0.03, z]} s={[1.0, 0.02, 1.0]} c={color} e={color} />
                  <B p={[x, 0.035, z]} s={[1.04, 0.01, 1.04]} c="#1e293b" o={0.3} />
                </group>
              );
            }),
          )}
          {/* Suspended Mirror Disco Ball */}
          <group position={[0, 3.2, 0]}>
            <B p={[0, 0.4, 0]} s={[0.02, 0.8, 0.02]} c="#94a3b8" />
            <mesh position={[0, 0, 0]} castShadow>
              <sphereGeometry args={[0.35, 16, 12]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.1} metalness={0.95} />
            </mesh>
            {[-0.2, 0.2].map((x) =>
              [-0.2, 0.2].map((z) => (
                <mesh key={`${x},${z}`} position={[x, -0.1, z]}>
                  <boxGeometry args={[0.04, 0.04, 0.04]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              )),
            )}
          </group>
        </group>
      );
    }
    case 'vip_booth':
      return (
        <group>
          {/* Plush Royal Velvet U-Booth Base */}
          <B p={[0, 0.22, -0.2]} s={[2.7, 0.44, 1.3]} c="#3b0764" />
          <B p={[0, 0.44, -0.1]} s={[2.6, 0.12, 0.9]} c="#581c87" />
          <B p={[0, 0.85, -0.75]} s={[2.7, 0.9, 0.24]} c="#3b0764" />
          <B p={[0, 1.32, -0.75]} s={[2.72, 0.06, 0.26]} c="#eab308" e="#ca8a04" />
          <B p={[-1.25, 0.65, -0.15]} s={[0.24, 0.55, 1.0]} c="#3b0764" />
          <B p={[-1.25, 0.94, -0.15]} s={[0.26, 0.05, 1.02]} c="#eab308" />
          <B p={[1.25, 0.65, -0.15]} s={[0.24, 0.55, 1.0]} c="#3b0764" />
          <B p={[1.25, 0.94, -0.15]} s={[0.26, 0.05, 1.02]} c="#eab308" />
          {/* Low VIP Table with gold pedestal */}
          <Cyl p={[0, 0.2, 0.45]} r={0.12} h={0.4} c="#ca8a04" />
          <B p={[0, 0.42, 0.45]} s={[1.4, 0.05, 0.65]} c="#020617" />
          <B p={[0, 0.44, 0.45]} s={[1.36, 0.02, 0.61]} c="#38bdf8" o={0.6} />
          {/* Champagne Ice Bucket on Table */}
          <Cyl p={[0, 0.55, 0.45]} r={0.16} rt={0.2} h={0.22} c="#e2e8f0" />
          <group position={[-0.05, 0.65, 0.43]} rotation={[0.15, 0.1, -0.1]}>
            <Cyl p={[0, 0, 0]} r={0.045} h={0.24} c="#14532d" />
            <Cyl p={[0, 0.16, 0]} r={0.02} h={0.12} c="#eab308" e="#facc15" />
          </group>
          <group position={[0.06, 0.66, 0.46]} rotation={[-0.1, 0.2, 0.15]}>
            <Cyl p={[0, 0, 0]} r={0.045} h={0.24} c="#14532d" />
            <Cyl p={[0, 0.16, 0]} r={0.02} h={0.12} c="#eab308" e="#facc15" />
            <mesh position={[0, 0.25, 0]}>
              <octahedronGeometry args={[0.04, 0]} />
              <meshBasicMaterial color="#fef08a" />
            </mesh>
          </group>
        </group>
      );
    case 'club_bar':
      return (
        <group>
          {/* Main Onyx / Marble Bar Counter */}
          <B p={[0, 0.5, 0]} s={[3.8, 1.0, 0.9]} c="#0f172a" />
          <B p={[0, 0.98, 0.46]} s={[3.76, 0.05, 0.04]} c="#06b6d4" e="#06b6d4" />
          <B p={[0, 0.05, 0.46]} s={[3.76, 0.05, 0.04]} c="#ec4899" e="#ec4899" />
          <B p={[0, 1.03, 0]} s={[3.9, 0.08, 1.0]} c="#020617" />
          {/* Backbar mirrored wall & illuminated bottle shelf */}
          <group position={[0, 0, -0.6]}>
            <B p={[0, 1.3, 0]} s={[3.8, 2.4, 0.2]} c="#1e1b4b" />
            <B p={[0, 1.4, 0.11]} s={[3.6, 2.1, 0.02]} c="#38bdf8" o={0.3} />
            {[0.7, 1.25, 1.8].map((y) => (
              <group key={y}>
                <B p={[0, y, 0.2]} s={[3.5, 0.04, 0.25]} c="#06b6d4" e="#06b6d4" o={0.7} />
                {[-1.4, -1.0, -0.6, -0.2, 0.2, 0.6, 1.0, 1.4].map((bx, bi) => (
                  <group key={bx} position={[bx, y + 0.16, 0.2]}>
                    <Cyl p={[0, 0, 0]} r={0.04} h={0.24} c={['#b45309', '#047857', '#1d4ed8', '#be185d', '#eab308'][(bi + Math.round(y * 10)) % 5]} />
                    <Cyl p={[0, 0.14, 0]} r={0.018} h={0.08} c="#ca8a04" e="#ca8a04" />
                  </group>
                ))}
              </group>
            ))}
          </group>
          {/* Front Bar items */}
          <Cyl p={[-1.2, 1.15, 0.15]} r={0.05} rt={0.06} h={0.2} c="#cbd5e1" />
          <Cyl p={[-1.4, 1.11, 0.15]} r={0.035} h={0.12} c="#67e8f9" o={0.7} />
          <Cyl p={[-1.0, 1.11, 0.15]} r={0.035} h={0.12} c="#f472b6" o={0.7} />
          <B p={[1.1, 1.11, 0.1]} s={[0.24, 0.12, 0.28]} c="#18181b" />
          <B p={[1.1, 1.2, 0.08]} s={[0.2, 0.12, 0.02]} c="#10b981" e="#10b981" />
        </group>
      );
    case 'bar_stool':
      return (
        <group>
          <Cyl p={[0, 0.02, 0]} r={0.22} h={0.04} c="#94a3b8" />
          <Cyl p={[0, 0.32, 0]} r={0.03} h={0.6} c="#cbd5e1" />
          <Cyl p={[0, 0.22, 0]} r={0.14} rt={0.14} h={0.02} c="#94a3b8" />
          <Cyl p={[0, 0.58, 0]} r={0.22} h={0.08} c="#701a75" />
          <Cyl p={[0, 0.62, 0]} r={0.2} h={0.04} c="#a21caf" />
          <group position={[0, 0.72, -0.16]}>
            <B p={[0, 0, 0]} s={[0.3, 0.14, 0.04]} c="#701a75" />
            <B p={[0, 0.08, 0]} s={[0.32, 0.03, 0.05]} c="#eab308" />
          </group>
        </group>
      );
    case 'money_pile':
      return (
        <group>
          <B p={[0, 0.4, 0]} s={[0.85, 0.8, 0.85]} c="#0f172a" />
          <B p={[0, 0.4, 0.43]} s={[0.7, 0.6, 0.02]} c="#10b981" e="#10b981" o={0.7} />
          <B p={[0, 0.82, 0]} s={[0.9, 0.05, 0.9]} c="#eab308" e="#ca8a04" />
          {[-0.2, 0.2].map((x) =>
            [-0.2, 0.2].map((z) => (
              <group key={`${x},${z}`} position={[x, 0.85, z]}>
                {[0, 0.04, 0.08, 0.12].map((y) => (
                  <group key={y} position={[0, y, 0]}>
                    <B p={[0, 0.02, 0]} s={[0.34, 0.035, 0.18]} c="#059669" />
                    <B p={[0, 0.022, 0]} s={[0.08, 0.038, 0.185]} c="#f8fafc" />
                  </group>
                ))}
              </group>
            )),
          )}
          <group position={[0, 1.05, 0]} rotation={[0, 0.4, 0]}>
            <B p={[0, 0.05, 0]} s={[0.14, 0.1, 0.26]} c="#dc2626" />
            <B p={[0, -0.05, 0.06]} s={[0.08, 0.12, 0.08]} c="#b91c1c" />
            <B p={[0, 0.12, -0.02]} s={[0.12, 0.06, 0.16]} c="#eab308" e="#facc15" />
            <B p={[0, 0.06, -0.135]} s={[0.11, 0.02, 0.01]} c="#10b981" e="#10b981" />
          </group>
        </group>
      );
    // Hotel (game/hotel.ts)
    case 'reception':
      return (
        <group>
          <B p={[0, 0.5, 0]} s={[3.8, 1, 0.7]} c="#4a2c17" />
          <B p={[0, 0.5, 0.36]} s={[3.5, 0.7, 0.02]} c="#6b3f1d" />
          <B p={[0, 0.2, 0.37]} s={[3.8, 0.06, 0.02]} c="#eab308" e="#a16207" />
          <B p={[0, 1.03, 0]} s={[3.95, 0.06, 0.82]} c="#f5f5f4" />
          <Cyl p={[-0.9, 1.1, 0.15]} r={0.09} rt={0.02} h={0.1} c="#facc15" e="#a16207" />
          <B p={[0.9, 1.22, -0.1]} s={[0.5, 0.32, 0.04]} c="#0f172a" />
          <B p={[0.9, 1.08, -0.1]} s={[0.1, 0.06, 0.1]} c="#334155" />
          <B p={[-1.6, 1.16, 0]} s={[0.24, 0.2, 0.24]} c="#15803d" />
          {/* Key rack on the counter's end */}
          <B p={[1.65, 1.3, -0.2]} s={[0.36, 0.5, 0.08]} c="#3b2412" />
          {[-0.09, 0.09].map((x) => [1.2, 1.4].map((y) => <B key={`${x},${y}`} p={[1.65 + x, y, -0.15]} s={[0.05, 0.12, 0.02]} c="#facc15" />))}
        </group>
      );
    case 'hotel_lift':
      return (
        <group position={[0, 0, -0.18]}>
          <B p={[0, 1.2, -0.1]} s={[1.9, 2.4, 0.4]} c="#57534e" />
          <B p={[-0.43, 1.05, 0.11]} s={[0.82, 2.05, 0.04]} c="#d6b25e" />
          <B p={[0.43, 1.05, 0.11]} s={[0.82, 2.05, 0.04]} c="#c9a54f" />
          <B p={[0, 1.05, 0.135]} s={[0.03, 2.05, 0.01]} c="#44403c" />
          <B p={[0, 2.25, 0.11]} s={[0.6, 0.18, 0.04]} c="#0f172a" />
          <B p={[0, 2.25, 0.135]} s={[0.28, 0.09, 0.01]} c="#f59e0b" e="#f59e0b" />
          <B p={[1.05, 1.15, 0.12]} s={[0.12, 0.26, 0.03]} c="#e7e5e4" />
          <B p={[1.05, 1.2, 0.14]} s={[0.05, 0.05, 0.01]} c="#22c55e" e="#22c55e" />
        </group>
      );
    case 'luggage_cart':
      return (
        <group>
          <B p={[0, 0.18, 0]} s={[0.8, 0.06, 0.55]} c="#7f1d1d" />
          {[[-0.36, -0.24], [0.36, -0.24], [-0.36, 0.24], [0.36, 0.24]].map(([x, z], i) => <B key={i} p={[x, 0.95, z]} s={[0.04, 1.5, 0.04]} c="#eab308" e="#854d0e" />)}
          <B p={[0, 1.7, -0.24]} s={[0.76, 0.04, 0.04]} c="#eab308" e="#854d0e" />
          <B p={[0, 1.7, 0.24]} s={[0.76, 0.04, 0.04]} c="#eab308" e="#854d0e" />
          <B p={[-0.1, 0.42, 0]} s={[0.5, 0.4, 0.36]} c="#78350f" />
          <B p={[0.08, 0.76, 0]} s={[0.4, 0.26, 0.3]} c="#1e3a8a" />
          <B p={[0.26, 0.36, 0.02]} s={[0.16, 0.28, 0.3]} c="#0f766e" />
        </group>
      );
    case 'red_carpet':
      return (
        <group>
          <B p={[0, 0.012, 0]} s={[1.8, 0.02, 3.96]} c="#991b1b" />
          {[-0.86, 0.86].map((x) => <B key={x} p={[x, 0.016, 0]} s={[0.07, 0.022, 3.96]} c="#eab308" />)}
        </group>
      );
    case 'minibar':
      return (
        <group>
          <B p={[0, 0.42, -0.05]} s={[0.8, 0.84, 0.6]} c="#292524" />
          <B p={[0, 0.42, 0.26]} s={[0.64, 0.66, 0.02]} c="#bae6fd" e="#0ea5e9" o={0.75} />
          {[-0.2, 0, 0.2].map((x, i) => <Cyl key={x} p={[x, 0.42, 0.12]} r={0.05} h={0.3} c={['#16a34a', '#f59e0b', '#dc2626'][i]} />)}
          <B p={[0, 0.86, -0.05]} s={[0.86, 0.04, 0.66]} c="#f5f5f4" />
          <Cyl p={[-0.2, 1.02, -0.05]} r={0.05} rt={0.025} h={0.3} c="#14532d" />
          <Cyl p={[0.05, 0.96, -0.05]} r={0.05} h={0.16} c="#e7e5e4" o={0.7} />
          <B p={[0.26, 0.92, 0]} s={[0.2, 0.08, 0.14]} c="#b45309" />
        </group>
      );
    case 'room_door':
      return (
        <group>
          <B p={[0, 0.012, 0]} s={[0.9, 0.02, 0.9]} c="#7f1d1d" />
          <B p={[0, 0.02, 0]} s={[0.7, 0.012, 0.7]} c="#991b1b" />
          <B p={[0, 0.03, 0.42]} s={[0.96, 0.03, 0.08]} c="#eab308" />
          <B p={[0, 0.028, -0.05]} s={[0.12, 0.01, 0.4]} c="#fde68a" />
          <mesh position={[0, 0.03, 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.2, 3]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
        </group>
      );
    // Hung on the wall at the +z edge of their cells: turn them (rot 2 on the back wall) so that edge meets the wall.
    case 'wall_window':
      return (
        <group position={[0, 0, 0.41]}>
          <B p={[0, 1.55, 0]} s={[1.7, 1.3, 0.05]} c="#f8fafc" />
          <B p={[0, 1.55, -0.03]} s={[1.5, 1.1, 0.02]} c="#7dd3fc" e="#38bdf8" />
          <B p={[0, 1.55, -0.045]} s={[0.05, 1.1, 0.02]} c="#f8fafc" />
          <B p={[0, 1.55, -0.045]} s={[1.5, 0.05, 0.02]} c="#f8fafc" />
          <B p={[0, 2.3, -0.06]} s={[2.0, 0.14, 0.12]} c="#7c2d12" />
          {[-0.86, 0.86].map((x) => <B key={x} p={[x, 1.42, -0.07]} s={[0.3, 1.7, 0.08]} c="#9f1239" />)}
          {[-0.86, 0.86].map((x) => <B key={`t${x}`} p={[x, 1.2, -0.115]} s={[0.32, 0.06, 0.02]} c="#eab308" />)}
        </group>
      );
    case 'wall_art':
      return (
        <group position={[0, 0, 0.42]}>
          <B p={[0, 1.6, 0]} s={[0.84, 0.64, 0.04]} c="#a16207" />
          <B p={[0, 1.6, -0.025]} s={[0.7, 0.5, 0.01]} c="#fde68a" />
          <B p={[0, 1.48, -0.032]} s={[0.7, 0.26, 0.01]} c="#c2410c" />
          <B p={[0.18, 1.72, -0.035]} s={[0.13, 0.13, 0.01]} c="#dc2626" />
        </group>
      );
    default:
      return <ItemModel type={type} powered />;
  }
}
