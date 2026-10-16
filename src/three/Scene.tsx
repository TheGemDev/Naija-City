import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Box3, Color, Fog, MOUSE, PCFSoftShadowMap, PMREMGenerator, TOUCH, Vector3, type DirectionalLight, type HemisphereLight } from 'three';
import { activeDesignOf, flightOf, hourOf, houseKeyOf, useGame, type GameState } from '../game/store';
import { avatar } from '../game/avatar';
import { driveState } from '../game/driveState';
import { activeMap, placeCenter, placeHere } from '../game/city';
import { INTERIORS } from '../game/interiors';
import { PARKING_DEPTH, World } from './World';
import { StreetSceneView } from './StreetScene';
import { HouseStaff } from './HouseStaff';
import { Children } from './Children';
import { houseLayoutForDesign } from '../game/grid';
import { Items, PlacementGhost } from './Items';
import { Avatar } from './Avatar';
import { City } from './City';
import { Disasters } from './Disasters';
import { Interior } from './Interior';
import { CABIN_LENGTH, FlightCabin } from './FlightCabin';
import { TRAIN_LENGTH, TrainRide } from './TrainRide';

/** How long the cabin or the coach you are riding in is, for the camera. */
const RIDE_LENGTH = { ...CABIN_LENGTH, train: TRAIN_LENGTH };
import { RemotePlayers } from './RemotePlayers';
import { Estate, estateRowsNow } from './Estate';
import { estateH, estateW } from '../game/estate';
import { useNet } from '../net/multiplayer';
import { useSession } from '../net/session';
import { homeTransform } from '../game/origins';
import { useVisit } from '../game/visits';
import { useTour } from '../game/tour';
import { useLowPerf } from '../game/quality';
import { photoHour, usePhoto } from '../game/photo';
import { sceneHour, setChromeColor } from '../game/theme';
import { PhotoRig } from './PhotoRig';
import { houseGlow } from './HouseLights';
import { pinWeather, sky, stepSky } from '../game/weather';
import { Clouds, Rain, SkyBodies } from './Weather';
import { HoverOutline, lastPointed } from './HoverOutline';
import { usePieAnchor } from '../game/pieAnchor';

/** Game time advances in steps this long (seconds). Every step updates the store and the screens
 *  watching it, so doing it every frame kept React busy 60 times a second. */
const TICK_STEP = 0.1;

function GameLoop() {
  const three = useThree();
  if (import.meta.env.DEV) Object.assign(window, { __three: three, __game: useGame, __pinWeather: pinWeather });
  const owed = useRef(0);
  useFrame((_, dt) => {
    const s = useGame.getState();
    // Online-only: the game stands still until signed in and connected (see ConnectionGate).
    const net = useNet.getState();
    if (!useSession.getState().user || !net.connected || net.moving) return;
    owed.current += Math.min(dt, 0.1);
    if (owed.current < TICK_STEP) return;
    // Always real time: this is the server's clock. Long tasks speed up their own progress inside tick().
    s.tick(owed.current);
    owed.current = 0;
  });
  return null;
}

/** Phones and tablets: touch-first screens with small GPUs and very dense pixels. */
const MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const MAX_DPR = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);

/** Render scale in low mode: fewer pixels to shade. */
const LOW_DPR = 0.75;

