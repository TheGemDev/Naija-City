-- What each player owns in their current life that came through the ledger: bought + taken in, less sold + stolen
-- (the starter set of an origin is added in code, worker/progress.ts). It was counted from the player's whole ledger
-- on every wallet sync, which gets slower the longer they play; this keeps the answer ready.
-- The ledger stays the record. Triggers keep this table in step with it, so no code that writes the ledger changes.
CREATE TABLE owned (
  uid TEXT NOT NULL,
  ref TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (uid, ref)
) WITHOUT ROWID;

-- Wallet events go in unapplied and are applied in the same batch (worker/wallet.ts applyStmts).
CREATE TRIGGER owned_on_apply
AFTER UPDATE OF applied ON ledger
WHEN NEW.applied = 1 AND OLD.applied = 0 AND NEW.ref IS NOT NULL AND NEW.kind IN ('buy', 'sell', 'stolen', 'stolen_in')
BEGIN
  INSERT INTO owned (uid, ref, n) VALUES (NEW.uid, NEW.ref, CASE WHEN NEW.kind IN ('buy', 'stolen_in') THEN 1 ELSE -1 END)
  ON CONFLICT(uid, ref) DO UPDATE SET n = n + excluded.n;
END;

-- Burglaries, the black market and the like write their lines already applied.
CREATE TRIGGER owned_on_insert
AFTER INSERT ON ledger
WHEN NEW.applied = 1 AND NEW.ref IS NOT NULL AND NEW.kind IN ('buy', 'sell', 'stolen', 'stolen_in')
BEGIN
  INSERT INTO owned (uid, ref, n) VALUES (NEW.uid, NEW.ref, CASE WHEN NEW.kind IN ('buy', 'stolen_in') THEN 1 ELSE -1 END)
  ON CONFLICT(uid, ref) DO UPDATE SET n = n + excluded.n;
END;

-- A new life starts with nothing from the old one.
CREATE TRIGGER owned_on_reset
AFTER UPDATE OF reset_at ON wallets
WHEN NEW.reset_at IS NOT OLD.reset_at
BEGIN
  DELETE FROM owned WHERE uid = NEW.uid;
END;

-- Everyone's count as it stands. It replaces anything the triggers wrote since they were made a moment ago.
INSERT INTO owned (uid, ref, n)
SELECT l.uid, l.ref, SUM(CASE WHEN l.kind IN ('buy', 'stolen_in') THEN 1 ELSE -1 END)
FROM ledger l
LEFT JOIN wallets w ON w.uid = l.uid
WHERE l.kind IN ('buy', 'sell', 'stolen', 'stolen_in') AND l.applied = 1 AND l.ref IS NOT NULL
  AND l.created_at > COALESCE(w.reset_at, 0)
GROUP BY l.uid, l.ref
ON CONFLICT(uid, ref) DO UPDATE SET n = excluded.n;
