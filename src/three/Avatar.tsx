import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { usePhoto } from '../game/photo';
import { Group, Mesh, MeshBasicMaterial } from 'three';
import { avatar, avatarView } from '../game/avatar';
import { mapGroundY } from '../game/city';
import { moodOf, useGame } from '../game/store';
import { NEEDS } from '../game/catalog';
import { useNet } from '../net/multiplayer';
import { ChatBubble } from '../ui/ChatBubble';
import { Person, seatDrop, type Clip } from './Person';
import { useVisit } from '../game/visits';
import { sceneFor } from '../game/streetScenes';
import { driveState } from '../game/driveState';
import { onMap, routeSpeed } from '../game/travelProgress';
import { flyHeli } from '../game/heli';

export const TARGET_HEIGHT = 1.7;
/** People on the town map, shrunk to match the cars and houses (the plumbob still marks you out). */
export const MAP_SCALE = 0.5;
export { onMap };

export type { Clip };

/** Floating diamond over the head, coloured by mood (a nod to The Sims). */
function Plumbob() {
  const ref = useRef<Mesh>(null!);
  const color = useGame((s) => moodOf(s.needs).color);
  useFrame(({ clock }) => {
    ref.current.rotation.y = clock.elapsedTime * 1.5;
    // On the map the body is small, so the diamond grows to keep you easy to spot.
    const k = !useVisit.getState().current && onMap(useGame.getState().view) ? 2.6 : 1;
    ref.current.scale.set(0.12 * k, 0.2 * k, 0.12 * k);
    ref.current.position.y = TARGET_HEIGHT + 0.45 * k + Math.sin(clock.elapsedTime * 2) * 0.05 * k;
  });
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} flatShading />
    </mesh>
  );
}

/** My own chat line, shown over my head like everyone else's. */
/** On the map: a ring pulsing out from under your feet so you can spot yourself. */
function MapBeacon() {
  const ring = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const on = !useVisit.getState().current && onMap(useGame.getState().view);
    ring.current.visible = on;
    if (!on) return;
    const p = (clock.elapsedTime * 0.8) % 1;
    ring.current.scale.setScalar(0.4 + p * 0.9);
    (ring.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - p);
  });
  return (
    <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[1.05, 1.25, 40]} />
      <meshBasicMaterial color="#fde047" transparent depthWrite={false} />
    </mesh>
  );
}

/** What your character is thinking when a need gets urgent (worst one only, so it never clutters the view). */
const THOUGHTS: Record<string, string> = {
  hunger: 'I’m starving…',
  energy: 'So tired…',
  fun: 'I’m bored',
  social: 'I need people',
  hygiene: 'I need a bath',
  bladder: 'I need the toilet!',
};
function ThoughtBubble() {
  const key = useGame((s) => {
    const worst = NEEDS.reduce((w, n) => (s.needs[n.key] < s.needs[w.key] ? n : w), NEEDS[0]);
    return s.needs[worst.key] < 25 ? worst.key : '';
  });
  const chatting = useNet((s) => !!(s.myId && s.bubbles[s.myId]));
  if (!key || chatting) return null;
  const need = NEEDS.find((n) => n.key === key)!;
  return (
    // Pinned by its bottom edge (dot trail included), not its middle: the bubble's size in world units grows as the
    // screen gets shorter, and a centred one sinks its dots into the head and the plumbob on a phone.
    <Html position={[0, TARGET_HEIGHT + 1, 0]} distanceFactor={14} zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
      <div className="thought-anchor">
        <div className="thought">
          <span>{need.icon}</span>
          {THOUGHTS[key]}
          <i /><i />
        </div>
      </div>
    </Html>
  );
}

function MyBubble() {
  const bubble = useNet((s) => (s.myId ? s.bubbles[s.myId] : undefined));
  if (!bubble) return null;
  return (
    <Html position={[0, TARGET_HEIGHT + 0.8, 0]} center distanceFactor={14} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="nametag">
        <ChatBubble text={bubble.text} />
      </div>
    </Html>
  );
}

