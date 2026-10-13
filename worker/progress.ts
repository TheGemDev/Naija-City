// Ownership checks for things that can be sold back for money: furniture (the origin's starter set + bought
// − sold − stolen by burglars) and cars. Knowledge and work are judged by the server clock in clock.ts.

import { ITEMS, RENAMED_ITEMS } from '../src/game/catalog';
import { CAR_BY_ID, JET_BY_ID, jetResale } from '../src/game/cars';
import { BUSINESS_BY_ID, type BusinessType } from '../src/game/career';
import { forbesItems, type ForbesAssets, type ForbesItem } from '../src/game/forbes';
import { DESIGN_BY_ID, SALE_FACTOR, STAGES } from '../src/game/property';
import { starterCounts } from '../src/game/origins';

/**
 * How many of each item type (and car) the player owns in their current life: starter + bought − sold.
 * The bought-and-sold part is kept ready in `owned`, which triggers on the ledger keep in step (migrations/0081_owned.sql).
 */
export async function ownedCounts(db: D1Database, uid: string): Promise<Map<string, number>> {
  const [counts, wallet] = await db.batch<{ ref: string; n: number; origin: string | null }>([
    db.prepare('SELECT ref, n FROM owned WHERE uid = ?').bind(uid),
    db.prepare('SELECT origin FROM wallets WHERE uid = ?').bind(uid),
  ]);
  const owned = new Map(Object.entries(starterCounts(wallet.results[0]?.origin)));
  for (const r of counts.results) {
    const ref = RENAMED_ITEMS[r.ref] ?? r.ref;
    owned.set(ref, (owned.get(ref) ?? 0) + r.n);
  }
  return owned;
}

/** Cars the player owns in their current life (bought − sold). */
export const ownsCar = (owned: Map<string, number>, id: string) => !!CAR_BY_ID[id] && (owned.get(id) ?? 0) > 0;

/** What the Forbes list shows a player owns (GET /api/forbes): businesses, finished houses, cars and jets, counted and by name. */
export async function forbesAssets(db: D1Database, uid: string): Promise<ForbesAssets> {
  const [owned, biz, plots, books] = await Promise.all([
    ownedCounts(db, uid),
    db.prepare('SELECT type FROM businesses WHERE uid = ?').bind(uid).all<{ type: BusinessType }>(),
    db.prepare('SELECT pid, design FROM estate_plots WHERE uid = ?1 AND stage >= ?2').bind(uid, STAGES.length).all<{ pid: string; design: string | null }>(),
    propertyBooks(db, uid),
  ]);
  const things: Omit<ForbesItem, 'n'>[] = [];
  for (const { type } of biz.results) things.push({ kind: 'businesses', name: BUSINESS_BY_ID[type]?.name ?? 'Business', value: BUSINESS_BY_ID[type]?.cost ?? 0 });
  for (const { pid, design } of plots.results) {
    things.push({ kind: 'houses', name: DESIGN_BY_ID[design ?? '']?.name ?? 'House', value: Math.round((books.get(pid)?.spent ?? 0) * SALE_FACTOR.complete) });
  }
  let cars = 0;
  let jets = 0;
  for (const [id, n] of owned) {
    if (n <= 0) continue;
    const car = CAR_BY_ID[id];
    const jet = JET_BY_ID[id];
    // The server doesn't track wear, so a car is listed at its showroom price.
    if (car) { cars += n; for (let i = 0; i < n; i++) things.push({ kind: 'cars', name: car.name, value: car.price }); }
    else if (jet) { jets += n; for (let i = 0; i < n; i++) things.push({ kind: 'jets', name: jet.name, value: jetResale(id) }); }
  }
  return { businesses: biz.results.length, houses: plots.results.length, cars, jets, items: forbesItems(things) };
}

/** Drops furniture the player doesn't own. Fixed items (the gate) are always allowed. */
export function trimItems<T extends { type: string }>(items: T[], owned: Map<string, number>): { items: T[]; removed: number } {
  const used = new Map<string, number>();
  const kept = items.filter((i) => {
    const def = ITEMS[i.type];
    if (!def) return false;
    if (def.fixed) return true;
    const n = (used.get(i.type) ?? 0) + 1;
    used.set(i.type, n);
    return n <= (owned.get(i.type) ?? 0);
  });
  return { items: kept, removed: items.length - kept.length };
}

/** Money tied to one property (ledger refs `p:<id>:<what>`, see src/game/property.ts). */
export interface PropertyBook { spent: number; firstAt: number; rent: number; sold: boolean }

/** Every property the player has paid into this life: what went in, rent taken out, and whether it was sold. */
export async function propertyBooks(db: D1Database, uid: string): Promise<Map<string, PropertyBook>> {
  const [ledger, seizures] = await Promise.all([
    // A range, not LIKE: LIKE can't use the (uid, ref) index, and this runs on every wallet sync.
    db.prepare(
      `SELECT ref, amount, created_at FROM ledger
       WHERE uid = ?1 AND ref >= 'p:' AND ref < 'p;' AND applied = 1
         AND created_at > COALESCE((SELECT reset_at FROM wallets WHERE uid = ?1), 0)
       ORDER BY created_at`,
    )
    .bind(uid)
    .all<{ ref: string; amount: number; created_at: number }>(),
    db.prepare(
      `SELECT json_extract(seized_property_json, '$.id') AS id FROM efcc_cases
       WHERE target_uid = ? AND status = 'convicted' AND bought_back_at IS NULL AND seized_property_json IS NOT NULL`,
    ).bind(uid).all<{ id: string | null }>(),
  ]);
  const books = new Map<string, PropertyBook>();
  for (const r of ledger.results) bookProperty(books, r.ref, r.amount, r.created_at);
  for (const { id } of seizures.results) if (id) books.delete(id);
  return books;
}

/** Adds one ledger line to the books. Also used for events earlier in the same batch. */
export function bookProperty(books: Map<string, PropertyBook>, ref: string, amount: number, at: number) {
  const [, id, what] = ref.split(':');
  if (!id) return;
  const b = books.get(id) ?? { spent: 0, firstAt: at, rent: 0, sold: false };
  if (amount < 0) b.spent -= amount;
  else if (what === 'rent') b.rent += amount;
  else if (what === 'sell') b.sold = true;
  books.set(id, b);
}
