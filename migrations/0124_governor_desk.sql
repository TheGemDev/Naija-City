-- The governor's desk (worker/desk.ts, rules in src/game/desk.ts): crazy matters that land on whoever runs a state, how
-- they were handled, and the twist some choices carry, revealed a little after the choice.
CREATE TABLE gov_desk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  dilemma TEXT NOT NULL,
  -- The governor it landed on: only they may answer it.
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  -- The option chosen, or 'ignored' when the clock ran out. NULL while it is open.
  choice TEXT,
  decided_at INTEGER,
  -- When the twist comes out (rolled when it was chosen); NULL when there is none.
  twist_at INTEGER,
  twist_done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX gov_desk_city ON gov_desk(city, created_at);
CREATE INDEX gov_desk_open ON gov_desk(due_at) WHERE choice IS NULL;
CREATE INDEX gov_desk_twist ON gov_desk(twist_at) WHERE twist_at IS NOT NULL AND twist_done = 0;
