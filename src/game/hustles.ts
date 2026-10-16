// Money you make outside a job: the daily check-in, freelance gigs on the phone, a farm plot out of
// town, and referral bonuses. Rules only, shared by the game (ui/Hustles.tsx, net/hustle.ts) and the server
// (worker/hustles.ts), which decides every payout. Kept dependency-free so the worker can import it.

/* ---------- Days ---------- */

/** Days turn over at midnight in Lagos (UTC+1), the same for everyone. */
const LAGOS_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** The Lagos calendar day a moment falls on, as a number. */
export const dayNo = (ms: number) => Math.floor((ms + LAGOS_OFFSET_MS) / DAY_MS);
/** When a Lagos day begins and ends (ms). */
export const dayStart = (day: number) => day * DAY_MS - LAGOS_OFFSET_MS;
export const dayEnd = (day: number) => dayStart(day + 1);

/* ---------- Daily check-in ---------- */

/** What each day of an unbroken run of check-ins pays. Day 7 is "salary day"; then the week starts again. */
export const DAILY_REWARDS = [15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 100_000] as const;
/** The reward for the `streak`th check-in in a row (1-based). */
export const dailyReward = (streak: number) => DAILY_REWARDS[(Math.max(1, streak) - 1) % DAILY_REWARDS.length];
/** The run a check-in on `day` makes, given the last day checked in and the run then. */
export const nextStreak = (lastDay: number | null, streak: number, day: number) => (lastDay === day - 1 ? streak + 1 : 1);

/** A small, stable hash of a string. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Seeded random numbers in [0, 1): the same seed always gives the same run. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Freelance (phone) ---------- */

export type FreelanceKind = 'writing' | 'design' | 'code';

export interface FreelanceDef {
  id: FreelanceKind;
  icon: string;
  label: string;
  blurb: string;
  /** Knowledge (the Jobs app's 📚) needed to take it. */
  minKnowledge: number;
  /** Pay for a perfect job at knowledge 0. */
  base: number;
}

export const FREELANCE: Record<FreelanceKind, FreelanceDef> = {
  writing: { id: 'writing', icon: '✍️', label: 'Copywriting', blurb: 'Type out a client’s advert word for word. Accuracy pays.', minKnowledge: 0, base: 8_000 },
  design: { id: 'design', icon: '🎨', label: 'Logo colours', blurb: 'Match a brand’s three colours by eye.', minKnowledge: 2, base: 12_000 },
  code: { id: 'code', icon: '🐞', label: 'Bug fixing', blurb: 'Find the broken line in three bits of code.', minKnowledge: 4, base: 18_000 },
};
export const FREELANCE_KINDS = Object.keys(FREELANCE) as FreelanceKind[];

export const FREELANCE_RULES = {
  /** Gigs you can finish in one Lagos day. */
  perDay: 10,
  /** A gig not handed in by then is forfeit. */
  expireMs: 5 * 60_000,
  /** Each point of knowledge adds this share to the pay (knowledge 10: ×2.2). */
  perKnowledge: 0.12,
  /** Below this score the client pays nothing. */
  minScore: 0.34,
} as const;

/** What a perfect job of this kind pays you at this much knowledge. */
export const freelancePay = (kind: FreelanceKind, knowledge: number) =>
  Math.round((FREELANCE[kind].base * (1 + FREELANCE_RULES.perKnowledge * Math.max(0, Math.min(10, knowledge)))) / 100) * 100;

const WRITING_LINES = [
  'Mama Put jollof: smoky, sweet and only one thousand naira a plate.',
  'Fresh bread every morning at Iya Bisi bakery, soft like cotton wool.',
  'Need a keke to the market? Call Musa, he does not argue fare.',
  'Grand opening Saturday: free puff-puff for the first fifty customers.',
  'Sharp cuts for sharp people. Walk in at Kings Barbing Salon today.',
  'Your generator is shouting? Our solar panels keep quiet and save money.',
  'Learn to code in twelve weeks and start earning in dollars.',
  'Tailor Bayo sews agbada for every owambe, delivered before Friday.',
  'Cold zobo, kunu and chapman. Beat the Kaduna heat with one cup.',
  'Buy a plot in Kachia now before the price climbs like ginger.',
  'Fast data, no wahala: recharge any network at the POS stand.',
  'Wedding photos that make your aunties cry happy tears.',
  'Clean water delivered to your gate every morning by six.',
  'Suya so hot your grandfather will come back to ask for more.',
  'We fix cracked screens in thirty minutes while you drink your malt.',
  'The best pepper soup in Abuja, served hot until midnight.',
];

