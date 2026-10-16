// A house drawn from above: rooms, walls and furniture footprints with their icons. Used by Cribs for tours, saved
// layouts, style pack previews and the interior designer's editor (tap a piece, tap a spot).
//
// Pieces are drawn the way game/mount.ts places them: floor pieces at their real angle, wall pieces as a strip
// against the wall they hang on, ceiling pieces as a dashed outline over the floor, and small things standing on a
// table at their own spot on its top.

import { useMemo } from 'react';
import { ITEMS } from '../game/catalog';
import { footprint } from '../game/grid';
import { WALL_FACE, centreOf, degOf, mountOf, quarterSize, type Mount, type Placed } from '../game/mount';
import { paintHex } from '../game/paint';
import type { HouseLayout } from '../game/grid';

export type PlanItem = Placed & { paint?: (string | null)[] | null };

interface Props {
  layout: HouseLayout;
  items: PlanItem[];
  /** Inside wall colour (a paint id). */
  inner?: string | null;
  selected?: string | null;
  /** Pieces drawn as new (a pack preview, or what a designer bought). */
  fresh?: Set<string>;
  /** A ghost of the piece about to go down, under the pointer cell. */
  ghost?: PlanItem | null;
  onCell?(x: number, z: number): void;
  onItem?(id: string): void;
  className?: string;
}

/** Drawing order: rugs, then furniture, things on tables, things on walls, and what hangs from the ceiling on top. */
const LAYER: Record<Mount, number> = { floor: 1, surface: 2, wall: 3, ceiling: 4 };
const layerOf = (it: PlanItem) => (mountOf(it) === 'floor' && ITEMS[it.type]?.layer === 'floor' ? 0 : LAYER[mountOf(it)]);
/** How deep a wall piece is drawn out from the wall. */
const WALL_DEPTH = 0.26;

export function FloorPlan({ layout, items, inner, selected, fresh, ghost, onCell, onItem, className }: Props) {
  const { gridW: w, gridH: h } = layout;
  const wallTint = paintHex(inner) ?? null;
  const cells = useMemo(() => {
    if (!onCell) return [];
    const out: { x: number; z: number }[] = [];
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) out.push({ x, z });
    return out;
  }, [onCell, w, h]);
  const sorted = useMemo(() => items.map((it, i) => ({ it, i })).sort((a, b) => layerOf(a.it) - layerOf(b.it)), [items]);

  const draw = (it: PlanItem, i: number, ghostly = false) => {
    const def = ITEMS[it.type];
    if (!def) return null;
    const key = it.id ?? `i${i}`;
    const tint = paintHex(it.paint?.[0] ?? null);
    const mount = mountOf(it);
    const on = !!selected && it.id === selected;
    const { cx, cz } = centreOf(it);
    const deg = degOf(it);
    // The outline in the piece's own space (front = +z), centred on (0, 0), turned and moved into place.
    let rw = def.w, rd = def.d, oz = 0, icon = Math.min(0.78, Math.min(def.w, def.d) * 0.72);
    let shape: 'rect' | 'dot' = 'rect';
    if (mount === 'wall') {
      // Its tiles sit in front of the wall: the strip hugs the wall at the back of them.
      rd = WALL_DEPTH;
      oz = -WALL_FACE + WALL_DEPTH / 2;
      icon = Math.min(0.42, def.w * 0.4);
    } else if (mount === 'surface') {
      shape = 'dot';
      icon = Math.min(0.42, (def.small ?? 0.2) * 2.2);
    } else if (mount === 'ceiling') {
      icon = Math.min(0.6, Math.min(def.w, def.d) * 0.55);
    }
    const r = Math.max(0.16, Math.min(0.32, def.small ?? 0.22));
    // The icon stays upright; it sits on the strip's middle for wall pieces.
    const a = (deg * Math.PI) / 180;
    const ix = cx - Math.sin(a) * oz * -1 * 0 + -Math.sin(a) * oz;
    const iz = cz + Math.cos(a) * oz;
    return (
      <g
        key={ghostly ? 'ghost' : key}
        className={`fp-item ${mount}${layerOf(it) === 0 ? ' floor' : ''}${on ? ' on' : ''}${fresh?.has(key) ? ' fresh' : ''}${ghostly ? ' ghost' : ''}`}
        onClick={onItem && it.id && !ghostly ? (e) => { e.stopPropagation(); onItem(it.id!); } : undefined}
      >
        {shape === 'dot'
          ? <circle cx={cx} cy={cz} r={r} style={tint ? { fill: tint } : undefined} />
          : (
            <rect
              x={-rw / 2 + 0.06} y={oz - rd / 2 + (mount === 'wall' ? 0 : 0.06)} width={rw - 0.12} height={rd - (mount === 'wall' ? 0 : 0.12)}
              rx={mount === 'wall' ? 0.06 : 0.18}
              transform={`translate(${cx} ${cz}) rotate(${deg})`}
              style={tint ? { fill: tint } : undefined}
            />
          )}
        <text x={ix} y={iz + 0.02} fontSize={icon}>{def.icon}</text>
      </g>
    );
  };
  return (
    <svg className={`fp ${className ?? ''}`} viewBox={`-0.2 -0.2 ${w + 0.4} ${h + 0.4}`} role="img" aria-label="House plan">
      <rect className="fp-yard" x={0} y={0} width={w} height={h} />
      {layout.rooms.map((r) => (
        <rect key={r.name} x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} fill={r.a} className="fp-room" />
      ))}
      <rect className="fp-house" x={0} y={0} width={layout.width} height={layout.depth} style={wallTint ? { stroke: wallTint } : undefined} />
      {layout.edges.map((e, i) => (
        <line key={i} className={e.kind === 'fence' ? 'fp-fence' : 'fp-wall'}
          x1={e.x} y1={e.z} x2={e.dir === 'h' ? e.x + 1 : e.x} y2={e.dir === 'h' ? e.z : e.z + 1} />
      ))}
      {cells.map((c) => (
        <rect key={`${c.x},${c.z}`} className="fp-cell" x={c.x} y={c.z} width={1} height={1} onClick={() => onCell!(c.x, c.z)} />
      ))}
      {sorted.map(({ it, i }) => draw(it, i))}
      {ghost && draw(ghost, -1, true)}
    </svg>
  );
}

/** Cells a piece covers, for hit tests outside the plan. */
export const planCells = (it: PlanItem) => footprint(it);
/** Tile size of a piece at a quarter turn. */
export const planSize = (it: PlanItem) => quarterSize(it.type, it.rot);
