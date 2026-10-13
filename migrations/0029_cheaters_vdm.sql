-- Family app cheaters registry: every time someone with a partner takes on (or spends the night with)
-- someone else. caught = the partner found out at the time.
CREATE TABLE cheats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cheater_uid TEXT NOT NULL,
  partner_uid TEXT NOT NULL,
  with_uid TEXT NOT NULL,
  caught INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX cheats_by_cheater ON cheats(cheater_uid, created_at DESC);
CREATE INDEX cheats_recent ON cheats(created_at DESC);

-- Paid to clear your name: records before wiped_at stay hidden. Each wipe costs more than the last.
CREATE TABLE cheat_wipes (
  uid TEXT PRIMARY KEY,
  wiped_at INTEGER NOT NULL,
  times INTEGER NOT NULL DEFAULT 1
);

-- Police app "Call VDM": the victim paid to have the crime exposed on Twitter.
ALTER TABLE crimes ADD COLUMN vdm_at INTEGER;
