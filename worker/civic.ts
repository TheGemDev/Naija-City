import { announceAll, notifyPlayer } from './shards';
import { broadcastPush } from './push';
import { ALLOCATION, ARREST_BAN_MS, VOTER_MIN_AGE_MS, governorPay, banLeft, IMPEACH, SCHEMES, suspendedUntil, BALLOT_SIZE, CAMPAIGN_COOLDOWN_MS, CAMPAIGN_EVENTS, CHAOS, CITY_HEAD, CITY_NAME, CIVIC_CITIES, DISQUALIFY_REASON, ELECTION_DURATION_MS, nextElectionEnds, OFFICE_RULES, POLLS_CLOSE_AT, pollsCloseAt, pollsOpen, pollsWhen, OFFICES as OFFICE_LIST, OKADA_BAN_LAW, STATE_TRIP_MAX, SALARY, TREASURY, wageBill, withdrawalFee, type Allocation, type Salaries, type CampaignEvent, type CivicCity, type CivicCooldown, type DisqualifyReason, type ExecutiveOffice, type PoliticalOffice, type StateVehicle } from '../src/game/civic';
import { applyStmts, ensureWallet, getBalance, treasuryStmts } from './wallet';
import { LAW_LIMITS } from '../src/game/crime';
import { LOAN } from '../src/game/loans';
import { loadLaws, rand, transfer, usernames } from './crime';
import { jail } from './fun';
import { searchPhone } from './phoneSearch';
import { feedStmt, handle, naira, postFeed } from './feed';
import { refreshPolicy } from './policy';
import { ASSET_INFO, FEDERAL_CUT, GOV_STEPS, GRANT_SIZES, inRange, lawAt, lawText, REPAIR, repairCost, STATE_ASSETS, STATE_LAWS, STATE_LAW_KEYS, UPKEEP_LEVELS, type StateAsset } from '../src/game/treasury';
import { TRANSFER_FEE_LIMITS } from '../src/game/treasury';
import { FARE_SUBSIDY } from '../src/game/transport';
import { capsOf, houseOpen, lawsOf, loadStates, spendState } from './state';
import { lootAction, lootBoard, openLootCase, removeFromOffice, settleLoot, type LootAction } from './loot';
import { myGhosts, potStmt, runScheme, setGhosts } from './schemes';
import { fineItem, recordExhibits } from './exhibits';
import { gazette, OFFICE_NAME, official, recentNews, type Notice } from './gazette';
import { syncForum } from './groups';
import { peopleBoard } from './npcs';
import { blogStmt, lawNews, okadaNews, reportTrip, vdmGov } from './news';
import { GOV_RANT } from '../src/game/news';
import { decideDesk, deskOf } from './desk';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ error }, status);
const OFFICES = new Set<PoliticalOffice>(OFFICE_LIST);
const EVENTS = new Set<CampaignEvent>(Object.keys(CAMPAIGN_EVENTS) as CampaignEvent[]);

interface CandidateRow {
  uid: string;
  username: string | null;
  name: string | null;
  support: number;
  votes: number;
  /** Of those, the NPC citizens' (worker/npcs.ts). */
  npcVotes?: number;
  lastActionAt: number;
}

/** One race in an election announcement. */
type RaceNews = { office: PoliticalOffice; endsAt?: number; winner?: string | null; votes?: number };

/**
 * Elections opening or closing are a live event: everyone online sees it now, everyone with push gets a notification.
 * All the races that open (or close) in one tick go out together, as one toast and one notification, not one per seat.
 */
async function announceElections(env: Env, ctx: ExecutionContext | undefined, phase: 'open' | 'result', races: RaceNews[], title: string, body: string) {
  if (!races.length) return;
  // `office` and the rest of the first race are for clients still running the build from before races were grouped.
  await announceAll(env, { t: 'election', phase, ...races[0], races });
  if (!ctx) return;
  ctx.waitUntil(broadcastPush(env, { title, body: body.slice(0, 240), tag: `election-${phase}`, category: 'news', app: 'civic' }));
}

/** "Governor of Kaduna, Governor of Lagos and President" */
const listOf = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export async function settleElections(env: Env, now: number, ctx?: ExecutionContext) {
  const db = env.DB;
  // Every race not being voted on yet closes on the polls a candidate filing now would stand in. Races opened under an
  // older calendar (weekly, daily, then every three days) didn't: this brings them onto the daily one, earlier or later.
  await db
    .prepare("UPDATE civic_elections SET ends_at = ?1 WHERE status = 'open' AND ends_at != ?1 AND ends_at - ?2 > ?3")
    .bind(nextElectionEnds(now), ELECTION_DURATION_MS, now)
    .run();
  // The polls have opened for these races: tell everyone, once. A race's started_at is when its
  // first candidate filed until then; moving it to the minute the polls opened is what marks it as announced.
  const opened = await db
    .prepare("UPDATE civic_elections SET started_at = ends_at - ?1 WHERE status = 'open' AND ends_at - ?1 <= ?2 AND ends_at > ?2 AND started_at != ends_at - ?1 RETURNING office, ends_at")
    .bind(ELECTION_DURATION_MS, now)
    .all<{ office: PoliticalOffice; ends_at: number }>();
  if (opened.results.length) {
    const seats = opened.results.map((race) => OFFICE_RULES[race.office].title);
    await announceElections(
      env, ctx, 'open',
      opened.results.map((race) => ({ office: race.office, endsAt: race.ends_at })),
      seats.length === 1 ? `🗳️ Polls open: ${seats[0]}` : `🗳️ Polls open for ${seats.length} seats`,
      `${listOf(seats)}: voting is open for one hour, until ${POLLS_CLOSE_AT}. Tap Vote at the top of your screen.`,
    ).catch(() => {});
  }
  const expired = await db
    .prepare("SELECT id, office FROM civic_elections WHERE status = 'open' AND ends_at <= ?")
    .bind(now)
    .all<{ id: number; office: PoliticalOffice }>();

  const results: RaceNews[] = [];
  for (const election of expired.results) {
    const candidates = await db
      .prepare(
        `SELECT c.uid, c.support, COUNT(v.voter_uid) + (SELECT COUNT(*) FROM npc_votes nv WHERE nv.election_id = c.election_id AND nv.candidate_uid = c.uid) AS votes
         FROM civic_candidates c
         LEFT JOIN civic_votes v ON v.election_id = c.election_id AND v.candidate_uid = c.uid
         WHERE c.election_id = ?
         GROUP BY c.uid
         ORDER BY votes DESC, c.support DESC, c.uid ASC
         LIMIT 1`,
      )
      .bind(election.id)
      .first<{ uid: string; votes: number; support: number }>();

    const winner = candidates ? await db.prepare('SELECT username FROM players WHERE uid = ?').bind(candidates.uid).first<{ username: string | null }>() : null;
    // Close it first: whoever gets here first (the cron or a player opening the app) announces the result, once.
    const closed = await db
      .prepare("UPDATE civic_elections SET status = 'closed', winner_uid = ? WHERE id = ? AND status = 'open' RETURNING id")
      .bind(candidates?.uid ?? null, election.id)
      .first();
    if (!closed) continue;
    await db.batch([
      feedStmt(
        db, candidates?.uid ?? null, 'election', '🗳️',
        candidates
          ? `ELECTION RESULT: ${handle(winner?.username)} is the new ${OFFICE_RULES[election.office].title} with ${candidates.votes} vote${candidates.votes === 1 ? '' : 's'}! Supporters are dancing in the streets of ${OFFICE_RULES[election.office].city ? CITY_NAME[OFFICE_RULES[election.office].city!] : 'the whole country'}. 🎉`
          : `The ${OFFICE_RULES[election.office].title} election ended with no candidates. Democracy is on leave. 🫠`,
        OFFICE_RULES[election.office].city,
      ),
      ...(candidates
        ? [
            db
              // A new term starts clean: whoever wins a state's seat is not impeached.
              .prepare(`UPDATE civic_policies SET ${election.office}_uid = ?, ${election.office}_term_ends = ?, ${election.office}_strikes = 0, ${OFFICE_RULES[election.office].city ? `${election.office}_suspended_until = NULL, ` : ''}updated_at = ? WHERE id = 1`)
              // In office until the polls next close.
              .bind(candidates.uid, nextElectionEnds(now), now),
          ]
        : []),
    ]);
    const title = OFFICE_RULES[election.office].title;
    // On record only: the election's own announcement tells everyone.
    if (candidates) {
      await gazette(env, ctx, [{ uid: candidates.uid, office: election.office, kind: 'elected', icon: '🗳️', text: `${handle(winner?.username)} is the new ${title}, elected with ${candidates.votes} vote${candidates.votes === 1 ? '' : 's'}.` }], false);
    }
    results.push({ office: election.office, winner: winner?.username ?? null, votes: candidates?.votes ?? 0 });
  }
  if (results.length) {
    const lines = results.map((r) => r.winner ? `${handle(r.winner)} is ${OFFICE_RULES[r.office].title} (${r.votes} vote${r.votes === 1 ? '' : 's'})` : `nobody ran for ${OFFICE_RULES[r.office].title}`);
    await announceElections(
      env, ctx, 'result', results,
      results.length === 1 ? `🗳️ ${OFFICE_RULES[results[0].office].title} election result` : '🗳️ Election results',
      `${listOf(lines)}.`.replace(/^./, (c) => c.toUpperCase()),
    ).catch(() => {});
  }
  const vacated = await vacateSeats(db, now);
  // The winners take their seats in the Government Forum and whoever they replaced (or left an empty seat) leaves it.
  if (expired.results.length || vacated) await syncForum(db, now).catch((error) => console.error('forum sync failed', error));
}

/**
 * A term ends when the polls next close. Whoever nobody beat at those polls doesn't stay on: if nobody ran (or nobody
 * filed at all, so there was no race), the seat is empty until the next election. Returns how many were emptied.
 */
async function vacateSeats(db: D1Database, now: number): Promise<number> {
  const close = pollsCloseAt(now);
  // Terms won under an older calendar end on the next close of today's, not on a day with no polls.
  await db.batch(OFFICE_LIST.map((office) =>
    db.prepare(`UPDATE civic_policies SET ${office}_term_ends = ?1 WHERE id = 1 AND ${office}_term_ends > ?2 AND ${office}_term_ends != ?1`).bind(close, now)));
  const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
  const over = OFFICE_LIST.filter((office) => policy?.[`${office}_uid`] && Number(policy[`${office}_term_ends`] ?? 0) <= now);
  let emptied = 0;
  for (const office of over) {
    const uid = policy![`${office}_uid`] as string;
    const out = await db
      .prepare(`UPDATE civic_policies SET ${office}_uid = NULL, ${office}_term_ends = NULL, ${office}_strikes = 0, ${OFFICE_RULES[office].city ? `${office}_suspended_until = NULL, ` : ''}updated_at = ?1 WHERE id = 1 AND ${office}_uid = ?2 AND COALESCE(${office}_term_ends, 0) <= ?1 RETURNING id`)
      .bind(now, uid)
      .first();
    if (!out) continue;
    emptied++;
    const who = (await usernames(db, [uid])).get(uid);
    await postFeed(db, uid, 'election', '🪑',
      `${handle(who)}’s term as ${OFFICE_RULES[office].title} is over and nobody ran for the seat. It stays empty until the next election, ${pollsWhen(now)}.`,
      OFFICE_RULES[office].city);
  }
  return emptied;
}

type PolicyRow = Record<string, string | number | null>;

