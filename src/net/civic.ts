import { create } from 'zustand';
import { ALLOCATION, banLeft, CITY_HEAD, CIVIC_CITIES, OFFICE_RULES, OFFICES, OKADA_BAN_LAW, POLLS_CLOSE_AT, VOTE_BUYING_BAN_MS, type Allocation, type Salaries, type ExecutiveOffice, type StateVehicle, type CampaignEvent, type CivicCooldown, type CivicNews, type GazetteKind, type PoliticalOffice } from '../game/civic';
import { setOkadaBan } from '../game/cityLaws';
import { refreshBalance, setServerBalance } from './wallet';
import { api, useSession } from './session';
import { naira, useGame } from '../game/store';
import { loadPolice } from './crime';

export interface CivicCandidate {
  uid: string;
  username: string | null;
  name: string | null;
  support: number;
  votes: number;
  lastActionAt: number;
}

export interface CivicRace {
  id: number;
  endsAt: number;
  /** The leaders (BALLOT_SIZE of them), then you and the one you voted for when they trail further back. */
  candidates: CivicCandidate[];
  myVote: string | null;
  /** Everyone in the race, and every vote cast, shown or not. */
  running: number;
  totalVotes: number;
}

export interface CivicHolder {
  uid: string;
  username: string | null;
  name: string | null;
  /** When their term ends (ms); null for terms that began before terms existed. */
  termEnds: number | null;
}

export interface PolicyChange {
  taxRate?: number;
  roadsFunding?: number;
  roadsFundingAbuja?: number;
  roadsFundingLagos?: number;
  roadsFundingKano?: number;
  patrols?: number;
  jailMinutes?: number;
  finePct?: number;
  reportHours?: number;
  loanRate?: number;
  transferFee?: number;
  /** 1 while the city's government has okada off its streets. */
  okadaBanKaduna?: number;
  okadaBanAbuja?: number;
  okadaBanLagos?: number;
  okadaBanKano?: number;
}

export interface CivicSnapshot {
  policies: Required<PolicyChange> & Record<PoliticalOffice, CivicHolder | null>;
  races: Partial<Record<PoliticalOffice, CivicRace>>;
  /** Income tax collected so far, for the government to spend. */
  treasury: number;
  /** The president's budget: the percent of the treasury each department may use. */
  allocation?: Allocation;
  palliativeAt: number | null;
  /** What each office is paid a game day, when the last pay round went out, and whether there is a pay list yet (worker/civic.ts). */
  salaries?: Salaries;
  salariesPaidAt?: number | null;
  salariesOpen?: boolean;
  /** Campaign posters up round the city. */
  posters: { username: string; office: PoliticalOffice }[];
  /** The governor dug up my street until then. */
  roadBlockUntil: number | null;
  embezzledAt: number | null;
  /** When I last awarded a contract or granted a pardon. */
  cooldowns?: Partial<Record<CivicCooldown, number>>;
  /** The one post I'm running for right now. */
  runningFor: PoliticalOffice | null;
  /** Barred from running after an EFCC vote-buying sting, and when the ban runs out. */
  banned: boolean;
  bannedUntil?: number | null;
  /** What the government did lately, newest first (worker/gazette.ts). */
  news?: CivicNews[];
}

interface CivicState {
  /** Something (a building) asked the phone to open the Civic app. */
  wantOpen: boolean;
  /** ...and to open it on the News tab (a government notice was tapped). */
  wantNews: boolean;
  /** ...or on the Treasury tab (the budget chip was tapped). */
  wantTreasury: boolean;
  data: CivicSnapshot | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  refresh(): Promise<void>;
  run(office: PoliticalOffice): Promise<void>;
  /** Pull out of a race before its polls open, for a fee (game/civic.ts withdrawalFee). */
  withdraw(office: PoliticalOffice): Promise<void>;
  campaign(office: PoliticalOffice, event: CampaignEvent): Promise<void>;
  vote(office: PoliticalOffice, candidateUid: string): Promise<void>;
  setPolicy(policy: PolicyChange): Promise<void>;
  allocate(allocation: Allocation): Promise<void>;
  /** The President signs the pay list: every office's pay a game day, their own included. */
  setSalaries(salaries: Salaries): Promise<void>;
  roadProject(target: string): Promise<void>;
  contract(target: string, amount: number): Promise<void>;
  pardon(target: string): Promise<void>;
  palliative(amount: number): Promise<void>;
  embezzle(): Promise<void>;
}

