// Bank loans on the client (server: worker/loans.ts, rules: src/game/loans.ts).

import { create } from 'zustand';
import { api } from './session';
import { setServerBalance } from './wallet';
import { naira, useGame } from '../game/store';
import type { LoanSnapshot } from '../game/loans';

interface LoanState {
  data: LoanSnapshot | null;
  busy: boolean;
  error: string | null;
}

export const useLoans = create<LoanState>(() => ({ data: null, busy: false, error: null }));

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

/** Keep the snapshot, and what is owed where the net balance and net worth read it. */
function setData(data: LoanSnapshot | null) {
  useLoans.setState({ data });
  useGame.setState({ bankLoanOwed: data?.owed ?? 0 });
}

export const loadLoans = () => call<LoanSnapshot>('/api/loans').then(setData).catch(() => {});

export const clearLoans = () => setData(null);

async function act<T extends { snapshot: LoanSnapshot; balance: number }>(path: string, body: unknown, then: (r: T) => void) {
  useLoans.setState({ busy: true, error: null });
  try {
    const r = await call<T>(path, body);
    setData(r.snapshot);
    setServerBalance(r.balance);
    then(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not do that now';
    useLoans.setState({ error: msg });
    useGame.getState().toast(msg);
  } finally {
    useLoans.setState({ busy: false });
  }
}

export const takeLoan = (amount: number) =>
  act<{ snapshot: LoanSnapshot; balance: number; received: number; fee: number }>('/api/loans/take', { amount }, (r) =>
    useGame.getState().toast(`🏦 Loan approved: ${naira(r.received)} in your account (${naira(r.fee)} fee).`));

export const repayLoan = (id: number, amount: number) =>
  act<{ snapshot: LoanSnapshot; balance: number; paid: number; cleared: boolean }>('/api/loans/repay', { id, amount }, (r) =>
    useGame.getState().toast(r.cleared ? `✅ Loan cleared. You paid ${naira(r.paid)}.` : `💸 You paid ${naira(r.paid)} towards your loan.`));
