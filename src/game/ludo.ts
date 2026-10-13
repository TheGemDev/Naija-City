// Ludo board geometry, shared by the rules (worker/ludo.ts) and the board drawing (src/ui/BoardGames.tsx).
// The board is a 15 by 15 grid. A seed's progress is one number: -1 in base, 0-50 round the track from its
// own starting square, 51-55 up its home stretch, 56 home.

/** The 52 track squares as [column, row], clockwise from red's starting square. */
export const LUDO_TRACK: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];

export const LUDO_COLORS = [
  { name: 'Red', fill: '#dc2626', soft: '#fecaca' },
  { name: 'Green', fill: '#16a34a', soft: '#bbf7d0' },
  { name: 'Yellow', fill: '#eab308', soft: '#fef08a' },
  { name: 'Blue', fill: '#2563eb', soft: '#bfdbfe' },
];

/** Track square each colour comes out on. */
export const LUDO_START = [0, 13, 26, 39];
/** Squares where a seed cannot be captured: the four starting squares and the four stars. */
export const LUDO_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const LUDO_HOME = 56;
/** Last step on the shared track; beyond it a seed is on its own home stretch. */
export const LUDO_LAP = 50;
/** Top-left corner of each colour's base. */
export const LUDO_BASE: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];

/** With two players they sit opposite each other. */
export const ludoColors = (seats: number) => (seats === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, seats));

/** The track square a seed of `color` stands on after `p` steps (0-50). */
export const ludoSquare = (color: number, p: number) => (LUDO_START[color] + p) % LUDO_TRACK.length;

/** Centre of the cell where seed `i` of `color` is drawn, in grid units. */
export function ludoCell(color: number, p: number, i: number): [number, number] {
  if (p < 0) {
    const [bx, by] = LUDO_BASE[color];
    return [bx + 1.75 + 2.5 * (i % 2), by + 1.75 + 2.5 * Math.floor(i / 2)];
  }
  if (p <= LUDO_LAP) {
    const [x, y] = LUDO_TRACK[ludoSquare(color, p)];
    return [x + 0.5, y + 0.5];
  }
  // The home stretch runs from the edge to the centre; the last step is home itself.
  const k = p - LUDO_LAP;
  const [x, y] = [[k, 7], [7, k], [14 - k, 7], [7, 14 - k]][color];
  return [x + 0.5, y + 0.5];
}
