// NPC citizens (worker/npcs.ts, migrations/0116_npc_citizens.sql): the people who live in the states besides the
// players. Each one has a name, a job, a wallet and a temper. They work and pay their state's taxes and VAT, save up,
// buy plots and build houses in the estates, adopt children, vote at some point in the polling hour, steal, defraud
// each other, cut street-light cables, fill potholes, give to the state, tweet about the government, and move to a
// better-run state or japa out of the country when life gets too hard. Newcomers keep arriving while a state has room.
// On top of that it is chaos on purpose (migrations/0117_npc_chaos.sql): every one has a quirk (NPC_TRAITS), wild
// things happen to them out of nowhere (NPC_WILD), whole states catch crazes for a few hours (NPC_CRAZES), and they
// reply to posts, pick fights with each other and like things on Twitter (NPC_REPLIES).
// Rules and numbers only; the server runs them.

import { CITY_NAME, type CivicCity } from './civic';
import type { StateAsset } from './treasury';

/** NPC uids, here and in the rental market ('npc:<uuid>' tenants), never a real player's. */
export const NPC_PREFIX = 'npc:';
export const isNpc = (uid: string | null | undefined) => typeof uid === 'string' && uid.startsWith(NPC_PREFIX);

export const NPC_POP = {
  /** How many adults each state can hold when it is run well (a happiness of 100). Lagos is the big one. */
  base: { kaduna: 400, kano: 450, abuja: 600, lagos: 900 } as Record<CivicCity, number>,
  /** A state with fewer than this gets them at once, so a fresh server is never empty. */
  seed: 30,
  /** Of the room a state has left, this share arrives each hour, but never more than maxArrivals. */
  arriveShare: 0.05,
  maxArrivals: 14,
  /** Each real player living in a state takes the place of this many NPCs: the crowd thins out as players move in. */
  perPlayer: 3,
  /** ...but a state never drops below this share of its base. */
  floorShare: 0.25,
  /** A player counts as living there if they were seen this recently. */
  activeMs: 7 * 24 * 3_600_000,
  /** Each NPC acts once in a while (work, spend, build, steal...), somewhere in this gap: nobody keeps a timetable. */
  actGapMs: [15 * 60_000, 150 * 60_000] as const,
  /** Some days business is good, some days it is not: one act's pay is the wage times somewhere in this range. */
  luck: [0.3, 1.8] as const,
  /** Moods swing a little for no reason at all, by up to this much either way. */
  moodNoise: 5,
  /** At most this many act in one five-minute tick. */
  maxDue: 240,
  /** Hours of pay one act covers, at most (a server that was down doesn't hand out a week's wages). */
  maxHours: 3,
  /** The population round (arrivals, moves, japa, births) runs this often. */
  roundMs: 3_600_000,
  /** Posts NPCs may put on Twitter per tick, and per population round. */
  postsPerTick: 1,
  postsPerRound: 2,
};

/** How much busier a state's people make it: 1 with nobody, up to 1.5 when it is full. Boosts shops, tenants and gate money. */
export const crowdFactor = (heads: Partial<Record<string, number>>, city: string | null | undefined) =>
  city && city in NPC_POP.base ? 1 + 0.5 * Math.min(1, (heads[city] ?? 0) / NPC_POP.base[city as CivicCity]) : 1;

/** City wages, as a multiple of Kaduna's. */
export const WAGE_SCALE: Record<CivicCity, number> = { kaduna: 1, kano: 1, abuja: 1.5, lagos: 1.8 };

export interface NpcJob {
  id: string;
  label: string;
  icon: string;
  /** Pay per real hour in Kaduna (WAGE_SCALE for elsewhere). */
  wage: number;
  /** How often arrivals take it up; `in` raises it in some states. */
  weight: number;
  in?: Partial<Record<CivicCity, number>>;
  /** Jobs that can reach the state's money (embezzlement), or that are a crime already. */
  government?: boolean;
  crooked?: boolean;
}

export const NPC_JOBS: NpcJob[] = [
  { id: 'okada', label: 'Okada rider', icon: '🏍️', wage: 6_000, weight: 10, in: { kano: 1.4, kaduna: 1.3 } },
  { id: 'trader', label: 'Market trader', icon: '🧺', wage: 12_000, weight: 14, in: { kano: 1.6 } },
  { id: 'mechanic', label: 'Mechanic', icon: '🔧', wage: 10_000, weight: 8 },
  { id: 'tailor', label: 'Tailor', icon: '🧵', wage: 9_000, weight: 6 },
  { id: 'teacher', label: 'Teacher', icon: '📚', wage: 13_000, weight: 7 },
  { id: 'nurse', label: 'Nurse', icon: '🩺', wage: 18_000, weight: 5 },
  { id: 'civil', label: 'Civil servant', icon: '🗂️', wage: 22_000, weight: 7, in: { abuja: 2.2 }, government: true },
  { id: 'aide', label: 'Political aide', icon: '🕴🏾', wage: 35_000, weight: 2, in: { abuja: 2 }, government: true },
  { id: 'banker', label: 'Banker', icon: '🏦', wage: 55_000, weight: 3, in: { lagos: 2, abuja: 1.5 } },
  { id: 'techbro', label: 'Tech bro', icon: '💻', wage: 80_000, weight: 3, in: { lagos: 2.5, abuja: 1.3 } },
  { id: 'doctor', label: 'Doctor', icon: '👨🏾‍⚕️', wage: 70_000, weight: 2 },
  { id: 'pastor', label: 'Pastor', icon: '⛪', wage: 45_000, weight: 2, in: { lagos: 1.5 } },
  { id: 'contractor', label: 'Contractor', icon: '🏗️', wage: 110_000, weight: 1.5, in: { abuja: 1.8 } },
  { id: 'importer', label: 'Big-time importer', icon: '🚢', wage: 220_000, weight: 0.6, in: { lagos: 2, kano: 1.5 } },
  { id: 'yahoo', label: '“Forex trader”', icon: '📱', wage: 60_000, weight: 2, in: { lagos: 1.6 }, crooked: true },
];
export const NPC_JOB_BY_ID: Record<string, NpcJob> = Object.fromEntries(NPC_JOBS.map((j) => [j.id, j]));
export const wageOf = (job: string, city: CivicCity) => Math.round((NPC_JOB_BY_ID[job]?.wage ?? 8_000) * WAGE_SCALE[city]);

