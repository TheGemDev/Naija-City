// The hotel (game/hotel.ts): reception's booking sheet, the card you see while up in your room,
// and the key chip that follows you round town while the room is still yours. Each city's hotel has its own rooms:
// everything here is about the one in the city you are in.

import { useState } from 'react';
import { dayOf, naira, useGame } from '../game/store';
import { HOTEL_ID, MAX_NIGHTS, ROOM_BY_ID, ROOM_TYPES, isHotelRoom, nightlyIn, nightsFree, stayActive, stayCountdown, stayIn, type HotelStay, type RoomTypeId } from '../game/hotel';
import { regionPlace } from '../game/regions';
import { DAY_REAL_MINUTES } from '../game/timeRates';
import { Emoji, Sign } from './Icons';
import { formatClock } from './Hud';
import './hotel.css';

/** The room you hold in the city you are in, while it is still yours. A room in another city's hotel is not this one. */
const stayHere = (s: { hotelStays: Record<string, HotelStay>; destinationId: string; minutes: number }) => {
  const stay = stayIn(s.hotelStays, s.destinationId);
  return stayActive(stay, s.minutes) ? stay : null;
};

/** The stay you hold here right now (null once it has run out), re-read once a second for the countdown. */
function useStay() {
  const stay = useGame(stayHere);
  const left = useGame((s) => { const here = stayHere(s); return here ? stayCountdown(here.until - s.minutes) : ''; });
  return stay ? { ...stay, left, type: ROOM_BY_ID[stay.room] } : null;
}

/** This city's hotel: Hamdala in Kaduna, the Hilton in Abuja. */
const useHotelName = () => useGame((s) => regionPlace(s.destinationId, HOTEL_ID)?.name ?? 'the hotel');

const checkout = (until: number) => `${formatClock(until)}, Day ${dayOf(until)}`;

/** Up in the room: whose room it is, how long is left, and a way to add nights without going down. */
export function RoomCard() {
  const inRoom = useGame((s) => s.view === 'place' && isHotelRoom(s.insideId));
  // The action sheet, the phone and the desk all use this strip of screen.
  const busy = useGame((s) => !!s.selectedId || !!s.panel || s.hotelDesk);
  const low = useGame((s) => { const here = stayHere(s); return !!here && here.until - s.minutes <= 60; });
  const stay = useStay();
  if (!inRoom || busy || !stay) return null;
  return (
    <div className={`room-card ${low ? 'low' : ''}`} role="status">
      <span className="room-card-icon"><Emoji char={stay.type.icon} size={26} /></span>
      <div className="room-card-text">
        <b>{stay.type.name} · {stay.no}</b>
        <small>Checkout {checkout(stay.until)}</small>
      </div>
      <div className="room-card-time" aria-label={`${stay.left} left`}>
        <b>{stay.left}</b>
        <small>left</small>
      </div>
      <button type="button" onClick={() => useGame.getState().setHotelDesk(true)}>+ Nights</button>
    </div>
  );
}

/** Anywhere else in town: a reminder that you still hold a room. In the lobby it sends you to the lift. */
export function StayChip() {
  const where = useGame((s) => (s.view !== 'place' ? 'out' : s.insideId === HOTEL_ID ? 'lobby' : isHotelRoom(s.insideId) ? 'room' : 'out'));
  const locked = useGame((s) => !!s.jailedUntil || !!s.heldUntil);
  const stay = useStay();
  const hotel = useHotelName();
  if (!stay || where === 'room') return null;
  return (
    <button
      type="button"
      className="chip stay-chip"
      aria-label={where === 'lobby' ? `Go up to room ${stay.no}` : `Room ${stay.no} at ${hotel}, ${stay.left} left`}
      onClick={() => {
        const g = useGame.getState();
        if (where === 'lobby') return g.startPlaceAction(HOTEL_ID, 'hotel_lift');
        if (locked) return g.toast(`🔑 Room ${stay.no} at ${hotel} is paid for another ${stay.left}.`);
        // Out to the map with the hotel picked, so you choose how to get there.
        g.setPanel(null);
        if (g.view !== 'city') g.openMap();
        const now = useGame.getState();
        if (now.view === 'city') now.selectPlace(HOTEL_ID);
      }}
    >
      <Emoji char="🔑" size={14} /> Room {stay.no} · {stay.left}
    </button>
  );
}

