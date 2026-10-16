// The station's ticket desk: a pill while you are in the station hall, and the sheet it opens, where you buy a train
// ticket (game/transport.ts) to a city the lines reach, standard or business class. Like the flight desk (ui/Airport.tsx),
// every price shows the President's fare subsidy when there is one.

import { useState } from 'react';
import { naira, ticketOf, useGame } from '../game/store';
import { regionOf, regionPlace } from '../game/regions';
import { railRoute, type FareSubsidy } from '../game/transport';
import type { ActionDef } from '../game/catalog';
import { Emoji } from './Icons';
import './airport.css';

const STATION_ID = 'station';
/** Each city's station, as a ticket prints it. */
const STATION_CODE: Record<string, string> = { kaduna: 'RGS', abuja: 'IDU', lagos: 'EBM', kano: 'KAN' };

const rideTime = (minutes: number) => [minutes >= 60 ? `${Math.floor(minutes / 60)} hr` : '', minutes % 60 ? `${minutes % 60} min` : ''].filter(Boolean).join(' ');

/** A ticket's price: struck through and cut when the government is paying part of it. */
export function FarePrice({ def, from, fares }: { def: ActionDef; from: string; fares: FareSubsidy }) {
  const t = ticketOf(def, from, fares);
  if (!t || !t.off) return <b>{naira(t?.price ?? def.cost ?? 0)}</b>;
  return (
    <span className="fare-price">
      <s>{naira(t.base)}</s>
      <b>{naira(t.price)}</b>
    </span>
  );
}

/** The line under a ticket saying the government pays part of it, or that the treasury has run dry. */
export function SubsidyNote({ mode, fares }: { mode: 'air' | 'rail'; fares: FareSubsidy }) {
  const pct = fares[mode];
  if (!pct) return null;
  return fares.funded
    ? <p className="fare-subsidy"><Emoji char="🇳🇬" size={14} /> Govt subsidy −{pct}% on every {mode === 'air' ? 'airline seat' : 'train ticket'}. The federal treasury pays the rest.</p>
    : <p className="fare-subsidy dry"><Emoji char="🏦" size={14} /> The {pct}% fare subsidy is suspended: the federal treasury can’t pay it. Full fares for now.</p>;
}

export function TrainLauncher() {
  const here = useGame((s) => s.view === 'place' && s.insideId === STATION_ID);
  const busy = useGame((s) => !!s.selectedId || !!s.panel || s.flightDesk || s.boarding || !!s.task);
  if (!here || busy) return null;
  return (
    <button type="button" className="venue-bet-launch train" onClick={() => useGame.getState().setFlightDesk(true)}>
      <span className="vbl-icon"><Emoji char="🚆" size={18} /></span> Buy a train ticket
    </button>
  );
}

/** The ticket desk: one tab per city the lines reach from here, a standard and a business ticket for each. */
export function TrainDesk() {
  const open = useGame((s) => s.flightDesk && s.view === 'place' && s.insideId === STATION_ID);
  const money = useGame((s) => s.money);
  const regionId = useGame((s) => s.destinationId);
  const fares = useGame((s) => s.fares);
  const [dest, setDest] = useState<string | null>(null);
  if (!open) return null;
  const g = useGame.getState();
  const close = () => g.setFlightDesk(false);
  const station = regionPlace(regionId, STATION_ID);
  const trains = (station?.actions ?? []).filter((a) => a.effect === 'travel' && a.rail && a.destination);
  const cities = [...new Set(trains.map((a) => a.destination as string))];
  const shown = cities.find((c) => c === dest) ?? cities[0];
  const from = regionOf(regionId);
  return (
    <div className="sheet place-sheet flight-desk train-desk" role="dialog" aria-label="Train tickets">
      <div className="sheet-head">
        <h3>🚆 {station?.name ?? 'Station'} tickets</h3>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </div>
      {!cities.length && <p className="muted">No passenger trains leave from here.</p>}
      {cities.length > 1 && (
        <div className="flight-tabs" role="tablist" aria-label="Where to">
          {cities.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === shown} className={c === shown ? 'on' : ''} onClick={() => setDest(c)}>
              <b>{STATION_CODE[c]}</b> {regionOf(c).name}
            </button>
          ))}
        </div>
      )}
      <SubsidyNote mode="rail" fares={fares} />
      <div className="tickets">
        {trains.filter((a) => a.destination === shown).map((a) => {
          const to = regionOf(a.destination!);
          const line = railRoute(regionId, a.destination!);
          const price = ticketOf(a, regionId, fares)?.price ?? a.cost ?? 0;
          const biz = a.cls === 'business';
          return (
            <div key={a.id} className={`ticket rail ${biz ? 'biz' : ''}`}>
              <div className="ticket-main">
                <div className="ticket-route">
                  <span><b>{STATION_CODE[from.id]}</b><small>{from.name}</small></span>
                  <i><Emoji char="🚆" size={16} /></i>
                  <span><b>{STATION_CODE[to.id]}</b><small>{to.name}</small></span>
                </div>
                <small>{biz ? 'Business · leather seat, a meal' : 'Standard · reserved seat'} · {rideTime(a.minutes)} · {line?.train}</small>
              </div>
              <div className="ticket-stub">
                <FarePrice def={a} from={regionId} fares={fares} />
                <button type="button" className="btn sm go" disabled={money < price} onClick={() => { close(); g.startPlaceAction(STATION_ID, a.id); }}>Board</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small train-note">Cheaper than flying, and slower. The flight is quicker: book it at the airport.</p>
    </div>
  );
}