/** The laws an office holder can change, as the gazette words them: who sets each, and its column in civic_policies. */
const GAZETTE_LAWS = {
  taxRate: { column: 'tax_rate', office: 'president', icon: '💰', label: 'income tax', unit: '%' },
  loanRate: { column: 'loan_rate', office: 'president', icon: '🏦', label: 'bank loan interest', unit: '%' },
  transferFee: { column: 'transfer_fee', office: 'president', icon: '💸', label: 'the bank transfer fee', unit: '%' },
  federalCut: { column: 'federal_cut', office: 'president', icon: '🏛️', label: 'the federal cut of state revenue', unit: '%' },
  airSubsidy: { column: 'air_subsidy', office: 'president', icon: '✈️', label: 'the subsidy on air fares', unit: '%' },
  railSubsidy: { column: 'rail_subsidy', office: 'president', icon: '🚆', label: 'the subsidy on train fares', unit: '%' },
  patrols: { column: 'patrols', office: 'igp', icon: '🚓', label: 'street patrols', unit: '%' },
  jailMinutes: { column: 'jail_minutes', office: 'igp', icon: '⛓️', label: 'jail terms', unit: ' min' },
  finePct: { column: 'fine_pct', office: 'efcc', icon: '⚖️', label: 'fines on thieves', unit: '%' },
  reportHours: { column: 'report_hours', office: 'efcc', icon: '🕵🏾', label: 'the deadline to report a theft', unit: ' hours' },
  caseCooldownMin: { column: 'case_cooldown_min', office: 'efcc', icon: '📁', label: 'the wait before someone can be investigated again', unit: ' minutes' },
} as const satisfies Record<string, { column: string; office: PoliticalOffice; icon: string; label: string; unit: string }>;

/** Each city's okada ban: the law's name, its column, and the office that signs it. */
const OKADA_BANS = CIVIC_CITIES.map((city) => ({ city, key: OKADA_BAN_LAW[city], column: `okada_ban_${city}`, office: CITY_HEAD[city] }));

/** Whether the president has impeached whoever runs this city, for now. */
const suspended = (policy: PolicyRow | null | undefined, city: CivicCity) => suspendedUntil(policy, CITY_HEAD[city]) > 0;
/** The city this player runs, as governor or FCT Minister. An impeached governor runs nothing until the suspension ends. */
const cityOf = (policy: PolicyRow | null | undefined, uid: string): CivicCity | undefined => CIVIC_CITIES.find((city) => policy?.[`${CITY_HEAD[city]}_uid`] === uid && !suspended(policy, city));
/** Whether the president runs this state: its seat is empty, or its governor is impeached. */
const presidentRuns = (policy: PolicyRow | null | undefined, city: CivicCity) => !policy?.[`${CITY_HEAD[city]}_uid`] || suspended(policy, city);
/**
 * The state this player runs: as its governor, or as the president while the seat is empty or its governor impeached
 * (`wanted` picks which state; a state without a government is managed by the president).
 */
const runsCity = (policy: PolicyRow | null | undefined, uid: string, wanted?: string): CivicCity | undefined => {
  const own = cityOf(policy, uid);
  if (own) return own;
  if (policy?.president_uid !== uid) return undefined;
  return CIVIC_CITIES.find((c) => c === wanted && presidentRuns(policy, c));
};
/** The office a player acts as in a state: its governor, or the president standing in. */
const actingAs = (policy: PolicyRow | null | undefined, uid: string, city: CivicCity): PoliticalOffice => (cityOf(policy, uid) === city ? CITY_HEAD[city] : 'president');
/** The offices that can grant a pardon or share palliatives: the president and whoever runs a city (not while impeached). */
const EXECUTIVES: PoliticalOffice[] = ['president', ...CIVIC_CITIES.map((city) => CITY_HEAD[city])];
const executiveOf = (policy: PolicyRow | null | undefined, uid: string) => EXECUTIVES.find((o) => policy?.[`${o}_uid`] === uid && !suspendedUntil(policy, o));

const findPlayer = (db: D1Database, target: string) =>
  db.prepare('SELECT uid, username FROM players WHERE uid = ? OR username = ?').bind(target, target.replace(/^@/, '').toLowerCase()).first<{ uid: string; username: string | null }>();

/**
 * Whether this player is in the race, and how many times they have pulled out of it. The count numbers their filings and
 * withdrawals in the ledger: a repeat of one is paid once, and filing again after pulling out is a new charge.
 */
