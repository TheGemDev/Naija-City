import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { estateKm, homeTripKm, hourOf, naira, ownHouseOf, useGame, type TravelMode } from '../game/store';
import { cityEstates, DESIGN_BY_ID, estateCity, REGION_BY_ID, isComplete } from '../game/property';
import { regionAirportDoor, regionOf, regionPlace, regionStartDoor } from '../game/regions';
import { sectionOf } from '../game/estate';
import { avatarCell } from '../game/avatar';
import { isOpen } from '../game/city';
import { kmBetween } from '../game/fares';
import { startHomeTrip, tripFlight, type Via } from '../game/trip';
import { roomParent } from '../game/villa';
import { Chevron, Emoji } from './Icons';
import { TravelSheet, carDry, fareOf, tripCost } from './TravelSheet';
import { TripRoute, tripLegs } from './TripSheet';

type Trip = { kind: 'home' } | { kind: 'estate'; region: string; no?: number };

/** Asks how you want to get somewhere before you set off (Home and Estates in the nav bar). */
export const useTravel = create<{ trip: Trip | null; ask(trip: Trip): void; close(): void }>((set) => ({
  trip: null,
  ask: (trip) => set({ trip }),
  close: () => set({ trip: null }),
}));

type HomeChoice = { id: string; icon: string; name: string; where: string; tag: string; disabled: boolean };

/** Where a city lets you out with nowhere particular to be: your door in the state you were born in, the airport elsewhere. */
const startDoor = (city: string, homeState: string) => (city === homeState ? regionStartDoor : regionAirportDoor)(city);

/** Your homes as one sideways strip, so owning many houses doesn't make the sheet taller. */
function HomeStrip({ homes, selected, onPick }: { homes: HomeChoice[]; selected: string | null; onPick(id: string): void }) {
  const on = useRef<HTMLButtonElement>(null);
  useEffect(() => { on.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selected]);
  return (
    <div className="travel-homes" role="radiogroup" aria-label="Which home">
      {homes.map((h) => (
        <button key={h.id} ref={selected === h.id ? on : undefined} type="button" role="radio" aria-checked={selected === h.id} className={selected === h.id ? 'on' : ''} disabled={h.disabled} onClick={() => onPick(h.id)}>
          <span className="travel-home-icon"><Emoji char={h.icon} size="1em" /></span>
          <span className="travel-home-text"><b>{h.name}</b><small className={h.tag ? 'warn' : ''}>{h.tag || h.where}</small></span>
        </button>
      ))}
    </div>
  );
}

