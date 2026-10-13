// Verifies Firebase Auth ID tokens (RS256 JWTs) against Google's published keys.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface FirebaseUser {
  uid: string;
  email?: string;
  name?: string;
}

interface Jwk extends JsonWebKey {
  kid: string;
}

let keyCache: { keys: Map<string, CryptoKey>; expires: number } | null = null;

async function signingKeys(): Promise<Map<string, CryptoKey>> {
  if (keyCache && keyCache.expires > Date.now()) return keyCache.keys;
  const res = await fetch(JWKS_URL, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  const maxAge = Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  keyCache = { keys: map, expires: Date.now() + maxAge * 1000 };
  return map;
}

function b64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const decodePart = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

export async function verifyIdToken(token: string, projectId: string): Promise<FirebaseUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decodePart(parts[0]);
    const p = decodePart(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return null;

    const now = Math.floor(Date.now() / 1000);
    const skew = 60;
    if (p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 128) return null;
    if (p.exp < now - skew || p.iat > now + skew || p.auth_time > now + skew) return null;

    let key = (await signingKeys()).get(header.kid);
    if (!key) {
      // Keys rotate; refetch once.
      keyCache = null;
      key = (await signingKeys()).get(header.kid);
    }
    if (!key) return null;
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), data);
    return ok ? { uid: p.sub, email: p.email, name: p.name } : null;
  } catch {
    return null;
  }
}
