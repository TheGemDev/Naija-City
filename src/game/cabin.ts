// Cabin service: what the crew brings you in the air, or down the train (ui/Airport.tsx). Your own jet has a chef, a bed and a
// shower, all on the house; a ticketed flight has one free snack and a trolley you pay for.

import { create } from 'zustand';
import { NEEDS, type Need } from './catalog';
import { flightOf, naira, useGame } from './store';

export interface CabinItem {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  /** 0: on the house. */
  price: number;
  needs: Partial<Record<Need, number>>;
  /** What the crew says as they serve it. */
  said: string;
}

export const CABIN_MENU: Record<'ticket' | 'jet' | 'train', CabinItem[]> = {
  // The train's trolley comes down the coach from the buffet car (three/TrainRide.tsx).
  train: [
    { id: 'puffpuff', icon: '🍩', name: 'Puff-puff and zobo', blurb: 'The free snack bag. One per seat.', price: 0, needs: { hunger: 10, fun: 3 }, said: '🍩 Six puff-puff in a paper bag and a cold zobo. Still warm.' },
    { id: 'suya', icon: '🍢', name: 'Suya wrap', blurb: 'From the buffet car, with pepper on the side.', price: 3_000, needs: { hunger: 35, fun: 8 }, said: '🍢 Suya in newspaper. The man across the aisle asks where you bought it.' },
    { id: 'tea', icon: '🫖', name: 'Tea and bread', blurb: 'Sweet tea in a flask cup, bread and butter.', price: 1_200, needs: { energy: 15, hunger: 10 }, said: '🫖 Three sugars, whether you asked or not.' },
    { id: 'wifi', icon: '📶', name: 'Onboard Wi-Fi', blurb: 'Stream something until the signal drops in the bush.', price: 1_500, needs: { fun: 28 }, said: '📶 Two bars. Enough for one skit.' },
  ],
  jet: [
    { id: 'champagne', icon: '🥂', name: 'Champagne', blurb: 'A cold bottle, opened at 40,000 feet.', price: 0, needs: { fun: 40, social: 20 }, said: '🥂 “Welcome on board.” The cork hits the ceiling.' },
    { id: 'chef', icon: '🍽️', name: 'Chef’s plate', blurb: 'Party jollof, grilled croaker and dodo, plated in the galley.', price: 0, needs: { hunger: 70, fun: 10 }, said: '🍽️ The chef brings it out himself. Not a single cold grain.' },
    { id: 'bed', icon: '🛏️', name: 'Lie-flat bed', blurb: 'Seat down, blanket out, lights low.', price: 0, needs: { energy: 60 }, said: '🛏️ You are asleep before the seat finishes going flat.' },
    { id: 'shower', icon: '🚿', name: 'Hot shower', blurb: 'Hot water, fresh towels, land looking new.', price: 0, needs: { hygiene: 70 }, said: '🚿 A hot shower above the clouds. Land fresh.' },
  ],
  ticket: [
    { id: 'snack', icon: '🥧', name: 'Meat pie and a drink', blurb: 'The free snack box. One per passenger.', price: 0, needs: { hunger: 12 }, said: '🥧 A warm meat pie and a small Fanta. “One per passenger, sir.”' },
    { id: 'jollof', icon: '🍛', name: 'Jollof and chicken', blurb: 'A hot foil pack off the trolley.', price: 6_500, needs: { hunger: 40, fun: 5 }, said: '🍛 The foil is hot and the chicken is small, but it is jollof.' },
    { id: 'coffee', icon: '☕', name: 'Coffee', blurb: 'Black and strong, in a paper cup.', price: 1_500, needs: { energy: 18 }, said: '☕ Strong enough to land the plane by itself.' },
    { id: 'headphones', icon: '🎧', name: 'Headphones', blurb: 'For the Nollywood film on the seat-back screen.', price: 2_500, needs: { fun: 30 }, said: '🎧 One ear works. The film is still sweet.' },
  ],
};

interface CabinState {
  open: boolean;
  /** What you have already had on this flight: the crew serves each thing once. */
  served: string[];
  setOpen(open: boolean): void;
  /** The flight is over: put the menu away for the next one. */
  reset(): void;
  order(id: string): void;
}

export const useCabin = create<CabinState>((set, get) => ({
  open: false,
  served: [],
  setOpen: (open) => set({ open }),
  reset: () => set({ open: false, served: [] }),
  order(id) {
    const g = useGame.getState();
    const flight = flightOf(g);
    const item = flight && CABIN_MENU[flight].find((i) => i.id === id);
    if (!item || get().served.includes(id)) return;
    if (g.money < item.price) return g.toast(`You need ${naira(item.price)}`);
    g.charge(item.price, `In-flight: ${item.name}`);
    useGame.setState((s) => ({
      needs: { ...s.needs, ...Object.fromEntries(NEEDS.map(({ key }) => [key, Math.max(0, Math.min(100, s.needs[key] + (item.needs[key] ?? 0)))])) } as Record<Need, number>,
    }));
    set((c) => ({ served: [...c.served, id] }));
    g.toast(item.said);
  },
}));
