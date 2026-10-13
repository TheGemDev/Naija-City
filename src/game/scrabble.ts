// Scrabble board and tiles, shared by the rules (worker/scrabble.ts) and the board (src/ui/MoreBoards.tsx).

export const SCRABBLE_SIZE = 15;
export const SCRABBLE_CENTRE = 112;
export const SCRABBLE_RACK = 7;
/** Extra points for playing all seven tiles at once. */
export const SCRABBLE_BINGO = 50;
/** The blank tile: it can stand for any letter and scores nothing. */
export const BLANK = '?';

/** T/D: triple/double word. t/d: triple/double letter. The board is symmetric, so the bottom half mirrors the top. */
const HALF = ['T..d...T...d..T', '.D...t...t...D.', '..D...d.d...D..', 'd..D...d...D..d', '....D.....D....', '.t...t...t...t.', '..d...d.d...d..'];
export const SCRABBLE_PREMIUMS = [...HALF, 'T..d...D...d..T', ...[...HALF].reverse()].join('');

export const SCRABBLE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, [BLANK]: 0,
};

/** How many of each tile are in the bag: 100 in all. */
export const SCRABBLE_TILES: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, [BLANK]: 2,
};

/** Points for a letter standing on the board: a lower-case letter is a blank and scores nothing. */
export const scrabbleValue = (letter: string) => (letter >= 'a' ? 0 : SCRABBLE_VALUES[letter] ?? 0);
