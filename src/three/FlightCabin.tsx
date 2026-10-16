// In the air: the plane you are sitting in, seen with its roof off, flying through cloud. It stands in for
// the airport while a flight is under way (game/store.ts flightOf). A ticketed flight is a full airliner;
// your own jet (game/cars.ts) has nobody on board but you.

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, DoubleSide, Object3D, PlaneGeometry, Shape, type BufferGeometry, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { taskDurationSeconds, useGame } from '../game/store';
import { usePhoto } from '../game/photo';
import { useLowPerf } from '../game/quality';
import { encodeLook, randomAppearance } from '../game/wardrobe';
import { Person, seatDrop, type Clip } from './Person';
import { Cap, Engine, Fin, Gear, Lamp, ringsBetween, Skin, smoothRings, Wing, type Ring } from './planeKit';
import { FlightTerrain, type FlightMotion } from './FlightTerrain';
import { Baked, KitMeshes } from './cabinKit';
import { airlinerFittings, jetFittings } from './cabinFittings';

type Kind = 'ticket' | 'jet';

/** Cabin length in tiles, nose to tail. The camera frames this (three/Scene.tsx). */
export const CABIN_LENGTH: Record<Kind, number> = { ticket: 15, jet: 11 };
/** The jet's fuselage is a tube: its radius, and how far its centre line sits above the cabin floor (3.4 tiles wide). */
const JET_R = 1.85;
const JET_AXIS = 0.7;

/** Where you sit on each kind of flight: photo mode (three/PhotoRig.tsx) points the camera here, not at the airport you left. */
export const FLIGHT_SEAT: Record<Kind, { x: number; z: number }> = { ticket: { x: 1.75, z: CABIN_LENGTH.ticket / 2 - 2.3 - 2 * 1.45 }, jet: { x: 1.0, z: 1.9 } };

const SEAT_Y = 0.45;
/** How far through the flight the climb ends. */
const CLIMB = 0.18;

const smooth = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** How far through the flight you are, 0 to 1, as the game last ticked it. */
const ticked = () => {
  const t = useGame.getState().task;
  return t && t.total > 0 ? 1 - t.remaining / t.total : 0;
};

/**
 * The game only ticks ten times a second (three/Scene.tsx GameLoop), so `ticked` moves in steps. In the cruise nothing
 * hangs on it, but on the climb and the landing the height, the runway and the nose all do, and they jerked along at
 * ten frames a second however smooth the rest was. This runs it on between ticks at the pace the ticks have been
 * setting, never more than a tick and a half ahead, and works it out once a frame (keyed on the clock) so every part
 * of the plane sees the same moment.
 */
const glide = { frame: -1, p: 0, tickP: -1, tickAt: 0, rate: 0 };
function progress(now: number) {
  if (now === glide.frame) return glide.p;
  const p = ticked();
  // A new flight, or a new canvas whose clock starts again from nothing: start over at the flight's own pace.
  if (p < glide.tickP || now < glide.frame) {
    glide.tickP = -1;
    glide.rate = 0;
  }
  const fresh = glide.tickP < 0;
  if (p !== glide.tickP) {
    const dt = now - glide.tickAt;
    glide.rate = !fresh && dt > 0 ? (p - glide.tickP) / dt : 1 / shape().seconds;
    glide.tickP = p;
    glide.tickAt = now;
  }
  glide.frame = now;
  // Never backwards: a tick that comes in a little behind where the glide had got to just waits for it.
  const next = Math.min(1, p + glide.rate * Math.min(now - glide.tickAt, 0.15));
  glide.p = fresh ? next : Math.max(glide.p, next);
  return glide.p;
}

/**
 * The landing, timed in real seconds so even a five-second hop gets one: the approach (the runway coming up ahead, a
 * glide, the flare) and the roll down the runway after the wheels touch. As shares of the flight: where the descent
 * starts, where the wheels touch, and how long the whole flight is in seconds.
 */
interface Shape3 { descent: number; touch: number; seconds: number }
const APPROACH_S: [number, number] = [3, 9];
const ROLL_S: [number, number] = [1.2, 3.5];
const shape = (): Shape3 => {
  const t = useGame.getState().task;
  const seconds = t && t.total > 0 ? taskDurationSeconds(t.total, t.total, t.fast) : 30;
  const roll = clamp(seconds * 0.14, ...ROLL_S);
  const approach = clamp(seconds * 0.3, ...APPROACH_S);
  const touch = 1 - roll / seconds;
  return { descent: Math.max(CLIMB, touch - approach / seconds), touch, seconds };
};
/** How far along the approach you are: 0 as the descent starts, 1 as the wheels touch. */
const approachOf = (p: number, f: Shape3) => clamp((p - f.descent) / Math.max(1e-6, f.touch - f.descent), 0, 1);
/** 0 on the ground, 1 at cruising height. The approach eases off as it nears the ground: that is the flare. */
const altitude = (p: number, f = shape()) => Math.min(p < CLIMB ? smooth(p / CLIMB) : 1, p >= f.touch ? 0 : 1 - smooth(approachOf(p, f)));
/** How fast the land goes by: slow on the runway, fast once you are up, landing speed on the way in, braking to a crawl after touchdown. */
function groundSpeed(p: number, f: Shape3) {
  if (p >= f.touch) {
    const r = clamp((p - f.touch) / (1 - f.touch), 0, 1);
    return 9 - 7.8 * (1 - (1 - r) * (1 - r));
  }
  const alt = altitude(p, f);
  return p >= f.descent ? 9 + alt * 17 : 6 + alt * 20;
}
/** How far the plane still has to go before the wheels touch (negative once they have): the speed, added up over the time left. */
function toTouch(p: number, f: Shape3) {
  const from = Math.min(p, f.touch);
  const to = Math.max(p, f.touch);
  const n = 16;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += groundSpeed(from + ((i + 0.5) / n) * (to - from), f);
  const d = (sum / n) * (to - from) * f.seconds * 1.6;
  return p <= f.touch ? d : -d;
}

