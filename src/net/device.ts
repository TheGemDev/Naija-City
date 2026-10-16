// Tells the server which device a call comes from, so the EFCC can see accounts played from one phone (worker/links.ts).
// The device id is random and kept in this browser's storage (and a cookie, in case one of them is cleared). The
// fingerprint is a hash of the hardware and settings, which stays the same in a private window or after a clear.
// The server keeps only salted hashes of both.

const KEY = 'nc-device';
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function deviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (!id || !ID_RE.test(id)) id = document.cookie.match(/(?:^|;\s*)nc_device=([A-Za-z0-9_-]{8,64})/)?.[1] ?? null;
  if (!id) id = crypto.randomUUID();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked */
  }
  document.cookie = `nc_device=${id}; max-age=${5 * 365 * 86_400}; path=/; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  return id;
}

/** The graphics chip's name: one of the most telling parts of a fingerprint. */
function gpu(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

async function fingerprint(): Promise<string> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const parts = [
    nav.userAgent,
    nav.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    // Either way up: turning the phone doesn't make it another device.
    [screen.width, screen.height].sort((a, b) => a - b).join('x'),
    screen.colorDepth,
    devicePixelRatio,
    nav.hardwareConcurrency,
    nav.deviceMemory ?? '',
    nav.maxTouchPoints,
    gpu(),
  ].join('|');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
  return [...new Uint8Array(hash).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let headers: Promise<Record<string, string>> | null = null;

/** Headers for every API call. Worked out once; a failure just sends none. */
export function deviceHeaders(): Promise<Record<string, string>> {
  headers ??= (async () => {
    const out: Record<string, string> = {};
    try {
      out['x-nc-device'] = deviceId();
    } catch {
      /* no storage, no cookie: the fingerprint still goes */
    }
    try {
      out['x-nc-print'] = await fingerprint();
    } catch {
      /* no crypto.subtle (an insecure page) */
    }
    return out;
  })();
  return headers;
}
