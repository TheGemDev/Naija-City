// Driving you control on the town map: your own car, a rented keke or okada (pick up passengers for
// fares), or a horse in the Durbar parade. Police checkpoints on the main roads want "something for
// the boys": pay, argue, or speed off. Steering runs per frame in three/Drive.tsx via stepDrive().

import { create } from 'zustand';
import { avatar } from './avatar';
import { activeMap, cityMap, cellIsBridge, cellIsRoad, cityWalkable, isOpen, placeHere, potholeOf, potholeSites, type Place } from './city';
import { cityNameHere, regionPlaces } from './regions';
import { CAR_BY_ID } from './cars';
import { hourOf, naira, useGame } from './store';
import { driveHooks, driveState, type Vehicle } from './driveState';
import { activeEvent, roadMods } from './live';
import { fareTax } from './fares';
import { isHighNow, viceHooks } from './vice';
import { PARK_LEVY, RENTAL } from './gigs';
import { parkIn } from './underworld';
import { blockerOf, conditionOf, PARTS } from './carCare';
import { useRoads } from '../net/roads';
import { pickScene, sceneById, sceneLine, type SceneCtx } from './roadScenes';

export { driveState, type Vehicle } from './driveState';

/* ---------- Tuning ---------- */

const SPEC: Record<Vehicle, { max: number; accel: number; turn: number; offroad: number; label: string; icon: string }> = {
  keke: { max: 5, accel: 4, turn: 2.6, offroad: 0.55, label: 'Keke', icon: '🛺' },
  okada: { max: 7, accel: 6, turn: 3.2, offroad: 0.65, label: 'Okada', icon: '🏍️' },
  car: { max: 8, accel: 5, turn: 2.4, offroad: 0.45, label: 'Car', icon: '🚗' },
  horse: { max: 6, accel: 5, turn: 3.4, offroad: 1, label: 'Horse', icon: '🐎' },
};
export const vehicleSpec = (v: Vehicle) => SPEC[v];

/** Police checkpoints on the main roads (tile coordinates, centre of the road). */
export const CHECKPOINTS: { id: string; x: number; z: number; road: string; horiz: boolean }[] = [
  { id: 'abw', x: 29, z: 22, road: 'Ahmadu Bello Way', horiz: false },
  { id: 'kachia', x: 29, z: 58, road: 'Kachia Road', horiz: false },
  { id: 'bypass', x: 9, z: 58, road: 'Nnamdi Azikiwe Bypass', horiz: false },
  { id: 'constitution', x: 49, z: 30, road: 'Constitution Road', horiz: false },
  { id: 'independence', x: 40, z: 17, road: 'Independence Way', horiz: true },
  { id: 'aminu', x: 20, z: 53, road: 'Aminu Kano Way', horiz: true },
].filter((c) => cityMap('kaduna').isRoad(Math.floor(c.x), Math.floor(c.z)));

const CHECKPOINTS_BY_CITY: Record<string, typeof CHECKPOINTS> = {
  kaduna: CHECKPOINTS,
  abuja: [
    { id: 'abj-airport', x: 20, z: 45, road: 'Airport Road', horiz: true },
    { id: 'abj-kubwa', x: 40, z: 8, road: 'Kubwa Expressway', horiz: true },
    { id: 'abj-zik', x: 31, z: 30, road: 'Nnamdi Azikiwe Expressway', horiz: false },
    { id: 'abj-shagari', x: 63, z: 21, road: 'Shehu Shagari Way', horiz: false },
    { id: 'abj-goodluck', x: 56, z: 45, road: 'Goodluck Jonathan Expressway', horiz: true },
  ],
  lagos: [
    { id: 'lag-ikorodu', x: 43, z: 13, road: 'Ikorodu Road', horiz: false },
    { id: 'lag-oshodi', x: 20, z: 18, road: 'Oshodi–Apapa Expressway', horiz: true },
    { id: 'lag-western', x: 16, z: 27, road: 'Western Avenue', horiz: true },
    { id: 'lag-gbagada', x: 66, z: 18, road: 'Gbagada Expressway', horiz: true },
    { id: 'lag-lekki', x: 76, z: 42, road: 'Lekki–Epe Expressway', horiz: true },
    { id: 'lag-ahmadu', x: 30, z: 52, road: 'Ahmadu Bello Way', horiz: true },
  ],
  kano: [
    { id: 'kan-katsina', x: 22, z: 8, road: 'Katsina Road', horiz: true },
    { id: 'kan-murtala', x: 54, z: 19, road: 'Murtala Mohammed Way', horiz: true },
    { id: 'kan-zaria', x: 42, z: 46, road: 'Zaria Road', horiz: false },
    { id: 'kan-bypass', x: 75, z: 34, road: 'Eastern Bypass', horiz: false },
    { id: 'kan-buk', x: 6, z: 30, road: 'BUK Road', horiz: true },
    { id: 'kan-maiduguri', x: 66, z: 41, road: 'Maiduguri Road', horiz: true },
  ],
};
/** The checkpoints of the city you are in. */
export const checkpointsHere = () => CHECKPOINTS_BY_CITY[activeMap().id] ?? [];