const HUES_NEEDED = 3;

export interface CodeSnippet {
  /** What the function is meant to do. */
  task: string;
  lines: string[];
  /** The broken line. */
  bug: number;
}

const CODE_SNIPPETS: CodeSnippet[] = [
  { task: 'Total price of a cart', lines: ['let total = 0;', 'for (const item of cart) {', '  total += item.price - item.qty;', '}', 'return total;'], bug: 2 },
  { task: 'Is the shop open?', lines: ['const hour = now.getHours();', 'const opens = 8;', 'const closes = 20;', 'return hour >= opens || hour < closes;'], bug: 3 },
  { task: 'Average exam score', lines: ['let sum = 0;', 'for (const s of scores) sum += s;', 'const avg = sum * scores.length;', 'return avg;'], bug: 2 },
  { task: 'Count the women in a list', lines: ['let n = 0;', 'for (const p of people) {', '  if (p.sex = "f") n++;', '}', 'return n;'], bug: 2 },
  { task: 'Last item of a list', lines: ['if (list.length === 0) return null;', 'const last = list[list.length];', 'return last;'], bug: 1 },
  { task: 'Add VAT (7.5%) to a price', lines: ['const vat = 0.075;', 'const tax = price * vat;', 'const total = price - tax;', 'return total;'], bug: 2 },
  { task: 'Biggest number in a list', lines: ['let best = -Infinity;', 'for (const n of nums) {', '  if (n < best) best = n;', '}', 'return best;'], bug: 2 },
  { task: 'Greet a customer by name', lines: ['const name = user.name.trim();', 'if (!name) return "Welcome!";', 'return "Welcome, " + user + "!";'], bug: 2 },
  { task: 'Naira to kobo', lines: ['const kobo = naira / 100;', 'return Math.round(kobo);'], bug: 0 },
  { task: 'Even numbers only', lines: ['const out = [];', 'for (const n of nums) {', '  if (n % 2 === 1) out.push(n);', '}', 'return out;'], bug: 2 },
  { task: 'Days in a week of shifts', lines: ['const days = ["Mon","Tue","Wed","Thu","Fri"];', 'for (let i = 0; i <= days.length; i++) {', '  book(days[i]);', '}'], bug: 1 },
  { task: 'Discount for big orders', lines: ['let price = qty * unit;', 'if (qty > 10) {', '  price = price * 1.1;', '}', 'return price;'], bug: 2 },
];

/** The job a freelance gig is, made from its seed: the same on the phone and on the server. */
export interface FreelanceBrief {
  kind: FreelanceKind;
  /** writing: the line to type. */
  text?: string;
  /** design: the brand's colours, as hues (0-359). */
  hues?: number[];
  /** code: the snippets (on the phone `bug` is -1: only the server's copy knows it, see publicBrief). */
  snippets?: CodeSnippet[];
}

export function freelanceBrief(kind: FreelanceKind, seed: number): FreelanceBrief {
  const rand = seeded(seed);
  if (kind === 'writing') return { kind, text: WRITING_LINES[Math.floor(rand() * WRITING_LINES.length)] };
  if (kind === 'design') return { kind, hues: Array.from({ length: HUES_NEEDED }, () => Math.floor(rand() * 360)) };
  const pool = [...CODE_SNIPPETS];
  const snippets: CodeSnippet[] = [];
  for (let i = 0; i < 3; i++) snippets.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return { kind, snippets };
}

/** The brief as the phone gets it: everything needed to do the job, nothing that gives the answer away (no bug lines, no seed). */
export const publicBrief = (b: FreelanceBrief): FreelanceBrief =>
  b.kind === 'code' ? { kind: b.kind, snippets: b.snippets!.map((s) => ({ task: s.task, lines: s.lines, bug: -1 })) } : b;

/** The least time (ms) a gig takes done honestly: the server refuses a hand-in sooner than this. */
export function freelanceMinMs(brief: FreelanceBrief) {
  // About 100 words a minute is fast typing; nobody types an advert in less.
  if (brief.kind === 'writing') return Math.max(8_000, (brief.text?.length ?? 0) * 110);
  if (brief.kind === 'design') return 8_000;
  return 10_000;
}

