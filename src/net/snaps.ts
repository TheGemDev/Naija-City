// Snap on the client: pictures from the in-game camera, shown to friends and the city for a day. Server: worker/snaps.ts.

import { create } from 'zustand';
import { api, useSession } from './session';
import { useGame } from '../game/store';
import { idToken } from './firebase';

export interface Snap {
  id: number;
  uid: string;
  username: string | null;
  url: string;
  caption: string;
  at: number;
  /** When it disappears. */
  until: number;
  likes: number;
  liked: boolean;
  comments: number;
  /** How many players have opened it, and whether I have (my own always count as seen). */
  views: number;
  seen: boolean;
  /** Who it is for: 0 everyone (stories and Spotlight), 1 friends' stories only, 2 only the friends it was sent to. */
  audience: number;
}

/** A snap a friend sent me. Its picture comes only until it is opened: they open once. */
export interface ReceivedSnap {
  id: number;
  uid: string;
  username: string | null;
  caption: string;
  at: number;
  opened: number | null;
  url: string | null;
}

/** The Chat tab: what friends sent me, what I last sent each of them and whether they opened it, and our streaks. */
export interface SnapChats {
  received: ReceivedSnap[];
  sent: { uid: string; at: number; opened: number | null }[];
  /** `ending`: kept up yesterday but not yet today, so it is lost at midnight (Lagos time) unless both send one. */
  streaks: { uid: string; count: number; ending: boolean }[];
}

/** Where a snap goes from the send screen: my story (friends), Spotlight (the whole city), and friends sent it directly. */
export interface SnapSend {
  story: boolean;
  spotlight: boolean;
  to: string[];
}

export interface SnapComment {
  id: number;
  uid: string;
  username: string | null;
  text: string;
  at: number;
}

export type SnapScope = 'friends' | 'global' | 'top';
/** The Snap app's screens on the phone (its camera is photo mode itself, over the scene). */
export type SnapTab = 'chat' | 'stories' | 'spotlight' | 'me';
export const SNAP_CAPTION_MAX = 120;
export const SNAP_COMMENT_MAX = 200;

interface SnapState {
  /** The screen the app is on. */
  tab: SnapTab;
  friends: Snap[];
  global: Snap[];
  /** Spotlight's most liked of the day. */
  top: Snap[];
  chats: SnapChats | null;
  /** No older snaps left to page back through. */
  end: Record<SnapScope, boolean>;
  loading: boolean;
  /** Comments under each snap that has been opened, by snap id. */
  comments: Record<number, SnapComment[]>;
  /** The snap a share link pointed at, shown at the top of the app until it is closed. */
  shared: Snap | null;
}

export const useSnaps = create<SnapState>(() => ({ tab: 'stories', friends: [], global: [], top: [], chats: null, end: { friends: false, global: false, top: true }, loading: false, comments: {}, shared: null }));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function loadSnaps(scope: SnapScope, more = false) {
  if (!useSession.getState().user) return;
  const cur = useSnaps.getState()[scope];
  const before = more && cur.length ? cur[cur.length - 1].id : 0;
  useSnaps.setState({ loading: true });
  try {
    const query = scope === 'top' ? 'scope=global&sort=top' : `scope=${scope}${before ? `&before=${before}` : ''}`;
    const { snaps, page } = await call<{ snaps: Snap[]; page: number }>(`/api/snaps?${query}`);
    useSnaps.setState((s) => ({ [scope]: more ? [...cur, ...snaps] : snaps, end: { ...s.end, [scope]: snaps.length < page } }));
  } catch {
    /* offline: keep what we have */
  } finally {
    useSnaps.setState({ loading: false });
  }
}

/** The audience number the server takes for where a snap is going (see Snap.audience). */
const audienceOf = (to: SnapSend) => (to.spotlight ? 0 : to.story ? 1 : 2);

/** Posts a picture with its message: to everyone (no `to`, as before), or where the send screen says. Throws with the
 *  server's reason if it is refused. */