const CHECKPOINT_REACH = 1.2;
/** A checkpoint you've just passed leaves you alone for this long. */
const CHECKPOINT_RESPITE_MS = 90_000;

const PASSENGERS = [
  { name: 'Hajiya Binta', line: 'Abeg drive gently, I carry eggs.' },
  { name: 'Musa the student', line: 'Bros, I get only small change o.' },
  { name: 'Pastor Emeka', line: 'God bless this keke and its driver!' },
  { name: 'Aunty Rakiya', line: 'Turn the music up, na my song!' },
  { name: 'Corper Tunde', line: 'Is this the way to the NYSC office?' },
  { name: 'Mallam Sani', line: 'Assalamu alaikum. Quickly please, I’m late for prayers.' },
  { name: 'Big Boy Jide', line: 'Drive like Lewis Hamilton, I go dash you extra.' },
  { name: 'Mama Ngozi', line: 'Why is everything so expensive in this country?' },
  { name: 'Yusuf the trader', line: 'Watch out for that pothole! Ah, too late.' },
  { name: 'Zainab', line: 'Can you wait 2 minutes? I’m coming. (She takes 20.)' },
];

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/* ---------- UI state ---------- */

/** `dispatch`: food and parcels on a rented dispatch bike (an okada with a cool box), Chowdeck style. */
export type Gig = 'keke' | 'okada' | 'dispatch';

export interface Passenger {
  name: string;
  line: string;
  pickup: { x: number; z: number };
  to: string;
  toName: string;
  fare: number;
  boarded: boolean;
  /** Real time (ms) to get them there for the full fare. */
  deadline: number | null;
  /** A dispatch order: what it is and the place it is collected from (its door is `pickup`). */
  order?: { item: string; from: string; fromName: string };
}

export interface CheckpointStop {
  id: string;
  road: string;
  /** Which roadside encounter this is (game/roadScenes.ts). */
  scene: string;
  line: string;
  ask: number;
}

interface DriveUI {
  vehicle: Vehicle | null;
  gig: Gig | null;
  passenger: Passenger | null;
  trips: number;
  earned: number;
  checkpoint: CheckpointStop | null;
  /** Place door you're parked by, so you can go in. */
  near: string | null;
  /** Durbar parade: gates passed and when you started. */
  durbar: { gate: number; startedAt: number } | null;
  speed: number;
}

export const useDrive = create<DriveUI>(() => ({
  vehicle: null, gig: null, passenger: null, trips: 0, earned: 0, checkpoint: null, near: null, durbar: null, speed: 0,
}));

const cleared: Record<string, number> = {};
let tilesPending = 0;
let lastFlush = 0;
let lastStoryRoll = 0;
let lastPothole = 0;
let spawnAt = 0;
/** When the next unplanned roadside stop may happen, and which encounter came up last. */
let randomStopAt = 0;
let lastScene = '';

/* ---------- Durbar course ---------- */

/** Gates round Murtala Square, in order. */
export function durbarGates() {
  const m = placeHere('murtala')!;
  const inset = 0.9;
  return [
    { x: m.x + m.w / 2, z: m.z + m.d - inset },
    { x: m.x + m.w - inset, z: m.z + m.d - inset },
    { x: m.x + m.w - inset, z: m.z + inset },
    { x: m.x + m.w / 2, z: m.z + inset },
    { x: m.x + inset, z: m.z + inset },
    { x: m.x + inset, z: m.z + m.d - inset },
    { x: m.x + m.w / 2, z: m.z + m.d - inset },
  ];
}
export const DURBAR_SECONDS = 70;

/* ---------- Start / stop ---------- */

function inCity() {
  const g = useGame.getState();
  if (g.view !== 'city') g.openMap();
  return useGame.getState().view === 'city';
}

function place(at: { x: number; z: number }, heading = 0) {
  avatar.path = [];
  avatar.onArrive = null;
  avatar.snap = null;
  avatar.pose = 'stand';
  avatar.x = at.x + 0.5;
  avatar.z = at.z + 0.5;
  driveState.heading = heading;
  avatar.yaw = heading;
  driveState.speed = 0;
}

