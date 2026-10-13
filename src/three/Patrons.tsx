// Visitors filling a place's inside view so it doesn't feel empty: people sitting on its seats,
// standing at its stalls and counters, chatting in open floor space, and dancing on dance floors.
// Spots are picked from the interior's own props, so every place gets a crowd without hand-placing.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { exitCell, propCells, propsHere, propDef, propSize, propTransform, type Interior as InteriorDef } from '../game/interiors';
import { useGame } from '../game/store';
import { encodeLook, randomAppearance } from '../game/wardrobe';
import { Person, seatDrop, type Clip } from './Person';

type Mode = 'sit' | 'lie' | 'stand' | 'chat' | 'dance';

interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: Mode;
  /** Prop this person is sitting on, so they make room when you use it. */
  propId?: string;
  look: string;
}

/** Places that get a busier (or quieter) crowd than their size alone suggests. */
const CROWD: Record<string, number> = {
  club: 0.5,
  market: 1.5,
  motorpark: 1.4,
  buka: 1.4,
  suya: 1.3,
  mall: 1.3,
  stadium: 1.5,
  pitch: 1.2,
  viewing: 1.4,
  church: 1.3,
  mosque: 1.3,
  airport: 1.2,
  station: 1.2,
  prison: 0.5,
  refinery: 0.6,
  bank: 0.9,
  // A classroom's benches are for the pupils, not a crowd of grown-ups.
  school: 0.5,
};

const CLIPS: Record<Mode, Clip[]> = {
  sit: ['sit'],
  lie: ['lie'],
  stand: ['idle', 'talk', 'idle', 'wave', 'drink'],
  chat: ['talk', 'talk', 'idle', 'clap', 'drink'],
  dance: ['dance'],
};

const k = (x: number, z: number) => `${x},${z}`;

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const randomLook = () => encodeLook(randomAppearance());

export function crowdSpots(placeId: string, it: InteriorDef, taken: { x: number; z: number }[]): Spot[] {
  const busy = CROWD[placeId] ?? 1;
  const spots: Spot[] = [];
  const blocked = new Set<string>();
  for (const r of it.blocked ?? []) for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.d; z++) blocked.add(k(x, z));
  for (const prop of propsHere(it)) if (!propDef(prop.type).floor) for (const c of propCells(prop)) blocked.add(k(c.x, c.z));
  // Keep the doorway and the lane in from it clear, plus wherever staff already stand.
  const exit = exitCell(it);
  const used = new Set<string>();
  for (let z = it.h - 3; z < it.h; z++) for (let x = exit.x - 1; x <= exit.x + 1; x++) used.add(k(x, z));
  for (const t of taken) used.add(k(Math.floor(t.x), Math.floor(t.z)));
  const free = (x: number, z: number) => x >= 0 && z >= 0 && x < it.w && z < it.h && !blocked.has(k(x, z)) && !used.has(k(x, z));

  // Seats: fill most of them, leaving gaps so it looks natural.
  for (const prop of propsHere(it)) {
    const pd = propDef(prop.type);
    if (!pd.seat) continue;
    const { cx, cz, yaw } = propTransform(prop);
    const width = pd.w;
    for (let i = 0; i < width; i++) {
      if (Math.random() > Math.min(0.85, 0.55 * busy)) continue;
      const lx = width > 1 ? -(width - 1) / 2 + i : 0;
      spots.push({
        x: cx + Math.cos(yaw) * lx + Math.sin(yaw) * pd.seat.z,
        y: pd.seat.y,
        z: cz - Math.sin(yaw) * lx + Math.cos(yaw) * pd.seat.z,
        yaw,
        mode: 'sit',
        propId: prop.id,
        look: randomLook(),
      });
    }
  }

  // Beds that are only there to be looked at (a hospital ward's): someone lying in most of them. A bed you can
  // use yourself (a hotel room's, a cell's mat) is left empty.
  for (const prop of propsHere(it)) {
    const pd = propDef(prop.type);
    if (!pd.bed || prop.actions.length || Math.random() > 0.75) continue;
    const { cx, cz, yaw } = propTransform(prop);
    spots.push({ x: cx + Math.sin(yaw) * pd.bed.z, y: pd.bed.y, z: cz + Math.cos(yaw) * pd.bed.z, yaw, mode: 'lie', propId: prop.id, look: randomLook() });
  }

  // Dance floors: a packed crowd moving to the music.
  for (const prop of propsHere(it)) {
    if (prop.type !== 'dance_floor') continue;
    const cells = shuffle(propCells(prop).filter((c) => free(c.x, c.z)));
    const { cx, cz } = propTransform(prop);
    for (const c of cells.slice(0, Math.round(cells.length * 0.4 * busy))) {
      used.add(k(c.x, c.z));
      const x = c.x + 0.5 + (Math.random() - 0.5) * 0.3;
      const z = c.z + 0.5 + (Math.random() - 0.5) * 0.3;
      // Face roughly towards the middle of the floor, so it reads as a crowd.
      spots.push({ x, y: 0, z, yaw: Math.atan2(cx - x, cz - z) + (Math.random() - 0.5) * 1.2, mode: 'dance', look: randomLook() });
    }
  }

  // Customers at stalls, counters and exhibits: stand on a free cell beside the prop, facing it.
  const counters = shuffle(propsHere(it).filter((p) => (p.actions.length || propDef(p.type).counter) && !propDef(p.type).floor && !propDef(p.type).seat && !propDef(p.type).bed && p.type !== 'exit'));
  const atCounters = Math.round(counters.length * 0.7 * busy);
  for (const prop of counters.slice(0, atCounters)) {
    const { cx, cz, yaw } = propTransform(prop);
    const { w, d } = propSize(prop);
    const around: { x: number; z: number }[] = [];
    for (let x = prop.x - 1; x <= prop.x + w; x++) {
      around.push({ x, z: prop.z - 1 }, { x, z: prop.z + d });
    }
    for (let z = prop.z; z < prop.z + d; z++) around.push({ x: prop.x - 1, z }, { x: prop.x + w, z });
    // In front of it if there's room there: nobody queues behind a counter.
    const open = shuffle(around.filter((c) => free(c.x, c.z)));
    const front = open.filter((c) => (c.x + 0.5 - cx) * Math.sin(yaw) + (c.z + 0.5 - cz) * Math.cos(yaw) > Math.max(w, d) / 2 - 0.6);
    const options = front.length ? front : open;
    for (const c of options.slice(0, busy > 1.2 ? 2 : 1)) {
      used.add(k(c.x, c.z));
      const x = c.x + 0.5;
      const z = c.z + 0.5;
      spots.push({ x, y: 0, z, yaw: Math.atan2(cx - x, cz - z), mode: 'stand', look: randomLook() });
    }
  }

  // Little groups chatting in open space, scaled to the size of the place.
  const open = shuffle(
    Array.from({ length: it.w * it.h }, (_, i) => ({ x: i % it.w, z: Math.floor(i / it.w) })).filter(
      (c) => c.x > 0 && c.z > 0 && c.x < it.w - 1 && free(c.x, c.z) && free(c.x + 1, c.z),
    ),
  );
  let groups = Math.round(Math.max(1, (it.w * it.h) / 70) * busy);
  for (const c of open) {
    if (groups <= 0) break;
    if (!free(c.x, c.z) || !free(c.x + 1, c.z)) continue;
    used.add(k(c.x, c.z));
    used.add(k(c.x + 1, c.z));
    groups--;
    const z = c.z + 0.5;
    spots.push({ x: c.x + 0.35, y: 0, z, yaw: Math.PI / 2, mode: 'chat', look: randomLook() });
    spots.push({ x: c.x + 1.65, y: 0, z, yaw: -Math.PI / 2, mode: 'chat', look: randomLook() });
  }

  // Every person is a few dozen meshes; keep big venues smooth.
  return spots.slice(0, placeId === 'club' ? 10 : 28);
}