const NIGHT = new Color('#0b1430');
/** Sky/ground light colours: plain daylight, cool moonlight outdoors, warm bulbs in a lit room. */
const SKY_DAY = new Color('#fff8ec');
const SKY_MOON = new Color('#a9bcff');
const SKY_BULB = new Color('#ffe0b0');
const GROUND_DAY = new Color('#6b5a3a');
const GROUND_NIGHT = new Color('#3a3f5c');
const DAY = new Color('#bfe3f5');
/** The sky's colour under each kind of weather (game/weather.ts): grey cloud, slate rain, and harmattan dust. */
const DAY_CLOUD = new Color('#b4c2ce');
const DAY_RAIN = new Color('#8794a1');
const DAY_DUST = new Color('#d3cbba');
const NIGHT_CLOUD = new Color('#161c28');
const NIGHT_DUST = new Color('#241f19');
const FLASH = new Color('#c9d0e6');
const WHITE = new Color('#ffffff');
/** The sun through harmattan dust: a soft orange. */
const SUN_DUST = new Color('#ffe4c4');
const SKY_DUST = new Color('#e9e0d0');
/** Rain light: cool and grey. */
const SKY_RAIN = new Color('#b9c6d6');
/** The house's bulb colour this frame (its mood). */
const bulbTint = new Color();

/** Out under the sky, where weather reaches: not inside a building or on a plane. */
function outdoors(s: GameState) {
  return !flightOf(s) && (!!useVisit.getState().current || s.view !== 'place');
}

/**
 * Sun moves with the in-game clock (dark appearance keeps it night); lamps come on at night if there is power.
 * Outdoors the weather (game/weather.ts) greys or dusts the sky, dims the sun and softens its shadows, and hazes
 * the distance with fog.
 */
