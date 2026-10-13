// The first-time tour of the screen: a dark sheet over the game with one part of the HUD lit up and explained at a
// time (ui/Guide.tsx). It runs once, when a new player's first life begins, and again whenever they ask for it in
// Settings. Only the parts nobody can play without are on it; the rest is learnt by playing.

import { create } from 'zustand';
import { useSession } from '../net/session';

export interface GuideStop {
  /** CSS selector of the part of the screen to light up. Left out, the card sits in the middle with nothing lit. */
  target?: string;
  icon: string;
  title: string;
  text: string;
}

/** In the order they are shown. A stop whose part is not on screen just now (no needs while furnishing, say) is skipped. */
export const GUIDE_STOPS: GuideStop[] = [
  { icon: '👋🏾', title: 'Welcome to Naija City', text: 'This is your life now. Here is a quick look round the screen, then you are on your own.' },
  { target: '.time-card', icon: '☀️', title: 'Time and day', text: 'The city runs on this clock. Shops open and close, night falls, and rent and loans come due by the day.' },
  { target: '.money-card-top', icon: '💰', title: 'Your money', text: 'Everything you have in naira. Work, hustle or trade to grow it. Tap it to add more.' },
  { target: '.needs', icon: '🍛', title: 'Your body', text: 'Hunger, energy and the rest. When one runs low it shows up here. Ignore it too long and you faint.' },
  { target: '.nav', icon: '🗺️', title: 'Getting around', text: 'Home takes you back to your place. Map opens the city, where the jobs, markets and people are.' },
  { target: '.nav button:last-child', icon: '📱', title: 'Your phone', text: 'Bank, chats, jobs, betting, news and Settings are all apps on your phone. You will live in here.' },
  { target: '.chat-fab', icon: '💬', title: 'Talk to people', text: 'Everyone you see is a real player. Say something to whoever is in the same place as you.' },
  { icon: '🎉', title: 'That is it', text: 'Go and find your level. You can watch this again any time from Settings.' },
];

interface GuideState {
  /** Which stop is on show, or null when the tour is not running. */
  at: number | null;
  /** Move on by `by` stops (back when negative); past either end the tour closes. */
  step(by: number): void;
  close(): void;
}

export const useGuide = create<GuideState>((set, get) => ({
  at: null,
  step: (by) => {
    const at = (get().at ?? 0) + by;
    set({ at: at >= 0 && at < GUIDE_STOPS.length ? at : null });
  },
  close: () => set({ at: null }),
}));

// Remembered per account on this device, so a second account on the same phone still gets its own first tour.
const seenKey = () => `kl-guide-seen-${useSession.getState().user?.uid ?? 'guest'}`;

/** Run the tour from the start. With `firstTime`, only if this account has not been shown it on this device. */
export function startGuide(firstTime = false) {
  try {
    if (firstTime && localStorage.getItem(seenKey())) return;
    localStorage.setItem(seenKey(), '1');
  } catch { /* private mode: the tour simply shows again next time */ }
  useGuide.setState({ at: 0 });
}
