// Getting to work. When your shift is near, a chip (ui/WorkChip.tsx) offers to take you there: the travel sheet for
// your workplace when it is in the city you are in, the whole trip by air (ui/TripSheet.tsx) when it is in another.
// Whichever way you go, you are clocked in as you walk through the door.

import { create } from 'zustand';
import { cityMap } from './city';
import { employment, shiftClock, shiftHours, type Employment, type ShiftClock } from './jobs';
import { regionOf } from './regions';
import { flightOf, useGame, workHooks, type GameState } from './store';
import { tripFlight, useTrip } from './trip';

/**
 * `soon`: the shift starts within the hour. `go`: it is on and you are not there. `here`: it is on and you are
 * standing in your workplace. `early`: you are in your workplace before it starts.
 */
export type WorkCall = 'soon' | 'go' | 'here' | 'early';

export interface WorkStatus extends Employment {
  call: WorkCall;
  clock: ShiftClock;
  /** The workplace is in another city: getting there is a flight. */
  away: boolean;
}

type Seen = Pick<GameState, 'jobId' | 'jobCity' | 'minutes' | 'workedDay' | 'view' | 'insideId' | 'destinationId' | 'task'>;

const atWork = (s: Pick<GameState, 'task'>) => s.task?.actionId === 'work';

/** In your workplace, in the city it is in. */
const inWorkplace = (s: Pick<GameState, 'view' | 'insideId' | 'destinationId'>, work: Employment) =>
  s.view === 'place' && s.insideId === work.place.id && cityMap(s.destinationId).id === work.city;

/** What your job wants of you right now: nothing (null) when you have none, have worked today, are at work, or it is not time. */
export function workStatus(s: Seen): WorkStatus | null {
  const work = employment(s);
  if (!work || atWork(s)) return null;
  const clock = shiftClock(work.job, s.minutes);
  if (clock.phase === 'off' || s.workedDay === clock.day) return null;
  const here = inWorkplace(s, work);
  const call: WorkCall = clock.phase === 'on' ? (here ? 'here' : 'go') : here ? 'early' : 'soon';
  return { ...work, call, clock, away: cityMap(s.destinationId).id !== work.city };
}

/** A short key for `workStatus`, for components that only need to know when it changes. */
export const workKey = (s: Seen) => {
  const w = workStatus(s);
  return w ? `${w.call}:${w.clock.day}:${w.job.id}:${w.city}` : '';
};

/** The shift (its day) you set off for, so walking into your workplace clocks you in. */
export const useCommute = create<{ day: number | null }>(() => ({ day: null }));

/** You asked for work in the air: the way there is shown once you land. */
let onLanding = false;

/** Take me to work: clock in if you are there, otherwise the sheet that gets you there. */
export function goToWork() {
  const g = useGame.getState();
  const work = employment(g);
  if (!work) return g.toast('Get a job first. Open Phone → Jobs 📱');
  if (atWork(g)) return;
  if (flightOf(g)) {
    // In the air there is nowhere to go: leaving for the map would call the flight off.
    const trip = useTrip.getState().going;
    const train = flightOf(g) === 'train';
    if (trip?.city === work.city && trip.place?.id === work.place.id) return g.toast(`${train ? '🚆' : '✈️'} You are on your way to work`);
    onLanding = true;
    return g.toast(train ? '🚆 You are on the train. The way to work comes up when you pull in' : '✈️ You are in the air. The way to work comes up when you land');
  }
  const clock = shiftClock(work.job, g.minutes);
  if (clock.phase === 'off') return g.toast(`Your shift is ${shiftHours(work.job)}`);
  if (g.workedDay === clock.day) return g.toast('You already worked today. Rest!');
  if (inWorkplace(g, work)) {
    if (clock.phase === 'on') return g.startPlaceAction(work.place.id, 'work');
    useCommute.setState({ day: clock.day });
    return g.toast(`You are early. You will be clocked in at ${work.job.start}:00`);
  }
  const from = cityMap(g.destinationId).id;
  if (from !== work.city && !tripFlight(from, work.city)) return g.toast(`${work.place.icon} ${work.place.name} is in ${regionOf(work.city).name}. Fly there from the airport ✈️`);
  g.setPanel(null);
  if (g.view !== 'city') g.openMap();
  // Locked up or flat on the floor: the store has said why.
  if (useGame.getState().view !== 'city') return;
  useCommute.setState({ day: clock.day });
  if (from !== work.city) return useTrip.setState({ offer: { city: work.city, place: work.place } });
  useGame.getState().selectPlace(work.place.id);
  if (useGame.getState().placeId !== work.place.id) g.toast('Park first, then head to work');
}

workHooks.go = goToWork;

// Landed: show the way to work you asked for in the air (a trip of its own rides on by itself, game/trip.ts).
useGame.subscribe((s) => {
  if (!onLanding || flightOf(s)) return;
  onLanding = false;
  // A beat after landing, so you see where you are first; and never from inside another update.
  setTimeout(() => {
    const g = useGame.getState();
    // Not if the flight was called off (you are still in the airport), or something else has started.
    if (g.view === 'city' && !g.task && !useTrip.getState().going && workStatus(g)) goToWork();
  }, 900);
});

// You set off for work and have walked in: clock in, or wait at your post for the shift to start.
let clocking: ReturnType<typeof setTimeout> | undefined;
useGame.subscribe((s) => {
  const { day } = useCommute.getState();
  if (day === null || clocking || s.view !== 'place' || s.task) return;
  const work = employment(s);
  if (!work || !inWorkplace(s, work)) return;
  const clock = shiftClock(work.job, s.minutes);
  // The shift you set off for has gone, or you have done it.
  if (clock.day !== day || s.workedDay === day) return useCommute.setState({ day: null });
  if (clock.phase !== 'on') return;
  // A beat after the door, so you see where you are first; and never from inside another update.
  clocking = setTimeout(() => {
    clocking = undefined;
    useCommute.setState({ day: null });
    const g = useGame.getState();
    if (g.task || !inWorkplace(g, work)) return;
    g.setPlaceHubOpen(false);
    g.startPlaceAction(work.place.id, 'work');
  }, 700);
});
