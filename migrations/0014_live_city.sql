-- Income tax on work pay and side-hustle earnings goes into a shared treasury the government spends
-- (palliatives, road projects... or a snake swallows it). See worker/wallet.ts and worker/civic.ts.
ALTER TABLE civic_policies ADD COLUMN treasury INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN palliative_at INTEGER;

-- Campaign posters stuck up round the city for an election.
CREATE TABLE civic_posters (
  election_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  office TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (election_id, uid)
);

-- The governor's "road project" dug up a rival's street until this time; office holders' last embezzlement.
ALTER TABLE players ADD COLUMN road_block_until INTEGER;
ALTER TABLE players ADD COLUMN embezzled_at INTEGER;

-- Kaduna Gist: the city's social feed. Server-written posts (crimes, elections, big wins) have kind != 'post'.
CREATE TABLE feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT,
  kind TEXT NOT NULL,
  icon TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX feed_by_uid ON feed(uid, kind, created_at);
CREATE TABLE feed_likes (
  post_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  PRIMARY KEY (post_id, uid)
);

-- Bets on the live cup final (src/game/live.ts). One bet per player per final; settled at full time.
CREATE TABLE bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  slot INTEGER NOT NULL,
  pick TEXT NOT NULL CHECK (pick IN ('home', 'draw', 'away')),
  stake INTEGER NOT NULL CHECK (stake > 0),
  payout INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (uid, slot)
);
CREATE INDEX bets_open ON bets(payout, slot);
CREATE TABLE live_results (
  slot INTEGER PRIMARY KEY,
  result TEXT NOT NULL,
  score TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- "Yahoo" scams: a payment request dressed up as a prize or an emergency. Victims can report to the EFCC.
CREATE TABLE scams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scammer_uid TEXT NOT NULL,
  victim_uid TEXT NOT NULL,
  message_id INTEGER,
  template TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'caught', 'paid', 'reported', 'cleared')),
  created_at INTEGER NOT NULL
);
CREATE INDEX scams_scammer ON scams(scammer_uid, created_at);
CREATE INDEX scams_victim ON scams(victim_uid, created_at);
CREATE INDEX scams_message ON scams(message_id);

-- Motor parks run by godfathers who collect dues (src/game/underworld.ts).
CREATE TABLE parks (
  id TEXT PRIMARY KEY,
  boss_uid TEXT,
  since INTEGER,
  collected_at INTEGER,
  levies INTEGER NOT NULL DEFAULT 0,
  shield_until INTEGER
);
CREATE TABLE underworld (
  uid TEXT PRIMARY KEY,
  turf_wins INTEGER NOT NULL DEFAULT 0,
  escapes INTEGER NOT NULL DEFAULT 0,
  escape_at INTEGER
);
