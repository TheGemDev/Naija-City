export type PoliticalOffice = 'president' | 'governor' | 'minister' | 'lagosgov' | 'kanogov' | 'igp' | 'efcc';
/** The cities with a government of their own (the ids of game/regions.ts). */
export type CivicCity = 'kaduna' | 'abuja' | 'lagos' | 'kano';
export type CampaignEvent = 'rally' | 'townHall' | 'crowd' | 'posters' | 'buyVotes';

/** The offices a local (guest) campaign can go for. Shared elections cover every office. */
export const LOCAL_OFFICES: PoliticalOffice[] = ['governor', 'president'];

// Politics runs on a real three-day clock, the same for every office. Anyone can file to run at any time; nobody can
// vote until the polls open, for one hour in the evening in Nigeria every third day. Whoever wins is in office until the
// polls next close: 71 hours in office, and the 72nd at the polls.
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
/** Nigeria is an hour ahead of UTC all year, so its days start an hour before UTC's. */
const NIGERIA_MS = HOUR_MS;
/** The hour the polls open on election day, on a Nigerian clock: 8 in the evening, when the most players are on. */
const POLLS_HOUR = 20;
/** How long a winner holds any office (real time): three days, from one election to the next. */
export const TERM_MS = 3 * DAY_MS;
/** How long the polls stay open. */
export const ELECTION_DURATION_MS = HOUR_MS;
/** One election day the cycle counts from: the polls of Wednesday 21 October 2026, 8 pm in Nigeria. Every one after is TERM_MS later. */
const FIRST_POLLS = Date.UTC(2026, 9, 21, POLLS_HOUR) - NIGERIA_MS;
const clock = (hour: number) => `${hour % 12 || 12} ${hour % 24 < 12 ? 'am' : 'pm'}`;
/** The polling hour in words, on a Nigerian clock: "8 pm" and "9 pm". */
export const POLLS_OPEN_AT = clock(POLLS_HOUR);
export const POLLS_CLOSE_AT = clock(POLLS_HOUR + ELECTION_DURATION_MS / HOUR_MS);

/** When the polls open: the current election day's opening until they have closed, then the next one's. */
export function electionDayStart(now: number): number {
  const opens = FIRST_POLLS + Math.floor((now - FIRST_POLLS) / TERM_MS) * TERM_MS;
  return now < opens + ELECTION_DURATION_MS ? opens : opens + TERM_MS;
}
/** The day of the next polls in words, on a Nigerian clock: "today", "tomorrow" or "on Saturday". */
export function pollsDay(now: number): string {
  const day = (t: number) => Math.floor((t + NIGERIA_MS) / DAY_MS);
  const ahead = day(electionDayStart(now)) - day(now);
  if (ahead <= 0) return 'today';
  if (ahead === 1) return 'tomorrow';
  return `on ${new Date(electionDayStart(now) + NIGERIA_MS).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}`;
}
/** When the next polls open, in words: "today at 8 pm", "on Saturday at 8 pm". */
export const pollsWhen = (now: number) => `${pollsDay(now)} at ${POLLS_OPEN_AT}`;
/** Whether the polls are open right now. */
export const isElectionDay = (now: number) => electionDayStart(now) <= now;
/** When the polls close on the election someone filing at `now` stands in: the coming polls, or the next ones if they are open now (that ballot is already set). */
export function nextElectionEnds(now: number): number {
  const start = electionDayStart(now);
  return (start <= now ? start + TERM_MS : start) + ELECTION_DURATION_MS;
}
/** When the polls that are open now, or the next to open, close. Every term in office runs until then. */
export const pollsCloseAt = (now: number) => electionDayStart(now) + ELECTION_DURATION_MS;
/** Whether a race whose polls close at `endsAt` can be voted in yet. Before that it only takes candidates. */
export const pollsOpen = (endsAt: number, now: number) => now >= endsAt - ELECTION_DURATION_MS && now < endsAt;
/** A candidate can hold one campaign event this often. */
export const CAMPAIGN_COOLDOWN_MS = 10 * 60_000;
/** A race shows its leading candidates only; you and the one you voted for are always among them. */
export const BALLOT_SIZE = 20;

