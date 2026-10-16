// Adoption and raising children (Phone → Adopt, worker/kids.ts). Shared by the game and the server, so the bars
// the player watches move by exactly the rule the server judges them by.
//
// A child's needs are never ticked: the server keeps one snapshot (the five numbers at `at`) and works out the rest
// from the clock with simulate(), on every read and in the five-minute cron that sends the "she's hungry" pushes.
// Growth is real time too: a child ages KID_YEAR_MS (one real day by default) per year of their life.

import { encodeLook, type Appearance, type HairStyle } from './wardrobe';
import type { ActionDef } from './catalog';

export type KidSex = 'm' | 'f';
export type KidStage = 'newborn' | 'baby' | 'toddler' | 'child' | 'teen';
export type KidNeed = 'hunger' | 'sleep' | 'hygiene' | 'play';
export type KidStatus = 'pending' | 'home' | 'taken' | 'rehomed' | 'grown' | 'legacy';

export const KID_NEEDS: { key: KidNeed; label: string; icon: string }[] = [
  { key: 'hunger', label: 'Food', icon: '🍼' },
  { key: 'sleep', label: 'Sleep', icon: '😴' },
  { key: 'hygiene', label: 'Clean', icon: '🫧' },
  { key: 'play', label: 'Play', icon: '🧸' },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** One year of a child's life, in real time. Tune here: everything about growing up follows it. */
export const KID_YEAR_MS = DAY;

/** Ages (in years) each stage starts at. A child is grown up and moves out at `grown`. */
export const STAGE_AGES: { stage: KidStage; from: number; label: string; scale: number; head: number }[] = [
  { stage: 'newborn', from: 0, label: 'Newborn', scale: 0.3, head: 1.7 },
  { stage: 'baby', from: 0.25, label: 'Baby', scale: 0.38, head: 1.6 },
  { stage: 'toddler', from: 1.25, label: 'Toddler', scale: 0.5, head: 1.42 },
  { stage: 'child', from: 4, label: 'Child', scale: 0.68, head: 1.22 },
  { stage: 'teen', from: 13, label: 'Teen', scale: 0.9, head: 1.06 },
];
export const GROWN_AGE = 18;

export const KIDS = {
  /** Children a player can have at once (waiting on paperwork, at home or with Social Welfare). */
  max: 3,
  /** Paid to the state's Social Welfare (the treasury of the state you live in) when you apply. */
  fee: 350_000,
  /** The home check: this much left in your wallet after the fee. */
  savings: 200_000,
  /** The home check: no arrest this recently. */
  arrestFreeMs: 3 * DAY,
  /** Paperwork, real time, between paying and bringing the child home. */
  paperworkMs: 10 * 60_000,
  /** A need under this is an alert (HUD chip, toast, push). */
  alertAt: 30,
  /** Health under this: a Social Welfare officer calls and writes a warning. */
  warnAt: 35,
  /** Health under this and the child is sick until a clinic visit. */
  sickAt: 50,
  /** A warned dip is over once health is back to this. */
  rearmAt: 60,
  /** This many warnings (one forgiven every `strikeForgiveMs`) and Social Welfare takes the child. Health at 0 does too. */
  strikesToTake: 3,
  strikeForgiveMs: 4 * DAY,
  /** After being taken, this long to get the child back by paying the fine. Then they are placed with another family. */
  reclaimMs: 3 * DAY,
  reclaimFine: 150_000,
  /** A nanny, per real day, looks after every child in the house: no need falls under `nannyFloor`. */
  nannyPerDay: 25_000,
  nannyFloor: 70,
  nannyMaxDays: 7,
  /** School fees per term (school-age children): play falls half as fast while in school. */
  schoolFee: 60_000,
  schoolTermMs: 7 * DAY,
  schoolAge: 5,
  /** Pushes: at most one per child this often, unless it is urgent (sick, a warning, taken). */
  pushGapMs: 2 * HOUR,
  urgentGapMs: 30 * 60_000,
  /** A need above this can't be topped up (no paying for a bottle nobody wants). */
  fullAt: 95,
  /** Using the right furniture (cot, high chair, baby bath, play mat, toy box) does this much more. */
  furnitureBonus: 1.25,
  /** Waiting children listed per player per day. */
  offers: 5,
};

/** Need loss per real hour, awake, by stage. Asleep, hunger and hygiene fall at half this and play not at all. */
export const KID_DECAY: Record<KidStage, Record<KidNeed, number>> = {
  newborn: { hunger: 7, sleep: 6, hygiene: 6, play: 3 },
  baby: { hunger: 7, sleep: 5, hygiene: 6, play: 4 },
  toddler: { hunger: 6, sleep: 5, hygiene: 5, play: 5 },
  child: { hunger: 5, sleep: 4, hygiene: 4, play: 5 },
  teen: { hunger: 5, sleep: 4, hygiene: 3, play: 4 },
};
/** Sleep restored per real hour while asleep. */
export const SLEEP_GAIN = 30;
/** Health lost per real hour for each need sitting at zero; regained per hour when every need is at least alertAt. */
export const HEALTH_LOSS = 1;
export const HEALTH_GAIN = 2;
/** A sick child left without a doctor gets a little worse every hour, however well fed. */
export const SICK_LOSS = 0.5;

export type CareId = 'feed' | 'change' | 'bathe' | 'play' | 'sleep' | 'clinic';

export interface CareDef {
  id: CareId;
  label: string;
  icon: string;
  /** What it fills, and by how much (before the furniture bonus). */
  need?: KidNeed;
  gain: number;
  cost: (stage: KidStage) => number;
  stages: KidStage[];
  /** Furniture that does it better (and where the player walks to do it). */
  items: string[];
  /** Goes to the state treasury (the clinic) rather than to a shop. */
  state?: boolean;
}

const ALL: KidStage[] = ['newborn', 'baby', 'toddler', 'child', 'teen'];
export const CARE: Record<CareId, CareDef> = {
  feed: { id: 'feed', label: 'Feed', icon: '🍼', need: 'hunger', gain: 55, cost: (s) => (s === 'newborn' || s === 'baby' ? 3_000 : 4_000), stages: ALL, items: ['high_chair'] },
  change: { id: 'change', label: 'Change nappy', icon: '🧷', need: 'hygiene', gain: 45, cost: () => 1_500, stages: ['newborn', 'baby', 'toddler'], items: ['baby_bath'] },
  bathe: { id: 'bathe', label: 'Bath', icon: '🛁', need: 'hygiene', gain: 65, cost: () => 1_000, stages: ALL, items: ['baby_bath'] },
  play: { id: 'play', label: 'Play', icon: '🧸', need: 'play', gain: 50, cost: () => 0, stages: ALL, items: ['play_mat', 'toy_box'] },
  sleep: { id: 'sleep', label: 'Put to bed', icon: '😴', need: 'sleep', gain: 0, cost: () => 0, stages: ALL, items: ['baby_cot'] },
  clinic: { id: 'clinic', label: 'Clinic', icon: '🏥', gain: 0, cost: () => 40_000, stages: ALL, items: [], state: true },
};
export const CARE_IDS = Object.keys(CARE) as CareId[];

/** What the care is called for a child this age ("Bottle" for a baby, "Meal" for a teen). */
export function careLabel(id: CareId, stage: KidStage): string {
  if (id === 'feed') return stage === 'newborn' || stage === 'baby' ? 'Bottle' : 'Meal';
  if (id === 'bathe' && (stage === 'child' || stage === 'teen')) return 'Bath time';
  if (id === 'play') return stage === 'teen' ? 'Hang out' : stage === 'child' ? 'Play ball' : 'Play';
  return CARE[id].label;
}

/** The game task for each care (src/game/store.ts runs them like any other activity). Free in the game: the server charges. */
export const KID_ACTIONS: (ActionDef & { care: CareId })[] = [
  { id: 'kid_feed', care: 'feed', label: 'Feed the little one', icon: '🍼', minutes: 25, effect: 'kidCare', animation: 'perform', perHour: { social: 6 } },
  { id: 'kid_change', care: 'change', label: 'Change the nappy', icon: '🧷', minutes: 10, effect: 'kidCare', animation: 'clean' },
  { id: 'kid_bathe', care: 'bathe', label: 'Bath time', icon: '🛁', minutes: 25, effect: 'kidCare', animation: 'wash', perHour: { fun: 6 } },
  { id: 'kid_play', care: 'play', label: 'Play with the kids', icon: '🧸', minutes: 40, effect: 'kidCare', animation: 'dance', perHour: { fun: 22, social: 14 } },
  { id: 'kid_sleep', care: 'sleep', label: 'Put to bed', icon: '😴', minutes: 15, effect: 'kidCare', animation: 'talk' },
  { id: 'kid_clinic', care: 'clinic', label: 'Clinic visit', icon: '🏥', minutes: 90, effect: 'kidCare', animation: 'talk', perHour: { energy: -4 } },
];
export const KID_ACTION_BY_CARE = Object.fromEntries(KID_ACTIONS.map((a) => [a.care, a])) as Record<CareId, (typeof KID_ACTIONS)[number]>;
export const careOfAction = (actionId: string): CareId | null => KID_ACTIONS.find((a) => a.id === actionId)?.care ?? null;

/** House designs (src/game/property.ts) and how many children each has room for. */
export const KID_ROOM: Record<string, number> = { selfcon: 1, bungalow: 2, duplex: 3, flats: 3, mansion: 3 };

/* ---------- Age ---------- */

export const ageYears = (bornAt: number, at: number) => Math.max(0, (at - bornAt) / KID_YEAR_MS);
export function stageAt(years: number): KidStage {
  let s: KidStage = 'newborn';
  for (const def of STAGE_AGES) if (years >= def.from) s = def.stage;
  return s;
}
export const stageOf = (bornAt: number, at: number) => stageAt(ageYears(bornAt, at));
export const stageDef = (stage: KidStage) => STAGE_AGES.find((d) => d.stage === stage)!;

/** "3 months", "2 years". */
export function ageLabel(years: number): string {
  if (years < 1) {
    const months = Math.max(0, Math.floor(years * 12));
    return months < 1 ? `${Math.max(1, Math.floor(years * 52))} wk` : `${months} month${months === 1 ? '' : 's'}`;
  }
  const y = Math.floor(years);
  return `${y} year${y === 1 ? '' : 's'}`;
}

/** Real time until the next stage (or until they grow up), from `at`. */
export function nextStageIn(bornAt: number, at: number): { stage: KidStage | 'grown'; ms: number } {
  const years = ageYears(bornAt, at);
  const next = STAGE_AGES.find((d) => d.from > years);
  const to = next ? next.from : GROWN_AGE;
  return { stage: next?.stage ?? 'grown', ms: Math.max(0, (to - years) * KID_YEAR_MS) };
}

/* ---------- Needs over time ---------- */

export interface KidSnap {
  hunger: number;
  sleep: number;
  hygiene: number;
  play: number;
  health: number;
  sick: boolean;
  /** Real ms this snapshot is for. */
  at: number;
}

export interface KidClock {
  bornAt: number;
  asleepUntil: number;
  schoolUntil: number;
  nannyUntil: number;
}

const STEP = 10 * 60_000;
/** Longer than anyone stays away: past this a child is simply as neglected as they get. */
const MAX_SIM = 30 * DAY;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** The snapshot moved on to `to` by the rules above, in ten-minute steps. */
export function simulate(snap: KidSnap, clock: KidClock, to: number): KidSnap {
  const s = { ...snap };
  if (to <= s.at) return s;
  let t = Math.max(s.at, to - MAX_SIM);
  while (t < to) {
    const dt = Math.min(STEP, to - t);
    const h = dt / HOUR;
    const mid = t + dt / 2;
    const r = KID_DECAY[stageOf(clock.bornAt, mid)];
    if (mid < clock.asleepUntil) {
      s.sleep += SLEEP_GAIN * h;
      s.hunger -= r.hunger * 0.5 * h;
      s.hygiene -= r.hygiene * 0.5 * h;
    } else {
      s.sleep -= r.sleep * h;
      s.hunger -= r.hunger * h;
      s.hygiene -= r.hygiene * h;
      s.play -= r.play * (mid < clock.schoolUntil ? 0.5 : 1) * h;
    }
    s.hunger = clamp(s.hunger);
    s.sleep = clamp(s.sleep);
    s.hygiene = clamp(s.hygiene);
    s.play = clamp(s.play);
    const nanny = mid < clock.nannyUntil;
    if (nanny) {
      // The nanny feeds, changes, settles and plays with them: nothing drops far.
      for (const k of ['hunger', 'sleep', 'hygiene', 'play'] as const) s[k] = Math.max(s[k], KIDS.nannyFloor);
    }
    const zeros = (s.hunger <= 0 ? 1 : 0) + (s.sleep <= 0 ? 1 : 0) + (s.hygiene <= 0 ? 1 : 0) + (s.play <= 0 ? 1 : 0);
    if (zeros) s.health -= HEALTH_LOSS * zeros * h;
    // A nanny keeps a sick child steady (she knows to call the doctor), but only the clinic cures them.
    else if (s.sick) s.health -= nanny ? 0 : SICK_LOSS * h;
    else if (Math.min(s.hunger, s.sleep, s.hygiene, s.play) >= KIDS.alertAt) s.health += HEALTH_GAIN * h;
    s.health = clamp(s.health);
    if (s.health < KIDS.sickAt) s.sick = true;
    t += dt;
  }
  s.at = to;
  return s;
}

/** Needs that are low enough to say so. */
export const alertsOf = (s: KidSnap): KidNeed[] => KID_NEEDS.map((n) => n.key).filter((k) => s[k] < KIDS.alertAt);

export type Mood = 'happy' | 'okay' | 'sad' | 'sick';
export function moodOfKid(s: KidSnap): Mood {
  if (s.sick) return 'sick';
  const low = Math.min(s.hunger, s.sleep, s.hygiene, s.play);
  return low < 25 ? 'sad' : low >= 60 && s.health >= 80 ? 'happy' : 'okay';
}
export const MOOD_FACE: Record<Mood, string> = { happy: '😄', okay: '🙂', sad: '😢', sick: '🤒' };

/** The worst thing about a child right now, for a chip, a toast or a push. Null when all is well. */
export function kidAlert(name: string, sex: KidSex, stage: KidStage, s: KidSnap): { key: string; title: string; body: string; urgent: boolean; care: CareId } | null {
  const she = sex === 'f' ? 'she' : 'he';
  const her = sex === 'f' ? 'her' : 'him';
  if (s.sick) return { key: 'sick', title: `🤒 ${name} is sick`, body: `Take ${her} to the clinic before Social Welfare hears about it.`, urgent: true, care: 'clinic' };
  const low = alertsOf(s).sort((a, b) => s[a] - s[b])[0];
  if (!low) return null;
  const urgent = s[low] <= 5;
  if (low === 'hunger') return { key: low, title: `👶🏾 ${name} is hungry`, body: stage === 'newborn' || stage === 'baby' ? `Crying for a bottle. Come and feed ${her}.` : `${cap(she)} wants food. Come and feed ${her}.`, urgent, care: 'feed' };
  if (low === 'hygiene') {
    const nappy = stage === 'newborn' || stage === 'baby' || stage === 'toddler';
    return { key: low, title: nappy ? `👶🏾 ${name} needs a nappy change` : `👶🏾 ${name} needs a bath`, body: nappy ? 'That nappy is full. Change it.' : `${cap(she)} is smelling. Bath time.`, urgent, care: nappy ? 'change' : 'bathe' };
  }
  if (low === 'sleep') return { key: low, title: `👶🏾 ${name} can't sleep`, body: `${cap(she)} is tired and cranky. Put ${her} to bed.`, urgent, care: 'sleep' };
  return { key: low, title: `👶🏾 ${name} is bored`, body: `${cap(she)} wants you to play with ${her}.`, urgent, care: 'play' };
}
const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);

