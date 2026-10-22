// Direct messages and player-to-player money (server side: worker/social.ts).

import { create } from 'zustand';
import { naira, txn, useGame } from '../game/store';
import { api, serial, useSession } from './session';
import { flushWalletNow, setServerBalance, walletBalance } from './wallet';
import type { HouseVisit } from '../game/visits';
import { loadLove } from './hangout';
import { sharedPlace } from '../game/placeShare';

export interface Message {
  id: number;
  from: string;
  to: string;
  kind: 'text' | 'pay' | 'request' | 'invite' | 'visit' | 'love';
  text: string;
  amount: number | null;
  status: string | null;
  ref: number | null;
  at: number;
  read: boolean;
  /** The emoji each side reacted with (game/reactions.ts), or null. */
  fromReact?: string | null;
  toReact?: string | null;
}

export interface PlayerRef {
  uid: string;
  username: string | null;
  name?: string | null;
  /** Their appearance, for drawing their face. */
  look?: string | null;
  /** When they were last in the game (ms), for "Last online" when they are not here now. */
  lastSeen?: number | null;
}

/** "Last online 5 min ago", "today at 3:20 PM", "yesterday at 9:05 AM" or "12 Oct". Empty when it is not known. */
export function lastOnline(at?: number | null, now = Date.now()): string {
  if (!at) return '';
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 2) return 'Last online just now';
  if (mins < 60) return `Last online ${mins} min ago`;
  const d = new Date(at), today = new Date(now);
  const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (days <= 0) return `Last online today at ${clock}`;
  if (days === 1) return `Last online yesterday at ${clock}`;
  return `Last online ${d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) })}`;
}

export interface Conversation extends PlayerRef {
  unread: number;
  last: Message;
}

interface Social {
  conversations: Conversation[];
  threads: Record<string, Message[]>;
  players: Record<string, PlayerRef>;
  /** Thread to show when the phone's Messages app opens (e.g. tapped a name tag). */
  openWith: string | null;
  /** The player whose sheet is open; `tab: 'profile'` opens it on their profile instead of the actions. */
  interactionWith: (PlayerRef & { tab?: 'profile' }) | null;
}

export const useSocial = create<Social>(() => ({ conversations: [], threads: {}, players: {}, openWith: null, interactionWith: null }));

export const unreadCount = (s: Social) => s.conversations.reduce((a, c) => a + c.unread, 0);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

const post = <T>(path: string, body: object = {}) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

/** Open a player's profile sheet (tapped their name in a chat). */
export function openPlayerProfile(p: PlayerRef) {
  rememberPlayer(p);
  useSocial.setState({ interactionWith: { ...p, tab: 'profile' } });
}

/** What I call a player: my nickname for them if I set one, else their @username. */
export const usePlayerLabel = (uid: string, username?: string | null) =>
  useGame((s) => s.aliases[uid]) ?? `@${username ?? 'player'}`;

export function rememberPlayer(p: PlayerRef) {
  useSocial.setState((s) => ({ players: { ...s.players, [p.uid]: { ...s.players[p.uid], ...p } } }));
}

/** Insert or replace a message in its thread and bump the conversation list. */
function upsert(m: Message, unreadDelta = 0) {
  const me = useSession.getState().user?.uid;
  const other = m.from === me ? m.to : m.from;
  useSocial.setState((s) => {
    const thread = s.threads[other];
    const threads = thread
      ? { ...s.threads, [other]: thread.some((x) => x.id === m.id) ? thread.map((x) => (x.id === m.id ? m : x)) : [...thread, m] }
      : s.threads;
    const existing = s.conversations.find((c) => c.uid === other);
    const isNewer = !existing || m.id >= existing.last.id;
    const p = s.players[other];
    const conv: Conversation = {
      uid: other,
      username: existing?.username ?? p?.username ?? null,
      name: existing?.name ?? p?.name,
      unread: (existing?.unread ?? 0) + unreadDelta,
      last: isNewer ? m : existing!.last,
    };
    const rest = s.conversations.filter((c) => c.uid !== other);
    return { threads, conversations: isNewer ? [conv, ...rest] : s.conversations.map((c) => (c.uid === other ? conv : c)) };
  });
}

export async function loadInbox() {
  const { conversations } = await call<{ conversations: Conversation[] }>('/api/inbox');
  conversations.forEach((c) => rememberPlayer(c));
  useSocial.setState({ conversations });
}

