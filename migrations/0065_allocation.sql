-- The president's budget: what percent of the treasury each department may use (src/game/civic.ts, ALLOCATION).
ALTER TABLE civic_policies ADD COLUMN alloc_roads INTEGER NOT NULL DEFAULT 30 CHECK (alloc_roads BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN alloc_police INTEGER NOT NULL DEFAULT 25 CHECK (alloc_police BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN alloc_efcc INTEGER NOT NULL DEFAULT 15 CHECK (alloc_efcc BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN alloc_welfare INTEGER NOT NULL DEFAULT 30 CHECK (alloc_welfare BETWEEN 0 AND 100);
-- Police funding is no longer the governor's to set: it follows the police share (25% is the old default of 50).
UPDATE civic_policies SET police_funding = 50;
