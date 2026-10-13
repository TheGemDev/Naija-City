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
}

export interface SnapComment {
  id: number;
  uid: string;
  username: string | null;
  text: string;
  at: number;
}

export type SnapScope = 'friends' | 'global';
export const SNAP_CAPTION_MAX = 120;
export const SNAP_COMMENT_MAX = 200;

interface SnapState {
  friends: Snap[];
  global: Snap[];
  /** No older snaps left to page back through. */
  end: Record<SnapScope, boolean>;
  loading: boolean;
  /** Comments under each snap that has been opened, by snap id. */
  comments: Record<number, SnapComment[]>;
  /** The snap a share link pointed at, shown at the top of the app until it is closed. */
  shared: Snap | null;
}

export const useSnaps = create<SnapState>(() => ({ friends: [], global: [], end: { friends: false, global: false }, loading: false, comments: {}, shared: null }));

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
    const { snaps, page } = await call<{ snaps: Snap[]; page: number }>(`/api/snaps?scope=${scope}${before ? `&before=${before}` : ''}`);
    useSnaps.setState((s) => ({ [scope]: more ? [...cur, ...snaps] : snaps, end: { ...s.end, [scope]: snaps.length < page } }));
  } catch {
    /* offline: keep what we have */
  } finally {
    useSnaps.setState({ loading: false });
  }
}

/** Posts a picture with its message. Throws with the server's reason if it is refused. */
export async function postSnap(picture: Blob, caption: string) {
  const token = await idToken();
  if (!token) throw new Error('Sign in to post snaps');
  const res = await fetch(`/api/snaps?caption=${encodeURIComponent(caption.trim().slice(0, SNAP_CAPTION_MAX))}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': picture.type },
    body: picture,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not post that snap');
  void loadSnaps('friends');
  void loadSnaps('global');
}

export async function deleteSnap(id: number) {
  await call(`/api/snaps/${id}`, { method: 'DELETE' });
  const drop = (xs: Snap[]) => xs.filter((s) => s.id !== id);
  useSnaps.setState((s) => ({ friends: drop(s.friends), global: drop(s.global), shared: s.shared?.id === id ? null : s.shared }));
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
  useSnaps.setState((s) => ({ friends: upd(s.friends), global: upd(s.global), shared: s.shared?.id === id ? { ...s.shared, ...change } : s.shared }));
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