/** A job for a newcomer to that state. */
export function pickJob(city: CivicCity, rand: () => number): NpcJob {
  const weights = NPC_JOBS.map((j) => j.weight * (j.in?.[city] ?? 1));
  let roll = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < NPC_JOBS.length; i++) if ((roll -= weights[i]) < 0) return NPC_JOBS[i];
  return NPC_JOBS[0];
}

export const NPC_MONEY = {
  /** Share of pay spent on living (food, transport, data, owambe), VAT on it to the state. Ambition saves more. */
  spendShare: 0.6,
  ambitionSaves: 0.25,
  /** Above this many hours of pay in the bank, they spend this share of the excess an act as well: the rich live large. */
  cushionHours: 200,
  excessSpend: 0.02,
  /** A newcomer brings this many hours of pay with them; a returnee from abroad, many more. */
  startHours: [10, 60] as const,
  returneeHours: [400, 2_000] as const,
  returneeChance: 0.08,
  /** Selling up to move state or japa gets back this share of what their house cost. */
  houseResale: 0.8,
};

/* ---------- How a state treats its people ---------- */

/** How much each asset's condition counts towards life in a state. They add up to 1. */
const LIFE_WEIGHTS: Partial<Record<StateAsset, number>> = {
  roads: 0.2, hospital: 0.15, police: 0.15, lights: 0.1, schools: 0.1, markets: 0.1, transport: 0.1, parks: 0.05, culture: 0.025, techhub: 0.025,
};

export interface LifeFacts {
  /** Asset conditions, 0 to 100 (missing counts as 80). */
  conditions: Partial<Record<StateAsset, number>>;
  /** Wage tax, percent: the president's and the state's together. */
  incomeTax: number;
  /** The state's sales tax, percent. */
  salesTax: number;
  /** Bills the state could not pay. */
  arrears: number;
}

/** Life in a state, 0 to 100: good roads, hospitals and police push it up, high taxes and unpaid bills drag it down. */
export function lifeScore(f: LifeFacts): number {
  const services = Object.entries(LIFE_WEIGHTS).reduce((n, [a, w]) => n + (f.conditions[a as StateAsset] ?? 80) * w!, 0);
  const taxes = Math.min(40, f.incomeTax * 1.2 + f.salesTax * 0.5);
  return Math.round(Math.max(0, Math.min(100, services * 0.85 + 15 - taxes - (f.arrears > 0 ? 10 : 0))));
}

/** How many adults a state draws now, given how it is run and how many players live there. */
export function targetPopulation(city: CivicCity, life: number, players: number) {
  const base = NPC_POP.base[city];
  return Math.max(Math.round(base * NPC_POP.floorShare), Math.round(base * (0.4 + (0.6 * life) / 100)) - players * NPC_POP.perPlayer);
}

/** One act's mood: it drifts towards how the state treats them, with whatever just happened to them on top. */
export const nextMood = (mood: number, life: number, bump = 0) => Math.round(Math.max(0, Math.min(100, mood + (life - mood) * 0.3 + bump)));

export const MOOD_BUMPS = { robbed: -12, jailed: -20, plot: 8, house: 18, rented: 6, adopted: 15, baby: 15, gave: 4, unpaidTax: 0 };

export const NPC_LEAVE = {
  /** Japa per round: very unhappy, unhappy, and anyone (people leave for school, for love, for no reason). */
  japa: [0.05, 0.012, 0.0015] as const,
  /** Below these moods. */
  japaMood: [25, 40] as const,
  /** Moving to another state per round, when its life is this much better and they are this unhappy. */
  moveChance: 0.04,
  moveGap: 12,
  moveMood: 50,
  /** A state over its target sees the extra leave faster. */
  crowdedJapa: 0.03,
};

/** Family. A house of their own and enough saved, and they may adopt (the fee goes to the state, as for a player). */
export const NPC_FAMILY = {
  maxKids: 5,
  adoptChance: 0.04,
  /** Paid to the state's Social Welfare (KIDS.fee for players). */
  adoptFee: 350_000,
  /** Chance a round that a family with a finished house has a baby. */
  babyChance: 0.008,
};

/* ---------- Houses ---------- */

