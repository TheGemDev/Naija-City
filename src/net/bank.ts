import { create } from 'zustand';
import { naira, txn, useGame } from '../game/store';
import { placeNameIn, regionHere } from '../game/regions';
import { api, serial, useSession } from './session';
import { flushWalletNow, setServerBalance } from './wallet';
import { type CrewInfo, type CrewResult } from '../game/heist';

interface BankState {
  savings: number;
  heistReadyAt: number;
  /** Heist crews planning a job in the branch I'm in (mine first). */
  crews: CrewInfo[];
  loading: boolean;
  busy: boolean;
  error: string | null;
}

export const useBank = create<BankState>(() => ({
  savings: 0,
  heistReadyAt: 0,
  crews: [],
  loading: false,
  busy: false,
  error: null,
}));

interface BankResponse {
  balance: number;
  savings?: number;
  debt?: number;
  heistReadyAt?: number;
  readyAt?: number;
  success?: boolean;
  amount?: number;
  jailedUntil?: number | null;
  crews?: CrewInfo[];
  result?: CrewResult;
  error?: string;
}

async function request(path: string, init?: RequestInit) {
  const res = await api(path, init);
  const data = (await res.json().catch(() => ({}))) as BankResponse;
  if (!res.ok) throw new Error(data.error ?? `Bank request failed (${res.status})`);
  return data;
}

export async function refreshBank() {
  useBank.setState({ loading: true, error: null });
  return serial(async () => {
    try {
      const data = await request('/api/bank');
      setServerBalance(data.balance, data.debt);
      useBank.setState({ savings: data.savings ?? 0, heistReadyAt: data.heistReadyAt ?? 0, crews: data.crews ?? [] });
    } catch (e) {
      useBank.setState({ error: e instanceof Error ? e.message : 'Bank services are unavailable' });
    } finally {
      useBank.setState({ loading: false });
    }
  });
}

export function moveSavings(action: 'deposit' | 'withdraw', amount: number) {
  const game = useGame.getState();
  if (!Number.isInteger(amount) || amount < 100) return game.toast('Enter at least ₦100');
  if (useBank.getState().busy) return;
  useBank.setState({ busy: true, error: null });
  return serial(async () => {
    await flushWalletNow();
    const data = await request('/api/bank', {
      method: 'POST',
      body: JSON.stringify({ action, amount, requestId: crypto.randomUUID() }),
    });
    setServerBalance(data.balance);
    useBank.setState({ savings: data.savings ?? useBank.getState().savings });
    useGame.setState((s) => ({
      txns: [txn(s, action === 'deposit' ? `Saved at ${placeNameIn(s.destinationId, 'bank')}` : 'Withdrew from savings', action === 'deposit' ? -amount : amount), ...s.txns].slice(0, 40),
    }));
    game.toast(action === 'deposit' ? `${naira(amount)} moved into your savings` : `${naira(amount)} withdrawn from savings`);
  })
    .catch((e) => {
      const message = e instanceof Error ? e.message : 'Bank transfer failed';
      useBank.setState({ error: message });
      game.toast(message);
    })
    .finally(() => useBank.setState({ busy: false }));
}

export function repayDebt(amount: number) {
  const game = useGame.getState();
  if (!Number.isInteger(amount) || amount < 1) return game.toast('Enter a valid repayment amount');
  if (amount > game.money) return game.toast('You do not have enough cash to pay that amount');
  if (amount > game.debtOwed) return game.toast('That is more than your outstanding debt');
  if (useBank.getState().busy) return;
  useBank.setState({ busy: true, error: null });
  return serial(async () => {
    if (!useSession.getState().user) {
      const state = useGame.getState();
      if (amount > state.money || amount > state.debtOwed) throw new Error('Your cash or outstanding debt changed');
      useGame.setState((s) => ({
        money: s.money - amount,
        debtOwed: s.debtOwed - amount,
        txns: [txn(s, 'Repaid debt', -amount), ...s.txns].slice(0, 40),
      }));
    } else {
      await flushWalletNow();
      const data = await request('/api/bank', {
        method: 'POST',
        body: JSON.stringify({ action: 'repay_debt', amount, requestId: crypto.randomUUID() }),
      });
      setServerBalance(data.balance, data.debt);
      useGame.setState((s) => ({
        txns: [txn(s, 'Repaid debt', -amount), ...s.txns].slice(0, 40),
      }));
    }
    useGame.getState().toast(`${naira(amount)} debt repayment complete`);
  })
    .catch((e) => {
      const message = e instanceof Error ? e.message : 'Debt repayment failed';
      useBank.setState({ error: message });
      game.toast(message);
    })
    .finally(() => useBank.setState({ busy: false }));
}

