// What a live event looks like at Murtala Square: a protest crowd with placards, riders galloping round
// the Durbar track with cheering sides, or canopies, bunting and a dancing crowd for an owambe. Which
// one is a pure function of the clock (game/live.ts) or the party someone booked, so everyone sees the same.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { activeEvent, hash } from '../game/live';
import { useGame } from '../game/store';
import { encodeLook, randomAppearance } from '../game/wardrobe';
import { useParty } from '../net/owambe';
import { B } from './models';
import { Person, type Clip } from './Person';

type Kind = 'protest' | 'durbar' | 'owambe' | 'rally';

function useKind(): Kind | null {
  const party = useParty((s) => s.party);
  const city = useGame((s) => s.destinationId);
  const [event, setEvent] = useState(() => activeEvent(Date.now(), city));
  useEffect(() => {
    setEvent(activeEvent(Date.now(), city));
    const t = setInterval(() => setEvent(activeEvent(Date.now(), city)), 15_000);
    return () => clearInterval(t);
  }, [city]);
  if (party) return 'owambe';
  // Eagle Square (Abuja's 'murtala'): the carnival is a street party, the swearing-in and the primaries are rallies.
  if (event === 'carnival') return 'owambe';
  if (event === 'inauguration' || event === 'delegates') return 'rally';
  return event === 'protest' || event === 'durbar' || event === 'owambe' ? event : null;
}

const COLORS = ['#ef4444', '#f59e0b', '#16a34a', '#2563eb', '#a855f7', '#ec4899'];
const rnd = (seed: number) => (hash(seed) % 1000) / 1000;

function Figure({ x, z, yaw, clip, y = 0 }: { x: number; z: number; yaw: number; clip: Clip; y?: number }) {
  const look = useMemo(() => encodeLook(randomAppearance()), []);
  const ref = useRef<Clip>(clip);
  ref.current = clip;
  return (
    <group position={[x, y, z]} rotation-y={yaw}>
      <Person look={look} clipRef={ref} />
    </group>
  );
}

export function Protest() {
  const people = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ x: 6.2 + (i % 7) * 0.95 + rnd(i) * 0.3, z: 5.6 + Math.floor(i / 7) * 1.3 + rnd(i + 40) * 0.3, sign: i % 2 === 0, c: COLORS[i % COLORS.length] })),
    [],
  );
  return (
    <group>
      {people.map((p, i) => (
        <group key={i}>
          <Figure x={p.x} z={p.z} yaw={rnd(i + 9) * 0.5 - 0.25} clip={i % 3 === 0 ? 'wave' : 'clap'} />
          {p.sign && (
            <group position={[p.x + 0.35, 0, p.z]}>
              <B p={[0, 1.15, 0]} s={[0.05, 2.3, 0.05]} c="#78350f" />
              <B p={[0, 2.35, 0]} s={[0.85, 0.55, 0.06]} c="#fffbeb" />
              <B p={[0, 2.35, 0.04]} s={[0.6, 0.12, 0.02]} c={p.c} />
            </group>
          )}
        </group>
      ))}
      {/* A banner strung across the front */}
      <B p={[9.5, 1.4, 4.4]} s={[7, 0.7, 0.06]} c="#fef3c7" />
      <B p={[9.5, 1.4, 4.43]} s={[5.4, 0.16, 0.02]} c="#b91c1c" />
      <B p={[6, 0.7, 4.4]} s={[0.07, 1.4, 0.07]} c="#78350f" />
      <B p={[13, 0.7, 4.4]} s={[0.07, 1.4, 0.07]} c="#78350f" />
      {/* Police line along the front, shields up */}
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i}>
          <Figure x={5.4 + i * 1.5} z={10.3} yaw={Math.PI} clip="idle" />
          <B p={[5.4 + i * 1.5 + 0.3, 0.95, 10.15]} s={[0.4, 1.0, 0.05]} c="#1e293b" o={0.85} />
        </group>
      ))}
    </group>
  );
}

