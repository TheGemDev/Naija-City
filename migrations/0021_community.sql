-- Friends, crews, quests and seasons (src/game/community.ts, worker/community.ts).

-- One row per pair, stored with the smaller uid first. 'pending' = a asked b; accepted rows are friends.
CREATE TABLE friendships (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  asker TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  PRIMARY KEY (a, b)
);
CREATE INDEX friendships_b ON friendships(b);
CREATE INDEX friendships_accepted ON friendships(accepted_at);

CREATE TABLE crews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  leader_uid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- A player is in at most one crew.
CREATE TABLE crew_members (
  uid TEXT PRIMARY KEY,
  crew_id INTEGER NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX crew_members_crew ON crew_members(crew_id);

-- Claimed quests; the primary key is what stops a quest paying twice in one period.
CREATE TABLE quest_claims (
  uid TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  period INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (uid, quest_id, period)
);

CREATE TABLE season_points (
  season INTEGER NOT NULL,
  uid TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season, uid)
);
CREATE INDEX season_points_rank ON season_points(season, points DESC);

-- Prizes for finished seasons, written once when the season is settled and collected by the winner.
CREATE TABLE season_prizes (
  season INTEGER NOT NULL,
  uid TEXT NOT NULL,
  rank INTEGER NOT NULL,
  prize INTEGER NOT NULL,
  title TEXT NOT NULL,
  claimed_at INTEGER,
  PRIMARY KEY (season, uid)
);
CREATE TABLE seasons_settled (season INTEGER PRIMARY KEY, settled_at INTEGER NOT NULL);
