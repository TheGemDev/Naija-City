// Things that happen to the whole server at once: NEPA blackouts and live events (fuel scarcity, a
// protest, Durbar, a football final, a mega owambe). Both are pure functions of real time, so every
// player's game (and the server, worker/fun.ts) agrees on what is happening without talking to anyone.
//
// Each city has its own events: Kaduna gets the Durbar and dambe, Abuja gets inaugurations, a snatched mace
// and a snake that swallowed the money, Lagos gets the Eyo festival, a fallen tanker and Detty December, Kano gets a
// Hisbah raid, a mass wedding and the groundnut pyramids. A few are national (NATIONAL below) and hit every city at once.

/** Live events start every SLOT and run for DURATION. */
export const LIVE_SLOT_MS = 2 * 3600_000;
export const LIVE_DURATION_MS = 40 * 60_000;
/** Football final bets close this long after kick-off; the result is drawn at full time. */
export const BET_WINDOW_MS = 25 * 60_000;

export type LiveEventId =
  | 'fuel' | 'protest' | 'durbar' | 'final' | 'owambe' | 'blackout' | 'moneyrain' | 'ufo' | 'goats' | 'jollof' | 'eid' | 'dambe' | 'polocup' | 'ramfair'
  // Abuja only
  | 'inauguration' | 'delegates' | 'carnival' | 'mace' | 'snake' | 'taskforce' | 'jubril' | 'regatta' | 'eagles' | 'palliative'
  // Lagos only
  | 'eyo' | 'detty' | 'felabration' | 'tanker' | 'lekkiflood' | 'marathon' | 'techweek' | 'aluta' | 'landgrab' | 'japa'
  // Kano only
  | 'hisbah' | 'aure' | 'kannywood' | 'harmattan' | 'pyramids' | 'kwari';

export interface LiveEventDef {
  id: LiveEventId;
  icon: string;
  title: string;
  blurb: string;
  /** Where it happens on the map (place id), if anywhere in particular. */
  place?: string;
}