/** Get behind the wheel. Gigs pick up a rented keke/okada at the motor park. */
export function startDrive(vehicle: Vehicle, opts: { gig?: Gig; carId?: string } = {}) {
  const g = useGame.getState();
  if (driveState.vehicle) stopDrive(true);
  if (g.jailedUntil && g.jailedUntil > Date.now()) return g.toast('⛓️ You are in a cell.');
  if (g.heldUntil && g.heldUntil > Date.now()) return g.toast('🪢 You are being held.');
  if (g.task?.actionId === 'work' && g.task.phase === 'doing') return g.toast('You are at work');
  if (vehicle === 'car') {
    const carId = opts.carId ?? g.selectedCar ?? g.ownedCars[0];
    if (!carId || !g.ownedCars.includes(carId)) return g.toast('You need your own car. Open Phone → Autos');
    const broken = blockerOf(conditionOf(g.carCondition, carId));
    if (broken) return g.toast(`🔧 Your ${CAR_BY_ID[carId]?.name ?? 'car'} won't move: the ${PARTS[broken].label.toLowerCase()} is gone. Phone → Autos → mechanic.`);
    driveState.carId = carId;
  }
  if (opts.gig) {
    const fee = RENTAL[opts.gig];
    if (g.money < fee) return g.toast(`Renting a ${opts.gig} for the day costs ${naira(fee)}`);
  }
  if (!inCity()) return;
  if (g.task) useGame.getState().cancelTask();
  if (opts.gig) {
    g.charge(RENTAL[opts.gig], `Rented a ${opts.gig} for the day`, `rent-${opts.gig}`);
    const park = placeHere(parkIn(activeMap().id).place)!;
    place(park.door, Math.PI);
    useGame.setState((s) => ({ teleportId: s.teleportId + 1 }));
    g.toast(`${SPEC[vehicle].icon} Picked up your rented ${opts.gig} at ${park.name}. Look for passengers waving! 🙋🏾`);
  } else if (vehicle === 'horse') {
    const gates = durbarGates();
    place({ x: Math.floor(gates[0].x), z: Math.floor(gates[0].z) + 1 }, Math.PI);
    useGame.setState((s) => ({ teleportId: s.teleportId + 1 }));
  } else {
    driveState.heading = avatar.yaw;
    driveState.speed = 0;
    avatar.path = [];
    avatar.onArrive = null;
    g.toast(`🚗 ${CAR_BY_ID[driveState.carId!]?.name ?? 'Car'} started. WASD / arrows to drive, E to go inside places.`);
  }
  driveState.vehicle = vehicle;
  driveState.keys = { up: false, down: false, left: false, right: false };
  spawnAt = Date.now() + 1500;
  useGame.setState({ placeId: null, selectedId: null });
  randomStopAt = Date.now() + 60_000 + Math.random() * 90_000;
  useDrive.setState({
    vehicle, gig: opts.gig ?? null, passenger: null, trips: 0, earned: 0, checkpoint: null, near: null, speed: 0,
    durbar: vehicle === 'horse' ? { gate: 0, startedAt: Date.now() } : null,
  });
}

export function stopDrive(quiet = false) {
  if (!driveState.vehicle) return;
  const ui = useDrive.getState();
  flushTiles(true);
  // Leave the vehicle on a walkable cell.
  const cx = Math.floor(avatar.x);
  const cz = Math.floor(avatar.z);
  let best = { x: cx, z: cz };
  if (!cityWalkable(best)) {
    outer: for (let r = 1; r < 6; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++)
          if (cityWalkable({ x: cx + dx, z: cz + dz })) {
            best = { x: cx + dx, z: cz + dz };
            break outer;
          }
  }
  avatar.x = best.x + 0.5;
  avatar.z = best.z + 0.5;
  driveState.vehicle = null;
  driveState.speed = 0;
  driveState.stall = 0;
  if (!quiet) {
    const g = useGame.getState();
    if (ui.gig) g.toast(`🅿️ Returned the ${ui.gig}. ${ui.trips} trip${ui.trips === 1 ? '' : 's'}, ${naira(ui.earned)} earned today.`);
    else if (ui.vehicle === 'horse') g.toast('🐎 You handed the horse back to its rider.');
    else g.toast('🅿️ Parked.');
  }
  useDrive.setState({ vehicle: null, gig: null, passenger: null, checkpoint: null, near: null, durbar: null, speed: 0 });
}

driveHooks.stop = stopDrive;

/* ---------- Passengers ---------- */

function randomRoadCell(near: { x: number; z: number }, min: number, max: number) {
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = min + Math.random() * (max - min);
    const x = Math.floor(near.x + Math.cos(a) * r);
    const z = Math.floor(near.z + Math.sin(a) * r);
    if (cellIsRoad(x, z) && !cellIsBridge(x, z) && cityWalkable({ x, z })) return { x, z };
  }
  return null;
}

