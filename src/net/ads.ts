// Player ads on the client (server side: worker/ads.ts).

import { create } from 'zustand';
import { ADS_ON_SALE, type Ad, type AdPlan, type MyAd } from '../game/ads';
import { useGame } from '../game/store';
import { api, useSession } from './session';
import { idToken } from './firebase';

interface AdsState { plans: AdPlan[]; live: Ad[]; mine: MyAd[]; /** Boards held by someone else's unpaid ad. */ reserved: string[]; /** Board to preselect when the sheet opens (tapped from a blank billboard). */ wantBoard: string | null; /** Open straight on the Place an ad tab. */ wantPlace: boolean; enabled: boolean; loaded: boolean; busy: boolean; /** The Ads bottom sheet is showing (opened from the HUD, the phone or a signboard). */ sheetOpen: boolean }

export const useAds = create<AdsState>(() => ({ plans: [], live: [], mine: [], reserved: [], wantBoard: null, wantPlace: false, enabled: false, loaded: false, busy: false, sheetOpen: false }));

const toast = (t: string) => useGame.getState().toast(t);

async function post<T extends object>(path: string, body: object): Promise<(T & { error?: string }) | null> {
  try {
    const res = await api(path, { method: 'POST', body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) { toast(d.error ?? 'Request failed'); return null; }
    return d;
  } catch {
    toast('No connection');
    return null;
  }
}

/** Fetch only the ads on show, from the public copy the edge caches: cheap enough for a screen to poll while it is on. */
export async function loadLiveAds() {
  try {
    const open = await fetch('/api/ads/live');
    if (open.ok) useAds.setState({ live: ((await open.json()) as { live: Ad[] }).live });
  } catch { /* offline: keep what we have */ }
}

export async function loadAds() {
  try {
    // Not signed in (a visitor on the landing's city tour): only the ads on show, which anyone may see.
    if (!useSession.getState().user) return await loadLiveAds();
    const res = await api('/api/ads');
    if (!res.ok) return;
    const d = (await res.json()) as Omit<AdsState, 'loaded' | 'busy' | 'sheetOpen' | 'wantBoard' | 'wantPlace'>;
    useAds.setState({ plans: d.plans, live: d.live, mine: d.mine, reserved: d.reserved ?? [], enabled: d.enabled, loaded: true });
  } catch { /* offline: keep what we have */ }
}

async function busy<T>(fn: () => Promise<T>): Promise<T | null> {
  if (useAds.getState().busy) return null;
  useAds.setState({ busy: true });
  try { return await fn(); } finally { useAds.setState({ busy: false }); }
}

/** Save the ad, then try to pay for it. Returns true when the ad was saved. */
/** Upload an ad picture (PNG/JPEG/WebP/GIF, up to 2 MB). Returns its URL, or null after a toast. */
export async function uploadAdImage(file: File): Promise<string | null> {
  try {
    const token = await idToken();
    if (!token) { toast('Sign in first'); return null; }
    const res = await fetch('/api/media', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': file.type }, body: file });
    const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !d.url) { toast(d.error ?? 'Could not upload that picture'); return null; }
    return d.url;
  } catch {
    toast('No connection');
    return null;
  }
}

export const placeAd = (input: { board: string; plan: string; title: string; body: string; link: string; image?: string; fill?: boolean }) =>
  busy(async () => {
    const made = await post<{ id: string }>('/api/ads', input);
    if (!made) return false;
    await loadAds();
    await payForAd(made.id, true);
    return true;
  });

export async function payForAd(id: string, nested = false) {
  const run = async () => {
    const d = await post<{ url?: string; activated?: boolean }>('/api/ads/checkout', { id });
    if (d?.activated) { toast('Your ad is live! 📣'); await loadAds(); }
    else if (d?.url) window.location.href = d.url;
  };
  if (nested) await run(); else await busy(run);
}

export const removeAd = (id: string) =>
  busy(async () => { if (await post('/api/ads/remove', { id })) await loadAds(); });

/** Show the Ads sheet (the phone, if open, closes first so the sheet isn't hidden behind it). */
export function openAdsSheet(board: string | null = null, place = false) {
  // Booking is for players: a visitor's tap must not leave the sheet waiting to pop open after they sign in.
  // And not at all while ads are off sale (game/ads.ts).
  if (!ADS_ON_SALE || !useSession.getState().user) return;
  useGame.getState().setPanel(null);
  void loadAds();
  useAds.setState({ sheetOpen: true, wantBoard: typeof board === 'string' ? board : null, wantPlace: place });
}
export const closeAdsSheet = () => useAds.setState({ sheetOpen: false });
