-- Players are keyed by their Firebase uid.
CREATE TABLE players (
  uid TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

-- One save blob per player (SaveData in src/game/save.ts).
CREATE TABLE saves (
  uid TEXT PRIMARY KEY REFERENCES players(uid),
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);