function spawnPassenger(gig: Gig) {
  const g = useGame.getState();
  const pickup = randomRoadCell({ x: avatar.x, z: avatar.z }, 5, 16);
  if (!pickup) return;
  const hour = hourOf(g.minutes);
  const options = regionPlaces(g.destinationId).filter(
    (p: Place) => p.id !== 'home' && p.id !== 'prison' && p.id !== 'camp' && isOpen(p, hour) && Math.hypot(p.door.x - pickup.x, p.door.z - pickup.z) > 9,
  );
  if (!options.length) return;
  const to = pick(options);
  const dist = Math.hypot(to.door.x - pickup.x, to.door.z - pickup.z);
  const base = gig === 'keke' ? 500 : 400;
  const per = gig === 'keke' ? 65 : 55;
  const surge = (activeEvent() === 'fuel' ? 1.5 : 1) * roadMods().fare * fareTax();
  const who = pick(PASSENGERS);
  useDrive.setState({
    passenger: { ...who, pickup, to: to.id, toName: to.name, fare: Math.min(gig === 'keke' ? 6_000 : 5_000, Math.round((base + dist * per) * surge / 50) * 50), boarded: false, deadline: null },
  });
}

/* ---------- Dispatch ---------- */

const ORDERS = [
  { name: 'Amaka (Wuse flat 4B)', item: '🍲 Jollof and chicken', line: 'Abeg bring am hot, I never chop since morning.' },
  { name: 'Mr Okafor', item: '📦 Phone charger', line: 'Call me when you reach the gate.' },
  { name: 'Hajiya Laraba', item: '🥩 Two wraps of suya', line: 'Tell them extra yaji!' },
  { name: 'Tolu the developer', item: '🍕 Pizza', line: 'Leave it with the security man.' },
  { name: 'Aunty Funke', item: '💊 Pharmacy order', line: 'Quick quick please, na for my mama.' },
  { name: 'Ibrahim', item: '🥤 Zobo and chapman', line: 'Make e still dey cold o.' },
  { name: 'Pastor Ade', item: '📄 Printed programmes', line: 'Service starts by 4. Don’t be late.' },
  { name: 'Ngozi', item: '🍰 Birthday cake', line: 'If the cake scatter, you go pay.' },
];

/** Places that sell food or goods: a place where some action fills you up, or a market or mall. */
const sellsFood = (p: Place) => /market|mall|buka|suya|canteen|restaurant|eatery|kitchen|food|chop/i.test(`${p.id} ${p.name}`) || p.actions.some((a) => (a.perHour?.hunger ?? 0) > 20);

function spawnOrder() {
  const g = useGame.getState();
  const hour = hourOf(g.minutes);
  const open = regionPlaces(g.destinationId).filter((p: Place) => p.id !== 'home' && p.id !== 'prison' && p.id !== 'camp' && isOpen(p, hour));
  const shops = open.filter(sellsFood);
  const from = pick(shops.length ? shops : open);
  if (!from) return;
  const options = open.filter((p) => p.id !== from.id && Math.hypot(p.door.x - from.door.x, p.door.z - from.door.z) > 10);
  if (!options.length) return;
  const to = pick(options);
  const dist = Math.hypot(to.door.x - from.door.x, to.door.z - from.door.z) + Math.hypot(from.door.x - avatar.x, from.door.z - avatar.z) * 0.4;
  const surge = (activeEvent() === 'fuel' ? 1.3 : 1) * roadMods().fare;
  const o = pick(ORDERS);
  useDrive.setState({
    passenger: {
      name: o.name, line: o.line, pickup: { x: from.door.x, z: from.door.z }, to: to.id, toName: to.name,
      fare: Math.min(8_000, Math.round((900 + dist * 80) * surge / 50) * 50), boarded: false, deadline: null,
      order: { item: o.item, from: from.id, fromName: from.name },
    },
  });
  g.toast(`📦 New order: ${o.item} from ${from.name} to ${to.name}`);
}

/* ---------- Checkpoints ---------- */

function checkpointAsk() {
  const v = driveState.vehicle;
  if (v === 'keke' || v === 'okada') return 200;
  const car = driveState.carId ? CAR_BY_ID[driveState.carId] : null;
  return car && car.price > 20_000_000 ? 5_000 : car && car.price > 5_000_000 ? 2_000 : 1_000;
}

export type CheckpointChoice = 'pay' | 'argue' | 'flee';

