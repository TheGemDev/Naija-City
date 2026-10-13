-- Snap: pictures taken with the in-game camera, shown to friends and the whole city for one real day (worker/snaps.ts).
-- The picture itself is in R2 under media_key; the hourly sweep deletes the object and this row together.
CREATE TABLE snaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  media_key TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX snaps_by_time ON snaps(created_at);
CREATE INDEX snaps_by_uid ON snaps(uid, created_at);