function DayNight() {
  const sun = useRef<DirectionalLight>(null!);
  const hemi = useRef<HemisphereLight>(null!);
  const { scene, controls, gl } = useThree();
  const bg = useRef(new Color());
  const tint = useRef(new Color());
  const frames = useRef(0);
  const low = useLowPerf();
  // Always set, and pushed out of sight when there is no haze: switching fog on and off would recompile every material.
  const fog = useMemo(() => new Fog('#bfe3f5', 1e4, 1e4 + 1), []);
  useEffect(() => {
    scene.fog = fog;
    return () => { scene.fog = null; };
  }, [scene, fog]);

  // Soft light bounced in from all round, so glass, paint and metal pick up reflections instead of
  // looking chalky. Skipped in low mode.
  useEffect(() => {
    if (low) return;
    const pm = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      room.dispose();
      pm.dispose();
    };
  }, [gl, scene, low]);

  useFrame(({ camera, clock }, dt) => {
    const s = useGame.getState();
    // Photo mode can ask for the light of another time of day.
    const posed = photoHour();
    const h = posed ?? sceneHour(hourOf(s.minutes));
    const day = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)); // 0 at night, 1 at noon
    stepSky(dt, s.destinationId);
    const out = outdoors(s) ? 1 : 0;
    const cloud = sky.cloud * out, haze = sky.haze * out, rain = sky.rain * out, flash = sky.flash * out;
    const sunK = 1 - (1 - sky.sun) * out;
    // Two sky colours only, day blue and night navy: an orange dusk mixed in turned it muddy brown. Weather greys or dusts both.
    tint.current.copy(DAY).lerp(DAY_CLOUD, cloud).lerp(DAY_RAIN, rain).lerp(DAY_DUST, haze * (1 - rain));
    bg.current.copy(NIGHT).lerp(NIGHT_CLOUD, cloud).lerp(NIGHT_DUST, haze * (1 - rain)).lerp(tint.current, Math.min(1, day * 1.6));
    bg.current.lerp(FLASH, flash * 0.2);
    scene.background = bg.current;
    // The status bar of an installed app takes the sky's colour, so there is no odd strip above the world.
    if (frames.current++ % 60 === 0) setChromeColor(`#${bg.current.getHexString()}`);

    // The sun's shadow box follows whatever the camera is looking at.
    const t = (controls as OrbitControlsImpl | null)?.target ?? { x: 7, z: 6 };
    const angle = ((h - 6) / 12) * Math.PI;
    sun.current.position.set(t.x + Math.cos(angle) * 18, 4 + Math.max(0, Math.sin(angle)) * 20, t.z + 10);
    sun.current.target.position.set(t.x, 0, t.z);
    sun.current.target.updateMatrixWorld();
    // Haze closes in round the middle of the screen; rain greys the far side. Clear air has no fog at all.
    // A flight's terrain brings its own fog (FlightTerrain) and clears it on landing: take ours back.
    if (!flightOf(s) && scene.fog !== fog) scene.fog = fog;
    const thick = Math.max(haze, rain * 0.8);
    const dist = camera.position.distanceTo(sun.current.target.position);
    const open = (1 - thick) ** 2.5;
    // A shade darker than the sky, so haze mutes the map instead of washing it out to white.
    fog.color.copy(bg.current).multiplyScalar(0.82);
    fog.near = thick < 0.01 ? 1e4 : dist * (0.6 + 2.4 * open);
    fog.far = thick < 0.01 ? 1e4 + 1 : dist * (3 + 5 * open);
    // Night is never pitch black: moonlight keeps streets readable, and a room with power is lit by
    // its bulbs (businesses run generators, so building interiors always are). No power at home is
    // what stays dark: that's NEPA. Low mode has no lamps, so its moon is a little brighter.
    const night = 1 - Math.min(1, day * 2.5);
    const visit = useVisit.getState().current;
    const indoors = !!visit || s.view === 'home' || s.view === 'place';
    // A house's bulbs follow its supply (a generator is dimmer) and its mood (game/finishes.ts); its lamps and their
    // two real lights are HouseLights.tsx's. A public place always has light.
    const house = s.view !== 'place' || !!visit;
    const glow = house ? houseGlow(s, clock.elapsedTime) : null;
    const bulbs = !indoors ? 0 : glow ? night * Math.min(1, glow.level) : night;
    bulbTint.copy(SKY_BULB);
    if (glow) bulbTint.lerp(glow.color, 0.7);
    const moon = night * (low ? 0.75 : 0.55) * (1 - cloud * 0.4);
    sun.current.intensity = 0.15 + day * 2.2 * sunK + moon * (1 - bulbs * 0.6);
    sun.current.color.copy(WHITE).lerp(SUN_DUST, haze * 0.6);
    // Under cloud the light comes from the whole sky: shadows go soft and faint. Even in full sun they stop short of
    // black: with the sky light turned down (below) a full-strength shadow left whole plots near-black in daylight.
    sun.current.shadow.intensity = (0.25 + 0.75 * sunK) * 0.55;
    // High mode's room environment already fills the shadows, so its sky light is turned down by as much: stacked
    // together at noon they washed the whole map out to white. A little of the sunlight cloud takes away comes back as
    // sky light, never as much as it took: weather only ever dims the map. Lightning is a soft flicker, not a white-out.
    hemi.current.intensity = 0.35 + day * (low ? 0.9 : 0.6) + day * (1 - sunK) * 0.2 + moon * 0.9 + bulbs * (low ? 1.1 : 0.85) + flash * 0.5;
    hemi.current.color.copy(SKY_DAY).lerp(SKY_DUST, haze * 0.5).lerp(SKY_RAIN, rain * 0.5).lerp(SKY_MOON, night * 0.6).lerp(bulbTint, Math.min(1, bulbs) * 0.8).lerp(FLASH, flash);
    hemi.current.groundColor.copy(GROUND_DAY).lerp(GROUND_NIGHT, night * (1 - Math.min(1, bulbs)));

    scene.environmentIntensity = 0.05 + day * 0.1;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#fff8ec', '#6b5a3a', 1]} />
      <directionalLight
        ref={sun}
        castShadow={!low}
        shadow-mapSize={MOBILE ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}

/** The sun and moon wherever the sky shows; rain and clouds only out under it. */
function WeatherLayer() {
  const out = useGame((s) => outdoors(s));
  const visiting = useVisit((s) => !!s.current);
  const low = useLowPerf();
  return (
    <>
      <SkyBodies />
      {(out || visiting) && <Rain />}
      {(out || visiting) && !low && <Clouds />}
    </>
  );
}

