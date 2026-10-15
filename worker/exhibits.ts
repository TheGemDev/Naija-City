// The EFCC's exhibit book (migration 0095): every time the EFCC, or customs, takes something from a player, each thing
// taken is written down here, so the player can see exactly what went (the EFCC app's Seized tab). It never stands in
// the way of the seizure itself: if the book can't be written, the seizure still happens.

import type { EfccExhibit, EfccSeizure } from '../src/game/efcc';
import { ITEMS } from '../src/game/catalog';

/** One thing taken, as a caller writes it down. */
export type ExhibitItem = Omit<EfccExhibit, 'qty' | 'returnedAt'> & { qty?: number };
type Item = ExhibitItem;

/** Write down what one arrest or raid took. Items worth nothing are left out, unless they are things (an app). */
export async function recordExhibits(db: D1Database, uid: string, event: string, title: string, items: Item[], now = Date.now()) {
  const kept = items.filter((i) => i.value > 0 || (i.kind !== 'cash' && i.kind !== 'savings' && i.kind !== 'fine' && i.kind !== 'loot'));
  if (!kept.length) return;
  await db
    .batch(kept.map((i) =>
      db.prepare('INSERT INTO efcc_exhibits (uid, event, title, kind, icon, label, value, qty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(uid, event, title.slice(0, 120), i.kind, i.icon, i.label.slice(0, 120), Math.max(0, Math.round(i.value)), i.qty ?? 1, now)))
    .catch((error) => console.error('exhibits failed', error));
}

/** The furniture in a seized house, one line per kind of thing: "Sofa ×2". */
export function furnitureOf(items: { type: string }[] | undefined): Item[] {
  const counts = new Map<string, number>();
  for (const it of items ?? []) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
  return [...counts].map(([type, qty]) => {
    const def = ITEMS[type];
    return { kind: 'furniture' as const, icon: def?.icon ?? '🪑', label: def?.name ?? type, value: (def?.price ?? 0) * qty, qty };
  });
}

/** A fine, as an exhibit. */
export const fineItem = (amount: number, label = 'Fine'): Item => ({ kind: 'fine', icon: '⚖️', label, value: amount });

/** A house bought back is no longer held. */
export const houseReturned = (db: D1Database, uid: string, event: string, now: number) =>
  db.prepare("UPDATE efcc_exhibits SET returned_at = ? WHERE uid = ? AND event = ? AND kind = 'house'").bind(now, uid, event);

/** What the EFCC has taken from this player lately, newest first, one entry per arrest or raid. Empty until migration 0095. */
export async function seizuresOf(db: D1Database, uid: string): Promise<EfccSeizure[]> {
  try {
    const { results } = await db
      .prepare('SELECT event, title, kind, icon, label, value, qty, returned_at, created_at FROM efcc_exhibits WHERE uid = ? ORDER BY created_at DESC, id ASC LIMIT 200')
      .bind(uid)
      .all<{ event: string; title: string; kind: EfccExhibit['kind']; icon: string; label: string; value: number; qty: number; returned_at: number | null; created_at: number }>();
    const out = new Map<string, EfccSeizure>();
    for (const r of results) {
      const group = out.get(r.event) ?? out.set(r.event, { event: r.event, title: r.title, at: r.created_at, items: [] }).get(r.event)!;
      group.items.push({ kind: r.kind, icon: r.icon, label: r.label, value: r.value, qty: r.qty, returnedAt: r.returned_at });
    }
    return [...out.values()];
  } catch {
    return [];
  }
}
