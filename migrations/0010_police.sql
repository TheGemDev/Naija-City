-- Player theft and police reports. Thefts are checked and settled by the server (worker/crime.ts).
CREATE TABLE crimes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thief_uid TEXT NOT NULL,
  victim_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pickpocket', 'burglary')),
  success INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  item TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'arrested')),
  returned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX crimes_victim ON crimes(victim_uid, created_at);
CREATE INDEX crimes_thief ON crimes(thief_uid, created_at);

-- Arrested players sit in a cell until this time (ms).
ALTER TABLE players ADD COLUMN jailed_until INTEGER;

-- New elected offices: the DPO (head of police) and the EFCC chair, and their laws. Every office now
-- has a term; a new election can only open when the office is empty or its term is nearly up.
ALTER TABLE civic_policies ADD COLUMN dpo_uid TEXT REFERENCES players(uid);
ALTER TABLE civic_policies ADD COLUMN efcc_uid TEXT REFERENCES players(uid);
ALTER TABLE civic_policies ADD COLUMN governor_term_ends INTEGER;
ALTER TABLE civic_policies ADD COLUMN president_term_ends INTEGER;
ALTER TABLE civic_policies ADD COLUMN dpo_term_ends INTEGER;
ALTER TABLE civic_policies ADD COLUMN efcc_term_ends INTEGER;
ALTER TABLE civic_policies ADD COLUMN patrols INTEGER NOT NULL DEFAULT 50 CHECK (patrols BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN jail_minutes INTEGER NOT NULL DEFAULT 5 CHECK (jail_minutes BETWEEN 1 AND 30);
ALTER TABLE civic_policies ADD COLUMN fine_pct INTEGER NOT NULL DEFAULT 25 CHECK (fine_pct BETWEEN 0 AND 200);
ALTER TABLE civic_policies ADD COLUMN report_hours INTEGER NOT NULL DEFAULT 48 CHECK (report_hours BETWEEN 6 AND 72);

-- civic_elections.office only allowed governor/president. SQLite can't change a CHECK, so rebuild the
-- election tables. Candidates and votes are copied aside first: dropping a parent table would cascade.
CREATE TABLE civic_elections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office TEXT NOT NULL CHECK (office IN ('governor', 'president', 'dpo', 'efcc')),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  winner_uid TEXT REFERENCES players(uid)
);
INSERT INTO civic_elections_new SELECT * FROM civic_elections;
CREATE TABLE civic_candidates_bak AS SELECT * FROM civic_candidates;
CREATE TABLE civic_votes_bak AS SELECT * FROM civic_votes;
DROP TABLE civic_votes;
DROP TABLE civic_candidates;
DROP TABLE civic_elections;
ALTER TABLE civic_elections_new RENAME TO civic_elections;
CREATE UNIQUE INDEX civic_one_open_election_per_office
  ON civic_elections(office) WHERE status = 'open';

CREATE TABLE civic_candidates (
  election_id INTEGER NOT NULL REFERENCES civic_elections(id) ON DELETE CASCADE,
  uid TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
  support INTEGER NOT NULL DEFAULT 0,
  last_action_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (election_id, uid)
);
CREATE TABLE civic_votes (
  election_id INTEGER NOT NULL REFERENCES civic_elections(id) ON DELETE CASCADE,
  voter_uid TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
  candidate_uid TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (election_id, voter_uid),
  FOREIGN KEY (election_id, candidate_uid) REFERENCES civic_candidates(election_id, uid) ON DELETE CASCADE
);
INSERT INTO civic_candidates SELECT * FROM civic_candidates_bak;
INSERT INTO civic_votes SELECT * FROM civic_votes_bak;
DROP TABLE civic_candidates_bak;
DROP TABLE civic_votes_bak;
