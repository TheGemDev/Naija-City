-- Group hangouts and love (src/game/hangout.ts, worker/hangout.ts).

CREATE TABLE hangouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host_uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  crew_id INTEGER,
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  settled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX hangouts_ends ON hangouts(settled, ends_at);
CREATE INDEX hangouts_host ON hangouts(host_uid, starts_at);

CREATE TABLE hangout_guests (
  hangout_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (hangout_id, uid)
);
CREATE INDEX hangout_guests_uid ON hangout_guests(uid, joined_at);

-- A player is in at most one relationship. a < b. status: asked_date | dating | asked_marry | married.
-- For the asked_* states, `asker` is who asked; the ring is already paid.
CREATE TABLE couples (
  a TEXT NOT NULL PRIMARY KEY,
  b TEXT NOT NULL UNIQUE,
  asker TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('asked_date', 'dating', 'asked_marry', 'married')),
  since INTEGER NOT NULL,
  dating_since INTEGER,
  bond INTEGER NOT NULL DEFAULT 0
);
