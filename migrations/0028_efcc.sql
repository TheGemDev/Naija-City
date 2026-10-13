CREATE TABLE efcc_cases (
  id TEXT PRIMARY KEY,
  accuser_uid TEXT NOT NULL,
  target_uid TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('investigating', 'cleared', 'convicted', 'bribed')),
  filed_at INTEGER NOT NULL,
  resolves_at INTEGER NOT NULL,
  audit_json TEXT NOT NULL,
  statement TEXT,
  bribe_attempted INTEGER NOT NULL DEFAULT 0,
  bribe_succeeded INTEGER,
  fine INTEGER,
  seized_property_json TEXT,
  buyback_price INTEGER,
  bought_back_at INTEGER,
  resolved_at INTEGER
);

CREATE INDEX efcc_target_cases ON efcc_cases(target_uid, filed_at DESC);
CREATE INDEX efcc_accuser_cases ON efcc_cases(accuser_uid, filed_at DESC);
CREATE UNIQUE INDEX efcc_one_open_case_per_target ON efcc_cases(target_uid) WHERE status = 'investigating';