export const NPC_HOUSE = {
  /** Spend at most this share of savings on land, and only buy at all with this chance an act once they can. */
  landShare: 0.6,
  buyChance: 0.5,
  /** Only so many plots change hands in one tick across the country. */
  maxBuysPerTick: 4,
  /** A stage is paid for with this chance an act, once they have the money for it. */
  buildChance: 0.7,
  /** Their builder (src/game/property.ts CONTRACTORS). */
  contractor: 'standard',
};

/* ---------- Crime and good deeds ---------- */

export type NpcCrimeId = 'pickpocket' | 'yahoo' | 'burglary' | 'cables' | 'embezzle' | 'evade';

export interface NpcCrime {
  id: NpcCrimeId;
  icon: string;
  weight: number;
  /** What it takes, in hours of the thief's own pay (a big man's crime is bigger), within these naira. */
  hours: readonly [number, number];
  min: number;
  max: number;
}

export const NPC_CRIMES: NpcCrime[] = [
  { id: 'pickpocket', icon: '👛', weight: 4, hours: [1, 4], min: 3_000, max: 80_000 },
  { id: 'yahoo', icon: '💻', weight: 3, hours: [5, 40], min: 50_000, max: 3_000_000 },
  { id: 'burglary', icon: '🏚️', weight: 2, hours: [4, 20], min: 30_000, max: 1_000_000 },
  { id: 'cables', icon: '💡', weight: 1.5, hours: [2, 6], min: 20_000, max: 200_000 },
  { id: 'embezzle', icon: '🧾', weight: 0.8, hours: [20, 100], min: 200_000, max: 5_000_000 },
  { id: 'evade', icon: '🙈', weight: 3, hours: [0, 0], min: 0, max: 0 },
];

export const NPC_CRIME = {
  /** Chance an act that an NPC commits a crime, at honesty 0 (it falls away fast as honesty rises). Fraudsters by trade: double. */
  chance: 0.07,
  /** The police catch them with this chance, plus the rest in proportion to how the police stations are kept. */
  catchBase: 0.15,
  catchPolice: 0.5,
  /** Caught: fined this many times the haul (to the federal treasury) plus a flat sum, and jailed for this long. */
  fineTimes: 2,
  fineFlat: 20_000,
  jailMs: [2 * 3_600_000, 6 * 3_600_000] as const,
  /** Getting caught makes them a little more careful. */
  lesson: 6,
  /** One street light cut a city per tick at most; embezzlement never takes more than this share of a treasury. */
  embezzleShare: 0.004,
};

export const NPC_GOOD = {
  /** Chance an act at honesty 100 (it falls away fast as honesty drops), once they have cushionHours of pay. */
  chance: 0.03,
  /** Donations to the state: this share of their savings, at most `donateMax`. */
  donateShare: [0.03, 0.12] as const,
  donateMax: 20_000_000,
  /** Filling a pothole on their street costs them this much. */
  potholeCost: 150_000,
  /** Helping a poorer neighbour: this share of their savings. */
  charityShare: [0.01, 0.04] as const,
};

/* ---------- The population counter ---------- */

/** Who lives in a state (Civic app, the state's card on the map): NPC adults and their children, players, how they feel, and today's comings and goings. */
export interface StatePeople {
  adults: number; kids: number; players: number;
  /** Average mood of the NPCs, and life in the state as they score it (lifeScore), 0 to 100. */
  mood: number | null; life: number;
  today: { arrived: number; movedIn: number; movedOut: number; japa: number; born: number; adopted: number; arrested: number };
  /** The craze the state has caught right now (NPC_CRAZES), and when it wears off. */
  craze?: { id: string; until: number } | null;
}

/** Everybody who lives there. */
export const populationOf = (p: StatePeople) => p.adults + p.kids + p.players;

/* ---------- Voting ---------- */

export const NPC_VOTE = {
  /** Turnout, from the angriest (they stay home) to the happiest. */
  turnout: [0.3, 0.75] as const,
  /** Every candidate starts with this much appeal; campaign support adds to it one for one. */
  base: 10,
  /** The one in the seat: how the state (or the country) has been run moves votes by up to this much, either way. */
  record: 40,
  /** Each NPC also just likes some candidates more than others, by up to this much. */
  whim: 25,
  /** Fraudsters follow the money: vote-buying (campaign support) counts this much more for them. */
  bribable: 1.5,
};

/** A stable number in [0, 1) from a string: the same NPC always feels the same about a candidate, and votes at the same minute. */
export function hash01(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4_294_967_296;
}

/* ---------- What they say ---------- */

const pickOf = <T,>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length)];
const fill = (line: string, vars: Record<string, string>) => line.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

/** Where newcomers say they came from. */
export const ARRIVE_FROM = ['Jos', 'Enugu', 'Ibadan', 'Benin', 'Port Harcourt', 'Maiduguri', 'Ilorin', 'Owerri', 'Sokoto', 'Calabar', 'Makurdi', 'Abeokuta', 'the village'];
export const RETURN_FROM = ['London', 'Houston', 'Toronto', 'Dubai', 'Manchester', 'Berlin'];
export const JAPA_TO = ['Toronto', 'London', 'Berlin', 'Houston', 'Dubai', 'Dublin', 'Manchester', 'Helsinki', 'Calgary'];

