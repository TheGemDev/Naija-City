-- Allow house invites in messages:
--   kind 'invite'  invite to visit the sender's house; status 'open' | 'accepted' | 'declined'
-- SQLite can't alter a CHECK constraint, so rebuild the table keeping ids.
CREATE TABLE messages_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_uid TEXT NOT NULL,
  to_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'pay', 'request', 'invite')),
  text TEXT NOT NULL DEFAULT '',
  amount INTEGER,
  status TEXT,
  ref INTEGER,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
INSERT INTO messages_new (id, from_uid, to_uid, kind, text, amount, status, ref, created_at, read_at)
  SELECT id, from_uid, to_uid, kind, text, amount, status, ref, created_at, read_at FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
CREATE INDEX messages_to ON messages(to_uid, id);
CREATE INDEX messages_from ON messages(from_uid, id);
CREATE INDEX messages_pending_pay ON messages(to_uid, status) WHERE kind = 'pay';
