// Adopted children in your house (Phone → Adopt, game/kids.ts). Each is the game's own Person, scaled down with a
// bigger head for their stage; a newborn is a swaddled bundle. Where they are follows what is going on: in the cot
// or on a bed when asleep, in your arms or at the nursery piece you are using while you care for them, lying on the
// play mat as a baby, toddling (or, older, wandering) round the room otherwise. A booked nanny stands with them.
// Cheap on phones: at most three children and one nanny, no per-frame React work (positions move in useFrame).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { ITEMS } from '../game/catalog';
import { avatar } from '../game/avatar';
import { blockedCells, houseLayout, itemTransform, key, type HouseLayout, type PlacedItem } from '../game/grid';
import { careOfAction, stageDef, stageOf, type CareId, type KidStage } from '../game/kids';
import { useGame } from '../game/store';
import { decodeLook, encodeLook, SKINS } from '../game/wardrobe';
import { careTargetOf, serverNow, useKids, type Kid } from '../net/kids';
import { Person, type Clip } from './Person';

const NANNY_LOOK = encodeLook({ body: 'f', skin: 4, hair: 'bun', hairColor: 0, outfit: { top: 'ankara_dress', head: 'hijab_cream', shoes: 'slippers_palm' } });

/** Where the top of each nursery piece is, in its own frame, and how a child rests on it. */
const REST: Record<string, { y: number; z: number; pose: 'lie' | 'sit' }> = {
  baby_cot: { y: 0.52, z: 0, pose: 'lie' },
  high_chair: { y: 0.66, z: 0, pose: 'sit' },
  baby_bath: { y: 0.86, z: 0, pose: 'lie' },
  play_mat: { y: 0.03, z: 0, pose: 'lie' },
};

type Spot = { x: number; y: number; z: number; yaw: number; pose: 'lie' | 'sit' | 'stand' | 'held' };

/** A point in an item's own frame, in the house's. */
function onItem(item: PlacedItem, lx: number, ly: number, lz: number, pose: Spot['pose']): Spot {
  const { cx, cz, yaw } = itemTransform(item);
  return { x: cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), y: ly, z: cz - lx * Math.sin(yaw) + lz * Math.cos(yaw), yaw, pose };
}

/** Lying, the body runs from the feet (local z = 0) to the head (z = -length): this centres it on a spot. */
const bodyLength = (stage: KidStage) => (stage === 'newborn' ? 0.55 : 1.75 * stageDef(stage).scale * (1 + (stageDef(stage).head - 1) * 0.15));

export function Children({ design, walls }: { design?: string | null; walls?: string[] }) {
  const kids = useKids((s) => s.kids);
  const nannyUntil = useKids((s) => s.nannyUntil);
  const items = useGame((s) => s.items);
  const layout = useMemo(() => houseLayout(design, walls), [design, walls]);
  // Stages and naps change by the clock, not by any store: look again now and then.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 20_000);
    return () => clearInterval(id);
  }, []);
  const home = kids.filter((k) => k.status === 'home');
  if (!home.length) return null;
  // Every cot and bed goes to one child at most.
  const cots = items.filter((i) => i.type === 'baby_cot');
  const beds = items.filter((i) => ITEMS[i.type]?.bed && i.type !== 'baby_cot');
  return (
    <>
      {home.map((k, i) => (
        <ChildFigure key={k.id} kid={k} index={i} now={now} layout={layout} items={items} cot={cots[i] ?? null} bed={beds[beds.length - 1 - i] ?? null} />
      ))}
      {nannyUntil > now && <Nanny layout={layout} items={items} />}
    </>
  );
}