export function attemptBankHeist() {
  const game = useGame.getState();
  if (useBank.getState().busy) return;
  useBank.setState({ busy: true, error: null });
  return serial(async () => {
    await flushWalletNow();
    const data = await request('/api/bank', {
      method: 'POST',
      body: JSON.stringify({ action: 'heist', requestId: crypto.randomUUID() }),
    });
    setServerBalance(data.balance);
    useBank.setState({ heistReadyAt: data.readyAt ?? 0 });
    if (data.success) {
      useGame.setState((s) => ({ txns: [txn(s, 'Bank robbery loot', data.amount ?? 0), ...s.txns].slice(0, 40) }));
      game.toast(`You escaped with ${naira(data.amount ?? 0)}. Keep a low profile.`);
    } else {
      if (data.jailedUntil) game.arrest(data.jailedUntil);
      game.toast(`🚨 The alarm caught you. You have been taken to ${regionHere().prison}.`);
    }
  })
    .catch((e) => {
      const message = e instanceof Error ? e.message : 'Could not attempt the bank heist';
      useBank.setState({ error: message });
      game.toast(message);
    })
    .finally(() => useBank.setState({ busy: false }));
}

/* ---------- Crew heists ---------- */

type CrewAction = 'crew_plan' | 'crew_join' | 'crew_leave' | 'crew_snitch' | 'crew_go';

/** Plan, join, leave, snitch on, or (leader) launch a crew heist. */
export function crewAction(action: CrewAction, crewId?: number) {
  const game = useGame.getState();
  if (useBank.getState().busy) return;
  useBank.setState({ busy: true, error: null });
  return serial(async () => {
    await flushWalletNow();
    const data = await request('/api/bank', { method: 'POST', body: JSON.stringify({ action, crewId }) });
    setServerBalance(data.balance);
    useBank.setState({ crews: data.crews ?? [], heistReadyAt: data.heistReadyAt ?? useBank.getState().heistReadyAt });
    if (action === 'crew_plan') game.toast('🥷🏾 Crew assembled. Get other players into the branch to join you.');
    if (action === 'crew_join') game.toast('🥷🏾 You’re in the crew. Wait for the leader to call it.');
    if (action === 'crew_leave') game.toast('🚪 You walked away from the job.');
    if (action === 'crew_snitch') game.toast('🐀 You slipped a note to the police. Nobody knows… yet.');
    if (data.result) onCrewResult(data.result);
  })
    .catch((e) => {
      const message = e instanceof Error ? e.message : 'Could not do that now';
      useBank.setState({ error: message });
      game.toast(message);
    })
    .finally(() => useBank.setState({ busy: false }));
}

/** How a crew heist went for me (as the leader, or pushed to members by the server). */
export function onCrewResult(r: CrewResult) {
  const game = useGame.getState();
  useBank.setState({ crews: [], heistReadyAt: Date.now() + 7 * 24 * 60 * 60_000 });
  if (r.snitchReward) {
    useGame.setState((s) => ({ txns: [txn(s, 'Police tip-off reward', r.snitchReward!), ...s.txns].slice(0, 40), notoriety: s.notoriety + 1 }));
    game.toast(`🐀 The police swooped on your crew. ${naira(r.snitchReward)} for your “cooperation”. Don’t let them find out.`);
  } else if (r.success) {
    useGame.setState((s) => ({ txns: [txn(s, `Crew heist cut (${r.size} robbers)`, r.share), ...s.txns].slice(0, 40), notoriety: s.notoriety + 1 }));
    game.toast(`🏦 The crew pulled it off! Your cut: ${naira(r.share)}. Scatter!`);
  } else {
    if (r.jailedUntil) game.arrest(r.jailedUntil);
    game.toast(r.betrayed ? '🐀 The police were waiting. Somebody in your crew talked. You’re in a cell.' : '🚨 The alarm went off. The whole crew is in a cell.');
  }
  void refreshBank();
}