/** Every office, in the order the Civic app lists them. */
export const OFFICES: PoliticalOffice[] = ['president', 'governor', 'minister', 'lagosgov', 'kanogov', 'igp', 'efcc'];
/**
 * Money crimes in office (looting, embezzling, ghost workers, bags on the jet, a chair's bribe) are strikes against
 * whoever holds the seat (worker/loot.ts removeFromOffice): each one is a fine and a public warning, and this many costs
 * the seat (and a cell). A new holder starts with none. Rigging the election that put you there still unseats you at once.
 */
export const OFFICE_STRIKES = 3;
export const OFFICE_ICON: Record<PoliticalOffice, string> = { president: '🇳🇬', governor: '🏛️', minister: '🏙️', lagosgov: '🌊', kanogov: '🐎', igp: '👮🏾', efcc: '🕵🏾' };

export const OFFICE_RULES: Record<PoliticalOffice, {
  title: string;
  /** The city this office governs. Federal offices have none. */
  city?: CivicCity;
  filingFee: number;
  targetSupport: number;
  /** How long a winner holds the office (real time). */
  termMs: number;
  powers: string;
}> = {
  governor: { title: 'Governor of Kaduna', city: 'kaduna', filingFee: 400_000, targetSupport: 55, termMs: TERM_MS, powers: 'Runs Kaduna: roads and potholes, contracts, okada bans, pardons.' },
  minister: { title: 'FCT Minister', city: 'abuja', filingFee: 400_000, targetSupport: 55, termMs: TERM_MS, powers: 'Runs Abuja: contracts, okada bans, road projects, pardons.' },
  lagosgov: { title: 'Governor of Lagos', city: 'lagos', filingFee: 400_000, targetSupport: 55, termMs: TERM_MS, powers: 'Runs Lagos: roads and potholes, contracts, okada bans, pardons.' },
  kanogov: { title: 'Governor of Kano', city: 'kano', filingFee: 400_000, targetSupport: 55, termMs: TERM_MS, powers: 'Runs Kano: roads and potholes, contracts, okada bans, pardons.' },
  president: { title: 'President', filingFee: 1_000_000, targetSupport: 75, termMs: TERM_MS, powers: 'Sets taxes, shares the treasury between departments, grants pardons, can impeach a governor for a few hours and run their state.' },
  igp: { title: 'IGP (Inspector-General of Police)', filingFee: 150_000, targetSupport: 50, termMs: TERM_MS, powers: 'Sets jail terms and street patrols.' },
  efcc: { title: 'EFCC Chair', filingFee: 300_000, targetSupport: 60, termMs: TERM_MS, powers: 'Sets fines on thieves and the deadline to report a theft.' },
};

/** Who runs each city: the governor in Kaduna, the FCT Minister in Abuja, the Governor of Lagos in Lagos, the Governor of Kano in Kano. */
export const CITY_HEAD: Record<CivicCity, PoliticalOffice> = { kaduna: 'governor', abuja: 'minister', lagos: 'lagosgov', kano: 'kanogov' };
export const CIVIC_CITIES = Object.keys(CITY_HEAD) as CivicCity[];
export const CITY_NAME: Record<CivicCity, string> = { kaduna: 'Kaduna', abuja: 'Abuja', lagos: 'Lagos', kano: 'Kano' };

/** The okada ban, per city, as the laws name it (worker/civic.ts, worker/policy.ts). */
export const OKADA_BAN_LAW = { kaduna: 'okadaBanKaduna', abuja: 'okadaBanAbuja', lagos: 'okadaBanLagos', kano: 'okadaBanKano' } as const satisfies Record<CivicCity, string>;

export const CAMPAIGN_EVENTS: Record<CampaignEvent, { label: string; icon: string; cost: number; support: number; blurb: string }> = {
  rally: { label: 'Rally', icon: '📣', cost: 1_500_000, support: 25, blurb: 'Speeches and music at Murtala Square.' },
  townHall: { label: 'Town hall', icon: '🎤', cost: 2_500_000, support: 45, blurb: 'Answer questions from real voters.' },
  crowd: { label: 'Hire a crowd', icon: '🚌', cost: 4_000_000, support: 35, blurb: 'Bus in a crowd with ₦2k and jollof each. 1 in 5 crowds run off when the money finishes.' },
  posters: { label: 'Billboards', icon: '🪧', cost: 1_000_000, support: 12, blurb: 'Your face on billboards along the main roads until the election ends.' },
  buyVotes: { label: 'Buy votes', icon: '🧧', cost: 6_000_000, support: 50, blurb: 'Stomach infrastructure. Huge boost, but the EFCC is watching: get caught and you are disqualified, fined and jailed.' },
};
/** How many roadside billboards one candidate's campaign puts up in a city, and the most a city shows at once. */
export const CAMPAIGN_BOARDS = { each: 2, max: 8 };