function Seated({ x, z, look, clip = 'sit', me }: { x: number; z: number; look: string; clip?: Clip; me?: boolean }) {
  const clipRef = useRef<Clip>(clip);
  const seated = useRef(true);
  const marker = useRef<Mesh>(null);
  // In photo mode the "this is you" marker stays out of the picture, and so do I when the shot is of the cabin alone.
  const photo = usePhoto((s) => s.active);
  const hidden = usePhoto((s) => !!me && s.active && s.hideMe);
  useFrame(({ clock }) => {
    if (!marker.current) return;
    marker.current.rotation.y = clock.elapsedTime * 1.5;
    marker.current.position.y = 2.0 + Math.sin(clock.elapsedTime * 2) * 0.05;
  });
  return (
    <group position={[x, SEAT_Y - seatDrop(SEAT_Y), z]} visible={!hidden}>
      <Person look={look} clipRef={clipRef} seatedRef={seated} />
      {me && !photo && (
        <mesh ref={marker} scale={[0.12, 0.2, 0.12]}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.6} flatShading />
        </mesh>
      )}
    </group>
  );
}

function Seat({ x, z, colour }: { x: number; z: number; colour: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, SEAT_Y / 2, 0]} castShadow>
        <boxGeometry args={[0.7, SEAT_Y, 0.7]} />
        <meshStandardMaterial color={colour} />
      </mesh>
      <mesh position={[0, SEAT_Y + 0.4, -0.3]} castShadow>
        <boxGeometry args={[0.7, 0.85, 0.14]} />
        <meshStandardMaterial color={colour} />
      </mesh>
    </group>
  );
}

type Cut = [number, number];
/** The arc of hull the cut takes away: over the top, from the camera's side round to the far one. */
const roofOf = (cut: Cut): Cut => [cut[1], cut[0] + Math.PI * 2];
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** A whole fuselage as rings, tail tip to nose tip. `nose` and `tail` are [distance from the cabin, radius, height off the axis]. */
function fuselage(L: number, nose: Ring[], tail: Ring[]): Ring[] {
  return [
    ...smoothRings(tail.map(([z, r, y]): Ring => [-L / 2 - z, r, y])).reverse(),
    ...smoothRings(nose.map(([z, r, y]): Ring => [L / 2 + z, r, y])),
  ];
}

/**
 * The airframe with its roof off: skin up to the cut from tail to nose, the tail and the nose cone closed over,
 * a windscreen standing over the flight deck, and the livery painted on. Drawn around the fuselage's axis.
 */
function Airframe({ L, rings, cut, deck, screen, white, paint, cabinLining, deckLining }: {
  L: number;
  rings: Ring[];
  cut: Cut;
  /** How far ahead of the cabin the open flight deck runs, and where along it the windscreen starts. */
  deck: number;
  screen: number;
  white: string;
  paint: { arc: Cut; colour: string }[];
  cabinLining: { arc: Cut; colour: string; grow: number }[];
  deckLining: string;
}) {
  const parts = useMemo(() => ({
    tail: ringsBetween(rings, -Infinity, -L / 2),
    cabin: ringsBetween(rings, -L / 2, L / 2),
    deck: ringsBetween(rings, L / 2, L / 2 + deck),
    screen: ringsBetween(rings, L / 2 + screen, L / 2 + deck),
    cone: ringsBetween(rings, L / 2 + deck, Infinity),
  }), [rings, L, deck, screen]);
  const roof = useMemo(() => roofOf(cut), [cut]);
  const posts = useMemo(() => [-0.55, 0, 0.55].map((a): Cut => [Math.PI + a - 0.025, Math.PI + a + 0.025]), []);
  return (
    <>
      <Skin rings={rings} arc={cut} colour={white} />
      <Skin rings={parts.tail} arc={roof} colour={white} />
      <Skin rings={parts.cone} arc={roof} colour={white} />
      {paint.map((p, i) => <Skin key={i} rings={rings} arc={p.arc} colour={p.colour} grow={0.014} />)}
      {cabinLining.map((l, i) => <Skin key={i} rings={parts.cabin} arc={l.arc} colour={l.colour} grow={l.grow} inside />)}
      <Skin rings={parts.deck} arc={cut} colour={deckLining} grow={-0.03} inside />
      {/* Windscreen: glass over the flight deck, with its posts and the brow it meets the nose at */}
      <Skin rings={parts.screen} arc={roof} colour="#7dd3fc" glass={0.28} />
      {posts.map((arc, i) => <Skin key={i} rings={parts.screen} arc={arc} colour="#1e293b" grow={0.012} />)}
      <Skin rings={parts.screen.slice(0, 2)} arc={roof} colour="#1e293b" grow={0.012} />
      <Skin rings={parts.cone.slice(0, 2)} arc={roof} colour="#1e293b" grow={0.014} />
      <Cap ring={parts.cone[0]} colour="#1f2937" />
      <Cap ring={parts.tail[parts.tail.length - 1]} colour="#f3f0e8" />
    </>
  );
}

/** How wide the floor is at a ring: the hull is round, so it narrows towards the nose. */
const floorHalf = ([, r, y]: Ring, axis: number) => Math.sqrt(Math.max(0, r * r - (axis + y) * (axis + y)));

