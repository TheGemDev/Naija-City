// National news on Naija Twitter (src/game/news.ts): what the blogs post about the people in office, and what VDM
// has to say about them. The blogs report; VDM insults, and now and then gives credit. Everything here lands in the feed (worker/feed.ts), and
// none of it may break the action it reports.

import { potholeCity } from '../src/game/city';
import { CITY_HEAD, CITY_NAME, CIVIC_CITIES, OFFICE_RULES, OFFICES, SALARY, wageBill, type CivicCity, type ExecutiveOffice, type PoliticalOffice, type Salaries, type StateVehicle } from '../src/game/civic';
import { GOV_RANT, TRIP_NEWS, VDM_GOV_ICON, VDM_NEWS_ICONS, VDM_ROADS_ICON } from '../src/game/news';
import { lampCity, lampOf, roadOf } from '../src/game/roads';
import { rand, usernames } from './crime';
import { feedStmt, naira } from './feed';
import { official } from './gazette';
import { conditionsOf, loadStates } from './state';
import { vdmForget, vdmStatements } from './vdm';
import { isPraise, type VdmFacts, type VdmTopic } from '../src/game/vdm';

const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const DAY_MS = 24 * 3600_000;

/* ---------- VDM on the government ---------- */

// What he says is assembled by src/game/vdm.ts from his phrase bank (src/game/vdmLines.ts), and worker/vdm.ts keeps
// his memory so he never repeats himself. He drags, and now and then he gives credit (rarer, and often backhanded).

/** What a matter is: the official as the gazette names them ("President @musa"), and whatever the topic needs. */
export type Matter = VdmFacts;
export type Grievance = VdmTopic;

/**
 * VDM's post about something the government did, to run inside a batch: empty when he lets this one pass. He only
 * bothers sometimes (praise more rarely than a drag), and he rests between posts. uid = the official it is about
 * (null: nobody is named). city = the state it happened in (none: national). `sure`: this one he never lets pass
 * (he still rests). `but`: a second matter of the other tone, for a mixed post. `seed`: from the event, for retries.
 */
export async function vdmGov(
  db: D1Database, uid: string | null, about: VdmTopic, matter: Matter, city?: CivicCity | null, sure = false,
  extra: { but?: { about: VdmTopic; matter: Matter; uid?: string | null } | null; seed?: string } = {},
): Promise<D1PreparedStatement[]> {
  if (!sure && rand() >= (isPraise(about) ? GOV_RANT.praiseChance : GOV_RANT.chance)) return [];
  try {
    return await vdmStatements(db, {
      topic: about, facts: matter, uid, city, icon: VDM_GOV_ICON, seed: extra.seed,
      but: extra.but ? { topic: extra.but.about, facts: extra.but.matter, uid: extra.but.uid ?? null } : null,
      rest: { icons: [VDM_GOV_ICON], ms: GOV_RANT.gapMs },
    });
  } catch (error) {
    console.error('VDM failed', error);
    return [];
  }
}

/* ---------- VDM, unprovoked ---------- */

/**
 * Cron: VDM goes after whoever is in office for the state of things, unprovoked: the roads, the lights, the taxes,
 * the money sitting in the treasury, or nothing at all. Now and then he credits a governor whose state is well run,
 * and when he has both good and bad to say about one person he may say both. One post at most, and he rests between
 * them. A post about whoever runs a city is that city's news; one about a federal office is everybody's.
 */