interface CivicResult {
  snapshot?: CivicSnapshot;
  balance?: number;
  error?: string;
  /** Campaign chaos: the crowd ran off, or the EFCC caught you buying votes. */
  outcome?: 'ok' | 'fled' | 'stung';
  until?: number;
  caught?: boolean;
  amount?: number;
  each?: number;
  people?: number;
}

/** The election opening or closing, pushed to everyone online (worker/civic.ts). */
export type ElectionEvent = { t: 'election'; phase: 'open' | 'result'; office: PoliticalOffice; endsAt?: number; winner?: string | null; votes?: number };

export function onElectionEvent(e: ElectionEvent) {
  const title = OFFICE_RULES[e.office].title;
  const g = useGame.getState();
  g.toast(e.phase === 'open'
    ? `🗳️ The polls for ${title} are open until ${POLLS_CLOSE_AT}. Tap Vote at the top of your screen.`
    : e.winner
      ? `🗳️ ELECTION RESULT: @${e.winner} is the new ${title} with ${e.votes ?? 0} vote${e.votes === 1 ? '' : 's'}! 🎉`
      : `🗳️ The ${title} election ended with no candidates.`);
  // Anyone looking at the board sees it change straight away.
  if (useCivic.getState().data) void useCivic.getState().refresh();
}

/** An office holder just did something, pushed to everyone online (worker/gazette.ts). */
export type GazetteEvent = { t: 'gazette'; kind: GazetteKind; office: PoliticalOffice | null; icon: string; text: string; at: number };

