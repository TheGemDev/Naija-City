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
}

/** A trip under way: to a place, or home to the house `home` names (its id, 'lease' or 'gov', as goHome takes it). */
type Going = { city: string; place?: Place; home?: string; mode: TravelMode; at: number };

/** `offer`: the trip the sheet is asking about. `going`: the one under way, until you land and ride on. */
export const useTrip = create<{ offer: CityTrip | null; going: Going | null }>(() => ({ offer: null, going: null }));

const AIRPORT_ID = 'airport';
/** A trip that stalled (no money at the gate, a closed airport) is forgotten after this long. */
const TRIP_EXPIRES_MS = 15 * 60_000;
/** A beat after landing, so you see where you are before the ride pulls up. */
const LANDED_PAUSE_MS = 900;

/** The ticketed flight from one city straight to another, if there is one. */
export const tripFlight = (from: string, to: string) =>
  regionPlace(from, AIRPORT_ID)?.actions.find((a) => a.effect === 'travel' && a.destination === to && !a.jet);

/** Set off on the trip on offer: to the airport by `mode`, onto the flight, and by `mode` again at the other end. */
export function startTrip(mode: TravelMode) {
  const { offer } = useTrip.getState();
  useTrip.setState({ offer: null });
  if (offer) setOff(offer, mode);
}

/** Set off home to a house in another city: `home` is the house's id, 'lease' or 'gov'. */
export const startHomeTrip = (city: string, home: string, mode: TravelMode) => setOff({ city, home }, mode);

function setOff(to: Omit<Going, 'mode' | 'at'>, mode: TravelMode) {
  const g = useGame.getState();
  const flight = tripFlight(g.destinationId, to.city);
  if (!flight) return;
  g.startPlace(AIRPORT_ID, mode);
  const s = useGame.getState();
  if (s.task?.actionId === 'enter' && s.task.placeId === AIRPORT_ID) {
    useGame.setState({ task: { ...s.task, actionAfterTravel: flight.id } });
  } else if (s.view === 'place' && s.insideId === AIRPORT_ID) {
    // Already at the door: straight to the gate.
    s.startPlaceAction(AIRPORT_ID, flight.id);
  } else return; // could not set off: the store has said why
  // Noted last: setting off ends whatever you were doing, which calls a trip off.
  useTrip.setState({ going: { ...to, mode, at: Date.now() } });
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
    const g = useGame.getState();
    if (g.view !== 'city' || g.task) return;
    if (!trip.place) return g.goHome(trip.mode, undefined, trip.home);
    g.startPlace(trip.place.id, trip.mode);
    // No ride (short of the fare, the place is shut): leave its travel sheet open instead.
    if (!useGame.getState().task) g.selectPlace(trip.place.id);
  }, LANDED_PAUSE_MS);
});
