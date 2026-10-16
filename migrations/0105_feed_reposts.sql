-- Twitter reposts and views (worker/fun.ts). A repost is one player passing a post on to their friends: it shows on
-- their friends' Following tab. Views count how many times a post was opened (its thread, or a share link).
CREATE TABLE feed_reposts (
  post_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, uid)
);
CREATE INDEX feed_reposts_uid ON feed_reposts(uid);

-- A post's reposts go with it (the day's sweep, or its author deleting it), like its likes do (feed_cascade).
CREATE TRIGGER feed_reposts_cascade
AFTER DELETE ON feed
BEGIN
  DELETE FROM feed_reposts WHERE post_id = OLD.id;
END;

ALTER TABLE feed ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
