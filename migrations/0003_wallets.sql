-- Server-authoritative money. The save blob's `money` is only a cache; this is the truth.
CREATE TABLE wallets (
  uid TEXT PRIMARY KEY,
  balance INTEGER NOT NULL,
  reset_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- Every change to a balance. client_id makes client events idempotent (safe to retry).
--   kind: work | sell | spend | buy | transfer_in | transfer_out | start | reset
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  client_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT,
  amount INTEGER NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (uid, client_id)
);
CREATE INDEX ledger_uid_kind ON ledger(uid, kind, created_at);