export const LIVE_EVENTS: Record<LiveEventId, LiveEventDef> = {
  fuel: {
    id: 'fuel', icon: '⛽', title: 'Fuel scarcity',
    blurb: 'Queues everywhere. Fuel costs 3×, keke and okada fares jump, and the black market is booming.',
  },
  protest: {
    id: 'protest', icon: '✊🏾', title: 'Protest at Murtala Square', place: 'murtala',
    blurb: 'Placards, whistles and a very nervous police line. Join in, film it, or stay well away.',
  },
  durbar: {
    id: 'durbar', icon: '🐎', title: 'Durbar on horseback', place: 'murtala',
    blurb: 'Horsemen in full regalia. Mount up at Murtala Square and ride the parade.',
  },
  final: {
    id: 'final', icon: '🏆', title: 'Cup final: Kaduna United vs Kano Pillars', place: 'viewing',
    blurb: 'The whole city is watching. Bet on the result in Phone → Gist before the window closes.',
  },
  owambe: {
    id: 'owambe', icon: '💃🏾', title: 'Mega owambe at Murtala Square', place: 'murtala',
    blurb: 'A senator’s daughter is getting married and the whole city is invited. Spray, dance, chop.',
  },
  moneyrain: {
    id: 'moneyrain', icon: '💸', title: 'Senator is spraying cash at Murtala Square', place: 'murtala',
    blurb: 'A helicopter, a politician and a suitcase of new notes. Grab what you can, but elbows are flying.',
  },
  ufo: {
    id: 'ufo', icon: '🛸', title: 'UFO over Kaduna', place: 'murtala',
    blurb: 'A glowing disc is hovering above the square. Pastors say it is a sign. Go and look, or stay indoors.',
  },
  goats: {
    id: 'goats', icon: '🐐', title: 'Sallah goat stampede', place: 'motorpark',
    blurb: 'Fifty goats escaped a truck at the motor park. Catch one and the owner may pay you, or the goat may win.',
  },
  jollof: {
    id: 'jollof', icon: '🍛', title: 'Free jollof giveaway', place: 'murtala',
    blurb: 'A politician is campaigning with pots of party jollof. Queue early, the pots empty fast.',
  },
  eid: {
    id: 'eid', icon: '🌙', title: 'Eid prayers and Sallah gifts', place: 'mosque',
    blurb: 'New babanriga, perfume everywhere. Pray with the congregation and collect Sallah money from the elders.',
  },
  dambe: {
    id: 'dambe', icon: '🥊', title: 'Dambe boxing at Murtala Square', place: 'murtala',
    blurb: 'Hausa traditional boxing with a wrapped fist and a lot of juju. Cheer, or step into the ring.',
  },
  polocup: {
    id: 'polocup', icon: '🏇', title: 'Governor’s Polo Cup', place: 'polo',
    blurb: 'Kaduna Polo Club is full of ponies, politicians and champagne. Watch, ride or hustle the guests.',
  },
  ramfair: {
    id: 'ramfair', icon: '🐏', title: 'Sallah ram fair', place: 'market',
    blurb: 'Rams from Sokoto and Yankasa everywhere, and the price rises by the hour. Haggle hard.',
  },
  blackout: {
    id: 'blackout', icon: '🕯️', title: 'Grid collapse', blurb: 'The national grid don collapse again. No NEPA anywhere until it ends.',
  },
  inauguration: {
    id: 'inauguration', icon: '🇳🇬', title: 'Swearing-in at Eagle Square', place: 'murtala',
    blurb: 'Brass band, 21 guns and every big man in the country in one canopy. Slip into the VIP stand if you have the liver.',
  },
  delegates: {
    id: 'delegates', icon: '💵', title: 'Party primaries: delegates are collecting dollars', place: 'murtala',
    blurb: 'Three aspirants, one Eagle Square, and envelopes moving under agbada. Tie a delegate tag and join the queue.',
  },
  carnival: {
    id: 'carnival', icon: '🎭', title: 'Abuja Carnival', place: 'murtala',
    blurb: 'Floats, masquerades, Tiv dancers and Calabar feathers down to Eagle Square. Dance, or hold a masquerade’s whip.',
  },
  mace: {
    id: 'mace', icon: '🏃🏾', title: 'Mace snatched at the National Assembly', place: 'lugard',
    blurb: 'Thugs ran into plenary and carried the mace away. No mace, no sitting. The Senate will pay whoever brings it back.',
  },
  snake: {
    id: 'snake', icon: '🐍', title: 'A snake swallowed ₦36 million', place: 'secretariat',
    blurb: 'The accounts clerk swears a mysterious snake ate the money in the vault. The whole Secretariat is hunting it.',
  },
  taskforce: {
    id: 'taskforce', icon: '🚜', title: 'Task force and bulldozers at Wuse Market', place: 'market',
    blurb: 'The Minister woke up angry. Traders are running with their goods on their heads and prices have crashed.',
  },
  jubril: {
    id: 'jubril', icon: '🕴🏾', title: 'Is that the real President?', place: 'villa',
    blurb: 'The body-double rumour is back and half of Abuja is at the Villa gate to check his ears. Go and see for yourself.',
  },
  regatta: {
    id: 'regatta', icon: '🚤', title: 'Jabi Lake boat regatta', place: 'river',
    blurb: 'Fishermen against senators’ sons in speedboats. Put money on a canoe or paddle one yourself.',
  },
  eagles: {
    id: 'eagles', icon: '🦅', title: 'Super Eagles open training', place: 'stadium',
    blurb: 'The national team is training at MKO Abiola Stadium and the gates are open. Jerseys, selfies and a stray ball or two.',
  },
  palliative: {
    id: 'palliative', icon: '🍚', title: 'Palliative warehouse found at the Old Parade Ground', place: 'pitch',
    blurb: 'Somebody discovered where the rice and Indomie were hidden. All of Garki is carrying bags on their heads.',
  },
  eyo: {
    id: 'eyo', icon: '🎭', title: 'Eyo Festival at Tafawa Balewa Square', place: 'murtala',
    blurb: 'The Adamu Orisha play. Thousands of white-robed Eyo with their staffs fill Lagos Island. No shoes, no caps, no smoking: the opambata is watching.',
  },
  detty: {
    id: 'detty', icon: '🎤', title: 'Detty December concert at Eko Hotel', place: 'hamdala',
    blurb: 'Every star in the country on one stage and every IJGB in the country in one hall. Tickets are finished. There are other ways in.',
  },
  felabration: {
    id: 'felabration', icon: '🎷', title: 'Felabration at the Shrine', place: 'club',
    blurb: 'A week of Afrobeat for Abami Eda. The band has not stopped since yesterday and the queue is round the block.',
  },
  tanker: {
    id: 'tanker', icon: '🛢️', title: 'A tanker has fallen at Oshodi', place: 'motorpark',
    blurb: 'Thirty-three thousand litres on the road and half of Oshodi running towards it with kegs. LASTMA has blocked everything.',
  },
  lekkiflood: {
    id: 'lekkiflood', icon: '🌊', title: 'Lekki is under water', place: 'boutique',
    blurb: 'It rained for two hours. Admiralty Way is a river, the Benzes are floating and somebody has brought out a canoe.',
  },
  marathon: {
    id: 'marathon', icon: '🏃🏾', title: 'Lagos City Marathon', place: 'stadium',
    blurb: 'Forty-two kilometres from the National Stadium over Third Mainland Bridge. Kenyans in front, Lagosians taking selfies behind.',
  },
  techweek: {
    id: 'techweek', icon: '🦄', title: 'Lagos Startup Week in Yaba', place: 'techhub',
    blurb: 'Foreign investors have landed with dollars and lanyards. Every founder in Yaba has a pitch deck and a new accent.',
  },
  aluta: {
    id: 'aluta', icon: '✊🏾', title: 'Aluta! UNILAG students shut the gate', place: 'poly',
    blurb: 'Fees went up overnight. Akokites have blocked University Road with mattresses and are singing solidarity songs.',
  },
  landgrab: {
    id: 'landgrab', icon: '🪧', title: 'Omo onile have fenced the Secretariat', place: 'secretariat',
    blurb: 'A family says Alausa is their great-grandfather’s farm. They have written “THIS LAND IS NOT FOR SALE” on the Governor’s gate and want foundation money.',
  },
  japa: {
    id: 'japa', icon: '🧳', title: 'Japa rush at the airport', place: 'airport',
    blurb: 'Three flights to London and one to Canada are boarding at once. Whole families have come to cry, pray and carry Ghana-must-go.',
  },
  hisbah: {
    id: 'hisbah', icon: '🍺', title: 'Hisbah have raided Sabon Gari', place: 'club',
    blurb: 'A trailer of beer was stopped on the Zaria road. Hisbah have lined up forty thousand bottles for the bulldozer and all of Sabon Gari has come out to watch.',
  },
  aure: {
    id: 'aure', icon: '💍', title: 'Mass wedding at the Emir’s Palace', place: 'murtala',
    blurb: 'Auren zawarawa: one thousand eight hundred couples, one prayer, and the state is paying every bride price. Kofar Kudu is full of new mattresses.',
  },
  kannywood: {
    id: 'kannywood', icon: '🎬', title: 'Kannywood premiere at Ado Bayero Mall', place: 'mall',
    blurb: 'The biggest Hausa film of the year opens tonight. The stars are on the red carpet and Zoo Road has not moved for an hour.',
  },
  harmattan: {
    id: 'harmattan', icon: '🌫️', title: 'Harmattan haze over Kano', place: 'airport',
    blurb: 'Dust from the Sahara has swallowed the city. You cannot see across the road, every flight is delayed and every lip is cracked.',
  },
  pyramids: {
    id: 'pyramids', icon: '🥜', title: 'The groundnut train is loading', place: 'station',
    blurb: 'A bumper harvest: sacks are stacked to the roof at the railway station and the first groundnut train in years leaves tonight. They are paying loaders by the sack.',
  },
  kwari: {
    id: 'kwari', icon: '🧵', title: 'Sallah cloth rush at Kurmi Market', place: 'market',
    blurb: 'Two days to Sallah and every tailor in Kano needs shadda now. Bales are changing hands three times before they reach the stall.',
  },
};