/** Start an encounter on the road: a fixed checkpoint, or a random stop between them. */
function startStop(id: string, road: string) {
  const scene = pickScene(lastScene);
  lastScene = scene.id;
  driveState.speed = 0;
  useDrive.setState({ checkpoint: { id, road, scene: scene.id, line: sceneLine(scene), ask: Math.round((checkpointAsk() * roadMods().askMult) / 50) * 50 } });
}

/** policeFunding: the governor's police budget (0–100): better-funded police chase harder. */
export function resolveCheckpoint(choiceIndex: number, policeFunding = 50) {
  const stop = useDrive.getState().checkpoint;
  if (!stop) return;
  const choice = sceneById(stop.scene).choices[choiceIndex];
  if (!choice) return;
  const g = useGame.getState();
  cleared[stop.id] = Date.now();
  useDrive.setState({ checkpoint: null });
  const spend = (amount: number, label: string) => g.charge(Math.min(amount, Math.max(0, Math.floor(useGame.getState().money))), label, 'checkpoint');
  const ctx: SceneCtx = {
    ask: stop.ask,
    roll: Math.random,
    toast: (t) => g.toast(t),
    spend,
    win: (amount, label) => void useGame.getState().earn('luck', amount, label),
    delay: (minutes, energy = 0, fun = 0) =>
      useGame.setState((st) => ({ minutes: st.minutes + minutes, needs: { ...st.needs, energy: Math.max(0, st.needs.energy - energy), fun: Math.max(0, Math.min(100, st.needs.fun + fun)) } })),
    fun: (by) => useGame.setState((st) => ({ needs: { ...st.needs, fun: Math.max(0, Math.min(100, st.needs.fun + by)) } })),
    notoriety: (by) => useGame.setState((st) => ({ notoriety: st.notoriety + by })),
    stall: (seconds) => { driveState.stall = seconds; },
    impound: () => stopDrive(true),
    classic: (kind) => classicOutcome(kind, stop, policeFunding),
  };
  choice.run(ctx);
}

function classicOutcome(choice: CheckpointChoice, stop: CheckpointStop, policeFunding: number) {
  const g = useGame.getState();
  const spend = (amount: number, label: string) => g.charge(Math.min(amount, Math.max(0, Math.floor(useGame.getState().money))), label, 'checkpoint');
  if (choice === 'pay') {
    if (g.money < stop.ask) {
      g.toast('“You no get ₦' + stop.ask + '? Park there!” They held you for an hour.');
      useGame.setState((s) => ({ minutes: s.minutes + 60 }));
      return;
    }
    spend(stop.ask, 'Checkpoint “settlement”');
    g.bump('bribes');
    g.toast(pick(['“Oya go! Safe journey, chairman.” 🫡', '“God bless you, my oga!” The barrier lifts.', 'He pocketed it without looking. Smooth.']));
    return;
  }
  if (choice === 'argue') {
    const r = Math.random();
    if (r < 0.45) {
      g.bump('argued');
      g.toast(pick(['“You know your rights abi? Oya go.” ⚖️', 'You quoted the constitution. He waved you on just to stop you talking.', '“Lawyer, carry go!” You won the argument.']));
    } else if (r < 0.8) {
      useGame.setState((s) => ({ minutes: s.minutes + 30, needs: { ...s.needs, energy: Math.max(0, s.needs.energy - 6), fun: Math.max(0, s.needs.fun - 8) } }));
      g.toast('They checked your “papers” for 30 minutes out of spite. 😤');
    } else {
      const fine = spend(5_000, 'Checkpoint fine: “obstruction”');
      g.toast(`They charged you with “obstruction of justice”. ${naira(fine)} gone. 🫠`);
    }
    return;
  }
  const escape = Math.max(0.3, Math.min(0.8, 0.78 - policeFunding * 0.004)) + (driveState.vehicle === 'okada' ? 0.1 : 0);
  if (Math.random() < escape) {
    g.bump('escapes');
    useGame.setState((s) => ({ notoriety: s.notoriety + 1, needs: { ...s.needs, fun: Math.min(100, s.needs.fun + 15) } }));
    driveState.speed = SPEC[driveState.vehicle ?? 'car'].max * 1.2;
    driveHooks.onEscape?.();
    g.toast(pick(['💨 You floored it and lost them in traffic!', '💨 Their Hilux no get fuel. You escaped!', '💨 Gone! They are still looking for your plate number.']));
    return;
  }
  const fine = spend(driveState.vehicle === 'car' ? 25_000 : 15_000, 'Caught fleeing a checkpoint');
  g.bump('caught');
  useGame.setState((s) => ({ notoriety: s.notoriety + 2 }));
  g.toast(`🚓 They chased you down. ${naira(fine)} fine and the vehicle is impounded for today.`);
  stopDrive(true);
}


/* ---------- Per frame ---------- */

