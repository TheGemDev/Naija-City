-- Yahoo vs NPC "mugus" (resolved a little after sending) and Baba Online perks.
ALTER TABLE scams ADD COLUMN resolve_at INTEGER;
ALTER TABLE scams ADD COLUMN payout INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scams ADD COLUMN note TEXT;
ALTER TABLE scams ADD COLUMN blessed INTEGER NOT NULL DEFAULT 0;
-- Thefts done under Baba's soap can't be turned into a warrant.
ALTER TABLE crimes ADD COLUMN soaped INTEGER NOT NULL DEFAULT 0;
CREATE TABLE baba_perks (
  uid TEXT NOT NULL,
  perk TEXT NOT NULL,
  charges INTEGER NOT NULL,
  PRIMARY KEY (uid, perk)
);
