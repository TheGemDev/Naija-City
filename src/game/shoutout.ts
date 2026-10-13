import { create } from 'zustand';

/** Club activities big enough to be hailed on every screen in the club lobby. Mirrored in worker/room.ts. */
export const CLUB_SHOUTS: Record<string, { headline: string; icon: string; tier: 1 | 2 | 3 }> = {
  hijack_mic: { headline: 'just hijacked the DJ mic!', icon: '🎤', tier: 2 },
  table_dance: { headline: 'is dancing on the VIP table!', icon: '🍾', tier: 2 },
  spray_money: { headline: 'is spraying crisp notes!', icon: '💸', tier: 2 },
  spray_heavy: { headline: 'pulled out the golden money gun!', icon: '🔫', tier: 3 },
  dorime: { headline: 'is making it DORIME! The DJ is shouting the name!', icon: '🌧️', tier: 3 },
  champagne_tower: { headline: 'built a Dom Pérignon champagne tower!', icon: '🍾', tier: 3 },
  club_takeover: { headline: 'TOOK OVER THE CLUB! Every drink is on them!', icon: '👑', tier: 3 },
  bottle_service: { headline: 'landed the VIP bottle procession!', icon: '🍾', tier: 3 },
  buy_out_bar: { headline: 'bought shots for the ENTIRE club!', icon: '🥂', tier: 3 },
  dj_hype: { headline: 'is the highest spender in town tonight!', icon: '🎧', tier: 3 },
};

export type LobbyActionKind = 'spray' | 'cash-slap' | 'dance' | 'drink' | 'urgent2k' | 'drip';

/** Public interactions hailed on every screen in the current building lobby. */
export const PLACE_SHOUTS: Record<LobbyActionKind, { headline: string; icon: string; tier: 1 | 2 | 3 }> = {
  spray: { headline: 'sprayed money on', icon: '💸', tier: 2 },
  'cash-slap': { headline: 'cash-slapped', icon: '👋🏾', tier: 2 },
  dance: { headline: 'challenged to a dance battle with', icon: '🕺🏾', tier: 2 },
  drink: { headline: 'sent a VIP drink to', icon: '🍾', tier: 2 },
  urgent2k: { headline: 'asked for urgent ₦2,000 from', icon: '🤲🏾', tier: 2 },
  drip: { headline: 'rated the drip of', icon: '🕶️', tier: 2 },
};

export interface Shoutout {
  key: number;
  name: string;
  username: string;
  action: string;
  amount: number;
  mine: boolean;
  target?: string;
  place?: string;
}

interface ShoutState {
  queue: Shoutout[];
  push(s: Omit<Shoutout, 'key'>): void;
  shift(): void;
}

let seq = 0;
export const useShoutouts = create<ShoutState>((set) => ({
  queue: [],
  push: (s) => set((st) => ({ queue: [...st.queue, { ...s, key: ++seq }].slice(-5) })),
  shift: () => set((st) => ({ queue: st.queue.slice(1) })),
}));

/** Set by net/multiplayer.ts so the store can announce an activity without importing the network layer. */
export const shoutoutHooks: { send: null | ((action: string) => void) } = { send: null };

/** Banknotes falling down the screen when someone sprays money in the club. */
interface RainState {
  key: number;
  heavy: boolean;
  fall(heavy: boolean): void;
}
let rainSeq = 0;
export const useMoneyRain = create<RainState>((set) => ({
  key: 0,
  heavy: false,
  fall: (heavy) => set({ key: ++rainSeq, heavy }),
}));

/** Spraying a lot in one night gets you noticed: the more you have sprayed lately, the likelier security walks you out. */
const SPRAY_MEMORY_MIN = 180;
const sprayLog: { at: number; amount: number; city: string }[] = [];
/** `city` is the club's: what you sprayed in Kaduna is not held against you in Lagos. */
export function sprayKickChance(now: number, amount: number, city: string): number {
  while (sprayLog.length && now - sprayLog[0].at > SPRAY_MEMORY_MIN) sprayLog.shift();
  sprayLog.push({ at: now, amount, city });
  const recent = sprayLog.reduce((sum, e) => sum + (e.city === city ? e.amount : 0), 0);
  return Math.min(0.7, 0.03 + recent / 600_000);
}
export const clearSprayLog = () => { sprayLog.length = 0; };
