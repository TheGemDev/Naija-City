CREATE TABLE civic_policies (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  governor_uid TEXT REFERENCES players(uid),
  president_uid TEXT REFERENCES players(uid),
  tax_rate INTEGER NOT NULL DEFAULT 10 CHECK (tax_rate BETWEEN 0 AND 20),
  police_funding INTEGER NOT NULL DEFAULT 50 CHECK (police_funding BETWEEN 0 AND 100),
  roads_funding INTEGER NOT NULL DEFAULT 50 CHECK (roads_funding BETWEEN 0 AND 100),
  updated_at INTEGER NOT NULL
);

INSERT INTO civic_policies (id, updated_at) VALUES (1, 0);

CREATE TABLE civic_elections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office TEXT NOT NULL CHECK (office IN ('governor', 'president')),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  winner_uid TEXT REFERENCES players(uid)
);

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
