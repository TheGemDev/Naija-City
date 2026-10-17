// Estates: who owns which plot in each region (src/game/estate.ts). Players send their property list;
// only properties they actually paid for this life (ledger refs `p:<id>:…`) get a slot, and sold ones
// are dropped. Anyone can read a region to see the neighbours. NPC citizens own plots here too (worker/npcs.ts).

import { CAP } from '../src/game/estate';
import { DESIGN_BY_ID, PLOTS, REGION_BY_ID, STAGES } from '../src/game/property';
import { propertyBooks } from './progress';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const MAX_PROPERTIES = 40;

/** `kids` is set on an NPC citizen's house (worker/npcs.ts): their children. */
interface PlotRow { slot: number; pid: string; uid: string; owner: string | null; plot: string; design: string | null; stage: number; building: number; kids: number | null }

/** GET /api/estate/<region>?n=<estate>: the plots in one estate (CAP slots) of a region, plus how many slots exist in all. Public. */
export async function readEstate(db: D1Database, region: string, n = 0): Promise<Response> {
  if (!REGION_BY_ID[region]) return json({ error: 'Unknown region' }, 404);
  const no = Number.isInteger(n) && n >= 0 && n < 100_000 ? n : 0;
  const total = (await db.prepare('SELECT COALESCE(MAX(slot) + 1, 0) AS total FROM estate_plots WHERE region = ?').bind(region).first<{ total: number }>())?.total ?? 0;
  const { results } = await db
    .prepare(
      `SELECT e.slot, e.pid, e.uid, SUBSTR(COALESCE(p.username, p.name, n.username, n.name, 'Someone'), 1, 24) AS owner, e.plot, e.design, e.stage, e.building, n.kids
       FROM estate_plots e LEFT JOIN players p ON p.uid = e.uid LEFT JOIN npcs n ON n.id = e.uid
       WHERE e.region = ? AND e.slot >= ? AND e.slot < ? ORDER BY e.slot`,
    )
    .bind(region, no * CAP, (no + 1) * CAP)
    .all<PlotRow>();
  return json({ plots: results.map((r) => ({ ...r, building: !!r.building })), total });
}

interface Incoming { id: string; region: string; plot: string; design: string | null; stage: number; building: boolean; want?: number }

/** POST /api/estate/sync: the player's whole property list. Returns { slots: { <pid>: slot } }. */
export async function syncEstate(req: Request, db: D1Database, uid: string): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { properties?: Incoming[] } | null;
  const books = await propertyBooks(db, uid);
  const list = (Array.isArray(body?.properties) ? body.properties : [])
    .slice(0, MAX_PROPERTIES)
    .filter(
      (p) =>
        p && typeof p.id === 'string' && p.id.length <= 24 && REGION_BY_ID[p.region] && p.plot in PLOTS &&
        (p.design === null || !!DESIGN_BY_ID[p.design]) && (books.get(p.id)?.spent ?? 0) > 0 && !books.get(p.id)?.sold,
    );

  const { results: mine } = await db.prepare('SELECT region, slot, pid FROM estate_plots WHERE uid = ?').bind(uid).all<{ region: string; slot: number; pid: string }>();
  const keep = new Map(list.map((p) => [p.id, p]));
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  const slots: Record<string, number> = {};

  // Sold, from an old life, or moved region: free the slot.
  for (const row of mine) {
    const p = keep.get(row.pid);
    if (!p || p.region !== row.region) stmts.push(db.prepare('DELETE FROM estate_plots WHERE uid = ? AND pid = ?').bind(uid, row.pid));
  }
  const placed = new Map(mine.filter((r) => keep.get(r.pid)?.region === r.region).map((r) => [r.pid, r.slot]));
  for (const p of list) {
    const stage = Math.max(0, Math.min(STAGES.length, Math.floor(Number(p.stage) || 0)));
    const slot = placed.get(p.id);
    if (slot === undefined) continue;
    slots[p.id] = slot;
    stmts.push(
      db.prepare('UPDATE estate_plots SET plot = ?3, design = ?4, stage = ?5, building = ?6, updated_at = ?7 WHERE uid = ?1 AND pid = ?2')
        .bind(uid, p.id, p.plot, p.design, stage, p.building ? 1 : 0, now),
    );
  }
  if (stmts.length) await db.batch(stmts);

  // New properties take the lowest free slot in their region. A race for the same slot fails the
  // primary key, so try the next one.
  for (const p of list) {
    if (placed.has(p.id)) continue;
    const stage = Math.max(0, Math.min(STAGES.length, Math.floor(Number(p.stage) || 0)));
    for (let attempt = 0; attempt < 5; attempt++) {
      // The plot they tapped, if it is free and inside an existing estate or the next one; else the lowest free slot.
      let slot: number | null = null;
      if (attempt === 0 && Number.isSafeInteger(p.want) && p.want! >= 0) {
        const total = (await db.prepare('SELECT COALESCE(MAX(slot) + 1, 0) AS total FROM estate_plots WHERE region = ?').bind(p.region).first<{ total: number }>())?.total ?? 0;
        const estates = Math.max(1, Math.ceil(total / CAP));
        const free = !(await db.prepare('SELECT 1 AS x FROM estate_plots WHERE region = ? AND slot = ?').bind(p.region, p.want).first());
        if (free && p.want! < (estates + 1) * CAP) slot = p.want!;
      }
      // Lowest free slot: 0 if empty, else the first slot whose next number is unused.
      const first = slot === null ? await db.prepare('SELECT 1 AS x FROM estate_plots WHERE region = ? AND slot = 0').bind(p.region).first() : null;
      const gap = first
        ? await db
            .prepare('SELECT MIN(e.slot) + 1 AS slot FROM estate_plots e WHERE e.region = ? AND NOT EXISTS (SELECT 1 FROM estate_plots n WHERE n.region = e.region AND n.slot = e.slot + 1)')
            .bind(p.region)
            .first<{ slot: number }>()
        : null;
      if (slot === null) slot = gap?.slot ?? 0;
      try {
        await db
          .prepare('INSERT INTO estate_plots (region, slot, uid, pid, plot, design, stage, building, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(p.region, slot, uid, p.id, p.plot, p.design, stage, p.building ? 1 : 0, now)
          .run();
        slots[p.id] = slot;
        break;
      } catch {
        /* taken meanwhile; look again */
      }
    }
  }
  return json({ slots });
}
