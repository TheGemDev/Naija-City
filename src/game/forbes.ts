// The Forbes rich list (src/ui/ForbesApp.tsx, GET /api/forbes in worker/index.ts).

/** Nobody worth less than this makes the list. */
export const FORBES_MIN_WORTH = 1_000_000;

/** How many from the top of the list have what they own counted. */
export const FORBES_ASSETS_TOP = 3;

export type ForbesKind = 'businesses' | 'houses' | 'cars' | 'jets';

/** One line of the receipt: `n` of the same thing, worth `value` together. */
export interface ForbesItem { kind: ForbesKind; name: string; n: number; value: number }

/** What somebody on the list owns. Houses are finished ones: bare land and building sites don't count. */
export interface ForbesAssets extends Record<ForbesKind, number> {
  /** The same things by name, for the receipt. */
  items?: ForbesItem[];
}

/** Folds single things into receipt lines: one line per name, the dearest first. */
export function forbesItems(things: Omit<ForbesItem, 'n'>[]): ForbesItem[] {
  const lines = new Map<string, ForbesItem>();
  for (const t of things) {
    const key = `${t.kind}:${t.name}`;
    const line = lines.get(key);
    if (line) { line.n += 1; line.value += t.value; }
    else lines.set(key, { ...t, n: 1 });
  }
  return [...lines.values()].sort((a, b) => b.value - a.value);
}
