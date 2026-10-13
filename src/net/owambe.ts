// Player-hosted owambes and spraying real players (worker/owambe.ts moves the money).

import { create } from 'zustand';
import { naira, useGame } from '../game/store';
import { PARTY, PARTY_KINDS, squareCity, squareName, type Party, type PartyKind } from '../game/owambe';
import { api, serial, useSession } from './session';
import { flushWalletNow, refreshBalance, setServerBalance } from './wallet';
import { remotePos, useNet } from './multiplayer';

interface PartyState {
  /** The party booked at the square of the city I am in right now, if a player is hosting one. */
  party: Party | null;
  /** When I can host again. */
  hostReadyAt: number;
  /** Bumped whenever money rains on me, so the party screen can show it. */
  rain: number;
  /** The party screen should open on "throw your own party". */
  planning: boolean;
  busy: boolean;
}

export const useParty = create<PartyState>(() => ({ party: null, hostReadyAt: 0, rain: 0, planning: false, busy: false }));

async function call<T>(path: string, body?: object): Promise<T> {
  const res = await api(path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

async function act<T>(fn: () => Promise<T>): Promise<T | null> {
  if (useParty.getState().busy) return null;
  useParty.setState({ busy: true });
  try {
    return await serial(fn);
  } catch (e) {
    useGame.getState().toast(e instanceof Error ? e.message : 'Could not do that now');
    return null;
  } finally {
    useParty.setState({ busy: false });
  }
}

const txn = (amount: number, label: string) =>
  useGame.setState((s) => ({ txns: [{ at: s.minutes, label, amount }, ...s.txns].slice(0, 40) }));

/** A hosted party that hasn't ended yet. */
export const liveParty = () => {
  const p = useParty.getState().party;
  return p && p.endsAt > Date.now() ? p : null;
};

export async function loadParty() {
  if (!useSession.getState().user?.username) return;
  const city = useGame.getState().destinationId;
  const d = await call<{ party: Party | null; hostReadyAt: number }>(`/api/owambe?city=${encodeURIComponent(city)}`).catch(() => null);
  // Flew out while it was loading: that party is in the city I left.
  if (d && city === useGame.getState().destinationId) useParty.setState({ party: d.party, hostReadyAt: d.hostReadyAt });
}

/** Book the square of the city I am in for my own party. */
export function hostParty(kind: PartyKind) {
  return act(async () => {
    await flushWalletNow();
    const city = useGame.getState().destinationId;
    const d = await call<{ party: Party; balance: number }>('/api/owambe/host', { kind, city });
    setServerBalance(d.balance);
    txn(-PARTY.fee, `Booked ${squareName(city)}: ${PARTY_KINDS[kind].label}`);
    useParty.setState({ party: d.party, hostReadyAt: Date.now() + PARTY.hostCooldownMs });
    useGame.getState().toast(`${PARTY_KINDS[kind].icon} ${d.party.title} is on! Invite people and stand on the square to get sprayed.`);
    return d.party;
  });
}

export function inviteGuest(uid: string, username: string) {
  return act(async () => {
    await call('/api/owambe/invite', { to: uid });
    useGame.getState().toast(`💌 Invite sent to @${username}`);
    return true;
  });
}

/** Spray a real player standing at the square. */
export function sprayPlayer(uid: string, username: string, amount: number) {
  return act(async () => {
    await flushWalletNow();
    const d = await call<{ amount: number; balance: number; party: Party | null }>('/api/owambe/spray', { to: uid, amount });
    setServerBalance(d.balance);
    txn(-d.amount, `Sprayed @${username}`);
    useParty.setState({ party: d.party });
    const g = useGame.getState();
    g.bump('sprayed', d.amount);
    if (d.amount >= 20_000) useGame.setState((s) => ({ goodDeeds: s.goodDeeds + (d.amount >= PARTY.headline ? 2 : 1) }));
    return d.amount;
  });
}

/** Money landed on me at the party. */
export function onSprayed(by: string, amount: number, party: string | null) {
  txn(amount, `Sprayed by @${by}`);
  useParty.setState((s) => ({ rain: s.rain + 1 }));
  useGame.getState().toast(`💸 @${by} sprayed you ${naira(amount)}${party ? ` at ${party}` : ''}! Dance well o!`);
  void refreshBalance();
  void loadParty();
}

/** Other players standing at this city's square right now. */
export function playersAtSquare() {
  const { players, myId } = useNet.getState();
  const city = useGame.getState().destinationId;
  return Object.values(players).filter((p) => p.id !== myId && squareCity(remotePos.get(p.id)) === city);
}

/** Keep the party board fresh while signed in (more often while the party screen is open). */
export function startParty() {
  let tick = 0;
  const poll = setInterval(() => {
    tick++;
    const g = useGame.getState();
    if (!g.started) return;
    if (g.owambe || tick % 6 === 0) void loadParty();
  }, 10_000);
  // Another city, another square: drop the party I left behind and look for the one here.
  const unsubCity = useGame.subscribe((s, p) => {
    if (s.destinationId === p.destinationId) return;
    useParty.setState({ party: null });
    void loadParty();
  });
  const unsub = useSession.subscribe((s, p) => {
    if (s.user?.username && s.user?.username !== p.user?.username) void loadParty();
    if (!s.user) useParty.setState({ party: null, hostReadyAt: 0 });
  });
  void loadParty();
  return () => {
    clearInterval(poll);
    unsubCity();
    unsub();
  };
}
