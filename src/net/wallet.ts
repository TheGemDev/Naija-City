// Mirrors money changes to the server wallet (worker/wallet.ts), which is the source of truth.
//
// Money still changes instantly in the game. Each change is queued as an event and sent in batches;
// the server accepts or rejects each one and returns the real balance. What the player sees is
// always `server balance + events the server hasn't answered yet`.

import type { FareSubsidy } from '../game/transport';
import { setOkadaBan } from '../game/cityLaws';
import { moneyHooks, useGame, type MoneyKind } from '../game/store';
import { cachedToken } from './firebase';
import { api, serial, useSession } from './session';
import { normalizeOrigin, type OriginId } from '../game/origins';
import { clearLoans, loadLoans } from './loans';
import { invitedState, spendInvitedState } from './referral';

/** Money changes plus task start/end, which drive the server's game clock (worker/clock.ts). */
interface GameEvent {
  id: string;
  /** Real time it happened; the server clamps it so it can only move forward. */
  at: number;
  kind: MoneyKind | 'task_start' | 'task_end';
  ref?: string;
  amount: number;
  /** Units traded, on an investment buy or sale of more than one. */
  qty?: number;
  task?: string;
  action?: string;
}

let serverBalance: number | null = null;
let serverDebt: number | null = null;
/** The origin the server has on record for this life (null = not drawn yet). */
let serverOrigin: OriginId | null = null;
export const walletOrigin = () => serverOrigin;
/** The state the server drew for this life (game/regions.ts); null when it has none on record. */
let serverState: string | null = null;
export const walletState = () => serverState;
let pending: GameEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const storeKey = () => `kaduna-life-wallet-${useSession.getState().user?.uid}`;

/** Unsent events survive a reload, so earnings made just before closing the tab aren't lost. */
function persist() {
  try {
    if (pending.length) localStorage.setItem(storeKey(), JSON.stringify(pending));
    else localStorage.removeItem(storeKey());
  } catch {
    /* storage blocked */
  }
}

function restore(): GameEvent[] {
  try {
    return JSON.parse(localStorage.getItem(storeKey()) ?? '[]');
  } catch {
    return [];
  }
}

/** Show the server's balance plus whatever is still on its way. */
function reconcile() {
  if (serverBalance === null) return;
  // The server takes income tax off wages and hustles when it accepts them (worker/wallet.ts).
  const rate = useGame.getState().taxRate + useGame.getState().stateTax;
  const taxed = (e: GameEvent) => ((e.kind === 'work' || e.kind === 'gig') && e.amount > 0 ? Math.floor((e.amount * rate) / 100) : 0);
  const money = serverBalance + pending.reduce((a, e) => a + (e.kind === 'debt' ? 0 : e.amount - taxed(e)), 0);
  if (useGame.getState().money !== money) useGame.setState({ money });
  if (serverDebt !== null) {
    const debtOwed = serverDebt + pending.reduce((a, e) => a + (e.kind === 'debt' ? e.amount : 0), 0);
    if (useGame.getState().debtOwed !== debtOwed) useGame.setState({ debtOwed });
  }
}

export function setServerBalance(balance: number, debt?: number) {
  serverBalance = balance;
  if (debt !== undefined) serverDebt = debt;
  reconcile();
}

export const walletBalance = () => serverBalance;

/** The server paid today's installment of this life's starting money (worker/wallet.ts payStarter). */
function starterPaid(starter: { paid: number; left: number } | null | undefined) {
  if (!starter?.paid) return;
  const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
  useGame.getState().toast(starter.left > 0
    ? `💸 Starter money: +${naira(starter.paid)} today. ${naira(starter.left)} more to come, a bit each day you play`
    : `💸 The last of your starter money: +${naira(starter.paid)}`);
}

/** Money changes the server hasn't answered yet. */
export const walletPending = () => pending.length > 0;

/** Send queued events. Only call inside serial(); use flushWallet() otherwise. */
export async function flushWalletNow(): Promise<void> {
  // Every batch, not just the first: the save uploaded after this claims everything bought so far, and the
  // server undoes whatever it hasn't been told about yet (a quick run of 100+ buys lost units it then charged for).
  while (serverBalance !== null && pending.length) {
    const batch = pending.slice(0, 100);
    const res = await api('/api/wallet/events', { method: 'POST', body: JSON.stringify({ events: batch }) });
    if (!res.ok) throw new Error(`${res.status}`);
    const { balance, debt, rejected, taxRate, stateTax, okadaBan, fares, starter } = (await res.json()) as { balance: number; debt?: number; rejected: Record<string, string>; taxRate?: number; stateTax?: number; okadaBan?: string[]; fares?: FareSubsidy; starter?: { paid: number; left: number } | null };
    // The fare subsidy the ticket desks show (worker/wallet.ts prices every ticket the same way).
    if (fares) {
      const was = useGame.getState().fares;
      if (was.air !== fares.air || was.rail !== fares.rail || was.funded !== fares.funded) useGame.setState({ fares });
    }
    if (taxRate !== undefined && taxRate !== useGame.getState().taxRate) useGame.setState({ taxRate });
    if (stateTax !== undefined && stateTax !== useGame.getState().stateTax) useGame.setState({ stateTax });
    if (okadaBan) setOkadaBan(okadaBan);
    const done = new Set(batch.map((e) => e.id));
    pending = pending.filter((e) => !done.has(e.id));
    persist();
    setServerBalance(balance, debt);
    starterPaid(starter);
    const lost = batch.filter((e) => rejected[e.id] && e.kind !== 'debt').reduce((a, e) => a + e.amount, 0);
    if (lost > 0) useGame.getState().toast('⚠️ Some earnings didn’t go through and were taken back');
  }
}

