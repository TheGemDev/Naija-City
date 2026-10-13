// Skills, job promotions and owned businesses on the client (server side: worker/career.ts).

import { create } from 'zustand';
import { careerHooks, careerState, type BizSize, type BusinessType, type SkillId } from '../game/career';
import { naira, useGame } from '../game/store';
import { cityHere } from './market';
import { api, useSession } from './session';
import { refreshBalance, setServerBalance } from './wallet';

export interface SkillInfo { id: SkillId; xp: number; level: number; next: number | null; fee: number; readyAt: number }
export interface JobInfo { id: string; shifts: number; rank: number; title: string; mult: number; nextAt: number | null }
export interface BusinessListing { id: number; product: string; price: number; stock: number; sold: number }
export interface BizInfo {
  id: number; type: BusinessType; name: string; level: number; staff: number; slots: number;
  /** Something is on the shelf for players to buy. */
  open: boolean;
  /** The owner's badge: an emoji on a colour. */
  icon: string; color: string;
  /** How big the building is, and how many units of one product its shelf holds. */
  size: BizSize; shelf: number;
  area: string; listings: BusinessListing[];
  /** The city the stall is in, the place there, and whether the stall is still held (it lapses after days with an empty shelf). */
  city: string; place: string; hasStall: boolean;
  /** Left over from timed stock, which is gone: what it earned and the owner hasn't collected yet. */
  pending: number; upgrade: number | null;
}
interface Career { skills: SkillInfo[]; jobs: JobInfo[]; businesses: BizInfo[]; loaded: boolean }

export const useCareer = create<Career>(() => ({ skills: [], jobs: [], businesses: [], loaded: false }));

const toast = (t: string) => useGame.getState().toast(t);

async function call<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast((data as { error?: string }).error ?? 'Something went wrong');
      return null;
    }
    return data as T;
  } catch {
    toast('No connection');
    return null;
  }
}

export async function loadCareer() {
  const c = await call<{ skills: SkillInfo[]; jobs: JobInfo[]; mults: Record<string, number>; businesses: BizInfo[] }>('/api/career');
  if (!c) return;
  careerState.mult = c.mults;
  useCareer.setState({ skills: c.skills, jobs: c.jobs, businesses: c.businesses, loaded: true });
}

async function act<T extends { balance?: number }>(path: string, body: object, ok?: (r: T) => string | void) {
  const r = await call<T>(path, body);
  if (!r) return false;
  if (typeof r.balance === 'number') setServerBalance(r.balance);
  else refreshBalance();
  const msg = ok?.(r);
  if (msg) toast(msg);
  await loadCareer();
  return true;
}

export const trainSkill = (skill: SkillId) => act<{ level: number; balance: number }>('/api/career/train', { skill }, (r) => `Course done. Level ${r.level} 📚`);
careerHooks.train = (skill) => void trainSkill(skill);
export const buyBusiness = (b: { type: BusinessType; name: string; place: string; icon: string; color: string; size: BizSize }) =>
  act('/api/business/buy', { ...b, city: cityHere() }, () => 'Business opened 🎉');
export const brandBusiness = (id: number, name: string, icon: string, color: string) => act('/api/business/brand', { id, name, icon, color }, () => 'Saved');
export const collectBusiness = (id: number) => act<{ paid: number; xp: number; rent: number; balance: number }>('/api/business/collect', { id },
  (r) => `Collected ${naira(r.paid)}${r.xp ? ` · +${r.xp} xp` : ''}${r.rent ? ` · ${naira(r.rent)} rent to the treasury` : ''}`);
export const resizeBusiness = (id: number, size: BizSize) => act('/api/business/resize', { id, size }, () => 'Building work done 🏗️');
export const moveBusiness = (id: number, place: string) => act('/api/business/move', { id, place }, () => 'Business moved 🚚');
export const manageBusinessListing = (id: number, product: string, price: number, quantity: number) =>
  act('/api/business/listing', { id, product, price, quantity, requestId: crypto.randomUUID() },
    () => quantity > 0 ? 'Stock added to your shelf 📦' : 'Listing price updated');

export function startCareer() {
  const unsub = useSession.subscribe((s, p) => {
    if (s.user?.uid !== p.user?.uid) {
      if (s.user) void loadCareer();
      else {
        careerState.mult = {};
        useCareer.setState({ skills: [], jobs: [], businesses: [], loaded: false });
      }
    }
  });
  // A finished shift may earn a promotion.
  const unsubGame = useGame.subscribe((s, p) => {
    if (s.workDays !== p.workDays && useSession.getState().user) setTimeout(() => void loadCareer(), 3000);
  });
  if (useSession.getState().user) void loadCareer();
  return () => { unsub(); unsubGame(); };
}
