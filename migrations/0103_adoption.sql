-- Adoption (Phone → Adopt; rules in src/game/kids.ts, server in worker/kids.ts). A child's needs are not ticked:
-- the row holds one snapshot (hunger, sleep, hygiene, play, health, sick at needs_at) and the server works out the
-- rest from the clock on every read. The cron only visits rows whose next_check_at has come, to send a push.
CREATE TABLE children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  -- The listing they were adopted from ('<day>:<n>', src/game/kids.ts offersFor).
  offer_key TEXT NOT NULL,
  name TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('m', 'f')),
  look TEXT NOT NULL,
  story TEXT NOT NULL,
  home TEXT NOT NULL,
  -- Real ms they were "born": their age is (now - born_at) / KID_YEAR_MS years.
  born_at INTEGER NOT NULL,
  -- pending (paperwork) | home | taken (by Social Welfare, can be reclaimed) | rehomed | grown | legacy (a past life's)
  status TEXT NOT NULL CHECK (status IN ('pending', 'home', 'taken', 'rehomed', 'grown', 'legacy')),
  applied_at INTEGER NOT NULL,
  ready_at INTEGER NOT NULL,
  adopted_at INTEGER,
  hunger REAL NOT NULL DEFAULT 100,
  sleep REAL NOT NULL DEFAULT 100,
  hygiene REAL NOT NULL DEFAULT 100,
  play REAL NOT NULL DEFAULT 100,
  health REAL NOT NULL DEFAULT 100,
  sick INTEGER NOT NULL DEFAULT 0,
  needs_at INTEGER NOT NULL,
  asleep_until INTEGER NOT NULL DEFAULT 0,
  school_until INTEGER NOT NULL DEFAULT 0,
  -- Social Welfare warnings: how many stand, when the last was written, and whether this dip has had one already.
  strikes INTEGER NOT NULL DEFAULT 0,
  strike_at INTEGER NOT NULL DEFAULT 0,
  warned INTEGER NOT NULL DEFAULT 0,
  taken_at INTEGER,
  -- JSON [{ id, at, seen }]: first words, first steps, birthdays...
  milestones TEXT NOT NULL DEFAULT '[]',
  -- Push rate limit: the last push for this child, and which alerts it has already been told about this dip.
  push_at INTEGER NOT NULL DEFAULT 0,
  pushed TEXT NOT NULL DEFAULT '',
  -- Each care's last use (JSON { care: ms }), so a tap can't be sent twice.
  cared TEXT NOT NULL DEFAULT '{}',
  next_check_at INTEGER
);
CREATE INDEX children_by_uid ON children(uid, status);
CREATE INDEX children_due ON children(next_check_at) WHERE next_check_at IS NOT NULL;

-- A nanny looks after every child in the house until `until` (real ms).
CREATE TABLE nannies (
  uid TEXT PRIMARY KEY,
  until INTEGER NOT NULL
);
