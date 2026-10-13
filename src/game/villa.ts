// Aso Villa: the President's office in Abuja's Three Arms Zone (game/abuja.ts). Anybody can walk in and wait for an
// audience. Whoever holds the presidency also has the Presidential Suite behind the office: a room inside the place,
// like a hotel room (game/hotel.ts), that is theirs for as long as they hold the office and costs nothing.

import { HOTEL_ID, isHotelRoom } from './hotel';

export const VILLA_ID = 'villa';
/** The place / interior id of the President's suite. Not on the map: you go through from the office. */
export const SUITE_ID = 'villa_suite';

export const isVillaSuite = (placeId: string | null | undefined) => placeId === SUITE_ID;
/** A room inside another place that is yours alone: a hotel room, the President's suite. */
export const isPrivateRoom = (placeId: string | null | undefined) => isHotelRoom(placeId) || isVillaSuite(placeId);
/** The place on the map that a private room is inside; any other place is itself. */
export const roomParent = (placeId: string | null | undefined) => (isHotelRoom(placeId) ? HOTEL_ID : isVillaSuite(placeId) ? VILLA_ID : placeId);