const candidacy = async (db: D1Database, raceId: number, uid: string) =>
  (await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM civic_candidates WHERE election_id = ?2 AND uid = ?1) AS running,
              (SELECT COUNT(*) FROM ledger WHERE uid = ?1 AND client_id >= ?3 AND client_id < ?4) AS withdrawals`,
    )
    // Every client id that starts 'civic-withdraw:<race>:' (';' is the character after ':').
    .bind(uid, raceId, `civic-withdraw:${raceId}:`, `civic-withdraw:${raceId};`)
    .first<{ running: number; withdrawals: number }>()) ?? { running: 0, withdrawals: 0 };

/** When this player last used a power that has a waiting time. */
const lastUsed = async (db: D1Database, uid: string, action: CivicCooldown) =>
  (await db.prepare('SELECT at FROM civic_cooldowns WHERE uid = ? AND action = ?').bind(uid, action).first<{ at: number }>())?.at ?? 0;
const usedStmt = (db: D1Database, uid: string, action: CivicCooldown, now: number) =>
  db.prepare('INSERT INTO civic_cooldowns (uid, action, at) VALUES (?, ?, ?) ON CONFLICT(uid, action) DO UPDATE SET at = excluded.at').bind(uid, action, now);

/** The president's budget as it is stored: one alloc_ column per department. */
const allocationOf = (policies: PolicyRow | null | undefined) =>
  Object.fromEntries(ALLOCATION.departments.map((d) => [d, (policies?.[`alloc_${d}`] as number | undefined) ?? ALLOCATION.defaults[d]])) as Allocation;

/** The pay list as it is stored: one salary_ column per office. They come with migration 0082: until it has run there is no pay list. */
const salariesOpen = (policies: PolicyRow | null | undefined): policies is PolicyRow => !!policies && 'salaries_paid_at' in policies;
const salariesOf = (policies: PolicyRow | null | undefined) =>
  Object.fromEntries(OFFICE_LIST.map((o) => [o, Number(policies?.[`salary_${o}`] ?? 0)])) as Salaries;

/**
 * Cron: the pay round. Once a game day whoever holds an office is paid what the President's pay list says, out of
 * the treasury. The whole bill or nothing: a treasury that cannot cover it pays nobody this round, and VDM may say so.
 */
export async function paySalaries(db: D1Database, now: number): Promise<void> {
  if (!salariesOpen(await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>())) return;
  // Claim the round first: whoever gets here first pays it, once.
  const round = await db
    .prepare('UPDATE civic_policies SET salaries_paid_at = ?1 WHERE id = 1 AND COALESCE(salaries_paid_at, 0) <= ?2 RETURNING *')
    .bind(now, now - SALARY.everyMs)
    .first<PolicyRow>();
  if (!round) return;
  const pay = salariesOf(round);
  const due = OFFICE_LIST.flatMap((office) => {
    const uid = round[`${office}_uid`] as string | null;
    return uid && pay[office] > 0 ? [{ office, uid, amount: pay[office] }] : [];
  });
  // A governor is paid by their own state, everyone else by the federal treasury. Each bill is paid whole or not at all.
  const stateOf = (office: PoliticalOffice) => CIVIC_CITIES.find((c) => CITY_HEAD[c] === office);
  const federal = due.filter((d) => !stateOf(d.office));
  const fedBill = federal.reduce((n, d) => n + d.amount, 0);
  const paid: typeof due = [];
  if (fedBill) {
    const ok = await db.prepare('UPDATE civic_policies SET treasury = treasury - ?1 WHERE id = 1 AND treasury >= ?1 RETURNING treasury').bind(fedBill).first();
    if (ok) {
      paid.push(...federal);
      // Paid on time: now and then VDM gives credit, and drags a President on a fat salary in the same breath.
      const president = round.president_uid as string | null;
      if (president && rand() < GOV_RANT.praiseChance) {
        const who = official('president', (await usernames(db, [president])).get(president));
        const fat = pay.president >= SALARY.fat ? { about: 'fatPayList' as const, matter: { who, amount: naira(pay.president) }, uid: president } : null;
        const praise = await vdmGov(db, president, 'salaryPaid', { who, amount: naira(fedBill), n: federal.length }, null, true, { but: fat, seed: `salaries:${now}` });
        if (praise.length) await db.batch(praise).catch(() => {});
      }
    } else {
      const president = round.president_uid as string | null;
      const who = president ? official('president', (await usernames(db, [president])).get(president)) : 'Aso Rock';
      const rant = await vdmGov(db, president, 'unpaid', { who, amount: naira(fedBill) });
      if (rant.length) await db.batch(rant).catch(() => {});
    }
  }
  // A governor takes their share of the president's maximum, and one round never takes more than a slice of the state's money.
  const { states } = await loadStates(db);
  for (const city of CIVIC_CITIES) {
    const head = due.find((d) => d.office === CITY_HEAD[city]);
    const state = states.find((s) => s.city === city);
    // An impeached governor is not paid while the suspension lasts.
    if (!head || !state || suspended(round, city)) continue;
    const amount = governorPay(head.amount, state.payShare, state.balance);
    if (amount <= 0 || (await spendState(db, city, amount, { allowArrears: true })) === null) continue;
    paid.push({ ...head, amount });
    // A governor drawing the full maximum while the state can't pay its bills gets noticed.
    if (state.payShare === 100 && state.arrears > 0) {
      const who = official(head.office, (await usernames(db, [head.uid])).get(head.uid));
      const rant = await vdmGov(db, head.uid, 'ownPay', { who, amount: naira(amount) }, city);
      if (rant.length) await db.batch(rant).catch(() => {});
    }
  }
  if (!paid.length) return;
  await db.batch(paid.flatMap((d) => [ensureWallet(db, d.uid), ...applyStmts(db, d.uid, `salary:${d.office}:${now}`, 'salary', d.office, d.amount)]));
}

/** Every state's treasury, its bills and how its assets are holding up. Empty until migration 0085 has run. */
async function stateBoard(db: D1Database) {
  try {
    const [{ states, assets }, people] = await Promise.all([loadStates(db), peopleBoard(db, Date.now())]);
    return Object.fromEntries(states.map((s) => [s.city, {
      // Who lives there (NPC citizens and players), how they feel about it, and today's comings and goings.
      people: people[s.city] ?? null,
      balance: s.balance,
      incoming: s.incoming,
      arrears: s.arrears,
      ask: s.askAmount ? { amount: s.askAmount, at: s.askAt } : null,
      payShare: s.payShare,
      laws: Object.fromEntries(STATE_LAW_KEYS.map((k) => [k, s[k]])),
      assets: Object.fromEntries(assets.filter((a) => a.city === s.city).map((a) => [a.asset, { condition: a.condition, level: a.level }])),
    }]));
  } catch {
    return {};
  }
}

async function snapshot(db: D1Database, uid: string) {
  const joins = OFFICE_LIST.map((o) => `LEFT JOIN players ${o}_p ON ${o}_p.uid = p.${o}_uid`).join('\n       ');
  const names = OFFICE_LIST.map((o) => `${o}_p.username AS ${o}_username, ${o}_p.name AS ${o}_name`).join(', ');
  const policies = await db.prepare(`SELECT p.*, ${names} FROM civic_policies p ${joins} WHERE p.id = 1`).first<PolicyRow>();
  const holder = (o: PoliticalOffice) =>
    policies?.[`${o}_uid`]
      ? {
          uid: policies[`${o}_uid`] as string,
          username: policies[`${o}_username`] as string | null,
          name: policies[`${o}_name`] as string | null,
          // Whoever is in office stays until the next result, whatever was written down when they won.
          termEnds: pollsCloseAt(Date.now()),
          /** Impeached by the president until then: the president runs the state. */
          suspendedUntil: suspendedUntil(policies, o) || null,
          /** Money crimes in office so far this term (OFFICE_STRIKES costs the seat). */
          strikes: Number(policies[`${o}_strikes`] ?? 0),
        }
      : null;
  const races = await db
    .prepare("SELECT id, office, ends_at FROM civic_elections WHERE status = 'open' ORDER BY office")
    .all<{ id: number; office: PoliticalOffice; ends_at: number }>();
  const result: Record<string, unknown> = {};

  for (const race of races.results) {
    const tally = (where: string) =>
      `SELECT c.uid, p.username, p.name, c.support, c.last_action_at AS lastActionAt, COUNT(v.voter_uid) + (SELECT COUNT(*) FROM npc_votes nv WHERE nv.election_id = c.election_id AND nv.candidate_uid = c.uid) AS votes,
              (SELECT COUNT(*) FROM npc_votes nv WHERE nv.election_id = c.election_id AND nv.candidate_uid = c.uid) AS npcVotes
       FROM civic_candidates c
       JOIN players p ON p.uid = c.uid
       LEFT JOIN civic_votes v ON v.election_id = c.election_id AND v.candidate_uid = c.uid
       WHERE c.election_id = ?1 ${where}
       GROUP BY c.uid
       ORDER BY votes DESC, c.support DESC, COALESCE(p.username, p.name, c.uid)`;
    const [leaders, myVote, totals, out] = await Promise.all([
      db.prepare(`${tally('')} LIMIT ${BALLOT_SIZE}`).bind(race.id).all<CandidateRow>(),
      db
        .prepare('SELECT candidate_uid FROM civic_votes WHERE election_id = ? AND voter_uid = ?')
        .bind(race.id, uid)
        .first<{ candidate_uid: string }>(),
      db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM civic_candidates WHERE election_id = ?1) AS running,
                  (SELECT COUNT(*) FROM civic_votes v JOIN civic_candidates c ON c.election_id = v.election_id AND c.uid = v.candidate_uid
                   WHERE v.election_id = ?1)
                  + (SELECT COUNT(*) FROM npc_votes v JOIN civic_candidates c ON c.election_id = v.election_id AND c.uid = v.candidate_uid
                   WHERE v.election_id = ?1) AS votes`,
        )
        .bind(race.id)
        .first<{ running: number; votes: number }>(),
      // Disqualified candidates stay on the board, struck through (migrations/0115_civic_disqualified.sql).
      db
        .prepare(
          `SELECT d.uid, p.username, p.name, d.reason FROM civic_disqualified d JOIN players p ON p.uid = d.uid
           WHERE d.election_id = ? AND NOT EXISTS (SELECT 1 FROM civic_candidates c WHERE c.election_id = d.election_id AND c.uid = d.uid)
           ORDER BY d.at`,
        )
        .bind(race.id)
        .all<{ uid: string; username: string | null; name: string | null; reason: DisqualifyReason }>(),
    ]);
    const candidates = leaders.results;
    // A crowded race is cut to its leaders, but you still need your own row and the one you voted for.
    const missing = [uid, myVote?.candidate_uid].filter((u): u is string => !!u && !candidates.some((c) => c.uid === u));
    if (missing.length && (totals?.running ?? 0) > candidates.length) {
      const own = await db.prepare(tally('AND c.uid IN (?2, ?3)')).bind(race.id, missing[0], missing[1] ?? missing[0]).all<CandidateRow>();
      candidates.push(...own.results);
    }
    result[race.office] = { id: race.id, endsAt: race.ends_at, candidates, myVote: myVote?.candidate_uid ?? null, running: totals?.running ?? candidates.length, totalVotes: totals?.votes ?? 0, disqualified: out.results };
  }

  const posters = await db
    .prepare(
      `SELECT p.username, c.office FROM civic_posters c JOIN civic_elections e ON e.id = c.election_id AND e.status = 'open'
       JOIN players p ON p.uid = c.uid ORDER BY c.created_at DESC LIMIT 12`,
    )
    .all<{ username: string | null; office: PoliticalOffice }>();
  const me = await db.prepare('SELECT road_block_until, embezzled_at, created_at FROM players WHERE uid = ?').bind(uid).first<{ road_block_until: number | null; embezzled_at: number | null; created_at: number | null }>();
  const running = await db
    .prepare("SELECT e.office FROM civic_candidates c JOIN civic_elections e ON e.id = c.election_id AND e.status = 'open' WHERE c.uid = ? LIMIT 1")
    .bind(uid)
    .first<{ office: PoliticalOffice }>();
  const used = await db.prepare('SELECT action, at FROM civic_cooldowns WHERE uid = ?').bind(uid).all<{ action: CivicCooldown; at: number }>();
  const caps = await capsOf(db);
  return {
    /** The federal treasury. Each state's own is in `states`. */
    treasury: (policies?.treasury as number) ?? 0,
    states: await stateBoard(db),
    /** The president's maximum for each state tax and fee. */
    caps,
    /** Looting cases I am the looter or the EFCC chair in. */
    loot: await lootBoard(db, uid, Date.now()),
    allocation: allocationOf(policies),
    palliativeAt: (policies?.palliative_at as number | null) ?? null,
    /** The pay list the President signed, when its last round went out, and whether there is a pay list at all yet. */
    salaries: salariesOf(policies),
    salariesPaidAt: (policies?.salaries_paid_at as number | null | undefined) ?? null,
    salariesOpen: salariesOpen(policies),
    posters: posters.results.filter((p) => p.username),
    roadBlockUntil: me?.road_block_until && me.road_block_until > Date.now() ? me.road_block_until : null,
    embezzledAt: me?.embezzled_at ?? null,
    /** Ghost workers I have on a state payroll (worker/schemes.ts). */
    ghosts: await myGhosts(db, uid),
    /** When I last awarded a contract or granted a pardon. */
    cooldowns: Object.fromEntries(used.results.map((r) => [r.action, r.at])),
    /** The one post I'm running for right now. */
    runningFor: running?.office ?? null,
    /** The matter on my desk, if I run a state (worker/desk.ts). */
    desk: await deskOf(db, uid, cityOf(policies, uid), Date.now()),
    /** A new account may vote from then on. */
    voteFrom: (me?.created_at ?? 0) + VOTER_MIN_AGE_MS,
    news: await recentNews(db),
    policies: {
      taxRate: (policies?.tax_rate as number) ?? 10,
      policeFunding: (policies?.police_funding as number) ?? 50,
      patrols: (policies?.patrols as number) ?? 50,
      jailMinutes: (policies?.jail_minutes as number) ?? 20,
      finePct: (policies?.fine_pct as number) ?? 25,
      reportHours: (policies?.report_hours as number) ?? 48,
      caseCooldownMin: (policies?.case_cooldown_min as number | undefined) ?? 720,
      loanRate: (policies?.loan_rate as number) ?? LOAN.defaultRate,
      transferFee: (policies?.transfer_fee as number) ?? 0,
      federalCut: (policies?.federal_cut as number | undefined) ?? FEDERAL_CUT.default,
      airSubsidy: (policies?.air_subsidy as number | undefined) ?? 0,
      railSubsidy: (policies?.rail_subsidy as number | undefined) ?? 0,
      ...Object.fromEntries(STATE_LAW_KEYS.map((k) => [STATE_LAWS[k].capField, caps[k]])),
      ...Object.fromEntries(OKADA_BANS.map((b) => [b.key, (policies?.[b.column] as number) ?? 0])),
      ...Object.fromEntries(OFFICE_LIST.map((o) => [o, holder(o)])),
    },
    races: result,
  };
}

/** The civic policy row exists once it has been made: no need to ask on every request. */
let policyReady = false;

/** D1 now and then answers "internal error" for no fault of ours. A read is safe to ask again; a write may already have happened. */
export async function handleCivic(req: Request, env: Env, user: { uid: string; email?: string; name?: string }, ctx?: ExecutionContext): Promise<Response> {
  try {
    return await handleCivicOnce(req, env, user, ctx);
  } catch (error) {
    if (req.method === 'GET' && /D1_ERROR: internal error/i.test(String(error))) return handleCivicOnce(req, env, user, ctx);
    throw error;
  }
}

