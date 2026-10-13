// House grid, walls and pathfinding.
// Cell (x, z) covers world [x, x+1] × [z, z+1]. Walls sit on cell edges.

import { ITEMS } from './catalog';

/** Grid of the starter home (bungalow). Each design has its own size: see HouseLayout.gridW/gridH. */
export const GRID_W = 14;
export const GRID_H = 13; // rows 0-9 are the house, 10-12 the compound
/** Largest design's lot grid, for server-side bounds checks. */
export const MAX_GRID_W = 26;
export const MAX_GRID_H = 22;

export interface Cell { x: number; z: number }
/**
 * paint: palette id per colour slot (game/paint.ts); null / missing = the model's own colour.
 * broken: a spoilt appliance, useless until the repairer comes (game/breakdowns.ts).
 */
export interface PlacedItem { id: string; type: string; x: number; z: number; rot: number; paint?: (string | null)[]; stolen?: boolean; broken?: boolean }

export interface Edge { dir: 'h' | 'v'; x: number; z: number; kind: Kind; tall: boolean }

type Kind = 'wall' | 'fence';
interface Segment { dir: 'h' | 'v'; at: number; from: number; to: number; gaps?: number[]; kind: Kind; tall?: boolean }
export interface HouseRoom { name: string; x0: number; z0: number; x1: number; z1: number; a: string; b: string }
export interface HouseLayout {
  /** House footprint (tiles). */
  width: number;
  depth: number;
  /** Purchased land around the house, including side yard and compound. */
  gridW: number;
  gridH: number;
  /** Where the compound gate stands (bottom fence). */
  gate: Cell;
  entry: { side: 'south' | 'north' | 'west'; at: number };
  shell: { wall: string; trim: string; roof: string };
  edges: Edge[];
  edgeSet: Set<string>;
  rooms: HouseRoom[];
}

