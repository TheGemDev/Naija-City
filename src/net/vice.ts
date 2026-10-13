// Vice on the client: the Plug app's stash and market, the Fixer app's rackets / contracts / cell hustles,
// Dirty Work, being high, and being kidnapped. The server (worker/vice.ts) decides everything.

import { create } from 'zustand';
import { api, useSession } from './session';
import { setServerBalance } from './wallet';
import { loadPolice } from './crime';
import { naira, useGame } from '../game/store';
import { useApps } from '../game/apps';
import { stopDrive, useDrive } from '../game/drive';
import { driveState } from '../game/driveState';
import { AMBUSH, DUI, GOOD_BY_ID, SWEEP, viceHooks, type GoodId, type OpId } from '../game/vice';

export interface Listing { id: number; good: GoodId; qty: number; price: number; seller: string; mine: boolean; at: number }
export interface Offer { id: number; good: GoodId; qty: number; price: number; other: string; at: number }

export interface PlugState {
  now: number;
  prices: Record<GoodId, { plug: number; street: number; mult: number }>;
  stash: Record<GoodId, number>;
  highUntil: number | null;
  heldUntil: number | null;
  jailedUntil: number | null;
  listings: Listing[];
  mine: Listing[];
  offersIn: Offer[];
  offersOut: Offer[];
}

export interface RacketRow { id: number; other: string; fee: number; status: string; nextDue: number | null; paidTotal: number; strikes: number; protector?: string | null }
export interface ContractRow {
  id: number; kind: 'hit' | 'kidnap'; reward: number; ransom: number; status: string; target: string; targetUid: string;
  poster: string | null; taker: string | null; at: number; holdEnds: number | null; pledged: number; friend: boolean; mineTarget: boolean;
}
export interface StreetsState {
  score: number;
  tier: string;
  rackets: { asBoss: RacketRow[]; asPayer: RacketRow[] };
  contracts: { open: ContractRow[]; mine: ContractRow[]; taking: ContractRow[]; onMe: ContractRow[]; ransoms: ContractRow[] };
  ops: { kind: OpId; startedAt: number; readyAt: number }[];
  cell: { jailed: boolean; jailedUntil: number | null; bribeCost: number | null; breakouts: { id: number; inmate: string; price: number; mine: boolean; at: number }[] };
  fuelEvent: boolean;
}

export interface ViceMe {
  highUntil: number | null;
  heldUntil: number | null;
  ransom: { id: number; amount: number; pledged: number; endsAt: number } | null;
}

interface ViceStore {
  plug: PlugState | null;
  streets: StreetsState | null;
  me: ViceMe;
  /** A police pull-over waiting for your answer (driving high). */
  dui: { bribe: number } | null;
  busy: boolean;
  error: string | null;
}

export const useVice = create<ViceStore>(() => ({
  plug: null, streets: null, me: { highUntil: null, heldUntil: null, ransom: null }, dui: null, busy: false, error: null,
}));

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

/** Run an action: busy flag, error toast, and the balance the server hands back. */
async function act<T extends object = { balance?: number }>(path: string, body: unknown, then?: (r: T) => void): Promise<T | null> {
  useVice.setState({ busy: true, error: null });
  try {
    const r = await call<T>(path, body);
    const bal = (r as { balance?: number }).balance;
    if (bal !== undefined) setServerBalance(bal);
    then?.(r);
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not do that now';
    useVice.setState({ error: msg });
    useGame.getState().toast(msg);
    return null;
  } finally {
    useVice.setState({ busy: false });
  }
}

export const isHigh = (now = Date.now()) => {
  const until = useVice.getState().me.highUntil;
  return !!until && until > now;
};

/* ---------- Loading ---------- */

