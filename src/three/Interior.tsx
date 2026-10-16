import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, DataTexture, NearestFilter, SRGBColorSpace, type Group, type Mesh } from 'three';
import { INTERIORS, propsHere, propSize, propTransform, type Interior as InteriorDef, type Prop, type StaffSpot } from '../game/interiors';
import { PLACE_BY_ID, type Place } from '../game/city';
import { useGame } from '../game/store';
import { regionOf, regionPlace } from '../game/regions';
import { encodeLook } from '../game/wardrobe';
import { PropModel } from './interiorModels';
import { InteriorAds } from './InteriorAds';
import { Patrons } from './Patrons';
import { MurtalaEvents } from './MurtalaEvents';
import { KidnapCamp } from './KidnapCamp';
import { AirportApron } from './AirportApron';
import { StationPlatform } from './StationPlatform';
import { RefineryYard } from './RefineryYard';
import { Person, type Clip } from './Person';
import { Slab } from './Slab';
import { StaticBatch } from './StaticBatch';
import { Emoji } from '../ui/Icons';
import { offHover, onHover } from './HoverOutline';
import { JailMates } from './JailMates';
import { RoomFx, type FxSource } from './RoomFx';

const TALL = 2.6;
const SHORT = 0.9;
const FENCE = 1.0;
const T = 0.14;

