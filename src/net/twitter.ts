// Twitter on the client, beyond the feeds themselves (src/net/live.ts): player profiles, reposts, views, and likes that
// show at once. Server side: worker/fun.ts (/api/feed?scope=user, /api/feed/<id>/repost).

import { create } from 'zustand';
import { api, useSession } from './session';
import { useLive, type FeedPost } from './live';

/** Who a player is, for the top of their Twitter profile. */
export interface TwPlayer {
  uid: string;
  username: string;
  name: string | null;
  joined: number;
  look: string | null;
  origin: string | null;
  jobId: string | null;
  /** The city they are in (their save's destinationId). */
  city: string | null;
  friends: number;
  plots: number;
  /** We are friends (or it is me): their own tweets are visible. */
  friend: number | boolean;
}

export interface TwProfile {
  player: TwPlayer | null;
  posts: FeedPost[];
  loading: boolean;
  missing?: boolean;
}

interface TwState {
  profiles: Record<string, TwProfile>;
}

export const useTw = create<TwState>(() => ({ profiles: {} }));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function loadProfile(username: string) {
  if (!useSession.getState().user) return;
  const key = username.toLowerCase();
  const cur = useTw.getState().profiles[key];
  useTw.setState((s) => ({ profiles: { ...s.profiles, [key]: { player: cur?.player ?? null, posts: cur?.posts ?? [], loading: true } } }));
  try {
    const r = await call<{ player: TwPlayer; posts: FeedPost[] }>(`/api/feed?scope=user&username=${encodeURIComponent(key)}`);
    useTw.setState((s) => ({ profiles: { ...s.profiles, [key]: { player: r.player, posts: r.posts, loading: false } } }));
  } catch {
    useTw.setState((s) => ({ profiles: { ...s.profiles, [key]: { player: cur?.player ?? null, posts: cur?.posts ?? [], loading: false, missing: !cur?.player } } }));
  }
}

/** Change one post wherever it is shown: every feed, every thread, every profile. */
export function patchPost(id: number, change: (p: FeedPost) => FeedPost) {
  const upd = (p: FeedPost) => (p.id === id ? change(p) : p);
  useLive.setState((s) => ({
    sharedPost: s.sharedPost && upd(s.sharedPost),
    feed: s.feed.map(upd),
    vdmFeed: s.vdmFeed.map(upd),
    friendsFeed: s.friendsFeed.map(upd),
    replies: Object.fromEntries(Object.entries(s.replies).map(([k, v]) => [k, v.map(upd)])),
  }));
  useTw.setState((s) => ({ profiles: Object.fromEntries(Object.entries(s.profiles).map(([k, v]) => [k, { ...v, posts: v.posts.map(upd) }])) }));
}

const pending = new Set<string>();

/** Like (or unlike) now, and settle it with the server's count after. */
export async function toggleLike(p: FeedPost) {
  const key = `like:${p.id}`;
  if (pending.has(key)) return;
  pending.add(key);
  const was = !!p.liked;
  patchPost(p.id, (q) => ({ ...q, liked: !was, likes: Math.max(0, q.likes + (was ? -1 : 1)) }));
  try {
    const r = await call<{ liked: boolean; likes: number }>(`/api/feed/${p.id}/like`, { method: 'POST' });
    patchPost(p.id, (q) => ({ ...q, liked: r.liked, likes: r.likes }));
  } catch {
    patchPost(p.id, (q) => ({ ...q, liked: was, likes: p.likes }));
  } finally {
    pending.delete(key);
  }
}

/** Repost (or undo it): it goes on my friends' Following tab. */
export async function toggleRepost(p: FeedPost) {
  const key = `repost:${p.id}`;
  if (pending.has(key)) return;
  pending.add(key);
  const was = !!p.reposted;
  patchPost(p.id, (q) => ({ ...q, reposted: !was, reposts: Math.max(0, (q.reposts ?? 0) + (was ? -1 : 1)) }));
  try {
    const r = await call<{ reposted: boolean; reposts: number }>(`/api/feed/${p.id}/repost`, { method: 'POST' });
    patchPost(p.id, (q) => ({ ...q, reposted: r.reposted, reposts: r.reposts }));
  } catch {
    patchPost(p.id, (q) => ({ ...q, reposted: was, reposts: p.reposts }));
  } finally {
    pending.delete(key);
  }
}

/** Opening a thread counts as a view on the server (GET replies); show it here too. */
export const sawPost = (id: number) => patchPost(id, (q) => ({ ...q, views: (q.views ?? 0) + 1 }));