/** Pulling out of a race before the polls open costs this, on top of the filing fee already paid. The state keeps both. */
export const withdrawalFee = (office: PoliticalOffice) => Math.round(OFFICE_RULES[office].filingFee / 4);

/** Campaign chaos, decided by the server (worker/civic.ts). */
export const CHAOS = {
  /** A hired crowd that runs off when the money finishes only adds this much. */
  crowdFleeChance: 0.2,
  crowdFledSupport: 8,
  /** Vote buying: base EFCC sting chance, plus the EFCC chair's fine % / 1000. */
  stingChance: 0.3,
  stingFine: 100_000,
};

/** What elected officials can do with the treasury (filled by income tax, see worker/wallet.ts). */
export const TREASURY = {
  /** Governor or FCT Minister: dig up a rival's street. Their travel is slowed and fares doubled while it lasts. */
  roadProject: { cost: 50_000, hours: 2 },
  /** Governor or FCT Minister: award a public works contract to a player, paid out of their city's budget. */
  contract: { sizes: [50_000, 100_000, 250_000], cooldownHours: 3 },
  /** President, governor or FCT Minister: let somebody out of their cell. */
  pardon: { cooldownHours: 6 },
  /** President, governor or FCT Minister: hand out palliatives to everyone active today: the president out of the palliatives budget, a city's government out of its own. Whoever shares picks how much each person gets. */
  palliative: { sizes: [5_000, 25_000, 100_000, 500_000, 1_000_000], cooldownHours: 6, maxPlayers: 100 },
  /** Any office holder: a "snake" swallows part of the treasury. */
  embezzle: { share: 0.2, cap: 50_000_000, cooldownHours: 12, catchChance: 0.35, fine: 50_000 },
};

/** The other ways an office holder moves public money into their own pocket (worker/schemes.ts). Each has its own risk. */
export type Scheme = 'front' | 'ghost' | 'divert' | 'bdc' | 'bags';
export const SCHEMES = {
  /**
   * Front company: the treasury pays one of your businesses for "supplies" that never arrive. Pick the invoice; the
   * bigger it is, the likelier an EFCC raid: the money back, a fine, and every shelf you own emptied.
   */
  front: { sizes: [1_000_000, 5_000_000, 20_000_000, 50_000_000], cooldownHours: 8, fine: 100_000, raid: (amount: number) => Math.min(0.6, 0.12 + (amount / 50_000_000) * 0.4) },
  /**
   * Ghost workers, governors only: names on the state payroll that nobody has ever seen. Every hourly round pays you a
   * slice of the state's money, and every round the auditors are likelier to look: caught, it all goes back and you are out.
   */
  ghost: { share: 0.01, cap: 2_000_000, audit: (rounds: number) => Math.min(0.6, 0.04 + rounds * 0.04) },
  /** Palliative diversion: keep a share of what you share. VDM may get the warehouse video: the money back and a fine. */
  divert: { shares: [25, 50], fine: 100_000, exposed: (pct: number) => (pct / 100) * 0.8 },
  /** Mallam's BDC: the treasury's money changed into dollars for you. No EFCC, but Mallam keeps a fat cut, and sometimes vanishes with the lot. */
  bdc: { sizes: [1_000_000, 5_000_000, 20_000_000, 50_000_000], fee: 0.35, vanish: 0.12, cooldownHours: 6 },
  /** Ghana Must Go: bags of the treasury's cash on the state jet. The biggest haul, but customs may search the plane: caught, you are out. */
  bags: { share: 0.3, cap: 50_000_000, search: 0.3, cooldownHours: 24 },
};


/**
 * The president can impeach whoever runs a state for a few hours: the governor keeps the seat but loses its powers and
 * its pay, and the president runs the state until then (worker/civic.ts). The president can reinstate them sooner,
 * and the next election result ends it.
 */
