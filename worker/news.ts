// National news on Naija Twitter (src/game/news.ts): what the blogs post about the people in office, and what VDM
// has to say about them. The blogs report; VDM insults. Everything here lands in the feed (worker/feed.ts), and
// none of it may break the action it reports.

import { potholeCity } from '../src/game/city';
import { CITY_HEAD, CITY_NAME, CIVIC_CITIES, OFFICE_RULES, OFFICES, SALARY, wageBill, type CivicCity, type ExecutiveOffice, type PoliticalOffice, type Salaries, type StateVehicle } from '../src/game/civic';
import { GOV_RANT, TRIP_NEWS, VDM_GOV_ICON, VDM_NEWS_ICONS, VDM_ROADS_ICON } from '../src/game/news';
import { lampCity, lampOf, roadOf } from '../src/game/roads';
import { rand, usernames } from './crime';
import { feedStmt, naira } from './feed';
import { official } from './gazette';

const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const DAY_MS = 24 * 3600_000;

/* ---------- VDM on the government ---------- */

export type Grievance = 'trips' | 'levy' | 'snake' | 'looter' | 'contract' | 'pardon' | 'palliative' | 'roadProject' | 'okadaBan' | 'potholes' | 'ownPay' | 'payCut' | 'fatPay' | 'unpaid';

/** What a rant is about: the official as the gazette names them ("President @musa"), and whatever the matter needs. */
interface Matter {
  who?: string;
  n?: number;
  amount?: string;
  /** A city, or the other person in the story. */
  other?: string;
  /** The law, in words: "income tax from 5% to 10%". */
  what?: string;
}

