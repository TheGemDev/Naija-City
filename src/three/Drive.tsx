// On the town map: the vehicle you're driving, passengers waving for a ride, police checkpoints,
// the Durbar course, campaign posters and crowds for the live events (game/drive.ts, game/live.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import { avatar } from '../game/avatar';
import { activeMap, mapGroundY, placeHere } from '../game/city';
import { CAR_BY_ID } from '../game/cars';
import { checkpointsHere, durbarGates, stepDrive, useDrive } from '../game/drive';
import { driveState } from '../game/driveState';
import { activeEvent, liveDef, type LiveEventId } from '../game/live';
import { useGame } from '../game/store';
import { useCivic } from '../net/civic';
import { CAMPAIGN_BOARDS, OFFICE_RULES } from '../game/civic';
import { B, Bike, Keke } from './models';
import { Car, Horse } from './cityModels';
import { Person, type Clip } from './Person';
import { MAP_SCALE } from './Avatar';
import { encodeLook } from '../game/wardrobe';

function DriveLoop() {
  useFrame((_, dt) => stepDrive(dt));
  return null;
}

/** Your vehicle, following the avatar's (driven) position. */
function MyVehicle() {
  const vehicle = useDrive((s) => s.vehicle);
  const look = useGame((s) => s.look);
  const ref = useRef<Group>(null);
  const clip = useRef<Clip>('ride');
  const carColour = driveState.carId ? CAR_BY_ID[driveState.carId]?.color ?? '#2563eb' : '#2563eb';
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const bump = driveState.bump > 0 ? Math.sin(clock.elapsedTime * 40) * 0.05 * driveState.bump : 0;
    g.position.set(avatar.x, mapGroundY(avatar.x, avatar.z) + Math.max(0, bump), avatar.z);
    g.rotation.set(bump * 0.6, driveState.heading, 0);
  });
  if (!vehicle) return null;
  const rider = vehicle === 'okada' || vehicle === 'horse';
  return (
    <group ref={ref}>
      <group scale={vehicle === 'okada' ? 0.9 : vehicle === 'horse' ? 1.15 : vehicle === 'keke' ? 0.8 : 1.05}>
        {vehicle === 'keke' ? <Keke /> : vehicle === 'okada' ? <Bike colour="#facc15" /> : vehicle === 'horse' ? <Horse c="#f8fafc" /> : <Car c={carColour} />}
      </group>
      {rider && (
        <group position={[0, vehicle === 'horse' ? 0.62 : 0.28, vehicle === 'horse' ? -0.05 : -0.05]} scale={MAP_SCALE}>
          <Person look={look} clipRef={clip} />
        </group>
      )}
      {vehicle === 'horse' && (
        // Durbar regalia: a tall red-and-gold plume.
        <B p={[0, 1.15, 0.5]} s={[0.05, 0.3, 0.05]} c="#dc2626" e="#facc15" />
      )}
    </group>
  );
}

function Beacon({ x, z, colour, label }: { x: number; z: number; colour: string; label: string }) {
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const p = (clock.elapsedTime * 0.9) % 1;
    ring.current.scale.setScalar(0.5 + p);
  });
  return (
    <group position={[x, mapGroundY(x, z) + 0.04, z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.9, 32]} />
        <meshBasicMaterial color={colour} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 2.8, 8]} />
        <meshBasicMaterial color={colour} transparent opacity={0.45} depthWrite={false} />
      </mesh>
      <Html position={[0, 3, 0]} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
        <div className="drive-marker" style={{ borderColor: colour }}>{label}</div>
      </Html>
    </group>
  );
}

function PassengerMarkers() {
  const p = useDrive((s) => s.passenger);
  if (!p) return null;
  if (!p.boarded) return <Beacon x={p.pickup.x + 0.5} z={p.pickup.z + 0.5} colour="#facc15" label={p.order ? `🥡 Collect at ${p.order.fromName}` : `🙋🏾 ${p.name}`} />;
  const to = placeHere(p.to)!;
  return <Beacon x={to.door.x + 0.5} z={to.door.z + 0.5} colour="#22c55e" label={p.order ? `📦 ${p.name} · ${p.toName}` : `📍 ${p.toName}`} />;
}

