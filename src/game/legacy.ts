// Long-term goals: lifetime stats, achievements, street reputation and the legacy score a life ends with.

import type { StoryFlag } from './stories';
import type { PoliticalOffice } from './civic';

export type StatKey =
  | 'trips' | 'fares' | 'tiles' | 'bribes' | 'argued' | 'escapes' | 'caught' | 'potholes'
  | 'owambes' | 'sprayed' | 'danceBest' | 'crashedOwambe' | 'durbarRides'
  | 'stories' | 'rareStories' | 'scams' | 'bets' | 'betsWon' | 'betWinnings'
  | 'fuelBought' | 'fuelStolen' | 'fuelSold' | 'protests' | 'posts' | 'campaigns' | 'votesBought' | 'roadProjects';

export type Stats = Partial<Record<StatKey, number>>;

/** What achievements and the legacy score can see. */
export interface LegacyInput {
  stats: Stats;
  flags: StoryFlag[];
  netWorth: number;
  goodDeeds: number;
  notoriety: number;
  knowledge: number;
  governmentOffice: PoliticalOffice | null;
  houses: number;
  cars: number;
  workDays: number;
  days: number;
  achievements: number;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  /** Rare ones are announced on Naija Gist. */
  rare?: boolean;
  check(s: LegacyInput): boolean;
}

const st = (s: LegacyInput, k: StatKey) => s.stats[k] ?? 0;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_fare', icon: '🛺', title: 'First passenger', desc: 'Drop off your first keke or okada passenger.', check: (s) => st(s, 'trips') >= 1 },
  { id: 'keke_king', icon: '👑', title: 'Keke King', desc: 'Complete 50 passenger trips.', rare: true, check: (s) => st(s, 'trips') >= 50 },
  { id: 'road_warrior', icon: '🛣️', title: 'Road warrior', desc: 'Drive 2,000 tiles around the city.', check: (s) => st(s, 'tiles') >= 2_000 },
  { id: 'something_for_boys', icon: '💵', title: 'Something for the boys', desc: 'Settle a police checkpoint.', check: (s) => st(s, 'bribes') >= 1 },
  { id: 'know_your_rights', icon: '⚖️', title: 'I know my rights', desc: 'Argue your way through 5 checkpoints.', check: (s) => st(s, 'argued') >= 5 },
  { id: 'fast_furious', icon: '💨', title: 'Fast & Furious: Naija Drift', desc: 'Speed off from 3 checkpoints and get away.', rare: true, check: (s) => st(s, 'escapes') >= 3 },
  { id: 'pothole_survivor', icon: '🕳️', title: 'Pothole survivor', desc: 'Hit 25 potholes. The roads are not your fault.', check: (s) => st(s, 'potholes') >= 25 },
  { id: 'owambe_regular', icon: '🎉', title: 'Owambe regular', desc: 'Attend 5 owambes.', check: (s) => st(s, 'owambes') >= 5 },
  { id: 'money_rain', icon: '💸', title: 'Money rain', desc: 'Spray ₦500,000 in total at owambes.', rare: true, check: (s) => st(s, 'sprayed') >= 500_000 },
  { id: 'dance_champ', icon: '🕺🏾', title: 'Dance floor champion', desc: 'Score 90+ on the owambe dance floor.', rare: true, check: (s) => st(s, 'danceBest') >= 90 },
  { id: 'gate_crasher', icon: '🚪', title: 'Gate crasher', desc: 'Get into 3 owambes uninvited.', check: (s) => st(s, 'crashedOwambe') >= 3 },
  { id: 'durbar_rider', icon: '🐎', title: 'Durbar horseman', desc: 'Ride in the Durbar parade.', rare: true, check: (s) => st(s, 'durbarRides') >= 1 },
  { id: 'storyteller', icon: '📖', title: 'Seen it all', desc: 'Live through 40 street stories.', check: (s) => st(s, 'stories') >= 40 },
  { id: 'one_in_hundred', icon: '🍀', title: 'One in a hundred', desc: 'Hit a rare street-story twist.', check: (s) => st(s, 'rareStories') >= 1 },
  { id: 'japa', icon: '🛂', title: 'Japa ready', desc: 'Win the visa lottery. (1 in 100!)', rare: true, check: (s) => s.flags.includes('visa') },
  { id: 'viral', icon: '🔥', title: 'Gone viral', desc: 'Become internet famous.', rare: true, check: (s) => s.flags.includes('viral') },
  { id: 'kannywood', icon: '🎬', title: 'Kannywood star', desc: 'Land a speaking role.', check: (s) => s.flags.includes('nollywood') },
  { id: 'mugu', icon: '🤡', title: 'Mugu', desc: 'Fall for a scam. It happens to the best of us.', check: (s) => s.flags.includes('scammed') },
  { id: 'yahoo', icon: '💻', title: 'Yahoo apprentice', desc: 'Send 5 scam messages.', check: (s) => st(s, 'scams') >= 5 },
  { id: 'punter', icon: '🎟️', title: 'Punter', desc: 'Win a bet on the cup final.', check: (s) => st(s, 'betsWon') >= 1 },
  { id: 'fuel_baron', icon: '⛽', title: 'Fuel baron', desc: 'Sell 10 jerrycans during scarcity.', rare: true, check: (s) => st(s, 'fuelSold') >= 10 },
  { id: 'black_market', icon: '🛢️', title: 'Black market', desc: 'Buy stolen fuel 5 times.', check: (s) => st(s, 'fuelStolen') >= 5 },
  { id: 'activist', icon: '✊🏾', title: 'Activist', desc: 'Join 3 protests.', check: (s) => st(s, 'protests') >= 3 },
  { id: 'gist_master', icon: '📣', title: 'Gist master', desc: 'Post 10 times on Naija Gist.', check: (s) => st(s, 'posts') >= 10 },
  { id: 'politician', icon: '🗳️', title: 'Politician', desc: 'Win an election.', rare: true, check: (s) => !!s.governmentOffice },
  { id: 'vote_buyer', icon: '🧧', title: 'Stomach infrastructure', desc: 'Buy votes and get away with it.', check: (s) => st(s, 'votesBought') >= 1 },
  { id: 'good_samaritan', icon: '😇', title: 'Good Samaritan', desc: '25 good deeds.', check: (s) => s.goodDeeds >= 25 },
  { id: 'saint', icon: '🕊️', title: 'Saint of the streets', desc: '100 good deeds.', rare: true, check: (s) => s.goodDeeds >= 100 },
  { id: 'notorious', icon: '🦹🏾', title: 'Notorious', desc: 'Reach 15 notoriety.', rare: true, check: (s) => s.notoriety >= 15 },
  { id: 'millionaire', icon: '💰', title: 'Millionaire', desc: 'Net worth of ₦1,000,000.', check: (s) => s.netWorth >= 1_000_000 },
  { id: 'billionaire', icon: '🏦', title: 'Dangote energy', desc: 'Net worth of ₦100,000,000.', rare: true, check: (s) => s.netWorth >= 100_000_000 },
  { id: 'landlord', icon: '🏘️', title: 'Landlord', desc: 'Finish building a house.', check: (s) => s.houses >= 1 },
  { id: 'scholar', icon: '🎓', title: 'Scholar', desc: 'Reach Knowledge 10.', check: (s) => s.knowledge >= 10 },
  { id: 'hard_worker', icon: '💼', title: 'Hard worker', desc: 'Work 30 full shifts.', check: (s) => s.workDays >= 30 },
  { id: 'survivor', icon: '📅', title: 'Survivor', desc: 'Live for 30 days.', check: (s) => s.days >= 30 },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/* ---------- Street reputation ---------- */