export const loadPlug = () => call<PlugState>('/api/vice').then((plug) => {
  useVice.setState((s) => ({ plug, me: { ...s.me, highUntil: plug.highUntil, heldUntil: plug.heldUntil } }));
  syncHigh(plug.highUntil);
}).catch(() => {});
export const loadStreets = () => call<StreetsState>('/api/vice/streets').then((streets) => useVice.setState({ streets })).catch(() => {});
export const loadViceMe = () => call<ViceMe>('/api/vice/me').then((me) => {
  useVice.setState({ me });
  syncHigh(me.highUntil);
  if (me.heldUntil && useGame.getState().view === 'city') stopDrive(true);
}).catch(() => {});

function syncHigh(until: number | null) {
  viceHooks.highUntil = until && until > Date.now() ? until : 0;
}

const refreshAll = () => Promise.all([loadPlug(), loadStreets(), loadViceMe()]);

/* ---------- Plug ---------- */

const chip = (txt: string) => useGame.getState().toast(txt);

export const buyGood = (good: GoodId, qty: number) =>
  act<{ got: number; ripped: boolean; price: number; stash: PlugState['stash']; balance: number }>('/api/vice/buy', { good, qty }, (r) => {
    const g = GOOD_BY_ID[good];
    chip(r.ripped ? `😤 The plug shorted you: only ${r.got} ${g.name}. ${naira(r.price)} gone.` : `${g.icon} ${r.got} ${g.name} for ${naira(r.price)}. Keep it quiet.`);
    useVice.setState((s) => (s.plug ? { plug: { ...s.plug, stash: r.stash } } : {}));
  });

export const sellGood = (good: GoodId, qty: number) =>
  act<{ sting: boolean; earned?: number; fine?: number; stash: PlugState['stash']; balance: number }>('/api/vice/sell', { good, qty }, (r) => {
    if (r.sting) {
      chip('🚨 Your “customer” was an undercover officer! You were arrested.');
      void loadPolice();
    } else chip(`${GOOD_BY_ID[good].icon} Sold for ${naira(r.earned ?? 0)}. Cash don land.`);
    useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
    void loadPlug();
  });

export const consumeGood = (good: GoodId) =>
  act<{ overdose: boolean; bill?: number; highUntil: number | null; stash: PlugState['stash']; balance: number }>('/api/vice/use', { good }, (r) => {
    if (r.overdose) {
      chip(`🚑 You passed out. The hospital bill was ${naira(r.bill ?? 0)}.`);
      useGame.setState((s) => ({ needs: { ...s.needs, energy: 8, fun: 20, hunger: Math.min(s.needs.hunger, 30) } }));
    } else {
      chip(`${GOOD_BY_ID[good].icon} You are HIGH. Everything is funny. Do not drive.`);
      useGame.setState((s) => ({ needs: { ...s.needs, fun: Math.min(100, s.needs.fun + 35), hunger: Math.max(0, s.needs.hunger - 10), energy: Math.max(0, s.needs.energy - 5) } }));
    }
    useVice.setState((s) => ({ me: { ...s.me, highUntil: r.highUntil } }));
    syncHigh(r.highUntil);
    void loadPlug();
  });

export const listGood = (good: GoodId, qty: number, price: number) =>
  act<{ ok: boolean; balance: number }>('/api/vice/list', { good, qty, price }, () => { chip('📢 Ad is live.'); void loadPlug(); });
export const cancelListing = (id: number) => act('/api/vice/cancel-listing', { id }, () => void loadPlug());
export const buyListing = (id: number) =>
  act<{ balance: number }>('/api/vice/buy-listing', { id }, () => { chip('🤝 Deal done. Stash updated.'); void loadPlug(); });
export const makeOffer = (to: string, good: GoodId, qty: number, price: number) =>
  act<{ ok: boolean }>('/api/vice/offer', { to, good, qty, price }, () => { chip('🤫 Offer sent.'); void loadPlug(); });
export const answerOffer = (id: number, accept: boolean | 'cancel') =>
  act<{ balance?: number }>('/api/vice/offer-answer', { id, accept }, () => void loadPlug());

/* ---------- Streets ---------- */

export const demandRacket = (target: string, fee: number) =>
  act<{ id: number }>('/api/vice/racket/demand', { target, fee }, () => { chip('🕴🏾 Your demand has been delivered.'); void loadStreets(); });