function flushTiles(force = false) {
  const now = performance.now();
  if (!force && now - lastFlush < 4000) return;
  lastFlush = now;
  const n = Math.floor(tilesPending);
  if (n > 0) {
    tilesPending -= n;
    useGame.getState().bump('tiles', n);
  }
}

function nearDoor(): string | null {
  const g = useGame.getState();
  for (const p of regionPlaces(g.destinationId)) {
    if (p.id === 'prison' || p.id === 'camp' || (p.id === 'home' && g.destinationId !== g.homeState)) continue;
    if (Math.hypot(p.door.x + 0.5 - avatar.x, p.door.z + 0.5 - avatar.z) < 1.6) return p.id;
  }
  return null;
}

/** Steer, collide, and run the passengers / checkpoints / Durbar. Called every frame from three/Drive.tsx. */
export function stepDrive(dt: number) {
  const v = driveState.vehicle;
  if (!v) return;
  const g = useGame.getState();
  if (g.view !== 'city') return stopDrive(true);
  const ui = useDrive.getState();
  dt = Math.min(dt, 0.05);
  driveState.stall = Math.max(0, driveState.stall - dt);
  const stalled = driveState.stall > 0;
  const paused = !!ui.checkpoint || !!g.streetStory || g.panel === 'phone' || g.owambe || stalled;
  const spec = SPEC[v];
  const k = driveState.keys;
  const blocked = g.roadBlockUntil && g.roadBlockUntil > Date.now() ? 0.6 : 1;
  const carBoost = v === 'car' && driveState.carId ? CAR_BY_ID[driveState.carId]?.speed ?? 1 : 1;
  const cell = { x: Math.floor(avatar.x), z: Math.floor(avatar.z) };
  const onRoad = cellIsRoad(cell.x, cell.z) || cellIsBridge(cell.x, cell.z);
  const mods = roadMods();
  const max = spec.max * carBoost * blocked * mods.speed * (onRoad ? 1 : spec.offroad);

  if (paused) {
    driveState.speed *= Math.max(0, 1 - dt * 8);
  } else {
    if (k.up) driveState.speed = Math.min(max, driveState.speed + spec.accel * dt);
    else if (k.down) driveState.speed = Math.max(-2, driveState.speed - spec.accel * 1.6 * dt);
    else driveState.speed *= Math.max(0, 1 - dt * 1.8);
    if (driveState.speed > max) driveState.speed = Math.max(max, driveState.speed - spec.accel * 2 * dt);
    const steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
    if (steer) driveState.heading += steer * spec.turn * dt * Math.min(1, Math.abs(driveState.speed) / 2 + 0.2) * Math.sign(driveState.speed || 1);
    // High: the road sways and the pedals lag. The police can smell it too (net/vice.ts).
    if (isHighNow() && Math.abs(driveState.speed) > 1) {
      driveState.heading += Math.sin(Date.now() / 380) * 0.75 * dt * Math.min(1, Math.abs(driveState.speed) / 3);
      viceHooks.onDriveTick?.();
    }
  }

  const step = driveState.speed * dt;
  if (Math.abs(step) > 1e-4) {
    const nx = avatar.x + Math.sin(driveState.heading) * step;
    const nz = avatar.z + Math.cos(driveState.heading) * step;
    if (cityWalkable({ x: Math.floor(nx), z: Math.floor(nz) })) {
      avatar.x = nx;
      avatar.z = nz;
      tilesPending += Math.abs(step);
    } else if (cityWalkable({ x: Math.floor(nx), z: Math.floor(avatar.z) })) {
      avatar.x = nx; // slide along walls
      driveState.speed *= 0.7;
    } else if (cityWalkable({ x: Math.floor(avatar.x), z: Math.floor(nz) })) {
      avatar.z = nz;
      driveState.speed *= 0.7;
    } else {
      driveState.speed = -driveState.speed * 0.3;
    }
  }
  avatar.yaw = driveState.heading;
  avatar.path = [];

  // Potholes: a jolt, and you lose speed. Floods and dust hide them, so they bite from further away.
  driveState.bump = Math.max(0, driveState.bump - dt * 3);
  const now = Date.now();
  if (Math.abs(driveState.speed) > 2 && v !== 'horse' && now - lastPothole > 1200) {
    // Only the potholes still open on the server (worker/roads.ts); the governor may have fixed some.
    const open = useRoads.getState().open;
    const reach = mods.potholeReach;
    // Only this city's sites: the server numbers every city's potholes in one list.
    const hole = potholeSites(activeMap().id).filter((i) => open.includes(i)).map((i) => potholeOf(i)!).find((p) => Math.hypot(p.x - avatar.x, p.z - avatar.z) < reach) ?? null;
    if (hole) {
      lastPothole = now;
      const fast = Math.abs(driveState.speed);
      driveState.speed *= 0.5 - hole.severity * 0.08;
      driveState.bump = 1;
      g.bump('potholes');
      if (v === 'car' && driveState.carId) g.damageCar(driveState.carId, hole.severity === 3 ? 'suspension' : 'tyres', hole.severity * 3);
      if (hole.severity === 3) g.toast(pick(['💥 GBAM! That pothole nearly swallowed you.', '💥 Ah! Your shock absorber is crying.', '💥 Pothole! Your passenger hit their head. “Driver, you dey craze?”']));
      potholeTrouble(v, hole.severity, fast, mods.troubleMult);
    }
  }

  if (!paused) {
    // Checkpoints
    if (v !== 'horse') {
      for (const c of checkpointsHere()) {
        if (now - (cleared[c.id] ?? 0) < CHECKPOINT_RESPITE_MS * roadMods(now).respiteMult) continue;
        if (Math.hypot(c.x - avatar.x, c.z - avatar.z) < CHECKPOINT_REACH) {
          startStop(c.id, c.road);
          break;
        }
      }
    }

    // Random stops between the fixed checkpoints, so the road keeps surprising you.
    if (v !== 'horse' && !ui.checkpoint && now > randomStopAt) {
      randomStopAt = now + 120_000 + Math.random() * 180_000;
      if (Math.abs(driveState.speed) > 1.5) startStop(`random-${now}`, 'On the road');
    }

    // Passengers
    if (ui.gig) {
      const p = ui.passenger;
      if (!p && now > spawnAt) (ui.gig === 'dispatch' ? spawnOrder() : spawnPassenger(ui.gig));
      else if (p && !p.boarded && Math.hypot(p.pickup.x + 0.5 - avatar.x, p.pickup.z + 0.5 - avatar.z) < 1.4 && Math.abs(driveState.speed) < 3) {
        const to = placeHere(p.to)!;
        const dist = Math.hypot(to.door.x - avatar.x, to.door.z - avatar.z);
        useDrive.setState({ passenger: { ...p, boarded: true, deadline: now + (dist / (SPEC[v].max * 0.45) + 15) * 1000 } });
        g.toast(p.order ? `📦 Picked up ${p.order.item} at ${p.order.fromName} → ${p.toName}, ${naira(p.fare)}` : `🙋🏾 ${p.name}: “${p.line}” → ${p.toName}, ${naira(p.fare)}`);
      } else if (p?.boarded) {
        const to = placeHere(p.to)!;
        if (Math.hypot(to.door.x + 0.5 - avatar.x, to.door.z + 0.5 - avatar.z) < 1.8 && Math.abs(driveState.speed) < 3) dropOff(p, now);
      }
    }

    // Durbar course
    if (ui.durbar) {
      const gates = durbarGates();
      const next = gates[ui.durbar.gate];
      const elapsed = (now - ui.durbar.startedAt) / 1000;
      if (elapsed > DURBAR_SECONDS) {
        g.toast('🐎 Too slow! The parade moved on without you. Try again next Durbar.');
        stopDrive(true);
        return;
      }
      if (next && Math.hypot(next.x - avatar.x, next.z - avatar.z) < 1.3) {
        const gate = ui.durbar.gate + 1;
        if (gate >= gates.length) {
          const prize = g.earn('durbar_prize', Math.round(35_000 - elapsed * 250), 'Durbar parade prize');
          g.bump('durbarRides');
          useGame.setState((s) => ({ goodDeeds: s.goodDeeds + 1, needs: { ...s.needs, fun: 100, social: Math.min(100, s.needs.social + 30) } }));
          g.toast(`🏆 What a ride! The Emir saluted you. ${naira(prize)} prize and the crowd is chanting your name.`);
          stopDrive(true);
          return;
        }
        useDrive.setState({ durbar: { ...ui.durbar, gate } });
      }
    }

    // A story on the road now and then.
    if (now - lastStoryRoll > 40_000 && Math.abs(driveState.speed) > 1) {
      lastStoryRoll = now;
      g.maybeStory(0.22 + mods.storyBoost);
    }
  }

  const near = Math.abs(driveState.speed) < 1.5 ? nearDoor() : null;
  const speed = Math.round(Math.abs(driveState.speed) * 12);
  if (near !== ui.near || speed !== ui.speed) useDrive.setState({ near, speed });
  flushTiles();
}

