// A region's estate: rows of plots along roads, with your houses and the neighbours' at whatever
// stage each one has reached. Walk around by tapping the ground; tap a plot to see who owns it.

import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useGame } from '../game/store';
import { CAP, estateH, estateW, houseRect, PLOT, ROAD, rowsFor, sectionOf, slotOrigin, type EstateLot } from '../game/estate';
import { DESIGN_BY_ID, STAGES } from '../game/property';
import { useEstate } from '../net/estate';
import { useSession } from '../net/session';
import { Slab } from './Slab';
import { B, Tree } from './models';
import { EstateBillboards } from './Billboard';

const PAINT = ['#fde68a', '#fecaca', '#bfdbfe', '#d9f99d', '#fbcfe8', '#e9d5ff', '#fed7aa', '#f5f5f4'];
const ROOF = ['#b91c1c', '#15803d', '#1d4ed8', '#7c2d12', '#334155'];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export interface Lot extends EstateLot { key: string; owner: string; mine: boolean; building: boolean; uid: string | null }

/** Everything on the estate right now: my properties plus the neighbours the server knows about. */
export function useLots(region: string): Lot[] {
  const properties = useGame((s) => s.properties);
  const no = useGame((s) => s.estateNo);
  const neighbours = useEstate((s) => s.byRegion[region]);
  const uid = useSession((s) => s.user?.uid);
  const mine: Lot[] = properties
    .filter((p) => p.region === region && sectionOf(p.slot ?? 0) === no)
    .map((p) => ({ key: p.id, slot: p.slot ?? 0, plot: p.plot, stage: p.stage, design: p.design, owner: 'You', mine: true, building: !!p.building, uid: uid ?? null }));
  const taken = new Set(mine.map((l) => l.slot));
  const others: Lot[] = (neighbours ?? [])
    .filter((n) => n.uid !== uid && !taken.has(n.slot) && sectionOf(n.slot) === no)
    .map((n) => ({ key: n.pid, slot: n.slot, plot: n.plot, stage: n.stage, design: n.design, owner: n.owner, mine: false, building: n.building, uid: n.uid }));
  return [...mine, ...others];
}

/** Rows to draw for a region, from what the store and the network know. */
export const estateRowsNow = (_region: string) => rowsFor();

function House({ lot }: { lot: Lot }) {
  const r = houseRect(lot.slot, lot.plot);
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = r.x0 + w / 2;
  const cz = r.z0 + d / 2;
  const design = lot.design ? DESIGN_BY_ID[lot.design] : null;
  const floors = design?.floors ?? 1;
  const h = 1.5 * floors;
  const painted = lot.stage >= STAGES.length;
  const tone = hash(lot.key);
  const wall = painted ? PAINT[tone % PAINT.length] : '#a8a29e';
  const roof = painted ? ROOF[tone % ROOF.length] : '#94a3b8';
  const o = slotOrigin(lot.slot);
  return (
    <group>
      {/* Survey beacons mark bought land */}
      {[[o.x + 0.2, o.z + 0.2], [o.x + PLOT - 0.2, o.z + 0.2], [o.x + 0.2, o.z + PLOT - 0.2], [o.x + PLOT - 0.2, o.z + PLOT - 0.2]].map(([x, z]) => (
        <B key={`${x},${z}`} p={[x, 0.15, z]} s={[0.1, 0.3, 0.1]} c="#ef4444" />
      ))}
      {lot.stage >= 1 && <B p={[cx, 0.12, cz]} s={[w + 0.2, 0.24, d + 0.2]} c="#6b7280" />}
      {lot.stage >= 2 && <B p={[cx, 0.24 + h / 2, cz]} s={[w, h, d]} c={wall} />}
      {lot.stage >= 2 && floors === 2 && <B p={[cx, 0.24 + h / 2, cz + d / 2 + 0.01]} s={[w, 0.12, 0.05]} c="#78716c" />}
      {lot.stage >= 3 && (
        <mesh position={[cx, 0.24 + h + 0.45, cz]} rotation={[0, Math.PI / 4, 0]} scale={[w + 0.4, 0.9, d + 0.4]} castShadow>
          <coneGeometry args={[Math.SQRT1_2, 1, 4]} />
          <meshStandardMaterial color={roof} flatShading />
        </mesh>
      )}
      {painted && (
        <group>
          <B p={[cx, 0.74, r.z1 + 0.03]} s={[0.5, 1, 0.05]} c="#7c2d12" />
          {Array.from({ length: floors }, (_, f) =>
            [cx - w / 3, cx + w / 3].map((x) => <B key={`${f}${x}`} p={[x, 0.95 + f * 1.5, r.z1 + 0.03]} s={[0.45, 0.4, 0.05]} c="#38bdf8" />),
          )}
          <group position={[o.x + 0.6, 0, o.z + PLOT - 0.6]}>
            <Tree s={0.35} />
          </group>
        </group>
      )}
      {!painted && lot.stage >= 1 && (
        // Cement bags and a block stack on site while work goes on
        <group position={[r.x1 + 0.35, 0, r.z1 + 0.5]}>
          <B p={[0, 0.1, 0]} s={[0.4, 0.2, 0.3]} c="#e7e5e4" />
          <B p={[0, 0.28, 0]} s={[0.35, 0.16, 0.28]} c="#d6d3d1" />
          <B p={[-0.6, 0.2, 0]} s={[0.5, 0.4, 0.4]} c="#9ca3af" />
        </group>
      )}
      {lot.building &&
        [[r.x0 - 0.3, r.z1 + 0.3], [r.x1 + 0.3, r.z1 + 0.3]].map(([x, z]) => <B key={x} p={[x, (h + 0.5) / 2, z]} s={[0.08, h + 0.5, 0.08]} c="#f59e0b" />)}
    </group>
  );
}

