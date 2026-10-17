-- NPC citizens (worker/npcs.ts, rules in src/game/npcs.ts): people who live in the states besides the players. They
-- work, pay their state's taxes, buy plots and build in the estates (estate_plots rows with uid = their id, pid 'home'),
-- adopt, vote, steal, give, tweet, move state and japa. Ids are 'npc:<uuid>', like the NPC tenants in rentals.
CREATE TABLE npcs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  job TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  -- 0 (a born criminal) to 100 (a saint), and how hard they push to get ahead (saves more, buys dearer land).
  honesty INTEGER NOT NULL,
  ambition INTEGER NOT NULL,
  -- How they feel about life in their state, 0 to 100: it decides turnout, moving away and japa.
  mood INTEGER NOT NULL DEFAULT 60,
  kids INTEGER NOT NULL DEFAULT 0,
  -- Their house, if they have land: the estate it is in, the design (NULL while bare), stages done, and what it cost.
  region TEXT,
  plot TEXT,
  design TEXT,
  stage INTEGER NOT NULL DEFAULT 0,
  house_spent INTEGER NOT NULL DEFAULT 0,
  jailed_until INTEGER NOT NULL DEFAULT 0,
  arrived_at INTEGER NOT NULL,
  acted_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL
);
CREATE INDEX npcs_due ON npcs(next_at);
CREATE INDEX npcs_city ON npcs(city);

-- Their ballots. civic_votes only takes players, so NPC votes are counted from here as well (worker/civic.ts).
CREATE TABLE npc_votes (
  election_id INTEGER NOT NULL,
  npc_id TEXT NOT NULL,
  candidate_uid TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (election_id, npc_id)
) WITHOUT ROWID;
CREATE INDEX npc_votes_tally ON npc_votes(election_id, candidate_uid);

-- Comings and goings per state per UTC day, for the population counter (Civic app, the state's card on the map).
CREATE TABLE npc_census (
  city TEXT NOT NULL,
  day INTEGER NOT NULL,
  arrived INTEGER NOT NULL DEFAULT 0,
  moved_in INTEGER NOT NULL DEFAULT 0,
  moved_out INTEGER NOT NULL DEFAULT 0,
  japa INTEGER NOT NULL DEFAULT 0,
  born INTEGER NOT NULL DEFAULT 0,
  adopted INTEGER NOT NULL DEFAULT 0,
  arrested INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (city, day)
) WITHOUT ROWID;

-- When the last population round ran.
ALTER TABLE civic_policies ADD COLUMN npc_round_at INTEGER;

-- Who wrote a post that has no player behind it: an NPC citizen's name (kind 'citizen').
ALTER TABLE feed ADD COLUMN author TEXT;
