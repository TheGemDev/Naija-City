-- Side hustles the server pays out itself (worker/hustles.ts, rules in src/game/hustles.ts).

-- The daily check-in: the last Lagos day claimed and the run of days in a row.
CREATE TABLE hustle_daily (
  uid TEXT PRIMARY KEY,
  last_day INTEGER NOT NULL,
  streak INTEGER NOT NULL,
  best INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER NOT NULL
);

-- Freelance gigs on the phone: made from a seed, marked on hand-in. Rows older than two days are cleared as players work.
CREATE TABLE freelance_tasks (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  seed INTEGER NOT NULL,
  pay INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  done_at INTEGER,
  score REAL,
  earned INTEGER
);
CREATE INDEX freelance_tasks_uid ON freelance_tasks (uid, started_at);

-- Farm plots outside town: leased once, then planted and harvested.
CREATE TABLE farm_plots (
  uid TEXT NOT NULL,
  slot INTEGER NOT NULL,
  crop TEXT,
  planted_at INTEGER,
  leased_at INTEGER NOT NULL,
  PRIMARY KEY (uid, slot)
);

-- Invite bonuses (migrations/0083_referrals.sql): when the inviter was paid for this signup, and when the newcomer got their welcome.
ALTER TABLE referral_signups ADD COLUMN rewarded_at INTEGER;
ALTER TABLE referral_signups ADD COLUMN welcome_at INTEGER;
