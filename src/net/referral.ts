// Referral links: naija.city/?ref=<code>, where the code is the inviting player's username (inviteLink in
// net/deeplink.ts). The code is read once on load and kept on this device until the visitor has an account, then
// reported to the server (worker/referral.ts), which decides whether it counts.

const KEY = 'kaduna-ref';
const DONE = 'done';

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (value: string) => {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private windows can refuse storage: the click is still counted, the signup is not.
  }
};

/** Read ?ref= off the address bar, count the click, and tidy the URL. */
export function takeReferral() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('ref')?.toLowerCase();
  if (code === undefined) return;
  params.delete('ref');
  const rest = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
  // One click per browser: opening the link again, or after signing up, is not a new visitor.
  if (!/^[a-z0-9_]{1,15}$/.test(code) || read()) return;
  write(code);
  void fetch('/api/ref/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }), keepalive: true }).catch(() => {});
}

/** After sign-in: tell the server which link brought this player. `api` is the signed-in fetch (net/session.ts). */
export async function claimReferral(api: (path: string, init?: RequestInit) => Promise<Response>) {
  const code = read();
  if (!code || code === DONE) return;
  try {
    const res = await api('/api/ref/claim', { method: 'POST', body: JSON.stringify({ code }) });
    if (res.ok) write(DONE);
  } catch {
    // No network: the next sign-in tries again.
  }
}
