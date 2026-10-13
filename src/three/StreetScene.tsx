// The little scene on the town map while a street story is on: a kidnapping with you on the ground,
// a shakedown, a checkpoint, a crowd, or just bystanders. Drawn around where you stopped.

import { useMemo, useRef } from 'react';
import { avatar } from '../game/avatar';
import { mapGroundY } from '../game/city';
import { driveState } from '../game/driveState';
import { useGame } from '../game/store';
import { sceneFor, type StreetScene } from '../game/streetScenes';
import { encodeLook } from '../game/wardrobe';
import { MAP_SCALE } from './Avatar';
import { Person, type Clip } from './Person';

const L = {
  black: encodeLook({ body: 'm', skin: 5, hair: 'bald', hairColor: 0, outfit: { top: 'suit_black', bottom: 'trousers_black', shoes: 'boots_tan', eyes: 'shades_black' } }),
  boy: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'tee_green', bottom: 'jeans_black', shoes: 'sneakers_white' } }),
  boy2: encodeLook({ body: 'm', skin: 3, hair: 'low', hairColor: 0, outfit: { top: 'shirt_check', bottom: 'jeans_black', shoes: 'slippers_black' } }),
  officer: encodeLook({ body: 'm', skin: 5, hair: 'bald', hairColor: 0, outfit: { top: 'polo_navy', bottom: 'trousers_black', shoes: 'loafers_brown' } }),
  mallam: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_white', bottom: 'trousers_black', shoes: 'slippers_palm', head: 'zanna_cap' } }),
  auntie: encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'blouse_yellow', bottom: 'wrapper_ankara', shoes: 'slippers_black', head: 'gele_gold' } }),
  woman: encodeLook({ body: 'f', skin: 4, hair: 'braids', hairColor: 0, outfit: { top: 'tee_white', bottom: 'skirt_navy', shoes: 'sneakers_white' } }),
};

interface Spot { look: string; angle: number; r: number; clip: Clip }

const SCENES: Record<StreetScene, Spot[]> = {
  kidnap: [
    { look: L.black, angle: 0.4, r: 1.1, clip: 'idle' },
    { look: L.black, angle: 2.2, r: 1.15, clip: 'talk' },
    { look: L.black, angle: 4.1, r: 1.1, clip: 'idle' },
    { look: L.auntie, angle: 5.4, r: 2.3, clip: 'wave' },
  ],
  robbery: [
    { look: L.boy, angle: 0.3, r: 1.1, clip: 'talk' },
    { look: L.boy2, angle: 2.0, r: 1.2, clip: 'idle' },
    { look: L.boy, angle: 4.0, r: 1.15, clip: 'talk' },
  ],
  police: [
    { look: L.officer, angle: 0.6, r: 1.2, clip: 'idle' },
    { look: L.officer, angle: 2.5, r: 1.25, clip: 'talk' },
  ],
  crowd: [
    { look: L.boy, angle: 0.2, r: 1.5, clip: 'clap' },
    { look: L.woman, angle: 1.2, r: 1.6, clip: 'clap' },
    { look: L.auntie, angle: 2.3, r: 1.5, clip: 'wave' },
    { look: L.mallam, angle: 3.4, r: 1.6, clip: 'clap' },
    { look: L.boy2, angle: 4.4, r: 1.5, clip: 'wave' },
    { look: L.woman, angle: 5.4, r: 1.6, clip: 'clap' },
  ],
  bystanders: [
    { look: L.mallam, angle: 0.8, r: 1.2, clip: 'talk' },
    { look: L.auntie, angle: 3.6, r: 1.3, clip: 'idle' },
  ],
};

function Figure({ spot }: { spot: Spot }) {
  const clip = useRef<Clip>(spot.clip);
  const x = Math.sin(spot.angle) * spot.r;
  const z = Math.cos(spot.angle) * spot.r;
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-x, -z), 0]} scale={MAP_SCALE}>
      <Person look={spot.look} clipRef={clip} />
    </group>
  );
}

/** A dark van parked up for the kidnap scene. */
function Van() {
  return (
    <group position={[1.9, 0, -1.2]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.8, 0.45, 1.5]} /><meshStandardMaterial color="#1d1f24" /></mesh>
      <mesh position={[0, 0.62, 0.15]}><boxGeometry args={[0.76, 0.25, 0.9]} /><meshStandardMaterial color="#2a2d34" /></mesh>
    </group>
  );
}

export function StreetSceneView() {
  const story = useGame((s) => s.streetStory);
  const view = useGame((s) => s.view);
  const spot = useMemo(() => (story ? { x: avatar.x, z: avatar.z } : null), [story]);
  if (!story || !spot || view !== 'city' || driveState.vehicle) return null;
  const kind = sceneFor(story.id);
  return (
    <group position={[spot.x, mapGroundY(spot.x, spot.z), spot.z]}>
      {SCENES[kind].map((p, i) => <Figure key={i} spot={p} />)}
      {kind === 'kidnap' && <Van />}
    </group>
  );
}
