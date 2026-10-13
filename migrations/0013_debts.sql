ALTER TABLE bank_accounts ADD COLUMN debt INTEGER NOT NULL DEFAULT 0 CHECK (debt >= 0);

INSERT OR IGNORE INTO bank_accounts (uid, savings, updated_at, debt)
SELECT uid, 0, updated_at, 0 FROM wallets WHERE balance < 0;

UPDATE bank_accounts
SET debt = debt + (SELECT -balance FROM wallets WHERE wallets.uid = bank_accounts.uid AND balance < 0),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE uid IN (SELECT uid FROM wallets WHERE balance < 0);

UPDATE wallets SET balance = 0 WHERE balance < 0;

CREATE TABLE debt_payments (
  uid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, request_id)
);
