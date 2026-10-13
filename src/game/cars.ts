export interface CarDef {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  speed: number;
  color: string;
  roofColor?: string;
  bodyStyle: 'sedan' | 'wagon' | 'suv' | 'classic' | 'luxury';
  tag: string;
  description: string;
  perk: string;
  funBonus: number;
}

export const CARS: CarDef[] = [
  {
    id: 'peugeot_504',
    name: 'Peugeot 504 Classic',
    subtitle: 'Assembled in PAN Kaduna',
    price: 1_400_000,
    speed: 1.1,
    color: '#1d4ed8',
    roofColor: '#f8fafc',
    bodyStyle: 'classic',
    tag: 'Kaduna Pride',
    description: 'The historic pride of Kaduna! Assembled at the Peugeot Automobile Nigeria (PAN) plant. Bulletproof suspension.',
    perk: '+15 Fun on cruises · High ground clearance',
    funBonus: 15,
  },
  {
    id: 'golf_3',
    name: 'VW Golf 3 Wagon',
    subtitle: 'Kawo Expressway Runner',
    price: 2_400_000,
    speed: 1.25,
    color: '#15803d',
    roofColor: '#166534',
    bodyStyle: 'wagon',
    tag: 'Zippy & Rugged',
    description: 'The undisputed champion of Kaduna highway commuting. Fits everything and sips fuel conservatively.',
    perk: '+20 Fun on cruises · Fuel efficient',
    funBonus: 20,
  },
  {
    id: 'benz_190e',
    name: 'Mercedes-Benz 190E',
    subtitle: '"Baby Boy / V-Boot"',
    price: 4_200_000,
    speed: 1.35,
    color: '#94a3b8',
    roofColor: '#64748b',
    bodyStyle: 'sedan',
    tag: 'Alhaji Classic',
    description: 'Old-money northern elegance. Solid German engineering with plush velvet seats and pristine chrome grill.',
    perk: '+28 Fun & +15 Social status boost',
    funBonus: 28,
  },
  {
    id: 'corolla',
    name: 'Toyota Corolla Muscle',
    subtitle: 'Ahmadu Bello Daily Cruiser',
    price: 7_500_000,
    speed: 1.4,
    color: '#d97706',
    roofColor: '#b45309',
    bodyStyle: 'sedan',
    tag: 'Reliable Daily',
    description: 'Smooth, cold AC, and starts on the first crank every time. The most reliable machine across Kaduna bridges.',
    perk: '+35 Fun on cruises · Chilling AC',
    funBonus: 35,
  },
  {
    id: 'prado',
    name: 'Toyota Land Cruiser Prado',
    subtitle: 'Malali GRA Heavyweight',
    price: 22_000_000,
    speed: 1.55,
    color: '#0f172a',
    roofColor: '#0f172a',
    bodyStyle: 'suv',
    tag: 'VIP Heavyweight',
    description: 'High-command presence in Kaduna. Glides smoothly over potholes along Barnawa and Malali GRA.',
    perk: '+50 Fun & +30 Social · Big Alhaji status',
    funBonus: 50,
  },
  {
    id: 'g_wagon',
    name: 'Mercedes G63 AMG',
    subtitle: 'Governor Convoy Flagship',
    price: 55_000_000,
    speed: 1.75,
    color: '#18181b',
    roofColor: '#18181b',
    bodyStyle: 'luxury',
    tag: 'Ultimate Power',
    description: 'V8 twin-turbo behemoth. When this rolls past Stadium Roundabout or Lugard Hall, everyone stops to salute.',
    perk: '+75 Fun & +50 Social · King of Kaduna',
    funBonus: 75,
  },
  {
    id: 'lexus_lx',
    name: 'Lexus LX 600',
    subtitle: 'Senator’s School Run',
    price: 150_000_000,
    speed: 1.8,
    color: '#f8fafc',
    roofColor: '#e2e8f0',
    bodyStyle: 'suv',
    tag: 'Oga at the Top',
    description: 'Pearl white, tinted to the limit, with a police escort that nobody remembers hiring. Maitama gates open by themselves.',
    perk: '+90 Fun & +60 Social · Armoured calm',
    funBonus: 90,
  },
  {
    id: 'range_autobiography',
    name: 'Range Rover Autobiography',
    subtitle: 'Asokoro Sunday Special',
    price: 240_000_000,
    speed: 1.85,
    color: '#14532d',
    roofColor: '#0f172a',
    bodyStyle: 'suv',
    tag: 'Big Boy',
    description: 'British racing green with a black roof and seats that massage you through traffic. Arrives at owambe after the celebrant, on purpose.',
    perk: '+105 Fun & +70 Social · Massage seats',
    funBonus: 105,
  },
  {
    id: 'bentayga',
    name: 'Bentley Bentayga',
    subtitle: 'Oil Block Money',
    price: 450_000_000,
    speed: 1.95,
    color: '#7c2d12',
    roofColor: '#431407',
    bodyStyle: 'luxury',
    tag: 'Old Money',
    description: 'Hand-stitched leather, a clock worth more than a Corolla and an engine you cannot hear. The gateman salutes it before he sees who is inside.',
    perk: '+125 Fun & +85 Social · Hand-built',
    funBonus: 125,
  },
  {
    id: 'cullinan',
    name: 'Rolls-Royce Cullinan',
    subtitle: 'Billionaire’s Row',
    price: 850_000_000,
    speed: 2,
    color: '#1e1b4b',
    roofColor: '#c0c0c0',
    bodyStyle: 'luxury',
    tag: 'Odogwu',
    description: 'Starlight roof, umbrellas in the doors and the Spirit of Ecstasy on the bonnet. There is nothing above this on any road in Nigeria.',
    perk: '+150 Fun & +100 Social · Nothing above it',
    funBonus: 150,
  },
];

