-- Random road kidnappings (worker/vice.ts /api/vice/ambush): when the server last rolled for a player, and when one last landed.
ALTER TABLE players ADD COLUMN ambush_at INTEGER;
ALTER TABLE players ADD COLUMN ambush_hit_at INTEGER;
-- The car the victim was snatched in, if any (they lose it if the ransom isn't met).
ALTER TABLE contracts ADD COLUMN car_id TEXT;

-- What the kidnappers took when the ransom ran out: the victim's own contribution, their phone, accessories and (maybe) a car.
-- The game applies it on its next poll, then marks it applied.
CREATE TABLE seizures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  contract_id INTEGER NOT NULL,
  car_id TEXT,
  forfeited INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX seizures_uid ON seizures(uid, applied);
