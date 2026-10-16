// INEC (ui/Inec.tsx): every election-fraud case, open and decided, for every player to read (worker/efcc.ts inecCases).
// Filing a fake-votes report and answering one still go through the EFCC's case API (net/efcc.ts).

import { create } from 'zustand';
import type { InecCase } from '../game/efcc';
import { api } from './session';

interface InecState {
  /** Every open election case, newest first. */
  open: InecCase[];
  /** Decided cases, newest verdict first, as many pages as have been loaded. */
  decided: InecCase[];
  /** Cursor for the next page of decided cases; null when there are no more. */
  next: string | null;
  loading: boolean;
  error: string | null;
}

export const useInec = create<InecState>(() => ({ open: [], decided: [], next: null, loading: false, error: null }));

type Page = { open: InecCase[]; decided: InecCase[]; next: string | null };

async function fetchPage(before?: string): Promise<Page> {
  const res = await api(`/api/inec/cases${before ? `?before=${encodeURIComponent(before)}` : ''}`);
  const data = (await res.json().catch(() => ({}))) as Page & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** The open cases and the first page of history. Pages already loaded below it are kept until they are reloaded. */
export async function loadInec() {
  useInec.setState({ loading: true, error: null });
  try {
    const page = await fetchPage();
    useInec.setState((s) => {
      // Keep older pages the player scrolled to, minus anything the fresh first page now covers.
      const fresh = new Set(page.decided.map((c) => c.id));
      const older = s.decided.slice(page.decided.length).filter((c) => !fresh.has(c.id));
      return { open: page.open, decided: [...page.decided, ...older], next: older.length ? s.next : page.next };
    });
  } catch (error) {
    useInec.setState({ error: error instanceof Error ? error.message : 'INEC is unavailable' });
  } finally {
    useInec.setState({ loading: false });
  }
}

/** The next page of decided cases. */
export async function loadMoreInec() {
  const { next, loading } = useInec.getState();
  if (!next || loading) return;
  useInec.setState({ loading: true, error: null });
  try {
    const page = await fetchPage(next);
    useInec.setState((s) => ({ decided: [...s.decided, ...page.decided.filter((c) => !s.decided.some((d) => d.id === c.id))], next: page.next }));
  } catch (error) {
    useInec.setState({ error: error instanceof Error ? error.message : 'INEC is unavailable' });
  } finally {
    useInec.setState({ loading: false });
  }
}
