// The owner-set parts of a player's houses in an uploaded save (game/exterior.ts): names, outsides, extensions, rooms.
// Kept apart from index.ts so it can be tested on its own (it touches no bindings).

import { STAGES } from '../src/game/property';
import { cleanExtensions, cleanExterior, cleanHouseName, cleanRooms, EXTENSION_BY_ID } from '../src/game/exterior';

type HouseSave = { properties?: { id?: string; stage?: number }[] };

/** JSON with object keys sorted, so the same data in another key order compares equal. */
const canon = (v: unknown): string =>
  v === undefined ? 'u' : Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object'
    ? `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
    : JSON.stringify(v);

/**
 * The owner-set parts of each house, made safe to store and to show other people: a name through cleanHouseName
 * (length, control characters), only known exterior choices, extensions only on a finished house of a design that
 * takes them, and cleaned room names and uses. True when anything changed, so the client gets the same fix.
 */
export function cleanHouses(save: HouseSave): boolean {
  let changed = false;
  save.properties = save.properties?.map((raw) => {
    const p = raw as Record<string, unknown> & { id?: string; stage?: number; design?: unknown };
    const finished = (p.stage ?? 0) >= STAGES.length;
    const ext = p.extending as { id?: unknown; stage?: unknown } | null | undefined;
    const want: Record<string, unknown> = {
      name: cleanHouseName(p.name) || undefined,
      exterior: cleanExterior(p.exterior),
      extensions: (() => {
        const list = finished ? cleanExtensions(p.extensions).filter((id) => EXTENSION_BY_ID[id].designs.includes(String(p.design))) : [];
        return list.length ? list : undefined;
      })(),
      rooms: cleanRooms(p.rooms),
    };
    if (ext && !(finished && typeof ext.id === 'string' && EXTENSION_BY_ID[ext.id] && Number.isInteger(ext.stage) && (ext.stage as number) >= 0 && (ext.stage as number) < STAGES.length)) want.extending = null;
    // Only touch what differs, so a clean save comes back untouched (and the client isn't sent a correction).
    let out: Record<string, unknown> | null = null;
    for (const [k, v] of Object.entries(want)) {
      if (k === 'extending' ? p.extending === null : canon(v) === canon(p[k])) continue;
      out ??= { ...p };
      if (v === undefined) delete out[k]; else out[k] = v;
    }
    if (!out) return raw;
    changed = true;
    return out as typeof raw;
  });
  return changed;
}
