// National news on Naija Twitter. The News tab is for what the whole country can follow: the people in office
// and what they do with it, elections, the roads, the season, the cup final. News about one player or another
// (who robbed whom, who is dating whom) stays on the Friends tab, where you know the names.

/** The feed kinds the News tab shows (worker/fun.ts). */
export const NEWS_KINDS = ['politics', 'election', 'roads', 'season', 'final'] as const;

/** VDM's posts about the government, told apart from his crime exposés by their icon: these are national news too. */
export const VDM_GOV_ICON = '🎤';
export const VDM_ROADS_ICON = '🚧';
export const VDM_NEWS_ICONS = [VDM_GOV_ICON, VDM_ROADS_ICON];

/** The blogs that carry the news. Each post is one blog's, picked by its id so it never changes. */
export const BLOGS = ['Naija Gist Blog', 'Amebo Daily', '9ja Reporters', 'Arewa Herald', 'Lasgidi Loud', 'Aso Villa Watch'];
export const blogOf = (postId: number) => BLOGS[Math.abs(Math.floor(postId)) % BLOGS.length];

/** Official trips in the state's fleet (worker/news.ts), counted over a real day. */
export const TRIP_NEWS = {
  windowMs: 24 * 3600_000,
  /** The blogs ask questions when an official's trips for the day reach each of these. */
  tooMany: [5, 10, 15, 25, 40],
  /** One blog post per flight to another city, and no more often than this. */
  flightGapMs: 60_000,
};

/** VDM on the government: how often he bothers, and how long he rests between rants (2 game hours). */
export const GOV_RANT = {
  chance: 0.5, gapMs: 5 * 60_000, potholes: 4,
  /** Unprovoked: on each 5-minute tick he may go after whoever is in office for the state of things, about twice an hour. */
  grumble: { chance: 0.34, gapMs: 15 * 60_000 },
  /** The treasury is "sleeping" at this much with no palliatives shared in a day; a tax, loan rate or transfer fee is "too high" from these. */
  idleTreasury: 2_000_000, highTax: 15, highLoan: 20, highFee: 5, lowFunding: 25,
};
