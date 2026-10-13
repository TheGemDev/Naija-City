-- Street Games (worker/games.ts): tables where players play each other at Belt, Ten-Ten, Street Dice, Ayo and Whot.
-- Every player pays the stake when they sit down; the pot is paid out (or stakes returned) when the match ends.
CREATE TABLE game_matches (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  host TEXT NOT NULL,
  stake INTEGER NOT NULL,
  seats INTEGER NOT NULL,
  -- open (waiting for players) | live | done | void (closed with stakes returned)
  status TEXT NOT NULL,
  -- JSON array of uids, in seat order.
  players TEXT NOT NULL,
  -- JSON game state. Server only: players are sent a view with the hidden parts removed.
  state TEXT,
  -- Goes up on every change; an update only lands if it still matches, so two moves at once can't both win.
  version INTEGER NOT NULL DEFAULT 0,
  -- uid of the one player a private challenge is for (null: anyone can sit).
  invite TEXT,
  -- JSON array of the winners' uids once done.
  winner TEXT,
  -- Stakes paid in.
  pot INTEGER NOT NULL DEFAULT 0,
  -- 1 once the pot (or the refunds) has been paid.
  paid INTEGER NOT NULL DEFAULT 0,
  -- open: when the table closes. live: when the players who still have to move forfeit.
  deadline INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX game_matches_status ON game_matches(status, updated_at);

-- Lifetime record per player per game, for the champions board.
CREATE TABLE game_stats (
  uid TEXT NOT NULL,
  game TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  -- Winnings minus stakes.
  net INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, game)
);
CREATE INDEX game_stats_game ON game_stats(game, won);