export const flushWallet = () => serial(flushWalletNow).catch(() => schedule(10_000));

function schedule(ms = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flushWallet();
  }, ms);
}

/** Load the real balance after sign-in, plus any events left over from last time. */
/** `early` is a GET /api/wallet already on its way (sent alongside the save on sign-in, see net/session.ts). */
export async function initWallet(early?: Promise<Response>) {
  const res = await (early ?? api('/api/wallet'));
  if (!res.ok) throw new Error(`${res.status}`);
  const { balance, debt, origin, state, starter } = (await res.json()) as { balance: number; debt?: number; origin: string | null; state?: string | null; starter?: { paid: number; left: number } | null };
  serverOrigin = origin === null ? null : normalizeOrigin(origin);
  serverState = state ?? null;
  pending = restore();
  setServerBalance(balance, debt);
  starterPaid(starter);
  void loadLoans();
  if (pending.length) schedule(0);
}

/**
 * Signed-in players: the server gives the start and draws the birth state (or returns the ones this life already has).
 * Returns null when there is no server wallet (guest or offline); the caller then starts locally.
 */
export async function drawOriginOnServer(): Promise<OriginId | null> {
  if (serverBalance === null) return null;
  return serial(async () => {
    // An invite link's state (net/referral.ts): the server honours it for a first life.
    const res = await api('/api/origin', { method: 'POST', body: JSON.stringify({ state: invitedState() }) });
    if (!res.ok) throw new Error(`${res.status}`);
    const { origin, balance, debt, state } = (await res.json()) as { origin: string; balance: number; debt?: number; state?: string | null };
    serverOrigin = normalizeOrigin(origin);
    serverState = state ?? null;
    spendInvitedState();
    setServerBalance(balance, debt);
    return serverOrigin;
  });
}

export function clearWallet() {
  serverBalance = null;
  serverDebt = null;
  serverOrigin = null;
  serverState = null;
  pending = [];
  if (timer) clearTimeout(timer);
  timer = null;
  clearLoans();
}

/** "Start a new life": back to the starting money (the server limits how often). */
export function resetWallet() {
  if (serverBalance === null) return Promise.resolve();
  pending = [];
  persist();
  return serial(async () => {
    const res = await api('/api/wallet/reset', { method: 'POST' });
    const { balance, kept, origin, state } = (await res.json()) as { balance: number; kept: boolean; origin: string | null; state?: string | null };
    serverOrigin = origin === null ? null : normalizeOrigin(origin);
    serverState = state ?? null;
    setServerBalance(balance);
    if (kept) useGame.getState().toast('Your balance carries over to your new life');
  }).catch(() => {});
}

/** Every unsent event, for a closing tab's save to carry with it (net/session.ts). */
export const walletExitEvents = () => (serverBalance === null ? [] : pending);

/** Last-chance send when the tab closes and no save goes out to carry the events. */
export function flushOnExit() {
  if (serverBalance === null || !pending.length || !cachedToken) return;
  fetch('/api/wallet/events', {
    method: 'POST',
    keepalive: true,
    body: JSON.stringify({ events: pending.slice(0, 100) }),
    headers: { Authorization: `Bearer ${cachedToken}`, 'content-type': 'application/json' },
  }).catch(() => {});
}

export function startWallet() {
  // Guests: local money only. Signed in but offline: queue (persisted) until the wallet loads.
  const queue = (e: Omit<GameEvent, 'id' | 'at'>) => {
    if (!useSession.getState().user) return;
    pending.push({ id: crypto.randomUUID(), at: Date.now(), ...e });
    persist();
    if (serverBalance !== null) schedule();
  };
  moneyHooks.onChange = ({ amount, kind, ref, qty }) => {
    if (!amount) return;
    // Work pay names the shift it was for, so the server can check how long it really lasted.
    queue({ kind, ref, amount: Math.round(amount), qty, task: kind === 'work' ? taskId ?? undefined : undefined });
  };

  // Report when tasks start and stop: the server runs its own game clock from these.
  let taskId: string | null = null;
  let taskKey: string | null = null;
  const unsubTasks = useGame.subscribe((s) => {
    const t = s.task?.phase === 'doing' ? s.task : null;
    const key = t ? `${t.actionId}|${t.itemId}|${t.placeId ?? ''}|${t.total}` : null;
    if (key === taskKey) return;
    if (taskId) queue({ kind: 'task_end', amount: 0, task: taskId });
    taskId = t ? crypto.randomUUID() : null;
    taskKey = key;
    if (t) queue({ kind: 'task_start', amount: 0, task: taskId!, action: t.actionId });
  });
  const id = setInterval(() => pending.length && flushWallet(), 20_000);
  // Sending what is left when the tab closes is the session's job (net/session.ts): it goes with the save.
  return () => {
    moneyHooks.onChange = null;
    unsubTasks();
    clearInterval(id);
  };
}

/** Pick up the server balance after something changed it from outside the game (a theft, an arrest). */
export function refreshBalance() {
  if (serverBalance === null) return Promise.resolve();
  return serial(async () => {
    const res = await api('/api/wallet');
    if (!res.ok) return;
    const { balance, starter } = (await res.json()) as { balance: number; starter?: { paid: number; left: number } | null };
    setServerBalance(balance);
    starterPaid(starter);
  }).catch(() => {});
}