/* ---------- Milestones ---------- */

export interface MilestoneDef { id: string; at: number; icon: string; text: (name: string, sex: KidSex) => string }

/** Reached by age (years). Birthdays are added for every whole year. */
const MILESTONES: MilestoneDef[] = [
  { id: 'smile', at: 0.15, icon: '😊', text: (n) => `${n} gave the first real smile!` },
  { id: 'word', at: 1, icon: '🗣️', text: (n) => `${n} said a first word: "Mama"! (Or was it "Dada"? Wahala.)` },
  { id: 'steps', at: 1.3, icon: '👣', text: (n) => `${n} took the first steps! Hide everything breakable.` },
  { id: 'school', at: KIDS.schoolAge, icon: '🎒', text: (n) => `${n} is starting school! Uniform ironed, lunch box packed.` },
  { id: 'teen', at: 13, icon: '🎧', text: (n, sex) => `${n} is a teenager now. ${sex === 'f' ? 'She' : 'He'} wants a phone. Of course.` },
];

export function milestonesBetween(bornAt: number, from: number, to: number): { id: string; icon: string; at: number; text: (name: string, sex: KidSex) => string }[] {
  const a = ageYears(bornAt, from);
  const b = ageYears(bornAt, to);
  if (b <= a) return [];
  const out = MILESTONES.filter((m) => m.at > a && m.at <= b).map((m) => ({ id: m.id, icon: m.icon, at: bornAt + m.at * KID_YEAR_MS, text: m.text }));
  for (let y = Math.floor(a) + 1; y <= Math.floor(b) && y < GROWN_AGE; y++) {
    out.push({ id: `bday${y}`, icon: '🎂', at: bornAt + y * KID_YEAR_MS, text: (n) => `${n} turns ${y} today! 🎉 Small chops and jollof for everyone.` });
  }
  return out.sort((x, y) => x.at - y.at);
}

