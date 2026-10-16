// A house drawn from above: rooms, walls and furniture footprints with their icons. Used by Cribs for tours, saved
// layouts, style pack previews and the interior designer's editor (tap a piece, tap a spot).

import { useMemo } from 'react';
import { ITEMS } from '../game/catalog';
import { footprint, itemSize, type HouseLayout } from '../game/grid';
import { paintHex } from '../game/paint';

export interface PlanItem { id?: string; type: string; x: number; z: number; rot: number; paint?: (string | null)[] | null }

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

export function FloorPlan({ layout, items, inner, selected, fresh, ghost, onCell, onItem, className }: Props) {
  const { gridW: w, gridH: h } = layout;
  const wallTint = paintHex(inner) ?? null;
  const cells = useMemo(() => {
    if (!onCell) return [];
    const out: { x: number; z: number }[] = [];
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) out.push({ x, z });
    return out;
  }, [onCell, w, h]);
  const draw = (it: PlanItem, i: number, ghostly = false) => {
    const def = ITEMS[it.type];
    if (!def) return null;
    const { w: iw, d: id } = itemSize(it.type, it.rot);
    const key = it.id ?? `i${i}`;
    const tint = paintHex(it.paint?.[0] ?? null);
    const floor = def.layer === 'floor';
    const on = !!selected && it.id === selected;
    return (
      <g
        key={ghostly ? 'ghost' : key}
        className={`fp-item${floor ? ' floor' : ''}${on ? ' on' : ''}${fresh?.has(key) ? ' fresh' : ''}${ghostly ? ' ghost' : ''}`}
        onClick={onItem && it.id && !ghostly ? (e) => { e.stopPropagation(); onItem(it.id!); } : undefined}
      >
        <rect x={it.x + 0.06} y={it.z + 0.06} width={iw - 0.12} height={id - 0.12} rx={0.18} style={tint ? { fill: tint } : undefined} />
        <text x={it.x + iw / 2} y={it.z + id / 2 + 0.02} fontSize={Math.min(0.78, Math.min(iw, id) * 0.72)}>{def.icon}</text>
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
          x1={e.dir === 'h' ? e.x : e.x} y1={e.dir === 'h' ? e.z : e.z} x2={e.dir === 'h' ? e.x + 1 : e.x} y2={e.dir === 'h' ? e.z : e.z + 1} />
      ))}
      {cells.map((c) => (
        <rect key={`${c.x},${c.z}`} className="fp-cell" x={c.x} y={c.z} width={1} height={1} onClick={() => onCell!(c.x, c.z)} />
      ))}
      {[...items].sort((a, b) => Number(ITEMS[b.type]?.layer === 'floor') - Number(ITEMS[a.type]?.layer === 'floor')).map((it, i) => draw(it, i))}
      {ghost && draw(ghost, -1, true)}
    </svg>
  );
}

/** Cells a piece covers, for hit tests outside the plan. */
export const planCells = (it: PlanItem) => footprint(it);