export const NPC_LINES = {
  arrive: [
    'Just landed in {city} from {from}. New city, new hustle. Make una welcome me o 🙏🏾',
    'Moved to {city} today. {job} by day, big dreams by night. Let’s go 💪🏾',
    'Packed my load from {from} to {city}. They said the money is here. We go see 👀',
  ],
  returnee: [
    'After 8 years in {from}, I don come back. {city}, I missed you. Jollof first, then business 🇳🇬',
    'Reverse japa is real. Back in {city} from {from} with small savings and a big plan ✈️',
  ],
  plot: [
    'Finally bought my own land in {region}! Omo onile, please I beg, leave me alone 😭🙏🏾',
    'Land don land. A {plot} in {region}, papers complete. Next stop: foundation 🧱',
  ],
  house: [
    'Landlord mode activated 🔑 My {design} in {region} is finished. Housewarming this weekend!',
    'From renting one room to my own {design} in {region}. God did 🙌🏾',
  ],
  rented: [
    'No more government quarters 🙌🏾 Just rented a {design} in {region} from {owner}. Small small, we go reach 🔑',
    'Moved into my own rented {design} in {region} today. Thank you {owner}, abeg no increase rent o 😂🔑',
    'Packed out of the government house. {region} is home now, {design} and all. Landlord {owner} na correct person 🏠',
  ],
  adopted: [
    'Our family just got bigger. Welcome home, little one ❤️ {city} Social Welfare, thank you.',
    'We adopted! Sleepless nights loading but my heart is full 🥹',
  ],
  baby: ['It’s a baby! Mama and child are fine. Owambe loading 🎉', 'New baby in the house! Nobody is sleeping this week 😂🍼'],
  japa: [
    'Visa came through! {to}, here I come. {city}, I go miss you o 🧳✈️',
    'Last night in Naija. Off to {to} for my masters. Pray for me 🙏🏾',
    'Sold my generator, my bed and my standing fan. {to} by Friday. Who wants my Ankara collection? 😂🧳',
    'Got a care job in {to}. Na wipe old people bum bum I go dey do but na pounds 💷 {city} bye!',
    'Mummy is crying at the airport. I’m crying too. {to}, abeg be nice to me 🥲✈️',
  ],
  japaAngry: [
    'I don japa. {to}, here I come. {city}, I tried, you no try for me 🧳✈️',
    'Last night in Naija. Visa came through for {to}. Don’t cry for me, cry for {city} roads 😭',
    'Japa complete. Sold everything. {city} taxes and darkness chased me away. Bye 👋🏾',
  ],
  move: [
    'Moving from {from} to {city}. At least there, the light dey and the road no dey swallow motor 🚚',
    'Packed up and left {from} for {city}. Life is too short for that kind of governance 🙄',
  ],
  caught: [
    '🚔 Police in {city} picked up {name} for {crime}. Fined {fine}. Una see as e be?',
    '🚔 {name} don enter cell in {city} for {crime}. {fine} fine. Crime no pay 👀',
  ],
  caughtRobber: ['🚔 {name} has been arrested in {city} for {crime}. The money is going back to the victim. Fined {fine} on top 👏🏾'],
  unsolved: [
    'Somebody {crimeDid} in {city} again and police never catch anybody 😤',
    'Thieves {crimeDid} near my house last night. {city}, where are the police?? 🚨',
  ],
  donate: [
    '{name} just donated {amount} to {city} State. Some people are just good like that 🙏🏾',
    'Gave {amount} to {city} today. Governor, use it well o. We are watching 👀',
  ],
  pothole: [
    'Government no fix the pothole on our street, so I fixed it myself. ₦150k. You’re welcome {city} 🛣️',
    'Paid boys to fill the pothole in front of my house. If you wait for government in {city}, you go wait tire 🙄',
  ],
  roadsBad: ['The roads in {city} are a disgrace. I just lost my second tyre this week 😤🛞', 'Is {city} government even aware there are roads? Asking for my suspension 🙄'],
  lightsBad: ['{city} is in total darkness again. Street lights don die, everybody dey use phone torch 🔦', 'Walking home in {city} at night is an extreme sport now. No light anywhere 🌑'],
  hospitalBad: ['Took my mum to the hospital in {city}. No doctor, no drugs, double the bill. Nawa 😔', '{city} hospital is a place you go to get sick 😷'],
  taxBad: ['{tax}% tax?! {city} government wants to collect even my breath. I’m tired 😩', 'Every week, new tax in {city}. Soon they’ll tax us for sleeping 💸'],
  arrears: ['{city} cannot even pay its own bills. And they want our votes? 🤡', 'They say {city} State is broke. Where did the money go?? 🧐'],
  good: [
    'Honestly, {city} is getting better. Roads smooth, light steady. Credit where it’s due 👏🏾',
    'Love it or hate it, {city} is working right now. Good job to whoever is in charge 🙌🏾',
  ],
  vote: ['Just voted in {city}! Queue was long but my PVC is my power 🗳️', 'Voted. Now let’s see if they’ll count it 👀🗳️'],
};