/** Display text for a stored milestone id. */
export function milestoneText(id: string, name: string, sex: KidSex): { icon: string; text: string } {
  const m = MILESTONES.find((d) => d.id === id);
  if (m) return { icon: m.icon, text: m.text(name, sex) };
  const y = /^bday(\d+)$/.exec(id);
  if (y) return { icon: '🎂', text: `${name} turned ${y[1]}! 🎉` };
  if (id === 'home') return { icon: '🏠', text: `${name} came home!` };
  return { icon: '⭐', text: `${name} did something new.` };
}

/** A milestone is a little joy: this much fun and social for the parent (applied once, when they see it). */
export const MILESTONE_JOY = { fun: 20, social: 12 };

/* ---------- Children waiting ---------- */

export interface KidOffer {
  key: string;
  name: string;
  sex: KidSex;
  /** Age in years when they come home. */
  age: number;
  look: string;
  story: string;
  home: string;
}

const NAMES: Record<KidSex, string[]> = {
  f: ['Amina', 'Zainab', 'Hauwa', 'Aisha', 'Fatima', 'Maryam', 'Funmilayo', 'Tolulope', 'Kemi', 'Bisola', 'Adaeze', 'Chioma', 'Ngozi', 'Nkechi', 'Blessing', 'Favour', 'Precious', 'Esther', 'Halima', 'Simi'],
  m: ['Musa', 'Ibrahim', 'Abubakar', 'Yusuf', 'Sani', 'Tunde', 'Femi', 'Dayo', 'Ayomide', 'Chidi', 'Emeka', 'Obinna', 'Ifeanyi', 'Kelechi', 'David', 'Daniel', 'Gift', 'Miracle', 'Aliyu', 'Segun'],
};

