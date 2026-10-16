// When the police or the EFCC arrest you, they go through your phone. Shady apps from the app store
// (src/game/apps.ts) make the case worse: a bigger fine, a longer stay in the cell, and some apps get
// seized. The EFCC is far harsher about the Yahoo app than the police are. Decided in worker/phoneSearch.ts.

import type { GunSeizure } from './guns';

export type Agency = 'police' | 'efcc';

export interface AppEvidence {
  /** Extra fine on top of the arrest. */
  fine: number;
  /** Extra jail time, as a percent of the base sentence. */
  extraPct: number;
  /** The app is deleted from your phone. */
  seize: boolean;
  /** What the officer says when they find it. */
  line: string;
}

export const PHONE_SEARCH = {
  /** Chance each agency bothers to unlock and search your phone. The EFCC always does. */
  chance: { police: 0.75, efcc: 1 } as Record<Agency, number>,
  evidence: {
    yahoo: {
      police: { fine: 15_000, extraPct: 100, seize: true, line: '“Ehen! Yahoo app? So na you!” Case transferred to the EFCC.' },
      efcc: { fine: 40_000, extraPct: 200, seize: true, line: '“Exhibit A: the Yahoo app, with your scripts inside.” The judge did not laugh.' },
    },
    area: {
      police: { fine: 8_000, extraPct: 50, seize: true, line: 'They scrolled your Area crew chat and found voice notes. Many voice notes.' },
      efcc: { fine: 8_000, extraPct: 50, seize: true, line: 'Your Area crew chat is now an EFCC exhibit.' },
    },
    blackmarket: {
      police: { fine: 20_000, extraPct: 75, seize: true, line: '“Black Market app? Na you dey sell people’s beds?” The officer took screenshots.' },
      efcc: { fine: 25_000, extraPct: 75, seize: true, line: 'Your Black Market sales history is now part of the EFCC file.' },
    },
    plug: {
      police: { fine: 20_000, extraPct: 100, seize: true, line: '“Plug app? Ehen. So na you dey sell cana for this area!” The officer was very happy.' },
      efcc: { fine: 15_000, extraPct: 50, seize: true, line: 'Plug app transactions: drug money laundering. The EFCC added it to the file.' },
    },
    fixer: {
      police: { fine: 25_000, extraPct: 100, seize: true, line: 'Fixer app: hit contracts, kidnap offers, protection money. The officer called his DPO from the toilet.' },
      efcc: { fine: 30_000, extraPct: 75, seize: true, line: 'Fixer app payment history: ransom and protection money, all in your name.' },
    },
    grind: {
      police: { fine: 12_000, extraPct: 50, seize: true, line: 'Dirty Work app: forgery templates and fuel-bunkering schedules. Photocopy for the court.' },
      efcc: { fine: 35_000, extraPct: 100, seize: true, line: 'Dirty Work app: counterfeit-naira printing logs. Exhibit B.' },
    },
    babalawo: {
      police: { fine: 3_000, extraPct: 0, seize: false, line: 'They saw your Baba Online chats. The officer quietly asked for the contact.' },
      efcc: { fine: 10_000, extraPct: 25, seize: false, line: 'Money-ritual receipts on Baba Online. The EFCC wants to know where the money went.' },
    },
  } as Record<string, Record<Agency, AppEvidence>>,
  /** App names for the feed (the worker can't import the app store module, it carries a browser store). */
  labels: { plug: 'the Plug app', fixer: 'the Fixer app', grind: 'the Dirty Work app', yahoo: 'the Yahoo app', area: 'the Area app', babalawo: 'Baba Online', blackmarket: 'the Black Market app' } as Record<string, string>,
  /** Said when the phone is clean. */
  clean: { police: 'Phone clean. The officer looked disappointed.', efcc: 'Your phone was clean. Small mercy.' } as Record<Agency, string>,
};

/** What a phone search turned up, pushed to the arrested player. */
export interface PhoneSearchResult {
  agency: Agency;
  /** False when they didn't bother (or you were lucky). */
  searched: boolean;
  found: string[];
  seized: string[];
  fine: number;
  extraMinutes: number;
  until: number | null;
  lines: string[];
  at: number;
  /** A gun found on them in the pat-down: seized, with its fine (src/game/guns.ts). Not counted in `fine`. */
  gun?: GunSeizure | null;
}
