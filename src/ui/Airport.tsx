// The airport's flight desk: a pill while you are in the terminal, and the sheet it opens, where you pick
// a ticketed flight or your own jet (game/cars.ts) to another city.

import { useEffect, useState } from 'react';
import { findAction, flightOf, naira, useGame } from '../game/store';
import { CABIN_MENU, useCabin } from '../game/cabin';
import { JET_BY_ID, jetFlightsLeft, jetFuelLeft, jetRefuelCost, jetServiceCost, jetToFly } from '../game/cars';
import { regionOf, regionPlace, type RegionId } from '../game/regions';
import { useVice } from '../net/vice';
import { stateRide, useCivic } from '../net/civic';
import { STATE_FLEET } from '../game/civic';
import { Emoji } from './Icons';
import './hotel.css';
import './airport.css';

const AIRPORT_ID = 'airport';

const flightTime = (minutes: number) => [minutes >= 60 ? `${Math.floor(minutes / 60)} hr` : '', minutes % 60 ? `${minutes % 60} min` : ''].filter(Boolean).join(' ');
/** Each city's airport, as a ticket prints it. */
const AIRPORT_CODE: Record<RegionId, string> = { kaduna: 'KAD', abuja: 'ABV', lagos: 'LOS', kano: 'KAN' };

/** In the air (three/FlightCabin.tsx): where you are going and which leg of the flight this is. */
export function FlightBanner() {
  const flight = useGame(flightOf);
  const from = useGame((s) => regionOf(s.destinationId).name);
  const to = useGame((s) => {
    const t = s.task;
    const dest = t && flightOf(s) ? findAction(t.itemId, t.actionId, s.items, t.placeId)?.destination : null;
    return dest ? regionOf(dest).name : '';
  });
  const leg = useGame((s) => {
    const t = s.task;
    const p = t && t.total > 0 ? 1 - t.remaining / t.total : 0;
    return p < 0.18 ? 'Taking off' : p > 0.8 ? 'Coming in to land' : 'Cruising';
  });
  const official = useGame((s) => s.task?.official);
  if (!flight || !to) return null;
  return (
    <div className="flight-banner" role="status">
      <Emoji char={flight === 'jet' ? '🛩️' : '✈️'} size={18} />
      <span>
        <b>{from} → {to}</b>
        <small>{official ? STATE_FLEET[official].jet : flight === 'jet' ? 'Your jet' : 'Flight KD 101'} · {leg}</small>
      </span>
    </div>
  );
}

