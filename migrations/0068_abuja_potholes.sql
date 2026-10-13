-- Abuja gets potholes too (src/game/abuja.ts): its sites are numbered from 1000 in the same potholes table,
-- with its own clock and its own road funding, set by the FCT Minister (worker/roads.ts). About half start
-- open, the worst on Airport Road and in Lugbe.
ALTER TABLE civic_policies ADD COLUMN roads_funding_abuja INTEGER NOT NULL DEFAULT 50 CHECK (roads_funding_abuja BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN pothole_at_abuja INTEGER;

INSERT OR IGNORE INTO potholes (site, opened_at) VALUES
  (1000, 0), (1002, 0), (1003, 0), (1004, 0), (1005, 0), (1007, 0), (1009, 0), (1010, 0),
  (1012, 0), (1015, 0), (1016, 0), (1018, 0), (1022, 0), (1024, 0);