const STAFF_LOOKS = {
  vendor: encodeLook({ body: 'f', skin: 4, hair: 'braids', hairColor: 1, outfit: { top: 'blouse_yellow', bottom: 'wrapper_ankara', shoes: 'slippers_palm', head: 'gele_gold' } }),
  cook: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_brown', shoes: 'slippers_palm', head: 'zanna_cap' } }),
  clerk: encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'blouse_yellow', bottom: 'skirt_navy', shoes: 'slippers_black' } }),
  office: encodeLook({ body: 'm', skin: 3, hair: 'fade', hairColor: 0, outfit: { top: 'shirt_check', bottom: 'trousers_black', shoes: 'loafers_brown' } }),
  guide: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_white', shoes: 'slippers_palm', head: 'zanna_cap' } }),
  teacher: encodeLook({ body: 'f', skin: 3, hair: 'braids', hairColor: 0, outfit: { top: 'blouse_yellow', bottom: 'skirt_navy', shoes: 'slippers_black' } }),
  worker: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'tee_green', bottom: 'trousers_black', shoes: 'boots_tan' } }),
  attendant: encodeLook({ body: 'm', skin: 3, hair: 'low', hairColor: 0, outfit: { top: 'polo_navy', bottom: 'trousers_black', shoes: 'loafers_brown' } }),
  warder: encodeLook({ body: 'm', skin: 5, hair: 'fade', hairColor: 0, outfit: { top: 'polo_navy', bottom: 'trousers_black', shoes: 'boots_tan' } }),
  dj: encodeLook({ body: 'm', skin: 4, hair: 'dreads', hairColor: 0, outfit: { top: 'tee_white', bottom: 'jeans_black', shoes: 'sneakers_white', eyes: 'shades_black', wrist: 'watch_steel' } }),
  bouncer: encodeLook({ body: 'm', skin: 5, hair: 'bald', hairColor: 0, outfit: { top: 'suit_black', bottom: 'trousers_black', shoes: 'loafers_brown', eyes: 'shades_black' } }),
  bartender: encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'shirt_check', bottom: 'trousers_black', shoes: 'slippers_black' } }),
  butler: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'suit_black', bottom: 'trousers_black', shoes: 'loafers_brown' } }),
  airline: encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'blouse_white', bottom: 'skirt_navy', shoes: 'heels_nude', neck: 'beads_gold' } }),
  pilot: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'suit_navy', bottom: 'trousers_black', shoes: 'loafers_black', head: 'cap_white', eyes: 'shades_black' } }),
  security: encodeLook({ body: 'm', skin: 5, hair: 'fade', hairColor: 0, outfit: { top: 'shirt_denim', bottom: 'trousers_black', shoes: 'boots_black', head: 'cap_black' } }),
  nurse: encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'blouse_white', bottom: 'trousers_white', shoes: 'sneakers_white' } }),
  doctor: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'suit_cream', bottom: 'trousers_black', shoes: 'loafers_black', eyes: 'glasses_round' } }),
  police: encodeLook({ body: 'm', skin: 5, hair: 'fade', hairColor: 0, outfit: { top: 'shirt_denim', bottom: 'trousers_black', shoes: 'boots_black', head: 'beanie_black' } }),
  teller: encodeLook({ body: 'f', skin: 4, hair: 'braids', hairColor: 0, outfit: { top: 'suit_navy', bottom: 'skirt_navy', shoes: 'heels_nude' } }),
  banker: encodeLook({ body: 'm', skin: 3, hair: 'fade', hairColor: 0, outfit: { top: 'suit_grey', bottom: 'trousers_black', shoes: 'loafers_black', wrist: 'watch_silver' } }),
  imam: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_white', shoes: 'slippers_palm', head: 'turban_white' } }),
  pastor: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'suit_black', bottom: 'trousers_black', shoes: 'loafers_black' } }),
  chorister: encodeLook({ body: 'f', skin: 3, hair: 'braids', hairColor: 0, outfit: { top: 'gown_lace', shoes: 'heels_nude', head: 'gele_teal' } }),
  soldier: encodeLook({ body: 'm', skin: 5, hair: 'bald', hairColor: 0, outfit: { top: 'tee_camo', bottom: 'cargo_camo', shoes: 'boots_black', head: 'cap_camo' } }),
  coder: encodeLook({ body: 'm', skin: 3, hair: 'afro', hairColor: 0, outfit: { top: 'hoodie_grey', bottom: 'jeans_blue', shoes: 'sneakers_white', eyes: 'glasses_round' } }),
  student: encodeLook({ body: 'f', skin: 4, hair: 'cornrows', hairColor: 0, outfit: { top: 'tee_stripe', bottom: 'jeans_light', shoes: 'sneakers_blue', bag: 'bag_back_blue' } }),
  mechanic: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'shirt_denim', bottom: 'cargo_khaki', shoes: 'boots_tan' } }),
  tailor: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_navy', shoes: 'slippers_black', head: 'zanna_blue' } }),
  stylist: encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'dress_black', shoes: 'heels_gold', neck: 'beads_gold' } }),
  hawker: encodeLook({ body: 'f', skin: 4, hair: 'cornrows', hairColor: 0, outfit: { top: 'blouse_ankara', bottom: 'wrapper_adire', shoes: 'slippers_pink', head: 'headtie_ankara' } }),
  agbero: encodeLook({ body: 'm', skin: 5, hair: 'dreads', hairColor: 0, outfit: { top: 'tank_white', bottom: 'jeans_ripped', shoes: 'slippers_black', head: 'bucket_khaki' } }),
  driver: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'polo_stripe', bottom: 'chinos_beige', shoes: 'slippers_black', head: 'cap_red' } }),
  referee: encodeLook({ body: 'm', skin: 4, hair: 'fade', hairColor: 0, outfit: { top: 'tank_black', bottom: 'joggers_black', shoes: 'sneakers_black' } }),
  footballer: encodeLook({ body: 'm', skin: 4, hair: 'fade', hairColor: 0, outfit: { top: 'jersey_kdu', bottom: 'shorts_khaki', shoes: 'sneakers_red' } }),
  rider: encodeLook({ body: 'm', skin: 3, hair: 'low', hairColor: 0, outfit: { top: 'polo_navy', bottom: 'trousers_white', shoes: 'boots_tan', head: 'cap_white' } }),
  waiter: encodeLook({ body: 'm', skin: 4, hair: 'fade', hairColor: 0, outfit: { top: 'blouse_white', bottom: 'trousers_black', shoes: 'loafers_black' } }),
  engineer: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'bomber_green', bottom: 'cargo_khaki', shoes: 'boots_tan', head: 'cap_white' } }),
  fisherman: encodeLook({ body: 'm', skin: 5, hair: 'low', hairColor: 0, outfit: { top: 'tank_white', bottom: 'shorts_khaki', shoes: 'slippers_palm', head: 'bucket_khaki' } }),
};

/** A look by name; a layout that asks for one we don't have gets a plain attendant. */
const lookOf = (name: string): keyof typeof STAFF_LOOKS => (name in STAFF_LOOKS ? (name as keyof typeof STAFF_LOOKS) : 'attendant');

