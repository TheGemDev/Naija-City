// Sharing where you are in a chat (ui/Messages.tsx). The location travels as the place's share link (placeLink in
// net/deeplink.ts) in an ordinary text message, so an app that hasn't updated yet still shows a link it can open.

import { avatarCell } from './avatar';
import { cityMap, type Place } from './city';
import './regions'; // the other cities' maps
import { useGame } from './store';
import { roomParent } from './villa';

export interface SharedPlace {
  /** The city the place is in: the cities share place ids. */
  city: string;
  place: Place;
}

const LINK = /^https:\/\/naija\.city\/p\/(?:([a-z]{1,20})\/)?([a-z_]{1,30})\/?$/;

/** The place a chat message points at, when the whole message is one place link. */
export function sharedPlace(text: string): SharedPlace | null {
  const m = text.trim().match(LINK);
  if (!m) return null;
  const city = cityMap(m[1] ?? 'kaduna');
  // An unknown city falls back to Kaduna's map: that is not the place they meant.
  if (city.id !== (m[1] ?? 'kaduna')) return null;
  const place = city.placeById[m[2]];
  // 'home' is a different house for everybody.
  return place && place.id !== 'home' ? { city: city.id, place } : null;
}

/**
 * Where you are, as somewhere another player can travel to: the place you are inside (a hotel room is the hotel),
 * or the nearest one when you are out on the street. Null at home, in an estate, or anywhere that isn't on the map.
 */
export function placeToShare(): SharedPlace | null {
  const s = useGame.getState();
  const map = cityMap(s.destinationId);
  if (s.view === 'place') {
    const place = map.placeById[roomParent(s.insideId) ?? ''];
    return place && place.id !== 'home' ? { city: map.id, place } : null;
  }
  if (s.view !== 'city') return null;
  const at = avatarCell();
  const far = (p: Place) => Math.hypot(p.door.x - at.x, p.door.z - at.z);
  const place = map.places.filter((p) => p.id !== 'home').reduce<Place | null>((best, p) => (!best || far(p) < far(best) ? p : best), null);
  return place ? { city: map.id, place } : null;
}
