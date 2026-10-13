// Crew bank heists: a leader plans the job inside a bank branch, other players join the crew there, and
// the leader calls it. Bigger crews are likelier to pull it off and the loot is split evenly. Any crew
// member can quietly tip off the police first: the job fails, everyone else goes to a cell, and the
// snitch collects a reward. Shared by the game and the server (worker/bank.ts).

export const CREW = {
  maxSize: 4,
  /** A crew that hasn't gone in by now breaks up. */
  planMs: 10 * 60_000,
  /** Knowledge the leader needs (same as a solo heist). */
  leaderKnowledge: 5,
  /** Loot per crew member who goes in. */
  lootPerHead: 45_000,
  /** The police pay a snitch this. */
  snitchReward: 20_000,
  jailMs: 15 * 60_000,
};

/** Odds for a crew: the leader's know-how plus a bump for every extra pair of hands. */
export const crewChance = (leaderKnowledge: number, size: number) =>
  Math.min(0.7, 0.12 + leaderKnowledge * 0.03 + Math.max(0, size - 1) * 0.1);

export interface CrewInfo {
  id: number;
  leader: { uid: string; username: string };
  members: { uid: string; username: string }[];
  expiresAt: number;
  /** Odds if they went in right now. */
  chance: number;
  /** You're in it. */
  mine: boolean;
  /** You already tipped off the police (only ever shown to the snitch). */
  snitched?: boolean;
}

export interface CrewResult {
  success: boolean;
  /** Your cut (0 on failure). */
  share: number;
  size: number;
  jailedUntil: number | null;
  /** The job failed because someone talked. */
  betrayed: boolean;
  /** You were the one who talked: this is your reward. */
  snitchReward?: number;
}
