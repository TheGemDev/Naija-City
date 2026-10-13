-- Likes and comments on snaps (worker/snaps.ts), the same way Twitter has them. They only last as long as the
-- snap does: the trigger takes them when the snap goes, whether its owner deleted it or the hourly sweep did.
CREATE TABLE snap_likes (
  snap_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  PRIMARY KEY (snap_id, uid)
);

CREATE TABLE snap_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snap_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX snap_comments_by_snap ON snap_comments(snap_id, id);
CREATE INDEX snap_comments_by_uid ON snap_comments(uid, created_at);

CREATE TRIGGER snaps_cascade
AFTER DELETE ON snaps
BEGIN
  DELETE FROM snap_likes WHERE snap_id = OLD.id;
  DELETE FROM snap_comments WHERE snap_id = OLD.id;
END;