function ChildFigure({ kid, index, now, layout, items, cot, bed }: {
  kid: Kid; index: number; now: number; layout: HouseLayout; items: PlacedItem[]; cot: PlacedItem | null; bed: PlacedItem | null;
}) {
  const stage = stageOf(kid.bornAt, now);
  const def = stageDef(stage);
  const asleep = kid.asleepUntil > now;
  const task = useGame((s) => (s.task?.phase === 'doing' && s.task.actionId.startsWith('kid_') ? s.task : null));
  const care: CareId | null = task && careTargetOf(task.actionId) === kid.id ? careOfAction(task.actionId) : null;
  const careItem = care && task?.itemId ? items.find((i) => i.id === task.itemId) ?? null : null;
  const mat = items.find((i) => i.type === 'play_mat') ?? null;
  const little = stage === 'newborn' || stage === 'baby';

  // Where they settle when nothing moves them. Null: they wander (or are in your arms).
  const rest: Spot | null = useMemo(() => {
    const at = (item: PlacedItem, pose?: Spot['pose']): Spot => {
      const r = REST[item.type];
      const lying = (pose ?? r?.pose ?? 'lie') === 'lie';
      if (r) return onItem(item, item.type === 'play_mat' ? (index - 1) * 0.45 : 0, r.y, r.z + (lying ? bodyLength(stage) / 2 : 0), pose ?? r.pose);
      const b = ITEMS[item.type]?.bed;
      return onItem(item, 0, b?.y ?? 0.5, (b?.z ?? 0) + bodyLength(stage) / 2, 'lie');
    };
    if (care) {
      // Being looked after: at the piece you are using, or in your arms (a little one) / beside you (a bigger one).
      if (careItem && REST[careItem.type] && !(careItem.type === 'high_chair' && stage === 'newborn')) {
        return at(careItem, careItem.type === 'baby_bath' && !little ? 'stand' : careItem.type === 'play_mat' && !little ? 'stand' : undefined);
      }
      if (care === 'sleep' && bed && !little) return at(bed);
      return null;
    }
    if (asleep || stage === 'newborn') {
      if (cot && (little || stage === 'toddler')) return at(cot);
      if (bed && !little) return at(bed);
      if (mat) return at(mat, 'lie');
    }
    if (little && mat) return at(mat, 'lie');
    return null;
  }, [care, careItem, asleep, stage, cot, bed, mat, index, little]);

  const group = useRef<Group>(null!);
  const body = useRef<Group>(null!);
  const clip = useRef<Clip>('idle');
  const seated = useRef(false);
  const walk = useRef<{ x: number; z: number; tx: number; tz: number; wait: number; yaw: number } | null>(null);
  const cells = useMemo(() => freeCells(layout, items), [layout, items]);

  useFrame((_, dt) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    const step = Math.min(dt, 0.1);
    let spot = rest;
    if (!spot && care) {
      // In your arms, or right in front of you.
      const fx = Math.sin(avatar.yaw), fz = Math.cos(avatar.yaw);
      spot = little
        ? { x: avatar.x + fx * 0.3, y: 0.92, z: avatar.z + fz * 0.3, yaw: avatar.yaw + Math.PI / 2, pose: 'held' }
        : { x: avatar.x + fx * 0.75, y: 0, z: avatar.z + fz * 0.75, yaw: avatar.yaw + Math.PI, pose: 'stand' };
    }
    if (!spot && little) {
      // A baby with no mat and no cot lies on the floor of the room, never wanders off.
      const c = cells.length ? cells[(kid.id * 5 + index * 3) % cells.length] : { x: 1, z: 1 };
      spot = { x: c.x + 0.5, y: 0.02, z: c.z + 0.5 + bodyLength(stage) / 2, yaw: 0, pose: 'lie' };
    }
    if (spot) {
      walk.current = null;
      g.position.set(spot.x, spot.y, spot.z);
      g.rotation.y = spot.yaw;
      const lie = spot.pose === 'lie' || spot.pose === 'held';
      b.rotation.set(lie && stage !== 'newborn' ? -Math.PI / 2 : 0, 0, 0);
      b.position.set(0, lie ? 0.08 * def.scale : spot.pose === 'sit' ? -0.3 * def.scale : 0, spot.pose === 'held' ? bodyLength(stage) / 2 : 0);
      seated.current = spot.pose === 'sit';
      clip.current = lie ? 'lie' : spot.pose === 'sit' ? (care === 'feed' ? 'eat' : 'sit') : care === 'play' ? 'dance' : 'idle';
      return;
    }
    // Wandering: toddlers potter slowly with long stops, older ones walk a little further.
    b.rotation.set(0, 0, 0);
    b.position.set(0, 0, 0);
    seated.current = false;
    let w = walk.current;
    if (!w) {
      const c = cells.length ? cells[(kid.id * 7 + index * 3) % cells.length] : { x: 1, z: 1 };
      w = walk.current = { x: c.x + 0.5, z: c.z + 0.5, tx: c.x + 0.5, tz: c.z + 0.5, wait: 1 + index, yaw: 0 };
    }
    const speed = stage === 'toddler' ? 0.35 : 0.6;
    const dx = w.tx - w.x, dz = w.tz - w.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.02) {
      const m = Math.min(d, speed * step);
      w.x += (dx / d) * m;
      w.z += (dz / d) * m;
      w.yaw = Math.atan2(dx, dz);
      clip.current = 'walk';
    } else {
      clip.current = 'idle';
      w.wait -= step;
      if (w.wait <= 0 && cells.length) {
        const from = w;
        const near = cells.filter((c) => Math.abs(c.x + 0.5 - from.x) + Math.abs(c.z + 0.5 - from.z) <= (stage === 'toddler' ? 2 : 4) && sameRoom(layout, c, from));
        const next = near[Math.floor(Math.random() * near.length)];
        if (next) { w.tx = next.x + 0.5; w.tz = next.z + 0.5; }
        w.wait = (stage === 'toddler' ? 3 : 5) + Math.random() * 5;
      }
    }
    g.position.set(w.x, 0, w.z);
    let turn = w.yaw - g.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    g.rotation.y += turn * Math.min(1, step * 8);
  });

  return (
    <group ref={group}>
      <group ref={body}>
        {stage === 'newborn'
          ? <Swaddle kid={kid} />
          : (
            <group scale={def.scale}>
              <Person look={kid.look} clipRef={clip} seatedRef={seated} headScale={def.head} />
            </group>
          )}
      </group>
    </group>
  );
}

