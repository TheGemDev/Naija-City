-- Snap, Snapchat-style (worker/snaps.ts): who a snap is for, who has seen it, snaps sent straight to friends, and streaks.
-- audience: 0 everyone (friends' stories and Spotlight, as every snap was before), 1 friends' stories only,
-- 2 only the friends it was sent to (snap_sends).
ALTER TABLE snaps ADD COLUMN audience INTEGER NOT NULL DEFAULT 0;

-- One row per player who opened a snap (never its owner): the view counts, and the grey ring on stories already seen.
CREATE TABLE snap_views (
  snap_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (snap_id, uid)
);

-- A snap sent to a friend. It opens once; opened_at is when.
CREATE TABLE snap_sends (
  snap_id INTEGER NOT NULL,
  to_uid TEXT NOT NULL,
  opened_at INTEGER,
  PRIMARY KEY (snap_id, to_uid)
);
CREATE INDEX snap_sends_to ON snap_sends(to_uid, snap_id);

-- Streaks between two friends (a < b), counted in Lagos days: the streak grows on each day both sent the other a
-- snap, and is lost once a whole day passes without that. a_day and b_day are the last day each side sent one.
CREATE TABLE snap_streaks (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  a_day INTEGER NOT NULL DEFAULT -1,
  b_day INTEGER NOT NULL DEFAULT -1,
  day INTEGER NOT NULL DEFAULT -1,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (a, b)
);

-- Views and sends go with their snap, like its likes and comments (snaps_cascade in 0057).
CREATE TRIGGER snaps_cascade_seen
AFTER DELETE ON snaps
BEGIN
  DELETE FROM snap_views WHERE snap_id = OLD.id;
  DELETE FROM snap_sends WHERE snap_id = OLD.id;
END;
