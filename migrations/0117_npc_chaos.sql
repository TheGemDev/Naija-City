-- NPC chaos (worker/npcs.ts, src/game/npcs.ts NPC_TRAITS, NPC_WILD, NPC_CRAZES): every NPC citizen has a quirk that bends
-- what they do and say (a gambler, a show-off, a gossip...), and now and then a state catches a craze for a few hours
-- (a crime wave, a japa rush, a baby boom...). Citizens who are already here get a quirk at random.
ALTER TABLE npcs ADD COLUMN trait TEXT NOT NULL DEFAULT 'normal';
UPDATE npcs SET trait = CASE ABS(RANDOM()) % 12
  WHEN 0 THEN 'gambler' WHEN 1 THEN 'showoff' WHEN 2 THEN 'gossip' WHEN 3 THEN 'pious' WHEN 4 THEN 'party' WHEN 5 THEN 'stingy'
  WHEN 6 THEN 'hothead' WHEN 7 THEN 'hustler' WHEN 8 THEN 'dreamer' ELSE 'normal' END;

-- The craze a state has caught, and when it wears off. One at a time per state.
CREATE TABLE npc_crazes (
  city TEXT PRIMARY KEY,
  craze TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  until INTEGER NOT NULL
) WITHOUT ROWID;

-- Money crimes in office (looting, embezzling, ghost workers, bags on the jet, a chair's bribe) are strikes now
-- (worker/loot.ts removeFromOffice, OFFICE_STRIKES in src/game/civic.ts): a fine and a public warning, and only the
-- third strike costs the seat. Counted for whoever holds the seat; a new holder starts at zero.
ALTER TABLE civic_policies ADD COLUMN president_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN governor_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN minister_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN lagosgov_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN kanogov_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN igp_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN efcc_strikes INTEGER NOT NULL DEFAULT 0;

-- Every NPC citizen who ever arrived, for the phone's "plays" count (worker/cfTraffic.ts). Only ever goes up.
ALTER TABLE civic_policies ADD COLUMN npc_total INTEGER NOT NULL DEFAULT 0;
UPDATE civic_policies SET npc_total = (SELECT COUNT(*) FROM npcs) + COALESCE((SELECT SUM(japa) FROM npc_census), 0) WHERE id = 1;