const FOV = 35;
const TARGET: [number, number, number] = [7, 0, 6.5];
const ISO_DIR = [1, 1.15, 1];
// Map: looking almost straight down, slightly from the south so buildings still show their fronts.
const TOP_DIR = [0, 1, 0.38];

/** Distance that fits `span` tiles on screen, portrait phones included. */
function fitDistance(span: number, min: number) {
  const aspect = window.innerWidth / window.innerHeight;
  const half = Math.tan(((FOV / 2) * Math.PI) / 180);
  return Math.max(min, Math.min(125, span / (half * Math.min(1, aspect))));
}

function offset(target: [number, number, number], dir: number[], dist: number): [number, number, number] {
  const len = Math.hypot(...dir);
  return [target[0] + (dir[0] / len) * dist, target[1] + (dir[1] / len) * dist, target[2] + (dir[2] / len) * dist];
}

/** Places wider than this many tiles are bigger than one screen. */
const BIG_ROOM = 15;

/** The map, and places too big to see at once, keep the camera on you. */
function followsAvatar(s: GameState) {
  if (flightOf(s)) return false;
  if (s.view === 'city' || s.view === 'estate') return true;
  const it = s.view === 'place' && s.insideId ? INTERIORS[s.insideId] : null;
  return !!it && Math.max(it.w, it.h) > BIG_ROOM;
}

/** Where the camera looks and from where, for each view. */
function framing(s: GameState): { target: [number, number, number]; pos: [number, number, number] } {
  const visit = useVisit.getState().current;
  if (visit) {
    const layout = houseLayoutForDesign(visit.save.design);
    const transform = homeTransform(visit.save.origin, visit.save.design);
    const target: [number, number, number] = [
      transform.x + layout.width * transform.scale / 2,
      0,
      transform.z + layout.depth * transform.scale / 2,
    ];
    const span = Math.max(layout.width, layout.depth) * transform.scale;
    return { target, pos: offset(target, ISO_DIR, fitDistance(span, 22 * Math.min(1, transform.scale))) };
  }
  const flight = flightOf(s);
  if (flight) {
    const target: [number, number, number] = [0, 0.8, 0];
    return { target, pos: offset(target, ISO_DIR, fitDistance(RIDE_LENGTH[flight] * 0.8, 14)) };
  }
  if (s.view === 'city') {
    // A visitor's tour of a city (game/tour.ts) opens on the whole map, not on where a player would be standing.
    if (useTour.getState().city) {
      const map = activeMap();
      const middle: [number, number, number] = [map.w / 2, 0, map.h / 2];
      return { target: middle, pos: offset(middle, TOP_DIR, fitDistance(30, 60)) };
    }
    const target: [number, number, number] = [avatar.x, 0, avatar.z];
    return { target, pos: offset(target, TOP_DIR, fitDistance(13, 34)) };
  }
  if (s.view === 'estate') {
    const target: [number, number, number] = [avatar.x, 0, avatar.z];
    return { target, pos: offset(target, TOP_DIR, fitDistance(20, 44)) };
  }
  const it = s.view === 'place' && s.insideId ? INTERIORS[s.insideId] : null;
  if (it) {
    // Small rooms fit on screen whole; big ones start at the door and follow you round.
    const target: [number, number, number] = followsAvatar(s)
      ? [Math.min(Math.max(avatar.x, it.w / 2 - 5), it.w / 2 + 5), 0, Math.max(it.h / 2, it.h - 5)]
      : [it.w / 2, 0, it.h / 2 + 0.5];
    // A hotel room is small: come in close so it fills the screen.
    return { target, pos: offset(target, ISO_DIR, fitDistance(Math.min(Math.max(it.w, it.h) * 0.85, BIG_ROOM * 0.85), it.room ? 15 : 22)) };
  }
  const design = activeDesignOf(s);
  const layout = houseLayoutForDesign(design);
  const transform = homeTransform(s.origin, design);
  const target: [number, number, number] = [
    transform.x + (layout.gridW * transform.scale) / 2,
    0,
    transform.z + (layout.gridH * transform.scale) / 2,
  ];
  return { target, pos: offset(target, ISO_DIR, fitDistance(Math.max(layout.gridW, layout.gridH) * 0.86 * transform.scale, 28 * Math.min(1, transform.scale))) };
}

