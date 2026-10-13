// Cloudflare Turnstile: a bot check when claiming a username. Does nothing unless VITE_TURNSTILE_SITE_KEY is set at build time
// (and the Worker has TURNSTILE_SECRET), so the game works the same without it. The widget only shows itself if Cloudflare is unsure.

interface TurnstileApi {
  render(el: HTMLElement, options: { sitekey: string; appearance: string; callback: (token: string) => void; 'error-callback': () => void }): string;
  remove(id: string): void;
}

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';
let loading: Promise<TurnstileApi | null> | null = null;

function loadScript(): Promise<TurnstileApi | null> {
  loading ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve((window as unknown as { turnstile?: TurnstileApi }).turnstile ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}

/** A fresh Turnstile token for one request, or null if Turnstile is off, blocked or times out (the server decides what that means). */
export async function getTurnstileToken(): Promise<string | null> {
  if (!SITE_KEY) return null;
  const api = await loadScript();
  if (!api) return null;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10000';
  document.body.appendChild(host);
  return new Promise((resolve) => {
    let id = '';
    const done = (token: string | null) => {
      clearTimeout(timer);
      if (id) api.remove(id);
      host.remove();
      resolve(token);
    };
    const timer = setTimeout(() => done(null), 30_000);
    id = api.render(host, { sitekey: SITE_KEY, appearance: 'interaction-only', callback: (token) => done(token), 'error-callback': () => done(null) });
  });
}
