-- Cribs: house style scores, visitor ratings, house tours, saved layouts and interior designer jobs (worker/cribs.ts,
-- rules in src/game/cribs.ts).

-- Each house's crib score as the server last worked it out from the owner's saved house (never from the client's say-so).
-- base is the 0-100 style score; score is base with the visitor rating folded in (what lists and badges show).
CREATE TABLE crib_scores (
  uid TEXT NOT NULL,
  pid TEXT NOT NULL,
  design TEXT,
  city TEXT NOT NULL,
  base INTEGER NOT NULL,
  score INTEGER NOT NULL,
  tier TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  items INTEGER NOT NULL DEFAULT 0,
  parts TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (uid, pid)
) WITHOUT ROWID;
CREATE INDEX crib_scores_by_city ON crib_scores(city, score DESC);
CREATE INDEX crib_scores_by_score ON crib_scores(score DESC);

-- A visit the server saw happen: written when a guest the room let in (invited, never a burglar) checks in.
-- A rating needs one of these, at least a few seconds old, from the last day.
CREATE TABLE crib_visits (
  visitor_uid TEXT NOT NULL,
  owner_uid TEXT NOT NULL,
  pid TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (visitor_uid, owner_uid, pid)
) WITHOUT ROWID;
CREATE INDEX crib_visits_by_time ON crib_visits(at);

-- One rating per visitor per house per day (day = UTC day number).
CREATE TABLE crib_ratings (
  rater_uid TEXT NOT NULL,
  owner_uid TEXT NOT NULL,
  pid TEXT NOT NULL,
  day INTEGER NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (rater_uid, owner_uid, pid, day)
) WITHOUT ROWID;
CREATE INDEX crib_ratings_by_house ON crib_ratings(owner_uid, pid, created_at);

-- House tours on the Cribs feed. layout is the house as it stood when posted, so the card can draw its plan.
CREATE TABLE crib_tours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  pid TEXT NOT NULL,
  city TEXT NOT NULL,
  -- Where the house stands (estate and plot), so a guest can travel there; null for a starter house.
  region TEXT,
  slot INTEGER,
  caption TEXT NOT NULL DEFAULT '',
  snap_id INTEGER,
  open INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL,
  tier TEXT NOT NULL,
  layout TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX crib_tours_by_time ON crib_tours(created_at);
CREATE INDEX crib_tours_by_uid ON crib_tours(uid, created_at);

-- Saved layouts: a named snapshot of one house's arrangement, paint and decorating data.
CREATE TABLE crib_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  name TEXT NOT NULL,
  design TEXT,
  snapshot TEXT NOT NULL,
  items INTEGER NOT NULL,
  value INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX crib_layouts_by_uid ON crib_layouts(uid, created_at);

-- Interior designer jobs. The client's fee and budget sit in escrow (taken from their wallet when they hire);
-- the designer edits a draft of the house on the server; on approval the fee goes to the designer and what is
-- left of the budget back to the client; on revert the client gets everything back but the call-out share.
CREATE TABLE design_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uid TEXT NOT NULL,
  designer_uid TEXT NOT NULL,
  pid TEXT NOT NULL,
  design TEXT,
  fee INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  base TEXT NOT NULL,
  draft TEXT NOT NULL,
  hours INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  expires_at INTEGER,
  submitted_at INTEGER,
  settled_at INTEGER,
  delivered INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX design_jobs_by_client ON design_jobs(client_uid, created_at);
CREATE INDEX design_jobs_by_designer ON design_jobs(designer_uid, created_at);
CREATE INDEX design_jobs_by_status ON design_jobs(status, expires_at);

-- Everything that happened on a job, for both sides to read.
CREATE TABLE design_job_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX design_job_log_by_job ON design_job_log(job_id, id);