function bounds(s: GameState) {
  const visit = useVisit.getState().current;
  if (visit) {
    const l = houseLayoutForDesign(visit.save.design);
    return { x0: -1, x1: l.gridW + 1, z0: -1, z1: l.gridH + 1.5 };
  }
  const flight = flightOf(s);
  if (flight) return { x0: -4, x1: 4, z0: -RIDE_LENGTH[flight] / 2, z1: RIDE_LENGTH[flight] / 2 };
  if (s.view === 'city') return { x0: -8, x1: activeMap().w + 8, z0: -8, z1: activeMap().h + 8 };
  if (s.view === 'estate' && s.estateId) return { x0: -1, x1: estateW() + 1, z0: -1, z1: estateH(estateRowsNow(s.estateId)) + 1 };
  const it = s.view === 'place' && s.insideId ? INTERIORS[s.insideId] : null;
  if (it) return { x0: -1, x1: it.w + 1, z0: -1, z1: it.h + 1.5 };
  const home = houseLayoutForDesign(activeDesignOf(s));
  return { x0: -1, x1: home.gridW + 1, z0: -1, z1: home.gridH + 1.5 + (s.ownedCars.length ? PARKING_DEPTH : 0) };
}

/** Re-frames the camera when you change area; on the map it follows you and pans to what you tap. */
function CameraRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const teleportId = useGame((s) => s.teleportId);
  const view = useGame((s) => s.view);
  const origin = useGame((s) => s.origin);
  const visit = useVisit((s) => s.current);
  const visitId = visit ? `${visit.ownerUid}:${visit.propertyId ?? ''}:${visit.save.design ?? ''}:${visit.save.origin}` : null;
  const placeId = useGame((s) => s.placeId);
  const flight = useGame(flightOf);
  const focus = useRef<{ x: number; z: number } | null>(null);
  // The thing you selected (its activities fanned round it): the camera centres on it, so turning the view orbits it.
  const selectedId = useGame((s) => s.selectedId);
  const picked = useRef<{ x: number; y: number; z: number } | null>(null);
  const gl = useThree((s) => s.gl);
  // Photo mode runs the camera itself (PhotoRig); the room's usual framing comes back when it closes.
  const photo = usePhoto((s) => s.active);

  useEffect(() => {
    if (!controls || photo) return;
    const { target, pos } = framing(useGame.getState());
    controls.target.set(...target);
    camera.position.set(...pos);
    controls.update();
    focus.current = null;
  }, [teleportId, view, origin, visitId, flight, controls, camera, photo]);

  useEffect(() => {
    const p = placeId ? placeHere(placeId) : null;
    focus.current = p ? placeCenter(p) : null;
  }, [placeId]);

  useEffect(() => {
    const obj = lastPointed.obj;
    if (!selectedId || !obj?.parent) {
      picked.current = null;
      usePieAnchor.setState({ id: null, x: null, y: null });
      return;
    }
    const c = new Box3().setFromObject(obj).getCenter(new Vector3());
    picked.current = Number.isFinite(c.x) ? { x: c.x, y: c.y, z: c.z } : null;
    // The menu waits for the camera to arrive (below), then opens on the thing itself.
    usePieAnchor.setState({ id: picked.current ? selectedId : null, x: null, y: null });
  }, [selectedId]);

  useFrame((_, dt) => {
    // Photo mode keeps the camera on me itself.
    if (!controls || usePhoto.getState().active) return;
    const visiting = !!useVisit.getState().current;
    if (visiting) {
      const currentVisit = useVisit.getState().current!;
      const transform = homeTransform(currentVisit.save.origin, currentVisit.save.design);
      const t = controls.target;
      const k = Math.min(1, dt * 3);
      const dx = (transform.x + avatar.x * transform.scale - t.x) * k;
      const dz = (transform.z + avatar.z * transform.scale - t.z) * k;
      t.x += dx;
      t.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
      return;
    }
    // Something selected: ease the view over to it and hold it there, so dragging round orbits it.
    if (picked.current && useGame.getState().selectedId && !avatar.path.length) {
      const t = controls.target;
      const k = Math.min(1, dt * 4);
      const dx = (picked.current.x - t.x) * k;
      const dz = (picked.current.z - t.z) * k;
      t.x += dx;
      t.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
      // Arrived (near enough that the rest of the glide can't be seen): open the menu on the thing.
      const anchor = usePieAnchor.getState();
      const id = useGame.getState().selectedId;
      if (anchor.id === id && anchor.x === null && Math.hypot(picked.current.x - t.x, picked.current.z - t.z) < 0.12) {
        camera.updateMatrixWorld();
        const v = new Vector3(picked.current.x, picked.current.y, picked.current.z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        usePieAnchor.setState({ x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height });
      }
      return;
    }
    if (!followsAvatar(useGame.getState())) return;
    let goal = focus.current;
    if (avatar.path.length || driveState.vehicle) goal = { x: avatar.x, z: avatar.z };
    if (!goal) return;
    const t = controls.target;
    const k = Math.min(1, dt * (driveState.vehicle ? 7 : 3));
    const dx = (goal.x - t.x) * k;
    const dz = (goal.z - t.z) * k;
    t.x += dx;
    t.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
    if (focus.current && Math.hypot(goal.x - t.x, goal.z - t.z) < 0.05) focus.current = null;
  });
  return null;
}