/** What a shared event is called in another city (the place ids are the same in every city, game/abuja.ts). */
const CITY_DEFS: Record<string, Partial<Record<LiveEventId, Partial<LiveEventDef>>>> = {
  abuja: {
    protest: { title: 'NLC protest at Eagle Square', blurb: 'Labour has shut the capital down over the price of everything. Placards, solidarity songs and a very nervous police line.' },
    owambe: { title: 'Minister’s daughter’s wedding at Eagle Square', blurb: 'Three governors, forty convoys and aso-ebi that costs a plot in Lugbe. Spray, dance, chop.' },
    final: { title: 'Cup final: Kaduna United vs Kano Pillars', blurb: 'Every viewing centre from Kubwa to Lugbe is full. Bet on the result in Phone → Gist before the window closes.' },
    eid: { title: 'Eid prayers at the National Mosque', blurb: 'The golden dome, ten thousand mats and convoys double-parked to Wuse. Pray and collect Sallah money from the big men.' },
    polocup: { title: 'Guards Polo tournament', blurb: 'Guards Polo Club is full of ponies, generals and champagne. Watch, ride or hustle the guests.' },
    fuel: { blurb: 'Queues from Conoil to the City Gate. Fuel costs 3×, cab fares jump, and the black market is booming.' },
  },
  lagos: {
    protest: { title: 'Protest at Tafawa Balewa Square', blurb: 'Lagos has come out. Placards, speakers on a truck, free jollof from strangers and a very nervous police line.' },
    owambe: { title: 'Owambe of the year at TBS', blurb: 'Two families, four live bands and aso-ebi in six colours. Spray, dance, chop, and collect your souvenir bucket.' },
    final: { title: 'Cup final: Kaduna United vs Kano Pillars', blurb: 'Every viewing centre from Mushin to Ajah is full. Bet on the result in Phone → Gist before the window closes.' },
    eid: { title: 'Eid prayers at the Lagos Central Mosque', blurb: 'Lagos Island is one long row of mats. Pray, then follow the drummers and collect Sallah money from the big men.' },
    polocup: { title: 'Lagos International Polo Tournament', blurb: 'Lagos Polo Club is full of ponies, old money and champagne. Watch, ride or hustle the guests.' },
    fuel: { blurb: 'Queues from Ikeja to Ajah. Fuel costs 3×, danfo fares double, and the black market is booming.' },
  },
  kano: {
    protest: { title: 'Protest at Kofar Kudu', blurb: 'The talakawa have come out. Placards, drums and a very nervous police line in front of the palace gate.' },
    owambe: { title: 'Wedding fatiha of the year at Kofar Kudu', blurb: 'An alhaji’s daughter is getting married and the whole of Kano is invited. Spray, dance, chop.' },
    durbar: { title: 'Hawan Daushe at the Emir’s Palace', blurb: 'The greatest Durbar of them all. District heads in full regalia charge the palace gate. Mount up at Kofar Kudu and ride with them.' },
    dambe: { title: 'Dambe boxing at Kofar Kudu', blurb: 'Kano is the home of dambe. A wrapped fist, a lot of juju and a ring of drummers. Cheer, or step in.' },
    final: { title: 'Cup final: Kaduna United vs Kano Pillars', blurb: 'Sai Masu Gida! Every viewing centre from Fagge to Hotoro is full. Bet on the result in Phone → Gist before the window closes.' },
    eid: { title: 'Eid prayers at the Central Mosque', blurb: 'The Emir rides to prayer and half of Kano follows on foot. The rows run out of the gate and down the road. Pray, then collect Sallah money from the elders.' },
    polocup: { title: 'Emir’s Polo Cup', blurb: 'Kano Polo Club is full of ponies, princes and chilled zobo. Watch, ride or hustle the guests.' },
    ramfair: { title: 'Sallah ram fair at Kurmi', blurb: 'Rams from Niger and Sokoto fill Kasuwar Rago, and the price rises by the hour. Haggle hard.' },
    fuel: { blurb: 'Queues from Hotoro depot to Kofar Nassarawa. Fuel costs 3×, adaidaita fares double, and the black market is booming.' },
  },
};