const RANTS: Record<Grievance, ((m: Matter) => string)[]> = {
  trips: [
    (m) => `${m.who}, you dey craze? ${m.n} trips for one day, ${m.amount} of our money don burn for fuel. Na government jet or na danfo? Shameless! Sit down for office do the work wey dem vote you for. 🤬`,
    (m) => `${m.n} trips today. ${m.amount} from treasury. ${m.who} dey waka upandan like person wey dey find missing goat, while road spoil and people dey hungry. Useless leadership! Ratels, mark this face. 😤`,
    (m) => `I don talk am, I go talk am again: ${m.who} na tourist, no be leader. ${m.n} trips, ${m.amount} gone, nothing to show. If shame dey sell for market, you no go fit buy? Mumu government. 🎤`,
  ],
  levy: [
    (m) => `${m.who} don raise ${m.what}. Road never fix, light no dey, but to collect money from poor man na im una sabi. Wicked, greedy people! You dey chop the people wey vote you. 🤬`,
    (m) => `So na ${m.what} be the achievement of ${m.who} this week? People dey manage garri, you dey add more billing. Heartless! Come outside make we see whether your own salary reduce. 😡`,
    (m) => `${m.who}, you no get conscience? For this economy, you dey raise ${m.what}? Bunch of clueless people wey dey rule us. Una go hear from the people on election day. 🗳️`,
  ],
  snake: [
    (m) => `${m.amount} miss from treasury and dem say na snake swallow am. SNAKE! Una think say we be mumu? That snake dey wear agbada and e get office. Thieves, all of una! EFCC, wake up or resign. 🐍🤬`,
    (m) => `Another ${m.amount} don vanish. Nobody see anything, nobody know anything. Bunch of ole wey wear suit! I dey find that snake, and when I find am I go call im name with full chest. 🔦`,
  ],
  looter: [
    (m) => `${m.who} carry ${m.amount} of public money dey run and EFCC grab am. Barawo! Ole! You swear oath, you still thief. Make dem lock am throw key away. No pardon for this one! ⛓️`,
    (m) => `See ${m.who} for EFCC net with ${m.amount}. Shameless thief wey dem dey call “Your Excellency”. I happy say dem remove am. The rest of una wey still dey office, I dey watch una hand. 👀`,
  ],
  contract: [
    (m) => `${m.who} don give ${m.amount} contract to ${m.other}. One company apply, one company win. Una dey share our money like birthday cake! Fraud! If that job no finish, I go carry camera come that site. 🎥`,
    (m) => `${m.amount} contract for ${m.other}, signed by ${m.who}. Na your padi abi na your in-law? Corrupt, greedy lot. Ratels, make we go inspect the work o. 🧐`,
  ],
  pardon: [
    (m) => `${m.who} just pardon ${m.other}. The person wey dem rob never recover, but criminal don waka free enter convoy. Useless, wicked decision! Justice na only for poor man for this country? 🤬`,
    (m) => `Pardon for ${m.other}, courtesy of ${m.who}. Criminals dey protect criminals. Una no get shame at all. The victims go remember this one on election day. 🗳️`,
  ],
  palliative: [
    (m) => `${m.who} share ${m.amount} each and call am palliative. ${m.amount}! E no reach buy one paint of garri. You dey insult hungry people, stingy government! Keep your crumbs, fix the economy. 😤`,
    (m) => `After all the tax wey una collect, na ${m.amount} per head ${m.who} fit share? And una carry camera snap am join. Shameless audio government. 📸🤬`,
  ],
  roadProject: [
    (m) => `${m.who} wake up, carry excavator go dig the street of ${m.other}. No be road project, na wickedness and vendetta with our money! Petty, childish leader. Go fix the real potholes, mumu. 🚧`,
    (m) => `“Urgent road project” for only the street of ${m.other}? ${m.who}, we no be fools. You dey use government power fight personal beef. Abuse of office! Disgrace. 😡`,
  ],
  okadaBan: [
    (m) => `${m.who} don ban okada for ${m.other}. You get convoy and helicopter, so wetin concern you how poor man go reach work? Heartless, out-of-touch leader! Provide bus first before you ban anything. 🏍️🤬`,
    (m) => `Okada ban for ${m.other}. The riders go chop wetin? ${m.who} no care. Na so una dey make law from inside AC office. Wicked policy from a clueless government. 😤`,
  ],
  potholes: [
    (m) => `${m.n} potholes dey open for ${m.other} as I dey talk, and ${m.who} dey sleep for office. People motor dey spoil every day! Useless, lazy government. Wetin be your job if no be this? 🕳️🤬`,
    (m) => `${m.other} road don turn fish pond. ${m.n} potholes! ${m.who}, you dey see am or you dey fly pass am for helicopter? Incompetent! Fix the road or comot for that seat. 😡`,
  ],
  // The pay list (src/game/civic.ts SALARY). `amount` is the new pay a day, `what` the old, `other` whose pay it is.
  ownPay: [
    (m) => `${m.who} don raise im own salary to ${m.amount} a day. Your own salary, with your own biro! People dey manage ₦5k work, you dey pay yourself like oil company. Greedy, shameless leader. Ratels, una dey see am? 🤬`,
    (m) => `So na so e easy? ${m.who} wake up, sign paper, begin collect ${m.amount} every day from our tax. No shame at all. Na country you dey rule or na your papa shop? Thief with payslip! 🧾😡`,
    (m) => `${m.amount} a day for ${m.who}, approved by the same person wey go collect am. Road bad, light no dey, but salary sharp. If greed be work, you for don win award. I dey count every kobo. 👀`,
  ],
  payCut: [
    (m) => `${m.who} don cut the pay of ${m.other} from ${m.what} to ${m.amount}. But your own salary dey intact o! Na so wicked people dey do: starve the worker, then ask why work no dey go. Petty, heartless leader. 😤`,
    (m) => `${m.other} go now collect ${m.amount} a day because ${m.who} talk so. You dey use salary fight person? Abuse of office! Tomorrow you go shout say nothing dey work. Na you cause am, mumu. 🤬`,
  ],
  fatPay: [
    (m) => `${m.who} don raise the pay of ${m.other} to ${m.amount} a day. Na your padi abi na your in-law? Una dey share treasury for una selves like suya. Corrupt, greedy lot! Wetin the person do to deserve am? 🧐`,
    (m) => `${m.amount} a day for ${m.other}, courtesy of ${m.who}. Settlement dey sweet o. Meanwhile teacher dey collect ₦4,500. Una no get conscience at all. 😡`,
  ],
  unpaid: [
    (m) => `Salary day reach, treasury dry. Wage bill na ${m.amount} and the money no dey. ${m.who}, you promise people salary wey you no fit pay? Audio government! Where the tax money go? 🧾🤬`,
    (m) => `Government workers no collect salary today because treasury no reach ${m.amount}. ${m.who} dey sign pay list like say money dey grow for tree. Clueless! Cut your coat according to your cloth. 😤`,
  ],
};

