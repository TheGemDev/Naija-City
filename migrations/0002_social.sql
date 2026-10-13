-- Public, unique handle. Always stored lowercase: 3-15 of a-z, 0-9, _.
ALTER TABLE players ADD COLUMN username TEXT;
CREATE UNIQUE INDEX players_username ON players(username);

-- Direct messages between players. Money moves through here too:
--   kind 'text'    plain message
--   kind 'pay'     money sent; status 'pending' until the recipient's game claims it, then 'claimed'
--   kind 'request' money asked for; status 'open' | 'paid' | 'declined'
-- A pay that settles a request points at it with ref.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_uid TEXT NOT NULL,
  to_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'pay', 'request')),
  text TEXT NOT NULL DEFAULT '',
  amount INTEGER,
  status TEXT,
  ref INTEGER,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX messages_to ON messages(to_uid, id);
CREATE INDEX messages_from ON messages(from_uid, id);
CREATE INDEX messages_pending_pay ON messages(to_uid, status) WHERE kind = 'pay';