export const answerRacket = (id: number, choice: 'pay' | 'refuse' | 'hire', rival?: string) =>
  act<{ result?: string; balance?: number }>('/api/vice/racket/answer', { id, choice, rival }, (r) => {
    if (choice === 'hire') chip(r.result === 'won' ? '⚔️ Your gang won! You’re protected for a week.' : '⚔️ Your gang lost. Now you owe them.');
    void loadStreets();
  });
export const endRacket = (id: number) => act('/api/vice/racket/end', { id }, () => void loadStreets());
export const reportRacket = (id: number) =>
  act<{ result: string }>('/api/vice/racket/report', { id }, (r) => {
    chip(r.result === 'arrested' ? '🚔 The police actually came. The boss is in a cell.' : '🐀 The police did nothing. The boys know it was you.');
    void loadStreets();
  });

export const postContract = (kind: 'hit' | 'kidnap', target: string, reward: number, ransom?: number) =>
  act<{ id: number }>('/api/vice/contract/post', { kind, target, reward, ransom }, () => { chip('📜 Contract posted. Money held until the job is done.'); void loadStreets(); });
export const cancelContract = (id: number) => act('/api/vice/contract/cancel', { id }, () => void loadStreets());
export const takeContract = (id: number) => act('/api/vice/contract/take', { id }, () => { chip('📜 Job taken. Find your target and strike.'); void loadStreets(); });
export const dropContract = (id: number) => act('/api/vice/contract/drop', { id }, () => void loadStreets());
export const strikeContract = (id: number) =>
  act<{ result: string; pay?: number }>('/api/vice/contract/strike', { id }, (r) => {
    if (r.result === 'done') chip(`🥊 Job done. ${naira(r.pay ?? 0)} in your pocket.`);
    else if (r.result === 'held') chip(`🪢 Target snatched. ${naira(r.pay ?? 0)} paid; the ransom is up to their friends.`);
    else if (r.result === 'arrested') { chip('🚔 The job went wrong and the police grabbed you.'); void loadPolice(); }
    else chip('💨 They got away. The contract is back on the board.');
    useGame.setState((s) => ({ notoriety: s.notoriety + 3 }));
    void loadStreets();
  });
export const pledgeRansom = (id: number, amount: number) =>
  act<{ result: string }>('/api/vice/contract/pledge', { id, amount }, (r) => {
    chip(r.result === 'paid' ? '🕊️ Ransom met. They are free!' : '🙏🏾 You chipped in.');
    void refreshAll();
  });
export const struggle = () =>
  act<{ result: string }>('/api/vice/contract/struggle', {}, (r) => {
    chip(r.result === 'escaped' ? '🏃🏾 You slipped the ropes and ran. FREE!' : '😖 The knots held. Try again in a few minutes.');
    void loadViceMe();
  });
export const rescue = (id: number) =>
  act<{ result: string }>('/api/vice/contract/rescue', { id }, (r) => {
    chip(r.result === 'rescued' ? '🦸🏾 Hostage rescued, kidnapper arrested. Bonus paid.' : '🔫 The raid failed. The kidnappers moved.');
    void loadStreets();
  });

export const startOp = (kind: OpId) => act('/api/vice/op/start', { kind }, () => { chip('🛠️ Operation started.'); void loadStreets(); });
export const collectOp = (kind: OpId) =>
  act<{ busted: boolean; pay?: number; fine?: number }>('/api/vice/op/collect', { kind }, (r) => {
    if (r.busted) { chip(`🚨 BUSTED! ${naira(r.fine ?? 0)} fine and a night in the cell.`); void loadPolice(); }
    else chip(`💰 Collected ${naira(r.pay ?? 0)}. Don’t spend it all in one place.`);
    useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
    void loadStreets();
  });

export const bribeGuard = () =>
  act<{ result: 'cut' | 'snitched'; fine?: number }>('/api/vice/cell/bribe', {}, (r) => {
    chip(r.result === 'cut' ? '🔑 The guard “forgot” to lock a few hours of your sentence.' : `😡 The guard snitched. ${naira(r.fine ?? 0)} fine and more time.`);
    void Promise.all([loadPolice(), loadStreets()]);
  });