export function TravelPicker() {
  const trip = useTravel((s) => s.trip);
  const close = useTravel((s) => s.close);
  const money = useGame((s) => s.money);
  const ownedCars = useGame((s) => s.ownedCars);
  const carFuel = useGame((s) => s.carFuel);
  const properties = useGame((s) => s.properties);
  const rentedOut = useGame((s) => s.rentedOut);
  const lease = useGame((s) => s.lease);
  const origin = useGame((s) => s.origin);
  const usual = useGame((s) => ownHouseOf(s)?.id ?? null);
  // Only the estates of the city you are in: the others are a flight away.
  const city = useGame((s) => s.destinationId);
  const REGIONS = cityEstates(city);
  // The estate you are standing in right now, if any: there is no trip to make to it.
  const hereRegion = useGame((s) => (s.view === 'estate' ? s.estateId : null));
  const hereNo = useGame((s) => s.estateNo);
  const [mode, setMode] = useState<TravelMode>('keke');
  // The ride at both ends of a trip home to another city.
  const [tripMode, setTripMode] = useState<TravelMode>('keke');
  // And how it crosses between the cities: a flight, or the train where a line runs.
  const [via, setVia] = useState<Via>('air');
  const hour = useGame((s) => Math.floor(hourOf(s.minutes)));
  const [carId, setCarId] = useState<string | null>(null);
  // Which estate the arrows have landed on (null = the one the sheet opened with).
  const [picked, setPicked] = useState<string | null>(null);
  // Which home to go to (null = the usual one).
  const [homeId, setHomeId] = useState<string | null>(null);
  useEffect(() => { setPicked(null); setHomeId(null); }, [trip]);
  if (!trip) return null;

  const isHome = trip.kind === 'home';
  const regionId = trip.kind === 'estate' ? picked ?? (REGION_BY_ID[trip.region]?.city === city ? trip.region : properties.find((p) => REGION_BY_ID[p.region]?.city === city)?.region ?? REGIONS[0]?.id ?? trip.region) : null;
  const region = regionId ? REGION_BY_ID[regionId] : null;
  const regionIdx = regionId ? REGIONS.findIndex((r) => r.id === regionId) : -1;
  const owned = regionId ? properties.filter((p) => p.region === regionId) : [];
  const stepRegion = (d: -1 | 1) => setPicked(REGIONS[(regionIdx + d + REGIONS.length) % REGIONS.length].id);
  // Opening on the estate you came with keeps its section; any other goes to your first one there, or 1.
  const section = trip.kind === 'estate' && regionId === trip.region && trip.no !== undefined
    ? trip.no
    : owned.length ? sectionOf(owned[0].slot ?? 0) : 0;
  const { homeState, view, insideId } = useGame.getState();
  const hereId = regionOf(city).id;
  // A home in another city is a flight away: it can be picked wherever a flight goes there (the sheet then shows the whole trip).
  const away = (homeCity: string) => {
    const off = regionOf(homeCity).id !== hereId;
    return { city: homeCity, away: off, stuck: off && !tripFlight(city, homeCity), in: off ? `${regionOf(homeCity).name} · ` : '' };
  };
  // Every home you have: your finished houses (one with a tenant in it is theirs for now), the house you rent,
  // and the government house when that is where you would otherwise end up.
  const homes = !isHome ? [] : [
    ...properties.filter(isComplete).map((p) => {
      const let_ = p.rented || rentedOut.includes(p.id);
      const at = away(estateCity(p.region));
      return {
        id: p.id,
        icon: DESIGN_BY_ID[p.design ?? '']?.icon ?? '🏠',
        name: DESIGN_BY_ID[p.design ?? '']?.name ?? 'House',
        where: `${at.in}${REGION_BY_ID[p.region]?.name ?? 'Estate'} · Estate ${sectionOf(p.slot ?? 0) + 1}`,
        tag: let_ ? 'Rented out' : at.stuck ? 'Another city' : '',
        disabled: let_ || at.stuck,
        km: estateKm(sectionOf(p.slot ?? 0)),
        ...at,
      };
    }),
    ...(lease ? [away(estateCity(lease.region))].map((at) => (
      // Nobody is charged for the ride to a rented house once in its city.
      { id: 'lease', icon: DESIGN_BY_ID[lease.design]?.icon ?? '🏠', name: DESIGN_BY_ID[lease.design]?.name ?? 'Rented house', where: `${at.in}${REGION_BY_ID[lease.region]?.name ?? 'Estate'} · rented from @${lease.ownerUsername}`, tag: at.stuck ? 'Another city' : '', disabled: at.stuck, km: at.away ? 0 : homeTripKm(useGame.getState()), ...at }
    )) : []),
    ...(!usual && !lease && origin !== 'almajiri' ? [away(homeState)].map((at) => (
      // You land in your own state at the government house's door.
      { id: 'gov', icon: '🏚️', name: 'Government house', where: `${regionOf(homeState).name} town`, tag: at.stuck ? 'Another city' : '', disabled: at.stuck, km: at.away ? kmBetween(startDoor(homeState, homeState), regionPlace(homeState, 'home')?.door ?? startDoor(homeState, homeState)) : homeTripKm(useGame.getState()), ...at }
    )) : []),
  ].sort((a, b) => Number(a.disabled) - Number(b.disabled)); // the ones you can't go to sit at the far end
  const home = homes.find((h) => h.id === homeId && !h.disabled) ?? homes.find((h) => h.id === (usual ?? (lease ? 'lease' : 'gov'))) ?? homes.find((h) => !h.disabled) ?? null;
  // Trekking isn't an option to another estate, so don't leave it selected.
  const current: TravelMode = !isHome && mode === 'walk' ? 'keke' : mode;
  const km = isHome ? home?.km ?? homeTripKm(useGame.getState()) : estateKm(section);
  const fare = fareOf(current, km);
  const here = !isHome && regionId === hereRegion && section === hereNo;
  const ready = !here && money >= fare && (current !== 'car' || (!!carId && ownedCars.includes(carId))) && !carDry(current, carId, carFuel, km);
  // Home in another city: the ride to the airport from where the map lets you out, the flight, and the ride on to your door.
  const legs = isHome && home?.away
    ? (() => {
      const from = view === 'city' ? avatarCell() : (view === 'place' && regionPlace(city, roomParent(insideId) ?? '')?.door) || startDoor(city, homeState);
      return tripLegs(city, home.city, tripMode, from, home.km, via) ?? tripLegs(city, home.city, tripMode, from, home.km);
    })()
    : null;
  const flying = !!legs && isOpen(legs.airport, hour);

  const go = () => {
    const st = useGame.getState();
    close();
    const car = current === 'car' ? carId ?? undefined : undefined;
    if (legs && home) startHomeTrip(home.city, home.id, tripMode, legs.via);
    else if (trip.kind === 'home') st.goHome(current, car, home?.id);
    else st.visitEstate(regionId!, section, current, car);
  };

  return (
    <TravelSheet
      title={<><Emoji char={isHome ? '🏠' : '🏘️'} size="1em" /> {isHome ? 'Going home' : 'Estates'}</>}
      top={region ? (
        <div className="travel-estate">
          <button aria-label="Previous estate" onClick={() => stepRegion(-1)}><Chevron dir="left" size={18} /></button>
          <div className="travel-estate-name">{region.name}</div>
          <button aria-label="Next estate" onClick={() => stepRegion(1)}><Chevron dir="right" size={18} /></button>
        </div>
      ) : homes.length > 0 && (
        <HomeStrip homes={homes} selected={home?.id ?? null} onPick={setHomeId} />
      )}
      route={legs && home && <TripRoute fromId={city} toId={home.city} end="home" legs={legs} mode={tripMode} setMode={setTripMode} setVia={setVia} />}
      km={km}
      allowWalk={isHome}
      mode={current}
      setMode={setMode}
      carId={carId}
      setCarId={setCarId}
      goLabel={legs
        ? !flying ? <><Emoji char="🔒" size="1em" /> {legs.via === 'rail' ? 'Station closed' : 'Airport closed'}</> : money < legs.total ? `You need ${naira(legs.total)}` : <>Go home · {naira(legs.total)}</>
        : here ? 'Already here' : <>Go · {tripCost(current, carId, km)}</>}
      goDisabled={legs ? !flying || money < legs.total : !ready}
      onGo={go}
      onCancel={close}
    />
  );
}
