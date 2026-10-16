-- Unread badges on the phone's apps (worker/badges.ts): when each player last opened each app, so its badge counts only
-- what came after. `mark` is a row-id watermark for apps whose news is a stream of rows (Twitter: the feed's last id).
CREATE TABLE app_seen (
  uid TEXT NOT NULL,
  app TEXT NOT NULL,
  at INTEGER NOT NULL,
  mark INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, app)
);

-- When each like was given, so a badge can count the likes since I last looked. Likes from before this read as 0 (old).
ALTER TABLE feed_likes ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE snap_likes ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;

-- The Messages badge counts unread DMs on every badge poll: only the unread ones are indexed.
CREATE INDEX messages_unread ON messages(to_uid) WHERE read_at IS NULL;
