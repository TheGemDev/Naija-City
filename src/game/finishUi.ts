// What the Finishes tab is doing right now (not saved): which part you are working on, what you tapped in the house,
// and the finish you are trying before you pay. World.tsx draws the house with the try-out over the real finish.

import { create } from 'zustand';
import type { FinishChange } from './finishes';

export type FinishPart = 'floor' | 'wall' | 'face' | 'ceiling' | 'mood';

interface FinishUiState {
  /** The Finishes tab is open: taps on the house pick rooms and walls instead of walking. */
  on: boolean;
  part: FinishPart;
  /** Rooms picked (by name) for floor, wall and ceiling; wall faces (game/finishes.ts faceKey) for a feature wall. */
  rooms: string[];
  faces: string[];
  /** The finish being tried: undefined = nothing picked yet, null = back to as built. */
  value: string | null | undefined;
  /** The change it adds up to, drawn live until you buy it or back out. */
  draft: FinishChange | null;
}

export const useFinishUi = create<FinishUiState>(() => ({ on: false, part: 'floor', rooms: [], faces: [], value: undefined, draft: null }));

function draftOf(s: FinishUiState): FinishChange | null {
  if (!s.on || s.value === undefined || s.part === 'mood') return null;
  if (s.part === 'face') return s.faces.length ? { part: 'face', faces: s.faces, value: s.value } : null;
  return s.rooms.length ? { part: s.part, rooms: s.rooms, value: s.value } : null;
}

/** Changes what the tab is doing and works the try-out out again. */
export function setFinishUi(patch: Partial<Omit<FinishUiState, 'draft'>>) {
  useFinishUi.setState((s) => {
    const next = { ...s, ...patch };
    return { ...patch, draft: draftOf(next) };
  });
}

export const finishToolOn = () => useFinishUi.getState().on;
