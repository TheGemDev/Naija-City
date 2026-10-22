// One press to a place in another city (game/trip.ts): the ride to the airport, the flight and the ride on from
// the airport you land at, shown as one route with one price.

import { useEffect, useState } from 'react';
import { naira, ticketOf, useGame, type TravelMode } from '../game/store';
import { avatarCell } from '../game/avatar';
import type { Cell } from '../game/grid';
import { kmBetween } from '../game/fares';
import { regionOf, regionPlace } from '../game/regions';
import { startTrip, tripTicket, tripTrain, useTrip, type Via } from '../game/trip';
import { Emoji } from './Icons';
import { useTravel } from './TravelPicker';
import { fareOf } from './TravelSheet';
import { WorkNote } from './WorkChip';

const RIDES: { mode: TravelMode; icon: string; label: string }[] = [
  { mode: 'walk', icon: '🚶🏾', label: 'Trek' },
  { mode: 'keke', icon: '🛺', label: 'Keke' },
  { mode: 'cab', icon: '🚕', label: 'Cab' },
];

const flightTime = (minutes: number) => [minutes >= 60 ? `${Math.floor(minutes / 60)} hr` : '', minutes % 60 ? `${minutes % 60} min` : ''].filter(Boolean).join(' ');

/** Where a trip by `via` lets you out in a city: its station or its airport. */
export const arrivalDoor = (city: string, via: Via) => regionPlace(city, via === 'rail' ? 'station' : 'airport')?.door ?? { x: 0, z: 0 };

/**
 * What each leg of a trip to another city costs: the ride from `from` to the airport (or the station), the ticket
 * after any fare subsidy, and a ride of `endKm` at the other end. Null when no flight (or train) goes there.
 */
export function tripLegs(fromId: string, toId: string, mode: TravelMode, from: Cell, endKm: number, via: Via = 'air') {
  const { ticket: flight, hub } = tripTicket(fromId, toId, via);
  const airport = regionPlace(fromId, hub);
  if (!flight || !airport) return null;
  const toAirport = fareOf(mode, kmBetween(from, airport.door));
  const ticket = ticketOf(flight, fromId, useGame.getState().fares)?.price ?? flight.cost ?? 0;
  const toEnd = fareOf(mode, endKm);
  return { flight, airport, toAirport, ticket, toEnd, total: toAirport + ticket + toEnd, via };
}

/** The legs of a trip to another city as one route, and the choice of ride for the two on the ground. `end` finishes "Keke …": "to the mall", "home". */
export function TripRoute({ fromId, toId, end, legs, mode, setMode, setVia }: {
  fromId: string; toId: string; end: string; legs: NonNullable<ReturnType<typeof tripLegs>>; mode: TravelMode; setMode(mode: TravelMode): void;
  /** Offered when a train runs between the two cities as well as a flight: the chip to pick one. */
  setVia?(via: Via): void;
}) {
  const from = regionOf(fromId);
  const to = regionOf(toId);
  const ride = RIDES.find((r) => r.mode === mode) ?? RIDES[1];
  const rail = legs.via === 'rail';
  return (
    <>
      <p className="muted small trip-where">You are in {from.name}. One press takes you all the way.</p>
      {setVia && tripTrain(fromId, toId) && (
        <div className="pills trip-via" role="group" aria-label="Fly or take the train">
          <button className={!rail ? 'on' : ''} aria-pressed={!rail} onClick={() => setVia('air')}><Emoji char="✈️" size={15} /> Fly</button>
          <button className={rail ? 'on' : ''} aria-pressed={rail} onClick={() => setVia('rail')}><Emoji char="🚆" size={15} /> Train</button>
        </div>
      )}
      <ol className="trip-steps">
        <li>
          <span className="trip-icon"><Emoji char={ride.icon} size="1em" /></span>
          <span className="trip-text"><b>{ride.label} to {legs.airport.name}</b><small>{from.name}</small></span>
          <em>{legs.toAirport ? naira(legs.toAirport) : 'Free'}</em>
        </li>
        <li>
          <span className="trip-icon"><Emoji char={rail ? '🚆' : '✈️'} size="1em" /></span>
          <span className="trip-text"><b>{rail ? 'Train' : 'Fly'} {from.name} → {to.name}</b><small>{flightTime(legs.flight.minutes)} · {rail ? 'standard class' : 'one-way ticket'}{ticketOf(legs.flight, fromId, useGame.getState().fares)?.off ? ' · govt subsidy' : ''}</small></span>
          <em>{naira(legs.ticket)}</em>
        </li>
        <li>
          <span className="trip-icon"><Emoji char={ride.icon} size="1em" /></span>
          <span className="trip-text"><b>{ride.label} {end}</b><small>{to.name}</small></span>
          <em>{legs.toEnd ? naira(legs.toEnd) : 'Free'}</em>
        </li>
      </ol>
      <div className="pills trip-rides" role="group" aria-label="Ride on the ground">
        {RIDES.map((r) => (
          <button key={r.mode} className={r.mode === mode ? 'on' : ''} aria-pressed={r.mode === mode} onClick={() => setMode(r.mode)}>
            <Emoji char={r.icon} size={15} /> {r.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function TripSheet() {
  const offer = useTrip((s) => s.offer);
  const view = useGame((s) => s.view);
  const fromId = useGame((s) => s.destinationId);
  const money = useGame((s) => s.money);
  const [mode, setMode] = useState<TravelMode>('keke');
  const [via, setVia] = useState<Via>('air');
  useGame((s) => s.fares);
  // One travel sheet at a time; and the offer is for the map you were on when you asked.
  useEffect(() => {
    if (!offer) return;
    if (view !== 'city') return useTrip.setState({ offer: null });
    useGame.getState().selectPlace(null);
    useTravel.getState().close();
  }, [offer, view]);
  if (!offer || view !== 'city') return null;
  const { place } = offer;
  const legs = tripLegs(fromId, offer.city, mode, avatarCell(), kmBetween(arrivalDoor(offer.city, via), place.door), via)
    ?? tripLegs(fromId, offer.city, mode, avatarCell(), kmBetween(arrivalDoor(offer.city, 'air'), place.door));
  if (!legs) return null;
  const { total } = legs;
  const to = regionOf(offer.city);
  const close = () => useTrip.setState({ offer: null });
  return (
    <div className="sheet place-sheet travel-sheet" role="dialog" aria-label="Trip to another city">
      <div className="travel-head">
        <h3 className="travel-title"><Emoji char={place.icon} size="1em" /> {place.name}</h3>
      </div>
      <div className="travel-body">
        <p className="muted place-meta">
          <Emoji char="📍" size="1em" /> {place.area} · {to.name}
        </p>
        <WorkNote city={offer.city} placeId={place.id} />
        <TripRoute fromId={fromId} toId={offer.city} end={`to ${place.name}`} legs={legs} mode={mode} setMode={setMode} setVia={setVia} />
      </div>
      <div className="travel-actions">
        <button type="button" className="travel-cancel" onClick={close}>Cancel</button>
        <button type="button" className="btn go travel-go" disabled={money < total} onClick={() => startTrip(mode, legs.via)}>
          {money < total ? `You need ${naira(total)}` : <>Go there · {naira(total)}</>}
        </button>
      </div>
    </div>
  );
}
