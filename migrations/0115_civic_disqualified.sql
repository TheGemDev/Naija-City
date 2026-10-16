-- Candidates thrown out of a race (worker/civic.ts vote-buying sting, worker/efcc.ts fake-votes conviction). Their
-- civic_candidates row is still deleted, so tallies and the winner never count them; this keeps their name on the board,
-- struck through, and stops them filing into the same race again. Out of that election only: the next one is open to them.
CREATE TABLE civic_disqualified (
  election_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('vote_buying', 'fake_votes')),
  at INTEGER NOT NULL,
  PRIMARY KEY (election_id, uid)
);