/** What a crime is called in a headline, and in a complaint ("someone {did}"). */
export const CRIME_TEXT: Record<NpcCrimeId, { name: string; did: string }> = {
  pickpocket: { name: 'pickpocketing at the market', did: 'snatched phones at the market' },
  yahoo: { name: 'internet fraud', did: 'scammed my neighbour online' },
  burglary: { name: 'burglary', did: 'broke into a house' },
  cables: { name: 'stealing street-light cables', did: 'stole the street-light cables' },
  embezzle: { name: 'embezzling state funds', did: 'stole from the state treasury' },
  evade: { name: 'tax evasion', did: 'dodged their taxes' },
};

/** One NPC line, filled in. */
export const npcLine = (kind: keyof typeof NPC_LINES, vars: Record<string, string>, rand: () => number) => fill(pickOf(NPC_LINES[kind], rand), vars);
/** Any line with {placeholders}, filled in (NPC_WILD, REPLY_LINES). */
export const fillLine = fill;
export const cityName = (city: CivicCity) => CITY_NAME[city];

/* ---------- Chaos: quirks ---------- */

export type NpcTrait = 'normal' | 'gambler' | 'showoff' | 'gossip' | 'pious' | 'party' | 'stingy' | 'hothead' | 'hustler' | 'dreamer';

export interface TraitDef {
  icon: string;
  label: string;
  /** Multipliers on: living costs, crime, good deeds, posting and replying, japa, pay, and wild things happening. */
  spend: number; crime: number; good: number; talk: number; japa: number; wage: number; wild: number;
  /** How often a newcomer has it. */
  weight: number;
}

const T = (icon: string, label: string, weight: number, m: Partial<Omit<TraitDef, 'icon' | 'label' | 'weight'>> = {}): TraitDef => ({
  icon, label, weight, spend: 1, crime: 1, good: 1, talk: 1, japa: 1, wage: 1, wild: 1, ...m,
});

export const NPC_TRAITS: Record<NpcTrait, TraitDef> = {
  normal: T('🙂', 'Regular person', 8),
  gambler: T('🎰', 'Gambler', 2, { wild: 2.5, spend: 1.2, crime: 1.3 }),
  showoff: T('💅', 'Show-off', 2, { spend: 1.8, talk: 1.5, wild: 1.4 }),
  gossip: T('🗣️', 'Gossip', 2, { talk: 4 }),
  pious: T('🙏🏾', 'Prayer warrior', 2, { crime: 0.3, good: 3, wild: 1.2 }),
  party: T('🎉', 'Party animal', 2, { spend: 1.6, wild: 1.5, talk: 1.3 }),
  stingy: T('🪙', 'Stingy', 2, { spend: 0.5, good: 0.1 }),
  hothead: T('😤', 'Hothead', 1.5, { crime: 2.2, talk: 2, wild: 1.3 }),
  hustler: T('💼', 'Hustler', 2, { wage: 1.35, wild: 1.2 }),
  dreamer: T('✨', 'Dreamer', 1.5, { japa: 3, wild: 1.3 }),
};
const TRAIT_IDS = Object.keys(NPC_TRAITS) as NpcTrait[];
export const traitOf = (id: string | null | undefined) => NPC_TRAITS[(id as NpcTrait) ?? 'normal'] ?? NPC_TRAITS.normal;
export function pickTrait(rand: () => number): NpcTrait {
  let roll = rand() * TRAIT_IDS.reduce((n, t) => n + NPC_TRAITS[t].weight, 0);
  return TRAIT_IDS.find((t) => (roll -= NPC_TRAITS[t].weight) < 0) ?? 'normal';
}

/* ---------- Chaos: wild things that happen to people ---------- */

export type NpcWildId =
  | 'jackpot' | 'betLoss' | 'inheritance' | 'kidnapped' | 'villagePeople' | 'sacked' | 'promoted' | 'pastorScam' | 'owambe'
  | 'carFlex' | 'married' | 'breakup' | 'cryptoWin' | 'cryptoLoss' | 'viral' | 'phoneSnatched' | 'visaLottery' | 'prophecy'
  | 'twins' | 'landGrab' | 'houseFire' | 'wrongArrest' | 'scholarship' | 'sideHustle' | 'chiefTitle';

export interface NpcWild {
  id: NpcWildId;
  icon: string;
  weight: number;
  /** Some quirks (and jobs) make it much more likely. */
  traits?: Partial<Record<NpcTrait, number>>;
  jobs?: string[];
  /** Only if they have: a finished house, land not yet built on, children, real money (cushion), or no house at all. */
  needs?: 'house' | 'bareLand' | 'kids' | 'rich' | 'homeless';
  /** What they (or, `byOther`, someone who knows them) post about it. */
  lines: string[];
  byOther?: boolean;
  /** Chance it gets posted at all. */
  post: number;
}

/** Chance an act that something wild happens to them (times their quirk's `wild`, and the state's craze). */
export const NPC_WILD_CHANCE = 0.05;