export async function postSnap(picture: Blob, caption: string, send?: SnapSend) {
  const token = await idToken();
  if (!token) throw new Error('Sign in to post snaps');
  const where = send ? `&audience=${audienceOf(send)}${send.to.length ? `&to=${send.to.map(encodeURIComponent).join(',')}` : ''}` : '';
  const res = await fetch(`/api/snaps?caption=${encodeURIComponent(caption.trim().slice(0, SNAP_CAPTION_MAX))}${where}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': picture.type },
    body: picture,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not post that snap');
  void loadSnaps('friends');
  void loadSnaps('global');
  if (send?.to.length) void loadSnapChats();
}

export async function loadSnapChats() {
  if (!useSession.getState().user) return;
  const chats = await call<SnapChats>('/api/snaps/chats').catch(() => null);
  if (chats) useSnaps.setState({ chats });
}

/** Marks a snap as seen by me (its ring goes grey; a snap sent to me is opened and will not open again). */
export async function viewSnap(id: number) {
  patch(id, { seen: true });
  useSnaps.setState((s) => (s.chats ? { chats: { ...s.chats, received: s.chats.received.map((r) => (r.id === id ? { ...r, opened: r.opened ?? Date.now() } : r)) } } : {}));
  const r = await call<{ views: number }>(`/api/snaps/${id}/view`, { method: 'POST' }).catch(() => null);
  if (r) patch(id, { views: r.views });
}

/** Who has seen one of my snaps (only its owner may ask). */
export async function snapViewers(id: number) {
  const r = await call<{ viewers: { uid: string; username: string | null; at: number }[] }>(`/api/snaps/${id}/views`).catch(() => null);
  return r?.viewers ?? [];
}

/** A friend sent me a snap (live event from the server). */
export function onSnapEvent(e: { from: string; username: string | null }) {
  useGame.getState().toast(`👻 New snap from @${e.username ?? 'a friend'}. Open Snap to see it.`);
  void loadSnapChats();
}

export async function deleteSnap(id: number) {
  await call(`/api/snaps/${id}`, { method: 'DELETE' });
  const drop = (xs: Snap[]) => xs.filter((s) => s.id !== id);
  useSnaps.setState((s) => ({ friends: drop(s.friends), global: drop(s.global), top: drop(s.top), shared: s.shared?.id === id ? null : s.shared }));
}

/** Fetches the snap a share link points at and pins it to the top of the app. False if it is gone. */
export async function openSharedSnap(id: number) {
  const r = await call<{ snap: Snap }>(`/api/snaps/${id}`).catch(() => null);
  if (!r) return false;
  useSnaps.setState({ shared: r.snap });
  return true;
}

/** Applies a change to one snap wherever it is showing. */
function patch(id: number, change: Partial<Snap>) {
  const upd = (xs: Snap[]) => xs.map((s) => (s.id === id ? { ...s, ...change } : s));
  useSnaps.setState((s) => ({ friends: upd(s.friends), global: upd(s.global), top: upd(s.top), shared: s.shared?.id === id ? { ...s.shared, ...change } : s.shared }));
}

export async function likeSnap(id: number) {
  const r = await call<{ liked: boolean; likes: number }>(`/api/snaps/${id}/like`, { method: 'POST' }).catch(() => null);
  if (r) patch(id, r);
}

export async function loadSnapComments(id: number) {
  try {
    const { comments } = await call<{ comments: SnapComment[] }>(`/api/snaps/${id}/comments`);
    useSnaps.setState((s) => ({ comments: { ...s.comments, [id]: comments } }));
    patch(id, { comments: comments.length });
  } catch {
    /* offline */
  }
}

/** Posts a comment. False (with a toast saying why) if the server refused it. */
export async function commentSnap(id: number, text: string) {
  try {
    await call(`/api/snaps/${id}/comments`, { method: 'POST', body: JSON.stringify({ text: text.trim().slice(0, SNAP_COMMENT_MAX) }) });
  } catch (e) {
    useGame.getState().toast(e instanceof Error ? e.message : 'Could not post that comment');
    return false;
  }
  await loadSnapComments(id);
  return true;
}

export async function deleteSnapComment(snap: number, id: number) {
  await call(`/api/snaps/${snap}/comments/${id}`, { method: 'DELETE' });
  await loadSnapComments(snap);
}
