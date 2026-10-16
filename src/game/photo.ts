// Photo mode: a camera that works wherever you are standing (your house, someone else's, the street,
// inside a shop). The shots are fixed set-ups (a selfie, a full-body portrait, the place around you, and
// at a house the whole building and its floor plan) and each one only lets the camera turn and zoom a
// little, so a thumb on a phone can't end up staring at a wall or under the floor.

import { create } from 'zustand';
import type { Clip } from '../three/Person';

export type Shot = 'selfie' | 'portrait' | 'room' | 'house' | 'plan';
export type PhotoLight = 'now' | 'day' | 'sunset' | 'night';
export type PhotoFormat = 'story' | 'post' | 'square' | 'wide';

/** Every picture comes out at one of these exact sizes, whatever screen it was taken on: the shapes the social apps want, plus a desktop-style 16:9. */
export const FORMATS: { id: PhotoFormat; label: string; w: number; h: number }[] = [
  { id: 'post', label: 'Post 4:5', w: 1080, h: 1350 },
  { id: 'story', label: 'Story 9:16', w: 1080, h: 1920 },
  { id: 'square', label: 'Square 1:1', w: 1080, h: 1080 },
  { id: 'wide', label: 'Wide 16:9', w: 1920, h: 1080 },
];
export const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f])) as Record<PhotoFormat, (typeof FORMATS)[number]>;

export interface ShotDef {
  id: Shot;
  label: string;
  /** Camera distance when the shot opens, and how far pinching may take it. For the house and plan shots these multiply the distance that fits the whole house on screen; the close shots shrink with me on the town map, where I am drawn small. */
  dist: number;
  minDist: number;
  maxDist: number;
  /** Angle down from straight overhead (0) to level with the floor (π/2): where it opens and how far a drag may tilt it. */
  tilt: number;
  minTilt: number;
  maxTilt: number;
  /** Height the camera looks at. */
  lookY: number;
  /** The camera stays on me (and I turn to face it) instead of on the middle of the house. */
  onMe: boolean;
  facesCamera: boolean;
  /** Needs a house to frame, so it is only offered at home or on a visit. */
  fitsHouse: boolean;
}

export const SHOTS: ShotDef[] = [
  { id: 'selfie', label: 'Selfie', dist: 2.7, minDist: 2, maxDist: 3.8, tilt: 1.38, minTilt: 1.1, maxTilt: 1.52, lookY: 1.36, onMe: true, facesCamera: true, fitsHouse: false },
  { id: 'portrait', label: 'Full body', dist: 6.2, minDist: 4.6, maxDist: 9, tilt: 1.3, minTilt: 0.95, maxTilt: 1.48, lookY: 0.9, onMe: true, facesCamera: true, fitsHouse: false },
  { id: 'room', label: 'Room', dist: 13, minDist: 8.5, maxDist: 20, tilt: 0.95, minTilt: 0.5, maxTilt: 1.3, lookY: 0.6, onMe: true, facesCamera: false, fitsHouse: false },
  { id: 'house', label: 'House', dist: 1, minDist: 0.6, maxDist: 1.25, tilt: 0.86, minTilt: 0.4, maxTilt: 1.25, lookY: 0, onMe: false, facesCamera: false, fitsHouse: true },
  { id: 'plan', label: 'Top down', dist: 1.05, minDist: 0.7, maxDist: 1.3, tilt: 0.1, minTilt: 0.02, maxTilt: 0.35, lookY: 0, onMe: false, facesCamera: false, fitsHouse: true },
];
export const SHOT_BY_ID = Object.fromEntries(SHOTS.map((s) => [s.id, s])) as Record<Shot, ShotDef>;

/** The shots on offer: all of them at a house, the ones centred on me anywhere else (where "Room" is whatever is around me). */
export const shotsFor = (atHouse: boolean, flying = false) =>
  flying ? SHOTS.filter((s) => s.id === 'selfie' || s.id === 'room').map((s) => (s.id === 'room' ? { ...s, label: 'Cabin' } : s))
    : atHouse ? SHOTS : SHOTS.filter((s) => !s.fitsHouse).map((s) => (s.id === 'room' ? { ...s, label: 'Around me' } : s));

export const POSES: { id: Clip; label: string }[] = [
  { id: 'idle', label: 'Stand' },
  { id: 'wave', label: 'Wave' },
  { id: 'dance', label: 'Dance' },
  { id: 'clap', label: 'Clap' },
  { id: 'talk', label: 'Gist' },
  { id: 'pray', label: 'Pray' },
];

/** The hour of day each light setting renders at (`now` follows the game clock). */
export const LIGHTS: { id: PhotoLight; label: string; hour: number | null }[] = [
  { id: 'now', label: 'Now', hour: null },
  { id: 'day', label: 'Midday', hour: 12 },
  { id: 'sunset', label: 'Sunset', hour: 16.9 },
  { id: 'night', label: 'Night', hour: 21 },
];

/** A picture as it came off the scene, before stickers, captions and the Naija City mark go on (ui/PhotoEditor.tsx). */
export interface PhotoResult {
  shot: HTMLCanvasElement;
  /** Where and on which day of this life it was taken, for the Naija City mark. */
  place: string | null;
  day: number;
}

interface PhotoState {
  active: boolean;
  shot: Shot;
  pose: Clip;
  light: PhotoLight;
  /** The size and shape the picture is saved at. */
  format: PhotoFormat;
  /** Leave me out of the picture (for shots of the place alone). */
  hideMe: boolean;
  /** Goes up each time the shutter is pressed; the scene takes the picture when it sees it change. */
  shutter: number;
  /** The picture just taken, waiting to be dressed up, shared, saved or thrown away. */
  result: PhotoResult | null;
  /** Opened from the Snap app: the picture is for posting there, not just for keeping. */
  forSnap: boolean;
  /** The colour filter over the picture (ui/photoCompose.ts LENSES): shown live on the scene, then baked in by the editor. */
  lens: string;
  /** Friends the snap is already addressed to (the camera button on a Snap chat row), ticked on the send screen. */
  sendTo: string[];
  open(forSnap?: boolean, sendTo?: string[]): void;
  close(): void;
  snap(): void;
  discard(): void;
}

export const usePhoto = create<PhotoState>((set, get) => ({
  active: false,
  shot: 'selfie',
  pose: 'idle',
  light: 'now',
  format: 'post',
  hideMe: false,
  shutter: 0,
  result: null,
  forSnap: false,
  lens: 'none',
  sendTo: [],
  // Opens on 4:5, the shape that shows biggest in a social feed; a wide desktop screen starts on 16:9.
  // A snap opens on 9:16, the shape Snap shows full screen.
  open: (forSnap = false, sendTo = []) => set({ forSnap, sendTo, lens: 'none', active: true, shot: 'selfie', pose: 'idle', light: 'now', format: forSnap ? 'story' : window.innerWidth > window.innerHeight ? 'wide' : 'post', hideMe: false, result: null }),
  close: () => {
    get().discard();
    set({ active: false });
  },
  snap: () => set((s) => ({ shutter: s.shutter + 1 })),
  discard: () => set({ result: null }),
}));

/** The hour photo mode wants the scene lit at, or null to follow the game clock. */
export function photoHour(): number | null {
  const s = usePhoto.getState();
  return s.active ? LIGHTS.find((l) => l.id === s.light)?.hour ?? null : null;
}