export async function loadThread(uid: string) {
  const { player, messages } = await call<{ player: PlayerRef; messages: Message[] }>(`/api/messages/${uid}`);
  rememberPlayer(player);
  useSocial.setState((s) => ({
    threads: { ...s.threads, [uid]: messages },
    conversations: s.conversations.map((c) => (c.uid === uid ? { ...c, unread: 0 } : c)),
  }));
}

export async function searchPlayers(q: string): Promise<PlayerRef[]> {
  const { players } = await call<{ players: PlayerRef[] }>(`/api/players?q=${encodeURIComponent(q)}`);
  players.forEach(rememberPlayer);
  return players;
}

export async function sendText(to: string, text: string, ref?: number | null) {
  const { message } = await post<{ message: Message }>('/api/messages', { to, text, ref: ref ?? undefined });
  upsert(message);
}

export async function sendHomeInvite(to: string) {
  const { message } = await post<{ message: Message }>('/api/invite', { to });
  upsert(message);
}

export async function acceptHomeInvite(id: number): Promise<{ message: Message; home: HomeResult }> {
  const result = await post<{ message: Message; home: HomeResult }>(`/api/invite/${id}/accept`);
  upsert(result.message);
  return result;
}

export async function declineHomeInvite(id: number) {
  const { message } = await post<{ message: Message }>(`/api/invite/${id}/decline`);
  upsert(message);
}

type HomeResult = Omit<HouseVisit, 'selectedItemId' | 'burglary'>;

export async function requestHomeVisit(to: string) {
  const { message } = await post<{ message: Message }>('/api/visit/request', { to });
  upsert(message);
}

export async function answerVisitRequest(id: number, accept: boolean) {
  const { message } = await post<{ message: Message }>(`/api/visit/${id}/${accept ? 'accept' : 'decline'}`);
  upsert(message);
}

export async function enterAcceptedVisit(id: number): Promise<{ home: HomeResult }> {
  return post<{ home: HomeResult }>(`/api/visit/${id}/enter`);
}

export async function revokeHomeVisit() {
  await post<{ ok: boolean }>('/api/visit/leave');
}

/** React to a message with an emoji, or take my reaction back (null). It shows at once and the server confirms it. */
export async function reactMessage(m: Message, emoji: string | null) {
  const mine = m.from === useSession.getState().user?.uid;
  upsert({ ...m, ...(mine ? { fromReact: emoji } : { toReact: emoji }) });
  try {
    const { message } = await post<{ message: Message }>(`/api/messages/${m.id}/react`, { emoji });
    upsert(message);
  } catch (e) {
    upsert(m);
    throw e;
  }
}

export async function deleteMessage(id: number) {
  try {
    await call<{ ok: boolean }>(`/api/messages/${id}`, { method: 'DELETE' });
  } catch {
    // Continue and remove locally even if server returns error or offline
  }
  removeMessage(id);
}

export function removeMessage(id: number) {
  useSocial.setState((s) => {
    let changedOther: string | null = null;
    const newThreads: Record<string, Message[]> = {};
    for (const [uid, msgs] of Object.entries(s.threads)) {
      if (msgs.some((m) => m.id === id)) {
        changedOther = uid;
        newThreads[uid] = msgs.filter((m) => m.id !== id);
      } else {
        newThreads[uid] = msgs;
      }
    }
    if (!changedOther) return s;
    const remaining = newThreads[changedOther];
    const newLast = remaining && remaining.length > 0 ? remaining[remaining.length - 1] : null;
    let newConversations: Conversation[];
    if (newLast) {
      newConversations = s.conversations.map((c) => (c.uid === changedOther ? { ...c, last: newLast } : c));
    } else {
      newConversations = s.conversations.filter((c) => c.uid !== changedOther);
    }
    return {
      threads: newThreads,
      conversations: newConversations,
    };
  });
}

export async function requestMoney(to: string, amount: number, note: string) {
  const { message } = await post<{ message: Message }>('/api/request', { to, amount, note });
  upsert(message);
}

export async function declineRequest(id: number) {
  const { message } = await post<{ message: Message }>(`/api/request/${id}/decline`);
  upsert(message);
}

/** Send money. Sends any queued money events first so the server's balance is current. */
export function sendMoney(to: string, amount: number, note: string, ref?: number) {
  return serial(async () => {
    await flushWalletNow();
    if ((walletBalance() ?? 0) < amount) throw new Error('Not enough money');
    const { message, request, balance, fee } = await post<{ message: Message; request: Message | null; balance: number; fee?: number }>('/api/pay', { to, amount, note, ref });
    const who = useSocial.getState().players[to]?.username;
    addTxn(-amount, `Sent to @${who ?? 'player'}`);
    // The president's transfer fee, paid into the treasury.
    if (fee) addTxn(-fee, 'Transfer fee · treasury');
    setServerBalance(balance);
    upsert(message);
    if (request) upsert(request);
  });
}

