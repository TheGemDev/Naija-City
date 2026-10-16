// Guns on the phone (rules: game/guns.ts, server: worker/guns.ts): what I carry, buying from the gun shop or the
// Fixer's dealer, and the armed jobs. Being shot arrives as a 'shot' event (onShotEvent).

import { create } from 'zustand';
import { GUNS, type GunId, type GunResult, type GunState, type HoldupKind, type ShotEvent } from '../game/guns';
import { injury } from '../game/injury';
import { naira, useGame } from '../game/store';
import { loadPolice } from './crime';
import { api, serial, useSession } from './session';
import { flushWalletNow, refreshBalance, setServerBalance } from './wallet';

interface GunsStore {
  state: GunState | null;
  busy: boolean;
}

export const useGuns = create<GunsStore>(() => ({ state: null, busy: false }));

async function call<T>(path: string, body?: object): Promise<T> {
  const res = await api(path, { signal: AbortSignal.timeout(20_000), ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function loadGuns() {
  if (!useSession.getState().user?.username) return;
  try {
    const state = await call<GunState>('/api/guns');
    useGuns.setState({ state });
    if (state.seized) useGame.getState().toast(`🚔 The police kept your ${state.seized} when they arrested you. It had no licence.`);
  } catch {
    /* offline: the app shows what it last knew */
  }
}

/** Run one gun action: busy flag, wallet first (the server works from the balance), then whatever it says. */
function act(path: string, body: object, then?: (r: { result?: GunResult }) => void) {
  const g = useGame.getState();
  if (!useSession.getState().user?.username) return g.toast('Sign in first.');
  if (useGuns.getState().busy) return;
  useGuns.setState({ busy: true });
  return serial(async () => {
    await flushWalletNow();
    const r = await call<{ state: GunState; balance: number; result?: GunResult }>(path, body);
    setServerBalance(r.balance);
    useGuns.setState({ state: r.state });
    then?.(r);
  })
    .catch((e) => g.toast(e instanceof Error ? e.message : 'Could not do that now'))
    .finally(() => useGuns.setState({ busy: false }));
}

export const buyGun = (gun: GunId, source: 'shop' | 'black') =>
  act('/api/guns/buy', { gun, source }, () => useGame.getState().toast(`${GUNS[gun].icon} The ${GUNS[gun].name} is yours${source === 'shop' ? ', licensed and on the police register' : '. No papers, no questions'}.`));
export const buyAmmo = (source: 'shop' | 'black') => act('/api/guns/ammo', { source }, () => useGame.getState().toast('📦 A box of rounds. Loaded.'));
export const buyVest = () => act('/api/guns/vest', {}, () => useGame.getState().toast('🦺 Vest on. It stops a bullet or two.'));
export const hireEscort = () => act('/api/guns/escort', {}, () => useGame.getState().toast('🕶️ Your armed bodyguard is walking behind you.'));

/** I was hit: hurt, a hospital bill, and I wake up in the hospital. */
function iWasHit(until: number | null | undefined) {
  if (!until) return;
  injury.until = until;
  useGame.getState().hospitalize();
}

/** What happened when I pulled the gun, in a toast. */
function sayResult(r: GunResult, who: string | null) {
  const g = useGame.getState();
  const them = who ? `@${who}` : 'them';
  const police = r.wanted ? ' The police are after you now.' : '';
  const hit = r.hurtUntil ? ` You were hit: ${naira(r.bill ?? 0)} at the hospital.` : '';
  const lines: Record<GunResult['outcome'], string> = {
    robbed: who ? `🔫 ${them} handed over ${naira(r.amount)}.${police}` : `🔫 You got away with ${naira(r.amount)}.`,
    empty: `🔫 ${them} had nothing on them.${police}`,
    shot: `💥 You shot ${them}.${r.amount ? ` You grabbed ${naira(r.amount)} as they went down.` : ''}${police}`,
    missed: `💨 You missed ${them}. Everybody heard it.${police}`,
    vest: `🦺 You hit ${them}, but their vest stopped it.${police}`,
    escort: `🕶️ ${them}’s armed bodyguard was on you before you could move.${hit || ' You ran.'}${police}`,
    shotBack: who ? `🔫 ${them} was carrying too, and drew first.${hit || ' You ran for your life.'}${police}` : `🏪 The shopkeeper had a gun under the counter.${hit}`,
    arrested: '🚔 A police patrol was round the corner. Straight to the cell.',
    failed: who ? `🏃🏾 ${them} ran off before you could do anything.${police}` : '🏃🏾 They ran off screaming. You got nothing.',
  };
  g.toast(lines[r.outcome]);
  if (r.amount > 0) useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
  iWasHit(r.hurtUntil);
  if (r.wanted || r.jailedUntil) void loadPolice();
}

export const robAtGunpoint = (target: string, username: string) => act('/api/guns/rob', { target }, (r) => r.result && sayResult(r.result, username));
export const shootPlayer = (target: string, username: string) => act('/api/guns/shoot', { target }, (r) => r.result && sayResult(r.result, username));
export const holdUp = (kind: HoldupKind) => act('/api/guns/holdup', { kind }, (r) => r.result && sayResult(r.result, null));

/** Somebody shot me (worker/guns.ts). */
export function onShotEvent(e: ShotEvent) {
  const g = useGame.getState();
  if (e.vest) {
    g.toast(`🦺 @${e.by} shot you. Your vest stopped it. Report them in the Police app.`);
    void loadGuns();
    return;
  }
  g.toast(`🚑 @${e.by} shot you with a ${GUNS[e.gun]?.name.toLowerCase() ?? 'gun'}. You woke up in hospital: ${naira(e.bill)} bill${e.took ? `, and they took ${naira(e.took)} off you` : ''}. Report them in the Police app.`);
  iWasHit(e.until);
  void refreshBalance();
  void loadPolice();
}
