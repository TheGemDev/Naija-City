// The Government Gazette: whatever an office holder does with their powers goes on record (civic_news) and the
// whole city is told at once: a live notice to everyone online, a push notification to everyone else.
// The Civic app's News tab reads the record back (src/ui/Gazette.tsx).

import { announceAll } from './shards';
import { broadcastPush } from './push';
import { GAZETTE_SHOWN, type CivicNews, type GazetteKind, type PoliticalOffice } from '../src/game/civic';
import { handle } from './feed';

/** A line stays on record this long. */
const KEEP_MS = 7 * 24 * 3600_000;

export interface Notice {
  /** Who did it; null when nobody is named. */
  uid: string | null;
  office: PoliticalOffice | null;
  kind: GazetteKind;
  icon: string;
  text: string;
}

/** How the gazette names each office in a sentence. */
export const OFFICE_NAME: Record<PoliticalOffice, string> = { governor: 'Governor', minister: 'FCT Minister', lagosgov: 'Lagos Governor', kanogov: 'Kano Governor', president: 'President', igp: 'IGP', efcc: 'EFCC Chair' };
/** "President @musa". */
export const official = (office: PoliticalOffice, username: string | null | undefined) => `${OFFICE_NAME[office]} ${handle(username)}`;

/**
 * Put notices on record and tell everyone. `alert: false` only records them (an election result has its own
 * announcement). Never throws: a notice that fails to post must not undo the action it reports.
 */
export async function gazette(env: Env, ctx: ExecutionContext | undefined, notices: Notice[], alert = true): Promise<void> {
  if (!notices.length) return;
  const now = Date.now();
  try {
    await env.DB.batch([
      ...notices.map((n) =>
        env.DB.prepare('INSERT INTO civic_news (uid, office, kind, icon, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(n.uid, n.office, n.kind, n.icon, n.text.slice(0, 280), now)),
      env.DB.prepare('DELETE FROM civic_news WHERE created_at < ?').bind(now - KEEP_MS),
    ]);
  } catch (error) {
    console.error('Gazette write failed', error);
  }
  if (!alert) return;
  try {
    for (const n of notices) await announceAll(env, { t: 'gazette', kind: n.kind, office: n.office, icon: n.icon, text: n.text, at: now });
    if (!ctx) return;
    // One notification for the lot; the tag makes a newer notice replace an older one still on the lock screen.
    const body = notices.map((n) => n.text).join(' ').slice(0, 240);
    ctx.waitUntil(broadcastPush(env, { title: `${notices[0].icon} Government notice`, body, tag: 'gazette', category: 'news', app: 'gist' }));
  } catch (error) {
    console.error('Gazette alert failed', error);
  }
}

/** The latest lines, newest first. Empty (not an error) if the record can't be read. */
export async function recentNews(db: D1Database): Promise<CivicNews[]> {
  try {
    const { results } = await db
      .prepare('SELECT id, office, kind, icon, text, created_at AS at FROM civic_news ORDER BY created_at DESC, id DESC LIMIT ?')
      .bind(GAZETTE_SHOWN)
      .all<CivicNews>();
    return results;
  } catch {
    return [];
  }
}