/** Staff for the places whose layout doesn't list its own (`staff` in game/interiorKit.ts). */
const STAFF: Record<string, StaffSpot[]> = {
  airport: [
    // Check-in agents (the second desk is yours)
    { x: 0.8, z: 9, yaw: 0, look: 'airline' },
    { x: 4.8, z: 9, yaw: 0, look: 'airline' },
    { x: 6.8, z: 9, yaw: 0, look: 'attendant' },
    // Security
    { x: 10.5, z: 7.85, yaw: 0, look: 'security' },
    { x: 14.5, z: 7.3, yaw: -Math.PI / 2, look: 'security' },
    // Gate A1, the crew for A2, and the shops
    { x: 7, z: 0.75, yaw: 0, look: 'airline' },
    { x: 16.5, z: 1.5, yaw: 0, look: 'pilot' },
    { x: 1.6, z: 4.6, yaw: Math.PI / 2, look: 'clerk' },
    { x: 23.5, z: 2, yaw: -Math.PI / 2, look: 'bartender' },
    { x: 23.5, z: 6.5, yaw: -Math.PI / 2, look: 'cook' },
    { x: 15, z: 11.9, yaw: 0, look: 'attendant' },
  ],
  hamdala: [
    { x: 3.5, z: 0.5, yaw: 0, look: 'cook' },
    { x: 8, z: 0.55, yaw: 0, look: 'clerk' },
    { x: 10, z: 0.55, yaw: 0, look: 'office' },
    { x: 17.5, z: 5, yaw: -Math.PI / 2, look: 'bartender' },
    { x: 10.5, z: 12.4, yaw: 0, look: 'attendant' },
  ],
  // The Presidential Suite comes with a butler at the private bar.
  hamdala_presidential: [{ x: 14, z: 0.55, yaw: 0, look: 'butler' }],
  club: [
    { x: 8.5, z: 1.2, yaw: Math.PI, look: 'dj' },
    { x: 3.5, z: 9.5, yaw: Math.PI, look: 'bartender' },
    { x: 8, z: 12.5, yaw: 0, look: 'bouncer' },
  ],
};

const NO_STAFF: StaffSpot[] = [];
const staffOf = (placeId: string, it: InteriorDef) => it.staff ?? STAFF[placeId] ?? NO_STAFF;

/** What stands outside a place's walls: the apron behind the airport's glass, the train at the platform. */
const SCENERY: Record<string, (props: { it: InteriorDef }) => ReactNode> = {
  airport: AirportApron,
  station: StationPlatform,
  refinery: RefineryYard,
};

/** What each kind of staff does between short idle breaks. */
const STAFF_CLIPS: Record<keyof typeof STAFF_LOOKS, Clip[]> = {
  vendor: ['talk', 'type', 'wave'],
  cook: ['stir', 'stir', 'talk'],
  clerk: ['type', 'talk', 'wave'],
  office: ['type', 'type', 'talk'],
  guide: ['talk', 'wave'],
  teacher: ['talk', 'talk', 'wave'],
  worker: ['type', 'stir'],
  attendant: ['type', 'talk', 'wave'],
  warder: ['talk', 'type'],
  dj: ['clap', 'wave', 'talk'],
  bouncer: ['talk', 'idle'],
  bartender: ['stir', 'talk', 'wave'],
  butler: ['idle', 'stir', 'wave'],
  airline: ['type', 'talk', 'wave'],
  pilot: ['talk', 'idle', 'wave'],
  security: ['talk', 'idle'],
  nurse: ['type', 'talk', 'wave'],
  doctor: ['talk', 'type'],
  police: ['type', 'talk', 'idle'],
  teller: ['type', 'type', 'talk'],
  banker: ['type', 'talk'],
  imam: ['talk', 'idle'],
  pastor: ['talk', 'talk', 'wave'],
  chorister: ['clap', 'talk'],
  soldier: ['idle', 'talk'],
  coder: ['type', 'type', 'talk'],
  student: ['talk', 'type', 'wave'],
  mechanic: ['stir', 'type', 'talk'],
  tailor: ['type', 'stir', 'talk'],
  stylist: ['talk', 'wave'],
  hawker: ['wave', 'talk', 'wave'],
  agbero: ['wave', 'talk', 'clap'],
  driver: ['talk', 'idle', 'wave'],
  referee: ['wave', 'talk'],
  footballer: ['idle', 'talk', 'clap'],
  rider: ['talk', 'idle'],
  waiter: ['stir', 'talk', 'wave'],
  engineer: ['type', 'talk'],
  fisherman: ['stir', 'idle', 'talk'],
};

