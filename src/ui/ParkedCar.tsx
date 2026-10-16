// Tap a car parked at home (three/World.tsx) and its actions come up here: drive it out, make it the car you use,
// fill the tank, get it serviced, or open it in KD Autos. The same actions the Autos app has, where the car stands.

import { useEffect } from 'react';
import { useGame, naira } from '../game/store';
import { CAR_BY_ID } from '../game/cars';
import { blockerOf, conditionOf, healthOf, PARTS, repairAllCost } from '../game/carCare';
import { CAR_FUEL, fuelLeft } from '../game/carFuel';
import { startDrive } from '../game/drive';
import { useParkedCar } from './parkedCarStore';

export function ParkedCarSheet() {
  const carId = useParkedCar((s) => s.carId);
  const shown = useGame((s) => s.view === 'home' && !s.panel);
  const car = carId ? CAR_BY_ID[carId] : null;
  const owned = useGame((s) => !!carId && s.ownedCars.includes(carId));
  const selected = useGame((s) => s.selectedCar === carId);
  const conditions = useGame((s) => s.carCondition);
  const condition = carId ? conditionOf(conditions, carId) : null;
  const fuel = useGame((s) => (carId ? fuelLeft(s.carFuel, carId) : 0));
  const money = useGame((s) => s.money);
  const atHome = useGame((s) => s.view === 'home');
  // Leaving the house puts the car's sheet away, so it isn't waiting there next time.
  useEffect(() => { if (!atHome) useParkedCar.setState({ carId: null }); }, [atHome]);
  if (!carId || !car || !owned || !shown || !condition) return null;
  const close = () => useParkedCar.setState({ carId: null });
  const stuck = blockerOf(condition);
  const service = repairAllCost(carId, condition);
  const g = useGame.getState();
  return (
    <div className="house-card hm-switch" role="dialog" aria-label={car.name} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 12, width: 'min(360px, calc(100% - 24px))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="house-facts" style={{ flex: 1 }}>
          <b>🚗 {car.name}{selected ? ' · in use' : ''}</b>
          <small>⛽ {Math.floor(fuel)}/{CAR_FUEL.tank}L · 🔧 {Math.round(healthOf(condition) * 100)}%{stuck ? ` · ${PARTS[stuck].label} spoilt` : ''}</small>
        </span>
        <button type="button" className="hm-arrow" aria-label="Close" onClick={close}>×</button>
      </div>
      <div className="hm-actions" style={{ marginTop: 0 }}>
        <button className="btn sm go" disabled={!!stuck} onClick={() => { close(); startDrive('car', { carId }); }}>💨 Drive</button>
        {!selected && <button className="btn sm" onClick={() => g.selectCar(carId)}>Use this car</button>}
        <button className="btn sm" disabled={fuel > CAR_FUEL.tank - 1} onClick={() => g.refuelCar(carId)}>⛽ Refuel</button>
        {service > 0 && <button className="btn sm" disabled={money < service} onClick={() => g.repairCar(carId, 'all')}>🛠️ Service {naira(service)}</button>}
        <button className="btn sm" onClick={() => { close(); useGame.setState({ panel: 'phone', openApp: 'cars' }); }}>KD Autos</button>
      </div>
    </div>
  );
}