export interface RepTier {
  title: string;
  icon: string;
  min: number;
}

export const REP_TIERS: RepTier[] = [
  { title: 'Nobody', icon: '🫥', min: 0 },
  { title: 'Known face', icon: '👋🏾', min: 60 },
  { title: 'Respected', icon: '🤝🏾', min: 180 },
  { title: 'Chairman', icon: '🎩', min: 450 },
  { title: 'Oga at the Top', icon: '👑', min: 1_000 },
  { title: 'Living legend', icon: '🌟', min: 2_200 },
];

export function repScore(s: LegacyInput) {
  return Math.round(
    s.goodDeeds * 10 + s.achievements * 15 + st(s, 'owambes') * 6 + st(s, 'trips') * 2 + st(s, 'posts') * 2 +
      st(s, 'sprayed') / 5_000 + (s.governmentOffice ? 150 : 0) + s.houses * 40 + Math.min(200, s.days * 3),
  );
}

export const repTier = (score: number) => [...REP_TIERS].reverse().find((t) => score >= t.min)!;
export const nextRepTier = (score: number) => REP_TIERS.find((t) => t.min > score) ?? null;

/* ---------- Legacy ---------- */

export interface LegacyBreakdown {
  wealth: number;
  deeds: number;
  infamy: number;
  achievements: number;
  power: number;
  property: number;
  years: number;
  total: number;
  title: string;
  icon: string;
}

const GOOD_TITLES: [number, string, string][] = [
  [0, 'Forgotten soul', '🍂'],
  [1_500, 'Hustler', '🛺'],
  [4_000, 'Respected citizen', '🤝🏾'],
  [9_000, 'Pillar of the city', '🏛️'],
  [20_000, 'Naija royalty', '👑'],
  [40_000, 'Legend of Naija', '🌟'],
];
const BAD_TITLES: [number, string, string][] = [
  [0, 'Petty rogue', '🤏'],
  [4_000, 'Street menace', '😈'],
  [9_000, 'Kingpin', '🕴🏾'],
  [20_000, 'Untouchable godfather', '🦹🏾'],
];

export function legacyOf(s: LegacyInput): LegacyBreakdown {
  const wealth = Math.round(Math.sqrt(Math.max(0, s.netWorth)));
  const deeds = s.goodDeeds * 40;
  const infamy = s.notoriety * 30;
  const achievements = s.achievements * 150;
  const power = s.governmentOffice ? 1_500 : 0;
  const property = s.houses * 600;
  const years = Math.min(3_000, s.days * 15);
  const total = wealth + deeds + infamy + achievements + power + property + years;
  const notorious = s.notoriety >= 8 && infamy > deeds;
  const table = notorious ? BAD_TITLES : GOOD_TITLES;
  const [, title, icon] = [...table].reverse().find(([min]) => total >= min)!;
  return { wealth, deeds, infamy, achievements, power, property, years, total, title, icon };
}

/** A finished life, kept in your hall of fame across new lives. */
export interface LegacyRecord {
  name: string;
  origin: string;
  score: number;
  title: string;
  icon: string;
  days: number;
  at: number;
}