const STORIES = [
  'Left at the gate of the general hospital in a clean ankara wrapper, with a note that just said "Please love her/him".',
  'Mama passed in childbirth. Aunty tried, but six mouths was already too many.',
  'Found sleeping in a keke at the motor park. The driver brought %s straight to the police station.',
  'Loves jollof, hates bath time, and laughs at every goat %s sees.',
  'Shy at first, then will not stop talking. The matron calls %s "small professor".',
  'Survived the flood that took the family house. Sleeps holding one rubber slipper.',
  'Was born early and tiny, now the strongest grip in the nursery.',
  'Sings along to every Davido song on the matron\'s radio. Off key. With confidence.',
  'Parents could not be traced after the market fire. The whole ward has adopted %s already, they just need a real home.',
  'Gives everybody a hug. Even the gateman. Especially the gateman.',
];

/** The children's homes, by the state the player lives in (src/game/civic.ts cities). */
export const ORPHANAGES: Record<string, string[]> = {
  kaduna: ['Hope for Tomorrow Children\'s Home, Barnawa', 'Kaduna Social Welfare Orphanage, Kawo', 'Arms of Mercy Home, Ungwan Rimi'],
  abuja: ['SOS Children\'s Village, Gwagwalada', 'FCT Child Welfare Home, Karu', 'Little Lights Orphanage, Kubwa'],
  lagos: ['Arms of Love Orphanage, Ikeja', 'Heritage Homes Children\'s Village, Surulere', 'Hearts of Gold Home, Yaba'],
  kano: ['Dala Children\'s Home, Kano', 'Nassarawa Child Care Home', 'Kofar Mata Orphanage, Kano'],
};

