// Apps you download from the phone's app store. Core apps come with the phone; these don't.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StoreApp {
  id: string;
  label: string;
  icon: string;
  bg: [string, string];
  tint: string;
  /** One-line pitch on the store listing. */
  blurb: string;
  /** Size shown on the listing; bigger apps take longer to download. */
  mb: number;
  rating: number;
  /** Shown as an 18+ / sketchy warning on the listing. */
  shady?: boolean;
}

export const STORE_APPS: StoreApp[] = [
  { id: 'yahoo', label: 'Yahoo', icon: '💻', bg: ['#a3e635', '#3f6212'], tint: '#3f6212', blurb: 'Find “clients”. Send scripts. Pray EFCC is sleeping.', mb: 48, rating: 2.1, shady: true },
  { id: 'area', label: 'Area', icon: '🕴🏾', bg: ['#64748b', '#0f172a'], tint: '#0f172a', blurb: 'The streets have an app now. Run the area.', mb: 31, rating: 3.2, shady: true },
  { id: 'blackmarket', label: 'Black Market', icon: '🕶️', bg: ['#44403c', '#0c0a09'], tint: '#1c1917', blurb: 'Hot goods, cold prices. Sell what you “found”. Your name is on every listing.', mb: 17, rating: 2.7, shady: true },
  { id: 'plug', label: 'Plug', icon: '🌿', bg: ['#4ade80', '#14532d'], tint: '#14532d', blurb: 'Cana, Colorado, codeine, tramadol. “Delivery” only. The police do check phones.', mb: 14, rating: 2.3, shady: true },
  { id: 'fixer', label: 'Fixer', icon: '🕴🏾', bg: ['#a8a29e', '#1c1917'], tint: '#1c1917', blurb: 'Protection rackets, hit and kidnap contracts, ransoms and jailbreaks.', mb: 19, rating: 1.9, shady: true },
  { id: 'grind', label: 'Dirty Work', icon: '🛠️', bg: ['#fb923c', '#7c2d12'], tint: '#7c2d12', blurb: 'Fake papers, fake naira, fuel bunkering, pirate radio and backstreet betting.', mb: 24, rating: 2.5, shady: true },
  { id: 'legacy', label: 'Legacy', icon: '🏆', bg: ['#fde047', '#a16207'], tint: '#a16207', blurb: 'Your hall of fame. See how your past lives ended.', mb: 12, rating: 4.7 },
  { id: 'babalawo', label: 'Baba Online', icon: '🔮', bg: ['#c084fc', '#4c1d95'], tint: '#4c1d95', blurb: 'Consult a 24/7 native doctor. Accepts transfer. No refunds from the ancestors.', mb: 6, rating: 3.9, shady: true },
  { id: 'pidgin', label: 'Pidgin AI', icon: '🗣️', bg: ['#4ade80', '#14532d'], tint: '#166534', blurb: 'Type grammar, get pure Naija pidgin. Make your oyinbo boss confuse.', mb: 9, rating: 4.8 },
];

export const STORE_APP_IDS = new Set(STORE_APPS.map((a) => a.id));

interface AppsState {
  installed: string[];
  /** Installed but not opened yet: these wear a NEW badge on the home screen. */
  fresh: string[];
  install(id: string): void;
  markSeen(id: string): void;
  uninstall(id: string): void;
}

export const useApps = create<AppsState>()(
  persist(
    (set) => ({
      installed: [],
      fresh: [],
      install: (id) => set((s) => (s.installed.includes(id) ? s : { installed: [...s.installed, id], fresh: [...s.fresh, id] })),
      markSeen: (id) => set((s) => (s.fresh.includes(id) ? { fresh: s.fresh.filter((a) => a !== id) } : s)),
      uninstall: (id) => set((s) => ({ installed: s.installed.filter((a) => a !== id), fresh: s.fresh.filter((a) => a !== id) })),
    }),
    { name: 'kaduna-life-apps' },
  ),
);