function Horse({ phase, color }: { phase: number; color: string }) {
  const g = useRef<Group>(null!);
  const bob = useRef<Group>(null!);
  const rider = useRef<Clip>('idle');
  const look = useMemo(() => encodeLook(randomAppearance()), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.45 + phase;
    const x = 9 + Math.cos(t) * 6.2;
    const z = 7.2 + Math.sin(t) * 2.9;
    g.current.position.set(x, 0, z);
    // Face along the direction of travel.
    g.current.rotation.y = Math.atan2(-Math.sin(t) * 6.2, Math.cos(t) * 2.9);
    bob.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 7 + phase)) * 0.12;
  });
  return (
    <group ref={g}>
      <group ref={bob}>
        <B p={[0, 0.95, 0]} s={[0.55, 0.55, 1.5]} c={color} />
        <B p={[0, 1.4, 0.8]} s={[0.3, 0.6, 0.35]} c={color} />
        <B p={[0, 1.65, 1.05]} s={[0.26, 0.28, 0.55]} c={color} />
        <B p={[0, 1.0, -0.78]} s={[0.1, 0.5, 0.1]} c="#1c1917" />
        {[[-0.18, 0.55], [0.18, 0.55], [-0.18, -0.55], [0.18, -0.55]].map(([lx, lz], i) => (
          <B key={i} p={[lx, 0.4, lz]} s={[0.14, 0.8, 0.14]} c="#292524" />
        ))}
        <B p={[0, 1.27, 0.05]} s={[0.6, 0.1, 0.5]} c="#b91c1c" />
        <group position={[0, 1.2, 0]} rotation-y={0}>
          <group position-y={-0.45}>
            <Person look={look} clipRef={rider} />
          </group>
        </group>
      </group>
    </group>
  );
}

export function Durbar() {
  return (
    <group>
      {[0, 2.1, 4.2].map((ph, i) => <Horse key={i} phase={ph} color={['#7c2d12', '#e7e5e4', '#44403c'][i]} />)}
      {/* Spectators lining both sides, cheering */}
      {Array.from({ length: 10 }, (_, i) => {
        const left = i % 2 === 0;
        return <Figure key={i} x={left ? 0.9 : 17.1} z={2.5 + Math.floor(i / 2) * 1.8 + rnd(i) * 0.4} yaw={left ? Math.PI / 2 : -Math.PI / 2} clip={i % 3 === 0 ? 'wave' : 'clap'} />;
      })}
      {/* Pennants along the front of the grandstand */}
      {Array.from({ length: 12 }, (_, i) => (
        <B key={i} p={[3.5 + i * 1.05, 2.5 - Math.sin((i / 11) * Math.PI) * 0.3, 2.2]} s={[0.4, 0.5, 0.04]} c={COLORS[i % COLORS.length]} />
      ))}
    </group>
  );
}