/** Acknowledge money other players sent (already in the wallet) and pick up the new balance. */
export function claimPayments() {
  return serial(async () => {
    const { payments, senders, balance } = await post<{ payments: Message[]; senders: Record<string, string>; balance: number }>('/api/claim');
    for (const p of payments) {
      addTxn(p.amount!, `From @${senders[p.from] ?? 'player'}`);
      upsert({ ...p, status: 'claimed' });
    }
    setServerBalance(balance);
    if (payments.length === 1) {
      useGame.getState().toast(`💸 @${senders[payments[0].from] ?? 'someone'} sent you ${naira(payments[0].amount!)}`);
    } else if (payments.length > 1) {
      useGame.getState().toast(`💸 You received ${naira(payments.reduce((a, p) => a + p.amount!, 0))} from ${payments.length} payments`);
    }
  });
}

/** Bank history entry only; the balance itself comes from the server. */
function addTxn(amount: number, label: string) {
  useGame.setState((s) => ({ txns: [txn(s, label, amount), ...s.txns].slice(0, 40) }));
}

/** Live events relayed through the multiplayer socket. */
export function onSocialEvent(e: { t: string; message?: Message; from?: PlayerRef; id?: number; by?: string; upTo?: number }) {
  if (e.t === 'dm' && e.message) {
    if (e.from) rememberPlayer(e.from);
    const m = e.message;
    const open = useSocial.getState().openWith === m.from && useGame.getState().panel === 'phone';
    upsert(m, open ? 0 : 1);
    const who = `@${e.from?.username ?? 'someone'}`;
    if (m.kind === 'pay') claimPayments().catch(() => {});
    else if (m.kind === 'request') useGame.getState().toast(`🧾 ${who} is asking for ${naira(m.amount!)}`, m.from);
    else if (m.kind === 'visit') useGame.getState().toast(`🚪 ${who} wants to visit your house. Open Messages to reply.`, m.from);
    else if (m.kind === 'invite') useGame.getState().toast(`🏠 ${who} invited you home. Open Messages to visit.`, m.from);
    else if (m.kind === 'love') {
      useGame.getState().toast(m.text === 'marry' ? `💍 ${who} proposed to you. Open Messages to answer.` : `💌 ${who} asked you out. Open Messages to answer.`, m.from);
      void loadLove();
    }
    else if (!open) {
      const shared = sharedPlace(m.text);
      useGame.getState().toast(shared ? `📍 ${who} shared a location: ${shared.place.name}. Open Messages to go there.` : `✉️ ${who}: ${m.text.slice(0, 60)}`, m.from);
    }
  } else if (e.t === 'msg-update' && e.message) {
    upsert(e.message);
    if (e.message.kind === 'love') void loadLove();
  } else if (e.t === 'msg-read' && e.by && typeof e.upTo === 'number') {
    // They opened the chat: everything I sent them up to here is now seen.
    const { by, upTo } = e;
    useSocial.setState((s) => ({
      threads: s.threads[by] ? { ...s.threads, [by]: s.threads[by].map((m) => (m.to === by && m.id <= upTo ? { ...m, read: true } : m)) } : s.threads,
    }));
  } else if (e.t === 'msg-delete' && typeof e.id === 'number') {
    removeMessage(e.id);
  }
}

/** Load the inbox and collect waiting payments whenever a signed-in player is ready. */
export function startSocial() {
  let ready = false;
  const check = () => {
    const s = useSession.getState();
    const now = s.status === 'ready' && !!s.user?.username && useGame.getState().started;
    if (now && !ready) {
      loadInbox().catch(() => {});
      claimPayments().catch(() => {});
    }
    if (!s.user) useSocial.setState({ conversations: [], threads: {}, players: {}, openWith: null, interactionWith: null });
    ready = now;
  };
  const a = useSession.subscribe(check);
  const b = useGame.subscribe((s, p) => s.started !== p.started && check());
  check();
  // Catch payments that arrived while the socket was down. The money is already in the wallet by then and only the
  // notice is late, so this can be slow.
  const id = setInterval(() => ready && claimPayments().catch(() => {}), 5 * 60_000);
  return () => {
    a();
    b();
    clearInterval(id);
  };
}