/**
 * VDM's rant about something the government did, to run inside a batch: empty when he lets this one pass. He only
 * bothers sometimes, and he rests between rants. uid = the official he is dragging (null: nobody is named).
 * city = the state it happened in (none: national). `sure`: this one he never lets pass (he still rests between rants).
 */
export function vdmGov(db: D1Database, uid: string | null, about: Grievance, matter: Matter, city?: CivicCity | null, sure = false): D1PreparedStatement[] {
  if (!sure && rand() >= GOV_RANT.chance) return [];
  const now = Date.now();
  return [
    db.prepare(
      `INSERT INTO feed (uid, kind, icon, text, created_at, city) SELECT ?1, 'vdm', ?2, ?3, ?4, ?6
       WHERE NOT EXISTS (SELECT 1 FROM feed WHERE kind = 'vdm' AND icon = ?2 AND created_at > ?5)`,
    ).bind(uid, VDM_GOV_ICON, pick(RANTS[about])(matter).slice(0, 280), now, now - GOV_RANT.gapMs, city ?? null),
  ];
}

/* ---------- VDM, unprovoked ---------- */

const plural = (n: number | undefined, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What he says when nobody did anything: the state of things is the grievance. `other` is the city, `what` the road. */
const GRUMBLES = {
  president: [
    (m) => `${m.who}, wetin you don do since you enter that office? Na only convoy and siren we dey see. Clueless leader! Nigeria no be your papa parlour. Wake up or pack your load. 🤬`,
    (m) => `I dey look ${m.who} with one eye. Promise full mouth for campaign, now na silence. Audio president! If you no fit do the work, talk make another person collect am. 🎤`,
    (m) => `Ratels, make una help me ask ${m.who}: where the dividend of democracy? Na we vote, na we still dey suffer. Shameless, lazy government from top to bottom. 😤`,
    (m) => `${m.who} dey Aso Rock dey chop rice and chicken, the people dey drink garri without sugar. Wicked leader. One day the people go ask you question and siren no go save you. 🗣️`,
  ],
  tax: [
    (m) => `Income tax na ${m.n}% and ${m.who} still dey sleep well. You dey collect ${m.n}% from okada man sweat, wetin you use am do? Greedy government! Show us the receipt. 🧾🤬`,
    (m) => `${m.n}% tax! ${m.who}, na we be your ATM? Road bad, light no dey, yet every payday you chop first. Thief with biro. Reduce am or we go talk for election. 😡`,
  ],
  idle: [
    (m) => `${m.amount} dey treasury dey sleep and ${m.who} never share one kobo palliative today. People dey hungry, money dey snore for vault. Stingy, heartless leader! 🍚🤬`,
    (m) => `Treasury full, ${m.amount}. Hunger full pass am. ${m.who}, you dey keep the money for who? For snake? Share palliative or explain yourself. I dey count. 👀`,
  ],
  loans: [
    (m) => `${m.n}% interest for bank loan. ${m.who}, you want make poor man borrow money come die? Shylock government! Na only una friends fit collect loan for this country. 🏦😤`,
    (m) => `Loan rate ${m.n}%. Small trader no fit breathe. ${m.who} dey do economics with our life. Clueless! Bring that rate down. 📉`,
  ],
  fee: [
    (m) => `${m.who} dey collect ${m.n}% for every transfer. I send my mama money, government chop inside. Una no get shame? Pickpocket government! 💸🤬`,
    (m) => `${m.n}% transfer fee. To send money for this country don turn punishment. ${m.who}, na so dem teach you leadership? Greedy lot. 😤`,
  ],
  head: [
    (m) => `${m.who}, ${m.other} people dey ask of you. Since you enter office na only billboard with your face we see. Useless! Governance no be photoshoot. 📸🤬`,
    (m) => `I waka round ${m.other} today. Nothing dey work. ${m.who} dey office dey press phone. Lazy, clueless leader! If the seat too big for you, stand up. 🪑`,
    (m) => `${m.who} think say to rule ${m.other} na to wear agbada dey wave hand. Wetin you don build? Mention one. I dey wait. Mumu leadership. 🎤`,
  ],
  potholes: [
    (m) => `I just drive pass ${m.what} for ${m.other}. Pothole wey fit swallow keke! ${plural(m.n, 'pothole')} dey open for the city and ${m.who} dey fly pass for helicopter. Useless! Fix the road. 🕳️🤬`,
    (m) => `${plural(m.n, 'pothole')} for ${m.other}. ${m.what} don turn swimming pool. ${m.who}, your own motor no dey spoil because na our money dey repair am. Wicked, lazy government! 😡`,
    (m) => `${m.who}, come follow me waka for ${m.what}. Just come. ${plural(m.n, 'pothole')} dey ${m.other} and you dey sleep. Mechanic dey thank you, the rest of us dey curse you. 🔧🕳️`,
    (m) => `Na pothole for ${m.what} break my shock absorber this morning. ${m.who}, I go send you the bill. ${plural(m.n, 'hole')} for ${m.other} and you call yourself leader? Shame! 🚗💥`,
  ],
  lamps: [
    (m) => `Night don reach, ${m.what} dark like inside pot. ${plural(m.n, 'street light')} don die for ${m.other} and ${m.who} no send. Na so thieves dey get work. Useless government! 💡🤬`,
    (m) => `${m.who}, you dey see road for night? ${plural(m.n, 'light')} off for ${m.other}, ${m.what} join. Na torch we go dey carry? Fix am, lazy people. 🔦`,
  ],
  okada: [
    (m) => `Okada still dey ban for ${m.other}. People dey trek like say na pilgrimage. ${m.who} dey inside convoy with AC. Heartless! Lift that ban or provide bus. 🏍️😤`,
    (m) => `${m.who}, the okada ban for ${m.other} don do. Riders dey hungry, workers dey late. You no fit think another solution? Clueless leader. 🤬`,
  ],
  funding: [
    (m) => `Road funding for ${m.other} na ${m.n}%. ${m.n}! ${m.who}, you want make we dey fly? Then you go act surprise when pothole open. Wicked planning. 🛣️🤬`,
    (m) => `${m.who} put ${m.n}% for ${m.other} road and still dey smile for camera. Na your generation go dey patch am? Unserious government. 😡`,
  ],
  igp: [
    (m) => `Thieves dey operate like say dem get license, and ${m.who} dey office dey drink tea. Wetin police dey do? Useless! Secure the people or drop that uniform. 👮🏾🤬`,
    (m) => `${m.who}, ordinary phone person no fit hold for road again. Your men dey collect ₦50 for checkpoint, criminals dey pass. Shameless force! 🚓`,
  ],
  patrols: [
    (m) => `Street patrol na ${m.n}%. ${m.who}, na so you wan take catch thief? By prayer? Lazy police boss! Put your men for road. 🚓😤`,
  ],
  efcc: [
    (m) => `${m.who}, treasury money dey miss and you dey find yahoo boys for hotel. Go catch the big thieves wey dey office! Or dem don settle you? 🕵🏾🤬`,
    (m) => `I dey ask ${m.who}: how many politician you don arrest? Zero. Na only poor man you sabi chase. Toothless bulldog! 🐕`,
  ],
  // The pay list as it stands. `amount` is what the President takes a day.
  fatPay: [
    (m) => `${m.who} dey collect ${m.amount} every single day as salary. Every day! Wetin you dey do for that office wey worth am? Greedy leader. Cut that salary or show us the work. 💰🤬`,
    (m) => `I check the pay list today. ${m.who}: ${m.amount} a day. Okada man no dey see that money for one month. And na the same person approve am. Shameless! 🧾😡`,
  ],
  chopAlone: [
    (m) => `${m.who} dey pay imself ${m.amount} a day, but ${m.other} dey collect zero. ZERO! You chop alone, you want make another person work for free? Wicked, selfish leader. Pay people their money! 😤`,
    (m) => `${m.other} never see one kobo salary under this government, while ${m.who} dey smile go bank with ${m.amount} daily. Chop-alone president! Ratels, mark am. 👀`,
  ],
  wageBill: [
    (m) => `Wage bill for these politicians na ${m.amount} every day, and treasury na ${m.what}. Do the maths! ${m.who} dey use our tax pay im people until e finish. Reckless, greedy government. 🧮🤬`,
    (m) => `${m.amount} a day just to pay politicians, from a treasury of ${m.what}. ${m.who}, when the money finish, na who go suffer? No be una. Na we. Cut that pay list! 😡`,
  ],
  vacant: [
    (m) => `Nobody dey rule ${m.other} now, the seat empty, and honestly we no see difference. That one suppose tell una something about the last person. Who wan run? 🪑😂`,
    (m) => `${m.other} no get leader as I dey talk. Road still bad, nothing change. So wetin the last one dey do there since? Politicians, una be decoration. 🤣`,
  ],
  noPresident: [
    () => `No president for Aso Rock and the country still dey move. So na we dey rule ourselves since? Politicians, una dey see una usefulness? Somebody file for that seat abeg. 🤣`,
  ],
} satisfies Record<string, ((m: Matter) => string)[]>;

/**
 * Cron: VDM goes after whoever is in office for the state of things, unprovoked: the roads, the lights, the taxes,
 * the money sitting in the treasury, or nothing at all. One rant at most, and he rests between them. A rant about
 * whoever runs a city is that city's news; one about a federal office is everybody's.
 */
export async function vdmGrumbles(db: D1Database, now: number): Promise<void> {
  if (rand() >= GOV_RANT.grumble.chance) return;
  const [policy, holes, dark] = await db.batch<Record<string, number | string | null>>([
    db.prepare('SELECT * FROM civic_policies WHERE id = 1'),
    db.prepare('SELECT site FROM potholes'),
    db.prepare('SELECT site FROM broken_lamps'),
  ]);
  const p = policy.results[0];
  if (!p) return;
  const uidOf = (office: PoliticalOffice) => p[`${office}_uid`] as string | null;
  const names = await usernames(db, OFFICES.map(uidOf));
  const who = (office: PoliticalOffice) => official(office, names.get(uidOf(office) ?? ''));

  const takes: { uid: string | null; city: CivicCity | null; icon: string; text: string }[] = [];
  const say = (lines: ((m: Matter) => string)[], m: Matter, uid: string | null, city: CivicCity | null = null, icon = VDM_GOV_ICON) =>
    takes.push({ uid, city, icon, text: pick(lines)(m) });

  const president = uidOf('president');
  if (president) {
    const m = { who: who('president') };
    say(GRUMBLES.president, m, president);
    if (Number(p.tax_rate) >= GOV_RANT.highTax) say(GRUMBLES.tax, { ...m, n: Number(p.tax_rate) }, president);
    if (Number(p.loan_rate) >= GOV_RANT.highLoan) say(GRUMBLES.loans, { ...m, n: Number(p.loan_rate) }, president);
    if (Number(p.transfer_fee) >= GOV_RANT.highFee) say(GRUMBLES.fee, { ...m, n: Number(p.transfer_fee) }, president);
    if (Number(p.treasury) >= GOV_RANT.idleTreasury && now - Number(p.palliative_at ?? 0) > 24 * 3600_000) say(GRUMBLES.idle, { ...m, amount: naira(Number(p.treasury)) }, president);
    // The pay list the President signed: their own line fat, somebody in office paid nothing, or a bill the treasury cannot carry for a day.
    const pay = (office: PoliticalOffice) => Number(p[`salary_${office}`] ?? 0);
    const own = pay('president');
    const starved = OFFICES.find((o) => o !== 'president' && uidOf(o) && pay(o) === 0);
    const bill = wageBill(Object.fromEntries(OFFICES.map((o) => [o, pay(o)])) as Salaries, (o) => !!uidOf(o));
    if (own >= SALARY.fat) say(GRUMBLES.fatPay, { ...m, amount: naira(own) }, president);
    if (own > 0 && starved) say(GRUMBLES.chopAlone, { ...m, amount: naira(own), other: who(starved) }, president);
    if (bill > 0 && bill * (DAY_MS / SALARY.everyMs) > Number(p.treasury)) say(GRUMBLES.wageBill, { ...m, amount: naira(bill), what: naira(Number(p.treasury)) }, president);
  } else say(GRUMBLES.noPresident, {}, null);

  for (const city of CIVIC_CITIES) {
    const office = CITY_HEAD[city];
    const head = uidOf(office);
    const other = CITY_NAME[city];
    if (!head) { say(GRUMBLES.vacant, { other }, null, city); continue; }
    const m = { who: who(office), other };
    say(GRUMBLES.head, m, head, city);
    const open = holes.results.map((r) => Number(r.site)).filter((site) => potholeCity(site) === city);
    if (open.length) say(GRUMBLES.potholes, { ...m, n: open.length, what: roadOf(pick(open)) }, head, city, VDM_ROADS_ICON);
    const out = dark.results.map((r) => Number(r.site)).filter((site) => lampCity(site) === city);
    if (out.length) say(GRUMBLES.lamps, { ...m, n: out.length, what: lampOf(pick(out))?.road ?? other }, head, city, VDM_ROADS_ICON);
    if (p[`okada_ban_${city}`]) say(GRUMBLES.okada, m, head, city);
    const funding = Number(p[city === 'kaduna' ? 'roads_funding' : `roads_funding_${city}`]);
    if (funding <= GOV_RANT.lowFunding) say(GRUMBLES.funding, { ...m, n: funding }, head, city);
  }

  const igp = uidOf('igp');
  if (igp) {
    say(GRUMBLES.igp, { who: who('igp') }, igp);
    if (Number(p.patrols) <= GOV_RANT.lowFunding) say(GRUMBLES.patrols, { who: who('igp'), n: Number(p.patrols) }, igp);
  }
  const efcc = uidOf('efcc');
  if (efcc) say(GRUMBLES.efcc, { who: who('efcc') }, efcc);

  const take = pick(takes);
  await db
    .prepare(
      `INSERT INTO feed (uid, kind, icon, text, created_at, city) SELECT ?1, 'vdm', ?2, ?3, ?4, ?6
       WHERE NOT EXISTS (SELECT 1 FROM feed WHERE kind = 'vdm' AND icon IN (${VDM_NEWS_ICONS.map((i) => `'${i}'`).join(', ')}) AND created_at > ?5)`,
    )
    .bind(take.uid, take.icon, take.text.slice(0, 280), now, now - GOV_RANT.grumble.gapMs, take.city)
    .run();
}

/* ---------- The blogs ---------- */

/** A blog's post about the government, to run alone or inside a batch. uid = the official it is about. */
export const blogStmt = (db: D1Database, uid: string | null, icon: string, text: string, city?: CivicCity | null) => feedStmt(db, uid, 'politics', icon, text, city);

/** What the blogs add when a law goes up, and when it comes down. */
const LAW_ASIDES: Record<string, [up: string, down: string]> = {
  taxRate: ['Workers are recalculating what is left of their salaries. 🧮', 'Payday just got a little sweeter. 💃🏾'],
  loanRate: ['Borrowers are sweating. 🥵', 'The banks say their doors are open. 🏦'],
  transferFee: ['Sending money just got dearer. 💸', 'Cheaper transfers for everybody. 📲'],
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
      posts.push(blogStmt(db, trip.uid, '🧳', pick(TOO_MANY)(name, n, total), city), ...vdmGov(db, trip.uid, 'trips', { who: name, n, amount: total }, city));
    }
    if (posts.length) await db.batch(posts);
  } catch (error) {
    console.error('Trip news failed', error);
  }
}