/** A cheap, repeatable pseudo-random stream. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];

const KID_HAIR: Record<KidSex, HairStyle[]> = { f: ['puffs', 'cornrows', 'braids', 'afro', 'curls'], m: ['low', 'fade', 'afro', 'curls', 'low'] };
const KID_TOPS = ['tee_white', 'tee_green', 'tee_stripe', 'jersey_kdu', 'polo_navy', 'tee_tiedye'];
const KID_BOTTOMS = ['shorts_khaki', 'shorts_denim', 'shorts_ankara', 'jeans_blue'];

/** What a child wears in the house: always the same for the same child, and a little dressier for a girl. */
export function kidLook(seed: string, sex: KidSex): string {
  const r = rng(`look:${seed}`);
  const a: Appearance = {
    body: sex,
    skin: 2 + Math.floor(r() * 4),
    hair: pick(r, KID_HAIR[sex]),
    hairColor: r() < 0.85 ? 0 : 1,
    outfit: sex === 'f' && r() < 0.5
      ? { top: pick(r, ['ankara_dress', 'dress_polka', 'dress_ankara_blue']), shoes: 'sneakers_white' }
      : { top: pick(r, KID_TOPS), bottom: pick(r, KID_BOTTOMS), shoes: r() < 0.5 ? 'sneakers_white' : 'slippers_black' },
  };
  return encodeLook(a);
}

