// What an inside area is made of, and the helpers its layout is written with. The layouts themselves are in
// game/interiors.ts and, grouped by kind of place, in game/places/.

export interface PropDef {
  w: number;
  d: number;
  /** Floor props can be walked on (mats, markers, exit). */
  floor?: boolean;
  seat?: { y: number; z: number };
  /** Lie-down spot (like a house bed). */
  bed?: { y: number; z: number };
  /** Visitors gather at it even when it has nothing for you to do (a check-in desk, a baggage belt). */
  counter?: boolean;
}

export interface Prop {
  id: string;
  type: string;
  x: number;
  z: number;
  rot: number;
  /** Action ids: from the place's activities, or 'work' / 'leave'. */
  actions: string[];
  name?: string;
  /** Words on a sign, a gate number, an airline's name over its desk. */
  text?: string;
  /** Cities whose version of this place does not have this prop (game/interiors.ts propsHere). */
  notIn?: string[];
}

/** Somebody who works there, standing at their post (three/Interior.tsx has the looks). */
export interface StaffSpot {
  x: number;
  z: number;
  /** 0 faces the door (+z); the default is facing away from it. */
  yaw?: number;
  look: string;
}

export interface Interior {
  w: number;
  h: number;
  outdoor?: boolean;
  /** A clearing in the bush: no fence, the scene draws a wall of trees instead. */
  jungle?: boolean;
  /** Two floor tile colours. */
  floor: [string, string];
  wall?: string;
  /** Door gap in the front wall (z = h). */
  doorX: number;
  /** Cells you can't walk on (water, pitch edges...). Drawn with `blockedColour`. */
  blocked?: { x: number; z: number; w: number; d: number }[];
  blockedColour?: string;
  /** Floor patches of another finish (bathroom tiles, a terrace). Only looks: you walk on them as normal. */
  tiles?: { x: number; z: number; w: number; d: number; colour: string }[];
  /** A room inside another place (a hotel room up the lift, the cells behind the charge room): no ground round it, no crowd, no ads. */
  room?: boolean;
  /** Barred cells (the police cells, game/cells.ts): only somebody locked in one can reach what is in it. */
  cells?: { x: number; z: number; w: number; d: number }[];
  /** Every prop is kept as placed, instead of thinning repeats down to two of a kind. */
  dense?: boolean;
  /** Stretches of the back wall that are glass, as [from, to] in x: you see what is outside through them. */
  glass?: [number, number][];
  /** Ground behind the back wall, in tiles, for whatever stands outside (an airport's apron). */
  behind?: number;
  /** Who works here and where they stand. */
  staff?: StaffSpot[];
  props: Prop[];
}

let n = 0;
export const p = (type: string, x: number, z: number, actions: string[] = [], rot = 0, name?: string, text?: string): Prop => ({ id: `p${n++}`, type, x, z, rot, actions, name, text });
/** A prop that is there to be read: `text` is what it says. */
export const sign = (type: string, x: number, z: number, text: string, rot = 0) => p(type, x, z, [], rot, undefined, text);
export const exit = (x: number, z: number) => p('exit', x, z, ['leave'], 0, 'Exit');
