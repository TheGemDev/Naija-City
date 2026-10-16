// VDM's posts, server side: his memory (migration 0107) and the feed statements. What he says is built by
// src/game/vdm.ts from his phrase bank; this file feeds it what he has said lately and what he thinks of the people
// involved, and writes the post with a note of it. Until the migration has run he still posts, he just forgets.

import type { CivicCity } from '../src/game/civic';
import { composeVdm, isPraise, VDM_MEMORY, vdmHash, type VdmFacts, type VdmPast, type VdmRecord, type VdmTone, type VdmTopic } from '../src/game/vdm';

interface MemoryRow { uid: string | null; uid2: string | null; tone: VdmTone }

export interface VdmMemory {
  /** False when the table isn't there yet: then nothing is written to it either. */
  ok: boolean;
  history: VdmPast[];
  seen: string[];
  rows: MemoryRow[];
}

/** What he said lately, and his posts this week about these people. Never throws. */
export async function vdmMemory(db: D1Database, people: (string | null | undefined)[], now = Date.now()): Promise<VdmMemory> {
  const ids = [...new Set(people.filter((p): p is string => !!p))];
  try {
    const marks = ids.map(() => '?').join(', ');
    const [recent, hashes, rows] = await db.batch([
      db.prepare('SELECT phrases, text FROM vdm_memory ORDER BY id DESC LIMIT ?').bind(VDM_MEMORY.recent),
      db.prepare('SELECT hash FROM vdm_memory ORDER BY id DESC LIMIT ?').bind(VDM_MEMORY.hashes),
      ids.length
        ? db.prepare(`SELECT uid, uid2, tone FROM vdm_memory WHERE created_at > ? AND (uid IN (${marks}) OR uid2 IN (${marks})) ORDER BY id`).bind(now - VDM_MEMORY.recordMs, ...ids, ...ids)
        : db.prepare('SELECT NULL AS uid, NULL AS uid2, NULL AS tone WHERE 0'),
    ]);
    return {
      ok: true,
      history: (recent.results as { phrases: string; text: string }[]).map((r) => ({ phrases: r.phrases.split(' '), text: r.text })),
      seen: (hashes.results as { hash: string }[]).map((r) => r.hash),
      rows: rows.results as unknown as MemoryRow[],
    };
  } catch {
    return { ok: false, history: [], seen: [], rows: [] };
  }
}

/** His score this week on one person: how often he dragged them, praised them, and which he did last. */
export function recordOf(mem: VdmMemory, uid: string | null | undefined, who: string | undefined): VdmRecord | null {
  if (!uid || !who) return null;
  let dragged = 0;
  let praised = 0;
  let last: VdmTone | null = null;
  for (const r of mem.rows) {
    const d = r.uid === uid && r.tone !== 'praise';
    const p = r.uid2 === uid && r.tone !== 'drag';
    if (d) dragged++;
    if (p) praised++;
    if (d || p) last = d && p ? 'mixed' : d ? 'drag' : 'praise';
  }
  return dragged || praised ? { who, dragged, praised, last } : null;
}

export interface VdmSpec {
  topic: VdmTopic;
  facts: VdmFacts;
  /** Who the matter is about (the official dragged or praised, or the thief). */
  uid: string | null;
  /** A second matter of the other tone, about the same person or another: praise one thing, drag another. */
  but?: { topic: VdmTopic; facts: VdmFacts; uid?: string | null } | null;
  icon: string;
  city?: CivicCity | null;
  /** From the event, so a retry says the same thing. Defaults to the matter and the minute. */
  seed?: string;
  /** He rests between posts: none while one with these icons went up within `ms`. */
  rest?: { icons: readonly string[]; ms: number } | null;
  now?: number;
}

/** The feed post, and the note of it in his memory (written only when the post went up). To run inside a batch. */
export async function vdmStatements(db: D1Database, spec: VdmSpec): Promise<D1PreparedStatement[]> {
  const now = spec.now ?? Date.now();
  const praiseFirst = isPraise(spec.topic);
  const but = spec.but && isPraise(spec.but.topic) !== praiseFirst ? spec.but : null;
  // The praised and the dragged, by uid and by name.
  const praised = praiseFirst ? { uid: spec.uid, who: spec.facts.who } : but ? { uid: but.uid ?? null, who: but.facts.who } : null;
  const dragged = !praiseFirst ? { uid: spec.uid, who: spec.facts.who } : but ? { uid: but.uid ?? null, who: but.facts.who } : null;
  const tone: VdmTone = but ? 'mixed' : praiseFirst ? 'praise' : 'drag';

  const mem = await vdmMemory(db, [praised?.uid, dragged?.uid], now);
  const about = tone === 'praise' ? praised : dragged;
  const post = composeVdm({
    topic: spec.topic,
    facts: spec.facts,
    but: but ? { topic: but.topic, facts: but.facts } : undefined,
    seed: spec.seed ?? `${spec.topic}|${spec.uid}|${JSON.stringify(spec.facts)}|${but?.topic ?? ''}|${Math.floor(now / 60_000)}`,
    history: mem.history,
    seen: mem.seen,
    record: recordOf(mem, about?.uid, about?.who),
  });

  // The feed row is about whoever he dragged, else whoever he praised.
  const feedUid = dragged?.uid ?? praised?.uid ?? null;
  const icons = spec.rest?.icons.map((i) => `'${i.replace(/'/g, "''")}'`).join(', ');
  const stmts = [
    spec.rest
      ? db.prepare(
        `INSERT INTO feed (uid, kind, icon, text, created_at, city) SELECT ?1, 'vdm', ?2, ?3, ?4, ?6
         WHERE NOT EXISTS (SELECT 1 FROM feed WHERE kind = 'vdm' AND icon IN (${icons}) AND created_at > ?5)`,
      ).bind(feedUid, spec.icon, post.text, now, now - spec.rest.ms, spec.city ?? null)
      : db.prepare(`INSERT INTO feed (uid, kind, icon, text, created_at, city) VALUES (?, 'vdm', ?, ?, ?, ?)`).bind(feedUid, spec.icon, post.text, now, spec.city ?? null),
  ];
  if (mem.ok) {
    stmts.push(
      db.prepare('INSERT INTO vdm_memory (uid, uid2, topic, tone, phrases, text, hash, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1')
        .bind(dragged?.uid ?? null, praised?.uid ?? null, but ? `${spec.topic}+${but.topic}` : spec.topic, tone, post.phrases.join(' '), post.text, vdmHash(post.text), now),
    );
  }
  return stmts;
}

/** Cron: he forgets after two weeks. */
export const vdmForget = (db: D1Database, now: number) => db.prepare('DELETE FROM vdm_memory WHERE created_at < ?').bind(now - VDM_MEMORY.keepMs);