// House types differ by how much interior land they cover, smallest to largest. Every house is
// one storey inside; the front door is always on the south wall, facing the compound.
const layouts: Record<string, {
  width: number;
  depth: number;
  /** Purchased land around the house, including side yard and compound. */
  gridW: number;
  compoundDepth: number;
  gateX: number;
  entry: { side: 'south' | 'north' | 'west'; at: number };
  shell: HouseLayout['shell'];
  partitions: Segment[];
  rooms: HouseRoom[];
}> = {
  selfcon: {
    width: 8, depth: 6, gridW: 11, compoundDepth: 3, gateX: 5, entry: { side: 'south', at: 4 },
    shell: { wall: '#c98956', trim: '#74452f', roof: '#593d32' },
    partitions: [
      { dir: 'h', at: 3, from: 0, to: 8, gaps: [2, 6], kind: 'wall' },
      { dir: 'v', at: 5, from: 0, to: 3, kind: 'wall' },
    ],
    rooms: [
      { name: 'Bedroom', x0: 0, z0: 0, x1: 5, z1: 3, a: '#8c684e', b: '#856148' },
      { name: 'Bathroom', x0: 5, z0: 0, x1: 8, z1: 3, a: '#b8d0d2', b: '#acc6c8' },
      { name: 'Parlour & kitchenette', x0: 0, z0: 3, x1: 8, z1: 6, a: '#d9c9ad', b: '#d2c2a5' },
    ],
  },
  bungalow: {
    width: 14, depth: 10, gridW: 16, compoundDepth: 4, gateX: 11, entry: { side: 'south', at: 11 },
    shell: { wall: '#e3d4b7', trim: '#a66c46', roof: '#594c3d' },
    partitions: [
      { dir: 'v', at: 7, from: 0, to: 5, gaps: [2], kind: 'wall' },
      { dir: 'h', at: 5, from: 0, to: 14, gaps: [3, 10], kind: 'wall' },
      { dir: 'h', at: 6, from: 0, to: 14, gaps: [2, 6, 10, 13], kind: 'wall' },
      { dir: 'v', at: 4, from: 6, to: 10, gaps: [8], kind: 'wall' },
      { dir: 'v', at: 8, from: 6, to: 10, gaps: [8], kind: 'wall' },
      { dir: 'v', at: 12, from: 6, to: 10, gaps: [8], kind: 'wall' },
    ],
    rooms: [
      { name: 'Living room', x0: 0, z0: 0, x1: 7, z1: 5, a: '#ddd1bb', b: '#d5c8b0' },
      { name: 'Dining & kitchen', x0: 7, z0: 0, x1: 14, z1: 5, a: '#c9c8bd', b: '#c1c0b5' },
      { name: 'Hallway', x0: 0, z0: 5, x1: 14, z1: 6, a: '#d5ccba', b: '#cdc4b2' },
      { name: 'Bedroom 1', x0: 0, z0: 6, x1: 4, z1: 10, a: '#987456', b: '#8e6b4f' },
      { name: 'Bedroom 2', x0: 4, z0: 6, x1: 8, z1: 10, a: '#a18162', b: '#97795b' },
      { name: 'Bedroom 3', x0: 8, z0: 6, x1: 12, z1: 10, a: '#987456', b: '#8e6b4f' },
      { name: 'Bathroom', x0: 12, z0: 6, x1: 14, z1: 10, a: '#b8d0d2', b: '#acc6c8' },
    ],
  },
  duplex: {
    width: 18, depth: 12, gridW: 20, compoundDepth: 5, gateX: 14, entry: { side: 'south', at: 6 },
    shell: { wall: '#b9c3ca', trim: '#456276', roof: '#384957' },
    partitions: [
      { dir: 'v', at: 8, from: 0, to: 5, gaps: [2], kind: 'wall' },
      { dir: 'v', at: 13, from: 0, to: 5, gaps: [2], kind: 'wall' },
      { dir: 'h', at: 5, from: 0, to: 18, gaps: [3, 10, 16], kind: 'wall' },
      { dir: 'h', at: 7, from: 0, to: 18, gaps: [2, 6, 11, 16], kind: 'wall' },
      { dir: 'v', at: 4, from: 7, to: 12, gaps: [9], kind: 'wall' },
      { dir: 'v', at: 9, from: 7, to: 12, gaps: [9], kind: 'wall' },
      { dir: 'v', at: 14, from: 7, to: 12, gaps: [9], kind: 'wall' },
    ],
    rooms: [
      { name: 'Formal living room', x0: 0, z0: 0, x1: 8, z1: 5, a: '#d5d6d2', b: '#cccdca' },
      { name: 'Dining room', x0: 8, z0: 0, x1: 13, z1: 5, a: '#d4cbb8', b: '#ccc2ae' },
      { name: 'Kitchen', x0: 13, z0: 0, x1: 18, z1: 5, a: '#bfc7c5', b: '#b6bfbd' },
      { name: 'Hallway', x0: 0, z0: 5, x1: 18, z1: 7, a: '#a9b3b4', b: '#9eaaab' },
      { name: 'Bedroom 1', x0: 0, z0: 7, x1: 4, z1: 12, a: '#827364', b: '#78695b' },
      { name: 'Bedroom 2', x0: 4, z0: 7, x1: 9, z1: 12, a: '#918777', b: '#877d6e' },
      { name: 'Bedroom 3', x0: 9, z0: 7, x1: 14, z1: 12, a: '#827364', b: '#78695b' },
      { name: 'Bedroom 4', x0: 14, z0: 7, x1: 18, z1: 12, a: '#918777', b: '#877d6e' },
    ],
  },
  flats: {
    width: 22, depth: 14, gridW: 24, compoundDepth: 5, gateX: 11, entry: { side: 'south', at: 11 },
    shell: { wall: '#d0d3d1', trim: '#52798a', roof: '#52606a' },
    partitions: [
      { dir: 'v', at: 10, from: 0, to: 14, gaps: [2, 7, 12], kind: 'wall' },
      { dir: 'v', at: 12, from: 0, to: 14, gaps: [2, 7, 12], kind: 'wall' },
      ...[0, 5, 10].flatMap((z) => [
        { dir: 'v' as const, at: 6, from: z, to: z + (z === 10 ? 4 : 5), gaps: [z + 2], kind: 'wall' as const },
        { dir: 'h' as const, at: z + 3, from: 6, to: 10, kind: 'wall' as const },
        { dir: 'v' as const, at: 16, from: z, to: z + (z === 10 ? 4 : 5), gaps: [z + 2], kind: 'wall' as const },
        { dir: 'h' as const, at: z + 3, from: 12, to: 16, kind: 'wall' as const },
      ]),
    ],
    rooms: [
      ...[0, 5, 10].flatMap((z, i) => {
        const end = z + (z === 10 ? 4 : 5);
        const left = ['#d5c9b4', '#d1c7b9', '#d4cbb8'][i];
        const right = ['#c8c8bf', '#c9c1b2', '#c6c3b9'][i];
        return [
          { name: `Flat ${i * 2 + 1} · Living`, x0: 0, z0: z, x1: 6, z1: end, a: left, b: '#cdc1ac' },
          { name: `Flat ${i * 2 + 1} · Bedroom`, x0: 6, z0: z, x1: 10, z1: z + 3, a: '#987456', b: '#8e6b4f' },
          { name: `Flat ${i * 2 + 1} · Bathroom`, x0: 6, z0: z + 3, x1: 10, z1: end, a: '#b8d0d2', b: '#acc6c8' },
          { name: `Flat ${i * 2 + 2} · Bedroom`, x0: 12, z0: z, x1: 16, z1: z + 3, a: '#a18162', b: '#97795b' },
          { name: `Flat ${i * 2 + 2} · Bathroom`, x0: 12, z0: z + 3, x1: 16, z1: end, a: '#b8d0d2', b: '#acc6c8' },
          { name: `Flat ${i * 2 + 2} · Living`, x0: 16, z0: z, x1: 22, z1: end, a: right, b: '#c0c0b7' },
        ];
      }),
      { name: 'Shared corridor', x0: 10, z0: 0, x1: 12, z1: 14, a: '#aab8bb', b: '#a1afb2' },
    ],
  },
  mansion: {
    width: 22, depth: 16, gridW: 26, compoundDepth: 6, gateX: 11, entry: { side: 'south', at: 11 },
    shell: { wall: '#e9dfca', trim: '#a16207', roof: '#334155' },
    partitions: [
      { dir: 'v', at: 8, from: 0, to: 5, gaps: [2], kind: 'wall' },
      { dir: 'v', at: 15, from: 0, to: 5, gaps: [2], kind: 'wall' },
      { dir: 'h', at: 5, from: 0, to: 22, gaps: [4, 11, 18], kind: 'wall' },
      { dir: 'h', at: 7, from: 0, to: 22, gaps: [2, 7, 12, 17, 20], kind: 'wall' },
      { dir: 'h', at: 11, from: 0, to: 22, gaps: [2, 7, 12, 17, 20], kind: 'wall' },
      { dir: 'v', at: 5, from: 7, to: 11, gaps: [9], kind: 'wall' },
      { dir: 'v', at: 10, from: 7, to: 11, gaps: [9], kind: 'wall' },
      { dir: 'v', at: 14, from: 7, to: 11, gaps: [9], kind: 'wall' },
      { dir: 'v', at: 18, from: 7, to: 11, gaps: [9], kind: 'wall' },
      { dir: 'v', at: 10, from: 11, to: 16, gaps: [13], kind: 'wall' },
      { dir: 'v', at: 14, from: 11, to: 16, gaps: [13], kind: 'wall' },
    ],
    rooms: [
      { name: 'Grand living room', x0: 0, z0: 0, x1: 8, z1: 5, a: '#ddd1bb', b: '#d5c8b0' },
      { name: 'Dining room', x0: 8, z0: 0, x1: 15, z1: 5, a: '#d4cbb8', b: '#ccc2ae' },
      { name: 'Kitchen', x0: 15, z0: 0, x1: 22, z1: 5, a: '#c9c8bd', b: '#c1c0b5' },
      { name: 'Main hallway', x0: 0, z0: 5, x1: 22, z1: 7, a: '#d5ccba', b: '#cdc4b2' },
      { name: 'Bedroom 1', x0: 0, z0: 7, x1: 5, z1: 11, a: '#987456', b: '#8e6b4f' },
      { name: 'Bedroom 2', x0: 5, z0: 7, x1: 10, z1: 11, a: '#a18162', b: '#97795b' },
      { name: 'Bathroom 1', x0: 10, z0: 7, x1: 14, z1: 11, a: '#b8d0d2', b: '#acc6c8' },
      { name: 'Bedroom 3', x0: 14, z0: 7, x1: 18, z1: 11, a: '#987456', b: '#8e6b4f' },
      { name: 'Bedroom 4', x0: 18, z0: 7, x1: 22, z1: 11, a: '#a18162', b: '#97795b' },
      { name: 'Main suite', x0: 0, z0: 11, x1: 10, z1: 16, a: '#987456', b: '#8e6b4f' },
      { name: 'Bathroom 2', x0: 10, z0: 11, x1: 14, z1: 16, a: '#b8d0d2', b: '#acc6c8' },
      { name: 'Family lounge', x0: 14, z0: 11, x1: 22, z1: 16, a: '#d5d6d2', b: '#cccdca' },
    ],
  },
};