/** Same uniform as the officers at the station (Interior.tsx). */
const OFFICER_LOOK = encodeLook({ body: 'm', skin: 5, hair: 'fade', hairColor: 0, outfit: { top: 'shirt_denim', bottom: 'trousers_black', shoes: 'boots_black', head: 'beanie_black' } });
const OFFICER_CLIP = { current: 'idle' as Clip };

/** Drums, a striped plank and an officer at every checkpoint, standing on the road wherever the ground sits. */
function Checkpoints() {
  const driving = useDrive((s) => !!s.vehicle && s.vehicle !== 'horse');
  useGame((s) => s.destinationId);
  return (
    <group>
      {checkpointsHere().map((c) => (
        <group key={c.id} position={[c.x, mapGroundY(c.x, c.z), c.z]} rotation={[0, c.horiz ? Math.PI / 2 : 0, 0]}>
          {/* Oil drums waist-high to the officer, the plank across them. */}
          {[-0.95, 0.95].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <B p={[0, 0.25, 0]} s={[0.3, 0.5, 0.3]} c="#ea580c" />
              <B p={[0, 0.2, 0]} s={[0.31, 0.05, 0.31]} c="#f8fafc" />
              <B p={[0, 0.36, 0]} s={[0.31, 0.05, 0.31]} c="#f8fafc" />
            </group>
          ))}
          <B p={[0, 0.54, 0]} s={[2.2, 0.08, 0.1]} c="#f8fafc" />
          {[-0.6, -0.2, 0.2, 0.6].map((x) => (
            <B key={x} p={[x, 0.54, 0.001]} s={[0.18, 0.085, 0.105]} c="#dc2626" />
          ))}
          <group position={[1.4, 0, 0.3]} rotation={[0, -Math.PI / 2, 0]} scale={MAP_SCALE}>
            <Person look={OFFICER_LOOK} clipRef={OFFICER_CLIP} />
          </group>
          {driving && (
            <Html position={[0, 1.5, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
              <div className="drive-marker small">👮🏾 Checkpoint</div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

function DurbarCourse() {
  const durbar = useDrive((s) => s.durbar);
  const gates = useMemo(() => durbarGates(), []);
  if (!durbar) return null;
  return (
    <group>
      {gates.map((g, i) =>
        i < durbar.gate ? null : (
          <group key={i} position={[g.x, 0.6, g.z]}>
            <mesh>
              <torusGeometry args={[0.55, 0.07, 8, 24]} />
              <meshStandardMaterial color={i === durbar.gate ? '#facc15' : '#16a34a'} emissive={i === durbar.gate ? '#facc15' : '#000'} emissiveIntensity={0.6} />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
}

/** Roadside spots for campaign posters, a little off the main roads of the city you are in. */
function posterSpots() {
  const spots: { x: number; z: number; yaw: number }[] = [];
  for (const r of activeMap().roads.filter((r) => r.main)) {
    const horiz = r.w > r.d;
    const len = horiz ? r.w : r.d;
    for (let t = 5; t < len - 3; t += 14) {
      spots.push(horiz ? { x: r.x + t, z: r.z - 0.35, yaw: 0 } : { x: r.x - 0.35, z: r.z + t, yaw: Math.PI / 2 });
    }
  }
  return spots;
}

function CampaignPosters() {
  const all = useCivic((s) => s.data?.posters);
  const city = useGame((s) => s.destinationId);
  const spots = useMemo(posterSpots, [city]);
  // A race for one city's post is advertised on that city's roads; the national ones everywhere.
  const posters = useMemo(() => all?.filter((p) => !OFFICE_RULES[p.office].city || OFFICE_RULES[p.office].city === city), [all, city]);
  // A couple of boards for each candidate, spread along the roads: never one at every spot in town.
  const boards = useMemo(() => {
    const n = Math.min(spots.length, CAMPAIGN_BOARDS.max, (posters?.length ?? 0) * CAMPAIGN_BOARDS.each);
    return Array.from({ length: n }, (_, k) => spots[Math.floor(((k + 0.5) * spots.length) / n)]);
  }, [spots, posters]);
  if (!posters?.length) return null;
  return (
    <group>
      {boards.map((spot, i) => {
        const p = posters[i % posters.length];
        return (
          <group key={i} position={[spot.x, 0, spot.z]} rotation={[0, spot.yaw, 0]}>
            <B p={[-0.45, 0.45, 0]} s={[0.05, 0.9, 0.05]} c="#78350f" />
            <B p={[0.45, 0.45, 0]} s={[0.05, 0.9, 0.05]} c="#78350f" />
            <B p={[0, 0.85, 0]} s={[1.1, 0.6, 0.04]} c={i % 2 ? '#15803d' : '#1d4ed8'} />
            <Html position={[0, 0.85, 0.05]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
              <div className="poster-label">
                <b>VOTE @{p.username}</b>
                <small>{OFFICE_RULES[p.office].title}</small>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

const CROWD_COLOURS = ['#dc2626', '#16a34a', '#f8fafc', '#facc15', '#7c3aed', '#0ea5e9', '#f97316'];

/** A bobbing crowd of little figures in a rectangle. */
function Crowd({ x, z, w, d, n, colours = CROWD_COLOURS, signs }: { x: number; z: number; w: number; d: number; n: number; colours?: string[]; signs?: boolean }) {
  const people = useMemo(
    () => Array.from({ length: n }, (_, i) => ({ x: x + ((i * 0.618) % 1) * w, z: z + ((i * 0.381 + 0.17) % 1) * d, c: colours[i % colours.length], ph: i * 1.7 })),
    [x, z, w, d, n, colours],
  );
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((c, i) => {
      c.position.y = Math.abs(Math.sin(clock.elapsedTime * 4 + people[i].ph)) * 0.08;
    });
  });
  return (
    <group ref={ref}>
      {people.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <B p={[0, 0.2, 0]} s={[0.14, 0.4, 0.1]} c={p.c} />
          <B p={[0, 0.48, 0]} s={[0.11, 0.11, 0.11]} c="#5b3a29" />
          {signs && i % 4 === 0 && <B p={[0.05, 0.75, 0]} s={[0.3, 0.2, 0.02]} c="#f8fafc" />}
        </group>
      ))}
    </group>
  );
}

const NAIJA = ['#15803d', '#f8fafc', '#15803d', '#111827'];
const ABUJA_CROWDS: Partial<Record<LiveEventId, { n: number; colours: string[]; signs?: boolean }>> = {
  inauguration: { n: 50, colours: NAIJA },
  delegates: { n: 40, colours: ['#f8fafc', '#1d4ed8', '#dc2626', '#15803d'], signs: true },
  carnival: { n: 55, colours: ['#be185d', '#facc15', '#7c3aed', '#16a34a', '#f97316'] },
  mace: { n: 26, colours: ['#111827', '#f8fafc', '#15803d'] },
  snake: { n: 22, colours: ['#f8fafc', '#1f2937', '#a16207'] },
  taskforce: { n: 34, colours: CROWD_COLOURS },
  jubril: { n: 36, colours: NAIJA, signs: true },
  regatta: { n: 24, colours: ['#0ea5e9', '#f8fafc', '#facc15'] },
  eagles: { n: 40, colours: NAIJA },
  palliative: { n: 48, colours: CROWD_COLOURS },
  // Lagos
  eyo: { n: 60, colours: ['#f8fafc', '#f8fafc', '#e5e7eb', '#f8fafc'] },
  detty: { n: 50, colours: ['#be185d', '#111827', '#facc15', '#7c3aed'] },
  felabration: { n: 44, colours: ['#facc15', '#15803d', '#dc2626', '#111827'] },
  tanker: { n: 40, colours: CROWD_COLOURS },
  lekkiflood: { n: 20, colours: ['#0ea5e9', '#f8fafc', '#1f2937'] },
  marathon: { n: 46, colours: ['#f97316', '#f8fafc', '#15803d', '#2563eb'] },
  techweek: { n: 24, colours: ['#111827', '#f8fafc', '#2563eb'] },
  aluta: { n: 48, colours: ['#7f1d1d', '#f8fafc', '#111827'], signs: true },
  landgrab: { n: 22, colours: CROWD_COLOURS, signs: true },
  japa: { n: 36, colours: ['#be185d', '#facc15', '#16a34a', '#f8fafc'] },
  // Kano
  hisbah: { n: 44, colours: ['#166534', '#f8fafc', '#a16207', '#1f2937'] },
  aure: { n: 60, colours: ['#f8fafc', '#be185d', '#facc15', '#7c3aed', '#15803d'] },
  kannywood: { n: 46, colours: ['#be185d', '#111827', '#facc15', '#f8fafc'] },
  harmattan: { n: 20, colours: ['#d6d3d1', '#a8a29e', '#e7e5e4'] },
  pyramids: { n: 34, colours: ['#c8a36a', '#f8fafc', '#1e3a8a', '#a16207'] },
  kwari: { n: 50, colours: ['#1e3a8a', '#f8fafc', '#be185d', '#facc15', '#15803d'] },
};

function EventProps() {
  const city = useGame((s) => s.destinationId);
  const [event, setEvent] = useState<LiveEventId | null>(() => activeEvent(Date.now(), city));
  useEffect(() => {
    setEvent(activeEvent(Date.now(), city));
    const id = setInterval(() => setEvent(activeEvent(Date.now(), city)), 10_000);
    return () => clearInterval(id);
  }, [city]);
  const m = placeHere('murtala')!;
  const v = placeHere('viewing')!;
  const park = placeHere('motorpark')!;
  if (!event) return null;
  // Abuja's, Lagos's and Kano's own events: a crowd at the gate of wherever it is happening.
  const gate = ABUJA_CROWDS[event] ? placeHere(liveDef(event, city).place ?? '') : undefined;
  return (
    <group>
      {gate && <Crowd x={gate.door.x - 2} z={gate.door.z - 0.5} w={4} d={2} n={ABUJA_CROWDS[event]!.n} colours={ABUJA_CROWDS[event]!.colours} signs={ABUJA_CROWDS[event]!.signs} />}
      {event === 'protest' && <Crowd x={m.x + 0.5} z={m.z + 0.5} w={m.w - 1} d={m.d - 1} n={60} colours={['#16a34a', '#f8fafc', '#111827']} signs />}
      {event === 'owambe' && (
        <group>
          <B p={[m.x + m.w / 2, 0.9, m.z + m.d / 2]} s={[m.w - 1, 0.08, m.d - 1]} c="#fbbf24" />
          <Crowd x={m.x + 0.6} z={m.z + 0.6} w={m.w - 1.2} d={m.d - 1.2} n={45} colours={['#be185d', '#facc15', '#7c3aed', '#16a34a']} />
        </group>
      )}
      {event === 'durbar' &&
        [0, 1, 2, 3, 4].map((i) => (
          <group key={i} position={[m.x + 1 + i * ((m.w - 2) / 4), 0, m.z + 0.8]} rotation={[0, Math.PI / 2, 0]} scale={1.1}>
            <Horse c={['#7c2d12', '#f8fafc', '#1f2937', '#a16207', '#7c2d12'][i]} />
          </group>
        ))}
      {event === 'final' && <Crowd x={v.door.x - 2} z={v.door.z} w={4} d={2} n={24} colours={['#dc2626', '#f8fafc', '#16a34a']} />}
      {event === 'fuel' &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <group key={i} position={[park.door.x - 6 + i * 1.1, 0, park.door.z + 1.5]} rotation={[0, Math.PI / 2, 0]} scale={0.75}>
            <Car c={CROWD_COLOURS[i]} />
          </group>
        ))}
    </group>
  );
}

export function DriveLayer() {
  return (
    <group>
      <DriveLoop />
      <MyVehicle />
      <PassengerMarkers />
      <Checkpoints />
      <DurbarCourse />
      <CampaignPosters />
      <EventProps />
    </group>
  );
}