const CAPTAIN = encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'suit_navy', bottom: 'trousers_black', shoes: 'loafers_black', head: 'cap_white', eyes: 'shades_black' } });
const FIRST_OFFICER = encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'suit_navy', bottom: 'trousers_black', shoes: 'loafers_black', head: 'cap_white' } });

/** The flight deck ahead of the cabin: two pilots at the controls, the panel glowing under the windscreen. */
function FlightDeck({ L, rings, axis, deck, seats, carpet }: { L: number; rings: Ring[]; axis: number; deck: number; seats: number; carpet: string }) {
  const front = L / 2;
  const floor = useMemo(() => {
    const along = ringsBetween(rings, front, front + deck);
    const s = new Shape();
    along.forEach((ring, i) => { const x = floorHalf(ring, axis) - 0.02; if (i) s.lineTo(x, -ring[0]); else s.moveTo(x, -ring[0]); });
    [...along].reverse().forEach((ring) => s.lineTo(-(floorHalf(ring, axis) - 0.02), -ring[0]));
    s.closePath();
    return s;
  }, [rings, front, deck, axis]);
  const panelZ = front + deck - 0.75;
  const panelHalf = floorHalf(ringsBetween(rings, panelZ, Infinity)[0], axis);
  const spread = Math.min(0.62, panelHalf * 0.5);
  return (
    <group>
      <mesh position={[0, 0.006, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <shapeGeometry args={[floor]} />
        <meshStandardMaterial color={carpet} />
      </mesh>
      {/* The pilots never leave their seats: baked (cabinKit) at the controls, a few draw calls for the pair. */}
      <Baked>
        {[-1, 1].map((side) => <Seated key={side} x={side * spread} z={front + seats} look={side > 0 ? CAPTAIN : FIRST_OFFICER} clip="type" />)}
      </Baked>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Seat x={side * spread} z={front + seats} colour="#1f2937" />
          {/* Control column */}
          <mesh position={[side * spread, 0.62, front + seats + 0.5]} rotation-x={0.5}>
            <boxGeometry args={[0.3, 0.05, 0.05]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>
      ))}
      {/* Throttles between the seats */}
      <mesh position={[0, 0.3, front + seats + 0.25]}>
        <boxGeometry args={[0.32, 0.6, 0.9]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 0.68, front + seats + 0.35]} rotation-x={0.4}>
          <boxGeometry args={[0.05, 0.2, 0.05]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
      ))}
      {/* Instrument panel under a glareshield, its screens tipped towards the pilots */}
      <mesh position={[0, 0.4, panelZ]}>
        <boxGeometry args={[panelHalf * 1.9, 0.8, 0.3]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <group position={[0, 0.84, panelZ - 0.08]} rotation-x={-0.75}>
        <mesh>
          <boxGeometry args={[panelHalf * 1.9, 0.05, 0.5]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {[-0.62, -0.22, 0.22, 0.62].map((k, i) => (
          <mesh key={k} position={[k * panelHalf, 0.03, 0]}>
            <boxGeometry args={[panelHalf * 0.3, 0.012, 0.3]} />
            <meshStandardMaterial color={i % 2 ? '#22d3ee' : '#4ade80'} emissive={i % 2 ? '#0891b2' : '#16a34a'} emissiveIntensity={1.4} />
          </mesh>
        ))}
      </group>
      <pointLight position={[0, 1.5, front + seats]} color="#bfdbfe" intensity={2.5} distance={5} decay={1.4} />
    </group>
  );
}

/**
 * The wall between cabin and flight deck, standing as high as the hull does on each side, with the doorway in the
 * middle. Drawn around the fuselage's axis.
 */
function Partition({ z, r, axis, cut, door, colour, trim }: { z: number; r: number; axis: number; cut: Cut; door: number; colour: string; trim: string }) {
  const [far, near] = useMemo(() => [cut[0], cut[1]].map((edge) => {
    const side = Math.sign(edge);
    const foot = side * Math.acos(axis / r);
    const s = new Shape();
    for (let j = 0; j <= 14; j++) {
      const a = lerp(foot, edge, j / 14);
      const x = r * Math.sin(a);
      const y = -r * Math.cos(a);
      if (j) s.lineTo(x, y); else s.moveTo(x, y);
    }
    s.lineTo(side * door, -r * Math.cos(edge));
    s.lineTo(side * door, -axis);
    s.closePath();
    return s;
  }), [r, axis, cut, door]);
  const top = -r * Math.cos(cut[0]);
  return (
    <group position={[0, 0, z]}>
      {[far, near].map((shape, i) => (
        <mesh key={i}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={colour} side={DoubleSide} />
        </mesh>
      ))}
      {/* Door frame on the tall side */}
      <mesh position={[-door, (top - axis) / 2, 0]}>
        <boxGeometry args={[0.08, top + axis, 0.1]} />
        <meshStandardMaterial color={trim} />
      </mesh>
    </group>
  );
}

/** The undercarriage: down on the runway, up once you are climbing, and down again early on the approach. */
function WheelsDown({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const p = progress(clock.elapsedTime);
    const f = shape();
    group.current.visible = p < CLIMB ? altitude(p, f) < 0.22 : p >= f.descent && approachOf(p, f) > 0.3;
  });
  return <group ref={group}>{children}</group>;
}