/** A newborn: wrapped up in a wrapper with a little knitted cap, lying along -z from the origin like a lying Person. */
function Swaddle({ kid }: { kid: Kid }) {
  const skin = SKINS[decodeLook(kid.look).skin] ?? SKINS[3];
  const wrap = kid.sex === 'f' ? '#f472b6' : '#38bdf8';
  return (
    <group position={[0, 0.1, 0]}>
      <mesh position={[0, 0, -0.2]} scale={[0.13, 0.1, 0.22]} castShadow>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={wrap} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.03, -0.15]} scale={[0.135, 0.07, 0.035]}>
        <sphereGeometry args={[1, 10, 6]} />
        <meshStandardMaterial color="#fde68a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.02, -0.45]} castShadow>
        <sphereGeometry args={[0.085, 14, 12]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.03, -0.49]} rotation={[-Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[0.083, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Nanny({ layout, items }: { layout: HouseLayout; items: PlacedItem[] }) {
  const clip = useRef<Clip>('idle');
  const spot = useMemo(() => {
    const room = layout.rooms.find((r) => /living|parlour|lounge/i.test(r.name)) ?? layout.rooms[0];
    const blocked = blockedCells(items);
    if (!room) return { x: 1.5, z: 1.5 };
    for (let z = room.z0; z < room.z1; z++) for (let x = room.x1 - 1; x >= room.x0; x--) {
      if (!blocked.has(key({ x, z })) && !layout.solid.has(key({ x, z }))) return { x: x + 0.5, z: z + 0.5 };
    }
    return { x: room.x0 + 0.5, z: room.z0 + 0.5 };
  }, [layout, items]);
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, Math.PI * 0.75, 0]}>
      <Person look={NANNY_LOOK} clipRef={clip} />
    </group>
  );
}

/** Cells a child can stand on: inside the house's rooms (not the bathroom), clear of furniture and parked cars. */
function freeCells(layout: HouseLayout, items: PlacedItem[]) {
  const blocked = blockedCells(items);
  const out: { x: number; z: number }[] = [];
  // Indoors only (the layout also names the compound and yard), and not the bathroom.
  const inside = layout.rooms.filter((r) => r.x1 <= layout.width && r.z1 <= layout.depth && !/compound|yard|garden|carport|porch|outside/i.test(r.name));
  const rooms = inside.filter((r) => !/bath|toilet|store/i.test(r.name));
  for (const r of rooms.length ? rooms : inside) {
    for (let x = r.x0; x < r.x1; x++) for (let z = r.z0; z < r.z1; z++) {
      const k = key({ x, z });
      if (!blocked.has(k) && !layout.solid.has(k)) out.push({ x, z });
    }
  }
  return out;
}

const sameRoom = (layout: HouseLayout, c: { x: number; z: number }, at: { x: number; z: number }) => {
  const r = layout.rooms.find((room) => at.x >= room.x0 && at.x < room.x1 && at.z >= room.z0 && at.z < room.z1);
  return !r || (c.x >= r.x0 && c.x < r.x1 && c.z >= r.z0 && c.z < r.z1);
};
