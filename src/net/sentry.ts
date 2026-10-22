// Crash and error reporting to Sentry. Does nothing unless VITE_SENTRY_DSN is set at build time (the DSN is public by
// design). Uncaught errors and unhandled promise rejections are caught automatically once it is on; the crash screen
// (src/ui/CrashScreen.tsx) adds the ones React catches itself. Loaded on its own so the game does not carry it until needed.

const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) || '';

type Sentry = typeof import('./sentryClient');
let ready: Promise<Sentry | null> | null = null;

export function startErrorReporting(): void {
  if (!DSN || ready) return;
  ready = import('./sentryClient')
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        release: document.querySelector<HTMLMetaElement>('meta[name="kaduna-version"]')?.content || undefined,
        environment: location.hostname === 'localhost' ? 'development' : 'production',
        // Errors only: no performance traces or session replays, to stay inside the free plan.
        tracesSampleRate: 0,
        ignoreErrors: [
          'ResizeObserver loop',
          'Non-Error promise rejection captured',
          /Loading chunk \d+ failed/,
          /Failed to fetch dynamically imported module/,
          // The same missing file after an update, as Safari and Firefox word it. The page reloads itself (freshPage.ts).
          /is not a valid JavaScript MIME type/,
          /Importing a module script failed/,
          /error loading dynamically imported module/,
          /Unable to preload CSS/,
          // The player's network dropped mid sign-in or token refresh; the session retries on its own.
          'auth/network-request-failed',
        ],
      });
      return Sentry;
    })
    .catch(() => null);
}

/** Report an error React caught (the crash screen), with the screen it broke in. */
export function reportError(error: unknown, where: string): void {
  void ready?.then((Sentry) => Sentry?.captureException(error, { extra: { where } }));
}