/** The airliner's fuselage is a tube too: its radius, and how far its centre line sits above the cabin floor. */
const AIR_R = 2.55;
const AIR_AXIS = 0.95;
/** Where the roof is cut away: high on the far side, low on the camera's, so you see in. */
const AIR_CUT: Cut = [-2.15, 1.39];
const AIR_WHITE = '#f8fafc';
const AIR_GREEN = '#15803d';
const AIR_BELLY = '#cbd5e1';
const AIR_RINGS = fuselage(CABIN_LENGTH.ticket,
  [[0, 2.55, 0], [0.7, 2.53, -0.01], [1.5, 2.38, -0.08], [2.3, 2.05, -0.22], [3.0, 1.6, -0.4], [3.6, 1.08, -0.58], [4.05, 0.6, -0.72], [4.32, 0.25, -0.8], [4.42, 0, -0.83]],
  [[0, 2.55, 0], [0.9, 2.53, 0.01], [2.0, 2.35, 0.14], [3.2, 1.95, 0.42], [4.4, 1.45, 0.78], [5.4, 1.0, 1.1], [6.2, 0.6, 1.36], [6.8, 0.25, 1.55], [7.0, 0, 1.62]]);
const AIR_PAINT = [
  { arc: [-0.85, 0.85] as Cut, colour: AIR_BELLY },
  { arc: [0.98, 1.13] as Cut, colour: AIR_GREEN },
  { arc: [1.19, 1.23] as Cut, colour: '#22c55e' },
];
const AIR_LINING = [
  { arc: [AIR_CUT[0], -Math.acos(AIR_AXIS / AIR_R)] as Cut, colour: '#eef2f6', grow: -0.03 },
  { arc: [-1.5, -Math.acos(AIR_AXIS / AIR_R)] as Cut, colour: '#94a3b8', grow: -0.05 },
];
/** Wheels stand this far below the cabin floor (the ground comes up to meet them: Sky). */
const GROUND: Record<Kind, number> = { ticket: -3.0, jet: -2.25 };

/** The airliner with its roof off: a round fuselage, the flight deck up front, swept wings with an engine under each, and a tall fin in the flag's colours. */
function Hull() {
  const L = CABIN_LENGTH.ticket;
  const R = AIR_R;
  const finAt = (y: number): [number, number] => [lerp(-L / 2 - 2.2, -L / 2 - 5.2, (y - 3.3) / 3.3), lerp(-L / 2 - 6.3, -L / 2 - 6.7, (y - 2.8) / 3.8)];
  return (
    <group>
      <group position-y={AIR_AXIS}>
        <Airframe L={L} rings={AIR_RINGS} cut={AIR_CUT} deck={3.0} screen={1.5} white={AIR_WHITE} paint={AIR_PAINT} cabinLining={AIR_LINING} deckLining="#64748b" />
        <Partition z={L / 2} r={R - 0.03} axis={AIR_AXIS} cut={AIR_CUT} door={0.5} colour="#e2e8f0" trim="#94a3b8" />
      </group>
      <FlightDeck L={L} rings={AIR_RINGS} axis={AIR_AXIS} deck={3.0} seats={1.25} carpet="#1e293b" />
      {/* The floor, the windows, the bins and everything else inside are the Airliner's fittings. */}
      {/* Wings, swept back, with an engine slung under each and a green winglet */}
      <mesh position={[0, -1.0, 0.2]} scale={[2.7, 0.85, 4.4]}>
        <sphereGeometry args={[1, 24, 14]} />
        <meshStandardMaterial color={AIR_BELLY} />
      </mesh>
      {[-1, 1].map((side) => (
        <Wing key={side} side={side} at={[side * 1.9, -0.95, 0.4]} span={8.8} root={[2.4, -2.3]} tip={[-3.2, -4.5]} thick={0.2} rise={0.07} colour={AIR_WHITE}>
          <Engine at={[3.1, -0.78, 1.5]} r={0.7} length={3.0} colour="#e2e8f0" band={AIR_GREEN} />
          <mesh position={[3.1, -0.22, 0.9]}>
            <boxGeometry args={[0.16, 0.55, 2.0]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <Fin outline={[[-3.2, 0], [-4.35, 1.5], [-4.8, 1.5], [-4.5, 0]]} at={[8.72, 0.12, 0]} thick={0.1} colour={AIR_GREEN} lean={0.25} />
          <Lamp at={[8.78, 0.2, -3.5]} colour={side > 0 ? '#ef4444' : '#22c55e'} />
          <Lamp at={[8.7, 0.2, -4.4]} colour="#ffffff" every={1.4} r={0.07} />
        </Wing>
      ))}
      {/* Tail: the fin in green, white, green, and the tailplane either side of it */}
      <Fin outline={[[-L / 2 - 2.2, 3.3], [-L / 2 - 5.2, 6.6], [-L / 2 - 6.7, 6.6], [-L / 2 - 6.3, 2.8]]} thick={0.18} colour={AIR_GREEN} />
      <Fin outline={[[finAt(4.4)[0], 4.4], [finAt(5.4)[0], 5.4], [finAt(5.4)[1], 5.4], [finAt(4.4)[1], 4.4]]} thick={0.2} colour={AIR_WHITE} />
      {[-1, 1].map((side) => (
        <Wing key={side} side={side} at={[side * 0.7, AIR_AXIS + 1.15, -L / 2 - 4.4]} span={4.0} root={[1.2, -1.0]} tip={[-1.4, -2.3]} thick={0.12} rise={0.1} colour={AIR_WHITE} seams={null} />
      ))}
      <Lamp at={[0, 6.7, -L / 2 - 5.95]} colour="#ef4444" every={1.1} />
      <WheelsDown>
        <Gear at={[0, -1.4, L / 2 + 1.2]} ground={GROUND.ticket} wheel={0.36} pair={0.24} />
        {[-2.3, 2.3].map((x) => <Gear key={x} at={[x, -1.0, -0.7]} ground={GROUND.ticket} wheel={0.45} />)}
      </WheelsDown>
      {/* Cabin lights, so a night flight is not a black box */}
      <pointLight position={[0, 2.4, L / 4]} color="#ffe8c2" intensity={5} distance={10} decay={1.4} />
      <pointLight position={[0, 2.4, -L / 4]} color="#ffe8c2" intensity={5} distance={10} decay={1.4} />
    </group>
  );
}

/** Cabin crew pacing the aisle with the trolley. */
function Attendant({ length }: { length: number }) {
  const group = useRef<Group>(null!);
  const clip = useRef<Clip>('walk');
  const look = useMemo(() => encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'blouse_yellow', bottom: 'skirt_navy', shoes: 'slippers_black' } }), []);
  useFrame(({ clock }) => {
    // Up the aisle, a pause to serve, back down, and again.
    const span = length / 2 - 1.6;
    const t = (clock.elapsedTime * 0.09) % 1;
    const leg = t < 0.5 ? t * 2 : (1 - t) * 2;
    const k = Math.min(1, Math.max(0, (leg - 0.1) / 0.8));
    group.current.position.z = -span + k * span * 2;
    group.current.rotation.y = t < 0.5 ? 0 : Math.PI;
    clip.current = leg < 0.1 || leg > 0.9 ? 'talk' : 'walk';
  });
  return (
    <group ref={group}>
      <Person look={look} clipRef={clip} />
    </group>
  );
}