function Area() {
  const view = useGame((s) => s.view);
  // The layout key (game/exterior.ts): extensions' rooms and the car bay come with the design.
  const design = useGame(activeDesignOf);
  const walls = useGame((s) => s.wallEdits[houseKeyOf(s)]);
  const paint = useGame((s) => s.housePaint[houseKeyOf(s)]);
  const staff = useGame((s) => s.properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId))?.staff);
  const today = useGame((s) => Math.floor(s.minutes / 1440));
  const homeStaff = useMemo(() => (staff ?? []).filter((member) => member.paidThrough >= today), [staff, today]);
  const visit = useVisit((s) => s.current);
  const flight = useGame(flightOf);
  if (flight) return flight === 'train' ? <TrainRide /> : <FlightCabin kind={flight} />;
  if (visit) return (
    <>
      <World readOnly items={visit.save.items} origin={visit.save.origin} design={visit.save.design} walls={visit.save.walls} paint={visit.save.paint} finish={visit.save.finish} visitCars={visit.save.ownedCars} />
      <HouseStaff staff={visit.save.staff} design={visit.save.design} />
    </>
  );
  if (view === 'city') return <><City /><Disasters /></>;
  if (view === 'place') return <Interior />;
  if (view === 'estate') return <Estate />;
  return (
    <>
      <World design={design} walls={walls} paint={paint} />
      <HouseStaff staff={homeStaff} design={design} />
      <Children design={design} walls={walls} />
    </>
  );
}

