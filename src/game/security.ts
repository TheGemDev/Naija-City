// Home security cameras: each CCTV item watches a cone in front of it. A burglar who walks into a cone
// is caught and the owner is told there is a thief in the house. Shared by the client (to draw the cones
// and warn the thief) and the worker (which decides, from the position it tracks itself).

import { ITEMS } from './catalog';
import { itemTransform, wallBetween, type HouseLayout, type PlacedItem } from './grid';

export const CAMERA = {
  /** How far a camera sees, in tiles. */
  range: 5,
  /** Full width of the view cone, in radians. */
  fov: (70 * Math.PI) / 180,
};

export const isCamera = (item: PlacedItem) => !!ITEMS[item.type]?.camera;

/** Where a camera sits and which way it looks (models face +z at rotation 0). */
export function cameraView(item: PlacedItem) {
  const { cx, cz, yaw } = itemTransform(item);
  return { x: cx, z: cz, dx: Math.sin(yaw), dz: Math.cos(yaw), yaw };
}

/** True when nothing but open floor lies between the two points (walls block the view). */
function clearLine(ax: number, az: number, bx: number, bz: number, layout: HouseLayout) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
  let cell = { x: Math.floor(ax), z: Math.floor(az) };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const next = { x: Math.floor(ax + (bx - ax) * t), z: Math.floor(az + (bz - az) * t) };
    if (next.x === cell.x && next.z === cell.z) continue;
    if (next.x !== cell.x && next.z !== cell.z) {
      // Crossed a corner: open if either way round is open.
      const viaX = { x: next.x, z: cell.z };
      const viaZ = { x: cell.x, z: next.z };
      const open = (!wallBetween(cell, viaX, layout) && !wallBetween(viaX, next, layout)) ||
        (!wallBetween(cell, viaZ, layout) && !wallBetween(viaZ, next, layout));
      if (!open) return false;
    } else if (wallBetween(cell, next, layout)) {
      return false;
    }
    cell = next;
  }
  return true;
}

/** The first camera that can see a person standing at (x, z), or null. */
export function cameraSpotting(items: PlacedItem[], layout: HouseLayout, x: number, z: number): PlacedItem | null {
  for (const item of items) {
    if (!isCamera(item)) continue;
    const v = cameraView(item);
    const ox = x - v.x;
    const oz = z - v.z;
    const dist = Math.hypot(ox, oz);
    if (dist > CAMERA.range) continue;
    if (dist > 0.5 && (ox * v.dx + oz * v.dz) / dist < Math.cos(CAMERA.fov / 2)) continue;
    if (clearLine(v.x, v.z, x, z, layout)) return item;
  }
  return null;
}