function buildLayout(plan: (typeof layouts)[string]): HouseLayout {
  const gridW = plan.gridW;
  const gridH = plan.depth + plan.compoundDepth;
  const segments: Segment[] = [
    { dir: 'h', at: 0, from: 0, to: plan.width, gaps: plan.entry.side === 'north' ? [plan.entry.at] : [], kind: 'wall', tall: true },
    { dir: 'v', at: 0, from: 0, to: plan.depth, gaps: plan.entry.side === 'west' ? [plan.entry.at] : [], kind: 'wall', tall: true },
    { dir: 'v', at: plan.width, from: 0, to: plan.depth, kind: 'wall', tall: true },
    { dir: 'h', at: plan.depth, from: 0, to: plan.width, gaps: plan.entry.side === 'south' ? [plan.entry.at] : [], kind: 'wall', tall: true },
    ...plan.partitions,
    { dir: 'v', at: 0, from: plan.depth, to: gridH, kind: 'fence' },
    { dir: 'v', at: gridW, from: plan.width < gridW ? 0 : plan.depth, to: gridH, kind: 'fence' },
    ...(plan.width < gridW ? [{ dir: 'h' as const, at: 0, from: plan.width, to: gridW, kind: 'fence' as const }] : []),
    { dir: 'h', at: gridH, from: 0, to: gridW, gaps: [plan.gateX], kind: 'fence' },
  ];
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();
  for (const segment of segments) {
    for (let i = segment.from; i < segment.to; i++) {
      if (segment.gaps?.includes(i)) continue;
      const x = segment.dir === 'h' ? i : segment.at;
      const z = segment.dir === 'h' ? segment.at : i;
      edges.push({ dir: segment.dir, x, z, kind: segment.kind, tall: !!segment.tall });
      edgeSet.add(`${segment.dir}:${x}:${z}`);
    }
  }
  const rooms = [
    ...plan.rooms,
    ...(plan.width < gridW ? [{ name: 'Side yard', x0: plan.width, z0: 0, x1: gridW, z1: plan.depth, a: '#c98b5e', b: '#bf8155' }] : []),
    { name: 'Compound', x0: 0, z0: plan.depth, x1: gridW, z1: gridH, a: '#bd9368', b: '#b58a60' },
  ];
  return {
    width: plan.width, depth: plan.depth, gridW, gridH, gate: { x: plan.gateX, z: gridH - 1 },
    entry: plan.entry, shell: plan.shell, edges, edgeSet, rooms,
  };
}