/** Floating pill shown while you are in the hotel lobby: straight to reception's booking sheet. */
export function HotelLauncher() {
  const here = useGame((s) => s.view === 'place' && s.insideId === HOTEL_ID);
  // The action sheet, the phone and the desk all use this strip of screen.
  const busy = useGame((s) => !!s.selectedId || !!s.panel || s.hotelDesk);
  const stay = useStay();
  if (!here || busy) return null;
  return (
    <button type="button" className="venue-bet-launch hotel" onClick={() => useGame.getState().setHotelDesk(true)}>
      <span className="vbl-icon"><Emoji char="🛎️" size={18} /></span> {stay ? `Room ${stay.no} · add nights` : 'Book a room'}
    </button>
  );
}

/** Reception: pick a room and how many nights. Also reached from the room card, to add nights from upstairs. */
export function HotelDesk() {
  const open = useGame((s) => s.hotelDesk && s.view === 'place' && (s.insideId === HOTEL_ID || isHotelRoom(s.insideId)));
  const inLobby = useGame((s) => s.insideId === HOTEL_ID);
  const money = useGame((s) => s.money);
  const city = useGame((s) => s.destinationId);
  const free = useGame((s) => nightsFree(stayHere(s), s.minutes));
  const stay = useStay();
  const hotel = useHotelName();
  const [picked, setPicked] = useState<RoomTypeId | null>(null);
  const [nights, setNights] = useState(1);
  if (!open) return null;
  const g = useGame.getState();
  const close = () => g.setHotelDesk(false);
  const room = picked ?? stay?.room ?? null;
  return (
    <div className="sheet place-sheet hotel-desk" role="dialog" aria-label={`${hotel} reception`}>
      <div className="sheet-head">
        <h3>🛎️ {hotel} reception</h3>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </div>
      {stay ? (
        <div className="hotel-stay">
          <span><Emoji char="🔑" size={22} /></span>
          <div>
            <b>Room {stay.no} · {stay.type.name}</b>
            <small>Yours for {stay.left} more · checkout {checkout(stay.until)}</small>
          </div>
          {inLobby && <button type="button" className="btn sm" onClick={() => { close(); g.startPlaceAction(HOTEL_ID, 'hotel_lift'); }}>Go up 🛗</button>}
        </div>
      ) : (
        <p className="muted">Good day! Which room can we give you? Leave and come back whenever you like: the room is yours until checkout.</p>
      )}
      <div className="hotel-rooms">
        {ROOM_TYPES.map((t) => {
          const on = room === t.id;
          const mine = stay?.room === t.id;
          const most = mine ? free : MAX_NIGHTS;
          const n = Math.max(1, Math.min(nights, most));
          const rate = nightlyIn(t, city);
          const cost = rate * n;
          return (
            <div key={t.id} className={`hotel-room ${on ? 'on' : ''} ${t.id}`}>
              <button type="button" className="hotel-room-head" aria-expanded={on} onClick={() => { setPicked(t.id); setNights(1); }}>
                <span className="hotel-room-icon"><Emoji char={t.icon} size={28} /></span>
                <span className="hotel-room-text">
                  <b>{t.name}{mine && <i>Your room</i>}</b>
                  <small>{t.blurb}</small>
                </span>
                <span className="hotel-room-price"><b>{naira(rate)}</b><small>a night</small></span>
              </button>
              {on && (
                <div className="hotel-room-body">
                  <div className="hotel-perks">{t.perks.map((perk) => <span key={perk}>{perk}</span>)}</div>
                  {most < 1 ? (
                    <p className="muted small">You already hold this room for the most nights we can book ({MAX_NIGHTS}).</p>
                  ) : (
                    <div className="hotel-book">
                      <div className="hotel-nights" role="group" aria-label="Nights">
                        <button type="button" aria-label="One night less" disabled={n <= 1} onClick={() => setNights(n - 1)}><Sign minus /></button>
                        <b>{n} night{n > 1 ? 's' : ''}</b>
                        <button type="button" aria-label="One night more" disabled={n >= most} onClick={() => setNights(n + 1)}><Sign /></button>
                      </div>
                      <button type="button" className="btn go" disabled={money < cost} onClick={() => g.bookRoom(t.id, n)}>
                        {mine ? 'Add' : stay ? 'Move here' : 'Book'} · {naira(cost)}
                      </button>
                    </div>
                  )}
                  {stay && !mine && <p className="muted small">Moving gives up Room {stay.no}. Nights left on it are not refunded.</p>}
                  {money < cost && most >= 1 && <p className="muted small">You need {naira(cost - money)} more.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small hotel-note">A night is 24 game hours, about {DAY_REAL_MINUTES} minutes of real time. The clock keeps running while you are out, or offline.</p>
    </div>
  );
}
