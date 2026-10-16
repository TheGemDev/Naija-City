// Bathing: while you bathe or shower, your clothes come off and a frosted pixel mosaic covers you, the way The Sims does
// it (three/Censor.tsx, three/Avatar.tsx). Washing clothes, the dishes or your face, and a child's bath time, don't count.
import { decodeLook, encodeLook } from './wardrobe';

/** The activities that are a bath or a shower. */
export const BATH_ACTIONS = new Set([
  'bath', 'bathe', 'hot_bucket', 'drum_bath', 'shower', 'hot_shower', 'gym_shower', 'hosp_shower',
  'room_shower', 'room_bath', 'room_jacuzzi', 'tub_soak',
]);

export const isBathing = (task: { actionId?: string; phase?: string } | null | undefined) =>
  !!task && task.phase === 'doing' && !!task.actionId && BATH_ACTIONS.has(task.actionId);

/** Using a toilet: you keep your clothes on, but the blur covers your lap while you sit. */
export const TOILET_ACTIONS = new Set(['use', 'use_bidet', 'use_squat', 'room_toilet', 'cell_toilet']);

export const isOnToilet = (task: { actionId?: string; phase?: string } | null | undefined) =>
  !!task && task.phase === 'doing' && !!task.actionId && TOILET_ACTIONS.has(task.actionId);

/** The same person with nothing on: hair and face stay, every garment and accessory goes. */
export function bareLook(look: string): string {
  const a = decodeLook(look);
  return encodeLook({ ...a, outfit: {} });
}