export const NPC_WILD: NpcWild[] = [
  { id: 'jackpot', icon: '🎰', weight: 2, traits: { gambler: 6 }, post: 0.9, lines: [
    'SPORTY DON PAY!!! 25 games, one ticket, {amount}!!! Who dey owe me, come collect 😭🙌🏾🎰',
    'I staked ₦500 for Man U to win. Man U won. {amount} landed. Jesus is Lord 🙏🏾⚽',
    'Ticket don cut 23 times before. Today na my day. {amount}. Nobody should call me. 🤫💰',
  ] },
  { id: 'betLoss', icon: '📉', weight: 2.5, traits: { gambler: 6 }, post: 0.7, lines: [
    'One game cut my ticket. ONE GAME. {amount} gone. Arsenal, I will never forgive you 💔',
    'I put my rent on Barcelona. Barcelona said no. Landlord is calling. Somebody help 😭',
    'Rest in peace to my {amount}. Sporty took it. I go still stake tomorrow sha 🤡',
  ] },
  { id: 'inheritance', icon: '📜', weight: 1, post: 0.8, lines: [
    'My late uncle in the village left me {amount}. Nobody even knew he had money. Uncle, rest well 🕊️',
    'Family meeting ended with me collecting {amount} from grandpa’s will. My cousins are not speaking to me 😂',
  ] },
  { id: 'kidnapped', icon: '🚨', weight: 1, byOther: true, post: 0.9, lines: [
    'They kidnapped {name} on the expressway last night. Family paid {amount} ransom. Thank God for life 🙏🏾',
    '{name} is back home after 2 days with kidnappers in the bush. {amount} ransom. This country ehn 💔',
  ] },
  { id: 'villagePeople', icon: '🧿', weight: 2, post: 0.8, lines: [
    'Village people are working overtime. Car broke down, phone fell in gutter, lost {amount} in one week 😩🧿',
    'Every time I try to rise, village people pull me down. {amount} gone like that. I reject it! 🔥',
    'My aunt visited from the village on Monday. By Friday I had lost {amount}. I’m not saying anything o 👀',
  ] },
  { id: 'sacked', icon: '📦', weight: 1.5, post: 0.6, lines: [
    'They sacked me today. No warning, no severance. From {job} to nothing. Who get work? 😔',
    'HR called me at 4:59pm on a Friday. Unemployed now. {city}, I’m open to opportunities 🙏🏾',
  ] },
  { id: 'promoted', icon: '📈', weight: 1.5, post: 0.6, lines: [
    'PROMOTED!!! I’m now a {job}. God when?? God NOW 🙌🏾🔥',
    'From nobody to {job}. Haters will say it’s photoshop 😎',
  ] },
  { id: 'pastorScam', icon: '⛪', weight: 1, traits: { pious: 5 }, post: 0.5, lines: [
    'Pastor said sow a seed of {amount} for my breakthrough. Two weeks now, breakthrough never land. Pastor don buy new jeep 🤔',
    'I gave {amount} as “prophetic offering”. Pastor said my miracle is loading. Loading since 2019 😩',
  ] },
  { id: 'owambe', icon: '🎉', weight: 2, traits: { party: 5, showoff: 2 }, post: 0.6, lines: [
    'Sprayed {amount} at my cousin’s wedding. Aso-ebi, gele, everything correct. Owambe na lifestyle 💃🏾💸',
    'Owambe was LIT. I don’t remember how I got home and {amount} is missing from my account 😂🎉',
  ] },
  { id: 'carFlex', icon: '🚘', weight: 1, traits: { showoff: 5 }, needs: 'rich', post: 0.8, lines: [
    'New whip just landed 🚘 {amount} for a Benz. Tokunbo, but clean. Haters, take a number 😎',
    'Bought a Lexus jeep for {amount}. My landlord saw it and increased my rent. Worth it 😂',
  ] },
  { id: 'married', icon: '💍', weight: 1.2, post: 0.9, lines: [
    'WE DID IT!!! Officially married 💍 Thank you {city} for the love. Owambe pictures loading 📸',
    'Finally said yes after 6 years of “we go do am next year”. Wedding bells! 💒',
  ] },
  { id: 'breakup', icon: '💔', weight: 1, post: 0.7, lines: [
    'Five years. FIVE YEARS. And she left me for a man with a Venza. I’m fine. I’m totally fine 💔',
    'Breakup cost me {amount}. Gifts, rent, data, everything. Love na scam 😤',
    'He collected {amount} for “business” and blocked me everywhere. Ladies, be warned 🚩',
  ] },
  { id: 'cryptoWin', icon: '🚀', weight: 1, traits: { gambler: 3 }, jobs: ['techbro', 'yahoo'], post: 0.8, lines: [
    'Bought a meme coin at 3am. Woke up {amount} richer. WAGMI 🚀🌕',
    'Told you crypto is the future. {amount} profit this week. Who laughed at me?? 📈',
  ] },
  { id: 'cryptoLoss', icon: '🪦', weight: 1.2, traits: { gambler: 3 }, jobs: ['techbro', 'yahoo'], post: 0.8, lines: [
    'The coin rugged. {amount} gone in 10 minutes. I’m just staring at the wall 🪦',
    '“Buy the dip” they said. The dip had a dip. {amount} down 📉😭',
  ] },
  { id: 'viral', icon: '📱', weight: 1, traits: { showoff: 3, gossip: 2 }, post: 0.9, lines: [
    'I DON BLOW!!! My video hit 2 million views. Brands are calling. {amount} in endorsements already 📱🔥',
    'Posted a skit about {city} traffic and woke up famous. {amount} from brand deals. Content creator now 😎',
  ] },
  { id: 'phoneSnatched', icon: '📵', weight: 2, post: 0.5, lines: [
    'Okada man just snatched my phone in traffic. {amount} phone. Still paying installment 😭',
    'Na so dem snatch my iPhone for bus stop. If you see a man with pink phone case in {city}, that’s mine 😤',
  ] },
  { id: 'visaLottery', icon: '🛂', weight: 0.6, traits: { dreamer: 4 }, post: 1, lines: [
    'I WON THE VISA LOTTERY!!! Out of millions of people. {to}, see you soon. Naija, bye bye 🛂✈️😭',
  ] },
  { id: 'prophecy', icon: '🔮', weight: 0.6, traits: { pious: 3, dreamer: 2 }, needs: 'homeless', post: 0.9, lines: [
    'Prophet told me my destiny is in {to}. I don pack my load. Moving tomorrow. Don’t try to stop me 🔮🧳',
  ] },
  { id: 'twins', icon: '👶🏾', weight: 0.8, needs: 'house', post: 0.9, lines: ['TWINS!!! Taiwo and Kehinde have arrived 👶🏾👶🏾 Double blessing, double school fees 😂'] },
  { id: 'landGrab', icon: '🏚️', weight: 0.8, needs: 'bareLand', post: 0.9, lines: [
    'Omo onile just took my land in {region}. Said the land was sold to three other people before me. {amount} gone 😭',
    'Went to check my plot in {region}. Someone has built a church on it. Land agent’s number is switched off 🤡',
  ] },
  { id: 'houseFire', icon: '🔥', weight: 0.6, needs: 'house', post: 0.8, lines: [
    'Fire gutted half my house in {region}. NEPA brought light back with too much voltage 🔥 We’re rebuilding.',
  ] },
  { id: 'wrongArrest', icon: '🚔', weight: 1, traits: { hothead: 2 }, post: 0.8, lines: [
    'Police arrested me because I was carrying a laptop. Paid {amount} “bail” at the station. I’m tired of this country 😤',
    'Got picked up at a checkpoint for “wandering”. Spent the night in a cell and paid {amount}. Na wa 😩',
  ] },
  { id: 'scholarship', icon: '🎓', weight: 0.8, needs: 'kids', post: 0.8, lines: ['My first child just won a full scholarship! The money we saved, {amount}, is going into business now 🎓🙌🏾'] },
  { id: 'sideHustle', icon: '💼', weight: 2, traits: { hustler: 4 }, post: 0.4, lines: [
    'Side hustle paid {amount} this week. 9-5 is for the bills, 5-9 is for the dreams 💼',
    'Sold chin-chin, tokunbo phones AND did a logistics run. {amount} profit. Hustle no dey sleep 😤',
  ] },
  { id: 'chiefTitle', icon: '👑', weight: 0.5, traits: { showoff: 4 }, needs: 'rich', post: 1, lines: [
    'They have given me a chieftaincy title! Call me Chief from today o 👑 Paid only {amount} for it, small thing.',
  ] },
];