async function handleCivicOnce(req: Request, env: Env, user: { uid: string; email?: string; name?: string }, ctx?: ExecutionContext): Promise<Response> {
  const db = env.DB;
  const now = Date.now();
  // This runs every few seconds for every open Civic app: write only when something has to change.
  const seen = await db.prepare('SELECT last_seen FROM players WHERE uid = ?').bind(user.uid).first<{ last_seen: number }>();
  if (!seen || now - seen.last_seen > 5 * 60_000) {
    await db
      .prepare(
        `INSERT INTO players (uid, email, name, created_at, last_seen) VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(uid) DO UPDATE SET last_seen = ?4`,
      )
      .bind(user.uid, user.email ?? null, user.name ?? null, now)
      .run();
  }
  if (!policyReady) {
    await db.prepare('INSERT OR IGNORE INTO civic_policies (id, updated_at) VALUES (1, ?)').bind(now).run();
    policyReady = true;
  }
  await settleElections(env, now, ctx);
  await settleLoot(env, ctx, now);

  if (req.method === 'GET') return json({ snapshot: await snapshot(db, user.uid) });
  if (req.method !== 'POST') return err(405, 'Method not allowed');

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    office?: string;
    event?: string;
    candidateUid?: string;
    target?: string;
    allocation?: Partial<Allocation>;
    salaries?: Partial<Salaries>;
    taxRate?: number;
    federalCut?: number;
    caseId?: number;
    pct?: number;
    /** The governor's desk: which matter, and the option chosen (worker/desk.ts). */
    id?: number;
    choice?: string;
    accept?: boolean;
    city?: string;
    key?: string;
    value?: number;
    asset?: string;
    level?: number;
    patrols?: number;
    jailMinutes?: number;
    finePct?: number;
    reportHours?: number;
    caseCooldownMin?: number;
    loanRate?: number;
    transferFee?: number;
    airSubsidy?: number;
    railSubsidy?: number;
    okadaBanKaduna?: number;
    okadaBanAbuja?: number;
    okadaBanLagos?: number;
    okadaBanKano?: number;
    amount?: number;
    vehicle?: string;
    to?: string;
    hours?: number;
    divert?: number;
    scheme?: string;
  } | null;
  if (!body) return err(400, 'Invalid JSON');

  if (body.action === 'run') {
    if (!OFFICES.has(body.office as PoliticalOffice)) return err(400, 'Unknown office');
    const office = body.office as PoliticalOffice;
    // Filed from the Civic app or a secretariat's election desk: where you stand does not matter.
    const fee = OFFICE_RULES[office].filingFee;
    const record = await db.prepare('SELECT jailed_until, last_arrest_at FROM players WHERE uid = ?').bind(user.uid).first<{ jailed_until: number | null; last_arrest_at: number | null }>();
    if ((record?.jailed_until ?? 0) > now) return err(403, 'You can’t file for office from a police cell');
    if (record?.last_arrest_at && now - record.last_arrest_at < ARREST_BAN_MS) {
      const hours = Math.ceil((ARREST_BAN_MS - (now - record.last_arrest_at)) / 3_600_000);
      return err(403, `You were arrested recently. INEC bars you from running for another ${hours} hour${hours === 1 ? '' : 's'}`);
    }
    let race = await db
      .prepare("SELECT id, ends_at FROM civic_elections WHERE office = ? AND status = 'open'")
      .bind(office)
      .first<{ id: number; ends_at: number }>();
    if (race) {
      const alreadyRunning = await db
        .prepare('SELECT 1 AS running FROM civic_candidates WHERE election_id = ? AND uid = ?')
        .bind(race.id, user.uid)
        .first();
      if (alreadyRunning) return json({ snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
      // Disqualified from this race: out of this election only, free to run in the next one.
      const out = await db
        .prepare('SELECT reason FROM civic_disqualified WHERE election_id = ? AND uid = ?')
        .bind(race.id, user.uid)
        .first<{ reason: DisqualifyReason }>();
      if (out) return err(403, `You were disqualified from this race for ${DISQUALIFY_REASON[out.reason]}. INEC bars you from running in this election`);
      // The ballot is fixed once the polls open: nobody joins a race while it is being voted on.
      if (pollsOpen(race.ends_at, now)) return err(409, `Voting for ${OFFICE_RULES[office].title} has started, so its ballot is closed. File after the result to run in the next election`);
    }
    const other = await db
      .prepare("SELECT e.office FROM civic_candidates c JOIN civic_elections e ON e.id = c.election_id AND e.status = 'open' WHERE c.uid = ? AND e.office != ? LIMIT 1")
      .bind(user.uid, office)
      .first<{ office: PoliticalOffice }>();
    if (other) return err(409, `You are already running for ${OFFICE_RULES[other.office].title}. You can only run for one post per election`);
    const balance = await getBalance(db, user.uid);
    if (balance < fee) return err(402, `You need ₦${fee.toLocaleString()} to file for office`);
    const opening = !race;
    if (!race) {
      // The first to file opens the race for the coming polls. Whoever is in office stays there until its result.
      await db
        .prepare("INSERT OR IGNORE INTO civic_elections (office, started_at, ends_at) VALUES (?, ?, ?)")
        .bind(office, now, nextElectionEnds(now))
        .run();
      race = await db
        .prepare("SELECT id, ends_at FROM civic_elections WHERE office = ? AND status = 'open'")
        .bind(office)
        .first<{ id: number; ends_at: number }>();
    }
    if (!race) return err(409, 'Could not open the election. Try again.');
    const mine = await candidacy(db, race.id, user.uid);
    if (!mine.running) {
      await db.batch([
        // The nomination fee is the state's money.
        ...treasuryStmts(db, user.uid, `civic-run:${race.id}:${user.uid}:${mine.withdrawals}`, 'civic', `run-${office}`, fee, null, 'federal'),
        db.prepare('INSERT OR IGNORE INTO civic_candidates (election_id, uid) VALUES (?, ?)').bind(race.id, user.uid),
      ]);
      // A new race is news; the polls opening on election day is what gets the announcement (settleElections).
      if (opening) {
        const who = (await usernames(db, [user.uid])).get(user.uid);
        await postFeed(db, user.uid, 'election', '🗳️', `${handle(who)} has filed to run for ${OFFICE_RULES[office].title}. The race is open: anyone can file until the polls open ${pollsWhen(now)}.`, OFFICE_RULES[office].city).catch(() => {});
      }
    }
    return json({ snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
  }

  if (body.action === 'withdraw') {
    if (!OFFICES.has(body.office as PoliticalOffice)) return err(400, 'Unknown office');
    const office = body.office as PoliticalOffice;
    const race = await db
      .prepare("SELECT id, ends_at FROM civic_elections WHERE office = ? AND status = 'open'")
      .bind(office)
      .first<{ id: number; ends_at: number }>();
    const mine = race && (await candidacy(db, race.id, user.uid));
    if (!race || !mine?.running) return err(409, `You are not running for ${OFFICE_RULES[office].title}`);
    // The ballot is fixed once the polls open: nobody leaves a race while it is being voted on.
    if (pollsOpen(race.ends_at, now)) return err(409, `Voting for ${OFFICE_RULES[office].title} has started, so its ballot is closed. You can’t withdraw now`);
    const fee = withdrawalFee(office);
    if ((await getBalance(db, user.uid)) < fee) return err(402, `You need ${naira(fee)} to withdraw from the race`);
    const clientId = `civic-withdraw:${race.id}:${mine.withdrawals}`;
    const [charge, debit, credit, done] = treasuryStmts(db, user.uid, clientId, 'civic', `withdraw-${office}`, fee, null, 'federal');
    // Each of these happens only with the fee, so two taps at once pay once and leave once.
    const paid = 'EXISTS (SELECT 1 FROM ledger WHERE uid = ?1 AND client_id = ?2 AND applied = 0)';
    const out = await db.batch([
      charge,
      debit,
      credit,
      // Their support goes with them, and their billboards come down.
      db.prepare(`DELETE FROM civic_candidates WHERE election_id = ?3 AND uid = ?1 AND ${paid}`).bind(user.uid, clientId, race.id),
      db.prepare(`DELETE FROM civic_posters WHERE election_id = ?3 AND uid = ?1 AND ${paid}`).bind(user.uid, clientId, race.id),
      // The last one out closes the race, so the polls never open on an empty ballot. Whoever files next opens a new one.
      db
        .prepare(`DELETE FROM civic_elections WHERE id = ?3 AND status = 'open' AND ${paid} AND NOT EXISTS (SELECT 1 FROM civic_candidates WHERE election_id = ?3)`)
        .bind(user.uid, clientId, race.id),
      done,
    ]);
    if (out[3].meta.changes) {
      const who = (await usernames(db, [user.uid])).get(user.uid);
      const title = OFFICE_RULES[office].title;
      await postFeed(db, user.uid, 'election', '🏳️', `${handle(who)} has pulled out of the race for ${title}. INEC kept the nomination fee and charged ${naira(fee)} more for the paperwork.${out[5].meta.changes ? ' Nobody is left in the race.' : ''}`, OFFICE_RULES[office].city).catch(() => {});
    }
    return json({ snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
  }

  if (body.action === 'campaign') {
    if (!OFFICES.has(body.office as PoliticalOffice) || !EVENTS.has(body.event as CampaignEvent)) return err(400, 'Unknown campaign event');
    const office = body.office as PoliticalOffice;
    const event = body.event as CampaignEvent;
    const race = await db
      .prepare("SELECT id FROM civic_elections WHERE office = ? AND status = 'open'")
      .bind(office)
      .first<{ id: number }>();
    if (!race) return err(409, 'There is no open election for this office');
    const candidate = await db
      .prepare('SELECT last_action_at FROM civic_candidates WHERE election_id = ? AND uid = ?')
      .bind(race.id, user.uid)
      .first<{ last_action_at: number }>();
    if (!candidate) return err(403, 'You are not a candidate in this election');
    if (candidate.last_action_at && now - candidate.last_action_at < CAMPAIGN_COOLDOWN_MS) return err(429, 'You can hold one campaign event every 10 minutes');
    const { cost, support } = CAMPAIGN_EVENTS[event];
    if ((await getBalance(db, user.uid)) < cost) return err(402, `You need ₦${cost.toLocaleString()} for this event`);
    const who = (await usernames(db, [user.uid])).get(user.uid);
    const title = OFFICE_RULES[office].title;
    const charge = applyStmts(db, user.uid, `civic-${event}:${race.id}:${user.uid}:${Math.floor(now / CAMPAIGN_COOLDOWN_MS)}`, 'civic', event, -cost);
    const boost = (n: number) =>
      db.prepare('UPDATE civic_candidates SET support = MIN(100, support + ?), last_action_at = ? WHERE election_id = ? AND uid = ?').bind(n, now, race.id, user.uid);
    let outcome: 'ok' | 'fled' | 'stung' = 'ok';

    if (event === 'buyVotes') {
      const laws = await loadLaws(db);
      const budget = allocationOf(await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>());
      // A well-funded EFCC (the president's allocation) catches more vote buyers.
      if (rand() < Math.max(0.05, CHAOS.stingChance + laws.finePct / 1000 + ALLOCATION.efccEdge(budget.efcc))) {
        // EFCC sting: disqualified from this race (their votes go with them, their name stays struck through), fined and jailed.
        outcome = 'stung';
        await db.batch([
          ...charge,
          db.prepare(`INSERT OR IGNORE INTO civic_disqualified (election_id, uid, reason, at) VALUES (?, ?, 'vote_buying', ?)`).bind(race.id, user.uid, now),
          db.prepare('DELETE FROM civic_candidates WHERE election_id = ? AND uid = ?').bind(race.id, user.uid),
        ]);
        const fine = await transfer(db, user.uid, null, CHAOS.stingFine, 'efcc_fine', '', `sting:${race.id}:${user.uid}`);
        await recordExhibits(db, user.uid, `sting:${race.id}:${now}`, `EFCC sting · buying votes in the ${title} race`, [fineItem(fine)], now);
        await jail(db, user.uid, laws.jailMinutes, `Vote buying · caught in an EFCC sting in the ${title} race`);
        const { until } = await searchPhone(env, user.uid, 'efcc', laws.jailMinutes);
        await postFeed(db, user.uid, 'election', '🧧', `EFCC STING! ${title} candidate ${handle(who)} was caught sharing ₦ notes and bags of rice to voters. Disqualified from this race, ${naira(fine)} fine, and a free ride in a Black Maria. 🚓`, OFFICE_RULES[office].city);
        return json({ outcome, until, snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
      }
      await db.batch([...charge, boost(support)]);
    } else if (event === 'crowd' && rand() < CHAOS.crowdFleeChance) {
      outcome = 'fled';
      await db.batch([...charge, boost(CHAOS.crowdFledSupport)]);
      await postFeed(db, user.uid, 'election', '🏃🏾', `${title} candidate ${handle(who)}’s hired campaign crowd ran away the moment the ₦2k ran out. Somebody carried the canopy too. 😂`, OFFICE_RULES[office].city);
    } else if (event === 'posters') {
      await db.batch([
        ...charge,
        boost(support),
        db.prepare('INSERT OR REPLACE INTO civic_posters (election_id, uid, office, created_at) VALUES (?, ?, ?, ?)').bind(race.id, user.uid, office, now),
      ]);
    } else {
      await db.batch([...charge, boost(support)]);
      if (event === 'crowd') await postFeed(db, user.uid, 'election', '📣', `${OFFICE_RULES[office].city ? CITY_NAME[OFFICE_RULES[office].city!] : 'The whole country'} stood still for ${handle(who)}’s ${title} rally. Thousands of “supporters” in matching caps. 🧢`, OFFICE_RULES[office].city);
    }
    return json({ outcome, snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
  }

  if (body.action === 'vote') {
    if (!OFFICES.has(body.office as PoliticalOffice) || typeof body.candidateUid !== 'string') return err(400, 'Invalid vote');
    const race = await db
      .prepare("SELECT id, ends_at FROM civic_elections WHERE office = ? AND status = 'open'")
      .bind(body.office)
      .first<{ id: number; ends_at: number }>();
    if (!race) return err(409, 'There is no open election for this office');
    if (!pollsOpen(race.ends_at, now)) return err(409, `The polls open ${pollsWhen(now)}. Until then candidates can only campaign`);
    if (body.candidateUid === user.uid) return err(400, 'You cannot vote for yourself');
    const voter = await db.prepare('SELECT created_at FROM players WHERE uid = ?').bind(user.uid).first<{ created_at: number }>();
    const voteFrom = (voter?.created_at ?? now) + VOTER_MIN_AGE_MS;
    if (voteFrom > now) return err(403, `New accounts can vote once they are 12 hours old. You can vote in ${banLeft(voteFrom - now)}`);
    const candidate = await db
      .prepare('SELECT 1 AS candidate FROM civic_candidates WHERE election_id = ? AND uid = ?')
      .bind(race.id, body.candidateUid)
      .first();
    if (!candidate) return err(400, 'That player is not a candidate');
    await db
      .prepare(
        `INSERT INTO civic_votes (election_id, voter_uid, candidate_uid, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(election_id, voter_uid) DO UPDATE SET candidate_uid = excluded.candidate_uid, updated_at = excluded.updated_at`,
      )
      .bind(race.id, user.uid, body.candidateUid, now)
      .run();
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'roadProject') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = runsCity(policy, user.uid, body.city);
    if (!city) return err(403, 'Only the governor or the FCT Minister can commission road projects');
    const office = actingAs(policy, user.uid, city);
    if (typeof body.target !== 'string') return err(400, 'Pick a street to dig up');
    const target = await findPlayer(db, body.target);
    if (!target?.username) return err(404, 'No such player');
    if (target.uid === user.uid) return err(400, 'You can’t dig up your own street (well, you can, but why?)');
    const { cost, hours } = TREASURY.roadProject;
    if (!(await houseOpen(db, city))) return err(403, 'Government House is in ruins. Repair it before you can work');
    // A city's government spends only its own state's treasury, and nothing while the state is in arrears.
    const done = await spendState(db, city, cost);
    if (done === null) return err(402, `${CITY_NAME[city]}’s treasury needs ${naira(cost)} free of arrears for a road project`);
    const until = now + hours * 3600_000;
    const who = (await usernames(db, [user.uid])).get(user.uid);
    await db.batch([
      db.prepare('UPDATE players SET road_block_until = ? WHERE uid = ?').bind(until, target.uid),
      feedStmt(db, target.uid, 'politics', '🚧', `${official(office, who)} has flagged off an “urgent road project” on ${handle(target.username)}’s street. Excavators arrived within the hour. Pure coincidence, says ${city === 'abuja' ? 'the FCTA' : city === 'lagos' ? 'Alausa' : 'Government House'}. 🤔`, city),
      ...(await vdmGov(db, user.uid, 'roadProject', { who: official(office, who), other: handle(target.username) }, city)),
    ]);
    await gazette(env, ctx, [{ uid: user.uid, office, kind: 'project', icon: '🚧', text: `${official(office, who)} dug up ${handle(target.username)}’s street: double fares there for ${hours} hours.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  // An office holder rode in the state's helicopter, convoy or jet (src/game/fares.ts): the treasury pays the fare.
  // The president draws on the federal treasury, a city's government on its own state's.
  if (body.action === 'officialTrip') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const office = executiveOf(policy, user.uid);
    if (!office) return err(403, 'Only the president, the governor or the FCT Minister travel on the treasury');
    const amount = Math.floor(Number(body.amount));
    if (!(amount > 0) || amount > STATE_TRIP_MAX) return err(400, 'Invalid trip cost');
    const city = cityOf(policy, user.uid);
    const paid = office === 'president' || !city
      ? await db.prepare('UPDATE civic_policies SET treasury = treasury - ?1 WHERE id = 1 AND treasury >= ?1 RETURNING treasury').bind(amount).first()
      : await spendState(db, city, amount);
    if (!paid) return err(402, 'The budget can’t cover that trip right now');
    // The blogs follow the state's fleet: where the jet is going, and how many trips that makes today.
    const vehicle: StateVehicle = body.vehicle === 'jet' || body.vehicle === 'helicopter' ? body.vehicle : 'cab';
    const dest = vehicle === 'jet' ? CIVIC_CITIES.find((c) => c === body.to) ?? null : null;
    await reportTrip(db, { uid: user.uid, office: office as ExecutiveOffice, username: (await usernames(db, [user.uid])).get(user.uid), vehicle, dest, cost: amount });
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'palliative') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow & { treasury: number; palliative_at: number | null }>();
    const sharedAs = executiveOf(policy, user.uid);
    if (!policy || !sharedAs) return err(403, 'Only the president, the governor or the FCT Minister can share palliatives');
    const p = TREASURY.palliative;
    // A game from before the amount could be chosen sends none: it shares what it always did.
    const size = body.amount ?? 5_000;
    if (!inRange(size, p.sizes)) return err(400, 'Choose how much each person gets');
    // The share of it the one sharing keeps for themselves (game/civic.ts SCHEMES.divert): none unless they ask.
    const divert = body.divert ?? 0;
    if (divert && !inRange(divert, [1, ...SCHEMES.divert.shares])) return err(400, 'Choose how much to divert');
    if (policy.palliative_at && now - policy.palliative_at < p.cooldownHours * 3600_000) return err(429, 'Palliatives were shared recently');
    const { results: people } = await db
      .prepare('SELECT uid FROM players WHERE last_seen > ? AND username IS NOT NULL ORDER BY last_seen DESC LIMIT ?')
      .bind(now - 24 * 3600_000, p.maxPlayers)
      .all<{ uid: string }>();
    // One round can share out the budget it comes from and no more: the president's palliatives budget, or the
    // city's own share when its government is the one sharing.
    const city = sharedAs === 'president' ? runsCity(policy, user.uid, body.city) : cityOf(policy, user.uid)!;
    if (city && !(await houseOpen(db, city))) return err(403, 'Government House is in ruins. Repair it before you can work');
    const budget = city
      ? ((await db.prepare('SELECT balance FROM state_treasuries WHERE city = ? AND arrears = 0').bind(city).first<{ balance: number }>())?.balance ?? 0)
      : ALLOCATION.budget(policy.treasury, allocationOf(policy).welfare);
    const each = Math.min(size, Math.floor(budget / Math.max(1, people.length)));
    if (each < 500) return err(402, `${city ? `${CITY_NAME[city]}’s treasury` : 'The palliatives budget'} is too small to share anything`);
    const total = each * people.length;
    const locked = city
      ? await spendState(db, city, total)
      : await db.prepare('UPDATE civic_policies SET treasury = treasury - ?1, palliative_at = ?2 WHERE id = 1 AND treasury >= ?1 RETURNING treasury').bind(total, now).first();
    if (!locked) return err(409, 'The treasury changed. Try again');
    if (city) await db.prepare('UPDATE civic_policies SET palliative_at = ? WHERE id = 1').bind(now).run();
    const who = (await usernames(db, [user.uid])).get(user.uid);
    // What each person really gets once the diverted share is gone, and what lands in the warehouse.
    const given = each - Math.floor((each * divert) / 100);
    const diverted = (each - given) * people.length;
    await db.batch([
      ...people.flatMap((x) => applyStmts(db, x.uid, `palliative:${now}`, 'palliative', 'state', given)),
      ...(diverted ? applyStmts(db, user.uid, `divert:${now}`, 'embezzle', sharedAs, diverted) : []),
      feedStmt(db, user.uid, 'politics', '🍚', `${official(sharedAs, who)} shared ${naira(given)} palliatives to ${people.length} people. Some say it was rice, some say it was noodles, everybody says it was small. 😅`, OFFICE_RULES[sharedAs].city),
      ...(await vdmGov(db, user.uid, given >= GOV_RANT.generousPalliative ? 'palliativeBig' : 'palliative', { who: official(sharedAs, who), amount: naira(given), n: people.length }, OFFICE_RULES[sharedAs].city)),
    ]);
    await gazette(env, ctx, [{ uid: user.uid, office: sharedAs, kind: 'palliative', icon: '🍚', text: `${official(sharedAs, who)} shared palliatives: ${naira(given)} each to ${people.length} ${people.length === 1 ? 'person' : 'people'}.` }]);
    // VDM may get the video of the rest in a warehouse: it all goes back, with a fine on top.
    let exposed = false;
    if (diverted && rand() < SCHEMES.divert.exposed(divert)) {
      exposed = true;
      const back = await transfer(db, user.uid, null, diverted, 'loot_return', '', `divert-back:${user.uid}:${now}`);
      const fine = await transfer(db, user.uid, null, SCHEMES.divert.fine, 'efcc_fine', '', `divert-fine:${user.uid}:${now}`);
      await recordExhibits(db, user.uid, `divert:${now}`, 'Caught diverting palliatives', [
        { kind: 'loot', icon: '🍚', label: 'Diverted palliatives taken back', value: back },
        fineItem(fine),
      ], now);
      await db.batch([
        potStmt(db, city ?? null, back),
        feedStmt(db, user.uid, 'politics', '📹', `EXPOSED: a video shows ${naira(diverted)} of palliatives from ${official(sharedAs, who)} stacked in a private warehouse. ${naira(back)} recovered and a ${naira(fine)} fine. The rice was “for safekeeping”. 📹`, OFFICE_RULES[sharedAs].city),
        ...(await vdmGov(db, user.uid, 'divert', { who: official(sharedAs, who), amount: naira(diverted) }, OFFICE_RULES[sharedAs].city, true)),
      ]);
      await gazette(env, ctx, [{ uid: user.uid, office: sharedAs, kind: 'scandal', icon: '📹', text: `${official(sharedAs, who)} was caught diverting ${naira(diverted)} of palliatives and paid it back.` }]);
    }
    return json({ each: given, diverted, exposed, people: people.length, snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
  }

  if (body.action === 'contract') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = runsCity(policy, user.uid, body.city);
    if (!city) return err(403, 'Only the governor or the FCT Minister can award contracts');
    const office = actingAs(policy, user.uid, city);
    const c = TREASURY.contract;
    const amount = body.amount;
    if (!inRange(amount, c.sizes)) return err(400, 'Pick a contract size');
    if (typeof body.target !== 'string') return err(400, 'Pick a contractor');
    const target = await findPlayer(db, body.target);
    if (!target?.username) return err(404, 'No such player');
    if (target.uid === user.uid) return err(400, 'You can’t award a contract to yourself');
    if (now - (await lastUsed(db, user.uid, 'contract')) < c.cooldownHours * 3600_000) return err(429, 'You awarded a contract recently. The tenders board is still stamping it');
    if (!(await houseOpen(db, city))) return err(403, 'Government House is in ruins. Repair it before you can work');
    // Contracts come out of the city's own treasury, and the state must be out of arrears.
    const paid = await spendState(db, city, amount);
    if (paid === null) return err(402, `${CITY_NAME[city]}’s treasury needs ${naira(amount)} free of arrears for this contract`);
    const who = (await usernames(db, [user.uid])).get(user.uid);
    await db.batch([
      usedStmt(db, user.uid, 'contract', now),
      ...applyStmts(db, target.uid, `contract:${user.uid}:${now}`, 'contract', office, amount),
      feedStmt(db, target.uid, 'politics', '📝', `${official(office, who)} has awarded a ${naira(amount)} contract in ${CITY_NAME[city]} to ${handle(target.username)}. The tender was “very competitive”. One company applied. 😌`, city),
      ...(await vdmGov(db, user.uid, 'contract', { who: official(office, who), amount: naira(amount), other: handle(target.username) }, city)),
    ]);
    await gazette(env, ctx, [{ uid: user.uid, office, kind: 'project', icon: '📝', text: `${official(office, who)} gave ${handle(target.username)} a ${naira(amount)} contract in ${CITY_NAME[city]}.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'pardon') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const office = executiveOf(policy, user.uid);
    if (!office) return err(403, 'Only the president, the governor or the FCT Minister can grant a pardon');
    if (typeof body.target !== 'string') return err(400, 'Pick somebody to pardon');
    const target = await findPlayer(db, body.target);
    if (!target?.username) return err(404, 'No such player');
    if (target.uid === user.uid) return err(400, 'You can’t pardon yourself');
    if (now - (await lastUsed(db, user.uid, 'pardon')) < TREASURY.pardon.cooldownHours * 3600_000) return err(429, 'You granted a pardon recently');
    const pardonCity = cityOf(policy, user.uid);
    if (pardonCity && !(await houseOpen(db, pardonCity))) return err(403, 'Government House is in ruins. Repair it before you can work');
    const freed = await db.prepare('UPDATE players SET jailed_until = NULL WHERE uid = ? AND jailed_until > ? RETURNING uid').bind(target.uid, now).first();
    if (!freed) return err(409, `${handle(target.username)} is not in a cell`);
    const who = (await usernames(db, [user.uid])).get(user.uid);
    await db.batch([
      usedStmt(db, user.uid, 'pardon', now),
      feedStmt(db, target.uid, 'politics', '🕊️', `${official(office, who)} has granted ${handle(target.username)} a pardon. Straight out of the cell and into a waiting convoy. The victims were not consulted. 🕊️`, OFFICE_RULES[office].city),
      ...(await vdmGov(db, user.uid, 'pardon', { who: official(office, who), other: handle(target.username) }, OFFICE_RULES[office].city)),
    ]);
    const freeing = notifyPlayer(env, target.uid, { t: 'released', by: who ?? 'someone', amount: 0, pardon: OFFICE_RULES[office].title });
    if (ctx) ctx.waitUntil(freeing);
    else await freeing;
    await gazette(env, ctx, [{ uid: user.uid, office, kind: 'law', icon: '🕊️', text: `${official(office, who)} pardoned ${handle(target.username)}.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'embezzle') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const office = OFFICE_LIST.find((o) => policy?.[`${o}_uid`] === user.uid);
    if (!office || !policy) return err(403, 'Only office holders can reach the treasury');
    if (suspendedUntil(policy, office)) return err(403, 'You are impeached. The treasury is locked to you until the president lets you back');
    const e = TREASURY.embezzle;
    const mine = await db.prepare('SELECT embezzled_at FROM players WHERE uid = ?').bind(user.uid).first<{ embezzled_at: number | null }>();
    if (mine?.embezzled_at && now - mine.embezzled_at < e.cooldownHours * 3600_000) return err(429, 'Lie low. The auditors are asking questions');
    // A governor reaches into their own state's treasury; everyone else into the federal one.
    const stateCity = cityOf(policy, user.uid);
    const pot = stateCity
      ? ((await db.prepare('SELECT balance FROM state_treasuries WHERE city = ?').bind(stateCity).first<{ balance: number }>())?.balance ?? 0)
      : (policy.treasury as number);
    const amount = Math.min(e.cap, Math.floor(pot * e.share));
    if (amount < 1_000) return err(402, 'There is nothing in the treasury to “borrow”');
    await db.prepare('UPDATE players SET embezzled_at = ? WHERE uid = ?').bind(now, user.uid).run();
    // The EFCC chair rarely investigates themselves; a different chair is extra keen.
    const chance = office === 'efcc' ? 0.15 : Math.max(0.05, e.catchChance + (policy.efcc_uid ? 0.2 : 0) + ALLOCATION.efccEdge(allocationOf(policy).efcc));
    // With an EFCC chair in office, they decide (worker/loot.ts); without one it is down to the odds.
    const chairUid = policy.efcc_uid && policy.efcc_uid !== user.uid ? (policy.efcc_uid as string) : null;
    if (!chairUid && rand() < chance) {
      // A strike (worker/loot.ts): a fine and a warning, and the seat and a cell on the last one.
      const hit = await removeFromOffice(
        env, ctx, user.uid, office, `Caught trying to move ${naira(amount)} from the treasury`, now,
        `SCANDAL: ${OFFICE_RULES[office].title} {who} was caught trying to move ${naira(amount)} from the treasury. Removed from office, {fine} fine, and EFCC custody. The office is now vacant!`,
        amount,
      );
      return json({ caught: true, removed: hit.removed, strikes: hit.strikes, snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
    }
    const taken = stateCity
      ? await spendState(db, stateCity, amount, { allowArrears: true })
      : await db.prepare('UPDATE civic_policies SET treasury = treasury - ?1 WHERE id = 1 AND treasury >= ?1 RETURNING treasury').bind(amount).first();
    if (!taken) return err(409, 'The treasury changed. Try again');
    await db.batch([
      // With a chair in office the loot is frozen in their case until it closes (worker/loot.ts); without one it is yours now.
      ...(chairUid ? [] : applyStmts(db, user.uid, `embezzle:${now}`, 'embezzle', office, amount)),
      feedStmt(db, null, 'politics', '🐍', `${naira(amount)} has gone missing from the state treasury. Officials say a snake swallowed it. Investigations ongoing. 🐍`),
      ...(await vdmGov(db, null, 'snake', { amount: naira(amount) })),
    ]);
    // Nobody is named: they got away with it.
    await gazette(env, ctx, [{ uid: null, office: null, kind: 'scandal', icon: '🐍', text: `${naira(amount)} is missing from the treasury. A snake swallowed it.` }]);
    const caseId = chairUid ? await openLootCase(env, ctx, user.uid, chairUid, office, stateCity ?? null, amount, now).catch(() => null) : null;
    // No case could be opened to hold it: the loot is theirs after all.
    if (chairUid && !caseId) await db.batch(applyStmts(db, user.uid, `embezzle:${now}`, 'embezzle', office, amount));
    return json({ caught: false, amount, caseId, snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
  }

  // The other ways into the treasury (worker/schemes.ts). Like the snake, each reaches the schemer's own pot: their
  // state's treasury for whoever runs a state, the federal one for everyone else.
  if (body.action === 'scheme') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const office = OFFICE_LIST.find((o) => policy?.[`${o}_uid`] === user.uid && !suspendedUntil(policy, o));
    if (!office || !policy) return err(403, 'Only office holders can reach the treasury');
    const city = cityOf(policy, user.uid) ?? null;
    if (body.scheme === 'ghost' || body.scheme === 'noGhost') {
      if (!city) return err(403, 'Only a governor has a state payroll to pad');
      const out = await setGhosts(db, user.uid, city, body.scheme === 'ghost', now);
      if ('error' in out) return err(out.status, out.error);
      return json({ outcome: out.outcome, amount: out.amount, snapshot: await snapshot(db, user.uid) });
    }
    const scheme = body.scheme === 'front' || body.scheme === 'bdc' || body.scheme === 'bags' ? body.scheme : null;
    if (!scheme) return err(400, 'Unknown scheme');
    if (scheme === 'bags' && !executiveOf(policy, user.uid)) return err(403, 'Only the president and the governors have a state jet');
    if (city && !(await houseOpen(db, city))) return err(403, 'Government House is in ruins. Repair it before you can work');
    const wait = SCHEMES[scheme].cooldownHours * 3600_000 - (now - (await lastUsed(db, user.uid, scheme)));
    if (wait > 0) return err(429, `Lie low for another ${banLeft(wait)}`);
    await usedStmt(db, user.uid, scheme, now).run();
    const out = await runScheme(env, ctx, { uid: user.uid, office, city }, scheme, body.amount, now);
    if ('error' in out) {
      // Nothing happened: the waiting time is not used up.
      await db.prepare('DELETE FROM civic_cooldowns WHERE uid = ? AND action = ? AND at = ?').bind(user.uid, scheme, now).run();
      return err(out.status, out.error);
    }
    return json({ outcome: out.outcome, amount: out.amount, strikes: 'strikes' in out ? out.strikes : undefined, snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
  }

  // The looter offers the EFCC chair a share of the loot, or the chair decides (worker/loot.ts).
  if (body.action === 'lootOffer' || body.action === 'lootDecide') {
    const result = await lootAction(env, ctx, user.uid, body as unknown as LootAction, now);
    if ('error' in result) return err(result.status, result.error);
    return json({ outcome: result.done, strikes: 'strikes' in result ? result.strikes : undefined, snapshot: await snapshot(db, user.uid), balance: await getBalance(db, user.uid) });
  }

  // The governor answers the matter on their desk (worker/desk.ts).
  if (body.action === 'desk') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = cityOf(policy, user.uid);
    if (!city) return err(403, 'Only a governor has a desk');
    if (typeof body.id !== 'number' || typeof body.choice !== 'string') return err(400, 'Pick one of the options');
    const out = await decideDesk(env, ctx, user.uid, city, body.id, body.choice, now);
    if ('error' in out) return err(out.status, out.error);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  // The governor sets how much of an asset's full bill the state pays to keep it up.
  if (body.action === 'upkeep') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = runsCity(policy, user.uid, body.city);
    if (!city) return err(403, 'Only the governor or the FCT Minister sets the upkeep');
    if (!STATE_ASSETS.includes(body.asset as StateAsset)) return err(400, 'Unknown asset');
    if (!(UPKEEP_LEVELS as readonly number[]).includes(body.level as number)) return err(400, 'Choose an upkeep level from the list');
    await db.prepare('UPDATE state_assets SET level = ? WHERE city = ? AND asset = ?').bind(body.level, city, body.asset).run();
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  // The governor chooses what share of the president's maximum pay to take. Only the holder of the office: the president standing in is not paid.
  if (body.action === 'payShare') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = cityOf(policy, user.uid);
    if (!city) return err(403, 'Only the governor sets their own pay');
    const share = body.pct;
    if (!inRange(share, [0, 100])) return err(400, 'Choose a share between 0% and 100%');
    const was = await db.prepare('SELECT pay_share FROM state_treasuries WHERE city = ?').bind(city).first<{ pay_share: number }>();
    if (was?.pay_share === share) return err(400, 'Nothing changed');
    await db.prepare('UPDATE state_treasuries SET pay_share = ? WHERE city = ?').bind(share, city).run();
    const office = CITY_HEAD[city];
    const who = (await usernames(db, [user.uid])).get(user.uid);
    await gazette(env, ctx, [{ uid: user.uid, office, kind: 'law', icon: '💼', text: `${official(office, who)} now takes ${share}% of the maximum pay in ${CITY_NAME[city]}.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  // The state's own taxes and fees, set by its governor (or the president while the seat is empty).
  if (body.action === 'stateLaw') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = runsCity(policy, user.uid, body.city);
    if (!city) return err(403, 'Only the governor, or the president while the seat is empty, sets a state’s taxes');
    const key = STATE_LAW_KEYS.find((k) => k === body.key);
    if (!key) return err(400, 'Unknown tax or fee');
    const law = STATE_LAWS[key];
    // The governor picks a share of the president's maximum; the value stored is what that share comes to, never above the maximum.
    const cap = (await capsOf(db))[key];
    // Any whole value up to the maximum (the app's stepper); an older app sends a share of the maximum instead.
    const next = body.pct !== undefined ? (GOV_STEPS as readonly number[]).includes(body.pct) ? lawAt(cap, body.pct) : undefined : body.value;
    if (!inRange(next, [0, cap])) return err(400, 'Choose a value up to the maximum');
    const was = (await lawsOf(db, city))[key];
    if (was === next) return err(400, 'Nothing changed');
    await db.prepare(`UPDATE state_treasuries SET ${law.column} = ? WHERE city = ?`).bind(next, city).run();
    const as = actingAs(policy, user.uid, city);
    const who = (await usernames(db, [user.uid])).get(user.uid);
    await gazette(env, ctx, [{ uid: user.uid, office: as, kind: 'law', icon: '🏛️', text: `${official(as, who)} ${next > was ? 'raised' : 'cut'} ${law.title.toLowerCase()} in ${CITY_NAME[city]}: ${lawText(key, was)} → ${lawText(key, next)}.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  // An emergency repair: a lot of money for a lot of condition, at once.
  if (body.action === 'repairAsset') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = runsCity(policy, user.uid, body.city);
    if (!city) return err(403, 'Only the governor or the FCT Minister can repair state property');
    const asset = body.asset as StateAsset;
    if (!STATE_ASSETS.includes(asset)) return err(400, 'Unknown asset');
    const cost = repairCost(asset, city);
    const paid = await spendState(db, city, cost, { allowArrears: true });
    if (paid === null) return err(402, `${CITY_NAME[city]}’s treasury needs ${naira(cost)} for this repair`);
    const fixed = await db.prepare('UPDATE state_assets SET condition = MIN(100, condition + ?) WHERE city = ? AND asset = ? RETURNING condition').bind(REPAIR.condition, city, asset).first<{ condition: number }>();
    const who = (await usernames(db, [user.uid])).get(user.uid);
    await gazette(env, ctx, [{ uid: user.uid, office: actingAs(policy, user.uid, city), kind: 'project', icon: ASSET_INFO[asset].icon, text: `${official(actingAs(policy, user.uid, city), who)} paid ${naira(cost)} to repair ${CITY_NAME[city]}’s ${ASSET_INFO[asset].label.toLowerCase()}.` }]);
    // Money spent where it was needed (on something falling apart) may get VDM's credit.
    if (fixed && fixed.condition - REPAIR.condition < GOV_RANT.badCondition) {
      const praise = await vdmGov(db, user.uid, asset === 'roads' ? 'roadRepair' : 'assetRepair', { who: official(actingAs(policy, user.uid, city), who), other: CITY_NAME[city], what: ASSET_INFO[asset].label.toLowerCase(), amount: naira(cost) }, city);
      if (praise.length) await db.batch(praise).catch(() => {});
    }
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  // A governor asks the federal government for money; the president grants it or turns it down.
  if (body.action === 'askGrant') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const city = cityOf(policy, user.uid);
    if (!city) return err(403, 'Only the governor or the FCT Minister can ask for a grant');
    if (!inRange(body.amount, GRANT_SIZES)) return err(400, 'Choose how much to ask for');
    const row = await db.prepare('UPDATE state_treasuries SET ask_amount = ?1, ask_at = ?2 WHERE city = ?3 AND ask_amount IS NULL RETURNING city').bind(body.amount, now, city).first();
    if (!row) return err(409, 'You already have a request waiting for the president');
    const who = (await usernames(db, [user.uid])).get(user.uid);
    await gazette(env, ctx, [{ uid: user.uid, office: CITY_HEAD[city], kind: 'law', icon: '🙏🏾', text: `${official(CITY_HEAD[city], who)} asked the federal government for ${naira(Number(body.amount))} for ${CITY_NAME[city]}.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'grant' || body.action === 'declineGrant') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president decides on grants');
    const city = CIVIC_CITIES.find((c) => c === body.city);
    if (!city) return err(400, 'Unknown state');
    const who = (await usernames(db, [user.uid])).get(user.uid);
    const me = official('president', who);
    if (body.action === 'declineGrant') {
      const gone = await db.prepare('UPDATE state_treasuries SET ask_amount = NULL, ask_at = NULL WHERE city = ? AND ask_amount IS NOT NULL RETURNING city').bind(city).first();
      if (!gone) return err(409, 'There is no request to turn down');
      await gazette(env, ctx, [{ uid: user.uid, office: 'president', kind: 'law', icon: '🙅🏾', text: `${me} turned down ${CITY_NAME[city]}’s request for money.` }]);
      return json({ snapshot: await snapshot(db, user.uid) });
    }
    const amount = body.amount;
    if (!inRange(amount, GRANT_SIZES)) return err(400, 'Choose a grant size');
    const taken = await db.prepare('UPDATE civic_policies SET treasury = treasury - ?1 WHERE id = 1 AND treasury >= ?1 RETURNING treasury').bind(amount).first();
    if (!taken) return err(402, 'The federal treasury cannot cover that grant');
    await db.batch([
      // `incoming` is untouched: the federal government does not take a cut of its own grant.
      db.prepare('UPDATE state_treasuries SET balance = balance + ?1, ask_amount = NULL, ask_at = NULL WHERE city = ?2').bind(amount, city),
      blogStmt(db, user.uid, '🏛️', `FEDERAL GRANT: ${me} has sent ${naira(amount)} to ${CITY_NAME[city]}. The governor says thank you. The other governors say “and us?” 🏛️`, city),
    ]);
    await gazette(env, ctx, [{ uid: user.uid, office: 'president', kind: 'project', icon: '🏛️', text: `${me} granted ${CITY_NAME[city]} ${naira(amount)} from the federal treasury.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  // The president impeaches whoever runs a state for a few hours and runs it themselves until then, or lets them back early.
  if (body.action === 'impeach' || body.action === 'reinstate') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    if (!policy || policy.president_uid !== user.uid) return err(403, 'Only the elected president can impeach a governor');
    const city = CIVIC_CITIES.find((c) => c === body.city);
    if (!city) return err(400, 'Unknown state');
    const office = CITY_HEAD[city];
    const title = OFFICE_RULES[office].title;
    const head = policy[`${office}_uid`] as string | null;
    const names = await usernames(db, [user.uid, head]);
    const me = official('president', names.get(user.uid));
    const them = head ? official(office, names.get(head)) : `the ${title}`;
    if (body.action === 'reinstate') {
      const back = await db
        .prepare(`UPDATE civic_policies SET ${office}_suspended_until = NULL, updated_at = ?1 WHERE id = 1 AND ${office}_suspended_until > ?1 RETURNING id`)
        .bind(now)
        .first();
      if (!back) return err(409, `The ${title} is not impeached`);
      await postFeed(db, head, 'politics', '🤝🏾', `${me} has reinstated ${them}. The keys to Government House are back where they belong, for now. 🤝🏾`, city).catch(() => {});
      await gazette(env, ctx, [{ uid: user.uid, office: 'president', kind: 'law', icon: '🤝🏾', text: `${me} reinstated ${them}: ${CITY_NAME[city]} is theirs to run again.` }]);
      return json({ snapshot: await snapshot(db, user.uid) });
    }
    if (!head) return err(409, `${CITY_NAME[city]} has no ${title} to impeach. You already run it`);
    if (head === user.uid) return err(400, 'You can’t impeach yourself');
    const hours = body.hours;
    if (typeof hours !== 'number' || !IMPEACH.hours.includes(hours)) return err(400, 'Choose how long the impeachment lasts');
    if (suspended(policy, city)) return err(409, `The ${title} is already impeached`);
    if (now - (await lastUsed(db, user.uid, 'impeach')) < IMPEACH.cooldownHours * 3600_000) return err(429, 'You impeached a governor recently. The National Assembly needs a rest');
    const until = now + hours * 3600_000;
    // Only the governor it was aimed at, and only once: two taps, or a new governor elected meanwhile, change nothing.
    const done = await db
      .prepare(`UPDATE civic_policies SET ${office}_suspended_until = ?1, updated_at = ?2 WHERE id = 1 AND president_uid = ?3 AND ${office}_uid = ?4 AND COALESCE(${office}_suspended_until, 0) <= ?2 RETURNING id`)
      .bind(until, now, user.uid, head)
      .first();
    if (!done) return err(409, 'Something changed. Try again');
    await db.batch([
      usedStmt(db, user.uid, 'impeach', now),
      feedStmt(db, head, 'politics', '⚖️', `IMPEACHED! ${me} has suspended ${them} for ${hours} hours and taken over ${CITY_NAME[city]}. Government House locks have been changed. Aso Rock says it is “in the national interest”. 😳`, city),
      ...(await vdmGov(db, user.uid, 'impeach', { who: me, other: them, n: hours, what: CITY_NAME[city] }, city, true)),
    ]);
    const telling = notifyPlayer(env, head, { t: 'impeached', city, until, by: names.get(user.uid) ?? null });
    if (ctx) ctx.waitUntil(telling.catch(() => {}));
    else await telling.catch(() => {});
    await gazette(env, ctx, [{ uid: user.uid, office: 'president', kind: 'law', icon: '⚖️', text: `${me} impeached ${them} for ${hours} hours. The president runs ${CITY_NAME[city]} until then.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'allocate') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can allocate the treasury');
    const was = allocationOf(policy);
    const next = { ...was, ...body.allocation };
    const shares = ALLOCATION.departments.map((d) => next[d]);
    if (shares.some((n) => !Number.isInteger(n) || n < 0 || n > 100 || n % ALLOCATION.step)) return err(400, `Each share must be a multiple of ${ALLOCATION.step}% between 0% and 100%`);
    if (shares.reduce((a, n) => a + n, 0) > 100) return err(400, 'The shares cannot add up to more than 100%');
    const changed = ALLOCATION.departments.filter((d) => next[d] !== was[d]);
    if (!changed.length) return err(400, 'Nothing changed in the allocation');
    await db
      .prepare(`UPDATE civic_policies SET ${ALLOCATION.departments.map((d) => `alloc_${d} = ?`).join(', ')}, police_funding = ?, updated_at = ? WHERE id = 1`)
      .bind(...shares, ALLOCATION.policeFunding(next.police), now)
      .run();
    await refreshPolicy(db);
    const who = (await usernames(db, [user.uid])).get(user.uid);
    const moves = changed.map((d) => `${ALLOCATION.info[d].label} ${was[d]}% → ${next[d]}%`).join(', ');
    await blogStmt(db, user.uid, '📊', `NEW BUDGET: ${official('president', who)} has shared the treasury again. ${moves}. Every department says it deserved more. 📊`).run().catch(() => {});
    await gazette(env, ctx, [{ uid: user.uid, office: 'president', kind: 'law', icon: '📊', text: `${official('president', who)} changed the budget: ${moves}.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'salaries') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can sign the pay list');
    if (!salariesOpen(policy)) return err(503, 'The pay office is not open yet. Try again later');
    const was = salariesOf(policy);
    const next = { ...was };
    for (const o of OFFICE_LIST) {
      const pay = body.salaries?.[o];
      if (pay === undefined) continue;
      if (!SALARY.options.includes(pay)) return err(400, 'Choose each salary from the list');
      next[o] = pay;
    }
    const changed = OFFICE_LIST.filter((o) => next[o] !== was[o]);
    if (!changed.length) return err(400, 'Nothing changed in the pay list');
    const signed = await db
      .prepare(`UPDATE civic_policies SET ${OFFICE_LIST.map((o) => `salary_${o} = ?`).join(', ')}, updated_at = ? WHERE id = 1 AND president_uid = ? RETURNING id`)
      .bind(...OFFICE_LIST.map((o) => next[o]), now, user.uid)
      .first();
    if (!signed) return err(409, 'You are no longer in office');
    const holderOf = (o: PoliticalOffice) => policy[`${o}_uid`] as string | null;
    const names = await usernames(db, OFFICE_LIST.map(holderOf));
    const me = official('president', names.get(user.uid));
    /** Whose pay it is: the holder by name, or the empty seat. */
    const seat = (o: PoliticalOffice) => (holderOf(o) ? official(o, names.get(holderOf(o)!)) : `the ${OFFICE_NAME[o]}`);
    const moves = changed.map((o) => `${o === 'president' ? 'own pay' : OFFICE_NAME[o]} ${naira(was[o])} → ${naira(next[o])}`).join(', ');
    const bill = wageBill(next, (o) => !!holderOf(o));
    // VDM reads the pay list, and a fair one he leaves alone. Greed he never lets pass: a President whose own raise is
    // fat, or lifts them above everybody else in office. Nor wickedness: somebody in office cut to nothing while the
    // President still draws pay. A smaller cut, or a fat raise for somebody else, he may or may not bother with.
    const inOffice = OFFICE_LIST.filter((o) => o !== 'president' && holderOf(o));
    const greedy = next.president > was.president && (next.president >= SALARY.fat || (inOffice.length > 0 && inOffice.every((o) => next.president > next[o])));
    const cut = inOffice.filter((o) => next[o] < was[o]).sort((a, b) => next[a] - next[b])[0];
    const fat = inOffice.filter((o) => next[o] > was[o] && next[o] >= SALARY.fat).sort((a, b) => next[b] - next[a])[0];
    const rant = greedy
      ? await vdmGov(db, user.uid, 'ownPay', { who: me, amount: naira(next.president) }, null, true)
      : cut
        ? await vdmGov(db, user.uid, 'payCut', { who: me, other: seat(cut), what: naira(was[cut]), amount: naira(next[cut]) }, null, next[cut] === 0 && next.president > 0)
        : fat
          ? await vdmGov(db, user.uid, 'fatPay', { who: me, other: seat(fat), amount: naira(next[fat]) })
          // A President who cuts their own pay may get credit.
          : next.president < was.president
            ? await vdmGov(db, user.uid, 'ownPayCut', { who: me, what: naira(was.president), amount: naira(next.president) })
            : [];
    await db.batch([
      blogStmt(db, user.uid, '💼', `PAY REVIEW: ${me} has signed a new pay list. ${moves}. ${bill ? `The wage bill is now ${naira(bill)} a day.` : 'Nobody in office is being paid.'} 💼`),
      ...rant,
    ]).catch(() => {});
    await gazette(env, ctx, [{ uid: user.uid, office: 'president', kind: 'law', icon: '💼', text: `${me} changed what officials are paid a day: ${moves}.` }]);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  if (body.action === 'policy') {
    const policy = await db.prepare('SELECT * FROM civic_policies WHERE id = 1').first<PolicyRow>();
    const updates: string[] = [];
    const values: number[] = [];
    if (body.taxRate !== undefined) {
      if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can set the tax rate');
      if (!Number.isInteger(body.taxRate) || body.taxRate < 0 || body.taxRate > 20) return err(400, 'Tax rate must be between 0% and 20%');
      updates.push('tax_rate = ?');
      values.push(body.taxRate);
    }
    if (body.loanRate !== undefined) {
      if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can set the bank loan rate');
      if (!Number.isInteger(body.loanRate) || body.loanRate < LOAN.rateLimits[0] || body.loanRate > LOAN.rateLimits[1]) return err(400, `Loan rate must be between ${LOAN.rateLimits[0]}% and ${LOAN.rateLimits[1]}%`);
      updates.push('loan_rate = ?');
      values.push(body.loanRate);
    }
    if (body.transferFee !== undefined) {
      if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can set the transfer fee');
      const [lo, hi] = TRANSFER_FEE_LIMITS;
      if (!Number.isInteger(body.transferFee) || body.transferFee < lo || body.transferFee > hi) return err(400, `Transfer fee must be between ${lo}% and ${hi}%`);
      updates.push('transfer_fee = ?');
      values.push(body.transferFee);
    }
    // The fare subsidy (src/game/transport.ts): the federal treasury pays this share of every ticket while it can.
    for (const [key, column, rule] of [['airSubsidy', 'air_subsidy', FARE_SUBSIDY.air], ['railSubsidy', 'rail_subsidy', FARE_SUBSIDY.rail]] as const) {
      const value = body[key];
      if (value === undefined) continue;
      if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can set a fare subsidy');
      if (!inRange(value, rule.options)) return err(400, `Choose a subsidy up to ${rule.max}%`);
      updates.push(`${column} = ?`);
      values.push(value);
    }
    // The most a state may charge for each tax and fee: lowering one cuts every state above it down to the new maximum.
    const lowered: { key: (typeof STATE_LAW_KEYS)[number]; cap: number }[] = [];
    for (const key of STATE_LAW_KEYS) {
      const law = STATE_LAWS[key];
      const cap = (body as Record<string, unknown>)[law.capField];
      if (cap === undefined) continue;
      if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can set the maximum for a state tax');
      if (!inRange(cap, law.capOptions)) return err(400, `Choose a maximum for ${law.title.toLowerCase()} between ${lawText(key, Math.min(...law.capOptions))} and ${lawText(key, Math.max(...law.capOptions))}`);
      updates.push(`${law.capColumn} = ?`);
      values.push(cap);
      if (cap < Number(policy?.[law.capColumn] ?? law.max)) lowered.push({ key, cap });
    }
    if (body.federalCut !== undefined) {
      if (policy?.president_uid !== user.uid) return err(403, 'Only the elected president can set the federal cut');
      if (!inRange(body.federalCut, [0, FEDERAL_CUT.max])) return err(400, `The federal cut must be a whole percent up to ${FEDERAL_CUT.max}%`);
      updates.push('federal_cut = ?');
      values.push(body.federalCut);
    }
    // Police and EFCC laws (see src/game/crime.ts).
    const laws: [keyof typeof LAW_LIMITS, string, PoliticalOffice][] = [
      ['patrols', 'patrols', 'igp'],
      ['jailMinutes', 'jail_minutes', 'igp'],
      ['finePct', 'fine_pct', 'efcc'],
      ['reportHours', 'report_hours', 'efcc'],
      ['caseCooldownMin', 'case_cooldown_min', 'efcc'],
    ];
    for (const [key, column, office] of laws) {
      const value = body[key];
      if (value === undefined) continue;
      if (policy?.[`${office}_uid`] !== user.uid) return err(403, `Only the ${OFFICE_RULES[office].title} can change this law`);
      const [lo, hi] = LAW_LIMITS[key];
      if (!Number.isInteger(value) || value < lo || value > hi) return err(400, `Choose a value between ${lo} and ${hi}`);
      updates.push(`${column} = ?`);
      values.push(value);
    }
    // Each city's own laws, signed by whoever runs it.
    const bans: { ban: (typeof OKADA_BANS)[number]; on: number; as: PoliticalOffice }[] = [];
    for (const ban of OKADA_BANS) {
      const on = body[ban.key];
      if (on === undefined) continue;
      // Whoever runs the city signs it: its head, or the president while the head is impeached.
      const signs = cityOf(policy, user.uid) === ban.city || (policy?.president_uid === user.uid && suspended(policy, ban.city));
      if (!signs) return err(403, `Only the ${OFFICE_RULES[ban.office].title} can ban okada in ${CITY_NAME[ban.city]}`);
      if (on !== 0 && on !== 1) return err(400, 'The ban is either on or off');
      updates.push(`${ban.column} = ?`);
      values.push(on);
      if (policy?.[ban.column] !== on) bans.push({ ban, on, as: actingAs(policy, user.uid, ban.city) });
    }
    if (!updates.length) return err(400, 'No policy changes supplied');
    const before = await db.prepare(`SELECT ${Object.values(GAZETTE_LAWS).map((l) => l.column).join(', ')} FROM civic_policies WHERE id = 1`).first<Record<string, number>>().catch(() => null);
    await db
      .prepare(`UPDATE civic_policies SET ${updates.join(', ')}, updated_at = ? WHERE id = 1`)
      .bind(...values, now)
      .run();
    await refreshPolicy(db);
    // Every law that really changed is gazetted: a slider put back where it was is not news.
    const who = (await usernames(db, [user.uid])).get(user.uid);
    const notices: Notice[] = [];
    // The blogs carry each one too, and VDM has words for a president who raises what people pay, or a ban on okada.
    const posts: D1PreparedStatement[] = [];
    for (const [key, law] of Object.entries(GAZETTE_LAWS) as [keyof typeof GAZETTE_LAWS, (typeof GAZETTE_LAWS)[keyof typeof GAZETTE_LAWS]][]) {
      const next = body[key];
      const was = before?.[law.column];
      if (next === undefined || was === undefined || was === next) continue;
      notices.push({ uid: user.uid, office: law.office, kind: 'law', icon: law.icon, text: `${official(law.office, who)} ${next > was ? 'raised' : 'cut'} ${law.label}: ${was}${law.unit} → ${next}${law.unit}.` });
      posts.push(blogStmt(db, user.uid, law.icon, lawNews(key, official(law.office, who), law.label, was, next, law.unit), OFFICE_RULES[law.office].city));
      // A raise in what people pay gets dragged. A cut in it, or a bigger fare subsidy, may get credit, with a
      // President on a fat salary dragged for that in the same breath.
      const change = `${law.label} from ${was}${law.unit} to ${next}${law.unit}`;
      const gift = key === 'airSubsidy' || key === 'railSubsidy';
      if (law.office === 'president' && next > was && !gift) posts.push(...(await vdmGov(db, user.uid, 'levy', { who: official(law.office, who), what: change })));
      else if (law.office === 'president' && (gift ? next > was : next < was && ['taxRate', 'loanRate', 'transferFee'].includes(key))) {
        const own = Number(policy?.salary_president ?? 0);
        const fat = own >= SALARY.fat ? { about: 'fatPayList' as const, matter: { who: official('president', who), amount: naira(own) }, uid: user.uid } : null;
        posts.push(...(await vdmGov(db, user.uid, gift ? 'subsidy' : 'taxCut', { who: official(law.office, who), what: change }, null, false, { but: fat })));
      }
    }
    for (const { ban, on, as } of bans) {
      notices.push({ uid: user.uid, office: as, kind: 'law', icon: '🏍️', text: on
        ? `${official(as, who)} banned okada in ${CITY_NAME[ban.city]}.`
        : `${official(as, who)} lifted the okada ban in ${CITY_NAME[ban.city]}.` });
      posts.push(blogStmt(db, user.uid, '🏍️', okadaNews(official(as, who), ban.city, !!on), ban.city));
      if (on) posts.push(...(await vdmGov(db, user.uid, 'okadaBan', { who: official(as, who), other: CITY_NAME[ban.city] }, ban.city)));
    }
    if (posts.length) await db.batch(posts).catch(() => {});
    // A lowered maximum takes every state above it down to it.
    for (const { key, cap } of lowered) {
      const law = STATE_LAWS[key];
      const cut = await db.prepare(`UPDATE state_treasuries SET ${law.column} = MIN(${law.column}, ?1) WHERE ${law.column} > ?1 RETURNING city`).bind(cap).all<{ city: string }>();
      notices.push({ uid: user.uid, office: 'president', kind: 'law', icon: '🏛️', text: `${official('president', who)} capped ${law.title.toLowerCase()} at ${lawText(key, cap)}.${cut.results.length ? ` ${cut.results.map((r) => CITY_NAME[r.city as CivicCity] ?? r.city).join(', ')} cut down to it.` : ''}` });
    }
    await gazette(env, ctx, notices);
    return json({ snapshot: await snapshot(db, user.uid) });
  }

  return err(400, 'Unknown civic action');
}
