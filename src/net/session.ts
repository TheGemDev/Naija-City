// Who is playing, and keeping their save in sync with the Cloudflare API.

import { getTurnstileToken } from './turnstile';
import { deviceHeaders } from './device';
import { claimReferral } from './referral';
import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { auth, cachedToken, idToken, signOut, watchUser } from './firebase';
import { clearLocal, hydrate, saveLocal, serialize, type SaveData } from '../game/save';
import { useGame } from '../game/store';
import { isComplete } from '../game/property';
import { ITEMS } from '../game/catalog';
import { CAR_BY_ID } from '../game/cars';
import { clearWallet, flushOnExit, flushWallet, flushWalletNow, initWallet, walletExitEvents } from './wallet';
import { useVisit } from '../game/visits';

type Status = 'loading' | 'signedOut' | 'syncing' | 'needsAge' | 'needsUsername' | 'ready';
type Cloud = 'off' | 'saving' | 'saved' | 'error';

interface Session {
  status: Status;
  user: { uid: string; email: string | null; name: string | null; username: string | null; /** Playing as a guest: no email or Google attached yet, so logging out would lose this life. */ guest?: boolean; /** Real age in years, for the age-group rich lists. */ age?: number | null; /** Their own date of birth (YYYY-MM-DD), for their birth certificate. */ birthdate?: string | null } | null;
  cloud: Cloud;
  cloudAt: number | null;
  /** Signed in but the server can't be reached; the game waits (it's online-only) and keeps retrying. */
  offline: boolean;
  /** Another tab/device took over this account: stop saving so its progress isn't overwritten. */
  elsewhere: boolean;
  logOut(): Promise<void>;
}

export const useSession = create<Session>((set) => ({
  status: 'loading',
  user: null,
  cloud: 'off',
  cloudAt: null,
  offline: false,
  elsewhere: false,
  async logOut() {
    // A guest has no way back in once they leave: say so first.
    if (useSession.getState().user?.guest && !window.confirm('You are playing as a guest. If you log out, this life is gone for good. Save your progress first with Google or email in Settings → Account.\n\nLog out anyway?')) return;
    await flushWallet();
    await pushSave();
    try {
      await removePushSubscription();
    } catch (error) {
      console.error('Could not remove this device from push notifications', error);
    }
    clearWallet();
    await signOut();
    useVisit.setState({ current: null, returnSave: null });
    // Don't leave this player's house for the next person on the device.
    clearLocal();
    useGame.getState().reset();
  },
}));