const ORDER: LiveEventId[] = ['fuel', 'final', 'protest', 'owambe', 'durbar', 'blackout', 'moneyrain', 'ufo', 'goats', 'jollof', 'eid', 'dambe', 'polocup', 'ramfair'];
/** These hit the whole country at once, so the server (which only looks at Kaduna's clock) and every city agree. */
const NATIONAL: LiveEventId[] = ['fuel', 'blackout', 'final'];
/** What the other cities get whenever Kaduna's slot is not a national one. */
const CITY_ORDER: Record<string, LiveEventId[]> = {
  abuja: ['inauguration', 'mace', 'snake', 'owambe', 'delegates', 'taskforce', 'jubril', 'carnival', 'protest', 'regatta', 'eagles', 'palliative', 'eid', 'polocup'],
  lagos: ['eyo', 'tanker', 'detty', 'owambe', 'lekkiflood', 'felabration', 'japa', 'landgrab', 'protest', 'marathon', 'techweek', 'aluta', 'eid', 'polocup'],
  // Kano shares the north's own: the Durbar, dambe and the ram fair come round here too.
  kano: ['durbar', 'hisbah', 'aure', 'owambe', 'kwari', 'dambe', 'kannywood', 'pyramids', 'protest', 'harmattan', 'ramfair', 'eid', 'polocup', 'goats'],
};

