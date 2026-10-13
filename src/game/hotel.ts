// Hotel rooms: the first inside-inside areas. You book a room at Hamdala's reception, ride the lift up, and the room is
// its own little interior (game/interiors.ts) that is yours until the stay runs out. Leave and come back as you like.
// Rooms are places of their own (game/city.ts) that never show on the town map.

import { TIME_RATE } from './timeRates';

export const HOTEL_ID = 'hamdala';

export type RoomTypeId = 'standard' | 'deluxe' | 'executive' | 'presidential';

export interface RoomType {
  id: RoomTypeId;
  name: string;
  icon: string;
  /** Naira for one night (24 game hours) in Kaduna. The other cities charge more: see nightlyIn. */
  nightly: number;
  /** Which floor the room is on: the first digit of its door number. */
  floor: number;
  blurb: string;
  /** What you get, shown on the booking card. */
  perks: string[];
}

export const ROOM_TYPES: RoomType[] = [
  {
    id: 'standard', name: 'Standard Room', icon: '🛏️', nightly: 15_000, floor: 1,
    blurb: 'A clean bed, a shower and a small TV. Everything a tired traveller needs.',
    perks: ['Vitafoam bed', 'Shower & WC', 'TV', 'Tea kettle'],
  },
  {
    id: 'deluxe', name: 'Deluxe Room', icon: '🛋️', nightly: 40_000, floor: 2,
    blurb: 'Four-poster bed, a bathtub, and a minibar that somehow is never empty.',
    perks: ['Four-poster bed', 'Bathtub & hot shower', 'Minibar', 'Sofa & TV', 'Work desk'],
  },
  {
    id: 'executive', name: 'Executive Suite', icon: '💼', nightly: 120_000, floor: 3,
    blurb: 'A bedroom and a lounge. Room service comes to your own dining table.',
    perks: ['Separate lounge', 'Room service', 'Massage chair', 'Minibar', 'Bathtub & hot shower'],
  },
  {
    id: 'presidential', name: 'Presidential Suite', icon: '👑', nightly: 500_000, floor: 5,
    blurb: 'The whole top floor. Governors sleep here. A butler stands by the bar.',
    perks: ['Gold-leaf emperor bed', 'Jacuzzi', 'Private bar & butler', 'Grand piano', 'Home cinema', 'Cigar lounge'],
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOM_TYPES.map((r) => [r.id, r])) as Record<RoomTypeId, RoomType>;

/** How many times Kaduna's price a night costs in each city's hotel (game/regions.ts): the Hilton and Eko Hotel are big-city money. */
const CITY_RATE: Record<string, number> = { abuja: 2, lagos: 2.5, kano: 1.3 };
/** Naira for one night in that city's hotel. */
export const nightlyIn = (room: RoomType, city: string) => Math.round(room.nightly * (CITY_RATE[city] ?? 1));

/** The room you hold: its type, door number, and the game minute it stops being yours. */
export interface HotelStay {
  room: RoomTypeId;
  no: number;
  until: number;
}

/**
 * Every room you hold, by city (game/regions.ts). Each city's hotel keeps its own book: Abuja's hotel has the same
 * place id as Kaduna's (game/abuja.ts), but a key from one opens nothing in the other.
 */
export type HotelStays = Record<string, HotelStay>;
/** The room you hold in that city's hotel, if any. */
export const stayIn = (stays: HotelStays, city: string): HotelStay | null => stays[city] ?? null;

/** A night is 24 game hours from the minute you pay. The world clock never stops, so that is DAY_REAL_MINUTES of real time, playing or not. */
export const NIGHT = 24 * 60;
/** Most nights you can hold at once, booked or extended. */
export const MAX_NIGHTS = 14;
/** Reception warns you this many game minutes before the room is taken back. */
export const CHECKOUT_WARNING = 60;

const PREFIX = `${HOTEL_ID}_`;
/** The place / interior id of a room type. */
export const roomPlaceId = (room: RoomTypeId) => `${PREFIX}${room}`;
export const roomTypeOf = (placeId: string | null | undefined): RoomType | undefined =>
  placeId?.startsWith(PREFIX) ? ROOM_BY_ID[placeId.slice(PREFIX.length) as RoomTypeId] : undefined;
export const isHotelRoom = (placeId: string | null | undefined) => !!roomTypeOf(placeId);

/** Game minutes left on a stay (0 once it is over). */
export const stayLeft = (stay: HotelStay | null, minutes: number) => (stay ? Math.max(0, stay.until - minutes) : 0);
export const stayActive = (stay: HotelStay | null, minutes: number): stay is HotelStay => stayLeft(stay, minutes) > 0;
/** Whole nights you can still add before hitting MAX_NIGHTS. */
export const nightsFree = (stay: HotelStay | null, minutes: number) => Math.max(0, Math.floor((MAX_NIGHTS * NIGHT - stayLeft(stay, minutes)) / NIGHT));

/** A door number on the room type's floor. */
export const roomNumber = (room: RoomTypeId) => ROOM_BY_ID[room].floor * 100 + 1 + Math.floor(Math.random() * 12);

/** Real time left for a number of game minutes, as a countdown: "2:05:09" or "14:32". */
export function stayCountdown(mins: number) {
  const secs = Math.max(0, Math.ceil(mins / TIME_RATE));
  const h = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = String(secs % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
