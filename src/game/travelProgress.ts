// How far along the route you are, and how long it has left: for the trip card in the HUD (ui/Hud.tsx TaskChip).
// The route lives outside the store (avatar.ts, and heli.ts for a helicopter) so moving never re-renders React: the
// card reads this on a timer instead, a few times a second.

import { avatar } from './avatar';
import type { Cell } from './grid';
import { heliSecondsLeft } from './heli';
import { injured } from './injury';
import { CATCH } from './crime';
import type { Task } from './store';

/** Cells a second on foot in a room or an estate up close, across the town map, and how much quicker a ride is there. */
export const WALK_SPEED = 2.4;
export const MAP_SPEED = 5;
export const RIDE_BOOST = 1.7;

/** The town map and the estates are both seen from above with small people. */
export const onMap = (view: string) => view === 'city' || view === 'estate';

/** A ride on the town map (keke, okada, cab, car, helicopter) rather than your own two feet. */
export const riding = (task: Task | null | undefined) => task?.actionId === 'enter' && task.phase === 'walking' && (task.travelMode ?? 'walk') !== 'walk';

/** Cells a second the avatar moves along its route right now (three/Avatar.tsx moves it at exactly this). */
export const routeSpeed = (view: string, task: Task | null | undefined, visiting: boolean) =>
  (!visiting && onMap(view) ? MAP_SPEED * (riding(task) ? RIDE_BOOST : 1) : WALK_SPEED) * (injured() ? CATCH.slowFactor : 1);

/** Cells still to go: to the next cell, then cell to cell to the end. A helicopter flies straight to the last one. */
function cellsLeft(path: Cell[], straight: boolean) {
  if (straight) {
    const end = path[path.length - 1];
    return Math.hypot(end.x + 0.5 - avatar.x, end.z + 0.5 - avatar.z);
  }
  let d = 0;
  let x = avatar.x;
  let z = avatar.z;
  for (const c of path) {
    d += Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z);
    x = c.x + 0.5;
    z = c.z + 0.5;
  }
  return d;
}

/** Each route as first seen (the whole of it) and the furthest along it has been shown, so the bar never slips back. */
const routes = new WeakMap<Cell[], { whole: number; done: number }>();

export interface RouteReading {
  /** 0 at the start of this route, 1 at the door. */
  done: number;
  /** Real seconds to the door at the pace you are going. */
  secs: number;
}

/**
 * Where you are on the route you are on: null when you are not moving along one. A new route (a new place picked, the
 * next leg of a trip) starts again from 0. A helicopter is measured in time, so its wind-up and landing count too.
 */
export function readRoute(view: string, task: Task | null | undefined, visiting: boolean): RouteReading | null {
  const path = avatar.path;
  if (!path.length) return null;
  const heli = view === 'city' && riding(task) && task?.travelMode === 'helicopter';
  const left = heli ? heliSecondsLeft() : cellsLeft(path, false);
  const secs = heli ? left : left / routeSpeed(view, task, visiting);
  let seen = routes.get(path);
  if (!seen) routes.set(path, (seen = { whole: Math.max(left, 0.001), done: 0 }));
  // A longer estimate than the whole (the rotor took its time) stretches the whole, rather than taking the bar back.
  if (left > seen.whole) seen.whole = left;
  seen.done = Math.max(seen.done, Math.min(1, 1 - left / seen.whole));
  return { done: seen.done, secs };
}
