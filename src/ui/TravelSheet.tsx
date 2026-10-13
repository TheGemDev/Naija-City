import { useEffect, useState, type ReactNode } from 'react';
import { naira, useGame, type TravelMode } from '../game/store';
import { DEFAULT_KM, fareForKm, stateFareForKm } from '../game/fares';
import { STATE_FLEET } from '../game/civic';
import { useCivic } from '../net/civic';
import { useCityLaws } from '../game/cityLaws';
import { CAR_BY_ID } from '../game/cars';
import { fuelLeft, fuelUse } from '../game/carFuel';
import { Emoji } from './Icons';

const OPTIONS: { mode: Exclude<TravelMode, 'car'>; icon: string; label: string; walk?: boolean }[] = [
  { mode: 'walk', icon: '🚶🏾', label: 'Trek', walk: true },
  { mode: 'keke', icon: '🛺', label: 'Keke' },
  { mode: 'okada', icon: '🏍️', label: 'Okada' },
  { mode: 'cab', icon: '🚕', label: 'Cab' },
  { mode: 'helicopter', icon: '🚁', label: 'Helicopter' },
];

/** How ordinary people get about: beneath an office holder whose convoy is waiting. */
export const COMMON: TravelMode[] = ['walk', 'keke', 'okada'];

/** Your own cars, folded away under the rides until you want one: open already when you are driving. */
export function CarDrawer({ count, picked, children }: { count: number; picked: string | null; children: ReactNode }) {
  const [open, setOpen] = useState(!!picked);
  if (!count) return null;
  return (
    <details className="travel-cars" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="travel-cars-icon"><Emoji char="🚗" size="1em" /></span>
        <b>My cars</b>
        <em>{picked ?? `${count} in the garage`}</em>
      </summary>
      <div className="travel-options">{children}</div>
    </details>
  );
}

/** Ride price for a trip of `km` (trekking and your own car are free). */
export const fareOf = (mode: TravelMode, km = DEFAULT_KM) => fareForKm(mode, km);

/**
 * The "how do you want to get there?" sheet shared by the town map and the Home / Estates buttons.
 * It covers the nav bar while open; Go and Cancel stay put while the options scroll.
 */
export function TravelSheet({
  title,
  action,
  top,
  route,
  km = DEFAULT_KM,
  allowWalk,
  mode,
  setMode,
  carId,
  setCarId,
  goLabel,
  goDisabled,
  onGo,
  onCancel,
}: {
  title: ReactNode;
  /** A button for the top right corner, beside the title. */
  action?: ReactNode;
  top?: ReactNode;
  /** Shown in place of the rides and your cars: the trip is one that takes more than a ride (a flight to another city). */
  route?: ReactNode;
  km?: number;
  allowWalk: boolean;
  mode: TravelMode;
  setMode(mode: TravelMode): void;
  carId: string | null;
  setCarId(id: string | null): void;
  goLabel: ReactNode;
  goDisabled: boolean;
  onGo(): void;
  onCancel(): void;
}) {
  const money = useGame((s) => s.money);
  const ownedCars = useGame((s) => s.ownedCars);
  const carFuel = useGame((s) => s.carFuel);
  // The city's government can take okada off its streets (Civic → Laws).
  const okadaOff = useCityLaws((s) => s.okadaBan.includes(useGame.getState().destinationId));
  // An office holder's helicopter and convoy are the state's (game/fares.ts): redraw when the treasury changes.
  useCivic((s) => s.data);
  // With a convoy waiting, an office holder doesn't trek or flag down a keke or okada.
  const convoy = !!stateFareForKm('cab', km);
  useEffect(() => {
    if (convoy && COMMON.includes(mode)) setMode('cab');
    else if (okadaOff && mode === 'okada') setMode('keke');
  }, [convoy, okadaOff, mode, setMode]);
  return (
    <div className="sheet place-sheet travel-sheet" role="dialog" aria-label="Travel options">
      <div className="travel-head">
        <h3 className="travel-title">{title}</h3>
        {action}
      </div>
      <div className="travel-body">
        {top}
        {route ?? <>
        <div className={`travel-options ${convoy ? 'stacked' : ''}`} role="group" aria-label="Choose how to travel">
          {OPTIONS.filter((o) => (allowWalk || !o.walk) && !(convoy && COMMON.includes(o.mode))).map((o) => {
            const fare = fareOf(o.mode, km);
            const banned = o.mode === 'okada' && okadaOff;
            const state = stateFareForKm(o.mode, km);
            return (
            <button key={o.mode} className={`travel-choice mode-${o.mode} ${mode === o.mode ? 'selected' : ''}`} aria-pressed={mode === o.mode} disabled={banned || money < fare} onClick={() => setMode(o.mode)}>
              <span className="travel-icon"><Emoji char={state?.vehicle === 'cab' ? '🚨' : o.icon} size="1em" /></span>
              <span className="travel-text">
                <b>{state ? STATE_FLEET[state.office][state.vehicle] : o.label}</b>
                <em className={`travel-pill ${fare ? 'cost' : 'free'}`}>{banned ? 'Banned here' : state ? `Treasury pays ${naira(state.amount)}` : fare ? naira(fare) : 'Free'}</em>
              </span>
            </button>
            );
          })}
        </div>
        <CarDrawer count={ownedCars.length} picked={mode === 'car' && carId ? CAR_BY_ID[carId]?.name ?? null : null}>
          {ownedCars.map((id) => {
            const car = CAR_BY_ID[id];
            if (!car) return null;
            const selected = mode === 'car' && carId === id;
            const left = fuelLeft(carFuel, id);
            const use = fuelUse(id, km);
            const dry = left < use;
            return (
              <button key={id} className={`travel-choice mode-car ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => { setMode('car'); setCarId(id); }}>
                <span className="travel-icon"><Emoji char="🚗" size="1em" /></span>
                <span className="travel-text">
                  <b>My {car.name}</b>
                  <em className={`travel-pill ${dry ? 'cost' : 'free'}`}><Emoji char="⛽" size="1em" /> {use}L{dry ? ` · ${left <= 0 ? 'no fuel' : 'low fuel'}` : ''}</em>
                </span>
              </button>
            );
          })}
        </CarDrawer>
        {ownedCars.length === 0 && <p className="muted small travel-car-hint">No car yet? Buy one from Phone → Autos.</p>}
        </>}
      </div>
      <div className="travel-actions">
        <button type="button" className="travel-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn go travel-go" disabled={goDisabled} onClick={onGo}>{goLabel}</button>
      </div>
    </div>
  );
}

/** What the Go button shows: the fare, or the fuel a car trip burns. */
export const tripCost = (mode: TravelMode, carId: string | null, km = DEFAULT_KM): ReactNode =>
  mode === 'car' && carId ? <><Emoji char="⛽" size="1em" /> {fuelUse(carId, km)}L</> : fareOf(mode, km) ? naira(fareOf(mode, km)) : 'Free';

/** A car with too little fuel for the trip can't go. */
export const carDry = (mode: TravelMode, carId: string | null, carFuel: Record<string, number>, km = DEFAULT_KM) =>
  mode === 'car' && !!carId && fuelLeft(carFuel, carId) < fuelUse(carId, km);