/** A bad pothole can do more than jolt you: a flat tyre, a fall off the bike, an angry passenger. */
function potholeTrouble(v: Vehicle, severity: number, speed: number, mult: number) {
  const g = useGame.getState();
  const ui = useDrive.getState();
  const chance = ({ 1: 0, 2: 0.08, 3: 0.22 } as Record<number, number>)[severity] ?? 0;
  // Passengers feel every bump: each hit shaves a little off the fare.
  if (ui.passenger?.boarded && severity >= 2) {
    const fare = Math.max(Math.round(ui.passenger.fare * 0.5 / 50) * 50, Math.round(ui.passenger.fare * 0.92 / 50) * 50);
    if (fare !== ui.passenger.fare) {
      useDrive.setState({ passenger: { ...ui.passenger, fare } });
      g.toast(`😠 ${ui.passenger.name}: “Driver, mind the road! I go reduce your fare.”`);
    }
  }
  if (Math.random() >= chance * mult) return;
  if (v === 'okada' && speed > 5) {
    driveState.stall = 8;
    driveState.speed = 0;
    useGame.setState((s) => ({ needs: { ...s.needs, energy: Math.max(0, s.needs.energy - 12), fun: Math.max(0, s.needs.fun - 10) } }));
    const bill = g.charge(2_000, 'Dressing the wound after an okada fall', 'pothole');
    if (ui.passenger) {
      useDrive.setState({ passenger: null });
      g.toast(`🏍️ You and your passenger flew off the bike! They ran away without paying. ${naira(bill)} for the clinic.`);
    } else g.toast(`🏍️ You flew off the bike! ${naira(bill)} for the clinic.`);
  } else if (v === 'keke') {
    driveState.stall = 6;
    driveState.speed = 0;
    const bill = g.charge(1_500, 'Keke wheel realigned after a pothole', 'pothole');
    g.toast(`🛺 The keke tilted on two wheels and slammed back down. Axle bent. ${naira(bill)} at the roadside mechanic.`);
  } else if (v === 'car') {
    driveState.stall = 7;
    driveState.speed = 0;
    const bill = g.charge(severity === 3 ? 8_000 : 4_000, 'Burst tyre patched at the roadside', 'pothole');
    if (driveState.carId) g.damageCar(driveState.carId, 'tyres', 8);
    g.toast(`🛞 Burst tyre! A boy with a jack and no shame fixes it for ${naira(bill)}.`);
  }
}