/** Notices waiting their turn on the banner (ui/Gazette.tsx shows the first). */
export const useGazette = create<{ queue: (GazetteEvent & { key: number })[]; push(e: GazetteEvent): void; shift(): void }>((set) => ({
  queue: [],
  // A burst of new laws must not hold the screen for a minute: only the latest few wait.
  push: (e) => set((s) => ({ queue: [...s.queue, { ...e, key: Date.now() + Math.random() }].slice(-4) })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

export function onGazetteEvent(e: GazetteEvent) {
  useGazette.getState().push(e);
  // Anyone with the Civic app loaded sees the law and the News tab change straight away.
  if (useCivic.getState().data) void useCivic.getState().refresh();
}

async function request(body?: object) {
  const res = await api('/api/civic', body ? { method: 'POST', body: JSON.stringify(body) } : {});
  const result = (await res.json()) as CivicResult;
  if (!res.ok) throw new Error(result.error ?? `Civic service returned ${res.status}`);
  return result;
}

/** Share what the government decided with the rest of the game. */
function apply(snapshot: CivicSnapshot) {
  const g = useGame.getState();
  if (g.taxRate !== snapshot.policies.taxRate || g.roadBlockUntil !== snapshot.roadBlockUntil) {
    useGame.setState({ taxRate: snapshot.policies.taxRate, roadBlockUntil: snapshot.roadBlockUntil });
  }
  setOkadaBan(CIVIC_CITIES.filter((city) => !!snapshot.policies[OKADA_BAN_LAW[city]]));
  // My salary is paid on the server: when a new pay round has gone out, pick up what landed.
  const round = snapshot.salariesPaidAt ?? 0;
  if (round !== payRound) {
    const uid = useSession.getState().user?.uid;
    if (payRound && uid && OFFICES.some((o) => snapshot.policies[o]?.uid === uid && (snapshot.salaries?.[o] ?? 0) > 0)) void refreshBalance();
    payRound = round;
  }
}
/** The last pay round this page has seen. */
let payRound = 0;

/** What happened, in a toast. */
function report(body: Record<string, unknown>, r: CivicResult) {
  const g = useGame.getState();
  if (r.outcome === 'stung') {
    g.toast(`🚨 EFCC STING! You were caught buying votes: disqualified, fined, arrested and barred from running for office for ${banLeft(VOTE_BUYING_BAN_MS)}.`);
    void loadPolice();
  } else if (r.outcome === 'fled') g.toast('🏃🏾 Your hired crowd ran off when the money finished. Small boost only. 😂');
  else if (body.event === 'buyVotes') {
    g.bump('votesBought');
    g.toast('🧧 Rice, wrappers and ₦ notes shared. Your support is soaring. Nobody saw… hopefully.');
  } else if (body.event === 'posters') g.toast('🪧 Your billboards are up along the main roads.');
  if (body.action === 'campaign') g.bump('campaigns');
  if (body.action === 'withdraw') g.toast(`🏳️ You have pulled out of the race for ${OFFICE_RULES[body.office as PoliticalOffice].title}.`);
  if (body.action === 'roadProject') {
    g.bump('roadProjects');
    g.toast('🚧 Excavators deployed. Their street is now a “construction zone”.');
  }
  if (body.action === 'contract') g.toast(`📝 Contract signed. ${naira(Number(body.amount))} is on its way to the contractor.`);
  if (body.action === 'pardon') g.toast('🕊️ Pardon signed. They are walking out of the cell now.');
  if (body.action === 'allocate') g.toast('📊 New budget signed. The departments have their shares.');
  if (body.action === 'salaries') g.toast('💼 New pay list signed. The whole country can read it, VDM too.');
  if (body.action === 'palliative' && r.each) g.toast(`🍚 Palliatives shared: ${naira(r.each)} each to ${r.people} people.`);
  if (body.action === 'embezzle') {
    if (r.caught) {
      g.toast('🐍 CAUGHT! The EFCC traced the money. You are out of office and in a cell.');
      void loadPolice();
    } else if (r.amount) g.toast(`🐍 ${naira(r.amount)} quietly moved to your account. A snake swallowed it, officially.`);
  }
}

export const useCivic = create<CivicState>((set) => {
  const act = async (body: object) => {
    set({ busy: true, error: null });
    try {
      const result = await request(body);
      if (result.snapshot) {
        set({ data: result.snapshot });
        apply(result.snapshot);
      }
      if (result.balance !== undefined) setServerBalance(result.balance);
      report(body as Record<string, unknown>, result);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Civic service is unavailable' });
    } finally {
      set({ busy: false });
    }
  };
  return {
    wantOpen: false,
    wantNews: false,
    wantTreasury: false,
    data: null,
    loading: false,
    busy: false,
    error: null,
    async refresh() {
      set({ loading: true, error: null });
      try {
        const result = await request();
        if (result.snapshot) {
          set({ data: result.snapshot });
          apply(result.snapshot);
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Civic service is unavailable' });
      } finally {
        set({ loading: false });
      }
    },
    run: (office) => act({ action: 'run', office }),
    withdraw: (office) => act({ action: 'withdraw', office }),
    campaign: (office, event) => act({ action: 'campaign', office, event }),
    vote: (office, candidateUid) => act({ action: 'vote', office, candidateUid }),
    setPolicy: (policy) => act({ action: 'policy', ...policy }),
    allocate: (allocation) => act({ action: 'allocate', allocation }),
    setSalaries: (salaries) => act({ action: 'salaries', salaries }),
    roadProject: (target) => act({ action: 'roadProject', target }),
    contract: (target, amount) => act({ action: 'contract', target, amount }),
    pardon: (target) => act({ action: 'pardon', target }),
    palliative: (amount) => act({ action: 'palliative', amount }),
    embezzle: () => act({ action: 'embezzle' }),
  };
});

/**
 * The office whose fleet I can ride in right now (game/civic.ts STATE_FLEET): I hold it, and what it may spend covers
 * `cost`. The president draws on the whole treasury, a city's government on its own share of it.
 */
export function stateRide(cost = 0): ExecutiveOffice | null {
  const uid = useSession.getState().user?.uid;
  const data = useCivic.getState().data;
  if (!uid || !data) return null;
  if (data.policies.president?.uid === uid) return data.treasury >= cost ? 'president' : null;
  const city = CIVIC_CITIES.find((c) => data.policies[CITY_HEAD[c]]?.uid === uid);
  if (!city) return null;
  const share = (data.allocation ?? ALLOCATION.defaults)[city];
  return ALLOCATION.budget(data.treasury, share) >= cost ? (CITY_HEAD[city] as ExecutiveOffice) : null;
}

/** An official trip has left: the treasury pays for it. `to` is the city a jet is flying to (the blogs report it). */
export function chargeTreasury(amount: number, vehicle: StateVehicle, to?: string) {
  const data = useCivic.getState().data;
  // Straight away, so the next trip is checked against what is left.
  if (data) useCivic.setState({ data: { ...data, treasury: Math.max(0, data.treasury - amount) } });
  void request({ action: 'officialTrip', amount, vehicle, to })
    .then((r) => { if (r.snapshot) useCivic.setState({ data: r.snapshot }); })
    .catch(() => { void useCivic.getState().refresh(); });
}
