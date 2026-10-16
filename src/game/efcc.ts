import { TIME_RATE } from './timeRates';
/** How long a closed EFCC case stays on record (and in the app). A conviction whose seized property can still be bought back stays until it is. */
export const EFCC_RECORD_MS = 3 * 24 * 60 * 60_000;

export const EFCC = {
  filingFee: 250_000,
  bribeAmount: 500_000,
  bribeChance: 0.35,
  /** What the accused pays to learn who filed the investigation. */
  revealFee: 150_000,
  investigationMs: 90_000,
  /**
   * Once a case is filed on someone, nobody can file another on them for this long: the default, and the most the EFCC
   * chair can set it to (the law is civic_policies.case_cooldown_min, 10 minutes to 12 hours). A new case only audits
   * income that landed after the last one: nobody is judged twice for the same money.
   */
  caseCooldownMs: 12 * 60 * 60_000,
  /** What the EFCC takes on a conviction. It goes to the federal treasury, as does a seized house bought back. */
  walletSeizurePercent: 80,
  /** How many of the target's latest income events the audit reads. */
  auditSize: 10,
  /** Flagged income at or above this share of the audited total gets you convicted... */
  dirtyShare: 0.15,
  /** ...as does this much flagged money outright, however much clean income dilutes it. */
  dirtyFloor: 100_000,
  /**
   * An account or life younger than this is new. Money from a new account is flagged when it was played on the
   * receiver's own network (a transfer, owambe spray, rent, or a game pot it paid into): their own fresh accounts
   * passing on starting money. Only on their network, so nobody can frame a player by sending them money.
   */
  freshAccountMs: 7 * 24 * 60 * 60_000,
};

/**
 * A rigged election: the EFCC audits every vote a candidate got (worker/efcc.ts electionAudit). Linked accounts are ones
 * played on the same device (worker/links.ts).
 */
export const ELECTION_FRAUD = {
  /** Convicted when this share of their votes is traced to them (voteTied)... */
  flaggedShare: 0.25,
  /** ...or this many votes, however many clean ones there are. */
  flaggedFloor: 5,
  /** A candidate can be reported up to this long after the result: a winner who rigged it loses the seat. */
  reportAfterMs: 24 * 60 * 60_000,
  /** A vote from someone the candidate paid in the 12 game hours before it was cast is a bought vote (world clock). */
  paidWindowMs: ((12 * 60) / TIME_RATE) * 1000,
  /** After a case on a candidate, the next one on them in the same race waits this long (more votes may have come in). */
  refileMs: 60 * 60_000,
};

/**
 * What can be wrong with a vote:
 *  device  cast from the candidate's own device: their second account
 *  ring    cast from the same device as another of their voters: one person, several accounts
 *  paid    the candidate sent the voter money shortly before
 *  fresh   the voter's account or life is new (EFCC.freshAccountMs)
 *  ip      the voter has used the candidate's network
 *  twin    the same phone model on the same network as the candidate: the candidate's phone in a private window, or
 *          just two of one model in one house (worker/links.ts twinSql)
 */
export type VoteFlag = 'device' | 'ring' | 'paid' | 'fresh' | 'ip' | 'twin';
export const VOTE_FLAGS: Record<VoteFlag, { icon: string; label: string }> = {
  device: { icon: '📱', label: 'Same device as the candidate' },
  ring: { icon: '👥', label: 'Same device as another of their voters' },
  paid: { icon: '💸', label: 'Paid by the candidate before voting' },
  fresh: { icon: '🐣', label: 'Brand-new account' },
  ip: { icon: '📶', label: 'Same network as the candidate' },
  twin: { icon: '👯', label: 'Same phone model on the candidate’s network' },
};

/** One vote in an election audit. Who cast it stays secret. */
export interface EfccVote {
  at: number;
  flags: VoteFlag[];
  illicit: boolean;
}

/**
 * Traced to the candidate: cast from their own device, paid for by them, or a brand-new account on their network or a
 * lookalike of their phone. Nobody else can fake these, so these, and only these, convict the candidate. A shared
 * network or lookalike phone alone is not enough: family members with the same phone on one Wi-Fi are not fake voters.
 */
export const voteTied = (flags: VoteFlag[]) =>
  flags.includes('device') || flags.includes('paid') || (flags.includes('fresh') && (flags.includes('ip') || flags.includes('twin')));

/**
 * A fake vote, struck off when audited. Several accounts on one phone voting together are fake too, but that phone may
 * be a rival's trying to frame the candidate: their votes are struck without counting against the candidate.
 */
export const voteIllicit = (flags: VoteFlag[]) => voteTied(flags) || flags.includes('ring');

export const electionConvicts = (votes: EfccVote[]) => {
  const tied = votes.filter((v) => voteTied(v.flags)).length;
  return tied > 0 && (tied >= ELECTION_FRAUD.flaggedFloor || tied / votes.length >= ELECTION_FRAUD.flaggedShare);
};

