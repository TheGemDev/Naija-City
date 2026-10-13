// Player uploads (ad pictures, profile pictures, share cards) live in R2, not D1. Uploads are small, signed-in only and
// checked by their first bytes; reads are public, cached at the edge, and can be resized on the fly by Cloudflare Images.

import type { FirebaseUser } from './auth';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const WIDTHS = new Set([64, 128, 256, 512, 1024, 1600]);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Do the first bytes really match the declared image type? Stops other files being hosted under an image name. */
export function sniff(type: string, b: Uint8Array): boolean {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  if (type === 'image/png') return at(0, 0x89, 0x50, 0x4e, 0x47);
  if (type === 'image/jpeg') return at(0, 0xff, 0xd8, 0xff);
  if (type === 'image/gif') return at(0, 0x47, 0x49, 0x46, 0x38);
  if (type === 'image/webp') return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
  return false;
}

/** POST /api/media (body = the image, content-type = its type) → { url }. */
export async function uploadMedia(req: Request, env: Env, user: FirebaseUser): Promise<Response> {
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return json({ error: 'Upload a PNG, JPEG, WebP or GIF' }, 415);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return json({ error: 'Pictures are limited to 2 MB' }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return json({ error: 'Pictures are limited to 2 MB' }, 413);
  if (!sniff(type, bytes)) return json({ error: 'That file is not a real ' + ext.toUpperCase() }, 415);
  const key = `u/${user.uid}/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  return json({ url: `/api/media/${key}` });
}

/** GET /api/media/u/<uid>/<file>[?w=256]: public. Add w= (64–1600) for a smaller WebP copy. */
export async function readMedia(env: Env, key: string, width: number): Promise<Response> {
  const object = await env.MEDIA.get(key);
  if (!object) return json({ error: 'Not found' }, 404);
  const headers = { 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' };
  if (WIDTHS.has(width)) {
    const out = await env.IMAGES.input(object.body).transform({ width }).output({ format: 'image/webp' });
    return new Response(out.image(), { headers: { ...headers, 'content-type': out.contentType() } });
  }
  return new Response(object.body, { headers: { ...headers, 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' } });
}

/** Keys we hand out look like u/<uid>/<uuid>.<ext>; nothing else is readable through the API. */
export const MEDIA_KEY = /^u\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;