export const IMPEACH = { hours: [2, 4, 8], cooldownHours: 12 };
/** When the suspension of whoever holds this office ends; 0 when they govern. `policy` is a civic_policies row. */
export const suspendedUntil = (policy: Record<string, unknown> | null | undefined, office: PoliticalOffice, now = Date.now()) => {
  if (!OFFICE_RULES[office].city) return 0;
  const until = Number(policy?.[`${office}_suspended_until`] ?? 0);
  return until > now ? until : 0;
};

/** How an office is named in a list: shorter than its title. */
export const OFFICE_SHORT: Record<PoliticalOffice, string> = { president: 'President', governor: 'Kaduna Governor', minister: 'FCT Minister', lagosgov: 'Lagos Governor', kanogov: 'Kano Governor', igp: 'IGP', efcc: 'EFCC Chair' };

/** What each office is paid a game day. */
export type Salaries = Record<PoliticalOffice, number>;
/**
 * Officials' pay. The President signs the pay list, their own line included, and the treasury pays whoever is in
 * each office once a game day (worker/civic.ts paySalaries). When it cannot cover the whole bill, nobody is paid.
 * Everybody can read the list, and VDM does (worker/news.ts): a President who pays themselves fat, or cuts
 * somebody else to nothing, hears about it.
 */
export const SALARY = {
  /** Naira a game day. Nobody is paid until a President says so. */
  options: [0, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000],
  /** A pay round goes out this often: a game day is an hour of real time. */
  everyMs: HOUR_MS,
  /** From this much a day, a salary is fat. */
  fat: 50_000,
  /** One round never takes more than this share of what a state holds for its governor's pay, so a poor state can't be drained. */
  stateLimit: 0.02,
};
/** What a governor is paid a round: their share of the president's maximum, held to the share of the state's money one round may take. */
export const governorPay = (max: number, share: number, balance: number) => Math.min(Math.floor((max * share) / 100), Math.floor(balance * SALARY.stateLimit));
export const NO_SALARIES = Object.fromEntries(OFFICES.map((o) => [o, 0])) as Salaries;
/** What one pay round costs the treasury: only an office somebody holds is paid. */
export const wageBill = (salaries: Salaries, held: (office: PoliticalOffice) => boolean) => OFFICES.reduce((n, o) => n + (held(o) ? salaries[o] : 0), 0);

/** The offices that travel at the state's expense: the president, and whoever runs a city. */
export type ExecutiveOffice = 'president' | 'governor' | 'minister' | 'lagosgov' | 'kanogov';
/** What the state keeps for each of them. A ride in one costs the holder nothing: the treasury pays the usual fare. */
export type StateVehicle = 'helicopter' | 'cab' | 'jet';
export const STATE_FLEET: Record<ExecutiveOffice, Record<StateVehicle, string>> = {
  president: { helicopter: 'Presidential helicopter', cab: 'Presidential convoy', jet: 'Presidential jet' },
  governor: { helicopter: 'Governor’s helicopter', cab: 'Governor’s convoy', jet: 'Governor’s jet' },
  minister: { helicopter: 'Minister’s helicopter', cab: 'Minister’s convoy', jet: 'Minister’s jet' },
  lagosgov: { helicopter: 'Lagos Governor’s helicopter', cab: 'Lagos Governor’s convoy', jet: 'Lagos Governor’s jet' },
  kanogov: { helicopter: 'Kano Governor’s helicopter', cab: 'Kano Governor’s convoy', jet: 'Kano Governor’s jet' },
};
/** The most one official trip can cost the treasury (the server refuses anything dearer). */
export const STATE_TRIP_MAX = 10_000_000;

/** The federal departments the president shares the federal treasury between. The states have treasuries of their own. */
export type Department = 'police' | 'efcc' | 'welfare';
export type Allocation = Record<Department, number>;

/**
 * The president's budget: what percent of the federal treasury each federal department may use. The rest stays
 * unallocated. States are paid for by their own treasuries (worker/state.ts), topped up by the president's grants.
 */