export async function vdmGrumbles(db: D1Database, now: number): Promise<void> {
  if (rand() < 0.1) await vdmForget(db, now).run().catch(() => {});
  if (rand() >= GOV_RANT.grumble.chance) return;
  const [policy, holes, dark] = await db.batch<Record<string, number | string | null>>([
    db.prepare('SELECT * FROM civic_policies WHERE id = 1'),
    db.prepare('SELECT site FROM potholes'),
    db.prepare('SELECT site FROM broken_lamps'),
  ]);
  const p = policy.results[0];
  if (!p) return;
  const [roads, board] = await Promise.all([conditionsOf(db, 'roads'), loadStates(db).catch(() => ({ states: [], assets: [] }))]);
  const uidOf = (office: PoliticalOffice) => p[`${office}_uid`] as string | null;
  const names = await usernames(db, OFFICES.map(uidOf));
  const who = (office: PoliticalOffice) => official(office, names.get(uidOf(office) ?? ''));

  interface Take { topic: VdmTopic; facts: Matter; uid: string | null; city: CivicCity | null; icon: string }
  const takes: Take[] = [];
  const say = (topic: VdmTopic, facts: Matter, uid: string | null, city: CivicCity | null = null, icon = VDM_GOV_ICON) => takes.push({ topic, facts, uid, city, icon });

  const president = uidOf('president');
  if (president) {
    const m = { who: who('president') };
    say('president', m, president);
    if (Number(p.tax_rate) >= GOV_RANT.highTax) say('tax', { ...m, n: Number(p.tax_rate) }, president);
    if (Number(p.loan_rate) >= GOV_RANT.highLoan) say('loans', { ...m, n: Number(p.loan_rate) }, president);
    if (Number(p.transfer_fee) >= GOV_RANT.highFee) say('fee', { ...m, n: Number(p.transfer_fee) }, president);
    if (Number(p.treasury) >= GOV_RANT.idleTreasury && now - Number(p.palliative_at ?? 0) > 24 * 3600_000) say('idle', { ...m, amount: naira(Number(p.treasury)) }, president);
    // The pay list the President signed: their own line fat, somebody in office paid nothing, or a bill the treasury cannot carry for a day.
    const pay = (office: PoliticalOffice) => Number(p[`salary_${office}`] ?? 0);
    const own = pay('president');
    const starved = OFFICES.find((o) => o !== 'president' && uidOf(o) && pay(o) === 0);
    const bill = wageBill(Object.fromEntries(OFFICES.map((o) => [o, pay(o)])) as Salaries, (o) => !!uidOf(o));
    if (own >= SALARY.fat) say('fatPayList', { ...m, amount: naira(own) }, president);
    if (own > 0 && starved) say('chopAlone', { ...m, amount: naira(own), other: who(starved) }, president);
    if (bill > 0 && bill * (DAY_MS / SALARY.everyMs) > Number(p.treasury)) say('wageBill', { ...m, amount: naira(bill), what: naira(Number(p.treasury)) }, president);
  } else say('noPresident', {}, null);

  for (const city of CIVIC_CITIES) {
    const office = CITY_HEAD[city];
    const head = uidOf(office);
    const other = CITY_NAME[city];
    if (!head) { say('vacant', { other }, null, city); continue; }
    const m = { who: who(office), other };
    // A state with money in the bank, no arrears and its assets kept up gets credit instead of the usual grumble.
    const state = board.states.find((s) => s.city === city);
    const kept = board.assets.filter((a) => a.city === city);
    const condition = kept.length ? Math.round(kept.reduce((n, a) => n + a.condition, 0) / kept.length) : 0;
    if (state && state.balance >= GOV_RANT.richState && state.arrears === 0 && condition >= GOV_RANT.goodCondition) {
      say('fullTreasury', { ...m, amount: naira(state.balance), n: condition }, head, city);
    } else say('head', m, head, city);
    const open = holes.results.map((r) => Number(r.site)).filter((site) => potholeCity(site) === city);
    if (open.length) say('potholes', { ...m, n: open.length, what: roadOf(pick(open)) }, head, city, VDM_ROADS_ICON);
    const out = dark.results.map((r) => Number(r.site)).filter((site) => lampCity(site) === city);
    if (out.length) say('lamps', { ...m, n: out.length, what: lampOf(pick(out))?.road ?? other }, head, city, VDM_ROADS_ICON);
    if (p[`okada_ban_${city}`]) say('okada', m, head, city);
    const funding = roads[city] ?? 100;
    if (funding <= GOV_RANT.lowFunding) say('funding', { ...m, n: funding }, head, city);
  }

  const igp = uidOf('igp');
  if (igp) {
    say('igp', { who: who('igp') }, igp);
    if (Number(p.patrols) <= GOV_RANT.lowFunding) say('patrols', { who: who('igp'), n: Number(p.patrols) }, igp);
  }
  const efcc = uidOf('efcc');
  if (efcc) say('efcc', { who: who('efcc') }, efcc);

  // One take. If he has the other kind of thing to say about the same person, he may say both.
  const take = pick(takes);
  const flip = take.uid ? takes.filter((t) => t.uid === take.uid && isPraise(t.topic) !== isPraise(take.topic)) : [];
  const but = flip.length && rand() < GOV_RANT.mixedChance ? pick(flip) : null;
  const stmts = await vdmStatements(db, {
    topic: take.topic, facts: take.facts, uid: take.uid, city: take.city, icon: take.icon,
    but: but && { topic: but.topic, facts: but.facts, uid: but.uid },
    seed: `grumble|${take.topic}|${but?.topic ?? ''}|${Math.floor(now / 60_000)}`,
    rest: { icons: VDM_NEWS_ICONS, ms: GOV_RANT.grumble.gapMs },
    now,
  });
  await db.batch(stmts);
}

