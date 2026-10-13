// Player theft rules, shared by the game and the server (worker/crime.ts). Some of these are laws set by
// elected officials (src/game/civic.ts): the IGP sets the jail term and patrols, the EFCC chair sets the
// fine on arrest and how long victims have to report.

export type CrimeKind = 'pickpocket' | 'burglary';

export interface CrimeReport {
  id: number;
  kind: CrimeKind;
  success: boolean;
  /** Cash taken (for a burglary, including what the stolen furniture fetched). */
  amount: number;
  item: string | null;
  /** Live burglary event only: which placed item was taken, and from which house (null: the active one). */
  itemId?: string;
  propertyId?: string | null;
  /** open: not reported. wanted: reported, police are looking. arrested: caught and settled. */
  status: 'open' | 'wanted' | 'arrested';
  /** Paid back to the victim on arrest. */
  returned: number;
  /** Extra fine the thief paid on arrest (EFCC law). */
  fine?: number;
  /** When the victim reported it (the manhunt starts). */
  reportedAt?: number | null;
  /** Username of the player who made the arrest (an officer or a bounty hunter); null for the NPC police. */
  officer?: string | null;
  /** Bounty the victim put on the thief, paid to whoever makes the arrest. */
  bounty?: number;
  /** The victim's bodyguard, gateman or CCTV caught the thief in the act (the case went straight to wanted). */
  guard?: CatcherKind | null;
  at: number;
  /** 'someone' while the victim doesn't know who did it (an unsolved burglary). */
  thief: string;
  victim: string;
  /** Usernames the victim accused (burglaries only, once per case). */
  accused?: string[] | null;
  /** The stolen item went back to the victim. */
  recovered?: boolean;
  /** Thief side: the item was taken back off them. */
  confiscated?: boolean;
  /** VDM exposed it on Twitter. */
  vdm?: boolean;
  /** When the victim last told VDM about it (ms). He may have passed on it. */
  vdmAsked?: number | null;
}

/** A burglary nobody saw: the victim doesn't know who did it and has to accuse suspects. */
export const unsolved = (c: Pick<CrimeReport, 'kind' | 'success' | 'guard'>) => c.kind === 'burglary' && c.success && !c.guard;

export const ACCUSE = {
  /** Most suspects a victim can name for one theft. */
  max: 3,
};

export interface CrimeLaws {
  /** Governor: 0–100. */
  policeFunding: number;
  /** IGP: 0–100. */
  patrols: number;
  /** IGP: real minutes in a cell after an arrest. */
  jailMinutes: number;
  /** EFCC chair: fine on arrest, as a percent of what was stolen, on top of paying it back. */
  finePct: number;
  /** EFCC chair: how many real hours a victim has to report a theft. */
  reportHours: number;
}

export const DEFAULT_LAWS: CrimeLaws = { policeFunding: 50, patrols: 50, jailMinutes: 20, finePct: 25, reportHours: 48 };

export const LAW_LIMITS = {
  patrols: [0, 100],
  jailMinutes: [5, 30],
  finePct: [0, 200],
  reportHours: [6, 72],
} as const;

export const CRIME = {
  /** Pickpockets must be this close (tiles) to the victim, in the same building. */
  reach: 2.5,
  /** Burglars must be this close to the house walls. */
  houseReach: 1.6,
  /** A thief can try once per this long. */
  cooldownMs: 3 * 60_000,
  /** After being robbed, a player can't be robbed again for this long. */
  victimShieldMs: 10 * 60_000,
  /** Share of the victim's cash taken, and the most taken in one go. */
  pickpocket: { min: 0.05, max: 0.15, cap: 50_000 },
  burglary: { min: 0.1, max: 0.25, cap: 150_000 },
  /**
   * A burglar a powered CCTV camera films is arrested on the spot this often (the rest get away until the owner
   * reports them). One who comes back to a house that already has them on film is always arrested.
   */
  cameraArrestChance: 0.95,
  /** Stolen furniture is sold on for this share of its shop price. */
  fenceFactor: 0.3,
  /** More police money and more patrols: more thieves spotted. 90% success with none, 30% with full. */
  successChance: (laws: Pick<CrimeLaws, 'policeFunding' | 'patrols'>) => Math.max(0.1, 0.9 - laws.policeFunding * 0.003 - laws.patrols * 0.003),
};

