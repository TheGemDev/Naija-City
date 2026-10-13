// Mutable per-frame avatar state. Lives outside React/zustand so movement doesn't re-render the UI.

import type { Cell } from './grid';
import type { Pose } from './catalog';

export interface Snap {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const avatar = {
  /** Logical position, always the centre of a walkable cell when idle. */
  x: 11.5,
  z: 8.5,
  yaw: 0,
  path: [] as Cell[],
  onArrive: null as null | (() => void),
  /** A street story interrupts the trip once this few cells of the route are left. */
  storyAt: null as number | null,
  pose: 'stand' as Pose,
  exhausted: false,
  /** When sitting or lying, the avatar is drawn here instead. */
  snap: null as Snap | null,
  recoverAt: 0,
};

export const avatarCell = (): Cell => ({ x: Math.floor(avatar.x), z: Math.floor(avatar.z) });

export function resetAvatar(cell: Cell) {
  avatar.x = cell.x + 0.5;
  avatar.z = cell.z + 0.5;
  avatar.path = [];
  avatar.onArrive = null;
  avatar.storyAt = null;
  avatar.pose = 'stand';
  avatar.exhausted = false;
  avatar.snap = null;
  avatar.recoverAt = 0;
}

/** Where the avatar was actually drawn last frame (incl. sit/lie snaps). Shared with other players. */
export type NetPose = 'stand' | 'walk' | 'sit' | 'lie' | 'hidden';
export const avatarView = { x: avatar.x, y: 0, z: avatar.z, yaw: 0, pose: 'stand' as NetPose };