/* ---------- The blogs ---------- */

/** A blog's post about the government, to run alone or inside a batch. uid = the official it is about. */
export const blogStmt = (db: D1Database, uid: string | null, icon: string, text: string, city?: CivicCity | null) => feedStmt(db, uid, 'politics', icon, text, city);

/** What the blogs add when a law goes up, and when it comes down. */
const LAW_ASIDES: Record<string, [up: string, down: string]> = {
  taxRate: ['Workers are recalculating what is left of their salaries. 🧮', 'Payday just got a little sweeter. 💃🏾'],
  loanRate: ['Borrowers are sweating. 🥵', 'The banks say their doors are open. 🏦'],
  transferFee: ['Sending money just got dearer. 💸', 'Cheaper transfers for everybody. 📲'],
  federalCut: ['Governors are counting what is left for the states. 😬', 'The states keep more of what they raise. 💃🏾'],
  airSubsidy: ['Cheaper tickets at every airport from today, on the government. ✈️', 'Airline seats are back to full price. 🧾'],
  railSubsidy: ['Train tickets are cheaper from today: the government is paying. 🚆', 'Train fares are going back up. 🎟️'],
  patrols: ['More police vans on the streets from tonight. 🚓', 'Fewer patrols, and the thieves have noticed. 👀'],
  jailMinutes: ['Longer nights in the cell for anybody caught. ⛓️', 'Shorter stays in the cell from today. 🔓'],
  finePct: ['Thieves will pay more when they are caught. ⚖️', 'Getting caught just got cheaper. 🤨'],
  reportHours: ['Victims now have longer to report a theft. 🕵🏾', 'Victims now have less time to report a theft. ⏳'],
};
const ROADS_ASIDE: [string, string] = ['Contractors are smiling. 🛣️', 'The potholes are smiling. 🕳️'];

/** A changed law, as the blogs report it. `name` is the official as the gazette names them. */
export function lawNews(law: string, name: string, label: string, was: number, next: number, unit: string) {
  const aside = (LAW_ASIDES[law] ?? ROADS_ASIDE)[next > was ? 0 : 1];
  return `JUST IN: ${name} has ${next > was ? 'raised' : 'cut'} ${label} from ${was}${unit} to ${next}${unit}. ${aside}`;
}