/** Today's waiting children for one player (the same list all day, on the game and the server alike). */
export function offersFor(uid: string, city: string, at: number): KidOffer[] {
  const day = Math.floor(at / DAY);
  const homes = ORPHANAGES[city] ?? ORPHANAGES.kaduna;
  // Mostly babies: the age agencies place most often.
  const ages = [0.02, 0.1, 0.4, 0.9, 2.5, 6];
  const r = rng(`offers:${uid}:${day}`);
  const used = new Set<string>();
  return Array.from({ length: KIDS.offers }, (_, i) => {
    const sex: KidSex = r() < 0.5 ? 'f' : 'm';
    let name = pick(r, NAMES[sex]);
    while (used.has(name)) name = pick(r, NAMES[sex]);
    used.add(name);
    const age = Math.round(ages[Math.floor(r() * ages.length)] * (0.8 + r() * 0.4) * 100) / 100;
    const pronoun = sex === 'f' ? 'her' : 'him';
    const story = pick(r, STORIES).replace('her/him', pronoun).replace(/%s/g, sex === 'f' ? 'her' : 'him');
    const key = `${day}:${i}`;
    return { key, name, sex, age, look: kidLook(`${uid}:${key}`, sex), story, home: pick(r, homes) };
  });
}

/** A name the player gives: letters, spaces, hyphens and apostrophes, 2 to 16 of them. */
export function cleanKidName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g, ' ');
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,15}$/.test(n) ? n : null;
}

/* ---------- Hooks ---------- */

/** Set by src/net/kids.ts: the game's task system asks before a care task starts and reports when one is done. */
export const kidHooks: {
  /** True when this care can start now (a child at home needs it, and it can be paid for). Toasts why not. */
  canStart: null | ((actionId: string) => boolean);
  /** A care task finished. `itemType` is the furniture it was done at, if any. */
  done: null | ((actionId: string, itemType: string | null) => void);
} = { canStart: null, done: null };