/** The event as that city knows it. */
export function liveDef(id: LiveEventId, city?: string | null): LiveEventDef {
  const local = CITY_DEFS[city ?? '']?.[id];
  return local ? { ...LIVE_EVENTS[id], ...local } : LIVE_EVENTS[id];
}

/** Small, stable integer hash (same in the browser and the Worker). */
export function hash(n: number) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const slotOf = (now: number) => Math.floor(now / LIVE_SLOT_MS);
export const slotStart = (slot: number) => slot * LIVE_SLOT_MS;
export function eventOfSlot(slot: number, city?: string | null): LiveEventId {
  const home = ORDER[hash(slot) % ORDER.length];
  const local = CITY_ORDER[city ?? ''];
  if (!local || NATIONAL.includes(home)) return home;
  return local[hash(slot * 31 + 17) % local.length];
}

export interface LiveNow {
  def: LiveEventDef;
  slot: number;
  startsAt: number;
  endsAt: number;
  active: boolean;
}

/** The live event running now in that city (Kaduna if none is given), or the next one if none is. */
export function liveEvent(now = Date.now(), city?: string | null): LiveNow {
  const slot = slotOf(now);
  const startsAt = slotStart(slot);
  const endsAt = startsAt + LIVE_DURATION_MS;
  if (now < endsAt) return { def: liveDef(eventOfSlot(slot, city), city), slot, startsAt, endsAt, active: true };
  const next = slot + 1;
  return { def: liveDef(eventOfSlot(next, city), city), slot: next, startsAt: slotStart(next), endsAt: slotStart(next) + LIVE_DURATION_MS, active: false };
}

export const activeEvent = (now = Date.now(), city?: string | null): LiveEventId | null => {
  const e = liveEvent(now, city);
  return e.active ? e.def.id : null;
};

/** Football final odds, as payout multipliers on the stake. */
export const FINAL_ODDS = { home: 2.1, draw: 3.2, away: 2.9 } as const;
export type FinalPick = keyof typeof FINAL_ODDS;
export const FINAL_TEAMS = { home: 'Kaduna United', away: 'Kano Pillars' };
export const MAX_STAKE = 100_000;

/* ---------- NEPA ---------- */

/** The grid is decided in windows this long (real time; a game day is an hour, so this is about three game hours). */
export const GRID_WINDOW_MS = 3 * 60_000;
const GRID_OFF_CHANCE = 0.33;

/** Is there NEPA light right now? The same answer for every player in the city. */
export function gridOn(now = Date.now()) {
  if (activeEvent(now) === 'blackout') return false;
  return hash(Math.floor(now / GRID_WINDOW_MS) * 7 + 3) % 1000 >= GRID_OFF_CHANCE * 1000;
}

/* ---------- Fuel ---------- */

export const FUEL = {
  /** One jerrycan (25L) at the pump. */
  pump: 6_500,
  /** Stolen fuel from the boys behind the depot. Cheap, but police sometimes raid them. */
  blackMarket: 3_500,
  raidChance: 0.2,
  raidFine: 15_000,
  /** Desperate neighbours pay this during a scarcity. */
  scarcitySell: 14_000,
  /** Prices multiply by this during a scarcity. */
  scarcity: 3,
  maxCans: 10,
};

/** The boys behind the depot raise their price too, just less than the pumps. */
export const blackMarketPrice = (now = Date.now()) => (activeEvent(now) === 'fuel' ? FUEL.blackMarket * 2 : FUEL.blackMarket);
export const fuelPrice = (now = Date.now()) => (activeEvent(now) === 'fuel' ? FUEL.pump * FUEL.scarcity : FUEL.pump);

/* ---------- Road conditions ---------- */

// A second, faster clock just for the roads: something is always about to happen to drivers. Same trick as
// the main live events (a pure function of real time, so every driver and the Worker agree).