export const ALLOCATION = {
  departments: ['police', 'efcc', 'welfare'] as Department[],
  /** The president moves a share by this many percent at a time. */
  step: 1,
  defaults: { police: 25, efcc: 15, welfare: 10 } as Allocation,
  info: {
    police: { label: 'Police', icon: '🚔', runBy: 'IGP', blurb: 'Catches more thieves.' },
    efcc: { label: 'EFCC', icon: '🕵🏾', runBy: 'EFCC Chair', blurb: 'Catches vote buyers and looters.' },
    welfare: { label: 'Federal palliatives', icon: '🍚', runBy: 'President', blurb: 'Cap on each palliative round.' },
  } as Record<Department, { label: string; icon: string; runBy: string; blurb: string }>,
  /** How much of the federal treasury a department may spend right now. */
  budget: (treasury: number, share: number) => Math.floor((treasury * share) / 100),
  /** The police share as the 0 to 100 funding the crime rules use (src/game/crime.ts): half the treasury is full funding. */
  policeFunding: (share: number) => Math.min(100, share * 2),
  /** What the EFCC share adds to (or takes off) the chance of catching a vote buyer or a treasury snake. */
  efccEdge: (share: number) => (share - 15) / 100,
};
/** The federal department whose share of the treasury each federal office spends from. A city's government spends its own state's treasury. */
export const OFFICE_DEPARTMENT: Partial<Record<PoliticalOffice, Department>> = { president: 'welfare', igp: 'police', efcc: 'efcc' };

/**
 * Looting a treasury opens a case with the EFCC chair. The looter can offer the chair a share of the loot; the chair
 * decides whether the looter goes down for it. A chair who takes the money may be found out and lose the job.
 */
export const LOOT = {
  /**
   * How long the chair has to decide: long enough for a chair who is offline to come back. The loot is frozen until
   * then, so the looter can't spend it, and any offer comes out of it. After that the old odds of being caught decide.
   */
  windowMs: 3 * 60 * 60_000,
  /** The shares of the loot a looter can offer, in percent. */
  shares: [10, 25, 50, 75],
  /** The chance a chair who takes a bribe is caught and removed. */
  chairCaught: 0.3,
};
export const lootBribe = (amount: number, pct: number) => Math.round((amount * pct) / 100);

/** A looting case, as the looter and the chair see it. */
export interface LootCase {
  id: number;
  looterUid: string;
  looter: string | null;
  chairUid: string;
  chair: string | null;
  office: PoliticalOffice;
  /** The state looted; null for the federal treasury. */
  city: CivicCity | null;
  amount: number;
  offer: number | null;
  /** The loot is frozen in the case until it closes (cases from before it was: already paid out). */
  held?: boolean;
  status: 'open' | 'accepted' | 'refused' | 'expired';
  expiresAt: number;
  decidedAt: number | null;
}

/** Nobody locked up in the last 12 hours (or still in a cell) may file to run for office. */
export const ARREST_BAN_MS = 12 * 60 * 60_000;
/** A new account waits this long before it may vote, so a candidate can't sign up a crowd of fresh accounts to vote for them. */
export const VOTER_MIN_AGE_MS = 12 * HOUR_MS;
/**
 * Why a candidate was thrown out of a race (worker/civic.ts, worker/efcc.ts): caught buying votes in an EFCC sting, or
 * convicted on an INEC fake-votes report. Out of that election only: they may run again in the next one.
 */
export type DisqualifyReason = 'vote_buying' | 'fake_votes';
export const DISQUALIFY_REASON: Record<DisqualifyReason, string> = { vote_buying: 'vote buying', fake_votes: 'fake votes' };
/** How much of a ban is left, in words: "3 days", "5 hours". */
export function banLeft(ms: number): string {
  const hours = Math.max(1, Math.ceil(ms / HOUR_MS));
  const n = hours > 24 ? Math.ceil(hours / 24) : hours;
  return `${n} ${hours > 24 ? 'day' : 'hour'}${n === 1 ? '' : 's'}`;
}


/** The powers with a waiting time, and when I last used each (worker/civic.ts). */
export type CivicCooldown = 'contract' | 'pardon' | 'impeach' | 'front' | 'bdc' | 'bags';

/** What kind of government notice a line of the gazette is (worker/gazette.ts). */
export type GazetteKind = 'law' | 'project' | 'palliative' | 'scandal' | 'elected';
/** One thing an office holder did, as everyone was told about it. */
export interface CivicNews {
  id: number;
  office: PoliticalOffice | null;
  kind: GazetteKind;
  icon: string;
  text: string;
  at: number;
}
/** How many lines the Civic app's News tab shows. */
export const GAZETTE_SHOWN = 40;