export const sellInside = (good: GoodId, qty: number) =>
  act<{ result: string; earned?: number }>('/api/vice/cell/sell', { good, qty }, (r) => {
    chip(r.result === 'sold' ? `${GOOD_BY_ID[good].icon} Inmates paid ${naira(r.earned ?? 0)}.` : '🔦 A guard caught you dealing. Stash gone, more time.');
    void Promise.all([loadPolice(), loadPlug()]);
  });
export const postBreakout = (price: number) => act('/api/vice/breakout/post', { price }, () => { chip('📞 Word is out: pay for a jailbreak.'); void loadStreets(); });
export const cancelBreakout = (id: number) => act('/api/vice/breakout/cancel', { id }, () => void loadStreets());
export const assistBreakout = (id: number) =>
  act<{ result: 'freed' | 'caught'; paid?: number }>('/api/vice/breakout/assist', { id }, (r) => {
    chip(r.result === 'freed' ? `🏃🏾 JAILBREAK! They paid you ${naira(r.paid ?? 0)}.` : '🚔 You got caught and joined them inside.');
    void Promise.all([loadPolice(), loadStreets()]);
  });

/* ---------- Driving high ---------- */

let dueAt = 0;
let checking = false;

/** Called from the driving loop. While high, the police may flag you down. */
export function checkDui() {
  if (checking || useVice.getState().dui || !viceHooks.highUntil || viceHooks.highUntil < Date.now()) return;
  if (Date.now() < dueAt) return;
  dueAt = Date.now() + DUI.everyMs;
  checking = true;
  call<{ stop: boolean; bribe?: number }>('/api/vice/dui', {})
    .then((r) => { if (r.stop) useVice.setState({ dui: { bribe: r.bribe ?? DUI.bribe } }); })
    .catch(() => {})
    .finally(() => { checking = false; });
}

export async function answerDui(choice: 'bribe' | 'flee' | 'submit') {
  useVice.setState({ busy: true });
  try {
    const r = await call<{ result: 'bribed' | 'fled' | 'arrested'; fine?: number; bribeLost?: boolean; balance?: number }>('/api/vice/dui', { choice });
    if (r.balance !== undefined) setServerBalance(r.balance);
    useVice.setState({ dui: null });
    const g = useGame.getState();
    if (r.result === 'bribed') g.toast('💵 He pocketed it. “Drive carefully, chairman.”');
    else if (r.result === 'fled') { g.toast('💨 You floored it. They lost you at Kawo roundabout!'); useGame.setState((s) => ({ notoriety: s.notoriety + 2 })); }
    else {
      g.toast(r.bribeLost ? '🚓 Bribe attempt AND driving high. Straight to the cell.' : `🚓 Arrested for driving high. ${naira(r.fine ?? 0)} fine.`);
      stopDrive(true);
      void loadPolice();
    }
  } catch (e) {
    useVice.setState({ dui: null });
    useGame.getState().toast(e instanceof Error ? e.message : 'The officer lost interest');
  } finally {
    useVice.setState({ busy: false });
  }
}

/* ---------- Server pushes ---------- */

export interface ViceEvent { t: 'vice'; kind: string; text: string; until?: number; contract?: number; ransom?: number; bill?: number }

export function onViceEvent(e: ViceEvent) {
  const g = useGame.getState();
  g.toast(e.text);
  if (e.kind === 'hurt') {
    useGame.setState((s) => ({ needs: { ...s.needs, energy: Math.max(5, s.needs.energy - 40), fun: Math.max(0, s.needs.fun - 30) } }));
    stopDrive(true);
  } else if (e.kind === 'held') {
    useVice.setState((s) => ({ me: { ...s.me, heldUntil: e.until ?? null } }));
    stopDrive(true);
  }
  if (e.kind === 'held' || e.kind === 'released' || e.kind === 'ransom') void loadViceMe();
  if (e.kind === 'released') void applySeizures();
  void Promise.all([loadStreets(), loadPlug()]);
}

