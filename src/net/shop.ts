// Real-money naira packs on the client (server side: worker/shop.ts, payments by Bachs).

import { create } from 'zustand';
import type { Pack } from '../game/shop';
import { naira, useGame } from '../game/store';
import { api, useSession } from './session';
import { refreshBalance, setServerBalance } from './wallet';

export interface Order { id: string; pack_id: string; price: number; naira: number; status: 'pending' | 'paid'; created_at: number }
interface Shop { packs: Pack[]; orders: Order[]; enabled: boolean; busy: boolean }

export const useShop = create<Shop>(() => ({ packs: [], orders: [], enabled: false, busy: false }));

const toast = (t: string) => useGame.getState().toast(t);

export async function loadShop() {
  try {
    const res = await api('/api/shop');
    if (!res.ok) return null;
    const d = (await res.json()) as { packs: Pack[]; orders: Order[]; enabled: boolean; balance: number };
    useShop.setState({ packs: d.packs, orders: d.orders, enabled: d.enabled });
    return d;
  } catch {
    return null;
  }
}

export async function buyPack(pack: string) {
  useShop.setState({ busy: true });
  try {
    const res = await api('/api/shop/checkout', { method: 'POST', body: JSON.stringify({ pack }) });
    const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !d.url) {
      toast(d.error ?? 'Could not start checkout');
      return;
    }
    window.location.href = d.url;
  } catch {
    toast('No connection');
  } finally {
    useShop.setState({ busy: false });
  }
}

/** Back from the Bachs checkout: the webhook credits the wallet, so poll for it briefly. */
async function watchReturn(orderId: string) {
  for (let i = 0; i < 20; i++) {
    const d = await loadShop();
    const o = d?.orders.find((x) => x.id === orderId);
    if (o?.status === 'paid') {
      if (d) setServerBalance(d.balance);
      else refreshBalance();
      toast(`Payment received! +${naira(o.naira)} 💰`);
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  toast('Still confirming your payment. Your naira will arrive shortly.');
}

export function startShop() {
  const params = new URLSearchParams(window.location.search);
  const paid = params.get('paid');
  if (!paid) return;
  history.replaceState(null, '', window.location.pathname);
  if (paid === 'cancelled') return;
  const stop = useSession.subscribe((s) => {
    if (s.user) {
      stop();
      void watchReturn(paid);
    }
  });
  if (useSession.getState().user) { stop(); void watchReturn(paid); }
}
