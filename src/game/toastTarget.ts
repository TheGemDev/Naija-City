// Which phone app a toast is about, so tapping the toast can open it. Picked from what the toast says,
// like toastSound() in sfx.ts. Returns null for toasts with nowhere to go.

import { isTipToast } from './tips';

import type { GameState } from './store';

/** `lightTab` is the tab the NEPA app opens on, when the toast is about one. */
export type ToastApp = { id: string; label: string; lightTab?: NonNullable<GameState['lightTab']> };

const RULES: Array<[RegExp, ToastApp]> = [
  // Your children (src/net/kids.ts): every one of their toasts starts with the baby.
  [/^👶🏾/, { id: 'adopt', label: 'Adopt' }],
  // NEPA (game/store.ts). Its toasts carry 🧾 and 🚨, so they come before the Bank's and the police's. Anything about
  // the bill (taken, about to be taken, still owed) opens on Bills.
  [/overhead tank|Mai Ruwa/i, { id: 'light', label: 'NEPA', lightTab: 'water' }],
  [/NEPA.*(still owed|unpaid bill|added to your bill|auto-deduct|took)/i, { id: 'light', label: 'NEPA', lightTab: 'bills' }],
  [/NEPA/, { id: 'light', label: 'NEPA' }],
  // The hunger warnings (game/store.ts): the Mall opens on its food when you are hungry.
  [/about to faint|belle dey shout/i, { id: 'mall', label: 'Jumia to order food' }],
  // A fake-votes case (net/live.ts) says INEC, and comes before the EFCC's own toasts.
  [/INEC/, { id: 'inec', label: 'INEC' }],
  [/EFCC|\bsting\b|🐍/i, { id: 'efcc', label: 'EFCC' }],
  [/Landlord Agent/i, { id: 'gida', label: 'House' }],
  [/police|🚔|🚨|bail|filed a report|🔓|CCTV|📹|broke into|🏚️|😱|burgl|accused|🕵🏾/i, { id: 'police', label: 'Police' }],
  [/VDM|📢/i, { id: 'gist', label: 'Twitter' }],
  [/💸|you received|🧾|asking for|loan|🏦/i, { id: 'bank', label: 'Bank' }],
  [/🚪|invited you home|visit your house|✉️/i, { id: 'messages', label: 'Messages' }],
  [/🏛️|🎤|vote|palliative|🧧|🪧|🚧|🍚/i, { id: 'civic', label: 'Politics' }],
  [/mechanic|KD Autos|🔧|is spoilt/i, { id: 'cars', label: 'Autos' }],
];

/** Turned away at a door for smelling (game/store.ts startPlace). The door can be the police station's or a bank's: it is still about a bath. */
const SMELL = /Oga, the smell!/;

export function toastApp(text: string): ToastApp | null {
  if (SMELL.test(text)) return null;
  // A tip talks about all sorts (police, votes, your house): it always opens Help, on that tip's topic.
  if (isTipToast(text)) return { id: 'help', label: 'Help' };
  for (const [re, app] of RULES) if (re.test(text)) return app;
  return null;
}

export type ToastPlace = { id: string; label: string };

/** Toasts about somewhere you can go: tapping opens that place's sheet so you pick how to get there. */
const PLACE_RULES: Array<[RegExp, ToastPlace]> = [
  [/invited you to .* at Eagle Square|invited to .*wedding today at Eagle Square/i, { id: 'murtala', label: 'Eagle Square' }],
  [/invited you to .* at Tafawa Balewa Square|invited to .*wedding today at Tafawa Balewa Square/i, { id: 'murtala', label: 'Tafawa Balewa Square' }],
  [/invited you to .* at Murtala Square|invited to .*wedding today at Murtala Square/i, { id: 'murtala', label: 'Murtala Square' }],
  // Wherever it is, it is in another city (game/store.ts awayFrom): every city's airport is the place 'airport'.
  [/^✈️ You are in .* first\.$/, { id: 'airport', label: 'the airport' }],
  // Every city's hospital lets you in to wash, however you smell (game/city.ts SMELLY_OK).
  [SMELL, { id: 'hospital', label: 'the hospital and bath 🚿' }],
];

export function toastPlace(text: string): ToastPlace | null {
  if (isTipToast(text)) return null;
  for (const [re, place] of PLACE_RULES) if (re.test(text)) return place;
  return null;
}

export type ToastHome = { kind: 'home' | 'land'; label: string };

/** Toasts about your own house or land: tapping takes you there (you still choose how to travel). */
const HOME_RULES: Array<[RegExp, ToastHome]> = [
  [/(broke|broken) into your house|burgled your house|stopped working at your house|stole your .* and disappeared|house security/i, { kind: 'home', label: 'your house' }],
  [/your (unused )?(plot|land)|reclaimed your/i, { kind: 'land', label: 'your land' }],
];

export function toastHome(text: string): ToastHome | null {
  if (isTipToast(text) || SMELL.test(text)) return null;
  for (const [re, home] of HOME_RULES) if (re.test(text)) return home;
  return null;
}