/** Apply (once) whatever kidnappers took when a ransom ran out, then tell the server it's done. */
let applying = false;
async function applySeizures() {
  if (applying) return;
  applying = true;
  try {
    const { seizures } = await call<{ seizures: { id: number; carId: string | null; forfeited: number }[] }>('/api/vice/seizures');
    for (const z of seizures) {
      useGame.getState().seize(z.carId);
      await call('/api/vice/seizures/ack', { id: z.id });
    }
  } catch {
    /* offline: try again on the next tick */
  } finally {
    applying = false;
  }
}

/**
 * The search before a ticketed flight: NDLEA finds whatever is in your stash. Resolves true if you were
 * arrested. Guests carry nothing, and a failed call lets you board rather than strand you at the gate.
 */
async function airportSearch(): Promise<boolean> {
  if (!useSession.getState().user?.username) return false;
  try {
    const r = await call<{ caught: boolean; qty?: number; fine?: number }>('/api/vice/flight', {});
    if (!r.caught) return false;
    chip(`🚨 NDLEA found ${r.qty} wrap${r.qty === 1 ? '' : 's'} in your bag at the gate. ${naira(r.fine ?? 0)} fine, and you are not flying anywhere.`);
    useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
    void Promise.all([loadPolice(), loadPlug()]);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Background: high effect, kidnap screen, police sweeps ---------- */

const FALLBACK_CHECK_MS = 3 * 60_000;

export function startVice() {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSweep = 0;
  let lastCheck = 0;
  const signedIn = () => !!useSession.getState().user?.username && useGame.getState().started;
  const tick = () => {
    if (!signedIn()) return;
    // Kidnaps, releases and seizures arrive over the live socket (onViceEvent). Asking is for the ransom screen
    // while held, and otherwise a slow fallback in case an event was missed while the socket was down.
    if (useVice.getState().me.heldUntil || Date.now() - lastCheck >= FALLBACK_CHECK_MS) {
      lastCheck = Date.now();
      void loadViceMe();
      void applySeizures();
    }
    const hasApp = useApps.getState().installed.includes('plug');
    const stash = useVice.getState().plug?.stash;
    const carrying = stash ? Object.values(stash).some((n) => n > 0) : false;
    if ((hasApp || carrying) && Date.now() - lastSweep >= SWEEP.everyMs) {
      lastSweep = Date.now();
      call<{ caught: boolean }>('/api/vice/sweep', {}).then((r) => {
        if (r.caught) { void loadPolice(); void loadPlug(); }
      }).catch(() => {});
    }
  };
  const sub = useSession.subscribe(() => { if (signedIn() && !timer) { void loadPlug(); tick(); } });
  timer = setInterval(tick, 20_000);
  tick();
  // Out on the road, the server now and then rolls for a random snatch (rare; it enforces its own gap and cooldown).
  const roadWatch = setInterval(() => {
    const g = useGame.getState();
    if (!signedIn() || g.view !== 'city' || g.heldUntil || g.jailedUntil) return;
    call<{ result: string }>('/api/vice/ambush', { mode: useDrive.getState().vehicle ? 'drive' : 'walk', carId: driveState.vehicle === 'car' ? driveState.carId : null })
      .then((r) => { if (r.result === 'held') void loadViceMe(); })
      .catch(() => {});
  }, AMBUSH.everyMs);
  viceHooks.onDriveTick = checkDui;
  viceHooks.onBoard = airportSearch;
  const effect = setInterval(() => {
    const on = isHigh();
    document.body.classList.toggle('high', on);
    if (!on && viceHooks.highUntil) viceHooks.highUntil = 0;
  }, 1500);
  return () => {
    sub();
    if (timer) clearInterval(timer);
    clearInterval(roadWatch);
    clearInterval(effect);
    viceHooks.onDriveTick = null;
    viceHooks.onBoard = null;
    document.body.classList.remove('high');
  };
}
