// Shared by every Street Game's rules: what a game must implement, and the server's dice.

export type Move = Record<string, unknown>;

export interface Rules<S> {
  init(seats: number): S;
  /** Seats that must act now (empty once the game is over). */
  pending(s: S): number[];
  /** Apply a move. Returns an error message, or null if it was played. */
  move(s: S, seat: number, m: Move): string | null;
  /** The seat walks away or runs out of time. */
  drop(s: S, seat: number): void;
  /** Winning seats (more than one: they share the pot), or null while the game is on. */
  result(s: S): number[] | null;
  view(s: S, seat: number): unknown;
}

export const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
export const randInt = (n: number) => Math.floor(rand() * n);

export function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
