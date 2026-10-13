// Stealing from other players and reporting thieves to the police (worker/crime.ts decides everything:
// whether you're close enough, whether you got away with it, how much moved).

import { create } from 'zustand';
import { ITEMS } from '../game/catalog';
import {
  ACCUSE, CATCH, CATCHERS, DEFAULT_LAWS, POLICE, PROTECTION, unsolved,
  type CrimeKind, type CrimeLaws, type CrimeReport, type Prisoner, type Protection, type ProtectionKind, type WantedPerson,
} from '../game/crime';
import { naira, useGame } from '../game/store';
import { regionHere } from '../game/regions';
import { startCaughtScene, useCaught } from '../game/caughtScenes';
import { useVisit } from '../game/visits';
import { injury } from '../game/injury';
import { leaveHouseVisit } from './visit';
import { api, serial, useSession } from './session';
import { revokeHomeVisit } from './social';
import { flushWalletNow, refreshBalance, setServerBalance, walletPending } from './wallet';

interface PoliceState {
  /** Thefts against me. */
  against: CrimeReport[];
  /** Thefts I committed. */
  by: CrimeReport[];
  /** In a police cell until this time (ms), or null. */
  jailedUntil: number | null;
  /** What I'm in the cell for, one line per offence (the server keeps the sheet). */
  jailCharge: string[];
  laws: CrimeLaws;
  /** Most-wanted board (officers also see where each suspect is). */
  wanted: WantedPerson[];
  /** Everyone sitting in a cell right now. */
  custody: Prisoner[];
  /** The bodyguard and gateman I'm paying for: when each runs out. */
  protection: Protection;
  loading: boolean;
  busy: boolean;
  error: string | null;
}

