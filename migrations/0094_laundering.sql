-- A looting case now holds the loot itself (worker/loot.ts): the looter is paid only once the case closes in their favour,
-- and an offer to the chair comes out of the loot. 0 for cases opened before, whose loot was paid out at once.
ALTER TABLE loot_cases ADD COLUMN held INTEGER NOT NULL DEFAULT 0;

-- Ghost workers on a state's payroll (worker/schemes.ts): the governor running them, when they started, when the last
-- hourly round paid out, how many rounds have paid, and what they have taken so far. NULL uid: no ghosts.
ALTER TABLE state_treasuries ADD COLUMN ghost_uid TEXT;
ALTER TABLE state_treasuries ADD COLUMN ghost_at INTEGER;
ALTER TABLE state_treasuries ADD COLUMN ghost_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE state_treasuries ADD COLUMN ghost_taken INTEGER NOT NULL DEFAULT 0;