function LocalWorld() {
  const view = useGame((s) => s.view);
  const origin = useGame((s) => s.origin);
  const visit = useVisit((s) => s.current);
  const design = useGame(activeDesignOf);
  // Nobody is standing on the map a visitor tours.
  const touring = useTour((s) => !!s.city);
  const transform = visit ? homeTransform(visit.save.origin, visit.save.design) : view === 'home' ? homeTransform(origin, design) : { scale: 1, x: 0, z: 0 };
  // Scaled the same on every axis: shrinking only the floor made people, walls and furniture look stretched tall.
  return (
    <group position={[transform.x, 0, transform.z]} scale={transform.scale}>
      <Area />
      {!touring && <Avatar />}
      <StreetSceneView />
      {(visit || view === 'home') && <Items items={visit?.save.items} readOnly={!!visit} />}
      {!visit && view === 'home' && <PlacementGhost />}
    </group>
  );
}

export function Scene() {
  const photo = usePhoto((s) => s.active);
  // Drops the resolution when frames start taking too long, and brings it back when they recover.
  const low = useLowPerf();
  const [dpr, setDpr] = useState(MAX_DPR);
  // Low mode: no shadows or antialiasing, and a smaller render resolution. Those are fixed when the
  // canvas is created, so switching modes remounts it.
  return (
    <Canvas
      key={low ? 'low' : 'high'}
      shadows={low ? false : { type: PCFSoftShadowMap }}
      dpr={low ? Math.min(dpr, LOW_DPR) : dpr}
      // stencil: the desktop hover outline masks out the hovered object so only its silhouette is lined (HoverOutline.tsx).
      gl={{ powerPreference: low ? 'low-power' : 'high-performance', antialias: !low, stencil: true }}
      camera={{ position: framing(useGame.getState()).pos, fov: FOV, near: 0.5, far: 400 }}
      onPointerMissed={() => useGame.getState().select(null)}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDpr((d) => Math.max(low ? LOW_DPR : 1, d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(MAX_DPR, d + 0.25))}
        onFallback={() => setDpr(low ? LOW_DPR : 1)}
      />
      <GameLoop />
      <DayNight />
      <WeatherLayer />
      <HoverOutline />
      <CameraRig />
      <Suspense fallback={null}>
        <LocalWorld />
        <RemotePlayers />
      </Suspense>
      <Controls />
      {photo && <PhotoRig />}
    </Canvas>
  );
}

function Controls() {
  const onMap = useGame((s) => s.view === 'city' || s.view === 'estate');
  const visiting = useVisit((s) => !!s.current);
  const map = onMap && !visiting;
  const photo = usePhoto((s) => s.active);
  const ref = useRef<OrbitControlsImpl>(null);
  // Rooms: left-drag / one finger rotates, right-drag / two fingers pan.
  // Map: top-down, drag pans, no rotating. Scroll / pinch zooms everywhere.
  const limits = useMemo(() => ({
    enablePan: true,
    enableRotate: !map,
    minDistance: map ? 14 : 8,
    maxDistance: map ? 125 : 90,
    minPolarAngle: 0.3,
    maxPolarAngle: map ? 0.45 : 1.3,
    mouseButtons: map ? { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN } : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN },
    touches: map ? { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN } : { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN },
  }), [map]);
  // Photo mode (PhotoRig) sets its own limits for each shot; the area's come back when it closes.
  useEffect(() => {
    if (!photo && ref.current) Object.assign(ref.current, limits);
  }, [photo, limits]);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={TARGET}
      enableDamping
      {...limits}
      screenSpacePanning={false}
      onChange={(e) => {
        // Keep the area on screen.
        const c = e?.target;
        // Photo mode never pans, and its close shots look at head height rather than the floor.
        if (!c || usePhoto.getState().active) return;
        const t = c.target;
        const b = bounds(useGame.getState());
        const cx = Math.max(b.x0, Math.min(b.x1, t.x));
        const cz = Math.max(b.z0, Math.min(b.z1, t.z));
        if (cx !== t.x || cz !== t.z || t.y !== 0) {
          const dx = cx - t.x;
          const dz = cz - t.z;
          const dy = -t.y;
          t.set(cx, 0, cz);
          c.object.position.x += dx;
          c.object.position.y += dy;
          c.object.position.z += dz;
        }
      }}
    />
  );
}
