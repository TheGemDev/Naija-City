-- Allow love cards in a chat:
--   kind 'love'  asks the recipient out (text 'date') or proposes (text 'marry'); status 'open' | 'accepted' | 'declined'
CREATE TABLE messages_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_uid TEXT NOT NULL,
  to_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'pay', 'request', 'invite', 'visit', 'love')),
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
