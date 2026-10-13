-- Investment units per player, tracked by the server so dividends and liquidation can be checked.
CREATE TABLE holdings (
  uid TEXT NOT NULL,
  inv_id TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 0,
  accrued_clock REAL NOT NULL,   -- server clock up to which dividends have been credited
  PRIMARY KEY (uid, inv_id)
);
-- Dividends that have matured on the server clock but not been collected yet.
ALTER TABLE players ADD COLUMN dividend_credit INTEGER NOT NULL DEFAULT 0;