export const HOUSE_LAYOUTS: Record<string, HouseLayout> = Object.fromEntries(Object.entries(layouts).map(([id, plan]) => [id, buildLayout(plan)]));
export const houseLayoutForDesign = (design?: string | null) => HOUSE_LAYOUTS[design ?? ''] ?? HOUSE_LAYOUTS.bungalow;
const DEFAULT_LAYOUT = HOUSE_LAYOUTS.bungalow;

// ── Wall editing ─────────────────────────────────────────────
// Players can build or knock down the short interior walls. Edits are stored per house as a
// list of edge keys ("h:x:z" / "v:x:z") that flip the design's own wall on that edge.

export type WallEdge = { dir: 'h' | 'v'; x: number; z: number };
export const edgeKey = (e: WallEdge) => `${e.dir}:${e.x}:${e.z}`;
export const WALL_BUILD_COST = 25_000;
export const WALL_KNOCK_COST = 8_000;

export function parseEdgeKey(k: string): WallEdge | null {
  const m = /^([hv]):(\d+):(\d+)$/.exec(k);
  return m ? { dir: m[1] as 'h' | 'v', x: +m[2], z: +m[3] } : null;
}

/** Interior edges only: the outer shell, compound fence and porch stay as designed. */
export function isEditableEdge(layout: HouseLayout, e: WallEdge) {
  if (e.dir === 'h') return e.x >= 0 && e.x < layout.width && e.z >= 1 && e.z <= layout.depth - 1;
  return e.x >= 1 && e.x <= layout.width - 1 && e.z >= 0 && e.z < layout.depth;
}