function dropOff(p: Passenger, now: number) {
  const g = useGame.getState();
  const ui = useDrive.getState();
  const gig = ui.gig!;
  spawnAt = now + 2500;
  useDrive.setState({ passenger: null });
  if (!p.order && Math.random() < 0.06) {
    g.toast(`🏃🏾 ${p.name} jumped out and ran without paying! Welcome to ${cityNameHere()}.`);
    return;
  }
  const late = p.deadline !== null && now > p.deadline;
  // Delivery customers tip more, and only when the food arrives on time.
  const tip = !late && Math.random() < (p.order ? 0.4 : 0.25) ? (p.order ? 500 : 400) : 0;
  const fare = (late ? Math.round(p.fare / 2 / 50) * 50 : p.fare) + tip;
  const paid = p.order
    ? g.earn('dispatch_fare', fare, `Dispatch: ${p.order.item} to ${p.toName}`)
    : g.earn(gig === 'keke' ? 'keke_fare' : 'okada_fare', fare, `${gig === 'keke' ? 'Keke' : 'Okada'} fare: ${p.toName}`);
  // The motor park's boss takes dues from every fare (worker/fun.ts pays them out). The dispatch company is not a park.
  const levy = p.order ? 0 : Math.round(paid * PARK_LEVY);
  if (levy > 0) g.charge(levy, 'Motor park dues', `levy:${parkIn(activeMap().id).id}`);
  g.bump('trips');
  g.bump('fares', paid);
  const tax = Math.floor((paid * g.taxRate) / 100);
  useDrive.setState({ trips: ui.trips + 1, earned: ui.earned + paid - levy - tax });
  if (p.order) g.toast(late ? `😒 ${p.name}: “This food don cold!” Half pay, +${naira(paid)}` : `📦 Delivered! ${p.name} paid ${naira(paid)}${tip ? ' (with a tip!)' : ''} ⭐⭐⭐⭐⭐`);
  else g.toast(late ? `😒 ${p.name} paid half: “You too slow!” +${naira(paid)}` : `💰 ${p.name} paid ${naira(paid)}${tip ? ' (with a tip!)' : ''}. Park dues ${naira(levy)}.`);
}

/** Get out at the place you're parked beside and go in. */
export function enterNearby() {
  const id = useDrive.getState().near;
  if (!id) return;
  const p = placeHere(id)!;
  stopDrive(true);
  avatar.x = p.door.x + 0.5;
  avatar.z = p.door.z + 0.5;
  useGame.getState().startPlace(id, 'walk');
}
