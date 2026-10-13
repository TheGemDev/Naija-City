// Per-frame driving state (like game/avatar.ts): lives outside React so steering doesn't re-render the UI.
// The rules and the UI state are in game/drive.ts.

export type Vehicle = 'keke' | 'okada' | 'car' | 'horse';

export const driveState = {
  vehicle: null as Vehicle | null,
  carId: null as string | null,
  speed: 0,
  /** Facing, same convention as avatar.yaw (atan2(dx, dz)). */
  heading: 0,
  keys: { up: false, down: false, left: false, right: false },
  /** Short bounce after a pothole, for the vehicle model. */
  bump: 0,
  /** Seconds left stuck at the roadside (flat tyre, thrown from the bike…). */
  stall: 0,
};

/** Set by game/drive.ts so the store can park the vehicle without importing the driving rules. */
export const driveHooks: {
  stop: null | ((quiet?: boolean) => void);
  /** The network layer tells the server about checkpoint escapes (street cred, worker/fun.ts). */
  onEscape: null | (() => void);
} = { stop: null, onEscape: null };