/** Edit distance between two strings. */
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** How far apart two hues are, round the colour wheel (0-180). */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
};

/** How well a hand-in does the job, 0 to 1. `answer` is the typed text, the three hues, or the three line numbers. */
export function freelanceScore(brief: FreelanceBrief, answer: unknown): number {
  if (brief.kind === 'writing') {
    if (typeof answer !== 'string' || !brief.text) return 0;
    const typed = answer.slice(0, brief.text.length * 2).trim();
    return Math.max(0, 1 - distance(typed, brief.text) / brief.text.length);
  }
  if (!Array.isArray(answer)) return 0;
  if (brief.kind === 'design') {
    const hues = brief.hues ?? [];
    if (answer.length !== hues.length) return 0;
    const each = hues.map((h, i) => (Number.isFinite(answer[i]) ? Math.max(0, 1 - hueGap(h, Number(answer[i])) / 45) : 0));
    return each.reduce((a, b) => a + b, 0) / hues.length;
  }
  const snippets = brief.snippets ?? [];
  if (answer.length !== snippets.length) return 0;
  return snippets.filter((s, i) => answer[i] === s.bug).length / snippets.length;
}

/** What a hand-in with this score earns on a gig worth `pay`. */
export const freelanceEarned = (pay: number, score: number) =>
  score < FREELANCE_RULES.minScore ? 0 : Math.round((pay * Math.min(1, score)) / 50) * 50;

/* ---------- Farm ---------- */

export type CropId = 'maize' | 'tomato' | 'yam' | 'ginger';

export interface CropDef {
  id: CropId;
  icon: string;
  label: string;
  /** Seeds, fertiliser and a hired hand, paid at planting. */
  seed: number;
  /** Real time from planting to harvest. */
  growMs: number;
  /** What the harvest sells for at the market on an ordinary day. */
  sell: number;
}

export const CROPS: Record<CropId, CropDef> = {
  maize: { id: 'maize', icon: '🌽', label: 'Maize', seed: 8_000, growMs: 20 * 60_000, sell: 12_000 },
  tomato: { id: 'tomato', icon: '🍅', label: 'Tomatoes', seed: 12_000, growMs: 45 * 60_000, sell: 20_000 },
  yam: { id: 'yam', icon: '🍠', label: 'Yam', seed: 20_000, growMs: 90 * 60_000, sell: 35_000 },
  ginger: { id: 'ginger', icon: '🫚', label: 'Kachia ginger', seed: 40_000, growMs: 180 * 60_000, sell: 70_000 },
};
export const CROP_IDS = Object.keys(CROPS) as CropId[];

export const FARM = {
  /** One-time lease for each plot, in order. */
  plots: [50_000, 150_000, 350_000] as const,
  /** A ripe crop left in the ground this long rots, and only fetches `rotShare` of its price. */
  rotMs: 24 * 3_600_000,
  rotShare: 0.3,
  /** Market prices move by up to this share either way, day to day. */
  swing: 0.15,
} as const;

/** Today's market price for a harvest of this crop. */
export function cropPrice(crop: CropId, day: number) {
  const r = seeded(hash(`${crop}:${day}`))();
  return Math.round((CROPS[crop].sell * (1 + (r * 2 - 1) * FARM.swing)) / 100) * 100;
}

/** What harvesting a crop planted at `plantedAt` pays at `now`: 0 while it is still growing. */
export function harvestValue(crop: CropId, plantedAt: number, now: number) {
  const ripe = plantedAt + CROPS[crop].growMs;
  if (now < ripe) return 0;
  const price = cropPrice(crop, dayNo(now));
  return now - ripe > FARM.rotMs ? Math.round((price * FARM.rotShare) / 100) * 100 : price;
}

/* ---------- Referrals ---------- */

export const REFERRAL = {
  /** Paid to the inviter once the friend has worked this many shifts. */
  shifts: 3,
  reward: 150_000,
  /** Paid to the friend who came through the link, at the same point. */
  welcome: 50_000,
  /** Most invite rewards paid to one player in a rolling week. */
  perWeek: 5,
} as const;