/** The two cells either side of an edge. */
export function edgeCells(e: WallEdge): [Cell, Cell] {
  return e.dir === 'h' ? [{ x: e.x, z: e.z - 1 }, { x: e.x, z: e.z }] : [{ x: e.x - 1, z: e.z }, { x: e.x, z: e.z }];
}

const editedCache = new Map<string, HouseLayout>();

/** A design's layout with the player's wall edits applied. */
export function houseLayout(design?: string | null, edits?: string[] | null): HouseLayout {
  const base = houseLayoutForDesign(design);
  if (!edits?.length) return base;
  const id = `${design ?? ''}|${[...edits].sort().join(',')}`;
  const hit = editedCache.get(id);
  if (hit) return hit;
  const flip = new Set(edits.filter((k) => {
    const e = parseEdgeKey(k);
    return !!e && isEditableEdge(base, e);
  }));
  const edges = base.edges.filter((e) => !flip.has(edgeKey(e)));
  for (const k of flip) {
    if (base.edgeSet.has(k)) continue;
    const e = parseEdgeKey(k)!;
    edges.push({ ...e, kind: 'wall', tall: false });
  }
  const layout: HouseLayout = { ...base, edges, edgeSet: new Set(edges.map(edgeKey)) };
  if (editedCache.size > 64) editedCache.clear();
  editedCache.set(id, layout);
  return layout;
}

/** Why a wall can't go on this edge, or null. Knocking down is always allowed. */
export function wallBuildError(layout: HouseLayout, e: WallEdge, items: PlacedItem[], from: Cell): string | null {
  if (!isEditableEdge(layout, e)) return 'Only inside walls can be changed';
  if (layout.edgeSet.has(edgeKey(e))) return null;
  const [a, b] = edgeCells(e);
  const ka = key(a), kb = key(b);
  for (const it of items) {
    const cells = new Set(footprint(it).map(key));
    if (cells.has(ka) && cells.has(kb)) return `Your ${ITEMS[it.type]?.name ?? 'furniture'} is in the way`;
  }
  const edgeSet = new Set(layout.edgeSet).add(edgeKey(e));
  const next: HouseLayout = { ...layout, edgeSet };
  const gate = items.find((i) => i.type === 'gate');
  if (gate && !pathToCell(from, { x: gate.x, z: gate.z }, items, next)) return 'That would trap you inside';
  for (const it of items) {
    if (!ITEMS[it.type]?.actions.length || it.type === 'gate') continue;
    if (!pathToItem(from, it, items, next)) return `You couldn't reach your ${ITEMS[it.type].name}`;
  }
  return null;
}
export const EDGES = DEFAULT_LAYOUT.edges;
export const ROOMS = DEFAULT_LAYOUT.rooms;

