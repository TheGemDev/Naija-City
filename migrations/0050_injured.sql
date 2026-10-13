-- Homeowners can catch a burglar in the act and beat them up (worker/crime.ts, /api/break-in/catch):
-- the thief is "injured" until this time (ms): slower on their feet and unable to steal or break in.
ALTER TABLE players ADD COLUMN injured_until INTEGER;