function Label({ lot }: { lot: Lot }) {
  const o = slotOrigin(lot.slot);
  const picked = useEstate((s) => s.picked === lot.slot);
  const tall = lot.stage >= 2 ? 1.5 * (lot.design ? DESIGN_BY_ID[lot.design].floors : 1) + 1.6 : 0.8;
  return (
    <Html position={[o.x + PLOT / 2, tall, o.z + PLOT / 2]} center zIndexRange={[8, 1]} style={{ pointerEvents: 'auto' }}>
      <button
        type="button"
        className={`place-label ${picked ? 'on' : ''} ${lot.mine ? 'home' : ''}`}
        onClick={() => useEstate.setState({ picked: picked ? null : lot.slot })}
      >
        {lot.mine ? '⭐ You' : `👤 ${lot.owner}`}
      </button>
    </Html>
  );
}

export function Estate() {
  const region = useGame((s) => s.estateId);
  const lots = useLots(region ?? '');
  if (!region) return null;
  const rows = rowsFor();
  const W = estateW();
  const H = estateH(rows);
  const used = new Set(lots.map((l) => l.slot % CAP));
  const onGround = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    useEstate.setState({ picked: null });
    useGame.getState().walkTo({ x: Math.max(0, Math.min(W - 1, Math.floor(e.point.x))), z: Math.max(0, Math.min(H - 1, Math.floor(e.point.z))) });
  };
  return (
    <group>
      <Slab x0={-1} z0={-1} x1={W + 1} z1={H + 1} top="#86a94b" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0.01, H / 2]} onClick={onGround} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#8fb352" />
      </mesh>
      {Array.from({ length: rows }, (_, row) => (
        <group key={row}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0.02, row * (PLOT + ROAD) + PLOT + ROAD / 2]} receiveShadow>
            <planeGeometry args={[W, ROAD]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          {Array.from({ length: Math.floor(W / 2) }, (_, i) => (
            <B key={i} p={[i * 2 + 1, 0.03, row * (PLOT + ROAD) + PLOT + ROAD / 2]} s={[0.7, 0.01, 0.08]} c="#facc15" />
          ))}
        </group>
      ))}
      {Array.from({ length: CAP }, (_, slot) => {
        const o = slotOrigin(slot);
        const owned = used.has(slot);
        return (
          <group key={slot}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[o.x + PLOT / 2, 0.015, o.z + PLOT / 2]}
              onClick={(event) => {
                event.stopPropagation();
                useEstate.setState((s) => ({ picked: s.picked === slot ? null : slot }));
              }}
              receiveShadow
            >
              <planeGeometry args={[PLOT - 0.2, PLOT - 0.2]} />
              <meshStandardMaterial color={owned ? '#c98b5e' : '#9cbf5c'} />
            </mesh>
            {!owned && (
              <group position={[o.x + PLOT / 2, 0, o.z + PLOT - 0.6]}>
                <B p={[0, 0.3, 0]} s={[0.06, 0.6, 0.06]} c="#78716c" />
                <B p={[0, 0.65, 0]} s={[0.8, 0.35, 0.05]} c="#fef3c7" />
              </group>
            )}
          </group>
        );
      })}
      {lots.map((l) => (
        <group key={l.key}>
          <House lot={l} />
          <Label lot={l} />
        </group>
      ))}
      <EstateBillboards width={W} region={region} />
      {[0, W - 1].flatMap((x) =>
        Array.from({ length: rows }, (_, i) => (
          <group key={`${x}-${i}`} position={[x + 0.5, 0, i * (PLOT + ROAD) + 2]}>
            <Tree s={0.5} />
          </group>
        )),
      )}
    </group>
  );
}
