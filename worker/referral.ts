// Referral links: naija.city/?ref=<code>. Every player's username is their code (the Invite button in Messages), and
// referral_links can hold other codes made by hand (migrations/0083_referrals.sql). Nothing else counts.
// The browser reports the click once when the link is opened, and the signup once the visitor has an account.

import type { FirebaseUser } from './auth';

const CODE_RE = /^[a-z0-9_]{1,15}$/;
/** An account older than this was not brought in by the link it just opened. */
const NEW_PLAYER_MS = 24 * 60 * 60_000;

const ok = () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function codeOf(req: Request): Promise<string | null> {
  const b = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof b?.code === 'string' ? b.code.toLowerCase() : '';
  return CODE_RE.test(code) ? code : null;
}

/**
 * A username's link gets its row the first time it is used. The row follows whoever holds the username now, so a
 * name that changed hands does not pay its old owner. `clicks` is 1 for an opened link, 0 to only make the row.
 */
const playerLink = (env: Env, code: string, now: number, clicks: 0 | 1) =>
  env.DB.prepare(
    `INSERT INTO referral_links (code, owner_uid, created_at, clicks)
     SELECT username, uid, ?2, ?3 FROM players WHERE username = ?1
     ON CONFLICT(code) DO UPDATE SET owner_uid = excluded.owner_uid, clicks = clicks + ?3`,
  ).bind(code, now, clicks);

/** POST /api/ref/click: someone opened a link. No sign-in, so it is limited per address. */
export async function referralClick(req: Request, env: Env): Promise<Response> {
  if (env.RL_PUBLIC && !(await env.RL_PUBLIC.limit({ key: `ref:${req.headers.get('cf-connecting-ip') ?? 'anon'}` })).success) return ok();
  const code = await codeOf(req);
  // A link that was never made, or a table that is not there yet, is not the visitor's problem.
  if (code) {
    const mine = await playerLink(env, code, Date.now(), 1).run().catch(() => null);
    // Not a username: a code made by hand.
    if (!mine?.meta.changes) await env.DB.prepare('UPDATE referral_links SET clicks = clicks + 1 WHERE code = ?').bind(code).run().catch(() => null);
  }
  return ok();
}

/** POST /api/ref/claim: the signed-in player arrived through a link. Counts once, only for a new account, never for the link's owner. */
export async function referralClaim(req: Request, env: Env, user: FirebaseUser): Promise<Response> {
  const code = await codeOf(req);
  const now = Date.now();
  if (code) {
    // The click may never have landed (rate limit, blocked request), so the row is made here too.
    await env.DB.batch([
      playerLink(env, code, now, 0),
      env.DB.prepare(
        `INSERT OR IGNORE INTO referral_signups (uid, code, created_at)
         SELECT ?1, l.code, ?3 FROM referral_links l
         WHERE l.code = ?2 AND l.owner_uid != ?1
           AND NOT EXISTS (SELECT 1 FROM players p WHERE p.uid = ?1 AND p.created_at < ?3 - ?4)`,
      ).bind(user.uid, code, now, NEW_PLAYER_MS),
    ]).catch(() => null);
  }
  return ok();
}
