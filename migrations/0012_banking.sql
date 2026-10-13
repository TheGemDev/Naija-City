CREATE TABLE bank_accounts (
  uid TEXT PRIMARY KEY,
  savings INTEGER NOT NULL DEFAULT 0 CHECK (savings >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE bank_transactions (
  uid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdraw')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, request_id)
);

CREATE TABLE bank_heists (
  uid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  jailed_until INTEGER,
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, request_id)
);
CREATE INDEX bank_heists_recent ON bank_heists(uid, created_at);
