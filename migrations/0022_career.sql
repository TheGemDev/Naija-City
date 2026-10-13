-- Skills and businesses (src/game/career.ts, worker/career.ts).

CREATE TABLE skills (
  uid TEXT NOT NULL,
  skill TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  trained_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, skill)
);

-- One of each business type per player. Income accrues while stocked_until is in the future and is
-- settled into pending_* whenever the business changes, so staff and level changes never rewrite history.
CREATE TABLE businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  staff INTEGER NOT NULL DEFAULT 0,
  stocked_until INTEGER NOT NULL DEFAULT 0,
  last_settle INTEGER NOT NULL,
  pending_net INTEGER NOT NULL DEFAULT 0,
  pending_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (uid, type)
);
