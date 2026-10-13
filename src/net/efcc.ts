import { create } from 'zustand';
import { EFCC, type EfccCase } from '../game/efcc';
import { STAGES } from '../game/property';
import { naira, useGame } from '../game/store';
import { api, serial, useSession } from './session';
import { setServerBalance } from './wallet';
import { flushWalletNow } from './wallet';

interface EfccState {
  cases: EfccCase[];
  loading: boolean;
  busy: boolean;
  error: string | null;
}

export const useEfcc = create<EfccState>(() => ({ cases: [], loading: false, busy: false, error: null }));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function loadEfcc() {
  useEfcc.setState({ loading: true, error: null });
  try {
    const data = await call<{ cases: EfccCase[] }>('/api/efcc');
    useEfcc.setState({ cases: data.cases });
    const uid = useSession.getState().user?.uid;
    if (uid) {
      const updates = data.cases.filter((item) => item.targetUid === uid && item.seizedProperty);
      if (updates.length) {
        useGame.setState((state) => {
          let properties = state.properties;
          let items = state.items;
          let inventory = state.furnitureInventory;
          let homePropertyId = state.homePropertyId;
          let activeHouseId = state.activeHouseId;
          for (const item of updates) {
            const seized = item.seizedProperty!;
            if (!seized.boughtBack) {
              const property = properties.find((p) => p.id === seized.id);
              if (!property) continue;
              properties = properties.filter((p) => p.id !== seized.id);
              const fallback = properties.find((p) => p.stage >= STAGES.length) ?? null;
              if (homePropertyId === seized.id) homePropertyId = fallback?.id ?? null;
              if (activeHouseId === seized.id) {
                activeHouseId = fallback?.id ?? null;
                items = fallback?.items ?? [];
                inventory = [...inventory, ...(property.items ?? [])];
              }
            } else if (seized.property && !properties.some((p) => p.id === seized.id)) {
              properties = [...properties, seized.property];
              if (!homePropertyId) homePropertyId = seized.id;
            }
          }
          return { properties, items, furnitureInventory: inventory, homePropertyId, activeHouseId };
        });
      }
    }
  } catch (error) {
    useEfcc.setState({ error: error instanceof Error ? error.message : 'EFCC service is unavailable' });
  } finally {
    useEfcc.setState({ loading: false });
  }
}

async function perform(path: string, body?: object): Promise<boolean> {
  const state = useEfcc.getState();
  if (state.busy) return false;
  useEfcc.setState({ busy: true, error: null });
  try {
    const result = await serial(() =>
      (async () => {
        await flushWalletNow();
        return call<{ balance: number }>(path, body ? { method: 'POST', body: JSON.stringify(body) } : { method: 'POST' });
      })(),
    );
    setServerBalance(result.balance);
    useGame.getState().toast(`EFCC record updated · balance ${naira(result.balance)}`);
    await loadEfcc();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'EFCC request failed';
    useEfcc.setState({ error: message });
    useGame.getState().toast(message);
    return false;
  } finally {
    useEfcc.setState({ busy: false });
  }
}

const filingIds = new Map<string, string>();

export async function fileEfccCase(target: string) {
  const key = target.trim().toLowerCase();
  const requestId = filingIds.get(key) ?? crypto.randomUUID();
  filingIds.set(key, requestId);
  if (await perform('/api/efcc/cases', { target, requestId })) filingIds.delete(key);
}

export async function respondEfccCase(id: string, statement: string) {
  await perform(`/api/efcc/cases/${encodeURIComponent(id)}/response`, { statement });
}

export async function bribeEfccCase(id: string) {
  await perform(`/api/efcc/cases/${encodeURIComponent(id)}/bribe`);
}

export async function revealEfccAccuser(id: string) {
  await perform(`/api/efcc/cases/${encodeURIComponent(id)}/reveal`);
}

export async function buyBackEfccProperty(id: string) {
  await perform(`/api/efcc/cases/${encodeURIComponent(id)}/buyback`);
}

export { EFCC };
