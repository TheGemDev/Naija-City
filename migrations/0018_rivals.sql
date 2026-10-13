-- Player-hosted owambes at Murtala Square (worker/owambe.ts). One runs at a time; guests spray the host.
CREATE TABLE owambes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('wedding', 'birthday', 'naming', 'chieftaincy')),
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  -- Total sprayed on the host.
  sprayed INTEGER NOT NULL DEFAULT 0,
  -- The end-of-party post went out on the feed.
  wrapped INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX owambes_ends ON owambes(ends_at);
CREATE INDEX owambes_host ON owambes(host_uid, starts_at);

-- Who the host invited, and how much each guest sprayed on the host.
CREATE TABLE owambe_guests (
  owambe_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  invited INTEGER NOT NULL DEFAULT 0,
  sprayed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owambe_id, uid)
);

-- Paid protection (worker/crime.ts): a bodyguard against pickpockets, a mai-gadi (gateman) at the house.
CREATE TABLE protection (
  uid TEXT PRIMARY KEY,
  bodyguard_until INTEGER,
  gateman_until INTEGER
);

-- Bounties a victim puts on a wanted thief (held by the state until the arrest), and the guard who
-- caught a thief in the act (the case goes straight to 'wanted').
ALTER TABLE crimes ADD COLUMN bounty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crimes ADD COLUMN guard TEXT;

-- Crew bank heists (worker/bank.ts). Each member's attempt also lands in bank_heists for the cooldown.
CREATE TABLE heist_crews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_uid TEXT NOT NULL,
  bank_area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'done', 'failed', 'cancelled')),
  snitch_uid TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX heist_crews_open ON heist_crews(status, bank_area);

CREATE TABLE heist_members (
  crew_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (crew_id, uid)
);
CREATE INDEX heist_members_uid ON heist_members(uid);
