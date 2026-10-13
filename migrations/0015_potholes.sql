-- Potholes are shared: the server tracks which sites in POTHOLES (src/game/city.ts) are open, opens new
-- ones over time and lets the governor fix them (worker/roads.ts). Every site starts open, as before.
CREATE TABLE potholes (
  site INTEGER PRIMARY KEY,
  opened_at INTEGER NOT NULL
);

INSERT INTO potholes (site, opened_at)
WITH RECURSIVE s(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM s WHERE n < 32)
SELECT n, 0 FROM s;

CREATE TABLE pothole_fixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site INTEGER NOT NULL,
  uid TEXT NOT NULL,
  cost INTEGER NOT NULL,
  paid_from TEXT NOT NULL CHECK (paid_from IN ('treasury', 'pocket')),
  created_at INTEGER NOT NULL
);

-- When the last pothole broke open; the next is due spawnHours after this.
ALTER TABLE civic_policies ADD COLUMN pothole_at INTEGER;
