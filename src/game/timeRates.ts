// How fast game time runs. Shared by the client (store.ts) and the server (worker/clock.ts, worker/room.ts) so they agree.
// A full in-game day is DAY_REAL_MINUTES of real time while you're just standing around.

/** Game minutes in a day (the clock is 24 hours of 60). */
export const GAME_DAY_MINUTES = 24 * 60;
/** Real minutes one in-game day lasts when idle. */
export const DAY_REAL_MINUTES = 60;
/** Game minutes per real second on the world clock and for idle needs: 1440 / 3600 = 0.4. */
export const TIME_RATE = GAME_DAY_MINUTES / (DAY_REAL_MINUTES * 60);
/** Game minutes per real second inside a short task, so a "30 sec" action still takes 30 seconds. */
export const TASK_RATE = 1;
/** Game minutes per real second inside a long task (sleep, work) or cooking, so you aren't stuck waiting. */
export const SKIP_RATE = 10;
/** Tasks at least this many game minutes long skip ahead. */
export const SKIP_MIN_TASK = 90;
/** Game minutes per real second on a work shift (game/jobs.ts): a twelve-hour shift is three minutes at the workplace. The server credits a shift at SKIP_RATE (worker/clock.ts), so a shift at this pace always passes its check. */
export const WORK_RATE = 4;
