// A helicopter ride across the town map, flown rather than slid along the street: the rotor winds up, it lifts
// straight off the ground, turns on the spot to face the place, dips its nose and goes, flares nose-up as it slows
// and settles on its skids at the door. Mutable per-frame state like avatar.ts: Avatar.tsx flies it, City.tsx draws it.

import { avatar } from './avatar';
import { mapGroundY } from './city';
import type { Cell } from './grid';

/** Cells a second at full cruise, gained each second pulling away and shed each second slowing down. */
const CRUISE = 22;
const ACCEL = 12;
const BRAKE = 10;
/** Seconds for the rotor to wind up from still (it lifts once it's flat out). */
const SPOOL = 1.1;
/** Seconds from wherever it left off to cruising height. */
const CLIMB = 1.6;
/** Seconds for the last drop onto the skids, and to sit there with the rotor turning before you climb out. */
const LAND = 1.4;
const SETTLE = 0.35;
/** How high it climbs: a little over the roofs for a hop, higher for a long way. */
const LOW = 3.2;
const HIGH = 7.5;

type Phase = 'spool' | 'fly' | 'land' | 'settle';

export const heli = {
  /** The route being flown; a new one starts a new flight. */
  trip: null as Cell[] | null,
  phase: 'spool' as Phase,
  /** Seconds into the phase, and when it was last flown (a flight left alone for a moment is over). */
  t: 0,
  at: 0,
  /** Rotor speed, 0 still to 1 flying. */
  rpm: 0,
  /** Height above the ground, the height this trip cruises at, and the height the phase began at. */
  alt: 0,
  top: 0,
  from: 0,
  /** The ground it's flying over: blended from take-off to landing, so a bridge on the way isn't a bump. */
  base: 0,
  ground0: 0,
  ground1: 0,
  span: 0,
  /** Cells a second forward. */
  speed: 0,
  yaw: 0,
  yawRate: 0,
  /** Nose down (+) or up (-), and roll into a turn to the left (+), both in radians. */
  pitch: 0,
  bank: 0,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ease = (k: number) => {
  const t = clamp(k, 0, 1);
  return t * t * (3 - 2 * t);
};
/** The share of the way to a target to close this frame, the same at any frame rate. */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

function begin(path: Cell[], left: number) {
  const h = heli;
  // Re-routed in the air (a new place picked mid-flight): carry on from here rather than drop to the ground.
  const recent = performance.now() - h.at < 1000;
  const airborne = !!h.trip && recent && h.alt > 0.3;
  const end = path[path.length - 1];
  h.trip = path;
  h.span = Math.max(left, 0.01);
  h.ground0 = airborne ? h.base : mapGroundY(avatar.x, avatar.z);
  h.ground1 = mapGroundY(end.x + 0.5, end.z + 0.5);
  h.top = clamp(2 + left * 0.15, LOW, HIGH);
  h.t = 0;
  if (airborne) {
    h.phase = 'fly';
    h.from = h.alt;
    return;
  }
  h.phase = 'spool';
  h.alt = 0;
  h.from = 0;
  h.speed = 0;
  h.yaw = avatar.yaw;
  h.yawRate = 0;
  h.pitch = 0;
  h.bank = 0;
  h.base = h.ground0;
  // The rotor may still be turning from the last flight; otherwise it starts from still.
  if (!recent) h.rpm = 0;
}

/** One frame of a helicopter ride: moves the avatar straight for the last cell of its path and lands it there. */
export function flyHeli(dt: number) {
  const a = avatar;
  if (!a.path.length) return;
  const h = heli;
  const end = a.path[a.path.length - 1];
  const tx = end.x + 0.5;
  const tz = end.z + 0.5;
  let dx = tx - a.x;
  let dz = tz - a.z;
  let left = Math.hypot(dx, dz);
  if (h.trip !== a.path) begin(a.path, left);
  h.at = performance.now();
  h.t += dt;

  h.rpm = Math.min(1, h.rpm + dt / SPOOL);
  let heading = h.yaw;
  let accel = 0;
  if (h.phase === 'spool') {
    if (h.rpm >= 1) {
      h.phase = 'fly';
      h.t = 0;
    }
  } else if (h.phase === 'fly') {
    // Up on a curve, and eased down a little on the approach so the final drop is a short one.
    const approach = Math.min((CRUISE * CRUISE) / (2 * BRAKE), h.span * 0.45);
    const climb = h.from + (h.top - h.from) * ease(h.t / CLIMB);
    const near = h.top * (0.45 + 0.55 * ease(left / Math.max(approach, 0.01)));
    h.alt = Math.min(climb, near);
    if (left > 0.05) heading = Math.atan2(dx, dz);
    // Nothing forward until it's well off the ground and facing the right way.
    const facing = Math.abs(Math.atan2(Math.sin(heading - h.yaw), Math.cos(heading - h.yaw))) < 0.35;
    const ready = facing && h.alt > h.top * 0.4;
    // Never faster than it can stop in, so it slows evenly into the landing spot.
    const want = ready ? Math.min(CRUISE, Math.sqrt(2 * BRAKE * left)) : 0;
    const was = h.speed;
    h.speed = want > h.speed ? Math.min(want, h.speed + ACCEL * dt) : Math.max(want, h.speed - BRAKE * 1.5 * dt);
    accel = (h.speed - was) / Math.max(dt, 0.001);
    const step = (ready ? Math.max(h.speed, 0.5) : h.speed) * dt;
    if (step >= left) {
      a.x = tx;
      a.z = tz;
      h.speed = 0;
      h.phase = 'land';
      h.from = h.alt;
      h.t = 0;
    } else if (step > 0) {
      a.x += (dx / left) * step;
      a.z += (dz / left) * step;
    }
  } else if (h.phase === 'land') {
    // Eased off the hover and gently onto the skids.
    h.alt = h.from * (1 - ease(h.t / LAND));
    if (h.t >= LAND) {
      h.alt = 0;
      h.phase = 'settle';
      h.t = 0;
    }
  } else if (h.t >= SETTLE) {
    // Down: you climb out at the door.
    a.yaw = h.yaw;
    h.trip = null;
    a.path = [];
    const f = a.onArrive;
    a.onArrive = null;
    f?.();
    return;
  }

  dx = tx - a.x;
  dz = tz - a.z;
  left = Math.hypot(dx, dz);
  h.base = h.ground1 + (h.ground0 - h.ground1) * clamp(left / h.span, 0, 1);

  // Turn on a soft spring towards the heading, only once the skids are off the ground.
  const off = h.alt > 0.25 ? Math.atan2(Math.sin(heading - h.yaw), Math.cos(heading - h.yaw)) : 0;
  const w = 2.6;
  h.yawRate += (w * w * off - 2 * w * h.yawRate) * dt;
  h.yaw += h.yawRate * dt;
  a.yaw = h.yaw;

  // Nose down to pull away and a little in the cruise, nose up to slow down; leaning into a turn, more with speed.
  // (Turning on the spot in a hover it hardly leans at all.)
  const pitch = clamp(0.07 * (h.speed / CRUISE) + 0.18 * (accel / ACCEL), -0.2, 0.2);
  const bank = clamp(h.yawRate * (0.08 + h.speed / CRUISE) * 0.4, -0.35, 0.35);
  h.pitch += (pitch - h.pitch) * damp(3.5, dt);
  h.bank += (bank - h.bank) * damp(4, dt);
}