/* ---------- Chaos: state crazes ---------- */

export type NpcCrazeId = 'crimeWave' | 'japaRush' | 'landRush' | 'cryptoCrash' | 'babyBoom' | 'fuelScarcity' | 'returneeWave' | 'crusade' | 'owambeSeason' | 'bettingFever';

export interface NpcCraze {
  icon: string;
  label: string;
  weight: number;
  /** How long it lasts, in hours. */
  hours: readonly [number, number];
  /** What it multiplies while it lasts. */
  crime?: number; japa?: number; buy?: number; spend?: number; baby?: number; arrive?: number; returnee?: number; good?: number; wild?: number;
  /** Mood each act, on top. */
  mood?: number;
  /** Who says it started. */
  lines: string[];
}

/** Chance a round that a state with no craze catches one. */
export const NPC_CRAZE_CHANCE = 0.08;

export const NPC_CRAZES: Record<NpcCrazeId, NpcCraze> = {
  crimeWave: { icon: '🚨', label: 'Crime wave', weight: 2, hours: [3, 8], crime: 3.5, mood: -2, lines: ['Third robbery on my street this week. {city} is not safe right now. Lock your doors o 🚨'] },
  japaRush: { icon: '🛫', label: 'Japa rush', weight: 1.5, hours: [3, 6], japa: 4, lines: ['Everybody in {city} is japaing at once. The embassy queue starts at 3am now. Am I the only one staying? 🛫'] },
  landRush: { icon: '📈', label: 'Land rush', weight: 1.5, hours: [3, 8], buy: 3, lines: ['Rumour says the new road is coming through {city}. Everybody is buying land like madness 📈🏗️'] },
  cryptoCrash: { icon: '📉', label: 'Crypto crash', weight: 1, hours: [2, 4], mood: -3, lines: ['Crypto has crashed and half the tech bros in {city} are crying in the group chat 📉😭'] },
  babyBoom: { icon: '🍼', label: 'Baby boom', weight: 1, hours: [6, 12], baby: 8, lines: ['Is it just me or is everybody in {city} pregnant right now? Naming ceremonies every weekend 🍼'] },
  fuelScarcity: { icon: '⛽', label: 'Fuel scarcity', weight: 2, hours: [3, 10], spend: 1.4, mood: -4, wild: 1.3, lines: ['No fuel anywhere in {city}. Queue at the filling station is 4 hours. Black market jerrycans at triple price ⛽😤'] },
  returneeWave: { icon: '✈️', label: 'Returnee wave', weight: 1, hours: [4, 8], arrive: 3, returnee: 5, lines: ['So many people coming back from abroad to {city} this week. Detty December came early ✈️🇳🇬'] },
  crusade: { icon: '⛪', label: 'Crusade', weight: 1, hours: [3, 6], crime: 0.4, good: 4, mood: 2, lines: ['Big crusade in {city} this week! Thieves are returning stolen phones at the altar 😂⛪'] },
  owambeSeason: { icon: '💃🏾', label: 'Owambe season', weight: 1.5, hours: [4, 10], spend: 1.5, wild: 1.6, mood: 2, lines: ['Three weddings this weekend in {city} and I have aso-ebi for all of them. My account is crying 💃🏾💸'] },
  bettingFever: { icon: '⚽', label: 'Betting fever', weight: 1.5, hours: [3, 6], wild: 2.5, lines: ['Champions League night and every okada man in {city} has a betting slip. Somebody will cry tomorrow ⚽🎰'] },
};
export const NPC_CRAZE_IDS = Object.keys(NPC_CRAZES) as NpcCrazeId[];
export const crazeOf = (id: string | null | undefined): NpcCraze | null => (id && id in NPC_CRAZES ? NPC_CRAZES[id as NpcCrazeId] : null);

