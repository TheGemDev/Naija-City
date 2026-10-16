// Player rentals on the client (server: worker/rentals.ts). Keeps the game's `lease` current so the
// Home button takes a tenant to the house they rent.

import { create } from 'zustand';
import type { RentalListing } from '../game/property';
import { naira, rentalHooks, useGame } from '../game/store';
import { useVisit } from '../game/visits';
import { api, useSession } from './session';
import { refreshBalance } from './wallet';
import { enterHouseVisit, leaveHouseVisit } from './visit';

interface Rentals {
  listings: RentalListing[];
  mine: RentalListing[];
  loaded: boolean;
  busy: boolean;
}

export const useRentals = create<Rentals>(() => ({ listings: [], mine: [], loaded: false, busy: false }));

const toast = (t: string) => useGame.getState().toast(t);

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

function setLease(lease: RentalListing | null) {
  useGame.setState({
    lease: lease
      ? {
          propertyId: lease.propertyId, ownerUid: lease.ownerUid, ownerUsername: lease.owner, design: lease.design,
          region: lease.region, weekly: lease.weekly, paidThrough: lease.paidThrough ?? 0,
        }
      : null,
  });
}

export async function loadRentals() {
  if (!useSession.getState().user) return;
  try {
    const d = await call<{ listings: RentalListing[]; mine: RentalListing[]; lease: RentalListing | null }>('/api/rentals');
    const had = useGame.getState().lease;
    useRentals.setState({ listings: d.listings, mine: d.mine, loaded: true });
    setLease(d.lease);
    // Houses with a tenant: the owner's electricity bill covers them.
    useGame.setState({ rentedOut: d.mine.filter((l) => l.tenant).map((l) => l.propertyId) });
    if (had && !d.lease) {
      const visit = useVisit.getState().current;
      if (visit && visit.ownerUid === had.ownerUid && !visit.burglary) leaveHouseVisit();
    }
    refreshBalance();
  } catch {
    /* offline: keep what we have */
  }
}

async function act(fn: () => Promise<unknown>, fail: string) {
  if (useRentals.getState().busy) return false;
  useRentals.setState({ busy: true });
  try {
    await fn();
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : fail);
    return false;
  } finally {
    useRentals.setState({ busy: false });
    void loadRentals();
  }
}

export const listForRent = (propertyId: string, weekly: number) =>
  act(async () => {
    const { left } = await call<{ left?: string | null }>('/api/rentals/list', { propertyId, weekly });
    // An NPC household may walk out rather than pay a raised rent (worker/rentals.ts).
    if (left) toast(`📦 ${left} moved out rather than pay ${naira(weekly)} a week. The house is back on the market.`);
    else if (useRentals.getState().mine.some((l) => l.propertyId === propertyId && l.npc && l.tenant)) toast('🔑 Rent updated. Your tenant pays the new price from next week.');
    else toast('🔑 Your house is on the market. Players (or an NPC household) can rent it from the House app.');
  }, 'Could not list the house');

export const unlistRental = (propertyId: string) =>
  act(async () => {
    await call('/api/rentals/unlist', { propertyId });
    toast('🔑 Your house is off the market.');
  }, 'Could not take the house off the market');

export const rentHouse = (propertyId: string) =>
  act(async () => {
    const { lease } = await call<{ lease: RentalListing }>('/api/rentals/rent', { propertyId });
    setLease(lease);
    const g = useGame.getState();
    if (g.govRentOwed > 0) g.clearGovRent(`🔑 You moved into @${lease.owner}'s house. No more government rent!`);
    else toast(`🔑 You moved into @${lease.owner}'s house. Tap Home to go there.`);
  }, 'Could not rent the house');

export const leaveRental = () =>
  act(async () => {
    const lease = useGame.getState().lease;
    await call('/api/rentals/leave', {});
    setLease(null);
    const visit = useVisit.getState().current;
    if (lease && visit?.ownerUid === lease.ownerUid) leaveHouseVisit();
    toast('📦 You moved out. Tap Home to move back into the government house, or rent another place.');
  }, 'Could not move out');

/** Home button for tenants: walk into the house they rent. */
export async function enterRentedHome() {
  if (useVisit.getState().current) return toast('Leave this house first.');
  try {
    const { home } = await call<{ home: Parameters<typeof enterHouseVisit>[0] }>('/api/rentals/enter', {});
    enterHouseVisit(home);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not get home');
    void loadRentals();
  }
}

rentalHooks.enter = () => void enterRentedHome();

/** Live notice from the server (new tenant, eviction, lease ended). */
export function onRentalEvent(e: { t: 'rental'; text: string }) {
  toast(`🔑 ${e.text}`);
  void loadRentals();
}