export function Avatar() {
  const look = useGame((s) => s.look);
  const photo = usePhoto((s) => s.active);
  const group = useRef<Group>(null!);
  const body = useRef<Group>(null!);
  const clip = useRef<Clip>('idle');
  const seated = useRef(false);

  useFrame((_, dt) => {
    const s = useGame.getState();
    const a = avatar;
    if (a.recoverAt && Date.now() >= a.recoverAt) {
      a.pose = 'stand';
      a.snap = null;
      a.recoverAt = 0;
    }
    let moving = false;

    // A street story stops you in your tracks until you have dealt with it.
    const stopped = !!s.streetStory;
    // A helicopter flies its own way there (game/heli.ts): up, across in a straight line, and down at the door.
    const flying = s.view === 'city' && s.task?.actionId === 'enter' && s.task.phase === 'walking' && s.task.travelMode === 'helicopter';
    if (flying && a.path.length) {
      if (!stopped) flyHeli(Math.min(dt, 0.1));
      moving = true;
    } else if (a.path.length && !stopped) {
      const next = a.path[0];
      const tx = next.x + 0.5;
      const tz = next.z + 0.5;
      const dx = tx - a.x;
      const dz = tz - a.z;
      const dist = Math.hypot(dx, dz);
      const visiting = !!useVisit.getState().current;
      // The same pace the trip card in the HUD times you by (game/travelProgress.ts).
      const step = Math.min(dt, 0.1) * routeSpeed(s.view, s.task, visiting);
      if (dist <= step) {
        a.x = tx;
        a.z = tz;
        a.path.shift();
        if (a.storyAt !== null && a.path.length <= a.storyAt) {
          a.storyAt = null;
          if (s.task?.actionId === 'enter') s.maybeStory(1);
        }
        if (!a.path.length && a.onArrive) {
          const f = a.onArrive;
          a.onArrive = null;
          f();
        }
      } else {
        a.x += (dx / dist) * step;
        a.z += (dz / dist) * step;
        a.yaw = Math.atan2(dx, dz);
      }
      moving = true;
    }

    const g = group.current;
    const b = body.current;
    g.scale.setScalar(!useVisit.getState().current && onMap(s.view) ? MAP_SCALE : 1);
    const doing = s.task?.phase === 'doing';
    const riding = s.view === 'city' && s.task?.actionId === 'enter' && s.task.phase === 'walking' && (s.task.travelMode ?? 'walk') !== 'walk';
    // Driving: the vehicle (three/Drive.tsx) is drawn instead, with you on it.
    const driving = s.view === 'city' && !!driveState.vehicle;
    g.visible = !(doing && a.pose === 'hidden' && !s.task?.animation) && !riding && !driving;

    seated.current = false;
    const kidnapped = !!s.streetStory && s.view === 'city' && !driving && sceneFor(s.streetStory.id) === 'kidnap' && (s.task?.travelMode ?? 'walk') === 'walk';
    if (kidnapped) {
      // Knocked to the ground, men standing over you.
      g.position.set(a.x, mapGroundY(a.x, a.z), a.z);
      b.rotation.set(-Math.PI / 2, 0, 0);
      b.position.set(0, 0.1, 0);
      clip.current = 'lie';
    } else if (a.snap && (doing || (!s.task && a.pose === 'lie'))) {
      g.position.set(a.snap.x, a.snap.y, a.snap.z);
      g.rotation.y = a.snap.yaw;
      if (a.pose === 'lie') {
        // Lie on the back, head towards the headboard (-z of the bed).
        b.rotation.set(-Math.PI / 2, 0, 0);
        b.position.set(0, 0.1, 0);
        clip.current = doing ? s.task?.animation ?? 'lie' : 'lie';
      } else {
        b.rotation.set(0, 0, 0);
        b.position.set(0, -seatDrop(a.snap.y), 0);
        clip.current = doing ? s.task?.animation ?? 'sit' : 'sit';
        seated.current = true;
      }
    } else {
      // On the map, bridges are raised a little above the ground.
      g.position.set(a.x, s.view === 'city' ? mapGroundY(a.x, a.z) : 0, a.z);
      // Smooth turn towards the walking direction.
      let diff = a.yaw - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * Math.min(1, dt * 12);
      b.rotation.set(0, 0, 0);
      b.position.set(0, 0, 0);
      clip.current = moving ? 'walk' : doing ? s.task?.animation ?? 'idle' : 'idle';
    }

    // Photo mode: strike the chosen pose while standing free.
    const shoot = usePhoto.getState();
    if (shoot.active && !moving && !doing && !kidnapped && !a.snap) clip.current = shoot.pose;

    avatarView.x = g.position.x;
    avatarView.y = g.position.y;
    avatarView.z = g.position.z;
    avatarView.yaw = g.rotation.y;
    // Other players still see you moving along the road while you drive.
    avatarView.pose = driving ? (Math.abs(driveState.speed) > 0.5 ? 'walk' : 'stand') : !g.visible ? 'hidden' : kidnapped ? 'lie' : a.snap && (doing || a.pose === 'lie') ? (a.pose === 'lie' ? 'lie' : 'sit') : moving ? 'walk' : 'stand';
    // Left out of the picture, but only on my own screen: visitors still see me (avatarView above).
    if (shoot.active && shoot.hideMe) g.visible = false;
  });

  return (
    <group ref={group} position={[avatar.x, 0, avatar.z]}>
      <group ref={body}>
        <Person look={look} clipRef={clip} seatedRef={seated} />
      </group>
      {/* Nothing floats over my head in a photo. */}
      {!photo && (
        <>
          <Plumbob />
          <MapBeacon />
          <MyBubble />
          <ThoughtBubble />
        </>
      )}
    </group>
  );
}