/** An okada ban coming or going, as the blogs report it. */
export const okadaNews = (name: string, city: CivicCity, on: boolean) => on
  ? `BREAKING: ${name} has banned okada in ${CITY_NAME[city]}. Riders are parking their bikes and commuters have started trekking. 🏍️`
  : `${name} has lifted the okada ban in ${CITY_NAME[city]}. The bikes are back on the road, and so is the noise. 🏍️`;

const FLIGHTS: ((name: string, city: string, fleet: string, cost: string) => string)[] = [
  (name, city, fleet, cost) => `JUST IN: ${name} has left for ${city} aboard the ${fleet}. The trip is costing the treasury ${cost}. ✈️`,
  (name, city, fleet, cost) => `${name} is on the move again: wheels up for ${city} on the ${fleet}. Aides call it “a working visit”. Bill to the treasury: ${cost}. 🛫`,
  (name, city, fleet, cost) => `Sirens at the airport as ${name} takes off for ${city} in the ${fleet}. ${cost} from public funds. ${city}, expect traffic when the convoy lands. 🚨`,
];

const TOO_MANY: ((name: string, n: number, total: string) => string)[] = [
  (name, n, total) => `TRAVEL WATCH: ${name} has now made ${n} official trips today, by jet, helicopter and convoy. The bill so far: ${total} from the treasury. 🧳`,
  (name, n, total) => `${name} is travelling too much, critics say: ${n} trips today at ${total} of public money. The office insists every one was “strictly official”. 🧾`,
  (name, n, total) => `${n} trips and counting. ${name} has spent ${total} of the treasury on the road and in the air today. Citizens are asking who is minding the office. 🤔`,
];

export interface StateTrip {
  uid: string;
  office: ExecutiveOffice;
  username: string | null | undefined;
  vehicle: StateVehicle;
  /** The city a jet is flying to. */
  dest: CivicCity | null;
  cost: number;
}

/**
 * An office holder rode in the state's fleet. It goes on the day's count; a flight to another city is news, and so
 * is an official whose trips for the day have piled up (that is when VDM may join in). Never throws.
 */
export async function reportTrip(db: D1Database, trip: StateTrip): Promise<void> {
  const now = Date.now();
  try {
    const [, lastFlight, , tally] = await db.batch<{ at: number | null; n: number; total: number | null }>([
      db.prepare('DELETE FROM state_trips WHERE created_at < ?').bind(now - TRIP_NEWS.windowMs),
      db.prepare('SELECT MAX(created_at) AS at FROM state_trips WHERE uid = ? AND dest IS NOT NULL').bind(trip.uid),
      db.prepare('INSERT INTO state_trips (uid, office, vehicle, dest, cost, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(trip.uid, trip.office, trip.vehicle, trip.dest, trip.cost, now),
      db.prepare('SELECT COUNT(*) AS n, SUM(cost) AS total FROM state_trips WHERE uid = ? AND office = ?').bind(trip.uid, trip.office),
    ]);
    const name = official(trip.office, trip.username);
    const n = tally.results[0]?.n ?? 0;
    const total = naira(tally.results[0]?.total ?? trip.cost);
    // A governor's travels are their own state's news; the president's are everybody's.
    const city = OFFICE_RULES[trip.office].city;
    const posts: D1PreparedStatement[] = [];
    if (trip.dest && now - (lastFlight.results[0]?.at ?? 0) >= TRIP_NEWS.flightGapMs) {
      posts.push(blogStmt(db, trip.uid, '✈️', pick(FLIGHTS)(name, CITY_NAME[trip.dest], trip.office === 'president' ? 'presidential jet' : 'state jet', naira(trip.cost)), city));
    }
    if (TRIP_NEWS.tooMany.includes(n)) {
      posts.push(blogStmt(db, trip.uid, '🧳', pick(TOO_MANY)(name, n, total), city), ...(await vdmGov(db, trip.uid, 'trips', { who: name, n, amount: total }, city)));
    }
    if (posts.length) await db.batch(posts);
  } catch (error) {
    console.error('Trip news failed', error);
  }
}