/** Cabin service: the crew's menu in the air. Your own jet serves everything on the house; a ticketed flight sells off the trolley. */
export function CabinService() {
  const flight = useGame(flightOf);
  const money = useGame((s) => s.money);
  const official = useGame((s) => s.task?.official);
  const open = useCabin((c) => c.open);
  const served = useCabin((c) => c.served);
  // Landed (or the flight was called off): clear the tray for the next one.
  useEffect(() => { if (!flight) useCabin.getState().reset(); }, [flight]);
  if (!flight || !open) return null;
  const { order, setOpen } = useCabin.getState();
  const jet = flight === 'jet';
  return (
    <div className="sheet place-sheet hotel-desk" role="dialog" aria-label="Cabin service">
      <div className="sheet-head">
        <h3>{jet ? '🥂 Cabin service' : '🛒 Trolley service'}</h3>
        <button className="x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
      </div>
      <p className="muted">
        {official ? 'The state’s crew is at your service. The treasury has paid.' : jet ? 'Your crew, your cabin. Everything on board is on the house.' : 'One free snack with your ticket. Everything else on the trolley is cash.'}
      </p>
      <div className="hotel-rooms">
        {CABIN_MENU[flight].map((item) => {
          const had = served.includes(item.id);
          return (
            <div key={item.id} className={`hotel-room on ${jet ? 'presidential' : ''}`}>
              <div className="hotel-room-head">
                <span className="hotel-room-icon"><Emoji char={item.icon} size={28} /></span>
                <span className="hotel-room-text">
                  <b>{item.name}</b>
                  <small>{item.blurb}</small>
                </span>
                <button type="button" className="btn sm go cabin-order" disabled={had || money < item.price} onClick={() => order(item.id)}>
                  {had ? 'Served' : item.price ? naira(item.price) : 'Free'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Floating pill shown while you are in the terminal: straight to the flight desk. */
export function FlightLauncher() {
  const here = useGame((s) => s.view === 'place' && s.insideId === AIRPORT_ID);
  // The action sheet, the phone and the desk all use this strip of screen.
  const busy = useGame((s) => !!s.selectedId || !!s.panel || s.flightDesk || s.boarding || !!s.task);
  if (!here || busy) return null;
  return (
    <button type="button" className="venue-bet-launch flight" onClick={() => useGame.getState().setFlightDesk(true)}>
      <span className="vbl-icon"><Emoji char="🛫" size={18} /></span> Book a flight
    </button>
  );
}

/** The flight desk: every way out of this city, each one a ticket. Jets are listed once you have one to fly. */
export function FlightDesk() {
  const open = useGame((s) => s.flightDesk && s.view === 'place' && s.insideId === AIRPORT_ID);
  const money = useGame((s) => s.money);
  const regionId = useGame((s) => s.destinationId);
  const jetId = useGame((s) => jetToFly(s.ownedJets, s.carFuel, s.jetWear));
  const fuel = useGame((s) => (jetId ? jetFuelLeft(s.carFuel, jetId) : 0));
  const refuel = useGame((s) => (jetId ? jetRefuelCost(s.carFuel, jetId) : 0));
  const flightsLeft = useGame((s) => (jetId ? jetFlightsLeft(s.jetWear, jetId) : 0));
  const service = useGame((s) => (jetId ? jetServiceCost(s.jetWear, jetId) : 0));
  // Redraw when the treasury changes: an office holder flies the state's jet while the budget covers it.
  useCivic((s) => s.data);
  // The destination being looked at: one tab per city you can fly to.
  const [dest, setDest] = useState<string | null>(null);
  const wraps = useVice((s) => Object.values(s.plug?.stash ?? {}).reduce((a, n) => a + n, 0));
  if (!open) return null;
  const g = useGame.getState();
  const close = () => g.setFlightDesk(false);
  const from = regionOf(regionId);
  const jet = jetId ? JET_BY_ID[jetId] : null;
  const flights = (regionPlace(regionId, AIRPORT_ID)?.actions ?? [])
    .filter((a) => a.effect === 'travel' && a.destination)
    .map((f) => ({ f, office: f.jet ? stateRide(f.cost ?? 0) : null }));
  const tickets = flights.filter(({ f, office }) => !f.jet || jet || office);
  const cities = [...new Set(flights.map(({ f }) => f.destination as string))];
  const shownCity = cities.find((c) => c === dest) ?? cities[0];
  const here = tickets.filter(({ f }) => f.destination === shownCity);
  const seats = here.filter(({ f }) => !f.jet);
  const privateJets = here.filter(({ f }) => f.jet);
  const renderTicket = ({ f, office }: (typeof tickets)[number]) => {
    const to = regionOf(f.destination);
    const fly = () => { close(); g.startPlaceAction(AIRPORT_ID, f.id); };
    // One price and one button: the trip, or what your jet needs before it can make it.
    const step = office ? { price: 0, label: 'Fly', go: fly }
      : f.jet && jetId && fuel < 1 ? { price: refuel, label: 'Refuel', go: () => g.refuelJet(jetId) }
      : f.jet && jetId && flightsLeft < 1 ? { price: service, label: 'Service', go: () => g.serviceJet(jetId) }
      : { price: f.cost ?? 0, label: f.jet ? 'Fly' : 'Buy', go: fly };
    return (
      <div key={f.id} className={`ticket ${f.jet ? 'jet' : ''}`}>
        <div className="ticket-main">
          <div className="ticket-route">
            <span><b>{AIRPORT_CODE[from.id]}</b><small>{from.name}</small></span>
            <i><Emoji char={f.jet ? '🛩️' : '✈️'} size={16} /></i>
            <span><b>{AIRPORT_CODE[to.id]}</b><small>{to.name}</small></span>
          </div>
          <small>{flightTime(f.minutes)} · {office ? STATE_FLEET[office].jet : f.jet && jet ? `⛽ ${fuel} · ${jet.name}` : 'One-way'}</small>
        </div>
        <div className="ticket-stub">
          <b>{office ? 'State pays' : naira(step.price)}</b>
          <button type="button" className="btn sm go" disabled={money < step.price} onClick={step.go}>{step.label}</button>
        </div>
      </div>
    );
  };
  return (
    <div className="sheet place-sheet flight-desk" role="dialog" aria-label="Flight desk">
      <div className="sheet-head">
        <h3>🛫 Flight desk</h3>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </div>
      {wraps > 0 && (
        <p className="flight-warn" role="alert">
          <Emoji char="🚨" size={18} /> NDLEA searches ticketed flights. You have {wraps} wrap{wraps === 1 ? '' : 's'} on you.
        </p>
      )}
      {cities.length > 1 && (
        <div className="flight-tabs" role="tablist" aria-label="Where to">
          {cities.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === shownCity} className={c === shownCity ? 'on' : ''} onClick={() => setDest(c)}>
              <b>{AIRPORT_CODE[regionOf(c).id]}</b> {regionOf(c).name}
            </button>
          ))}
        </div>
      )}
      <div className="tickets">
        {seats.map(renderTicket)}
        {privateJets.length > 0 && (
          <>
            <div className="flight-divider"><span>Private jet</span></div>
            {privateJets.map(renderTicket)}
          </>
        )}
      </div>
      {tickets.length < flights.length && (
        <button type="button" className="ghost-btn flight-jet" onClick={() => { close(); useGame.setState({ panel: 'phone', openApp: 'cars' }); }}>
          <Emoji char="🛩️" size={14} /> Get a private jet
        </button>
      )}
    </div>
  );
}