export const key = (c: Cell) => `${c.x},${c.z}`;
export const inGrid = (c: Cell, layout = DEFAULT_LAYOUT) => c.x >= 0 && c.z >= 0 && c.x < layout.gridW && c.z < layout.gridH;

export function wallBetween(a: Cell, b: Cell, layout = DEFAULT_LAYOUT): boolean {
  if (b.x === a.x + 1 && b.z === a.z) return layout.edgeSet.has(`v:${a.x + 1}:${a.z}`);
  if (b.x === a.x - 1 && b.z === a.z) return layout.edgeSet.has(`v:${a.x}:${a.z}`);
  if (b.z === a.z + 1 && b.x === a.x) return layout.edgeSet.has(`h:${a.x}:${a.z + 1}`);
  if (b.z === a.z - 1 && b.x === a.x) return layout.edgeSet.has(`h:${a.x}:${a.z}`);
  return true;
}

export function itemSize(type: string, rot: number) {
  const def = ITEMS[type];
  return rot % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

export function footprint(item: { type: string; x: number; z: number; rot: number }): Cell[] {
  const { w, d } = itemSize(item.type, item.rot);
  const cells: Cell[] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) cells.push({ x: item.x + i, z: item.z + j });
  return cells;
}

/** World-space centre and yaw of an item. Front of the model faces local +z. */
export function itemTransform(item: PlacedItem) {
  const { w, d } = itemSize(item.type, item.rot);
  return { cx: item.x + w / 2, cz: item.z + d / 2, yaw: -item.rot * (Math.PI / 2) };
}

