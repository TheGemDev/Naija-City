// Appliances spoil. Anything that runs on light can pack up when you use it, and NEPA bringing light back
// with high voltage can blow one too. A spoilt appliance shows a spanner over it and can't be used until you
// tap it and pay the repairer. The flag lives on the item (`broken`, game/grid.ts), so it saves with the house.
//
// startBreakdowns() listens to the game like startMishaps() does.

import { create } from 'zustand';
import { ITEMS } from './catalog';
import type { PlacedItem } from './grid';
import { onGrid, STANDBY_KW } from './power';
import { dayOf, inOwnHouse, naira, useGame, type GameState } from './store';
import { useVisit } from './visits';

export const BREAKDOWN = {
  /** Chance an appliance packs up when you finish using it. */
  useChance: 0.03,
  /** Chance that light coming back blows one appliance in the house you are standing in. */
  surgeChance: 0.1,
  /** Never more than this many spoilt at once in one house. */
  maxBroken: 2,
  /** New players get this many game days before anything spoils. */
  graceDays: 2,
  /** The repairer's bill: a share of the price, within these limits. */
  costShare: 0.08,
  minCost: 1_500,
  maxCost: 350_000,
};

/** These run on light but never spoil: the server decides what cameras catch from the save alone. */
const STURDY = new Set(['cctv']);

/** Anything that draws power, in use or all day, can spoil. */
export const canSpoil = (type: string) =>
  !STURDY.has(type) && !ITEMS[type]?.fixed && (type in STANDBY_KW || !!ITEMS[type]?.actions.some((a) => a.needsPower));

export function repairCost(type: string) {
  const share = (ITEMS[type]?.price ?? 0) * BREAKDOWN.costShare;
  return Math.min(BREAKDOWN.maxCost, Math.max(BREAKDOWN.minCost, Math.round(share / 500) * 500));
}

/** The spoilt item whose repair sheet is open. */
export const useRepair = create<{ itemId: string | null }>(() => ({ itemId: null }));

export function openRepair(itemId: string) {
  useGame.getState().select(null);
  useRepair.setState({ itemId });
}

/** Pay the repairer and the item works again. */
export function repairItem(itemId: string) {
  const s = useGame.getState();
  const item = s.items.find((i) => i.id === itemId);
  if (!item?.broken) return;
  const def = ITEMS[item.type];
  const cost = repairCost(item.type);
  if (s.money < cost) return s.toast(`The repairer wants ${naira(cost)} to fix your ${def.name}. You no get am 😬`);
  s.charge(cost, `Repaired ${def.name}`);
  useGame.setState((g) => ({ items: g.items.map((i) => (i.id === itemId ? fixed(i) : i)) }));
  useRepair.setState({ itemId: null });
  s.toast(`🔧 The repairer don fix your ${def.name}. E dey work again!`);
}

const fixed = ({ broken: _broken, ...item }: PlacedItem): PlacedItem => item;

function spoil(item: PlacedItem, text: (name: string) => string) {
  if (useGame.getState().task?.itemId === item.id) useGame.getState().cancelTask();
  useGame.setState((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...i, broken: true } : i)) }));
  useGame.getState().toast(text(ITEMS[item.type].name));
}

/** Only in your own house, with you in it, and never a pile of spoilt things at once. */
const mayBreak = (s: GameState) =>
  s.view === 'home' && !useVisit.getState().current && dayOf(s.minutes) > BREAKDOWN.graceDays &&
  s.items.filter((i) => i.broken).length < BREAKDOWN.maxBroken;

/** Wire it to the game. Returns a cleanup. */
export function startBreakdowns() {
  let prev = useGame.getState();
  return useGame.subscribe((s) => {
    const p = prev;
    prev = s;
    // Loading a save jumps the clock and the grid: nothing spoils in that.
    if (!s.started || !p.started || Math.abs(s.minutes - p.minutes) > 60 || !mayBreak(s)) return;

    // You ran it most of the way and it gave up.
    const ran = p.task;
    if (ran?.phase === 'doing' && ran.itemId && !ran.placeId && ran.remaining <= ran.total / 2 && (s.task?.itemId !== ran.itemId || s.task.actionId !== ran.actionId)) {
      const item = s.items.find((i) => i.id === ran.itemId);
      const powered = item && ITEMS[item.type]?.actions.find((a) => a.id === ran.actionId)?.needsPower;
      if (item && powered && !item.broken && canSpoil(item.type) && Math.random() < BREAKDOWN.useChance) {
        return spoil(item, (name) => `💥 Your ${name} just packed up. Tap the 🔧 on it to call the repairer.`);
      }
    }

    // NEPA came back with high voltage. A house with nobody in it (the light is off), or off the grid, is safe.
    if (!p.power.grid && onGrid(s.power) && inOwnHouse(s) && Math.random() < BREAKDOWN.surgeChance) {
      const plugged = s.items.filter((i) => !i.broken && canSpoil(i.type));
      // A stabilizer takes the high voltage so the appliances don't.
      if (plugged.length && s.items.some((i) => i.type === 'stabilizer')) {
        if (s.view === 'home') s.toast('⚡ NEPA brought light with high voltage. Your stabilizer took it: nothing blew.');
      } else if (plugged.length) {
        spoil(plugged[Math.floor(Math.random() * plugged.length)], (name) => `⚡ NEPA brought light with high voltage and your ${name} don blow! Tap the 🔧 on it to fix it.`);
      }
    }
  });
}
