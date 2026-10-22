// Money requests (Messages → Request, and the bail and ransom pleas that ride on them): each one stays open for a real
// day, then lapses unpaid. The server won't take payment for a lapsed one (worker/social.ts), and chat shows it Expired.

export const REQUEST_TTL_MS = 24 * 3_600_000;

/** Whether a request sent at `at` (real ms) has lapsed. */
export const requestLapsed = (at: number, now = Date.now()) => now - at >= REQUEST_TTL_MS;
