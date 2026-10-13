import { create } from 'zustand';

/** What the hospital charges to bring you round after you faint from hunger. */
export const HOSPITAL_BILL = 15_000;

/** Food levels the hunger warnings start at, and how often (game minutes) the last call repeats. */
export const HUNGER_WARN = { low: 25, faint: 10, faintEvery: 45 };

/** The last trip to hospital: what you paid, what went on your tab, and where you woke up. */
export interface FaintReport { paid: number; debt: number; hospital: string }

/** Set when you faint (game/store.ts); the card in ui/Fainted.tsx shows it until you close it. */
export const useFainted = create<{ report: FaintReport | null }>(() => ({ report: null }));
