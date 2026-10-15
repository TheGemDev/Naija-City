/** How long a closed EFCC case stays on record (and in the app). A conviction whose seized property can still be bought back stays until it is. */
export const EFCC_RECORD_MS = 3 * 24 * 60 * 60_000;

export const EFCC = {
  filingFee: 250_000,
  bribeAmount: 500_000,
  bribeChance: 0.35,
  /** What the accused pays to learn who filed the investigation. */
  revealFee: 150_000,
  investigationMs: 90_000,
  walletSeizurePercent: 80,
  /** How many of the target's latest income events the audit reads. */
  auditSize: 10,
  /** Flagged income at or above this share of the audited total gets you convicted... */
  dirtyShare: 0.15,
  /** ...as does this much flagged money outright, however much clean income dilutes it. */
  dirtyFloor: 100_000,
};

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
