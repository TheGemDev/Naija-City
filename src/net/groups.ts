// Group chats (server side: worker/groups.ts). Clients poll while a group is open.

import { create } from 'zustand';
import { api } from './session';

export interface GroupMessage {
  id: number;
  group: number;
  from: string;
  username: string | null;
  text: string;
  at: number;
  /** A note from the group itself (who joined, who left), not from a player. */
  system?: boolean;
}

export interface GroupSummary {
  id: number;
  name: string;
  members: number;
  unread: number;
  /** The Government Forum: its members are whoever holds an office, so nobody is added and nobody leaves. */
  official?: boolean;
  last: { id: number; from: string; username: string | null; text: string; at: number; system?: boolean } | null;
}

export interface GroupMember {
  uid: string;
  username: string | null;
  name: string | null;
  look?: string | null;
  /** The office they hold, in the Government Forum. */
  office?: string;
}

export interface GroupDetail {
  id: number;
  name: string;
  owner_uid: string;
  official?: boolean;
  members: GroupMember[];
}

interface Groups {
  list: GroupSummary[];
  threads: Record<number, GroupMessage[]>;
  details: Record<number, GroupDetail>;
}

export const useGroups = create<Groups>(() => ({ list: [], threads: {}, details: {} }));

export const groupUnread = (s: Groups) => s.list.reduce((a, g) => a + g.unread, 0);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

const post = <T>(path: string, body: object = {}) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

export async function loadGroups() {
  const { groups } = await call<{ groups?: GroupSummary[] }>('/api/groups');
  // A 200 that isn't our JSON (a proxy's page, a stale cache) must not leave the list undefined: the unread badge reduces over it.
  useGroups.setState({ list: Array.isArray(groups) ? groups : [] });
}

export async function loadGroup(id: number) {
  const { group, messages } = await call<{ group: GroupDetail; messages: GroupMessage[] }>(`/api/groups/${id}`);
  useGroups.setState((s) => ({
    threads: { ...s.threads, [id]: messages },
    details: { ...s.details, [id]: group },
    list: s.list.map((g) => (g.id === id ? { ...g, unread: 0 } : g)),
  }));
}

export async function loadOlderGroupMessages(id: number) {
  const cur = useGroups.getState().threads[id] ?? [];
  if (!cur.length) return 0;
  const { messages } = await call<{ messages: GroupMessage[] }>(`/api/groups/${id}?before=${cur[0].id}`);
  useGroups.setState((s) => ({ threads: { ...s.threads, [id]: [...messages, ...(s.threads[id] ?? [])] } }));
  return messages.length;
}

export async function createGroup(name: string, members: string[]) {
  const r = await post<{ id: number }>('/api/groups', { name, members });
  await loadGroups();
  return r.id;
}

export async function sendGroupText(id: number, text: string) {
  const { message } = await post<{ message: GroupMessage }>(`/api/groups/${id}/messages`, { text });
  useGroups.setState((s) => ({ threads: { ...s.threads, [id]: [...(s.threads[id] ?? []), message] } }));
}

export async function addGroupMember(id: number, uid: string) {
  await post(`/api/groups/${id}/members`, { add: uid });
  await loadGroup(id);
}

export async function leaveGroup(id: number) {
  await post(`/api/groups/${id}/leave`);
  useGroups.setState((s) => ({ list: s.list.filter((g) => g.id !== id) }));
}
