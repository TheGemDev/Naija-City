// NPC citizens (rules in src/game/npcs.ts, tables in migrations/0116_npc_citizens.sql). On every cron tick the NPCs
// whose turn has come act: they are paid (wage tax to their state), spend (VAT and sales tax), and then maybe commit
// a crime, do a good deed, buy land, build a stage of their house or adopt. NPCs vote, each at their own minute of the
// polling hour. Once an hour the population round runs: newcomers arrive while a state has room, unhappy people move
// to a better-run state or japa, and families have babies.
//
// And it is chaos on purpose (src/game/npcs.ts NPC_TRAITS, NPC_WILD, NPC_CRAZES, NPC_REPLIES): quirks bend what each
// one does, wild things happen to them out of nowhere, a state catches a craze for a few hours, and every tick some of
// them reply to posts (players' too), pick fights under each other's posts and leave likes.
//
// Their money is their own (npcs.balance): wages come from nowhere, like an NPC tenant's rent, and what they spend
// leaves the world except for the state's share of it. Each step is a handful of statements, whatever the head count:
// rows are read in one go, worked out here, and written back in bulk through json_each.

import { CITY_NAME, CIVIC_CITIES, ELECTION_DURATION_MS, OFFICE_RULES, type CivicCity, type PoliticalOffice } from '../src/game/civic';
import { potholeCity } from '../src/game/city';
import {
  ARRIVE_FROM, CRIME_TEXT, JAPA_TO, MOOD_BUMPS, NPC_CRAZE_CHANCE, NPC_CRAZE_IDS, NPC_CRAZES, NPC_CRIME, NPC_CRIMES, NPC_FAMILY, NPC_GOOD, NPC_HOUSE,
  NPC_JOB_BY_ID, NPC_JOBS, NPC_LEAVE, NPC_MONEY, NPC_POP, NPC_PREFIX, NPC_REPLIES, NPC_VOTE, NPC_WILD, NPC_WILD_CHANCE, REPLY_LINES, RETURN_FROM,
  crazeOf, fillLine, hash01, lifeScore, nextMood, npcLine, npcUsername, pickJob, pickTrait, targetPopulation, traitOf, wageOf, type NpcCraze, type NpcCrime, type NpcWild,
  type StatePeople,
} from '../src/game/npcs';
import { NEWS_KINDS } from '../src/game/news';
import { CONTRACTOR_BY_ID, DESIGN_BY_ID, DESIGNS, PLOTS, REGION_BY_ID, REGIONS, STAGES, costOf, landPrice, npcTenantName, stageLabour, stageMaterials, type PlotSize } from '../src/game/property';
import { lampSites } from '../src/game/roads';
import { STATE_CUT, type StateAsset } from '../src/game/treasury';
import { shared } from './cache';
import { rand } from './crime';
import { naira } from './feed';
import { loadStates } from './state';

/** The house an NPC builds is their one property: its estate_plots row has uid = their id and this pid. */
const HOME_PID = 'home';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface NpcRow {
  id: string; name: string; city: CivicCity; job: string; balance: number; honesty: number; ambition: number; mood: number; kids: number;
  region: string | null; plot: PlotSize | null; design: string | null; stage: number; house_spent: number; jailed_until: number;
  arrived_at: number; acted_at: number; next_at: number;
  /** Their quirk (NPC_TRAITS). */
  trait: string;
  /** What they go by on Twitter and in the estates (npcUsername); null until the next population round gives them one. */
  username: string | null;
}

interface World {
  life: Record<CivicCity, number>;
  laws: Record<CivicCity, { incomeTax: number; salesTax: number }>;
  balance: Record<CivicCity, number>;
  conditions: Record<CivicCity, Partial<Record<StateAsset, number>>>;
  arrears: Record<CivicCity, number>;
  presidentTax: number;
  /** civic_policies, for who holds each office. */
  policy: Record<string, unknown>;
  /** The craze each state has caught right now, if any (NPC_CRAZES). */
  crazes: Partial<Record<CivicCity, { id: string; until: number }>>;
}

const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const dayKey = (now: number) => Math.floor(now / DAY);
const isCity = (c: unknown): c is CivicCity => (CIVIC_CITIES as readonly string[]).includes(c as string);

/** Every state's books, laws and conditions, and how life there feels. */
async function loadWorld(db: D1Database): Promise<World> {
  const [{ states, assets }, policy, crazes] = await Promise.all([
    loadStates(db),
    db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<Record<string, unknown>>(),
    // Before migrations/0117_npc_chaos.sql there are none.
    db.prepare('SELECT city, craze AS id, until FROM npc_crazes WHERE until > ?').bind(Date.now()).all<{ city: CivicCity; id: string; until: number }>().then((r) => r.results).catch(() => []),
  ]);
  const presidentTax = Number(policy?.tax_rate ?? 0);
  const w = { life: {}, laws: {}, balance: {}, conditions: {}, arrears: {}, presidentTax, policy: policy ?? {}, crazes: Object.fromEntries(crazes.map((c) => [c.city, c])) } as unknown as World;
  for (const city of CIVIC_CITIES) {
    const s = states.find((x) => x.city === city);
    const conditions = Object.fromEntries(assets.filter((a) => a.city === city).map((a) => [a.asset, a.condition])) as Partial<Record<StateAsset, number>>;
    w.conditions[city] = conditions;
    w.laws[city] = { incomeTax: s?.incomeTax ?? 0, salesTax: s?.salesTax ?? 0 };
    w.balance[city] = s?.balance ?? 0;
    w.arrears[city] = s?.arrears ?? 0;
    w.life[city] = lifeScore({ conditions, incomeTax: presidentTax + w.laws[city].incomeTax, salesTax: w.laws[city].salesTax, arrears: w.arrears[city] });
  }
  return w;
}

/** How life feels in each state right now (0 to 100). House prices follow it (worker/market.ts). */
export const stateLife = async (db: D1Database) => (await loadWorld(db)).life;

/** What the state's craze does to one thing (1 with none). */
const crazeMult = (w: World, city: CivicCity, key: keyof Pick<NpcCraze, 'crime' | 'japa' | 'buy' | 'spend' | 'baby' | 'arrive' | 'returnee' | 'good' | 'wild'>) =>
  crazeOf(w.crazes[city]?.id)?.[key] ?? 1;

/** What an NPC posts as: their username (their name until they have one). */
const nick = (n: { username: string | null; name: string }) => n.username ?? n.name;
/** How a post names them: @username (their name until they have one). */
const tag = (n: { username: string | null; name: string }) => (n.username ? `@${n.username}` : n.name);
/** How a reply names a post's author: @username, or the first name of an old post signed with a full name ("Alhaji Musa Bello" is Musa). */
const answer = (author: string) =>
  /^[a-z0-9_]{3,15}$/.test(author) ? `@${author}` : author.replace(/^(Mr|Mrs|Mallam|Alhaji|Hajiya|Pastor|Dr|Engr|Barrister|Madam|Chief|Corper) /, '').split(' ')[0];