/** Incomes another player paid, which the EFCC flags when that player is one of your own accounts (worker/efcc.ts audit). */
export const EFCC_FRESH_KINDS = ['transfer_in', 'spray_in', 'rent_in', 'game_win'];

/** Dirty money in an audit: the total flagged, and its share of everything audited. */
export const efccDirty = (audit: EfccIncome[]) => {
  const total = audit.reduce((a, e) => a + e.amount, 0);
  const dirty = audit.reduce((a, e) => a + (e.illicit ? e.amount : 0), 0);
  return { total, dirty, share: total > 0 ? dirty / total : 0 };
};

/** Convicted when the flagged money is a real slice of the income, or simply a lot. Clean income only dilutes so far. */
export const efccConvicts = (audit: EfccIncome[]) => {
  const { dirty, share } = efccDirty(audit);
  return dirty > 0 && (dirty >= EFCC.dirtyFloor || share >= EFCC.dirtyShare);
};

/**
 * Ledger kinds that are fraud money when they land in your wallet:
 *  bank_heist  solo or crew bank robbery loot
 *  theft_in    cash lifted from another player (pickpocket, house burglary)
 *  fence       proceeds from selling stolen goods on the black market
 *  embezzle    public funds skimmed from a civic office
 *  scam_win    Yahoo scam payouts (a plain transfer that matches a scam is also caught by the server)
 * Money another player paid you is flagged too when they play on your own device, or are a new account on your network
 * (EFCC_FRESH_KINDS).
 * Everything else (wages, gigs, sales, investments, property, bets, bounties) is clean.
 */
export const EFCC_DIRTY_KINDS = [
  'bank_heist', 'theft_in', 'fence', 'embezzle', 'scam_win',
  // vice (src/game/vice.ts)
  'vice_sale', 'racket', 'contract', 'ransom', 'forgery', 'counterfeit', 'bunkering', 'pirate_ads', 'betting_shop', 'breakout',
];

export type EfccStatus = 'investigating' | 'cleared' | 'convicted' | 'bribed';

export interface EfccIncome {
  at: number;
  kind: string;
  source: string;
  amount: number;
  illicit: boolean;
}

export interface EfccCase {
  id: string;
  /** Dirty money (the audit is incomes), or a rigged election (the audit is votes). */
  kind: 'money' | 'election';
  /** Election cases: the office they were running for. */
  office?: string;
  votes?: EfccVote[];
  targetUid: string;
  accuserUid: string;
  status: EfccStatus;
  target: string;
  /** Empty while the accused hasn't paid to see who filed it. */
  accuser: string;
  accuserHidden?: boolean;
  filedAt: number;
  resolvesAt: number;
  audit: EfccIncome[];
  statement: string | null;
  bribeAttempted: boolean;
  bribeSucceeded: boolean | null;
  fine: number | null;
  seizedProperty: { id: string; name: string; price: number; boughtBack: boolean; property?: import('./property').Property } | null;
}

export const efccSource = (kind: string) =>
  ({
    work: 'Job wages',
    gig: 'Side gig',
    sell: 'Sale',
    invest: 'Investment',
    property: 'Property income',
    market_sale: 'Player business sale',
    transfer_in: 'Player transfer',
    fence: 'Fenced stolen goods',
    theft_in: 'Stolen cash',
    embezzle: 'Embezzled public funds',
    bank_heist: 'Bank heist',
    scam_win: 'Yahoo scam proceeds',
    vice_sale: 'Drug sales',
    racket: 'Protection money',
    contract: 'Contract killing / kidnapping',
    ransom: 'Kidnap ransom',
    forgery: 'Forged documents',
    counterfeit: 'Counterfeit naira',
    bunkering: 'Illegal fuel bunkering',
    pirate_ads: 'Pirate radio ads',
    betting_shop: 'Illegal betting shop',
    breakout: 'Jailbreak fee',
  })[kind] ?? kind.replaceAll('_', ' ');

export const efccTimeLeft = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** One thing the EFCC (or customs) took: cash, a house, a sofa, an app, a shelf of stock, a fine (worker/exhibits.ts). */
export interface EfccExhibit {
  kind: 'cash' | 'savings' | 'house' | 'furniture' | 'app' | 'stock' | 'loot' | 'fine';
  icon: string;
  label: string;
  /** What it was worth in naira; 0 for something with no price (an app). */
  value: number;
  qty: number;
  /** When it came back: a house bought back. */
  returnedAt?: number | null;
}
/** Everything one arrest, conviction or raid took, as the EFCC app lists it. */
export interface EfccSeizure {
  event: string;
  title: string;
  at: number;
  items: EfccExhibit[];
}