export const usePolice = create<PoliceState>(() => ({
  against: [],
  by: [],
  jailedUntil: null,
  jailCharge: [],
  laws: DEFAULT_LAWS,
  wanted: [],
  custody: [],
  protection: { bodyguard: null, gateman: null },
  loading: false,
  busy: false,
  error: null,
}));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // A request that never answers must not leave the police buttons greyed out forever.
  const res = await api(path, { signal: AbortSignal.timeout(20_000), ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** A theft against me that just happened and I know who did it: ui/RobbedCard.tsx offers to report them on the spot. */
export const useRobbed = create<{ crime: CrimeReport | null }>(() => ({ crime: null }));

/** Report the thief and, if asked, put a bounty on them in one go. */
export async function payback(crime: CrimeReport, bounty: number) {
  if (crime.status === 'open') await fileReport(crime.id);
  const now = usePolice.getState().against.find((c) => c.id === crime.id);
  if (bounty > 0 && now?.status === 'wanted') await postBounty(crime.id, bounty);
}

/** A burglar in my house right now (I'm home), who I can beat or hand to the police. */
export const useIntruder = create<{ intruder: { thief: string; username: string; until: number } | null; busy: boolean }>(() => ({ intruder: null, busy: false }));

/** Deal with the intruder: beat them and let them go (loot back, some cash, they're injured), or call the police. */
export function catchIntruder(action: 'beat' | 'police') {
  const g = useGame.getState();
  const { intruder, busy } = useIntruder.getState();
  if (!intruder || busy) return;
  useIntruder.setState({ busy: true });
  return call<{ items: string[]; ids: number[]; amount: number }>('/api/break-in/catch', {
    method: 'POST',
    body: JSON.stringify({ thief: intruder.thief, action }),
  })
    .then((r) => {
      // The server put the stolen things back in the cloud save; match it here.
      r.items.forEach((type, i) => useGame.setState((s) => ({ furnitureInventory: [...s.furnitureInventory, { id: `recovered-${r.ids[i]}`, type, x: 0, z: 0, rot: 0 }] })));
      if (r.amount) addTxn(r.amount, `Compensation from @${intruder.username}`);
      void refreshBalance();
      void loadPolice();
      const back = r.items.length ? ` ${r.items.map((t) => itemName(t)).join(', ')} back in your storage.` : '';
      g.toast(action === 'beat'
        ? `👊🏾 You gave @${intruder.username} a proper beating and chased them out.${r.amount ? ` They paid ${naira(r.amount)}.` : ''}${back}`
        : `🚔 You handed @${intruder.username} to the police.${back}`);
      useIntruder.setState({ intruder: null });
    })
    .catch((e) => {
      g.toast(e instanceof Error ? e.message : 'Could not catch them');
      useIntruder.setState({ intruder: null });
    })
    .finally(() => useIntruder.setState({ busy: false }));
}

const itemName = (type: string | null) => (type ? ITEMS[type]?.name ?? type : null);

const SEEN_KEY = 'kaduna-burglary-seen';

/** Tell me once about burglaries that happened while I was away (live ones are toasted as they happen). */
function announceBurglaries(against: CrimeReport[]) {
  let seen = 0;
  try {
    seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    /* storage blocked */
  }
  const fresh = against.filter((c) => c.id > seen && unsolved(c) && c.status === 'open' && !c.accused);
  if (fresh.length) {
    const items = fresh.map((c) => itemName(c.item)).filter(Boolean);
    useGame.getState().toast(
      `🏚️ Your house was broken into while you were out${items.length ? `: your ${items.join(', ')} ${items.length > 1 ? 'were' : 'was'} stolen` : ''}. Accuse up to ${ACCUSE.max} suspects in the Police app 🚔`,
    );
  }
  markSeen(against);
}

function markSeen(against: CrimeReport[]) {
  const top = Math.max(0, ...against.map((c) => c.id));
  try {
    if (top > (Number(localStorage.getItem(SEEN_KEY)) || 0)) localStorage.setItem(SEEN_KEY, String(top));
  } catch {
    /* storage blocked */
  }
}

/** A stolen item came back: put it in storage (the server already did the same in the cloud save). */
function takeBack(c: CrimeReport) {
  if (!c.item) return;
  const prev = usePolice.getState().against.find((x) => x.id === c.id);
  if (prev?.recovered) return;
  useGame.setState((s) => ({ furnitureInventory: [...s.furnitureInventory, { id: `recovered-${c.id}`, type: c.item!, x: 0, z: 0, rot: 0 }] }));
}

function addTxn(amount: number, label: string) {
  useGame.setState((s) => ({ txns: [{ at: s.minutes, label, amount }, ...s.txns].slice(0, 40) }));
}

export async function loadPolice() {
  if (!useSession.getState().user) return;
  usePolice.setState({ loading: true, error: null });
  const startedAt = Date.now();
  try {
    const d = await call<{ against: CrimeReport[]; by: CrimeReport[]; jailedUntil: number | null; jailCharge?: string[]; injuredUntil?: number | null; laws: CrimeLaws; wanted: WantedPerson[]; custody: Prisoner[]; protection: Protection }>('/api/police');
    announceBurglaries(d.against);
    injury.until = d.injuredUntil ?? 0;
    usePolice.setState({ against: d.against, by: d.by, jailedUntil: d.jailedUntil, jailCharge: d.jailCharge ?? [], laws: d.laws, wanted: d.wanted, custody: d.custody, protection: d.protection });
    // Asked before I paid bail: the answer still says I'm in a cell, and must not lock me up again.
    if (bailedAt < startedAt) syncJail(d.jailedUntil);
    else usePolice.setState({ jailedUntil: null, jailCharge: [] });
  } catch (e) {
    usePolice.setState({ error: e instanceof Error ? e.message : 'Police service is unavailable' });
  } finally {
    usePolice.setState({ loading: false });
  }
}

/** Try to rob a player: pickpocket someone next to you, or break into their house (estate plot slot). */
export function steal(target: string, username: string, kind: CrimeKind, slot?: number) {
  const g = useGame.getState();
  if (!useSession.getState().user?.username) return g.toast('Sign in to play with other players.');
  if (usePolice.getState().busy) return;
  usePolice.setState({ busy: true });
  return serial(async () => {
    // The server works from the wallet balance, so queued money must land first.
    await flushWalletNow();
    const { crime, balance, soap } = await call<{ crime: CrimeReport; balance: number; soap?: boolean }>('/api/steal', {
      method: 'POST',
      body: JSON.stringify({ target, kind, slot }),
    });
    setServerBalance(balance);
    usePolice.setState((s) => ({ by: [crime, ...s.by] }));
    if (soap) g.toast('🧼 Baba’s soap is working. Nobody saw anything.');
    if (!crime.success) {
      if (crime.guard) {
        g.toast(crime.guard === 'bodyguard'
          ? `💪🏾 @${username}'s bodyguard grabbed you! You're WANTED now.`
          : `🔦 @${username}'s mai-gadi caught you at the fence! You're WANTED now.`);
      } else g.toast(`🚨 @${username} caught you trying! They can report you to the police.`);
      useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
      return;
    }
    useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
    if (crime.amount) addTxn(crime.amount, kind === 'burglary' ? `Burgled @${username}` : `Pickpocketed @${username}`);
    const loot = itemName(crime.item);
    if (kind === 'burglary') {
      g.toast(crime.amount || loot ? `🥷 You broke into @${username}'s house: ${naira(crime.amount)}${loot ? ` incl. their ${loot}, sold on` : ''}` : `🥷 @${username}'s house had nothing worth taking`);
    } else {
      g.toast(crime.amount ? `🤏 You lifted ${naira(crime.amount)} from @${username}` : `🤏 @${username}'s pockets were empty`);
    }
  })
    .catch((e) => g.toast(e instanceof Error ? e.message : 'Could not do that now'))
    .finally(() => usePolice.setState({ busy: false }));
}

/** Arrested mid-visit: close the owner's door behind you (the game itself drops the visit). */
function dropVisit() {
  if (useVisit.getState().current) void revokeHomeVisit().catch(() => {});
}

/** Lock the game in the prison while the server says so, and let it out when it doesn't. */
function syncJail(until: number | null) {
  const g = useGame.getState();
  if (useCaught.getState().active) return; // the caught scene plays first; it applies the arrest when it ends
  if (until && until > Date.now()) {
    if (g.jailedUntil !== until || g.insideId !== 'prison' || useVisit.getState().current) { dropVisit(); g.arrest(until); }
  } else if (g.jailedUntil || (g.view === 'place' && g.insideId === 'prison')) {
    g.release();
  }
}

/** My open warrants: when the NPC police will come for me if no officer does first. */
export function myManhunt(by: CrimeReport[]) {
  const open = by.filter((c) => c.status === 'wanted' && c.reportedAt);
  if (!open.length) return null;
  return { cases: open.length, autoAt: Math.min(...open.map((c) => c.reportedAt!)) + POLICE.manhuntMs };
}

/** Name up to ACCUSE.max suspects for a burglary nobody saw. Right: the item comes back and they're arrested. */
export function accuseSuspects(id: number, names: string[]) {
  if (usePolice.getState().busy) return;
  usePolice.setState({ busy: true, error: null });
  return serial(async () => {
    // others: the rest of what the same burglar took from me, solved by the same arrest.
    const { crime, others = [], caught, balance } = await call<{ crime: CrimeReport; others?: CrimeReport[]; caught: boolean; balance: number }>(`/api/police/accuse/${id}`, {
      method: 'POST',
      body: JSON.stringify({ usernames: names }),
    });
    const g = useGame.getState();
    const solved = [crime, ...others];
    if (caught) {
      for (const c of solved) {
        if (c.recovered) takeBack(c);
        if (c.returned) addTxn(c.returned, `Recovered from @${c.thief}`);
      }
      setServerBalance(balance);
      const items = solved.filter((c) => c.recovered).map((c) => itemName(c.item)).filter(Boolean);
      g.toast(`🕵🏾 It was @${crime.thief}! The police arrested them${items.length ? ` and your ${items.join(', ')} ${items.length > 1 ? 'are' : 'is'} back in storage` : ''}.`);
    } else {
      g.toast('🤷🏾 None of them did it. The police cleared your suspects and the case has gone cold.');
    }
    usePolice.setState((s) => ({ against: s.against.map((c) => solved.find((x) => x.id === c.id) ?? c) }));
  })
    .catch((e) => usePolice.setState({ error: e instanceof Error ? e.message : 'Could not make the accusation' }))
    .finally(() => usePolice.setState({ busy: false }));
}

/** Report a theft: a warrant goes out, and the police (players or NPCs) go after the thief. */
export function fileReport(id: number) {
  if (usePolice.getState().busy) return;
  usePolice.setState({ busy: true, error: null });
  return serial(async () => {
    const { crime } = await call<{ crime: CrimeReport; balance: number }>(`/api/police/report/${id}`, { method: 'POST' });
    usePolice.setState((s) => ({ against: s.against.map((c) => (c.id === id ? crime : c)) }));
    useGame.getState().toast(`🚔 Report filed for @${crime.thief}. Officers are on their way to find them.`);
    void loadPolice();
  })
    .catch((e) => usePolice.setState({ error: e instanceof Error ? e.message : 'Could not file the report' }))
    .finally(() => usePolice.setState({ busy: false }));
}

/** Pay for a bodyguard (against pickpockets) or a mai-gadi at the house (against burglars). */
export function hireProtection(kind: ProtectionKind) {
  const g = useGame.getState();
  if (usePolice.getState().busy) return;
  usePolice.setState({ busy: true, error: null });
  return serial(async () => {
    await flushWalletNow();
    const { protection, balance } = await call<{ protection: Protection; balance: number }>('/api/protect', {
      method: 'POST',
      body: JSON.stringify({ kind }),
    });
    setServerBalance(balance);
    usePolice.setState({ protection });
    const cfg = PROTECTION[kind];
    addTxn(-cfg.price, `Hired a ${cfg.label.toLowerCase()}`);
    g.toast(`${cfg.icon} ${cfg.label} hired for ${cfg.hours}h. Thieves, try am!`);
  })
    .catch((e) => g.toast(e instanceof Error ? e.message : 'Could not hire protection'))
    .finally(() => usePolice.setState({ busy: false }));
}

/** Put a bounty on a thief I reported: whoever arrests them collects it. */
/** Tell VDM about a crime against you. It's free, and he decides whether to expose it on Twitter. */
export function callVdm(id: number) {
  const g = useGame.getState();
  if (usePolice.getState().busy) return;
  usePolice.setState({ busy: true, error: null });
  return serial(async () => {
    const { crime, posted, said } = await call<{ crime: CrimeReport; posted: boolean; said?: string }>(`/api/police/vdm/${id}`, { method: 'POST', body: '{}' });
    usePolice.setState((s) => ({ against: s.against.map((c) => (c.id === id ? crime : c)) }));
    g.toast(posted ? '📢 VDM don carry your matter! Check the VDM tab on Twitter.' : `📢 VDM: “${said ?? 'Not today.'}”`);
  })
    .catch((e) => g.toast(e instanceof Error ? e.message : 'VDM did not pick up'))
    .finally(() => usePolice.setState({ busy: false }));
}

export function postBounty(id: number, amount: number) {
  const g = useGame.getState();
  if (usePolice.getState().busy) return;
  usePolice.setState({ busy: true, error: null });
  return serial(async () => {
    await flushWalletNow();
    const { crime, balance } = await call<{ crime: CrimeReport; balance: number }>(`/api/police/bounty/${id}`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    setServerBalance(balance);
    usePolice.setState((s) => ({ against: s.against.map((c) => (c.id === id ? crime : c)) }));
    addTxn(-amount, `Bounty on @${crime.thief}`);
    g.toast(`💰 ${naira(crime.bounty ?? amount)} bounty on @${crime.thief}. Bounty hunters are on the case.`);
    void loadPolice();
  })
    .catch((e) => g.toast(e instanceof Error ? e.message : 'Could not post the bounty'))
    .finally(() => usePolice.setState({ busy: false }));
}

/** Arrest a wanted player standing next to you: officers can arrest anyone wanted, anyone else only a thief with a bounty. */
export function arrestPlayer(uid: string, username: string) {
  const g = useGame.getState();
  const bounty = usePolice.getState().wanted.find((w) => w.uid === uid)?.bounty ?? 0;
  if (g.jobId !== POLICE.job && !bounty) return g.toast('Only police officers can make arrests (unless there’s a bounty). Join the force in Phone → Jobs 👮🏾');
  if (usePolice.getState().busy) return;
  usePolice.setState({ busy: true, error: null });
  return serial(async () => {
    await flushWalletNow();
    const { reward, bounty: won, balance } = await call<{ crimes: CrimeReport[]; reward: number; bounty: number; balance: number }>('/api/police/arrest', {
      method: 'POST',
      body: JSON.stringify({ target: uid }),
    });
    setServerBalance(balance);
    if (reward) addTxn(reward, `Arrest reward: @${username}`);
    if (won) addTxn(won, `Bounty: @${username}`);
    const paid = [reward ? `reward ${naira(reward)}` : '', won ? `bounty ${naira(won)}` : ''].filter(Boolean).join(' + ');
    g.toast(`${g.jobId === POLICE.job ? '👮🏾' : '🤠'} You arrested @${username}!${paid ? ` ${paid[0].toUpperCase()}${paid.slice(1)}` : ''}`);
    void loadPolice();
  })
    .catch((e) => g.toast(e instanceof Error ? e.message : 'Could not make the arrest'))
    .finally(() => usePolice.setState({ busy: false }));
}

let bailing = false;
/** When the last bail went through: a police refresh that started before it must not lock me up again. */
let bailedAt = 0;

/** Pay bail for yourself (no uid) or for someone in a cell. */
export function payBail(uid?: string, username?: string) {
  const g = useGame.getState();
  if (bailing) return;
  bailing = true;
  usePolice.setState({ busy: true, error: null });
  const run = async () => {
    // Money still on its way to the server has to land first, or the server may think I can't afford it.
    if (walletPending()) await flushWalletNow();
    const { amount, balance } = await call<{ amount: number; balance: number }>('/api/police/bail', {
      method: 'POST',
      body: JSON.stringify(uid ? { target: uid } : {}),
    });
    bailedAt = Date.now();
    setServerBalance(balance);
    addTxn(-amount, uid ? `Bail for @${username ?? 'player'}` : 'Bail');
    if (uid) {
      g.toast(`🔓 You paid ${naira(amount)} bail for @${username ?? 'player'}`);
      usePolice.setState((s) => ({ custody: s.custody.filter((p) => p.uid !== uid) }));
    } else {
      usePolice.setState({ jailedUntil: null, jailCharge: [] });
      g.release();
      g.toast(`🔓 You paid ${naira(amount)} bail. You're free — behave yourself!`);
    }
  };
  // Nothing to flush: go straight to the server instead of waiting in line behind a slow save.
  return (walletPending() ? serial(run) : run())
    .catch((e) => g.toast(e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'Could not pay bail. Check your connection and try again'))
    .finally(() => {
      bailing = false;
      usePolice.setState({ busy: false });
    });
}

type CrimeEvent =
  | { t: 'robbed'; crime: CrimeReport }
  | { t: 'wanted'; crime: CrimeReport; autoAt: number }
  | { t: 'arrested'; crime: CrimeReport; crimes?: CrimeReport[]; charges?: string[]; until: number; jailMinutes?: number; officer?: string | null }
  | { t: 'case'; crime: CrimeReport }
  | { t: 'released'; by: string | null; amount: number; pardon?: string }
  | { t: 'bounty'; crime: CrimeReport; amount: number }
  | { t: 'accused'; by: string; cleared: boolean }
  | { t: 'vdm'; victim: string }
  | { t: 'intruder'; thief: string; username: string; until: number }
  | { t: 'beaten'; by: string; until: number; amount: number; items: string[] };

/** Live events from the multiplayer socket. */
export function onCrimeEvent(e: CrimeEvent) {
  const g = useGame.getState();
  if (e.t === 'vdm') {
    g.toast(`📢 @${e.victim} reported you to VDM and he posted it. The whole of Twitter is talking about you now.`);
    return;
  }
  if (e.t === 'intruder') {
    useIntruder.setState({ intruder: { thief: e.thief, username: e.username, until: e.until }, busy: false });
    g.toast(`🚨 @${e.username} just broke into your house while you're home! Catch them before they leave.`);
    return;
  }
  if (e.t === 'beaten') {
    injury.until = e.until;
    // Anything I carried out of that house is taken back.
    for (const type of e.items) {
      useGame.setState((s) => {
        const inv = s.furnitureInventory.findIndex((x) => x.type === type);
        if (inv >= 0) return { furnitureInventory: s.furnitureInventory.filter((_, j) => j !== inv) };
        const i = s.items.findIndex((x) => x.type === type);
        return i < 0 ? s : { items: s.items.filter((_, j) => j !== i) };
      });
    }
    if (e.amount) addTxn(-e.amount, `Beaten by @${e.by}`);
    void refreshBalance();
    // If the caught scene is playing (e.g. camera spotted me), let endCaughtScene handle the exit.
    if (useCaught.getState().active) {
      useCaught.setState({ beaten: { by: e.by, amount: e.amount } });
      return;
    }
    if (useVisit.getState().current) leaveHouseVisit();
    g.toast(`🥊 @${e.by} was home and beat you out of the house.${e.amount ? ` You paid ${naira(e.amount)}.` : ''} You're injured for ${Math.round(CATCH.injuredMs / 60_000)} minutes: you can't steal and you walk slowly.`);
    return;
  }
  if (e.t === 'robbed') {
    const c = e.crime;
    usePolice.setState((s) => ({ against: [c, ...s.against.filter((x) => x.id !== c.id)] }));
    markSeen([c]);
    // I know who it was and they're still at large: offer payback while it stings.
    if (!unsolved(c) && c.thief !== 'someone' && c.status !== 'arrested') useRobbed.setState({ crime: c });
    if (!c.success) {
      if (c.guard === 'camera') g.toast(`📹 Your CCTV identified @${c.thief}. Open the Police app to file a report.`);
      else if (c.guard) g.toast(`${CATCHERS[c.guard].icon} Your ${CATCHERS[c.guard].label.toLowerCase()} caught @${c.thief} ${c.kind === 'burglary' ? 'at your fence' : 'reaching for your pocket'}! Warrant out. Add a bounty in the Police app.`);
      else g.toast(`🚨 You caught @${c.thief} trying to ${c.kind === 'burglary' ? 'break into your house' : 'pick your pocket'}! Report them in the Police app.`);
      return;
    }
    if (c.item) {
      // The server already took it out of the cloud save; match it here.
      useGame.setState((s) => {
        // Prefer the exact piece (break-ins name it); otherwise any one of that type in the active house.
        const home = s.activeHouseId ?? s.homePropertyId;
        if (c.itemId && c.propertyId && c.propertyId !== home) {
          return { properties: s.properties.map((p) => (p.id === c.propertyId && p.items ? { ...p, items: p.items.filter((x) => x.id !== c.itemId) } : p)) };
        }
        let i = c.itemId ? s.items.findIndex((x) => x.id === c.itemId) : -1;
        if (i < 0) i = s.items.findIndex((x) => x.type === c.item);
        if (i < 0) return s;
        const gone = s.items[i].id;
        return { items: s.items.filter((_, j) => j !== i), selectedId: s.selectedId === gone ? null : s.selectedId, task: s.task?.itemId === gone ? null : s.task };
      });
    }
    if (c.amount) addTxn(-c.amount, `Robbed by @${c.thief}`);
    void refreshBalance();
    const what = [c.amount ? naira(c.amount) : '', itemName(c.item) ? `your ${itemName(c.item)}` : ''].filter(Boolean).join(' and ');
    if (unsolved(c)) {
      g.toast(`🏚️ Someone broke into your house${what ? ` and took ${what}` : ''}! Nobody saw who. Accuse up to ${ACCUSE.max} suspects in the Police app 🚔`);
      return;
    }
    g.toast(`😱 @${c.thief} ${c.kind === 'burglary' ? 'burgled your house' : 'picked your pocket'}${what ? ` and took ${what}` : ''}! Report them in the Police app 🚔`);
  } else if (e.t === 'wanted') {
    const c = e.crime;
    usePolice.setState((s) => ({ by: s.by.map((x) => (x.id === c.id ? c : x)) }));
    g.toast(`🚨 @${c.victim} filed a report. Police are on their way to arrest you — keep moving!`);
  } else if (e.t === 'arrested') {
    const list = e.crimes ?? [e.crime];
    // Furniture I kept from a burglary is taken back off me.
    for (const c of list) {
      if (!c.confiscated || !c.item) continue;
      useGame.setState((s) => {
        const inv = s.furnitureInventory.findIndex((x) => x.type === c.item);
        if (inv >= 0) return { furnitureInventory: s.furnitureInventory.filter((_, j) => j !== inv) };
        const i = s.items.findIndex((x) => x.type === c.item);
        return i < 0 ? s : { items: s.items.filter((_, j) => j !== i) };
      });
    }
    usePolice.setState((s) => ({ jailedUntil: e.until, jailCharge: e.charges ?? [], by: s.by.map((x) => list.find((c) => c.id === x.id) ?? x) }));
    const paid = list.reduce((a, c) => a + c.returned + (c.fine ?? 0), 0);
    if (paid) addTxn(-paid, 'Restitution, fine and reward');
    void refreshBalance();
    // Caught inside someone's house: play the "what are you doing here?" scene, then the cell.
    if (useVisit.getState().current?.burglary || useCaught.getState().active) {
      startCaughtScene('guard');
      useCaught.setState({ arrest: { until: e.until, officer: e.officer } });
      return;
    }
    dropVisit();
    g.arrest(e.until);
    g.toast(e.officer ? `🚔 Officer @${e.officer} arrested you! You've been taken to ${regionHere().prison}.` : `🚔 The police caught up with you. You've been taken to ${regionHere().prison}.`);
  } else if (e.t === 'case') {
    const c = e.crime;
    if (c.recovered) takeBack(c);
    usePolice.setState((s) => ({ against: s.against.map((x) => (x.id === c.id ? c : x)) }));
    if (c.returned) addTxn(c.returned, `Recovered from @${c.thief}`);
    void refreshBalance();
    g.toast(`🚔 ${c.officer ? `Officer @${c.officer}` : 'The police'} arrested @${c.thief}.${c.returned ? ` ${naira(c.returned)} returned to you.` : ''}`);
  } else if (e.t === 'bounty') {
    const c = e.crime;
    usePolice.setState((s) => ({ by: s.by.map((x) => (x.id === c.id ? c : x)) }));
    g.toast(`💰 @${c.victim} put ${naira(c.bounty ?? e.amount)} on your head. Anybody can arrest you now. Watch your back!`);
  } else if (e.t === 'accused') {
    g.toast(`🕵🏾 @${e.by} accused you of burgling their house. The police checked and cleared you.`);
  } else if (e.t === 'released') {
    usePolice.setState({ jailedUntil: null, jailCharge: [] });
    g.release();
    g.toast(e.pardon ? `🕊️ ${e.pardon} @${e.by} pardoned you. You're free!` : e.by ? `🔓 @${e.by} paid your ${naira(e.amount)} bail. You're free!` : '🔓 Bail paid. You are free!');
  }
}

/** Check the record (and whether I'm still in a cell) once signed in and playing, and keep checking while wanted. */
export function startPolice() {
  let ready = false;
  const check = () => {
    const s = useSession.getState();
    const now = s.status === 'ready' && !!s.user?.username && useGame.getState().started;
    if (now && !ready) void loadPolice();
    if (!s.user) injury.until = 0;
    if (!s.user) usePolice.setState({ against: [], by: [], jailedUntil: null, jailCharge: [], wanted: [], custody: [], protection: { bodyguard: null, gateman: null } });
    ready = now;
  };
  const a = useSession.subscribe(check);
  const b = useGame.subscribe((s, p) => s.started !== p.started && check());
  // While someone's wanted (me, or anyone an officer is hunting) the server settles manhunts as it's polled.
  const poll = setInterval(() => {
    const p = usePolice.getState();
    const g = useGame.getState();
    if (ready && (myManhunt(p.by) || (g.jobId === POLICE.job && p.wanted.length))) void loadPolice();
  }, 30_000);
  check();
  return () => {
    a();
    b();
    clearInterval(poll);
  };
}

/** The caught scene is over: leave the house, or go to the cell if the server already arrested me. */
export function endCaughtScene() {
  const { arrest, cause, beaten } = useCaught.getState();
  useCaught.setState({ active: false, arrest: null, beaten: null });
  const g = useGame.getState();
  if (arrest) {
    dropVisit();
    g.arrest(arrest.until);
    g.toast(arrest.officer ? `🚔 Officer @${arrest.officer} arrested you! You've been taken to ${regionHere().prison}.` : `🚔 You have been taken to ${regionHere().prison}.`);
    return;
  }
  leaveHouseVisit();
  // The owner beat me while the caught scene was playing: show the beaten toast instead of the camera one.
  if (beaten) {
    g.toast(`🥊 @${beaten.by} was home and beat you out of the house.${beaten.amount ? ` You paid ${naira(beaten.amount)}.` : ''} You're injured for ${Math.round(CATCH.injuredMs / 60_000)} minutes: you can't steal and you walk slowly.`);
    return;
  }
  if (cause === 'camera') g.toast(`📹 The CCTV got your face. The owner has been alerted. Stay away from this house for ${Math.round(CATCH.lockoutMs / 60_000)} minutes.`);
}