export async function api(path: string, init: RequestInit = {}) {
  const token = await idToken();
  if (!token) throw new Error('Not signed in');
  // Which device this is, for the EFCC's linked-account checks (net/device.ts).
  const device = await deviceHeaders();
  return fetch(path, { ...init, headers: { ...device, ...init.headers, Authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
}

async function removePushSubscription() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const response = await api('/api/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error(`Could not remove push subscription (${response.status})`);
  await subscription.unsubscribe();
}

/** On each sign-in, a device that already turned notifications on re-registers with the server. If the server's VAPID key changed, it swaps its old subscription (which the push service now rejects) for one under the new key. */
async function refreshPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  let subscription = await registration?.pushManager.getSubscription();
  if (!registration || !subscription) return;
  const keyRes = await fetch('/api/push/key');
  if (!keyRes.ok) return;
  const { publicKey } = (await keyRes.json()) as { publicKey: string | null };
  if (!publicKey) return;
  const encoded = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const key = Uint8Array.from(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)), (c) => c.charCodeAt(0));
  const current = subscription.options.applicationServerKey ? new Uint8Array(subscription.options.applicationServerKey) : null;
  if (!current || current.length !== key.length || current.some((b, i) => b !== key[i])) {
    await api('/api/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  }
  const response = await api('/api/push/subscribe', { method: 'PUT', body: JSON.stringify(subscription) });
  if (!response.ok) throw new Error(`Could not save push subscription (${response.status})`);
}

let lastPushed = '';
/** savedAt of the cloud save this device last loaded or wrote; sent so the server can spot another device's newer save. */
let baseSavedAt = 0;
const baseKey = () => `kaduna-life-base-${useSession.getState().user?.uid}`;
/** Remembered on the device so the next session can prove it continues the latest cloud save. */
function setBase(v: number) {
  baseSavedAt = v;
  try {
    localStorage.setItem(baseKey(), String(v));
  } catch {
    /* storage blocked */
  }
}

/**
 * Save uploads and money transfers both change the stored money, so they run one at a time:
 * an upload that started before a payment must not land after it.
 */
let chain: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/** Upload the current game if it changed since the last upload. */
export const pushSave = () => serial(pushSaveNow);

/** pushSave without taking the lock; only call from inside serial(). */
export async function pushSaveNow(): Promise<void> {
  const s = useSession.getState();
  if (!s.user || s.offline || s.elsewhere || (s.status !== 'ready' && s.status !== 'needsUsername' && s.status !== 'needsAge') || !useGame.getState().started) return;
  if (exitPush) await exitPush;
  try {
    // Purchases must reach the wallet before the save, or the server won't see the new furniture as owned.
    await flushWalletNow();
  } catch {
    useSession.setState({ cloud: 'error' });
    return;
  }
  const data = serialize();
  const body = JSON.stringify({ ...data, savedAt: 0 });
  if (body === lastPushed) return;
  useSession.setState({ cloud: 'saving' });
  try {
    const res = await api('/api/save', { method: 'PUT', body: JSON.stringify(data), headers: { 'X-Base-Saved-At': String(baseSavedAt) } });
    if (res.status === 409) return loadNewer(((await res.json()) as { save: SaveData }).save);
    if (!res.ok) {
      const reason = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
      if (reason) console.warn(`Save rejected (${res.status}): ${reason}`);
      throw new Error(`${res.status}`);
    }
    const { savedAt, corrected, why } = (await res.json()) as { savedAt: number; corrected?: Corrections; why?: CorrectionWhy };
    lastPushed = body;
    setBase(savedAt);
    useSession.setState({ cloud: 'saved', cloudAt: savedAt });
    if (corrected) applyCorrections(corrected, why);
  } catch {
    useSession.setState({ cloud: 'error' });
  }
}

/** Another device saved after this one last synced: switch to that progress. Money is unaffected (wallet). */
function loadNewer(save: SaveData) {
  // A "newer" save that isn't newer would 409 → load → push → 409 forever (toast spam, avatar snapping back).
  if (!(save.savedAt > baseSavedAt)) {
    useSession.setState({ cloud: 'error' });
    return;
  }
  hydrate(save);
  saveLocal();
  setBase(save.savedAt);
  lastPushed = '';
  useSession.setState({ cloud: 'saved', cloudAt: save.savedAt });
  useGame.getState().toast('📱 Loaded your newer progress from another device');
}

/** What the server refused to back up (worker/index.ts Corrections). */
interface Corrections {
  knowledge?: number;
  items?: SaveData['items'];
  furnitureInventory?: SaveData['furnitureInventory'];
  properties?: SaveData['properties'];
  confiscatedProperties?: string[];
  ownedCars?: string[];
  selectedCar?: string | null;
  investments?: SaveData['investments'];
}

/** What the server undid, and why (worker/index.ts PUT /api/save). */
interface CorrectionWhy { seized?: number; houses?: boolean; knowledge?: [number, number]; items?: string[]; cars?: string[]; investments?: string[] }

/** Says what was undone in words: which furniture or car wasn't paid for, knowledge not earned yet, and so on. */
function correctionMessage(why?: CorrectionWhy): string {
  if (!why) return '⚠️ Some progress couldn’t be verified and was undone';
  const parts: string[] = [];
  if (why.items?.length) {
    const counts = new Map<string, number>();
    for (const t of why.items) counts.set(t, (counts.get(t) ?? 0) + 1);
    const names = [...counts].map(([t, n]) => `${n > 1 ? `${n} × ` : ''}${ITEMS[t]?.name ?? t}`);
    parts.push(`${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} wasn’t paid for, so it was taken back`);
  }
  if (why.cars?.length) parts.push(`${why.cars.map((id) => CAR_BY_ID[id]?.name ?? id).join(', ')} wasn’t paid for`);
  if (why.knowledge) parts.push(`knowledge set back to ${why.knowledge[1]} (not earned yet)`);
  if (why.investments?.length) parts.push('some investment units weren’t bought');
  if (why.seized) parts.push(why.seized > 1 ? `${why.seized} houses were seized` : 'a house was seized');
  if (why.houses && !parts.length) return '';
  return parts.length ? `⚠️ ${parts.join(' · ')}` : '⚠️ Some progress couldn’t be verified and was undone';
}

/** The server refused progress it couldn't verify (unearned knowledge, unpaid furniture, cars or investments). */
function applyCorrections(c: Corrections, why?: CorrectionWhy) {
  const g = useGame.getState();
  if (c.knowledge !== undefined) useGame.setState({ knowledge: c.knowledge });
  if (c.items) {
    const keep = new Set(c.items.map((i) => i.id));
    useGame.setState({ items: g.items.filter((i) => keep.has(i.id)), selectedId: null, placing: null });
  }
  if (c.furnitureInventory) {
    const keep = new Set(c.furnitureInventory.map((i) => i.id));
    useGame.setState({ furnitureInventory: g.furnitureInventory.filter((i) => keep.has(i.id)) });
  }
  if (c.confiscatedProperties?.length) {
    const ids = new Set(c.confiscatedProperties);
    useGame.setState((s) => {
      const seized = s.properties.filter((p) => ids.has(p.id));
      const properties = s.properties.filter((p) => !ids.has(p.id));
      const fallback = properties.find(isComplete) ?? null;
      const activeWasSeized = !!s.activeHouseId && ids.has(s.activeHouseId);
      const inventory = activeWasSeized
        ? [...s.furnitureInventory, ...(seized.find((p) => p.id === s.activeHouseId)?.items ?? s.items)]
        : s.furnitureInventory;
      const unique = [...new Map(inventory.map((item) => [item.id, item])).values()];
      return {
        properties,
        homePropertyId: s.homePropertyId && ids.has(s.homePropertyId) ? fallback?.id ?? null : s.homePropertyId,
        activeHouseId: activeWasSeized ? fallback?.id ?? null : s.activeHouseId,
        items: activeWasSeized ? fallback?.items ?? [] : s.items,
        furnitureInventory: unique,
      };
    });
  }
  if (c.properties) {
    // Only furniture is corrected. Replacing whole properties would roll back construction progress
    // made since the push, so the finished-stage notices would fire again.
    const fixed = new Map(c.properties.map((p) => [p.id, p.items]));
    // And the owner-set parts the server cleans (worker/index.ts cleanHouses): name, outside, extensions, rooms.
    const owned = new Map(c.properties.map((p) => [p.id, p]));
    const HOUSE_FIELDS = ['name', 'exterior', 'extensions', 'rooms'] as const;
    useGame.setState((s) => ({
      properties: s.properties.map((p) => {
        const next = fixed.has(p.id) && fixed.get(p.id) ? { ...p, items: fixed.get(p.id) } : p;
        const from = owned.get(p.id) as Partial<typeof p> | undefined;
        if (!from) return next;
        const out = { ...next };
        for (const k of HOUSE_FIELDS) {
          if (from[k] === undefined) delete out[k];
          else (out as Record<string, unknown>)[k] = from[k];
        }
        return out;
      }),
    }));
  }
  if (c.ownedCars) useGame.setState({ ownedCars: c.ownedCars, selectedCar: c.selectedCar ?? null });
  if (c.investments) {
    const fixed = c.investments;
    useGame.setState((s) => ({
      investments: Object.fromEntries(Object.entries(s.investments).map(([id, h]) => [id, { ...h, units: Math.min(h.units, fixed[id]?.units ?? 0) }])),
    }));
  }
  // A house name or outside choice tidied up isn't worth alarming anyone over: no toast for that alone.
  const message = correctionMessage(why);
  if (message) g.toast(message);
}

/** In-flight exit upload; the next normal save waits for it so it builds on the savedAt it got. */
let exitPush: Promise<void> | null = null;

/** Best effort on tab close: the page may be gone before a normal fetch finishes. Returns whether a save went out. */
function pushOnExit(): boolean {
  const s = useSession.getState();
  if (!s.user || s.offline || s.elsewhere || (s.status !== 'ready' && s.status !== 'needsUsername' && s.status !== 'needsAge') || !cachedToken || !useGame.getState().started) return false;
  const data = serialize();
  const compare = JSON.stringify({ ...data, savedAt: 0 });
  if (compare === lastPushed || exitPush) return false;
  // The wallet's unsent events go inside the save. Sent apart, the save could land first, and the server
  // would undo the purchases it shows as unpaid. More than one batch of them can't ride along.
  const events = walletExitEvents();
  if (events.length > 100) return false;
  const body = JSON.stringify(events.length ? { ...data, walletEvents: events } : data);
  if (body.length > 60_000) return false; // keepalive body limit is 64KB
  // The tab is often only hidden (app switch, screen lock) and comes back. Record the savedAt the server
  // gave this upload, or the next save would send a stale base, get a 409, and load this older save
  // as if it came from another device, snapping the player back to where they were when they left.
  exitPush = fetch('/api/save', {
    method: 'PUT',
    body,
    keepalive: true,
    headers: { Authorization: `Bearer ${cachedToken}`, 'content-type': 'application/json', 'X-Base-Saved-At': String(baseSavedAt) },
  })
    .then(async (res) => {
      if (!res.ok) return;
      const { savedAt } = (await res.json()) as { savedAt: number };
      lastPushed = compare;
      setBase(savedAt);
      useSession.setState({ cloud: 'saved', cloudAt: savedAt });
    })
    .catch(() => {})
    .finally(() => {
      exitPush = null;
    });
  return true;
}

/** Tab hidden or closing: the save takes the wallet's events with it; when no save goes, the events go alone. */
function onExit() {
  if (!pushOnExit()) flushOnExit();
}

/** Another tab/device took over: upload this tab's progress one last time, then stop saving. */
export async function handOff() {
  await pushSave();
  useSession.setState({ elsewhere: true });
}

/** This tab took over from another one: load the progress it just handed off. */
export async function takeOver() {
  useSession.setState({ elsewhere: false });
  try {
    const res = await api('/api/save');
    if (res.ok) {
      const save = (await res.json()) as SaveData;
      if (save.savedAt > baseSavedAt) {
        hydrate(save);
        saveLocal();
        setBase(save.savedAt);
        lastPushed = '';
        useSession.setState({ cloud: 'saved', cloudAt: save.savedAt });
      }
    }
    await initWallet();
  } catch {
    /* a later save gets a 409 and loads the newer progress then */
  }
}

/** Send the date of birth (once). Returns an error message, or null on success. */
export async function submitBirthdate(year: number, month: number, day: number): Promise<string | null> {
  try {
    const res = await api('/api/birthdate', { method: 'POST', body: JSON.stringify({ year, month, day }) });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not save that';
    const { age } = (await res.json().catch(() => ({}))) as { age?: number };
    const u = useSession.getState().user;
    useSession.setState({ status: u?.username ? 'ready' : 'needsUsername', user: u && { ...u, age: age ?? null, birthdate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` } });
    if (u?.username) await pushSave();
    return null;
  } catch {
    return 'No network. Try again.';
  }
}

/** Claim a unique username. Returns an error message, or null on success. */
export async function claimUsername(username: string): Promise<string | null> {
  try {
    const turnstile = await getTurnstileToken();
    const res = await api('/api/username', { method: 'POST', headers: turnstile ? { 'x-turnstile-token': turnstile } : {}, body: JSON.stringify({ username }) });
    const data = (await res.json()) as { username?: string; error?: string };
    if (!res.ok) return data.error ?? 'Could not save username';
    const s = useSession.getState();
    useSession.setState({ user: s.user && { ...s.user, username: data.username! } });
    if (s.status === 'needsUsername') {
      useSession.setState({ status: 'ready' });
      await pushSave();
    }
    return null;
  } catch {
    return 'No network. Try again.';
  }
}

/** After sign-in: the cloud save wins; if there is none, this device's progress is uploaded. */
async function syncOnSignIn(u: User) {
  useSession.setState({ status: 'syncing', user: { uid: u.uid, email: u.email, name: u.displayName, username: null, guest: u.isAnonymous }, cloud: 'saving', offline: false });
  try {
    const [res, meRes] = await Promise.all([api('/api/save'), api('/api/me')]);
    if (!meRes.ok) throw new Error(`${meRes.status}`);
    // The player row exists now (GET /api/save makes it), so the server can tell a new account from an old one.
    void claimReferral(api);
    const me = (await meRes.json()) as { username: string | null; adult?: boolean; age?: number | null; birthdate?: string | null };
    const user = { ...useSession.getState().user!, username: me.username, age: me.age ?? null, birthdate: me.birthdate ?? null };
    const next: Status = !me.adult ? 'needsAge' : me.username ? 'ready' : 'needsUsername';
    if (res.ok) {
      const save = (await res.json()) as SaveData;
      hydrate(save);
      saveLocal();
      setBase(save.savedAt);
      useSession.setState({ status: next, user, cloud: 'saved' });
    } else if (res.status === 404) {
      setBase(0);
      useSession.setState({ status: next, user, cloud: 'off' });
      await pushSave();
    } else throw new Error(`${res.status}`);
    // Money comes from the server wallet (seeded from the save on first sign-in).
    await initWallet();
  } catch {
    // Online-only: stay on the loading screen and retry until the server answers.
    useSession.setState({ status: 'syncing', cloud: 'error', offline: true });
    retryLater();
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

function retryLater(ms = 5_000) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    const u = auth.currentUser;
    if (u && useSession.getState().offline) syncOnSignIn(u);
  }, ms);
}

export function startSession() {
  const unsubAuth = watchUser((u) => {
    const s = useSession.getState();
    if (u) {
      if (s.user?.uid !== u.uid) syncOnSignIn(u);
      // Same player, new details: a guest who just saved their progress with Google or an email.
      else if (s.user.guest !== u.isAnonymous || s.user.email !== u.email) useSession.setState({ user: { ...s.user, guest: u.isAnonymous, email: u.email, name: u.displayName ?? s.user.name } });
    } else {
      lastPushed = '';
      baseSavedAt = 0;
      clearWallet();
      useSession.setState({ offline: false, elsewhere: false });
      useSession.setState({ user: null, cloud: 'off', cloudAt: null, status: 'signedOut' });
    }
  });
  const id = setInterval(pushSave, 30_000);
  // Push right away on big moments.
  const unsubGame = useGame.subscribe((s, p) => {
    if (s.started !== p.started || s.items !== p.items || s.furnitureInventory !== p.furnitureInventory || s.jobId !== p.jobId || s.jobCity !== p.jobCity || s.properties !== p.properties) pushSave();
  });
  const unsubPush = useSession.subscribe((s, p) => {
    if (s.status === 'ready' && p.status !== 'ready') refreshPushSubscription().catch((error) => console.error('Could not refresh push subscription', error));
  });
  const onOnline = () => useSession.getState().offline && retryLater(0);
  window.addEventListener('online', onOnline);
  const onHide = () => document.visibilityState === 'hidden' && onExit();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onExit);
  return () => {
    unsubAuth();
    unsubGame();
    unsubPush();
    clearInterval(id);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onExit);
    window.removeEventListener('online', onOnline);
  };
}
