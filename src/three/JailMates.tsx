// The other players doing time, in the cell with you: up to ten from the custody list (net/crime.ts), on the
// mattresses, the benches and standing about. Anyone online is skipped, since they are drawn where they really are
// (RemotePlayers). Tap one to open their actions, which is where bail is paid.
import { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { encodeLook, randomAppearance } from '../game/wardrobe';
import type { Prisoner } from '../game/crime';
import { loadPolice, usePolice } from '../net/crime';
import { useNet } from '../net/multiplayer';
import { useSession } from '../net/session';
import { useSocial, type PlayerRef } from '../net/social';
import { TARGET_HEIGHT } from './Avatar';
import { Person, seatDrop, type Clip } from './Person';
import { offHover, onHover } from './HoverOutline';

const MAX = 10;
const REFRESH_MS = 60_000;
const BENCH_Y = 0.42;
const MAT_Y = 0.12;
/** Where they face when standing: the middle of the cell. */
const MIDDLE = { x: 4.5, z: 4 };

type Spot = { x: number; z: number; pose: 'lie' | 'sit' | 'stand' };
// Cell layout: places/civic.ts `prison`. Mattresses at x 0-3 along the back wall, benches at (1,5) and (6,5); you
// arrive at (4,3), which stays clear.
const SPOTS: Spot[] = [
  { x: 0.5, z: 1.85, pose: 'lie' },
  { x: 1.5, z: 1.85, pose: 'lie' },
  { x: 2.5, z: 1.85, pose: 'lie' },
  { x: 3.5, z: 1.85, pose: 'lie' },
  { x: 1.5, z: 5.5, pose: 'sit' },
  { x: 7.5, z: 5.5, pose: 'sit' },
  { x: 6.6, z: 3.1, pose: 'stand' },
  { x: 8.3, z: 4.3, pose: 'stand' },
  { x: 3.4, z: 6.7, pose: 'stand' },
  { x: 8.5, z: 6.7, pose: 'stand' },
];

function Inmate({ prisoner, spot }: { prisoner: Prisoner; spot: Spot }) {
  const look = useMemo(() => prisoner.look || encodeLook(randomAppearance()), [prisoner.look]);
  const clip = useRef<Clip>(spot.pose === 'lie' ? 'lie' : spot.pose === 'sit' ? 'sit' : 'idle');
  const open = () => {
    const player: PlayerRef = { uid: prisoner.uid, username: prisoner.username, look: prisoner.look };
    useSocial.setState((s) => ({ interactionWith: player, players: { ...s.players, [prisoner.uid]: player } }));
  };
  const y = spot.pose === 'lie' ? MAT_Y : spot.pose === 'sit' ? BENCH_Y : 0;
  const yaw = spot.pose === 'stand' ? Math.atan2(MIDDLE.x - spot.x, MIDDLE.z - spot.z) : 0;
  const tagY = spot.pose === 'lie' ? 0.75 : spot.pose === 'sit' ? TARGET_HEIGHT - seatDrop(BENCH_Y) + 0.35 : TARGET_HEIGHT + 0.35;
  return (
    <group position={[spot.x, y, spot.z]} rotation-y={yaw}>
      {spot.pose === 'lie' ? (
        // Flat on the mattress, head to the wall.
        <group rotation-x={-Math.PI / 2} position-y={0.1}>
          <Person look={look} clipRef={clip} />
        </group>
      ) : (
        <group position-y={spot.pose === 'sit' ? -seatDrop(BENCH_Y) : 0}>
          <Person look={look} clipRef={clip} />
        </group>
      )}
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

export function JailMates() {
  const custody = usePolice((s) => s.custody);
  const online = useNet((s) => s.players);
  const myUid = useSession((s) => s.user?.uid);

  // The list is only kept fresh for the Police app: load it on the way in, and every minute while you're here.
  useEffect(() => {
    void loadPolice();
    const t = setInterval(() => void loadPolice(), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const mates = custody
    .filter((p) => p.until > now && p.uid !== myUid && !online[p.uid])
    .slice(0, MAX);
  return (
    <group>
      {mates.map((p, i) => <Inmate key={p.uid} prisoner={p} spot={SPOTS[i]} />)}
    </group>
  );
}