export const CAR_BY_ID: Record<string, CarDef> = Object.fromEntries(CARS.map((c) => [c.id, c]));

/** 75% resale value when trading in a vehicle. */
export const CAR_RESALE_FACTOR = 0.75;

/** Private jets: bought in Autos, kept at the airport, flown between cities from its flight desk. */
export interface JetDef {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  tag: string;
  description: string;
  perk: string;
}

export const JETS: JetDef[] = [
  {
    id: 'jet_challenger',
    name: 'Bombardier Challenger 605',
    subtitle: 'Private terminal, your own crew',
    price: 750_000_000,
    tag: 'Private Jet',
    description: 'Twelve cream leather seats, a pilot on call and your name on the tail. Parked at the private terminal in every city.',
    perk: 'Fly between cities · No ticket queue · No search',
  },
  {
    id: 'jet_g550',
    name: 'Gulfstream G550',
    subtitle: 'The governor’s favourite',
    price: 1_500_000_000,
    tag: 'Long Range',
    description: 'Sixteen seats, a bedroom at the back and range to reach London without stopping. Half the private terminal is already this plane.',
    perk: 'Fly between cities · Bedroom on board · No search',
  },
  {
    id: 'jet_g650',
    name: 'Gulfstream G650ER',
    subtitle: 'Billionaire standard issue',
    price: 3_000_000_000,
    tag: 'Ultra Long Range',
    description: 'The jet the richest men in Africa queue two years to get. Wide oval windows, a full galley and a cabin quieter than your parlour.',
    perk: 'Fly between cities · Chef’s galley · No search',
  },
  {
    id: 'jet_global7500',
    name: 'Bombardier Global 7500',
    subtitle: 'Four rooms in the sky',
    price: 4_500_000_000,
    tag: 'Flagship',
    description: 'A lounge, a dining room, a cinema and a master suite with a real bed. The crew have their own quarters and you never see them.',
    perk: 'Fly between cities · Master suite · No search',
  },
  {
    id: 'jet_bbj',
    name: 'Boeing Business Jet 737',
    subtitle: 'An airliner with one passenger',
    price: 8_000_000_000,
    tag: 'Head of State',
    description: 'A whole Boeing 737 fitted out as a flying mansion: boardroom, two bedrooms, showers and space for the entire entourage. Presidents borrow it.',
    perk: 'Fly between cities · Flying mansion · No search',
  },
];

export const JET_BY_ID: Record<string, JetDef> = Object.fromEntries(JETS.map((j) => [j.id, j]));

/**
 * One trip in your own jet: fuel, crew and landing fees. On board you are fed, rested, showered and entertained:
 * these rates fill every bar in `minutes`, and each route's own flight time is scaled from them (jetFlight in city.ts).
 */
export const JET_TRIP = { cost: 5_000_000, minutes: 25, perHour: { hunger: 250, energy: 250, fun: 250, social: 250, hygiene: 250 } };

/** A jet's tank, counted in flights. The trip fee covers crew and landing; aviation fuel is bought on top. */
export const JET_FUEL = { tank: 2, price: 3_000_000 };
/** Flights left in the tank; a jet with no record yet is full. Kept with the cars' tanks (store `carFuel`). */
export const jetFuelLeft = (fuel: Record<string, number> | undefined, id: string) => Math.max(0, Math.min(JET_FUEL.tank, fuel?.[id] ?? JET_FUEL.tank));
/** What it costs to fill the tank from where it is. */
export const jetRefuelCost = (fuel: Record<string, number> | undefined, id: string) => (JET_FUEL.tank - jetFuelLeft(fuel, id)) * JET_FUEL.price;

/** A jet is due its service after this many flights and stays on the ground until it gets one. A full service costs this share of its price. */
export const JET_SERVICE = { every: 6, priceShare: 0.01 };
/** Flights since the last service (store `jetWear`); a jet with no record yet is fresh from the hangar. */
export const jetFlown = (wear: Record<string, number> | undefined, id: string) => Math.max(0, Math.min(JET_SERVICE.every, wear?.[id] ?? 0));
/** Flights left before the next service is due. */
export const jetFlightsLeft = (wear: Record<string, number> | undefined, id: string) => JET_SERVICE.every - jetFlown(wear, id);
/** What the engineers charge now: the more flights since the last service, the more there is to do. */
export const jetServiceCost = (wear: Record<string, number> | undefined, id: string) =>
  Math.round(((JET_BY_ID[id]?.price ?? 0) * JET_SERVICE.priceShare * jetFlown(wear, id)) / JET_SERVICE.every);

/** The jet you fly: the first one fuelled and in service, then the first one with fuel, then the first one you own. */
export const jetToFly = (owned: string[], fuel: Record<string, number> | undefined, wear?: Record<string, number>) =>
  owned.find((id) => jetFuelLeft(fuel, id) >= 1 && jetFlightsLeft(wear, id) >= 1) ?? owned.find((id) => jetFuelLeft(fuel, id) >= 1) ?? owned[0] ?? null;

/** A jet sells back at the same rate as a car in perfect order. */
export const jetResale = (id: string) => Math.round((JET_BY_ID[id]?.price ?? 0) * CAR_RESALE_FACTOR);
