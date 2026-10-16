// A trip to a place in another city, made in one press (ui/TripSheet.tsx): a ride to the airport, the flight, then
// a ride on from the airport you land at. The store already makes the first two legs (a trip to the airport that
// boards a flight on arrival); this notes where you were headed and sets off on the last leg once you land.
// Going home to a house in another city (ui/TravelPicker.tsx) is the same trip, ending at your door.
import { create } from 'zustand';
import type { Place } from './city';
import { cityMap } from './city';
import { regionPlace } from './regions';
import { tripHooks, useGame, type TravelMode } from './store';

export interface CityTrip {
  /** The city the place is in: the cities share place ids. */
  city: string;
  place: Place;
  /** Stop once you have landed: the trip is only getting you to the city (a house visit goes on from there). */
  stop?: boolean;
}

/** How the trip crosses between cities: an airline seat, or a standard-class train ticket (game/transport.ts). */
export type Via = 'air' | 'rail';

/** A trip under way: to a place, or home to the house `home` names (its id, 'lease' or 'gov', as goHome takes it). */
type Going = { city: string; place?: Place; home?: string; stop?: boolean; mode: TravelMode; via: Via; at: number };

/** `offer`: the trip the sheet is asking about. `going`: the one under way, until you land and ride on. */
export const useTrip = create<{ offer: CityTrip | null; going: Going | null }>(() => ({ offer: null, going: null }));

const AIRPORT_ID = 'airport';
const STATION_ID = 'station';
/** A trip that stalled (no money at the gate, a closed airport) is forgotten after this long. */
const TRIP_EXPIRES_MS = 15 * 60_000;
/** A beat after landing, so you see where you are before the ride pulls up. */
const LANDED_PAUSE_MS = 900;

/** The ticketed flight from one city straight to another, if there is one. */
export const tripFlight = (from: string, to: string) =>
  regionPlace(from, AIRPORT_ID)?.actions.find((a) => a.effect === 'travel' && a.destination === to && !a.jet);

/** The standard-class train from one city straight to another, if a line runs there (game/transport.ts). */
export const tripTrain = (from: string, to: string) =>
  regionPlace(from, STATION_ID)?.actions.find((a) => a.effect === 'travel' && a.rail && a.cls === 'standard' && a.destination === to);
/** The ticket for the way `via` crosses between two cities, and where you board it. */
export const tripTicket = (from: string, to: string, via: Via) =>
  ({ ticket: via === 'rail' ? tripTrain(from, to) : tripFlight(from, to), hub: via === 'rail' ? STATION_ID : AIRPORT_ID });

/** Set off on the trip on offer: to the airport (or the station) by `mode`, onto the flight or the train, and by `mode` again at the other end. */
export function startTrip(mode: TravelMode, via: Via = 'air') {
  const { offer } = useTrip.getState();
  useTrip.setState({ offer: null });
  if (offer) setOff(offer, mode, via);
}

/** Set off home to a house in another city: `home` is the house's id, 'lease' or 'gov'. */
export const startHomeTrip = (city: string, home: string, mode: TravelMode, via: Via = 'air') => setOff({ city, home }, mode, via);

function setOff(to: Omit<Going, 'mode' | 'via' | 'at'>, mode: TravelMode, via: Via) {
  const g = useGame.getState();
  const { ticket, hub } = tripTicket(g.destinationId, to.city, via);
  if (!ticket) return;
  g.startPlace(hub, mode);
  const s = useGame.getState();
  if (s.task?.actionId === 'enter' && s.task.placeId === hub) {
    useGame.setState({ task: { ...s.task, actionAfterTravel: ticket.id } });
  } else if (s.view === 'place' && s.insideId === hub) {
    // Already at the door: straight to the gate (or the platform).
    s.startPlaceAction(hub, ticket.id);
  } else return; // could not set off: the store has said why
  // Noted last: setting off ends whatever you were doing, which calls a trip off.
  useTrip.setState({ going: { ...to, mode, via, at: Date.now() } });
}

tripHooks.cancel = () => useTrip.setState({ going: null });

let landed: ReturnType<typeof setTimeout> | undefined;
useGame.subscribe((s) => {
  const trip = useTrip.getState().going;
  if (!trip || landed) return;
  if (Date.now() - trip.at > TRIP_EXPIRES_MS) return useTrip.setState({ going: null });
  if (cityMap(s.destinationId).id !== trip.city || s.view !== 'city' || s.task) return;
  landed = setTimeout(() => {
    landed = undefined;
    if (useTrip.getState().going !== trip) return;
    useTrip.setState({ going: null });
    if (trip.stop) return;
    const g = useGame.getState();
    if (g.view !== 'city' || g.task) return;
    if (!trip.place) return g.goHome(trip.mode, undefined, trip.home);
    g.startPlace(trip.place.id, trip.mode);
    // No ride (short of the fare, the place is shut): leave its travel sheet open instead.
    if (!useGame.getState().task) g.selectPlace(trip.place.id);
  }, LANDED_PAUSE_MS);
});
