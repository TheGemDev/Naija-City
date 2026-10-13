// Snakes & Ladders board, shared by the rules (worker/snakes.ts) and the drawing (src/ui/MoreBoards.tsx).
// Squares run 1 to 100 from the bottom-left, snaking up: left to right on the first row, right to left on the next.

/** Foot of each ladder and where it takes you. */
export const LADDERS: Record<number, number> = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
/** Head of each snake and where you slide to. */
export const SNAKES: Record<number, number> = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
export const SNAKES_END = 100;

/** Centre of a square on a 10 by 10 grid, as [x, y] with y going down the screen. Square 0 waits beside square 1. */
export function snakeCell(square: number): [number, number] {
  if (square <= 0) return [-0.45, 9.5];
  const row = Math.floor((square - 1) / 10);
  const step = (square - 1) % 10;
  return [(row % 2 ? 9 - step : step) + 0.5, 9.5 - row];
}
