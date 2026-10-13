// Every update removes the game files of the one before it. A phone that reopens an older page (a tab left open, or
// an app on the home screen woken from the cache) then asks for files that are gone and the game cannot start.

/** Shared with the same check in index.html, which covers the first script of the page. */
const KEY = 'kl-fresh';

/** Loads a new copy of the page from the server. At most once a minute unless forced, so a real outage cannot loop. False when it did not reload. */
export function freshPage(force = false): boolean {
  try {
    if (!force && Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    if (!force) return false; // storage blocked: nothing to stop a loop with
  }
  const url = new URL(location.href);
  url.searchParams.set('_r', String(Date.now()));
  location.replace(url);
  return true;
}

/** The error a browser throws when a game file it was told to load is not on the server any more. */
export const isMissingFile = (error: unknown) =>
  /dynamically imported module|importing a module script failed|unable to preload css|module script/i.test(String((error as Error | null)?.message ?? error));
