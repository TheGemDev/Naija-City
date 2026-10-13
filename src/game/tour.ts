// The city tour: a visitor who has not signed in looks round a city's real map from the landing page (ui/Landing.tsx).
// The map is the game's own scene, so the tour borrows the game's view and city while it is open and puts them back
// when it closes. Nothing here is saved: a visitor has no life yet.

import { create } from 'zustand';
import { useSession } from '../net/session';
import type { RegionId } from './regions';
import { useGame, type GameState } from './store';
import { holdDaylight } from './theme';

/** The city on show, or null when nobody is touring. */
export const useTour = create<{ city: RegionId | null }>(() => ({ city: null }));

/** What the game was showing before the tour took over. */
let before: Pick<GameState, 'view' | 'destinationId' | 'placeId' | 'insideId'> | null = null;

/** Show that city's map. Tapping the city already on show frames the whole map again. */
export function startTour(city: RegionId) {
  const s = useGame.getState();
  before ??= { view: s.view, destinationId: s.destinationId, placeId: s.placeId, insideId: s.insideId };
  useTour.setState({ city });
  holdDaylight(true);
  useGame.setState({ view: 'city', destinationId: city, placeId: null, insideId: null, teleportId: s.teleportId + 1 });
}

export function endTour() {
  if (!useTour.getState().city) return;
  useTour.setState({ city: null });
  holdDaylight(false);
  if (before) useGame.setState((s) => ({ ...before, teleportId: s.teleportId + 1 }));
  before = null;
}

// Signing in ends the tour at once, before the player's save is loaded over the borrowed view.
useSession.subscribe((s) => {
  if (s.status !== 'signedOut') endTour();
});