function Airliner({ myLook }: { myLook: string }) {
  const L = CABIN_LENGTH.ticket;
  const low = useLowPerf();
  const rows = useMemo(() => Array.from({ length: 8 }, (_, i) => L / 2 - 2.3 - i * 1.45), [L]);
  const cols = [-1.75, -1.0, 1.0, 1.75];
  // You have a window seat a few rows back; most of the other seats are taken.
  const mine = { row: 2, col: 3 };
  const others = useMemo(() => {
    const clips: Clip[] = ['sit', 'sit', 'sit', 'talk', 'type'];
    return rows.flatMap((z, r) => cols.map((x, c) => ({ x, z, r, c })))
      .filter((s) => !(s.r === mine.row && s.c === mine.col) && Math.random() < (low ? 0.3 : 0.72))
      .map((s) => ({ ...s, look: encodeLook(randomAppearance()), clip: clips[Math.floor(Math.random() * clips.length)] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [low]);
  const fittings = useMemo(() => airlinerFittings({
    L, R: AIR_R, axis: AIR_AXIS, rows, cols, business: 2, seatY: SEAT_Y,
    windows: Array.from({ length: Math.floor(L / 1.2) }, (_, i) => -L / 2 + 0.9 + i * 1.2),
    tilt: Math.asin((1.25 - AIR_AXIS) / (AIR_R - 0.06)), windowR: AIR_R - 0.06,
  }, low), [L, rows, low]);
  return (
    <>
      <KitMeshes kit={fittings} />
      {/* Everyone else stays put the whole flight: baked into a few meshes (cabinKit), not a few dozen each. Their
          shadows are left out: hidden under them and the seats, and a full plane of them was a lot to draw twice. */}
      <Baked key={others.length} shadows={false}>
        {others.map((o) => <Seated key={`${o.r}:${o.c}`} x={o.x} z={o.z} look={o.look} clip={o.clip} />)}
      </Baked>
      <Seated x={FLIGHT_SEAT.ticket.x} z={FLIGHT_SEAT.ticket.z} look={myLook} me />
      <Attendant length={L} />
    </>
  );
}

type V3 = [number, number, number];
const JET_WHITE = '#f8fafc';
const NAVY = '#10284a';
const GOLD = '#d4af37';
/** The state's jet (game/civic.ts STATE_FLEET) wears green cheatlines instead of gold and navy. */
const STATE_GREEN = '#15803d';
const WALNUT = '#5b3a1e';
const LEATHER = '#ead9b8';
const LEATHER_DARK = '#cdb588';

const JET_CUT: Cut = [-2.4, 1.46];
const JET_FLOOR_EDGE = -Math.acos(JET_AXIS / JET_R);
const JET_RINGS = fuselage(CABIN_LENGTH.jet,
  [[0, 1.85, 0], [0.6, 1.83, -0.01], [1.3, 1.72, -0.06], [2.0, 1.5, -0.16], [2.7, 1.17, -0.3], [3.3, 0.8, -0.44], [3.8, 0.42, -0.56], [4.1, 0.15, -0.63], [4.2, 0, -0.65]],
  [[0, 1.85, 0], [0.6, 1.84, 0.01], [1.4, 1.7, 0.1], [2.25, 1.4, 0.3], [3.1, 1.03, 0.55], [3.9, 0.68, 0.8], [4.6, 0.36, 1.0], [5.05, 0.14, 1.12], [5.2, 0, 1.17]]);
const JET_LINING = [
  { arc: [JET_CUT[0], JET_FLOOR_EDGE] as Cut, colour: '#f3e9d6', grow: -0.03 },
  { arc: [-1.45, JET_FLOOR_EDGE] as Cut, colour: WALNUT, grow: -0.05 },
  { arc: [-1.5, -1.45] as Cut, colour: GOLD, grow: -0.06 },
];
const WINDOW_TILT = 0.31;
const WINDOW_R = JET_R - 0.06;

/** The jet with its roof off: a long pointed nose over the flight deck, a navy belly under a gold line, low swept wings with winglets, engines on the tail and a T-tail. */
function JetHull({ official }: { official?: boolean }) {
  const L = CABIN_LENGTH.jet;
  const dark = official ? STATE_GREEN : NAVY;
  const line = official ? '#e2e8f0' : GOLD;
  const paint = useMemo(() => [{ arc: [-1.12, 1.12] as Cut, colour: dark }, { arc: [1.17, 1.23] as Cut, colour: line }], [dark, line]);
  const tail = -L / 2;
  return (
    <group>
      <group position-y={JET_AXIS}>
        <Airframe L={L} rings={JET_RINGS} cut={JET_CUT} deck={2.7} screen={1.3} white={JET_WHITE} paint={paint} cabinLining={JET_LINING} deckLining="#57534e" />
        <Partition z={L / 2} r={JET_R - 0.03} axis={JET_AXIS} cut={JET_CUT} door={0.45} colour="#f3e9d6" trim={WALNUT} />
      </group>
      <FlightDeck L={L} rings={JET_RINGS} axis={JET_AXIS} deck={2.7} seats={1.0} carpet="#3f2a1d" />
      {/* The floor and the windows are the jet's fittings (PrivateJet). */}
      {/* The door to the tail, in the rear bulkhead */}
      <mesh position={[0.9, 0.8, tail + 0.01]}>
        <planeGeometry args={[0.7, 1.6]} />
        <meshStandardMaterial color={WALNUT} />
      </mesh>
      {/* T-tail: a swept fin with a band across it, the tailplane on top */}
      <Fin outline={[[tail - 1.9, 2.2], [tail - 4.0, 4.5], [tail - 5.1, 4.5], [tail - 4.4, 1.9]]} thick={0.16} colour={dark} />
      <Fin outline={[[tail - 2.99, 3.4], [tail - 3.3, 3.74], [tail - 4.86, 3.74], [tail - 4.76, 3.4]]} thick={0.18} colour={line} />
      {[-1, 1].map((side) => (
        <Wing key={side} side={side} at={[side * 0.05, 4.45, tail - 4.45]} span={2.7} root={[0.75, -0.6]} tip={[-0.9, -1.5]} thick={0.09} rise={0.03} colour={JET_WHITE} seams={null} />
      ))}
      <mesh position={[0, 4.52, tail - 4.4]} scale={[0.16, 0.16, 0.95]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={line} metalness={0.5} roughness={0.35} />
      </mesh>
      <Lamp at={[0, 4.7, tail - 4.4]} colour="#ef4444" every={1.1} r={0.07} />
      {/* An engine either side of the tail, on a stub */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Engine at={[side * 2.55, JET_AXIS + 0.75, tail - 1.5]} r={0.52} length={2.5} colour={JET_WHITE} band={dark} />
          <mesh position={[side * 1.85, JET_AXIS + 0.7, tail - 1.6]}>
            <boxGeometry args={[1.0, 0.12, 1.3]} />
            <meshStandardMaterial color={JET_WHITE} />
          </mesh>
        </group>
      ))}
      {/* Low swept wings with tall winglets */}
      <mesh position={[0, -0.75, -0.2]} scale={[1.75, 0.5, 2.8]}>
        <sphereGeometry args={[1, 20, 12]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      {[-1, 1].map((side) => (
        <Wing key={side} side={side} at={[side * 1.2, -0.72, -0.2]} span={6.6} root={[1.5, -1.5]} tip={[-2.3, -3.2]} thick={0.12} rise={0.06} colour={JET_WHITE}>
          <Fin outline={[[-2.3, 0], [-3.1, 1.25], [-3.4, 1.25], [-3.2, 0]]} at={[6.56, 0.08, 0]} thick={0.07} colour={dark} lean={0.2} />
          <Lamp at={[6.62, 0.14, -2.5]} colour={side > 0 ? '#ef4444' : '#22c55e'} r={0.07} />
          <Lamp at={[6.56, 0.14, -3.1]} colour="#ffffff" every={1.4} r={0.06} />
        </Wing>
      ))}
      <WheelsDown>
        <Gear at={[0, -0.9, L / 2 + 1.3]} ground={GROUND.jet} wheel={0.26} pair={0.18} />
        {[-1.7, 1.7].map((x) => <Gear key={x} at={[x, -0.65, -0.9]} ground={GROUND.jet} wheel={0.32} pair={0.22} />)}
      </WheelsDown>
      {/* Warm cabin lights: the club seats, the lounge and the bedroom */}
      <pointLight position={[0, 2.3, 2.8]} color="#ffe8c2" intensity={5} distance={9} decay={1.4} />
      <pointLight position={[0, 2.3, -0.6]} color="#ffe8c2" intensity={5} distance={9} decay={1.4} />
      <pointLight position={[0.4, 1.8, -4.3]} color="#ffd9a0" intensity={3.5} distance={7} decay={1.4} />
    </group>
  );
}

/**
 * Your own jet, nose to tail: four leather club seats round walnut tables, a lounge with a divan, a bar and a television,
 * and a bedroom at the back, in walnut, cream leather and soft light (three/cabinFittings.ts). Only you on board.
 */
function PrivateJet({ myLook }: { myLook: string }) {
  const low = useLowPerf();
  const L = CABIN_LENGTH.jet;
  const fittings = useMemo(() => jetFittings({
    L, R: JET_R, axis: JET_AXIS,
    windows: Array.from({ length: Math.floor((L - 1) / 1.25) }, (_, i) => -L / 2 + 0.9 + i * 1.25),
    tilt: WINDOW_TILT, windowR: WINDOW_R,
    colours: { navy: NAVY, gold: GOLD, walnut: WALNUT, leather: LEATHER, leatherDark: LEATHER_DARK },
  }, low), [L, low]);
  return (
    <>
      <KitMeshes kit={fittings} />
      <Seated x={FLIGHT_SEAT.jet.x} z={FLIGHT_SEAT.jet.z} look={myLook} me />
    </>
  );
}

const PUFFS: [number, number, number, number][] = [[0, 0, 0, 1.6], [1.5, -0.2, 0.4, 1.2], [-1.4, -0.1, -0.3, 1.3], [0.4, 0.5, -0.2, 1.1]];
/** How far the runway lies over the ground the land is on. */
const RUNWAY = 0.74;
/** The runway: its length, its half width, and how far past its start the wheels touch down. */
const RW_LEN = 420;
const RW_HALF = 9;
const TOUCHDOWN_PAST = 30;
/** Where the runway sits at touchdown: its start TOUCHDOWN_PAST behind the wheels. */
const RW_AT_TOUCH = RW_LEN / 2 - TOUCHDOWN_PAST;
const DASHES = Array.from({ length: 28 }, (_, i) => -RW_LEN / 2 + 7.5 + i * 15);
const EDGE_LIGHTS = Array.from({ length: 22 }, (_, i) => -RW_LEN / 2 + 5 + i * 19.5);
/** The approach lights reach back from the start of the runway, so you see where to aim long before you get there. */
const APPROACH_LIGHTS = Array.from({ length: 9 }, (_, i) => -RW_LEN / 2 - 8 - i * 9);
/** Where the main wheels meet the runway, as offsets from the plane's centre line. */
const MAIN_GEAR: Record<Kind, number> = { ticket: 2.3, jet: 1.7 };

/**
 * Many copies of one small shape baked into a single mesh. The runway's markings and lights were a mesh each, well
 * over a hundred with a material each, and the phone paid for every one of them all through the climb and the landing.
 */
function copies(make: () => BufferGeometry, at: V3[]) {
  return mergeGeometries(at.map(([x, y, z]) => make().translate(x, y, z)))!;
}
/** A flat strip lying on the runway, `w` across and `d` along it. */
const strip = (w: number, d: number) => () => new PlaneGeometry(w, d).rotateX(-Math.PI / 2);
const box = (s: number, h = s) => () => new BoxGeometry(s, h, s);
/** Built once and kept: every flight lands on the same runway. */
const RW_SHAPES = {
  edges: copies(strip(0.3, RW_LEN), [[-(RW_HALF - 0.8), 0.005, 0], [RW_HALF - 0.8, 0.005, 0]]),
  dashes: copies(strip(0.4, 7), DASHES.map((z): V3 => [0, 0.005, z])),
  // The start of the runway: the white "piano keys", and the aiming bars where the wheels should land.
  keys: mergeGeometries([
    copies(strip(0.7, 9), [-1, 1].flatMap((side) => [1.2, 2.6, 4, 5.4, 6.8].map((x): V3 => [side * x, 0.006, -RW_LEN / 2 + 6]))),
    copies(strip(2.2, 11), [-1, 1].map((side): V3 => [side * 4.2, 0.006, -RW_LEN / 2 + TOUCHDOWN_PAST])),
  ])!,
  // Edge lights down both sides, and the approach lights reaching back from the start, bright enough to see from the air.
  edgeLights: copies(box(0.25, 0.3), [-1, 1].flatMap((side) => EDGE_LIGHTS.map((z): V3 => [side * (RW_HALF + 0.5), 0.15, z]))),
  approachLights: copies(box(0.3), APPROACH_LIGHTS.flatMap((z, i) => [-2.4, -1.2, 0, 1.2, 2.4].slice(i % 2 ? 1 : 0, i % 2 ? 4 : 5).map((x): V3 => [x, 0.2, z]))),
};

const puff = new Object3D();

/** Cloud streaming past, the runway under the wheels, and the land (three/FlightTerrain.tsx) dropping away below on the climb and coming back up to land. */
function Sky({ kind, floor }: { kind: Kind; floor: number }) {
  const clouds = useRef<InstancedMesh>(null!);
  const ground = useRef<Group>(null!);
  const runway = useRef<Group>(null!);
  const dashes = useRef<Mesh>(null!);
  const smoke = useRef<Group>(null!);
  const smokeMat = useRef<MeshStandardMaterial>(null!);
  const tarmac = useRef<MeshStandardMaterial>(null!);
  const marks = useRef<MeshStandardMaterial>(null!);
  const low = useLowPerf();
  const spots = useMemo(() => Array.from({ length: low ? 10 : 22 }, (_, i) => {
    // Kept clear of the hull, and on the camera's side kept below it, so cloud never drifts across the cabin.
    const near = i % 2 === 1;
    return { x: (near ? 1 : -1) * (12 + Math.random() * 34), y: near ? -13 + Math.random() * 8 : -9 + Math.random() * 9, z: -70 + Math.random() * 140, s: 0.9 + Math.random() * 1.6 };
  }), [low]);
  const motion = useRef<FlightMotion>({ travel: 0, alt: 0, progress: 0 });
  const warm = useRef(true);
  useFrame(({ clock }, dt) => {
    const p = progress(clock.elapsedTime);
    const f = shape();
    const alt = altitude(p, f);
    const step = Math.min(dt, 0.1);
    const speed = groundSpeed(p, f);
    // The clouds are one instanced mesh, every puff of every cloud a copy, so they cost one draw, not one per puff.
    const shown = alt > 0.25;
    spots.forEach((c, i) => {
      c.z -= speed * step;
      if (c.z < -70) c.z += 140;
      if (!shown) return;
      PUFFS.forEach(([x, y, z, r], j) => {
        puff.position.set(c.x + x * c.s, c.y + y * c.s, c.z + z * c.s);
        puff.scale.set(r * c.s, r * 0.6 * c.s, r * c.s);
        puff.updateMatrix();
        clouds.current.setMatrixAt(i * PUFFS.length + j, puff.matrix);
      });
    });
    clouds.current.instanceMatrix.needsUpdate = shown;
    // On the very first frame they are drawn with no copies at all: that builds their shader as the flight opens, not
    // a moment into the climb, where building it stalled a phone.
    const first = warm.current;
    warm.current = false;
    clouds.current.count = first && !shown ? 0 : spots.length * PUFFS.length;
    clouds.current.visible = shown || first;
    // The land slides back under you, and the runway lies over it: on the ground the wheels stand on it.
    ground.current.position.y = floor - RUNWAY - alt * 48;
    motion.current.travel += speed * 1.6 * step;
    motion.current.alt = alt;
    motion.current.progress = p;
    const landing = p >= f.descent;
    let fade: number;
    if (landing) {
      // The destination's runway: far ahead as the descent starts, coming up to meet the wheels, then rolling away under them.
      runway.current.position.z = RW_AT_TOUCH + toTouch(p, f);
      dashes.current.position.z = 0;
      fade = smooth(approachOf(p, f) / 0.15);
    } else {
      // Taking off: the runway stays under you and its centre line streams past.
      runway.current.position.z = 0;
      dashes.current.position.z -= speed * 1.6 * step;
      if (dashes.current.position.z < -15) dashes.current.position.z += 15;
      // It is left behind as you climb: it fades into the land rather than following you there.
      fade = 1 - smooth(alt / 0.3);
    }
    runway.current.visible = fade > 0.01;
    tarmac.current.opacity = fade;
    marks.current.opacity = fade;
    // Tyre smoke: the wheels hit the runway and leave two puffs behind on it.
    const since = p >= f.touch ? (p - f.touch) * f.seconds : -1;
    const puffing = since >= 0 && since < 1.1;
    smoke.current.visible = puffing;
    if (puffing) {
      const k = since / 1.1;
      smoke.current.scale.setScalar(0.4 + k * 1.6);
      smokeMat.current.opacity = 0.55 * (1 - k);
    }
  });
  const gear = MAIN_GEAR[kind];
  return (
    <>
      <instancedMesh key={spots.length} ref={clouds} args={[undefined, undefined, spots.length * PUFFS.length]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#dbeafe" emissiveIntensity={0.35} flatShading />
      </instancedMesh>
      <group ref={ground}>
        <FlightTerrain motion={motion} />
        <group ref={runway} position={[0, RUNWAY - 0.006, 0]}>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[RW_HALF * 2, RW_LEN]} />
            <meshStandardMaterial ref={tarmac} color="#3f3f46" transparent />
          </mesh>
          <mesh geometry={RW_SHAPES.edges}>
            <meshStandardMaterial ref={marks} color="#f8fafc" transparent />
          </mesh>
          <mesh ref={dashes} geometry={RW_SHAPES.dashes}>
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          <mesh geometry={RW_SHAPES.keys}>
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          <mesh geometry={RW_SHAPES.edgeLights}>
            <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={1.2} />
          </mesh>
          <mesh geometry={RW_SHAPES.approachLights}>
            <meshStandardMaterial color="#ffffff" emissive="#e0f2fe" emissiveIntensity={1.5} />
          </mesh>
          <group ref={smoke} position={[0, 0.5, -RW_LEN / 2 + TOUCHDOWN_PAST]} visible={false}>
            {[-gear, gear].map((x) => (
              <mesh key={x} position={[x, 0, 0]} scale={[1, 0.6, 1.6]}>
                <sphereGeometry args={[0.6, 10, 8]} />
                <meshStandardMaterial ref={x < 0 ? smokeMat : undefined} color="#e5e7eb" transparent opacity={0} depthWrite={false} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </>
  );
}

export function FlightCabin({ kind }: { kind: Kind }) {
  const plane = useRef<Group>(null!);
  const myLook = useGame((s) => s.look);
  const official = useGame((s) => !!s.task?.official);
  useFrame(({ clock }) => {
    const p = progress(clock.elapsedTime);
    const f = shape();
    const t = clock.elapsedTime;
    const alt = altitude(p, f);
    const u = approachOf(p, f);
    // Seconds since the wheels touched (negative before).
    const since = (p - f.touch) * f.seconds;
    let pitch = 0;
    let bank = 0;
    if (p < CLIMB) pitch = Math.sin((p / CLIMB) * Math.PI) * 0.1;
    else if (p >= f.touch) pitch = 0.055 * (1 - smooth(since / 0.8)); // the nose comes down onto its wheel
    else if (p >= f.descent) {
      // Nose a touch down on the glide, then up for the flare just before the wheels touch.
      pitch = u < 0.7 ? -0.035 * smooth(u / 0.2) : -0.035 + 0.09 * smooth((u - 0.7) / 0.3);
      // A gentle bank early on, turning to line up with the runway.
      bank = 0.07 * Math.sin(clamp(u / 0.45, 0, 1) * Math.PI);
    }
    // The touchdown bump, then the runway rumbling under the wheels for as long as you are rolling on it.
    const bump = since >= 0 ? -0.07 * Math.sin(Math.min(since * 9, Math.PI)) * Math.exp(-since * 2.5) : 0;
    const rumble = alt === 0 ? Math.sin(t * 47) * 0.006 * Math.min(1, groundSpeed(p, f) / 6) : 0;
    plane.current.rotation.x = -pitch;
    plane.current.rotation.z = bank + Math.sin(t * 0.5) * 0.015 * alt;
    plane.current.position.y = Math.sin(t * 0.9) * 0.05 * alt + bump + rumble;
  });
  return (
    <>
      <Sky kind={kind} floor={GROUND[kind]} />
      <group ref={plane}>
        {kind === 'jet' ? <JetHull official={official} /> : <Hull />}
        {kind === 'jet' ? <PrivateJet myLook={myLook} /> : <Airliner myLook={myLook} />}
      </group>
    </>
  );
}
