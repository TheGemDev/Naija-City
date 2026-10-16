-- Every time the server undoes part of a save it can't verify (worker/index.ts PUT /api/save): who, when, and what, so
-- "some progress couldn't be verified" can be traced to its cause. Pruned after 14 days (worker/cron.ts).
CREATE TABLE save_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  at INTEGER NOT NULL,
  why TEXT NOT NULL
);
CREATE INDEX save_corrections_at ON save_corrections (at);