function StaffMember({ x, z, yaw = Math.PI, look: name }: StaffSpot) {
  const look = lookOf(name);
  const clip = useRef<Clip>('idle');
  const left = useRef(Math.random() * 3);
  useFrame((_, dt) => {
    left.current -= dt;
    if (left.current > 0) return;
    // Alternate a task (4-9s) with a short idle break (1.5-4s); waves stay brief.
    if (clip.current === 'idle') {
      const opts = STAFF_CLIPS[look];
      clip.current = opts[Math.floor(Math.random() * opts.length)];
      left.current = clip.current === 'wave' ? 1.5 + Math.random() : 4 + Math.random() * 5;
    } else {
      clip.current = 'idle';
      left.current = 1.5 + Math.random() * 2.5;
    }
  });
  return (
    <group position={[x, 0, z]} rotation-y={yaw}>
      <Person look={STAFF_LOOKS[look]} clipRef={clip} />
    </group>
  );
}

/** Checkerboard floor as one plane with a 1-pixel-per-tile texture, so big places stay cheap. */
function Floor({ it }: { it: InteriorDef }) {
  const tex = useMemo(() => {
    const data = new Uint8Array(it.w * it.h * 4);
    const cols = it.floor.map((c) => new Color(c).convertLinearToSRGB());
    for (let z = 0; z < it.h; z++)
      for (let x = 0; x < it.w; x++) {
        const c = cols[(x + z) % 2 ? 0 : 1];
        // Texture rows run bottom-up; plane's v=0 sits at +z after rotating flat.
        const i = ((it.h - 1 - z) * it.w + x) * 4;
        data.set([c.r * 255, c.g * 255, c.b * 255, 255], i);
      }
    const t = new DataTexture(data, it.w, it.h);
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [it]);
  return (
    <group>
      <mesh position={[it.w / 2, 0.005, it.h / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[it.w, it.h]} />
        <meshStandardMaterial map={tex} />
      </mesh>
      {(it.blocked ?? []).map((r, i) => (
        <mesh key={i} position={[r.x + r.w / 2, 0.0062, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r.w, r.d]} />
          <meshStandardMaterial color={it.blockedColour ?? '#555'} emissive={it.blockedColour ?? '#000'} emissiveIntensity={0.15} />
        </mesh>
      ))}
      {(it.tiles ?? []).map((r, i) => (
        // Later patches lie over earlier ones (and over water), so a layout can paint lines on a zone.
        <mesh key={`t${i}`} position={[r.x + r.w / 2, 0.0075 + i * 0.0006, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[r.w, r.d]} />
          <meshStandardMaterial color={r.colour} />
        </mesh>
      ))}
    </group>
  );
}

/** One straight wall run. Indoor walls drop to half height when they're between you and the camera. */
function WallRun({ from, to, normal, it }: { from: [number, number]; to: [number, number]; normal: [number, number]; it: InteriorDef }) {
  const body = useRef<Mesh>(null!);
  const cap = useRef<Mesh>(null!);
  const base = it.outdoor ? FENCE : TALL;
  const h = useRef(base);
  const horiz = from[1] === to[1];
  const len = horiz ? to[0] - from[0] : to[1] - from[1];
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  const centre = { x: it.w / 2, z: it.h / 2 };

  useFrame(({ camera }, dt) => {
    if (it.outdoor) return;
    const facing = normal[0] * (camera.position.x - centre.x) + normal[1] * (camera.position.z - centre.z) > 0;
    h.current += ((facing ? SHORT : TALL) - h.current) * Math.min(1, dt * 8);
    body.current.scale.y = h.current;
    body.current.position.y = h.current / 2;
    cap.current.position.y = h.current + 0.03;
  });

  if (len <= 0) return null;
  const size: [number, number, number] = horiz ? [len + T, 1, T] : [T, 1, len + T];
  const capSize: [number, number, number] = horiz ? [len + T, 0.06, T + 0.04] : [T + 0.04, 0.06, len + T];
  return (
    <group>
      <mesh ref={body} position={[cx, base / 2, cz]} scale={[1, base, 1]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={it.outdoor ? '#d8c7a8' : it.wall ?? '#f3ead8'} flatShading />
      </mesh>
      <mesh ref={cap} position={[cx, base + 0.03, cz]}>
        <boxGeometry args={capSize} />
        <meshStandardMaterial color={it.outdoor ? '#b9a27c' : '#1f4e3d'} flatShading />
      </mesh>
    </group>
  );
}

/** A glazed stretch of the back wall: sill, mullions and a pane you see the outside through. Drops like the wall does. */
function GlassRun({ from, to, it }: { from: number; to: number; it: InteriorDef }) {
  const run = useRef<Group>(null!);
  const h = useRef(TALL);
  useFrame(({ camera }, dt) => {
    h.current += ((camera.position.z < it.h / 2 ? SHORT : TALL) - h.current) * Math.min(1, dt * 8);
    run.current.scale.y = h.current;
  });
  const len = to - from;
  const bays = Math.max(1, Math.round(len / 1.5));
  // Built one unit tall and stretched to the wall's height.
  return (
    <group ref={run} position={[from + len / 2, 0, 0]} scale={[1, TALL, 1]}>
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, 0.14, T]} />
        <meshStandardMaterial color={it.wall ?? '#f3ead8'} flatShading />
      </mesh>
      <mesh position={[0, 0.955, 0]} castShadow>
        <boxGeometry args={[len, 0.09, T]} />
        <meshStandardMaterial color={it.wall ?? '#f3ead8'} flatShading />
      </mesh>
      <mesh position={[0, 1.012, 0]}>
        <boxGeometry args={[len, 0.024, T + 0.04]} />
        <meshStandardMaterial color="#1f4e3d" flatShading />
      </mesh>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh key={i} position={[-len / 2 + (i * len) / bays, 0.525, 0]} castShadow>
          <boxGeometry args={[0.07, 0.77, T * 0.8]} />
          <meshStandardMaterial color="#64748b" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 0.525, 0]}>
        <boxGeometry args={[len, 0.77, 0.03]} />
        <meshStandardMaterial color="#bfe6f5" transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Walls({ it }: { it: InteriorDef }) {
  const { w, h, doorX } = it;
  if (it.jungle) return null;
  // The back wall is solid except where the place has glass.
  const glass = [...(it.glass ?? [])].sort((a, b) => a[0] - b[0]);
  const solid = [0, ...glass.flat(), w];
  return (
    <group>
      {glass.map(([from, to]) => <GlassRun key={from} it={it} from={from} to={to} />)}
      {glass.map(([from], i) => <WallRun key={`s${from}`} it={it} from={[solid[i * 2], 0]} to={[from, 0]} normal={[0, -1]} />)}
      <WallRun it={it} from={[solid[solid.length - 2], 0]} to={[w, 0]} normal={[0, -1]} />
      <WallRun it={it} from={[0, 0]} to={[0, h]} normal={[-1, 0]} />
      <WallRun it={it} from={[w, 0]} to={[w, h]} normal={[1, 0]} />
      <WallRun it={it} from={[0, h]} to={[doorX, h]} normal={[0, 1]} />
      <WallRun it={it} from={[doorX + 1, h]} to={[w, h]} normal={[0, 1]} />
    </group>
  );
}

function PropMesh({ prop, selected }: { prop: Prop; selected: boolean }) {
  const { cx, cz, yaw } = propTransform(prop);
  const { w, d } = propSize(prop);
  const usable = prop.actions.length > 0;
  return (
    <group>
      <group
        position={[cx, 0, cz]}
        rotation={[0, yaw, 0]}
        onClick={(e) => {
          if (e.delta > 8 || !usable) return;
          e.stopPropagation();
          const s = useGame.getState();
          if (s.task?.actionId === 'work' && s.task.phase === 'doing') return s.toast('You are at work');
          s.select(prop.id);
        }}
        onPointerOver={(e) => {
          if (!usable) return;
          onHover(e);
        }}
        onPointerOut={offHover}
      >
        <PropModel type={prop.type} text={prop.text} />
      </group>
      {selected && (
        <mesh position={[cx, 0.03, cz]} rotation={[-Math.PI / 2, 0, 0]} userData={{ dynamic: true }}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Steam off the buka's pots, the hotel shower's spray, Zs over the bed... (three/RoomFx.tsx). */
function PlaceFx({ it }: { it: InteriorDef }) {
  const sources = useMemo<FxSource[]>(() => propsHere(it).map((p) => {
    const { cx, cz, yaw } = propTransform(p);
    return { id: p.id, type: p.type, x: cx, y: 0, z: cz, yaw };
  }), [it]);
  return <RoomFx sources={sources} ambient />;
}

function ClickPlane({ it }: { it: InteriorDef }) {
  return (
    <mesh
      visible={false}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[it.w / 2, 0.02, it.h / 2]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 8) return;
        const s = useGame.getState();
        if (s.selectedId) return s.select(null);
        s.walkTo({ x: Math.max(0, Math.min(it.w - 1, Math.floor(e.point.x))), z: Math.max(0, Math.min(it.h - 1, Math.floor(e.point.z))) });
      }}
    >
      <planeGeometry args={[it.w, it.h]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** A hotel room: just the room, with no ground round it, no crowd and no ads. Its name and time left are on the room card (ui/Hotel.tsx). */
function Room({ it, place }: { it: InteriorDef; place: Place }) {
  const selectedId = useGame((s) => s.selectedId);
  return (
    <group key={place.id}>
      <Slab x0={-0.3} z0={-0.3} x1={it.w + 0.3} z1={it.h + 0.3} r={0.35} depth={0.5} top="#3b2a20" side="#2a1d16" />
      <Floor it={it} />
      <Walls it={it} />
      {staffOf(place.id, it).map((member, i) => <StaffMember key={i} {...member} />)}
      <StaticBatch>
        {propsHere(it).map((p) => (
          <PropMesh key={p.id} prop={p} selected={p.id === selectedId} />
        ))}
      </StaticBatch>
      <PlaceFx it={it} />
      <ClickPlane it={it} />
    </group>
  );
}

export function Interior() {
  const insideId = useGame((s) => s.insideId);
  const destinationId = useGame((s) => s.destinationId);
  const selectedId = useGame((s) => s.selectedId);
  const it = insideId ? INTERIORS[insideId] : null;
  const place = insideId ? (regionPlace(destinationId, insideId) ?? PLACE_BY_ID[insideId]) : null;
  const region = regionOf(destinationId);
  if (!it || !place) return null;
  if (it.room) return <Room it={it} place={place} />;
  const badgeY = it.outdoor ? 2.8 : 5;
  const Outside = SCENERY[place.id];
  return (
    <group key={insideId ?? ''}>
      <Slab x0={-1.4} z0={-1.4 - (it.behind ?? 0)} x1={it.w + 1.4} z1={it.h + 1.8} top={it.jungle ? '#2f5a26' : it.outdoor ? '#9fbf5a' : '#a9c46a'} />
      {/* Path out the door */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[it.doorX + 0.5, 0.004, it.h + 0.9]} receiveShadow>
        <planeGeometry args={[1.2, 1.8]} />
        <meshStandardMaterial color="#c98b5e" />
      </mesh>
      <Floor it={it} />
      <Walls it={it} />
      <Html position={[it.w / 2, badgeY + 5, -3]} center zIndexRange={[9, 0]}>
        <div className="region-map-badge building-map-badge">
          <b><Emoji char={place.icon} size="1em" /> {place.name}</b>
          <span><Emoji char="📍" size="1em" /> {place.area} · {region.id === 'abuja' ? 'FCT' : `${region.name} State`}</span>
          {place.blurb && <small className="building-badge-blurb">{place.blurb}</small>}
        </div>
      </Html>
      {staffOf(place.id, it).map((member, i) => <StaffMember key={i} {...member} />)}
      {!it.jungle && <Patrons placeId={place.id} it={it} taken={staffOf(place.id, it)} />}
      {place.id === 'camp' && <KidnapCamp />}
      {place.id === 'prison' && <JailMates />}
      {place.id === 'murtala' && <MurtalaEvents />}
      {Outside && <Outside it={it} />}
      <StaticBatch>
        {propsHere(it).map((p) => (
          <PropMesh key={p.id} prop={p} selected={p.id === selectedId} />
        ))}
      </StaticBatch>
      {!it.jungle && <InteriorAds placeId={place.id} it={it} />}
      <PlaceFx it={it} />
      <ClickPlane it={it} />
    </group>
  );
}
