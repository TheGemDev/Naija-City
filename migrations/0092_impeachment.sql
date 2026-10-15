-- The president can impeach whoever runs a state for a few hours (worker/civic.ts impeach) and run the state themselves
-- until then. Each column is when that seat's suspension ends; NULL or past means the holder governs. A new term clears it.
ALTER TABLE civic_policies ADD COLUMN governor_suspended_until INTEGER;
ALTER TABLE civic_policies ADD COLUMN minister_suspended_until INTEGER;
ALTER TABLE civic_policies ADD COLUMN lagosgov_suspended_until INTEGER;
ALTER TABLE civic_policies ADD COLUMN kanogov_suspended_until INTEGER;
