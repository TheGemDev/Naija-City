-- An office holder who loots a treasury opens a case with the EFCC chair (worker/civic.ts). The looter can offer the chair a
-- share of the loot; the chair decides whether the looter goes down for it. The offer is held out of the looter's wallet
-- until the chair decides (or the case runs out), so it can't be promised and not paid.
CREATE TABLE loot_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  looter_uid TEXT NOT NULL,
  chair_uid TEXT NOT NULL,
  -- The office the looter held, and the state whose treasury they took from (null: the federal one).
  office TEXT NOT NULL,
  city TEXT,
  amount INTEGER NOT NULL,
  -- The bribe on offer, in naira, once the looter has made one.
  offer INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'refused', 'expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX loot_cases_chair ON loot_cases(chair_uid, status);
CREATE INDEX loot_cases_looter ON loot_cases(looter_uid, status);
