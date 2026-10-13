-- Abuja has its own government: the FCT Minister runs the capital the way the governor runs Kaduna
-- (src/game/civic.ts). The head of police is the IGP, not a DPO: the office and its columns are renamed.
ALTER TABLE civic_policies RENAME COLUMN dpo_uid TO igp_uid;
ALTER TABLE civic_policies RENAME COLUMN dpo_term_ends TO igp_term_ends;
ALTER TABLE civic_policies ADD COLUMN minister_uid TEXT REFERENCES players(uid);
ALTER TABLE civic_policies ADD COLUMN minister_term_ends INTEGER;

-- Each city's government can ban okada on its own streets.
ALTER TABLE civic_policies ADD COLUMN okada_ban_kaduna INTEGER NOT NULL DEFAULT 0 CHECK (okada_ban_kaduna IN (0, 1));
ALTER TABLE civic_policies ADD COLUMN okada_ban_abuja INTEGER NOT NULL DEFAULT 0 CHECK (okada_ban_abuja IN (0, 1));

-- When an office holder last used a power that has a waiting time (a contract, a pardon).
CREATE TABLE civic_cooldowns (
  uid TEXT NOT NULL,
  action TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (uid, action)
);

-- civic_elections.office only allowed the four old offices. SQLite can't change a CHECK, so rebuild the
-- election tables as 0010 did, this time with no list of offices: the worker checks the office, so the next
-- city needs no rebuild. Candidates and votes are copied aside first: dropping a parent table would cascade.
CREATE TABLE civic_elections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  winner_uid TEXT REFERENCES players(uid)
);
INSERT INTO civic_elections_new (id, office, started_at, ends_at, status, winner_uid)
SELECT id, CASE office WHEN 'dpo' THEN 'igp' ELSE office END, started_at, ends_at, status, winner_uid FROM civic_elections;
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

UPDATE civic_posters SET office = 'igp' WHERE office = 'dpo';
UPDATE civic_news SET office = 'igp' WHERE office = 'dpo';
