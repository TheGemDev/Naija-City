-- The president no longer funds "roads": each city's government gets its own share of the treasury
-- (src/game/civic.ts, ALLOCATION) and decides what to do with it. The old roads share is split between the
-- two cities, in the 5% steps the budget uses; alloc_roads is no longer read.
ALTER TABLE civic_policies ADD COLUMN alloc_kaduna INTEGER NOT NULL DEFAULT 20 CHECK (alloc_kaduna BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN alloc_abuja INTEGER NOT NULL DEFAULT 10 CHECK (alloc_abuja BETWEEN 0 AND 100);
UPDATE civic_policies SET alloc_abuja = (alloc_roads / 15) * 5, alloc_kaduna = alloc_roads - (alloc_roads / 15) * 5;
