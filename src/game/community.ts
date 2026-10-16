// Friends, daily/weekly quests and seasons. Rules only; the server (worker/community.ts) decides.
// Quest progress is derived from tables the server already writes (ledger, feed, messages, bets), so it
// cannot be faked from the client.

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
/** A season lasts two real weeks; points reset and the top players are paid. */
export const SEASON_MS = 14 * DAY_MS;

export const dayKey = (now: number) => Math.floor(now / DAY_MS);
export const weekKey = (now: number) => Math.floor(now / WEEK_MS);
export const seasonKey = (now: number) => Math.floor(now / SEASON_MS);
export const seasonEnds = (now: number) => (seasonKey(now) + 1) * SEASON_MS;

export type QuestMetric = 'earn' | 'post' | 'message' | 'pay' | 'bet' | 'friend' | 'spend' | 'invest'
  // Side hustles (game/hustles.ts, game/gigs.ts), counted from the ledger.
  | 'shift' | 'rides' | 'dispatch' | 'freelance' | 'farm' | 'odd_job';

export interface QuestDef {
  id: string;
  metric: QuestMetric;
  label: string;
  icon: string;
  target: number;
  /** Naira paid on claim. */
  reward: number;
  /** Season points added on claim. */
  points: number;
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 'd-earn-a', metric: 'earn', label: 'Earn ₦60,000 from work or hustle', icon: '💼', target: 60_000, reward: 12_000, points: 10 },
  { id: 'd-earn-b', metric: 'earn', label: 'Earn ₦250,000 from work or hustle', icon: '💰', target: 250_000, reward: 35_000, points: 20 },
  { id: 'd-post', metric: 'post', label: 'Post 2 tweets on Twitter', icon: '🐦', target: 2, reward: 5_000, points: 8 },
  { id: 'd-msg', metric: 'message', label: 'Send 5 messages to your people', icon: '✉️', target: 5, reward: 5_000, points: 8 },
  { id: 'd-pay', metric: 'pay', label: 'Send money to another player', icon: '💸', target: 1, reward: 6_000, points: 10 },
  { id: 'd-bet', metric: 'bet', label: 'Place a bet on the cup final', icon: '⚽', target: 1, reward: 6_000, points: 10 },
  { id: 'd-friend', metric: 'friend', label: 'Make a new friend', icon: '🤝', target: 1, reward: 10_000, points: 15 },
  { id: 'd-spend', metric: 'spend', label: 'Spend ₦50,000 in the city', icon: '🛍️', target: 50_000, reward: 7_000, points: 8 },
  { id: 'd-invest', metric: 'invest', label: 'Make an investment', icon: '📈', target: 1, reward: 9_000, points: 12 },
  { id: 'd-shift', metric: 'shift', label: 'Work 2 shifts at your job', icon: '🧑🏾‍🔧', target: 2, reward: 20_000, points: 12 },
  { id: 'd-rides', metric: 'rides', label: 'Carry 5 keke or okada passengers', icon: '🛺', target: 5, reward: 20_000, points: 12 },
  { id: 'd-dispatch', metric: 'dispatch', label: 'Deliver 3 dispatch orders', icon: '📦', target: 3, reward: 25_000, points: 14 },
  { id: 'd-freelance', metric: 'freelance', label: 'Finish 2 freelance gigs', icon: '💻', target: 2, reward: 20_000, points: 12 },
  { id: 'd-farm', metric: 'farm', label: 'Harvest a crop on your farm', icon: '🌽', target: 1, reward: 15_000, points: 10 },
  { id: 'd-odd', metric: 'odd_job', label: 'Do 2 odd jobs around town', icon: '🧺', target: 2, reward: 12_000, points: 8 },
];

export const WEEKLY_QUESTS: QuestDef[] = [
  { id: 'w-earn', metric: 'earn', label: 'Earn ₦2,000,000 this week', icon: '🏗️', target: 2_000_000, reward: 200_000, points: 80 },
  { id: 'w-dispatch', metric: 'dispatch', label: 'Deliver 25 dispatch orders this week', icon: '🛵', target: 25, reward: 120_000, points: 60 },
  { id: 'w-farm', metric: 'farm', label: 'Bring in 10 harvests this week', icon: '🚜', target: 10, reward: 100_000, points: 60 },
  { id: 'w-post', metric: 'post', label: 'Post 15 tweets this week', icon: '📣', target: 15, reward: 60_000, points: 50 },
  { id: 'w-friend', metric: 'friend', label: 'Make 3 new friends', icon: '👯', target: 3, reward: 90_000, points: 70 },
  { id: 'w-spend', metric: 'spend', label: 'Spend ₦400,000 this week', icon: '🧾', target: 400_000, reward: 70_000, points: 50 },
  { id: 'w-pay', metric: 'pay', label: 'Send 5 payments to other players', icon: '🎁', target: 5, reward: 80_000, points: 60 },
];

export const DAILY_COUNT = 4;
export const WEEKLY_COUNT = 3;

/** Small deterministic hash so every player sees the same daily picks. */
function hash(n: number) {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

function pick<T extends { metric: string }>(pool: T[], key: number, count: number): T[] {
  const left = [...pool];
  const out: T[] = [];
  const metrics = new Set<string>();
  let seed = hash(key + 1);
  while (out.length < count && left.length) {
    seed = hash(seed + 7);
    const i = seed % left.length;
    const q = left.splice(i, 1)[0];
    // One quest per metric so two "earn" goals never sit side by side.
    if (metrics.has(q.metric)) continue;
    metrics.add(q.metric);
    out.push(q);
  }
  return out;
}

export const dailyQuests = (now: number) => pick(DAILY_QUESTS, dayKey(now), DAILY_COUNT);
export const weeklyQuests = (now: number) => pick(WEEKLY_QUESTS, weekKey(now) + 100_000, WEEKLY_COUNT);

export const QUEST_BY_ID = new Map([...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => [q.id, q]));

/** Season prizes for the top finishers (rank is 1-based). */
export const SEASON_PRIZES: { rank: number; prize: number; title: string }[] = [
  { rank: 1, prize: 2_000_000, title: 'Season Champion' },
  { rank: 2, prize: 1_000_000, title: 'Runner-up' },
  { rank: 3, prize: 500_000, title: 'Third place' },
  { rank: 4, prize: 200_000, title: 'Top 10' },
  { rank: 5, prize: 200_000, title: 'Top 10' },
  { rank: 6, prize: 200_000, title: 'Top 10' },
  { rank: 7, prize: 200_000, title: 'Top 10' },
  { rank: 8, prize: 200_000, title: 'Top 10' },
  { rank: 9, prize: 200_000, title: 'Top 10' },
  { rank: 10, prize: 200_000, title: 'Top 10' },
];

export const FRIENDS = {
  maxFriends: 100,
} as const;
