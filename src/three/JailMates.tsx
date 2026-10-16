// Who is behind the bars in the police cells (game/cells.ts). The other players doing time, from the custody list
// (net/crime.ts), each in the cell game/cells.ts assignCells gives them: on the bunk, the bench or at the bars. Anyone
// online is skipped, since they are drawn where they really are (RemotePlayers). Tap one to open their actions, which
// is where bail is paid. A cell nobody is in gets a nameless detainee or two, so the block never looks abandoned.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { encodeLook, randomAppearance } from '../game/wardrobe';
import type { Prisoner } from '../game/crime';
import { assignCells, CELLS } from '../game/cells';
import { useGame } from '../game/store';
import { loadPolice, usePolice } from '../net/crime';
import { lobbyArea, placeArea, remotePos, useNet } from '../net/multiplayer';
import { useSession } from '../net/session';
import { useSocial, type PlayerRef } from '../net/social';
import { TARGET_HEIGHT } from './Avatar';
import { Person, seatDrop, type Clip } from './Person';
import { offHover, onHover } from './HoverOutline';

const MAX = 10;
/** Nameless detainees, at most: every person is a few dozen meshes. */
const MAX_EXTRAS = 2;
const REFRESH_MS = 60_000;
const BENCH_Y = 0.42;
const BUNK_Y = 0.5;

type Spot = { x: number; y: number; z: number; yaw: number; pose: 'lie' | 'sit' | 'stand' };

/** Where the people in a cell go, in order (places/civic.ts cellProps): the bench by the bars, the bunk, the rest of the bench, at the bars. */
function cellSpots(cell: number): Spot[] {
  const { x } = CELLS[cell];
  return [
    { x: x + 2.5, y: BENCH_Y, z: 3.5, yaw: -Math.PI / 2, pose: 'sit' },
    // Flat on the bunk, head to the wall: drawn from the feet end.
    { x: x + 0.5, y: BUNK_Y, z: 1.85, yaw: 0, pose: 'lie' },
    { x: x + 2.5, y: BENCH_Y, z: 2.5, yaw: -Math.PI / 2, pose: 'sit' },
    { x: x + 1.5, y: 0, z: 3.4, yaw: 0, pose: 'stand' },
  ];
}

/** Somebody online standing in this cell: the nameless detainee there makes room. */
function liveIn(cell: number) {
  const area = lobbyArea(placeArea(useGame.getState(), useNet.getState().myId));
  const c = CELLS[cell];
  let found = false;
  remotePos.forEach((p) => { if (!found && p.area === area && p.x >= c.x && p.x < c.x + c.w && p.z >= c.z && p.z < c.z + c.d) found = true; });
  return found;
}

function Body({ look, spot }: { look: string; spot: Spot }) {
  const clip = useRef<Clip>(spot.pose === 'lie' ? 'lie' : spot.pose === 'sit' ? 'sit' : 'idle');
  return spot.pose === 'lie' ? (
    <group rotation-x={-Math.PI / 2} position-y={0.1}>
      <Person look={look} clipRef={clip} />
    </group>
  ) : (
    <group position-y={spot.pose === 'sit' ? -seatDrop(spot.y) : 0}>
      <Person look={look} clipRef={clip} />
    </group>
  );
}

function Inmate({ prisoner, spot }: { prisoner: Prisoner; spot: Spot }) {
  const look = useMemo(() => prisoner.look || encodeLook(randomAppearance()), [prisoner.look]);
  const open = () => {
    const player: PlayerRef = { uid: prisoner.uid, username: prisoner.username, look: prisoner.look };
    useSocial.setState((s) => ({ interactionWith: player, players: { ...s.players, [prisoner.uid]: player } }));
  };
  const tagY = spot.pose === 'lie' ? 0.75 : spot.pose === 'sit' ? TARGET_HEIGHT - seatDrop(spot.y) + 0.35 : TARGET_HEIGHT + 0.35;
  return (
    <group position={[spot.x, spot.y, spot.z]} rotation-y={spot.yaw}>
      <Body look={look} spot={spot} />
      <mesh
        visible={false}
        position={spot.pose === 'lie' ? [0, 0.3, -0.85] : [0, TARGET_HEIGHT / 2, 0]}
        rotation-x={spot.pose === 'lie' ? Math.PI / 2 : 0}
        onClick={(e) => { e.stopPropagation(); open(); }}
        onPointerOver={(e) => onHover(e, null)}
        onPointerOut={offHover}
      >
        <capsuleGeometry args={[0.45, 1, 4, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, tagY, spot.pose === 'lie' ? -0.85 : 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <div className="nametag">
          <button onClick={open}>⛓️ @{prisoner.username}</button>
        </div>
      </Html>
    </group>
  );
}

/** A detainee nobody knows, in a cell no player is in. Steps out of view when a player is put in with them. */
function Detainee({ cell, spot, seed }: { cell: number; spot: Spot; seed: number }) {
  const look = useMemo(() => encodeLook(randomAppearance()), [seed]);
  const group = useRef<Group>(null!);
  useFrame(() => {
    if (group.current) group.current.visible = !liveIn(cell);
  });
  return (
    <group ref={group} position={[spot.x, spot.y, spot.z]} rotation-y={spot.yaw}>
      <Body look={look} spot={spot} />
    </group>
  );
}

export function JailMates() {
  const custody = usePolice((s) => s.custody);
  const online = useNet((s) => s.players);
  const myUid = useSession((s) => s.user?.uid);
  const myCell = useGame((s) => (s.jailedUntil ? s.jailCell : null));

  // The list is only kept fresh for the Police app: load it on the way in, and every minute while you're here.
  useEffect(() => {
    void loadPolice();
    const t = setInterval(() => void loadPolice(), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const inside = custody.filter((p) => p.until > now);
  // Everybody in custody, me included, gets the cell every phone gives them; I'm wherever I was actually put.
  const cells = assignCells([...inside.map((p) => p.uid), ...(myUid && myCell !== null ? [myUid] : [])]);
  const used = CELLS.map(() => 0);
  if (myCell !== null) used[myCell]++;
  const mates = inside
    .filter((p) => p.uid !== myUid && !online[p.uid])
    .slice(0, MAX)
    .map((p) => {
      const cell = cells.get(p.uid) ?? 0;
      const spot = cellSpots(cell)[used[cell]++ % 4];
      return { p, spot };
    });
  const taken = new Set(inside.map((p) => cells.get(p.uid)));
  if (myCell !== null) taken.add(myCell);
  const extras = CELLS.map((_, i) => i).filter((i) => !taken.has(i)).slice(0, MAX_EXTRAS);
  return (
    <group>
      {mates.map(({ p, spot }) => <Inmate key={p.uid} prisoner={p} spot={spot} />)}
      {extras.map((cell, i) => <Detainee key={cell} cell={cell} seed={cell} spot={cellSpots(cell)[i % 2]} />)}
    </group>
  );
}
