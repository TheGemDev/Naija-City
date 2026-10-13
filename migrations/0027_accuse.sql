-- Burglars who steal while the owner is out are unknown. The owner can accuse up to three players in the
-- Police app (once per case). If the thief is among them, the item comes back and the thief is arrested.
ALTER TABLE crimes ADD COLUMN accused TEXT;      -- JSON list of the usernames accused; NULL until then
ALTER TABLE crimes ADD COLUMN held INTEGER NOT NULL DEFAULT 0;      -- the thief kept the item (not fenced)
ALTER TABLE crimes ADD COLUMN recovered INTEGER NOT NULL DEFAULT 0; -- the item went back to the owner