export function blockedCells(items: PlacedItem[], ignoreId?: string): Set<string> {
  const set = new Set<string>();
  for (const it of items) {
    if (it.id === ignoreId) continue;
    const def = ITEMS[it.type];
    if (def.layer === 'floor' || def.blocks === false) continue;
    for (const c of footprint(it)) set.add(key(c));
  }
  return set;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Breadth-first search. Returns the path (excluding start) to the first goal cell, or null. */
export function bfs(start: Cell, blocked: Set<string>, isGoal: (c: Cell) => boolean, layout = DEFAULT_LAYOUT): Cell[] | null {
  if (isGoal(start)) return [];
  const prev = new Map<string, Cell | null>([[key(start), null]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dx, dz] of DIRS) {
      const n = { x: cur.x + dx, z: cur.z + dz };
      const k = key(n);
      if (!inGrid(n, layout) || prev.has(k) || blocked.has(k) || wallBetween(cur, n, layout)) continue;
      prev.set(k, cur);
      if (isGoal(n)) {
        const path: Cell[] = [n];
        let p = cur;
        while (key(p) !== key(start)) {
          path.unshift(p);
          p = prev.get(key(p))!;
        }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** Path to a spot where the avatar can use the item. */
export function pathToItem(start: Cell, item: PlacedItem, items: PlacedItem[], layout = DEFAULT_LAYOUT): Cell[] | null {
  const def = ITEMS[item.type];
  const cells = footprint(item);
  const blocked = blockedCells(items);
  if (def.layer === 'floor' || def.blocks === false) {
    const ks = new Set(cells.map(key));
    return bfs(start, blocked, (c) => ks.has(key(c)), layout);
  }
  const isGoal = (c: Cell) =>
    !blocked.has(key(c)) &&
    cells.some((f) => Math.abs(f.x - c.x) + Math.abs(f.z - c.z) === 1 && !wallBetween(f, c, layout));
  return bfs(start, blocked, isGoal, layout);
}

export function pathToCell(start: Cell, goal: Cell, items: PlacedItem[], layout = DEFAULT_LAYOUT): Cell[] | null {
  const blocked = blockedCells(items);
  if (blocked.has(key(goal))) return null;
  return bfs(start, blocked, (c) => c.x === goal.x && c.z === goal.z, layout);
}

/** Can this item go here? Returns an error message or null. */
export function placementError(
  cand: { type: string; x: number; z: number; rot: number },
  items: PlacedItem[],
  avatarCell: Cell,
  ignoreId?: string,
  layout = DEFAULT_LAYOUT,
): string | null {
  const def = ITEMS[cand.type];
  const cells = footprint(cand);
  if (!cells.every((c) => inGrid(c, layout))) return 'Out of bounds';
  const houseCells = cells.map((c) => c.x < layout.width && c.z < layout.depth);
  if (houseCells.some((inside) => inside !== houseCells[0])) return "Can't straddle the house wall";
  if (def.outdoorOnly && houseCells[0]) return 'This one goes outside, in the compound';
  for (const a of cells) for (const b of cells) {
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1 && wallBetween(a, b, layout)) return "Can't cross a wall";
  }
  const taken = new Set<string>();
  for (const it of items) {
    if (it.id === ignoreId) continue;
    const other = ITEMS[it.type];
    // Floor items can share cells with objects, but not with each other. The gate cell is reserved.
    if (other.layer === def.layer || it.type === 'gate') for (const c of footprint(it)) taken.add(key(c));
  }
  if (cells.some((c) => taken.has(key(c)))) return 'Space taken';
  if (def.layer === 'object' && def.blocks !== false) {
    if (cells.some((c) => c.x === avatarCell.x && c.z === avatarCell.z)) return 'You are standing there';
    // Don't let the player wall themselves in.
    const next = [...items.filter((i) => i.id !== ignoreId), { ...cand, id: '__cand' }];
    const gate = items.find((i) => i.type === 'gate');
    if (gate && !pathToCell(avatarCell, { x: gate.x, z: gate.z }, next, layout)) return 'That would block the way';
  }
  return null;
}

/** Where you stand on arriving home: just inside the compound gate. */
export const arrivalCell = (layout: HouseLayout): Cell => ({ x: layout.gate.x, z: layout.gate.z - 1 });

/**
 * Fits furniture saved for another house size into this layout: the gate moves to this plot's
 * gate, and anything that no longer fits (off the plot, through a wall, overlapping) is boxed up.
 */
export function fitItemsToLayout(items: PlacedItem[], layout: HouseLayout): { items: PlacedItem[]; boxed: PlacedItem[] } {
  const kept: PlacedItem[] = [];
  const boxed: PlacedItem[] = [];
  const gate = items.find((i) => i.type === 'gate');
  if (gate) kept.push({ ...gate, x: layout.gate.x, z: layout.gate.z, rot: 0 });
  for (const it of items) {
    if (it.type === 'gate' || !ITEMS[it.type]) continue;
    const cells = footprint(it);
    const inside = cells.map((c) => c.x < layout.width && c.z < layout.depth);
    const crosses = cells.some((a) => cells.some((b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1 && wallBetween(a, b, layout)));
    const layer = ITEMS[it.type].layer;
    const clash = kept.some((k) => (k.type === 'gate' || ITEMS[k.type].layer === layer) &&
      footprint(k).some((kc) => cells.some((c) => c.x === kc.x && c.z === kc.z)));
    if (!cells.every((c) => inGrid(c, layout)) || inside.some((v) => v !== inside[0]) || crosses || clash) boxed.push(it);
    else kept.push(it);
  }
  return { items: kept, boxed };
}
