export type BetVenue = 'viewing' | 'pitch' | 'golf';

export const VENUE_BETS: Record<BetVenue, { title: string; prompt: string; picks: { id: string; label: string; chance: number; odds: number }[] }> = {
  viewing: {
    title: 'Viewing-centre match',
    prompt: 'Predict the score result.',
    picks: [
      { id: 'home', label: 'Kaduna United win', chance: 0.45, odds: 2.05 },
      { id: 'draw', label: 'Draw', chance: 0.25, odds: 3.6 },
      { id: 'away', label: 'Kano Pillars win', chance: 0.3, odds: 3.05 },
    ],
  },
  pitch: {
    title: 'Five-a-side',
    prompt: 'Back the home team, away team, or a draw.',
    picks: [
      { id: 'home', label: 'Home team', chance: 0.45, odds: 2.05 },
      { id: 'draw', label: 'Draw', chance: 0.25, odds: 3.6 },
      { id: 'away', label: 'Away team', chance: 0.3, odds: 3.05 },
    ],
  },
  golf: {
    title: 'Golf-club shot',
    prompt: 'Call the next shot: birdie, par, or bogey.',
    picks: [
      { id: 'birdie', label: 'Birdie', chance: 0.2, odds: 4.3 },
      { id: 'par', label: 'Par', chance: 0.55, odds: 1.7 },
      { id: 'bogey', label: 'Bogey', chance: 0.25, odds: 3.4 },
    ],
  },
};

export function drawVenueBet(venue: BetVenue, random: number) {
  let result = random;
  for (const pick of VENUE_BETS[venue].picks) {
    result -= pick.chance;
    if (result < 0) return pick.id;
  }
  return VENUE_BETS[venue].picks.at(-1)!.id;
}
