// Which office I hold right now: won in a shared election (net/civic.ts), or in a local campaign.

import type { PoliticalOffice } from '../game/civic';
import { ALLOCATION, CIVIC_CITIES, OFFICE_DEPARTMENT, OFFICES, type CivicCity, type Department } from '../game/civic';
import { LAMPS, ROADWORK } from '../game/roads';
import { useGame } from '../game/store';
import { useCivic } from './civic';
import { useSession } from './session';

const elected = (uid: string | undefined, data: ReturnType<typeof useCivic.getState>['data']): PoliticalOffice | null =>
  (uid && data && OFFICES.find((o) => data.policies[o]?.uid === uid)) || null;

/** The office I hold, if any. */
export const heldOffice = (): PoliticalOffice | null =>
  useGame.getState().governmentOffice ?? elected(useSession.getState().user?.uid, useCivic.getState().data);

export function useHeldOffice(): PoliticalOffice | null {
  const local = useGame((s) => s.governmentOffice);
  const uid = useSession((s) => s.user?.uid);
  const data = useCivic((s) => s.data);
  return local ?? elected(uid, data);
}

/** The cheapest thing each department pays for: under it, the budget is as good as empty. */
const CHEAPEST_REPAIR = Math.min(LAMPS.fixCost, ...Object.values(ROADWORK.fixCost));
const leastSpend = (department: Department) => (CIVIC_CITIES.includes(department as CivicCity) ? CHEAPEST_REPAIR : department === 'welfare' ? 500 : 0);

/** What the office I was elected to can spend right now: its department's share of the treasury. Null when I hold none. */
export function useOfficeBudget(): { office: PoliticalOffice; department: Department; budget: number; low: boolean } | null {
  const uid = useSession((s) => s.user?.uid);
  const data = useCivic((s) => s.data);
  const office = elected(uid, data);
  if (!office || !data) return null;
  const department = OFFICE_DEPARTMENT[office];
  const budget = ALLOCATION.budget(data.treasury, { ...ALLOCATION.defaults, ...data.allocation }[department]);
  return { office, department, budget, low: budget < leastSpend(department) };
}

/** True once the election results are in and I am not the one in that office: until then nobody is thrown out. */
export const lostOffice = (office: PoliticalOffice) => !!useCivic.getState().data && heldOffice() !== office;