/* ---------- Chaos: replies, beef and likes ---------- */

export const NPC_REPLIES = {
  /** Chance a tick that some NPC replies to something, and that the post is a player's own (they get a reply notification). */
  chance: 0.7,
  playerShare: 0.3,
  /** At most this many NPC replies under one post, and only to posts this recent. */
  perPost: 4,
  recentMs: 4 * 3_600_000,
  /** Likes NPCs leave each tick on recent posts. */
  likes: [2, 8] as const,
  /** When an NPC replies under another NPC's post, the chance the author fires back. */
  clapback: 0.5,
};

/** Replies, by what they answer. {name} is the author they answer. */
export const REPLY_LINES = {
  citizen: [
    'Abeg {name}, who asked? 🙄', 'This one pass me 😂😂', '{name} you too dey lie 🤥', 'Congratulations! God do am for me too 🙏🏾',
    'Na wa for you o {name} 😂', 'I tap from this blessing 🙌🏾', 'Hmmm. Something no too clear here 🤔', 'Werey 😂😂😂',
    'Same thing happened to me last week!', '{name} na your mate? Calm down 😂', 'Omo. Life no balance at all 😩', 'Make una leave {name} alone abeg',
  ],
  gov: [
    'Governor dey hear? 🙄', 'Na the same thing every year. Nothing will change 😴', 'Credit where it’s due 👏🏾', 'Who send them? 😂',
    'They are all the same. Rice and ₦5k every election 🍚', 'Make e better abeg 🙏🏾', 'VDM please come and see this 🎤', 'Our money, our future. Account for it!',
  ],
  disaster: ['Stay safe everybody 🙏🏾', 'God protect us 🙏🏾', 'Where is the government when we need them? 😤', 'My street is flooded too 😩'],
  player: [
    'Who send you? 😂', 'Facts 💯', 'This is the realest thing I’ve read today', 'Lmaooo 😂😂', 'Ratio + you dey whine 🤡',
    'Big man things 😎', 'Na lie 😂', 'You go explain tire', 'I support 🙌🏾', 'Abeg follow back 🙏🏾',
  ],
  clapback: ['Mind your business 🙄', 'Na you dey owe me money, abeg free me 😂', 'Who invited you to my mentions? 🙄', 'Your village people are calling you 📞', 'Chai. Envy is a disease 🤡'],
  vdm: ['VDM no dey carry last 😂🎤', 'Daddy Freeze where are you?? 😂', 'VDM for president!!! 🎤', 'He is always shouting but he is right this time 💯'],
};

/* ---------- Usernames ---------- */

const TITLES = /^(Mr|Mrs|Mallam|Alhaji|Hajiya|Pastor|Dr|Engr|Barrister|Madam|Chief|Corper) /;

/**
 * A username for an NPC citizen, the way a Naija person would pick one: "chidi_okafor", "realzainab", "tunde4real",
 * "bigmusa_kd"... Player rules (3 to 15 of a-z, 0-9, _). The server makes sure no player or NPC already has it.
 */
export function npcUsername(name: string, rand: () => number): string {
  const [first = 'naija', last = 'person'] = name.replace(TITLES, '').toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean);
  const n = () => String(Math.floor(rand() * 100)).padStart(2, '0');
  const styles = [
    () => `${first}_${last}`, () => `${first}${last}`, () => `${first}_${n()}`, () => `real${first}`, () => `iam${first}`,
    () => `${first}4real`, () => `the${first}`, () => `${first}_ng`, () => `big${first}`, () => `${first}x${last.slice(0, 3)}`,
    () => `${last}${n()}`, () => `${first}_official`, () => `${first}baby`, () => `${first}_${last.slice(0, 1)}${n()}`, () => `naija${first}`,
  ];
  const name_ = styles[Math.floor(rand() * styles.length)]().slice(0, 15);
  return name_.length >= 3 ? name_ : `${name_}_ng`;
}