export const POLICE = {
  /** The job id that lets a player arrest wanted thieves. */
  job: 'police',
  /** An officer must be this close (tiles) to the suspect, in the same area (not inside their own home). */
  arrestReach: 3,
  /** Real time player officers get to catch a wanted thief before the NPC police pick them up. */
  manhuntMs: 15 * 60_000,
  /** The arresting officer's reward, paid by the thief: this share of what was stolen, at least `rewardMin`. */
  rewardPct: 0.2,
  rewardMin: 2_000,
  /** Bail: this much per real minute left in the cell, at least `bailMin`. */
  bailPerMinute: 60_000,
  bailMin: 300_000,
};

/** What it costs to walk out now. */
export const bailFor = (until: number, now = Date.now()) => Math.max(POLICE.bailMin, Math.ceil((until - now) / 60_000) * POLICE.bailPerMinute);

/** A homeowner who is in the house when a burglar breaks in can catch them in the act. */
export const CATCH = {
  /** How long a beaten burglar stays injured: slow on their feet, and unable to steal or break in. */
  injuredMs: 10 * 60_000,
  /** What a beating costs the thief in cash (paid to the owner): a share of their wallet, up to the cap. */
  cashPct: 0.1,
  cashCap: 20_000,
  /** Loot the thief took from this owner in the last while is taken back too. */
  lootWindowMs: 15 * 60_000,
  /** A burglar caught at a house (CCTV, security or the owner) can't break into that owner's houses again for this long. */
  lockoutMs: 30 * 60_000,
  /** How long the owner's "intruder" prompt stays up. */
  promptMs: 60_000,
  /** An injured thief walks at this share of normal speed. */
  slowFactor: 0.5,
};

/** Paid protection. Each one cuts the odds of one kind of theft, and catches the thieves it stops. */
export const PROTECTION = {
  bodyguard: { label: 'Bodyguard', icon: '🕶️', price: 25_000, hours: 2, against: 'pickpocket', blurb: 'Walks behind you everywhere. Most pickpockets fail, and he grabs the ones who try.' },
  gateman: { label: 'Mai-gadi', icon: '💂🏾', price: 30_000, hours: 24, against: 'burglary', blurb: 'A gateman with a stick and a torch at your house. Most burglars fail, and he holds the ones who try.' },
} as const;
export type ProtectionKind = keyof typeof PROTECTION;
/** Everything that can catch a thief in the act: paid protection plus a CCTV camera in the house. */
export const CATCHERS = {
  ...PROTECTION,
  camera: { label: 'CCTV camera', icon: '📹' },
  owner: { label: 'own two hands', icon: '🏠' },
} as const;
export type CatcherKind = keyof typeof CATCHERS;
/** With protection, a thief's odds are multiplied by this. */
export const PROTECTED_FACTOR = 0.3;
export const guardFor = (kind: CrimeKind): ProtectionKind => (kind === 'pickpocket' ? 'bodyguard' : 'gateman');

/** When each kind of protection runs out (ms), or null. */
export type Protection = Record<ProtectionKind, number | null>;

/** A bounty on a wanted thief. Anyone (not just officers) can make the arrest to collect it. */
export const BOUNTY = { min: 5_000, max: 1_000_000 };

/** Police app "Call VDM": tell him about a crime against you and he considers exposing it on Twitter. It's free, and he mostly passes. */
export const VDM = {
  /** He still talks about burglaries nobody saw, he just can't name anyone. */
  icon: '📢',
  /** How long before he'll hear the same case again after passing on it. */
  retryMs: 12 * 3600_000,
  /** Chance he posts a case. A name to drag and big money both make it juicier. */
  odds: (c: Pick<CrimeReport, 'kind' | 'success' | 'guard' | 'status' | 'amount'>) =>
    0.15 + (unsolved(c) && c.status !== 'arrested' ? 0 : 0.1) + (c.amount >= 500_000 ? 0.1 : 0),
};

/** A thief with a warrant out, as police officers see them. */
export interface WantedPerson {
  uid: string;
  username: string;
  /** Total stolen across their open warrants. */
  amount: number;
  cases: number;
  /** When the NPC police will pick them up. */
  autoAt: number;
  /** Bounties on them: whoever arrests them collects it. Bounty hunters also see where they are. */
  bounty: number;
  /** Roughly where they are right now ('city:kaduna', 'place:kaduna:market', 'estate:...', 'home'), or null if offline. */
  seen: string | null;
  /** Their position in that area, so an officer can find them. */
  x?: number;
  z?: number;
}

/** A player sitting in a cell. */
export interface Prisoner {
  uid: string;
  username: string;
  until: number;
}
