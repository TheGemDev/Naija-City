-- Guns (worker/guns.ts, rules in src/game/guns.ts). One gun a player, with its rounds, and whether it is on the police
-- register (bought at the licensed gun shop and never used in a crime).
CREATE TABLE guns (
  uid TEXT PRIMARY KEY,
  gun TEXT NOT NULL,
  ammo INTEGER NOT NULL DEFAULT 0,
  licensed INTEGER NOT NULL DEFAULT 0,
  bought_at INTEGER NOT NULL
);
-- A bulletproof vest (hits it can still stop), an armed bodyguard (until when), and the last armed job (its cooldown).
ALTER TABLE players ADD COLUMN vest_hits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN escort_until INTEGER;
ALTER TABLE players ADD COLUMN gun_at INTEGER;
-- A crime done with a gun: 'rob' (at gunpoint) or 'shoot'. Kind stays 'pickpocket', so warrants, arrests and bail work as for any street robbery.
ALTER TABLE crimes ADD COLUMN armed TEXT;