/** Usernames for these NPCs that no player or other NPC has: a few tries each, with digits on the later ones. */
async function uniqueUsernames(db: D1Database, people: { id: string; name: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  let todo = people;
  for (let round = 0; round < 4 && todo.length; round++) {
    const tries = todo.map((p) => ({ p, u: round === 0 ? npcUsername(p.name, rand) : `${npcUsername(p.name, rand).slice(0, 12)}${Math.floor(rand() * 1000)}` }));
    const { results } = await db
      .prepare('SELECT username FROM players WHERE username IN (SELECT value FROM json_each(?1)) UNION SELECT username FROM npcs WHERE username IN (SELECT value FROM json_each(?1))')
      .bind(JSON.stringify(tries.map((t) => t.u)))
      .all<{ username: string }>();
    const clash = new Set(results.map((r) => r.username));
    todo = [];
    for (const t of tries) {
      if (clash.has(t.u) || taken.has(t.u)) todo.push(t.p);
      else {
        taken.add(t.u);
        out.set(t.p.id, t.u);
      }
    }
  }
  return out;
}

/* ---------- Writing ---------- */

/** A post on Naija Twitter by an NPC: the News tab carries them (src/game/news.ts NEWS_KINDS). */
export const citizenPost = (db: D1Database, author: string, city: CivicCity, icon: string, text: string, now: number) =>
  db.prepare("INSERT INTO feed (uid, kind, icon, text, created_at, city, author) VALUES (NULL, 'citizen', ?, ?, ?, ?, ?)").bind(icon, text.slice(0, 280), now, city, author.slice(0, 40));

type Census = Partial<Record<'arrived' | 'moved_in' | 'moved_out' | 'japa' | 'born' | 'adopted' | 'arrested', number>>;
const CENSUS_COLS = ['arrived', 'moved_in', 'moved_out', 'japa', 'born', 'adopted', 'arrested'] as const;
function censusStmts(db: D1Database, census: Map<CivicCity, Census>, now: number) {
  return [...census].filter(([, c]) => Object.values(c).some((n) => n)).map(([city, c]) =>
    db.prepare(
      `INSERT INTO npc_census (city, day, ${CENSUS_COLS.join(', ')}) VALUES (?1, ?2, ${CENSUS_COLS.map((_, i) => `?${i + 3}`).join(', ')})
       ON CONFLICT (city, day) DO UPDATE SET ${CENSUS_COLS.map((k) => `${k} = ${k} + excluded.${k}`).join(', ')}`,
    ).bind(city, dayKey(now), ...CENSUS_COLS.map((k) => c[k] ?? 0)),
  );
}
const count = (census: Map<CivicCity, Census>, city: CivicCity, key: keyof Census, by = 1) => {
  const c = census.get(city) ?? {};
  c[key] = (c[key] ?? 0) + by;
  census.set(city, c);
};

/** The lowest free plot slot in a region, as worker/estate.ts hands them out to players. */
async function freeSlot(db: D1Database, region: string): Promise<number> {
  const first = await db.prepare('SELECT 1 AS x FROM estate_plots WHERE region = ? AND slot = 0').bind(region).first();
  if (!first) return 0;
  const gap = await db
    .prepare('SELECT MIN(e.slot) + 1 AS slot FROM estate_plots e WHERE e.region = ? AND NOT EXISTS (SELECT 1 FROM estate_plots n WHERE n.region = e.region AND n.slot = e.slot + 1)')
    .bind(region)
    .first<{ slot: number }>();
  return gap?.slot ?? 0;
}

/* ---------- Houses ---------- */

const stageCost = (n: NpcRow, stage: number) => {
  const d = DESIGN_BY_ID[n.design ?? ''];
  const s = STAGES[stage];
  return d && s ? costOf(stageMaterials(d, s), n.region, d.id) + stageLabour(d, s, CONTRACTOR_BY_ID[NPC_HOUSE.contractor], n.region) : Infinity;
};
const buildCost = (design: string, region: string) => STAGES.reduce((a, _, i) => a + stageCost({ design, region } as NpcRow, i), 0);

/** The plot they can afford in their state, if any: the ambitious reach for the dearer estates and the bigger plot. */
function landFor(n: NpcRow): { region: string; plot: PlotSize; price: number } | null {
  const budget = n.balance * NPC_HOUSE.landShare;
  const plot: PlotSize = n.ambition > 75 ? 'double' : n.ambition > 45 ? 'full' : 'half';
  for (const size of [plot, 'full', 'half'] as PlotSize[]) {
    const options = REGIONS.filter((r) => r.city === n.city && landPrice(r, size) <= budget);
    if (!options.length) continue;
    const r = options[Math.min(options.length - 1, Math.floor((n.ambition / 100) * options.length))];
    return { region: r.id, plot: size, price: landPrice(r, size) };
  }
  return null;
}

/** The house they set out to build: as big as about a month of their pay and savings covers, the ambitious aiming higher. */
function designFor(n: NpcRow): string {
  const reach = n.balance + wageOf(n.job, n.city) * 24 * (15 + n.ambition / 4);
  const options = DESIGNS.filter((d) => buildCost(d.id, n.region!) <= reach);
  return (options.length ? options[Math.min(options.length - 1, Math.floor((n.ambition / 100) * options.length))] : DESIGNS[0]).id;
}

/* ---------- One tick of acts ---------- */

interface Post { author: string; city: CivicCity; icon: string; text: string; weight: number }

/** Cron: the NPCs whose turn has come act. Claimed first (next_at pushed on) so a tick run twice never pays twice. */
async function actAll(db: D1Database, w: World, now: number) {
  const { results: due } = await db
    .prepare('UPDATE npcs SET next_at = ?2 WHERE id IN (SELECT id FROM npcs WHERE next_at <= ?1 ORDER BY next_at LIMIT ?3) RETURNING *')
    .bind(now, now + NPC_POP.actGapMs[0], NPC_POP.maxDue)
    .all<NpcRow>();
  if (!due.length) return;

  const stateIn = new Map<CivicCity, number>();
  const stateOut = new Map<CivicCity, number>();
  const credit = (m: Map<CivicCity, number>, city: CivicCity, amount: number) => amount > 0 && m.set(city, (m.get(city) ?? 0) + Math.floor(amount));
  let federal = 0;
  const census = new Map<CivicCity, Census>();
  const posts: Post[] = [];
  const say = (author: string, city: CivicCity, icon: string, text: string, weight: number) => posts.push({ author, city, icon, text, weight });
  const extra: D1PreparedStatement[] = [];
  const buys: NpcRow[] = [];
  const builds = new Set<NpcRow>();
  /** Gone this tick: the visa lottery winners (they japa on the spot). */
  const leaving = new Set<NpcRow>();

  // Street lights and potholes are read only if someone wants to cut a cable or fill a hole.
  let lampsOut: Set<number> | null = null;
  let holes: number[] | null = null;
  const cut = new Set<CivicCity>();
  const filled = new Set<CivicCity>();
  const workingLamp = async (city: CivicCity) => {
    if (cut.has(city)) return null;
    lampsOut ??= new Set((await db.prepare('SELECT site FROM broken_lamps').all<{ site: number }>()).results.map((r) => r.site));
    const working = lampSites(city).filter((s) => !lampsOut!.has(s));
    return working.length ? pick(working) : null;
  };
  const pothole = async (city: CivicCity) => {
    if (filled.has(city)) return null;
    holes ??= (await db.prepare('SELECT site FROM potholes').all<{ site: number }>()).results.map((r) => r.site);
    const here = holes.filter((s) => potholeCity(s) === city);
    return here.length ? pick(here) : null;
  };

  /** Money spent out of savings in one go (an owambe, a car, a title): the state gets its VAT and sales tax on it. */
  const splurge = (n: NpcRow, amount: number) => {
    const paid = Math.max(0, Math.min(n.balance, Math.round(amount)));
    n.balance -= paid;
    credit(stateIn, n.city, paid * STATE_CUT.vat + (paid * w.laws[n.city].salesTax) / 100);
    return paid;
  };
  /** Something wild happens to them (NPC_WILD). Returns the mood it moves. */
  const happen = (n: NpcRow, ev: NpcWild, wage: number): number => {
    const city = n.city;
    const vars: Record<string, string> = { city: CITY_NAME[city], name: tag(n), job: NPC_JOB_BY_ID[n.job]?.label ?? 'worker', region: REGION_BY_ID[n.region ?? '']?.name ?? '', to: '' };
    let amount = 0;
    let mood = 0;
    const lose = (share: readonly [number, number]) => {
      amount = Math.round(n.balance * between(...share));
      n.balance -= amount;
    };
    const gain = (hours: readonly [number, number], cap = 500_000_000) => {
      amount = Math.min(cap, Math.round(wage * between(...hours)));
      n.balance += amount;
    };
    switch (ev.id) {
      case 'jackpot': gain([20, 400], 50_000_000); mood = 25; break;
      case 'betLoss': lose([0.3, 0.9]); mood = -15; break;
      case 'inheritance': gain([50, 600], 80_000_000); mood = 10; break;
      case 'kidnapped':
        amount = Math.min(n.balance, Math.max(200_000, Math.round(n.balance * between(0.2, 0.6))));
        n.balance -= amount;
        // Held in the bush: no work, no vote, until they are let go.
        n.jailed_until = Math.max(n.jailed_until, now + Math.round(between(2, 5) * HOUR));
        mood = -30;
        break;
      case 'villagePeople': lose([0.1, 0.4]); mood = -12; break;
      case 'sacked': {
        const worse = NPC_JOBS.filter((j) => j.wage < (NPC_JOB_BY_ID[n.job]?.wage ?? 0) && !j.crooked);
        if (!worse.length) return 0;
        n.job = pick(worse).id;
        mood = -15;
        break;
      }
      case 'promoted': {
        const now_ = NPC_JOB_BY_ID[n.job]?.wage ?? 0;
        const better = NPC_JOBS.filter((j) => j.wage > now_ && j.wage <= now_ * 4 && !j.crooked);
        if (!better.length) return 0;
        n.job = pick(better).id;
        vars.job = NPC_JOB_BY_ID[n.job].label;
        mood = 15;
        break;
      }
      case 'pastorScam': lose([0.1, 0.4]); mood = -8; break;
      case 'owambe': amount = splurge(n, n.balance * between(0.05, 0.2)); mood = 10; break;
      case 'carFlex': amount = splurge(n, n.balance * between(0.1, 0.3)); mood = 10; break;
      case 'married': gain([10, 60], 10_000_000); mood = 20; break;
      case 'breakup': lose([0.2, 0.5]); mood = -20; break;
      case 'cryptoWin': amount = Math.min(100_000_000, Math.round(n.balance * between(0.2, 3))); n.balance += amount; mood = 20; break;
      case 'cryptoLoss': lose([0.3, 0.9]); mood = -18; break;
      case 'viral': gain([10, 100], 30_000_000); mood = 15; break;
      case 'phoneSnatched': amount = Math.min(n.balance, Math.round(between(50_000, 300_000))); n.balance -= amount; mood = -10; break;
      case 'visaLottery':
        vars.to = pick(JAPA_TO);
        leaving.add(n);
        count(census, city, 'japa');
        break;
      case 'prophecy': {
        const to = pick(CIVIC_CITIES.filter((c) => c !== city));
        vars.to = CITY_NAME[to];
        n.city = to;
        count(census, city, 'moved_out');
        count(census, to, 'moved_in');
        break;
      }
      case 'twins': n.kids += 2; count(census, city, 'born', 2); mood = 15; break;
      case 'landGrab':
        amount = n.house_spent;
        extra.push(db.prepare(`DELETE FROM estate_plots WHERE uid = ? AND pid = '${HOME_PID}'`).bind(n.id));
        Object.assign(n, { region: null, plot: null, design: null, stage: 0, house_spent: 0 });
        builds.delete(n);
        mood = -25;
        break;
      case 'houseFire': n.stage = Math.min(n.stage, 2); builds.add(n); lose([0.05, 0.2]); mood = -20; break;
      case 'wrongArrest':
        amount = Math.min(n.balance, Math.round(between(30_000, 150_000)));
        n.balance -= amount;
        federal += amount;
        n.jailed_until = Math.max(n.jailed_until, now + Math.round(between(1, 3) * HOUR));
        mood = -20;
        break;
      case 'scholarship': gain([20, 80], 10_000_000); mood = 12; break;
      case 'sideHustle': gain([10, 60], 10_000_000); mood = 5; break;
      case 'chiefTitle':
        amount = splurge(n, n.balance * between(0.05, 0.15));
        if (!n.name.startsWith('Chief ')) n.name = `Chief ${n.name.replace(/^(Mr|Mrs|Mallam|Alhaji|Hajiya|Pastor|Dr|Engr|Barrister|Madam|Corper) /, '')}`;
        mood = 10;
        break;
    }
    vars.amount = naira(amount);
    // Someone else tells it when it happened to them (a kidnapping is not tweeted from the bush).
    const teller = ev.byOther ? due.find((o) => o !== n && o.city === city) : n;
    if (teller) say(nick(teller), ev.id === 'prophecy' ? city : teller.city, ev.icon, fillLine(pick(ev.lines), vars), ev.post);
    return mood;
  };

  for (const n of due) {
    if (!isCity(n.city)) continue;
    const city = n.city;
    const quirk = traitOf(n.trait);
    const craze = crazeOf(w.crazes[city]?.id);
    const hours = clamp((now - n.acted_at) / HOUR, 0, NPC_POP.maxHours);
    const wage = Math.round(wageOf(n.job, city) * quirk.wage);
    const jailed = n.jailed_until > now;
    let bump = (craze?.mood ?? 0) + between(-NPC_POP.moodNoise, NPC_POP.moodNoise);

    // 1. Pay (a good day or a bad one), wage tax, and the cost of living.
    const earned = jailed ? 0 : Math.round(wage * hours * between(...NPC_POP.luck));
    let tax = Math.floor((earned * (w.presidentTax + w.laws[city].incomeTax)) / 100);
    const share = Math.min(0.95, (NPC_MONEY.spendShare - (NPC_MONEY.ambitionSaves * n.ambition) / 100) * quirk.spend * crazeMult(w, city, 'spend'));
    const cushion = wage * NPC_MONEY.cushionHours;
    let spent = Math.round(earned * share + Math.max(0, n.balance - cushion) * NPC_MONEY.excessSpend * quirk.spend);

    /** One crime, and whether the police catch them. Returns the mood it costs the thief. */
    const commit = async (t: NpcRow, crime: NpcCrime): Promise<number> => {
      let haul = crime.id === 'evade' ? tax : Math.round(clamp(wage * between(...crime.hours), crime.min, crime.max));
      let victim: NpcRow | undefined;
      let lamp: number | null = null;
      if (crime.id === 'pickpocket' || crime.id === 'burglary' || crime.id === 'yahoo') {
        // Online fraud reaches anyone in the country; the rest is someone nearby.
        const marks = due.filter((o) => o !== t && o.balance > 0 && (crime.id === 'yahoo' || o.city === t.city));
        victim = marks.length ? pick(marks) : undefined;
        if (!victim) return 0;
        haul = Math.min(haul, Math.floor(victim.balance * 0.5));
      } else if (crime.id === 'cables') {
        lamp = await workingLamp(t.city);
        if (lamp === null) return 0;
      } else if (crime.id === 'embezzle') {
        haul = Math.min(haul, Math.floor(w.balance[t.city] * NPC_CRIME.embezzleShare));
      }
      if (haul <= 0 && crime.id !== 'cables') return 0;

      // The cables are gone either way: the light is out until the governor fixes it.
      if (lamp !== null) {
        cut.add(t.city);
        lampsOut!.add(lamp);
        extra.push(db.prepare('INSERT OR IGNORE INTO broken_lamps (site, broken_at) VALUES (?, ?)').bind(lamp, now));
      }
      const caught = rand() < NPC_CRIME.catchBase + (NPC_CRIME.catchPolice * (w.conditions[t.city].police ?? 80)) / 100;
      const words = CRIME_TEXT[crime.id];
      if (!caught) {
        if (crime.id === 'evade') tax = 0;
        else t.balance += haul;
        if (victim) {
          victim.balance -= haul;
          victim.mood = clamp(victim.mood + MOOD_BUMPS.robbed, 0, 100);
        }
        if (crime.id === 'embezzle') {
          credit(stateOut, t.city, haul);
          w.balance[t.city] -= haul;
        }
        const witness = victim ?? due.find((o) => o.city === t.city && o !== t);
        if (witness && crime.id !== 'evade') say(nick(witness), t.city, crime.icon, npcLine('unsolved', { city: CITY_NAME[t.city], crimeDid: words.did }, rand), 0.15);
        return 0;
      }
      // Caught: the victim keeps their money, the thief pays a fine to the federal treasury and goes to a cell.
      const fine = Math.min(t.balance + earned, haul * NPC_CRIME.fineTimes + NPC_CRIME.fineFlat);
      t.balance -= Math.min(t.balance, fine);
      federal += fine;
      t.jailed_until = now + Math.round(between(...NPC_CRIME.jailMs));
      t.honesty = clamp(t.honesty + NPC_CRIME.lesson, 0, 100);
      count(census, t.city, 'arrested');
      const witness = due.find((o) => o.city === t.city && o !== t);
      say(witness ? nick(witness) : 'concerned_citizen', t.city, '🚔', npcLine(victim ? 'caughtRobber' : 'caught', { city: CITY_NAME[t.city], name: tag(t), crime: words.name, fine: naira(fine) }, rand), 0.35);
      return MOOD_BUMPS.jailed;
    };

    // 2. Maybe a crime. A fraudster by trade is twice as likely, and an unhappy one more so.
    const crooked = NPC_JOB_BY_ID[n.job]?.crooked;
    const crimeOdds = NPC_CRIME.chance * ((100 - n.honesty) / 100) ** 2 * (crooked ? 2 : 1) * (n.mood < 40 ? 1.5 : 1) * quirk.crime * crazeMult(w, city, 'crime');
    if (!jailed && rand() < crimeOdds) {
      const options = NPC_CRIMES.filter((c) => (c.id !== 'embezzle' || NPC_JOB_BY_ID[n.job]?.government) && (c.id !== 'evade' || tax > 0));
      let roll = rand() * options.reduce((a, c) => a + c.weight, 0);
      const crime = options.find((c) => (roll -= c.weight) < 0) ?? options[0];
      if (crime) bump += await commit(n, crime);
    }

    // 3. Maybe a good deed, from the honest with money to spare.
    if (!jailed && n.balance > cushion * 0.25 && rand() < NPC_GOOD.chance * (n.honesty / 100) ** 2 * quirk.good * crazeMult(w, city, 'good')) {
      const deed = rand();
      const hole = deed < 0.35 ? await pothole(city) : null;
      if (hole !== null && n.balance >= NPC_GOOD.potholeCost) {
        n.balance -= NPC_GOOD.potholeCost;
        filled.add(city);
        holes = holes!.filter((s) => s !== hole);
        extra.push(db.prepare('DELETE FROM potholes WHERE site = ?').bind(hole));
        say(nick(n), city, '🛣️', npcLine('pothole', { city: CITY_NAME[city] }, rand), 0.8);
        bump += MOOD_BUMPS.gave;
      } else if (deed < 0.7) {
        const amount = Math.min(NPC_GOOD.donateMax, Math.round(n.balance * between(...NPC_GOOD.donateShare)));
        n.balance -= amount;
        credit(stateIn, city, amount);
        say(nick(n), city, '🙏🏾', npcLine('donate', { name: tag(n), amount: naira(amount), city: CITY_NAME[city] }, rand), 0.6);
        bump += MOOD_BUMPS.gave;
      } else {
        const poorest = due.filter((o) => o !== n && o.city === city).sort((a, b) => a.balance - b.balance)[0];
        if (poorest) {
          const amount = Math.round(n.balance * between(...NPC_GOOD.charityShare));
          n.balance -= amount;
          poorest.balance += amount;
          bump += MOOD_BUMPS.gave;
        }
      }
    }

    // 4. Maybe something wild: a jackpot, a kidnapping, the village people... (NPC_WILD).
    if (!jailed && rand() < NPC_WILD_CHANCE * quirk.wild * crazeMult(w, city, 'wild')) {
      const rich = n.balance > cushion;
      const open = NPC_WILD.filter((e) =>
        e.needs === 'house' ? !!n.region && n.stage >= STAGES.length
          : e.needs === 'bareLand' ? !!n.region && n.stage === 0
          : e.needs === 'kids' ? n.kids > 0
          : e.needs === 'rich' ? rich
          : e.needs === 'homeless' ? !n.region
          : true,
      );
      const weights = open.map((e) => e.weight * (e.traits?.[n.trait as keyof typeof e.traits] ?? 1) * (e.jobs?.includes(n.job) ? 3 : 1));
      let roll = rand() * weights.reduce((a, b) => a + b, 0);
      const ev = open.find((_, i) => (roll -= weights[i]) < 0);
      if (ev) bump += happen(n, ev, wage);
    }
    if (leaving.has(n)) continue;

    // 5. Land, a stage of the house, a child.
    if (!jailed && n.jailed_until <= now) {
      if (!n.region) {
        const land = buys.length < NPC_HOUSE.maxBuysPerTick && rand() < NPC_HOUSE.buyChance * crazeMult(w, city, 'buy') ? landFor(n) : null;
        if (land) {
          Object.assign(n, { region: land.region, plot: land.plot, design: null, stage: 0, house_spent: land.price });
          n.balance -= land.price;
          credit(stateIn, city, land.price * STATE_CUT.land);
          buys.push(n);
          bump += MOOD_BUMPS.plot;
          say(nick(n), city, '📜', npcLine('plot', { region: REGION_BY_ID[land.region].name, plot: PLOTS[land.plot].label.toLowerCase() }, rand), 0.25);
        }
      } else if (n.stage < STAGES.length) {
        if (!n.design) {
          n.design = designFor(n);
          builds.add(n);
        }
        const cost = stageCost(n, n.stage);
        if (n.balance >= cost && rand() < NPC_HOUSE.buildChance) {
          n.balance -= cost;
          n.house_spent += cost;
          n.stage += 1;
          credit(stateIn, city, cost * STATE_CUT.land);
          builds.add(n);
          if (n.stage >= STAGES.length) {
            bump += MOOD_BUMPS.house;
            say(nick(n), city, '🔑', npcLine('house', { design: DESIGN_BY_ID[n.design].name, region: REGION_BY_ID[n.region].name }, rand), 0.5);
          }
        }
      } else if (n.kids < NPC_FAMILY.maxKids && n.balance >= NPC_FAMILY.adoptFee * 2 && rand() < NPC_FAMILY.adoptChance * crazeMult(w, city, 'baby')) {
        n.balance -= NPC_FAMILY.adoptFee;
        n.kids += 1;
        credit(stateIn, city, NPC_FAMILY.adoptFee);
        count(census, city, 'adopted');
        bump += MOOD_BUMPS.adopted;
        say(nick(n), city, '👶🏾', npcLine('adopted', { city: CITY_NAME[city] }, rand), 0.4);
      }
    }

    // What they owe and spend comes out of what they have: never below zero.
    tax = Math.min(tax, n.balance + earned);
    spent = Math.max(0, Math.min(spent, n.balance + earned - tax));
    n.balance = Math.max(0, n.balance + earned - tax - spent);
    credit(stateIn, city, tax + spent * STATE_CUT.vat + (spent * w.laws[city].salesTax) / 100);
    n.mood = nextMood(n.mood, w.life[city], bump);
    n.acted_at = now;
    n.next_at = now + Math.round(between(...NPC_POP.actGapMs));

  }

  // What they think of the government, now and then: the worst of what is wrong in their state, or praise.
  const talkers = due.filter((n) => !leaving.has(n) && rand() < 0.05 * traitOf(n.trait).talk);
  if (talkers.length && rand() < 0.35) {
    const n = pick(talkers);
    if (isCity(n.city)) {
      const city = n.city;
      const c = w.conditions[city];
      const vars = { city: CITY_NAME[city], tax: String(w.presidentTax + w.laws[city].incomeTax) };
      const gripes = [
        (c.roads ?? 80) < 45 && 'roadsBad', (c.lights ?? 80) < 45 && 'lightsBad', (c.hospital ?? 80) < 45 && 'hospitalBad',
        w.presidentTax + w.laws[city].incomeTax >= 15 && 'taxBad', w.arrears[city] > 0 && 'arrears',
      ].filter(Boolean) as ('roadsBad' | 'lightsBad' | 'hospitalBad' | 'taxBad' | 'arrears')[];
      const topic = gripes.length ? pick(gripes) : w.life[city] >= 65 ? 'good' : null;
      if (topic) say(nick(n), city, topic === 'good' ? '👏🏾' : '😤', npcLine(topic, vars, rand), 1);
    }
  }

  // New land: a slot each, as a player's would get. A race for a slot fails the key; one that keeps failing is undone.
  for (const n of buys) {
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed; attempt++) {
      try {
        await db
          .prepare('INSERT INTO estate_plots (region, slot, uid, pid, plot, design, stage, building, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, ?)')
          .bind(n.region, await freeSlot(db, n.region!), n.id, HOME_PID, n.plot, now)
          .run();
        placed = true;
      } catch {
        /* taken meanwhile; look again */
      }
    }
    if (placed) continue;
    n.balance += n.house_spent;
    credit(stateOut, n.city, n.house_spent * STATE_CUT.land);
    Object.assign(n, { region: null, plot: null, design: null, stage: 0, house_spent: 0 });
    builds.delete(n);
  }

  const rows = due.filter((n) => isCity(n.city) && !leaving.has(n)).map((n) => ({
    id: n.id, name: n.name, job: n.job, city: n.city, balance: Math.max(0, Math.round(n.balance)), honesty: n.honesty, mood: n.mood, kids: n.kids, region: n.region, plot: n.plot,
    design: n.design, stage: n.stage, spent: Math.round(n.house_spent), jailed: n.jailed_until, next: n.next_at,
  }));
  const houses = [...builds].filter((n) => n.region).map((n) => ({ id: n.id, design: n.design, stage: n.stage, building: n.stage < STAGES.length ? 1 : 0 }));
  posts.sort((a, b) => b.weight * rand() - a.weight * rand());
  await db.batch([
    db.prepare(
      `UPDATE npcs SET name = j.name, job = j.job, city = j.city, balance = j.balance, honesty = j.honesty, mood = j.mood, kids = j.kids, region = j.region,
         plot = j.plot, design = j.design, stage = j.stage, house_spent = j.spent, jailed_until = j.jailed, acted_at = ?2, next_at = j.next
       FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.name') AS name, json_extract(value, '$.job') AS job, json_extract(value, '$.city') AS city,
               json_extract(value, '$.balance') AS balance, json_extract(value, '$.honesty') AS honesty,
               json_extract(value, '$.mood') AS mood, json_extract(value, '$.kids') AS kids, json_extract(value, '$.region') AS region,
               json_extract(value, '$.plot') AS plot, json_extract(value, '$.design') AS design, json_extract(value, '$.stage') AS stage,
               json_extract(value, '$.spent') AS spent, json_extract(value, '$.jailed') AS jailed, json_extract(value, '$.next') AS next
             FROM json_each(?1)) AS j
       WHERE npcs.id = j.id`,
    ).bind(JSON.stringify(rows), now),
    ...(houses.length
      ? [db.prepare(
          `UPDATE estate_plots SET design = j.design, stage = j.stage, building = j.building, updated_at = ?2
           FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.design') AS design, json_extract(value, '$.stage') AS stage, json_extract(value, '$.building') AS building FROM json_each(?1)) AS j
           WHERE estate_plots.uid = j.id AND estate_plots.pid = '${HOME_PID}'`,
        ).bind(JSON.stringify(houses), now)]
      : []),
    ...CIVIC_CITIES.filter((c) => stateIn.has(c) || stateOut.has(c)).map((c) =>
      db.prepare('UPDATE state_treasuries SET balance = MAX(0, balance + ?1 - ?2), incoming = incoming + ?1 WHERE city = ?3').bind(stateIn.get(c) ?? 0, stateOut.get(c) ?? 0, c),
    ),
    ...(federal > 0 ? [db.prepare('UPDATE civic_policies SET treasury = treasury + ? WHERE id = 1').bind(Math.floor(federal))] : []),
    ...extra,
    // The visa lottery winners: gone, and their land with them.
    ...(leaving.size
      ? [
          db.prepare(`DELETE FROM estate_plots WHERE pid = '${HOME_PID}' AND uid IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify([...leaving].map((n) => n.id))),
          db.prepare('DELETE FROM npcs WHERE id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify([...leaving].map((n) => n.id))),
        ]
      : []),
    ...posts.slice(0, NPC_POP.postsPerTick).filter((p) => rand() < p.weight).map((p) => citizenPost(db, p.author, p.city, p.icon, p.text, now)),
    ...censusStmts(db, census, now),
  ]);
}

/* ---------- Votes ---------- */

/**
 * Cron: NPCs vote in every open race. Each one has their own minute in the polling hour and their own mind about
 * whether to bother (happier people turn out more), both fixed by hashing, so they trickle in all hour and never twice.
 * What sways them: the candidate's campaign support (vote-buying sways the crooked more), how the one in the seat ran
 * their state (or the country), and plain personal whim.
 */
async function castVotes(db: D1Database, w: World, now: number) {
  const { results: races } = await db
    .prepare("SELECT id, office, ends_at FROM civic_elections WHERE status = 'open' AND ends_at > ?")
    .bind(now)
    .all<{ id: number; office: PoliticalOffice; ends_at: number }>();
  const national = Math.round(CIVIC_CITIES.reduce((n, c) => n + w.life[c], 0) / CIVIC_CITIES.length);
  let shouted = false;
  for (const race of races) {
    const start = race.ends_at - ELECTION_DURATION_MS;
    if (now < start) continue;
    const city = OFFICE_RULES[race.office]?.city;
    const [{ results: candidates }, { results: voters }] = await db.batch([
      db.prepare('SELECT uid, support FROM civic_candidates WHERE election_id = ?').bind(race.id),
      db.prepare(
        `SELECT n.id, n.name, n.username, n.city, n.mood, n.honesty FROM npcs n
         WHERE ${city ? 'n.city = ?2 AND' : '?2 IS NULL AND'} n.jailed_until <= ?3
           AND NOT EXISTS (SELECT 1 FROM npc_votes v WHERE v.election_id = ?1 AND v.npc_id = n.id)`,
      ).bind(race.id, city ?? null, now),
    ]) as unknown as [{ results: { uid: string; support: number }[] }, { results: { id: string; name: string; username: string | null; city: CivicCity; mood: number; honesty: number }[] }];
    if (!candidates.length || !voters.length) continue;
    const incumbent = w.policy[`${race.office}_uid`] as string | null | undefined;
    const record = (((city ? w.life[city] : national) - 50) / 50) * NPC_VOTE.record;
    const ballots: { n: string; c: string }[] = [];
    for (const v of voters) {
      const turnout = NPC_VOTE.turnout[0] + ((NPC_VOTE.turnout[1] - NPC_VOTE.turnout[0]) * v.mood) / 100;
      if (hash01(`turnout:${race.id}:${v.id}`) >= turnout) continue;
      if (start + hash01(`at:${race.id}:${v.id}`) * ELECTION_DURATION_MS > now) continue;
      const weights = candidates.map((c) =>
        Math.max(1, NPC_VOTE.base + c.support * (v.honesty < 35 ? NPC_VOTE.bribable : 1) + (c.uid === incumbent ? record : 0) + NPC_VOTE.whim * hash01(`whim:${v.id}:${c.uid}`)),
      );
      let roll = hash01(`pick:${race.id}:${v.id}`) * weights.reduce((a, b) => a + b, 0);
      const choice = candidates.find((_, i) => (roll -= weights[i]) < 0) ?? candidates[0];
      ballots.push({ n: v.id, c: choice.uid });
    }
    if (!ballots.length) continue;
    const loud: { name: string; username: string | null; city: CivicCity } | undefined = !shouted && rand() < 0.15 ? voters.find((v) => v.id === ballots[0].n) : undefined;
    shouted ||= !!loud;
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO npc_votes (election_id, npc_id, candidate_uid, at)
         SELECT ?1, json_extract(value, '$.n'), json_extract(value, '$.c'), ?2 FROM json_each(?3)`,
      ).bind(race.id, now, JSON.stringify(ballots)),
      ...(loud && isCity(loud.city) ? [citizenPost(db, nick(loud), loud.city, '🗳️', npcLine('vote', { city: CITY_NAME[loud.city] }, rand), now)] : []),
    ]);
  }
}

/* ---------- Chatter: replies, beef and likes ---------- */

interface Recent { id: number; kind: string; city: CivicCity | null; author: string | null; npcReplies: number; lastNpc: string | null }

/**
 * Cron: NPCs on Twitter. Now and then one replies to a recent post: the news, another NPC (and the author may fire
 * back), or a player's own tweet, who then has a reply waiting. And a few NPCs leave likes on recent posts.
 */
async function chatter(db: D1Database, now: number) {
  const kinds = [...NEWS_KINDS, 'vdm', 'post'].map((k) => `'${k}'`).join(', ');
  const { results: recent } = await db
    .prepare(
      `SELECT f.id, f.kind, f.city, f.author,
              (SELECT COUNT(*) FROM feed r WHERE r.parent_id = f.id AND r.kind = 'citizen') AS npcReplies,
              (SELECT r.author FROM feed r WHERE r.parent_id = f.id AND r.kind = 'citizen' ORDER BY r.id DESC LIMIT 1) AS lastNpc
       FROM feed f WHERE f.parent_id IS NULL AND f.created_at >= ? AND f.kind IN (${kinds}) ORDER BY f.id DESC LIMIT 60`,
    )
    .bind(now - NPC_REPLIES.recentMs)
    .all<Recent>();
  if (!recent.length) return;
  const stmts: D1PreparedStatement[] = [];

  if (rand() < NPC_REPLIES.chance) {
    const players = recent.filter((r) => r.kind === 'post' && r.npcReplies < 1);
    const others = recent.filter((r) => r.kind !== 'post' && r.npcReplies < NPC_REPLIES.perPost);
    const target = rand() < NPC_REPLIES.playerShare && players.length ? pick(players) : others.length ? pick(others) : null;
    if (target) {
      const city = isCity(target.city) ? target.city : null;
      const who = await db
        .prepare('SELECT name, username, city FROM npcs WHERE (?1 IS NULL OR city = ?1) AND (?2 IS NULL OR COALESCE(username, name) != ?2) ORDER BY RANDOM() LIMIT 1')
        .bind(city, target.author)
        .first<{ name: string; username: string | null; city: CivicCity }>();
      // Under an NPC's post that someone else already answered, the author may fire back at them instead.
      const clap = target.kind === 'citizen' && target.author && target.lastNpc && target.lastNpc !== target.author && rand() < NPC_REPLIES.clapback;
      const author = clap ? target.author! : who && nick(who);
      const lines =
        clap ? REPLY_LINES.clapback
          : target.kind === 'citizen' ? REPLY_LINES.citizen
          : target.kind === 'post' ? REPLY_LINES.player
          : target.kind === 'vdm' ? REPLY_LINES.vdm
          : target.kind === 'disaster' ? REPLY_LINES.disaster
          : REPLY_LINES.gov;
      if (author) {
        const text = fillLine(pick(lines), { name: answer(clap ? target.lastNpc! : target.author ?? 'you') });
        stmts.push(
          db.prepare("INSERT INTO feed (uid, kind, icon, text, created_at, city, author, parent_id) VALUES (NULL, 'citizen', '💬', ?, ?, ?, ?, ?)")
            .bind(text.slice(0, 280), now, city ?? who?.city ?? null, author.slice(0, 40), target.id),
        );
      }
    }
  }

  // Likes: a handful of NPCs, each on a recent post of their own choosing.
  const { results: fans } = await db.prepare('SELECT id FROM npcs ORDER BY RANDOM() LIMIT ?').bind(Math.round(between(...NPC_REPLIES.likes))).all<{ id: string }>();
  for (const fan of fans) stmts.push(db.prepare('INSERT OR IGNORE INTO feed_likes (post_id, uid, created_at) VALUES (?, ?, ?)').bind(pick(recent).id, fan.id, now));
  if (stmts.length) await db.batch(stmts);
}

/* ---------- The population round ---------- */

/** A new arrival: a name, a job, a temper, and what they brought with them. */
function newcomer(city: CivicCity, life: number, now: number, returnees = 1): NpcRow & { returnee: boolean; from: string } {
  const job = pickJob(city, rand);
  const returnee = rand() < NPC_MONEY.returneeChance * returnees;
  // Most people are decent; a few are not. The "forex traders" never are.
  const normal = (rand() + rand() + rand()) / 3;
  const honesty = Math.round(clamp(normal * 120 - 5, 0, 100));
  const [lo, hi] = returnee ? NPC_MONEY.returneeHours : NPC_MONEY.startHours;
  return {
    id: `${NPC_PREFIX}${crypto.randomUUID()}`, name: npcTenantName(rand).replace(' & family', ''), city, job: job.id,
    balance: Math.round(wageOf(job.id, city) * between(lo, hi)),
    honesty: job.crooked ? Math.min(honesty, 25) : honesty, ambition: Math.round(rand() * 100), mood: Math.max(55, life), kids: 0,
    region: null, plot: null, design: null, stage: 0, house_spent: 0, jailed_until: 0, arrived_at: now, acted_at: now,
    next_at: now + Math.round(rand() * NPC_POP.actGapMs[1]), trait: pickTrait(rand), username: null, returnee, from: pick(returnee ? RETURN_FROM : ARRIVE_FROM),
  };
}

/** Cron, once an hour: arrivals, moves, japa and babies, state by state. */
async function populationRound(db: D1Database, w: World, now: number) {
  const claim = await db
    .prepare('UPDATE civic_policies SET npc_round_at = ?1 WHERE id = 1 AND COALESCE(npc_round_at, 0) <= ?2 RETURNING id')
    .bind(now, now - NPC_POP.roundMs)
    .first();
  if (!claim) return;
  const [{ results: people }, { results: residents }] = (await db.batch([
    db.prepare('SELECT id, name, username, city, mood, balance, kids, region, stage, house_spent, trait FROM npcs'),
    db.prepare(
      `SELECT w.state AS city, COUNT(*) AS n FROM wallets w JOIN players p ON p.uid = w.uid
       WHERE p.last_seen >= ? AND w.state IN (${CIVIC_CITIES.map((c) => `'${c}'`).join(', ')}) GROUP BY w.state`,
    ).bind(now - NPC_POP.activeMs),
  ])) as unknown as [{ results: Pick<NpcRow, 'id' | 'name' | 'username' | 'city' | 'mood' | 'balance' | 'kids' | 'region' | 'stage' | 'house_spent' | 'trait'>[] }, { results: { city: CivicCity; n: number }[] }];
  const players = Object.fromEntries(residents.map((r) => [r.city, r.n])) as Partial<Record<CivicCity, number>>;
  const heads = Object.fromEntries(CIVIC_CITIES.map((c) => [c, people.filter((p) => p.city === c).length])) as Record<CivicCity, number>;
  const target = Object.fromEntries(CIVIC_CITIES.map((c) => [c, targetPopulation(c, w.life[c], players[c] ?? 0)])) as Record<CivicCity, number>;
  const best = [...CIVIC_CITIES].sort((a, b) => w.life[b] - w.life[a])[0];

  const census = new Map<CivicCity, Census>();
  const posts: Post[] = [];
  const gone: string[] = [];
  const unhoused: string[] = [];
  const moved: { id: string; city: CivicCity; balance: number }[] = [];
  const babies: string[] = [];

  for (const p of people) {
    if (!isCity(p.city)) continue;
    const city = p.city;
    const crowded = heads[city] > target[city] * 1.1 ? NPC_LEAVE.crowdedJapa : 0;
    const japa = ((p.mood < NPC_LEAVE.japaMood[0] ? NPC_LEAVE.japa[0] : p.mood < NPC_LEAVE.japaMood[1] ? NPC_LEAVE.japa[1] : NPC_LEAVE.japa[2]) * traitOf(p.trait).japa + crowded) * crazeMult(w, city, 'japa');
    if (rand() < japa) {
      gone.push(p.id);
      heads[city] -= 1;
      count(census, city, 'japa');
      posts.push({ author: nick(p), city, icon: '🧳', text: npcLine(p.mood < NPC_LEAVE.japaMood[1] ? 'japaAngry' : 'japa', { city: CITY_NAME[city], to: pick(JAPA_TO) }, rand), weight: 0.2 });
      continue;
    }
    if (p.mood < NPC_LEAVE.moveMood && best !== city && w.life[best] - w.life[city] >= NPC_LEAVE.moveGap && heads[best] < target[best] && rand() < NPC_LEAVE.moveChance) {
      // They sell up and go: the house leaves the estate with them.
      moved.push({ id: p.id, city: best, balance: Math.round(p.balance + p.house_spent * NPC_MONEY.houseResale) });
      if (p.region) unhoused.push(p.id);
      heads[city] -= 1;
      heads[best] += 1;
      count(census, city, 'moved_out');
      count(census, best, 'moved_in');
      posts.push({ author: nick(p), city: best, icon: '🚚', text: npcLine('move', { from: CITY_NAME[city], city: CITY_NAME[best] }, rand), weight: 0.4 });
      continue;
    }
    if (p.region && p.stage >= STAGES.length && p.kids < NPC_FAMILY.maxKids && rand() < NPC_FAMILY.babyChance * crazeMult(w, city, 'baby')) {
      babies.push(p.id);
      count(census, city, 'born');
      posts.push({ author: nick(p), city, icon: '🍼', text: npcLine('baby', {}, rand), weight: 0.3 });
    }
  }

  const arrivals: ReturnType<typeof newcomer>[] = [];
  for (const city of CIVIC_CITIES) {
    const room = target[city] - heads[city];
    // Some hours a bus load, some hours nobody: the share that arrives swings, and a craze can bring a crowd.
    const surge = crazeMult(w, city, 'arrive');
    const n = heads[city] < NPC_POP.seed
      ? NPC_POP.seed - heads[city]
      : room > 0 ? Math.min(Math.round(NPC_POP.maxArrivals * surge), Math.round(room * NPC_POP.arriveShare * surge * between(0, 2))) : 0;
    for (let i = 0; i < n; i++) arrivals.push(newcomer(city, w.life[city], now, crazeMult(w, city, 'returnee')));
    count(census, city, 'arrived', n);
  }

  // Crazes: a state with none may catch one for a few hours (NPC_CRAZES); someone there tweets that it has started.
  const crazes: D1PreparedStatement[] = [];
  for (const city of CIVIC_CITIES) {
    if (w.crazes[city] || rand() >= NPC_CRAZE_CHANCE) continue;
    let roll = rand() * NPC_CRAZE_IDS.reduce((a, id) => a + NPC_CRAZES[id].weight, 0);
    const id = NPC_CRAZE_IDS.find((c) => (roll -= NPC_CRAZES[c].weight) < 0) ?? NPC_CRAZE_IDS[0];
    const craze = NPC_CRAZES[id];
    const until = now + Math.round(between(...craze.hours) * HOUR);
    w.crazes[city] = { id, until };
    crazes.push(db.prepare('INSERT OR REPLACE INTO npc_crazes (city, craze, started_at, until) VALUES (?, ?, ?, ?)').bind(city, id, now, until));
    // The crash itself happens at once: the tech bros, the "forex traders" and the gamblers lose most of what they hold.
    if (id === 'cryptoCrash') crazes.push(db.prepare("UPDATE npcs SET balance = CAST(balance * 0.35 AS INTEGER) WHERE city = ? AND (job IN ('techbro', 'yahoo') OR trait = 'gambler')").bind(city));
    const voice = people.find((p) => p.city === city && !gone.includes(p.id));
    if (voice) posts.unshift({ author: nick(voice), city, icon: craze.icon, text: fillLine(pick(craze.lines), { city: CITY_NAME[city] }), weight: 1 });
  }
  // Everyone gets a username: the newcomers, and anyone who arrived before there were usernames (migration 0118).
  const unnamed = people.filter((p) => !p.username && !gone.includes(p.id));
  const names = await uniqueUsernames(db, [...arrivals, ...unnamed]);
  for (const a of arrivals) a.username = names.get(a.id) ?? null;
  const renamed = unnamed.filter((p) => names.has(p.id)).map((p) => ({ id: p.id, username: names.get(p.id)! }));

  // A few of them say so: a whole seed of thirty would bury the news.
  for (const a of arrivals.filter(() => rand() < 0.1).slice(0, 2)) {
    const job = NPC_JOB_BY_ID[a.job];
    posts.push({ author: nick(a), city: a.city, icon: a.returnee ? '✈️' : '🧳', text: npcLine(a.returnee ? 'returnee' : 'arrive', { city: CITY_NAME[a.city], from: a.from, job: job.label }, rand), weight: 0.5 });
  }

  const ids = (list: string[]) => JSON.stringify(list);
  posts.sort((a, b) => b.weight * rand() - a.weight * rand());
  await db.batch([
    ...(gone.length || unhoused.length
      ? [db.prepare(`DELETE FROM estate_plots WHERE pid = '${HOME_PID}' AND uid IN (SELECT value FROM json_each(?1))`).bind(ids([...gone, ...unhoused]))]
      : []),
    ...(gone.length ? [db.prepare('DELETE FROM npcs WHERE id IN (SELECT value FROM json_each(?1))').bind(ids(gone))] : []),
    ...(moved.length
      ? [db.prepare(
          `UPDATE npcs SET city = j.city, balance = j.balance, region = NULL, plot = NULL, design = NULL, stage = 0, house_spent = 0
           FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.city') AS city, json_extract(value, '$.balance') AS balance FROM json_each(?1)) AS j
           WHERE npcs.id = j.id`,
        ).bind(JSON.stringify(moved))]
      : []),
    ...(babies.length ? [db.prepare('UPDATE npcs SET kids = kids + 1 WHERE id IN (SELECT value FROM json_each(?1))').bind(ids(babies))] : []),
    ...(renamed.length
      ? [db.prepare(
          `UPDATE npcs SET username = j.username FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.username') AS username FROM json_each(?1)) AS j
           WHERE npcs.id = j.id`,
        ).bind(JSON.stringify(renamed))]
      : []),
    ...(arrivals.length
      ? [db.prepare(
          `INSERT INTO npcs (id, name, city, job, balance, honesty, ambition, mood, kids, stage, house_spent, jailed_until, arrived_at, acted_at, next_at, trait, username)
           SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.city'), json_extract(value, '$.job'),
                  json_extract(value, '$.balance'), json_extract(value, '$.honesty'), json_extract(value, '$.ambition'), json_extract(value, '$.mood'),
                  0, 0, 0, 0, ?2, ?2, json_extract(value, '$.next_at'), json_extract(value, '$.trait'), json_extract(value, '$.username')
           FROM json_each(?1)`,
        ).bind(JSON.stringify(arrivals.map(({ id, name, city, job, balance, honesty, ambition, mood, next_at, trait, username }) => ({ id, name, city, job, balance, honesty, ambition, mood, next_at, trait, username }))), now)]
      : []),
    ...crazes,
    // Every arrival counts towards the phone's "plays" (worker/cfTraffic.ts).
    ...(arrivals.length ? [db.prepare('UPDATE civic_policies SET npc_total = npc_total + ? WHERE id = 1').bind(arrivals.length)] : []),
    ...posts.slice(0, NPC_POP.postsPerRound).map((p) => citizenPost(db, p.author, p.city, p.icon, p.text, now)),
    ...censusStmts(db, census, now),
    // Old ballots and old days of the census are no use to anyone.
    db.prepare("DELETE FROM npc_votes WHERE election_id IN (SELECT id FROM civic_elections WHERE status = 'closed' AND ends_at < ?)").bind(now - 2 * DAY),
    db.prepare('DELETE FROM npc_census WHERE day < ?').bind(dayKey(now) - 30),
  ]);
}

/** Cron: everything NPC citizens do in a tick. */
export async function runNpcs(env: Env, now: number) {
  const w = await loadWorld(env.DB);
  await populationRound(env.DB, w, now);
  await actAll(env.DB, w, now);
  await castVotes(env.DB, w, now);
  await chatter(env.DB, now);
}

/* ---------- For the rest of the game ---------- */

/** NPC adults per state (empty before the migration has run). It reads every NPC row, so it is cached for ten minutes. */
export async function headcounts(db: D1Database): Promise<Partial<Record<CivicCity, number>>> {
  try {
    return await shared('npc-headcounts', 600, async () => {
      const { results } = await db.prepare('SELECT city, COUNT(*) AS n FROM npcs GROUP BY city').all<{ city: CivicCity; n: number }>();
      return Object.fromEntries(results.map((r) => [r.city, r.n]));
    });
  } catch {
    return {};
  }
}

/**
 * The population counter for the Civic app and the state cards: who lives in each state, how they feel, and today's
 * comings and goings. It reads every NPC row and every player sees the same numbers, so it is cached for a minute.
 */
export async function peopleBoard(db: D1Database, now: number): Promise<Partial<Record<CivicCity, StatePeople>>> {
  try {
    return await shared('people-board', 60, () => countPeople(db, now));
  } catch {
    return {};
  }
}

async function countPeople(db: D1Database, now: number): Promise<Partial<Record<CivicCity, StatePeople>>> {
  const w = await loadWorld(db);
  const [npcs, players, census] = (await db.batch([
    db.prepare('SELECT city, COUNT(*) AS adults, COALESCE(SUM(kids), 0) AS kids, AVG(mood) AS mood FROM npcs GROUP BY city'),
    db.prepare(
      `SELECT w.state AS city, COUNT(*) AS n FROM wallets w JOIN players p ON p.uid = w.uid
       WHERE p.last_seen >= ? AND w.state IN (${CIVIC_CITIES.map((c) => `'${c}'`).join(', ')}) GROUP BY w.state`,
    ).bind(now - NPC_POP.activeMs),
    db.prepare('SELECT * FROM npc_census WHERE day = ?').bind(dayKey(now)),
  ])) as unknown as [
    { results: { city: CivicCity; adults: number; kids: number; mood: number | null }[] },
    { results: { city: CivicCity; n: number }[] },
    { results: (Record<(typeof CENSUS_COLS)[number], number> & { city: CivicCity })[] },
  ];
  return Object.fromEntries(CIVIC_CITIES.map((city) => {
    const n = npcs.results.find((r) => r.city === city);
    const c = census.results.find((r) => r.city === city);
    return [city, {
      adults: n?.adults ?? 0, kids: n?.kids ?? 0, players: players.results.find((r) => r.city === city)?.n ?? 0,
      mood: n?.mood === null || n?.mood === undefined ? null : Math.round(n.mood), life: w.life[city],
      today: { arrived: c?.arrived ?? 0, movedIn: c?.moved_in ?? 0, movedOut: c?.moved_out ?? 0, japa: c?.japa ?? 0, born: c?.born ?? 0, adopted: c?.adopted ?? 0, arrested: c?.arrested ?? 0 },
      craze: w.crazes[city] ?? null,
    }];
  }));
}

