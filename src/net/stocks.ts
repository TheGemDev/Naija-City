// Investment prices and charts on the client (server side: worker/market.ts). Public: guests see the same market.

import { create } from 'zustand';
import { INVESTMENT_BY_ID, setPriceMult } from '../game/investments';
import { setHouseIndex } from '../game/property';

/** `usd` and `closed` come with real coins only: the real dollar price, and whether trading is shut for want of a fresh one. */
export interface Venture { mult: number; price: number; points: [number, number][]; usd?: number | null; closed?: boolean }
/** A state's house prices (HOUSE_MARKET in game/property.ts): a multiple of what a house cost, now and a day ago. */
export interface HouseMarket { mult: number; dayAgo: number }
interface Stocks { ventures: Record<string, Venture>; houses: Record<string, HouseMarket>; loaded: boolean }

export const useStocks = create<Stocks>(() => ({ ventures: {}, houses: {}, loaded: false }));

export async function loadMarket() {
  try {
    const res = await fetch('/api/stocks');
    if (!res.ok) return;
    const d = (await res.json()) as { ventures: Record<string, Venture>; houses?: Record<string, HouseMarket> };
    for (const [id, v] of Object.entries(d.ventures)) if (INVESTMENT_BY_ID[id]) setPriceMult(id, v.mult);
    const houses = d.houses ?? {};
    setHouseIndex(Object.fromEntries(Object.entries(houses).map(([city, h]) => [city, h.mult])));
    useStocks.setState({ ventures: d.ventures, houses, loaded: true });
  } catch { /* offline: keep the last prices */ }
}

/** Refresh the market on a timer for as long as the caller wants it. Returns the stop function. */
export function watchMarket(everyMs = 60_000) {
  void loadMarket();
  const timer = setInterval(() => void loadMarket(), everyMs);
  return () => clearInterval(timer);
}
