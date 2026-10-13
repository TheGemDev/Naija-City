// Cloudflare Turnstile: a bot check on account creation. Off until TURNSTILE_SECRET is set
// (npx wrangler secret put TURNSTILE_SECRET), so local dev and the current game keep working.

declare global {
  interface Env {
    TURNSTILE_SECRET?: string;
  }
}

/** True if the token is a real, unused Turnstile pass, or if Turnstile isn't configured. */
export async function verifyTurnstile(env: Env, token: string | null, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    return !!((await res.json()) as { success?: boolean }).success;
  } catch {
    return false;
  }
}