export const ROAD_SLOT_MS = 75 * 60_000;
export const ROAD_DURATION_MS = 30 * 60_000;
/** Offset so the road clock never lines up with the main event clock. */
const ROAD_OFFSET = 20 * 60_000;

export type RoadEventId = 'gridlock' | 'flood' | 'convoy' | 'crackdown' | 'strike' | 'harmattan';

export interface RoadEventDef {
  id: RoadEventId;
  icon: string;
  title: string;
  blurb: string;
  /** Driving modifiers while it lasts (read by game/drive.ts). */
  speed: number;
  fare: number;
  /** Open potholes bite from this far away (tiles), and more often cause trouble. */
  potholeReach: number;
  troubleMult: number;
  /** Checkpoint asks multiply by this, and they come back sooner. */
  askMult: number;
  respiteMult: number;
  /** Extra chance per minute of a driving street story. */
  storyBoost: number;
}

const NEUTRAL = { speed: 1, fare: 1, potholeReach: 0.5, troubleMult: 1, askMult: 1, respiteMult: 1, storyBoost: 0 };

export const ROAD_EVENTS: Record<RoadEventId, RoadEventDef> = {
  gridlock: { ...NEUTRAL, id: 'gridlock', icon: '🚦', title: 'Gridlock on Ahmadu Bello Way', blurb: 'Everybody is going somewhere at once. Slow going, but passengers pay for the pain.', speed: 0.6, fare: 1.4, storyBoost: 0.04 },
  flood: { ...NEUTRAL, id: 'flood', icon: '🌧️', title: 'Flash flood', blurb: 'Muddy water has covered the potholes. You will find them with your tyres.', speed: 0.75, fare: 1.3, potholeReach: 0.9, troubleMult: 2 },
  convoy: { ...NEUTRAL, id: 'convoy', icon: '🚨', title: 'VIP convoy on the move', blurb: 'Sirens, whips and a Hilux full of men who hate your car. Give way.', speed: 0.9, storyBoost: 0.06 },
  crackdown: { ...NEUTRAL, id: 'crackdown', icon: '👮🏾', title: 'Police crackdown', blurb: 'Extra checkpoints, higher “settlements”, and officers sniffing windows. Do NOT drive high.', askMult: 2, respiteMult: 0.4 },
  strike: { ...NEUTRAL, id: 'strike', icon: '✊🏾', title: 'NURTW strike', blurb: 'The union has parked its drivers. Anyone still driving earns double. The boys are watching who.', fare: 1.8, storyBoost: 0.05 },
  harmattan: { ...NEUTRAL, id: 'harmattan', icon: '🌫️', title: 'Harmattan dust', blurb: 'You can’t see ten metres. Potholes appear when you are on top of them.', speed: 0.9, potholeReach: 0.8, troubleMult: 1.5 },
};
const ROAD_ORDER: RoadEventId[] = ['gridlock', 'strike', 'flood', 'crackdown', 'convoy', 'harmattan'];

const roadSlotOf = (now: number) => Math.floor((now - ROAD_OFFSET) / ROAD_SLOT_MS);
export const roadSlotStart = (slot: number) => slot * ROAD_SLOT_MS + ROAD_OFFSET;
const roadOfSlot = (slot: number): RoadEventId => ROAD_ORDER[hash(slot * 13 + 5) % ROAD_ORDER.length];

export interface RoadNow {
  def: RoadEventDef;
  startsAt: number;
  endsAt: number;
  active: boolean;
}

/** The road event on now, or the next one to come. */
export function roadEvent(now = Date.now()): RoadNow {
  const slot = roadSlotOf(now);
  const startsAt = roadSlotStart(slot);
  const endsAt = startsAt + ROAD_DURATION_MS;
  if (now < endsAt) return { def: ROAD_EVENTS[roadOfSlot(slot)], startsAt, endsAt, active: true };
  const next = slot + 1;
  return { def: ROAD_EVENTS[roadOfSlot(next)], startsAt: roadSlotStart(next), endsAt: roadSlotStart(next) + ROAD_DURATION_MS, active: false };
}

/** Modifiers in force right now (neutral when no road event is running). */
export const roadMods = (now = Date.now()): RoadEventDef | typeof NEUTRAL => {
  const e = roadEvent(now);
  return e.active ? e.def : NEUTRAL;
};
export const activeRoadEvent = (now = Date.now()): RoadEventId | null => {
  const e = roadEvent(now);
  return e.active ? e.def.id : null;
};
