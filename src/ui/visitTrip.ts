// Going to a house you were invited to is a journey, not a teleport: to the state it is in (the trip sheet), then to its
// estate (the travel sheet), and only once you are there do you walk in. The plan waits while you travel.

import { create } from 'zustand';
import { useGame } from '../game/store';
import { sectionOf } from '../game/estate';
import { regionPlace } from '../game/regions';
import { useTrip } from '../game/trip';
import { useVisit, type HouseVisit } from '../game/visits';
import { enterHouseVisit } from '../net/visit';
import { useTravel } from './TravelPicker';

export interface VisitPlan {
  /** The house's city, and its estate and plot if it stands in one. */
  city: string;
  region: string | null;
  slot: number | null;
  owner: string;
  /** Called on arrival: opens the door (the server lets you in only now). */
  finish(): Promise<HouseVisit>;
}

const EXPIRES_MS = 20 * 60_000;
const usePlan = create<{ plan: (VisitPlan & { at: number }) | null }>(() => ({ plan: null }));
let asked = { flight: false, estate: false };

function advance() {
  const { plan } = usePlan.getState();
  if (!plan) return;
  const g = useGame.getState();
  if (Date.now() - plan.at > EXPIRES_MS || useVisit.getState().current) return usePlan.setState({ plan: null });
  // On the way somewhere: wait to land.
  if (g.task) return;
  const here = g.destinationId === plan.city;
  const arrived = plan.region
    ? g.view === 'estate' && g.estateId === plan.region && (plan.slot === null || g.estateNo === sectionOf(plan.slot))
    : here && g.view === 'city';
  if (arrived) {
    usePlan.setState({ plan: null });
    plan.finish().then(enterHouseVisit).catch((e) => useGame.getState().toast(e instanceof Error ? e.message : 'Could not get into the house'));
    return;
  }
  if (g.view !== 'city' && g.view !== 'estate') return;
  if (!here) {
    // Another state: the trip sheet that takes you straight there.
    const airport = regionPlace(plan.city, 'airport');
    if (g.view === 'city' && airport && !asked.flight) {
      asked.flight = true;
      useTrip.setState({ offer: { city: plan.city, place: airport, stop: true } });
    }
    return;
  }
  if (plan.region && !asked.estate) {
    asked.estate = true;
    useTravel.getState().ask({ kind: 'estate', region: plan.region, no: plan.slot === null ? undefined : sectionOf(plan.slot) });
  }
}

useGame.subscribe(advance);

/** Set off for a house. Nothing happens to you until you get there. */
export function planVisit(plan: VisitPlan) {
  asked = { flight: false, estate: false };
  usePlan.setState({ plan: { ...plan, at: Date.now() } });
  const g = useGame.getState();
  if (g.view !== 'city' && g.view !== 'estate') g.toast(`🏠 Head out onto the map to set off for @${plan.owner}’s house.`);
  advance();
}
