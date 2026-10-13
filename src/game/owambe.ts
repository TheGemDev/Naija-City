// Player-hosted owambes at each city's square (Murtala Square in Kaduna, Eagle Square in Abuja), and spraying money on real players. Shared by the game and
// the server (worker/owambe.ts), which moves the money and keeps the party's spray board.

import { getRegion, placeNameIn, regionPlace } from './regions';

export type PartyKind = 'wedding' | 'birthday' | 'naming' | 'chieftaincy';

export const PARTY_KINDS: Record<PartyKind, { label: string; icon: string; title: (name: string) => string }> = {
  wedding: { label: 'Wedding', icon: '💍', title: (n) => `@${n}’s wedding` },
  birthday: { label: 'Birthday bash', icon: '🎂', title: (n) => `@${n}’s birthday bash` },
  naming: { label: 'Naming ceremony', icon: '👶🏾', title: (n) => `@${n}’s naming ceremony` },
  chieftaincy: { label: 'Chieftaincy title', icon: '👑', title: (n) => `@${n}’s chieftaincy turbaning` },
};

export const PARTY = {
  /** Hall, DJ, canopies and jollof for everyone. Paid to the state. */
  fee: 50_000,
  /** A hosted party runs this long (real time). Each city's square holds one at a time. */
  durationMs: 30 * 60_000,
  /** One party per host per this long. */
  hostCooldownMs: 6 * 3600_000,
  maxInvites: 30,
  /** What you can spray in one go. */
  sprays: [1_000, 5_000, 20_000, 100_000] as const,
  /** A spray this big makes Naija Gist. */
  headline: 100_000,
  /** How far outside the square's edge still counts as at the party. */
  margin: 3,
};

/** A hosted party as the game sees it. */
export interface Party {
  id: number;
  kind: PartyKind;
  title: string;
  host: { uid: string; username: string };
  /** The city whose square it is booked at. */
  city: string;
  endsAt: number;
  sprayed: number;
  /** Biggest sprayers on the celebrant so far. */
  top: { username: string; amount: number }[];
  /** You're on the guest list (the host always is). */
  invited: boolean;
  isHost: boolean;
}

/** The place every city holds its owambes at. */
export const SQUARE_ID = 'murtala';
/** That city's square by name. */
export const squareName = (city?: string | null) => placeNameIn(city, SQUARE_ID);

/** The city whose square a reported position is at (on the square itself, or right at its edge), or null. */
export function squareCity(pos: { area: string; x: number; z: number } | null | undefined): string | null {
  const at = pos?.area.match(/^(city|place):([\w-]+)(?::([\w-]+))?$/);
  const city = at && getRegion(at[2])?.id;
  if (!pos || !at || !city) return null;
  if (at[1] === 'place') return at[3] === SQUARE_ID ? city : null;
  const sq = regionPlace(city, SQUARE_ID);
  if (!sq) return null;
  const m = PARTY.margin;
  return pos.x >= sq.x - m && pos.x <= sq.x + sq.w + m && pos.z >= sq.z - m && pos.z <= sq.z + sq.d + m ? city : null;
}