function Patron({ spot }: { spot: Spot }) {
  const group = useRef<import('three').Group>(null!);
  const clip = useRef<Clip>(spot.mode === 'sit' ? 'sit' : spot.mode === 'lie' ? 'lie' : spot.mode === 'dance' ? 'dance' : 'idle');
  const left = useRef(Math.random() * 4);
  useFrame((_, dt) => {
    // Get up and make room while you're using the seat they're on.
    const s = useGame.getState();
    if (group.current) group.current.visible = !(spot.propId && s.task?.itemId === spot.propId);
    if (spot.mode === 'sit' || spot.mode === 'lie' || spot.mode === 'dance') return;
    left.current -= dt;
    if (left.current > 0) return;
    const opts = CLIPS[spot.mode];
    clip.current = opts[Math.floor(Math.random() * opts.length)];
    left.current = clip.current === 'wave' ? 1.5 + Math.random() : 3 + Math.random() * 6;
  });
  return (
    <group ref={group} position={[spot.x, spot.y, spot.z]} rotation-y={spot.yaw}>
      {/* Lying is on the back, head towards the headboard (-z of the bed), as the player's own avatar does. */}
      <group position-y={spot.mode === 'sit' ? -seatDrop(spot.y) : spot.mode === 'lie' ? 0.1 : 0} rotation-x={spot.mode === 'lie' ? -Math.PI / 2 : 0}>
        <Person look={spot.look} clipRef={clip} />
      </group>
    </group>
  );
}

export function Patrons({ placeId, it, taken }: { placeId: string; it: InteriorDef; taken: { x: number; z: number }[] }) {
  // Picked once per visit, so walking back in shows a different crowd.
  const spots = useMemo(() => crowdSpots(placeId, it, taken), [placeId, it, taken]);
  return (
    <group>
      {spots.map((spot, i) => (
        <Patron key={i} spot={spot} />
      ))}
    </group>
  );
}
