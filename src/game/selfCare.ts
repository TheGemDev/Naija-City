// Looking after yourself at home: when a bar runs low and you are standing idle, you go and sort it out
// on your own (bed, shower, cooker). Any tap takes over again (game/store.ts, tick and walkTo).

import { ITEMS, NEEDS, type ActionDef, type Need } from './catalog';
import type { PlacedItem } from './grid';

export const SELF_CARE = {
  /** A bar under this is worth getting up for. */
  below: 30,
  /** Real seconds you must be standing idle before you move on your own. */
  idleSeconds: 4,
  /** Real seconds you are left alone after you stop one of these yourself. */
  holdSeconds: 45,
  /** You never spend more than this on yourself without being asked. */
  maxCost: 10_000,
};

export interface SelfCarePick { itemId: string; actionId: string; need: Need; label: string; icon: string }

/**
 * What to go and do about your lowest bar, if anything in the house helps: the furniture that fills it fastest,
 * leaning to what is free and what runs until the bar is full. `usable` rules out what cannot be used right now.
 */
export function selfCarePick(needs: Record<Need, number>, items: PlacedItem[], money: number, usable: (item: PlacedItem, action: ActionDef) => boolean): SelfCarePick | null {
  const low = NEEDS.map((n) => n.key).filter((k) => needs[k] < SELF_CARE.below).sort((a, b) => needs[a] - needs[b]);
  for (const need of low) {
    let best: SelfCarePick | null = null;
    let bestScore = 0;
    for (const item of items) {
      for (const action of ITEMS[item.type]?.actions ?? []) {
        const rate = action.perHour?.[need] ?? 0;
        const cost = action.cost ?? 0;
        if (rate <= 0 || action.effect || cost > Math.min(money, SELF_CARE.maxCost) || !usable(item, action)) continue;
        const score = (rate * (action.untilFull === need ? 3 : 1)) / (1 + cost / 2_000);
        if (score > bestScore) {
          bestScore = score;
          best = { itemId: item.id, actionId: action.id, need, label: action.label, icon: action.icon };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