export function Owambe() {
  return (
    <group>
      {/* Canopies with a table under each */}
      {[4.5, 13.5].map((cx) => (
        <group key={cx}>
          {[[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]].map(([dx, dz], i) => <B key={i} p={[cx + dx, 1.1, 4.4 + dz]} s={[0.1, 2.2, 0.1]} c="#78350f" />)}
          <B p={[cx, 2.3, 4.4]} s={[3.2, 0.14, 2.6]} c={cx < 9 ? '#dc2626' : '#2563eb'} />
          <B p={[cx, 0.55, 4.4]} s={[2, 0.1, 0.9]} c="#fef3c7" />
          <B p={[cx, 0.28, 4.4]} s={[1.8, 0.55, 0.7]} c="#92400e" />
          <B p={[cx - 0.5, 0.68, 4.4]} s={[0.4, 0.2, 0.4]} c="#f59e0b" />
          <B p={[cx + 0.5, 0.68, 4.4]} s={[0.4, 0.2, 0.4]} c="#16a34a" />
        </group>
      ))}
      {/* DJ booth with speakers */}
      <B p={[9, 0.5, 3]} s={[2.2, 1, 0.8]} c="#18181b" />
      <B p={[9, 1.05, 3]} s={[1.4, 0.1, 0.5]} c="#a1a1aa" />
      <B p={[7.4, 0.9, 3]} s={[0.7, 1.8, 0.7]} c="#27272a" />
      <B p={[10.6, 0.9, 3]} s={[0.7, 1.8, 0.7]} c="#27272a" />
      <B p={[9, 1.9, 3.45]} s={[1.6, 0.4, 0.04]} c="#ec4899" e="#ec4899" />
      <Figure x={9} z={2.4} yaw={0} clip="dance" />
      {/* Bunting between the flagpoles */}
      {Array.from({ length: 16 }, (_, i) => (
        <B key={i} p={[1 + i * 1, 3.4 - Math.sin((i / 15) * Math.PI) * 0.5, 1.2]} s={[0.35, 0.45, 0.04]} c={COLORS[i % COLORS.length]} />
      ))}
      {/* Dancing crowd round the middle */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r = 1.2 + (i % 2) * 0.9;
        const x = 9 + Math.cos(a) * r;
        const z = 6.4 + Math.sin(a) * r * 0.7;
        return <Figure key={i} x={x} z={z} yaw={Math.atan2(9 - x, 6.4 - z)} clip="dance" />;
      })}
    </group>
  );
}

/** A swearing-in or a party convention: a draped stage with a podium, flags down both sides and a cheering crowd. */
export function Rally() {
  return (
    <group>
      <B p={[9, 0.3, 3]} s={[8, 0.6, 2.4]} c="#14532d" />
      <B p={[9, 0.62, 3]} s={[7.6, 0.06, 2.1]} c="#b91c1c" />
      <B p={[9, 2.4, 1.9]} s={[8, 3, 0.1]} c="#f8fafc" />
      <B p={[6.4, 2.4, 1.96]} s={[2.6, 3, 0.04]} c="#15803d" />
      <B p={[11.6, 2.4, 1.96]} s={[2.6, 3, 0.04]} c="#15803d" />
      <B p={[9, 1.15, 3.9]} s={[0.7, 1.1, 0.5]} c="#78350f" />
      <B p={[9, 1.75, 3.9]} s={[0.5, 0.06, 0.3]} c="#facc15" />
      <Figure x={9} z={3.3} y={0.6} yaw={0} clip="wave" />
      {[6.6, 7.6, 10.4, 11.4].map((x) => <Figure key={x} x={x} z={2.7} y={0.6} yaw={0} clip="idle" />)}
      {Array.from({ length: 8 }, (_, i) => {
        const left = i % 2 === 0;
        const x = left ? 1.2 : 16.8;
        const z = 3 + Math.floor(i / 2) * 2;
        return (
          <group key={i} position={[x, 0, z]}>
            <B p={[0, 1.6, 0]} s={[0.06, 3.2, 0.06]} c="#a1a1aa" />
            <B p={[left ? 0.2 : -0.2, 2.9, 0]} s={[0.36, 0.5, 0.03]} c="#15803d" />
            <B p={[left ? 0.5 : -0.5, 2.9, 0]} s={[0.3, 0.5, 0.03]} c="#f8fafc" />
            <B p={[left ? 0.8 : -0.8, 2.9, 0]} s={[0.36, 0.5, 0.03]} c="#15803d" />
          </group>
        );
      })}
      {Array.from({ length: 18 }, (_, i) => (
        <Figure key={i} x={4.5 + (i % 6) * 1.8 + rnd(i + 70) * 0.4} z={6.2 + Math.floor(i / 6) * 1.3 + rnd(i + 90) * 0.3} yaw={Math.PI} clip={i % 3 === 0 ? 'wave' : 'clap'} />
      ))}
    </group>
  );
}

/** Drop inside the Murtala Square interior. */
export function MurtalaEvents() {
  const kind = useKind();
  if (kind === 'protest') return <Protest />;
  if (kind === 'durbar') return <Durbar />;
  if (kind === 'owambe') return <Owambe />;
  if (kind === 'rally') return <Rally />;
  return null;
}
