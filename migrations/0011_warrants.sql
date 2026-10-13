-- Reporting a theft no longer jails the thief on the spot. It puts out a warrant ('wanted'): a player
-- with the Police job has to walk up and arrest them (and keeps a share), or the NPC police pick them
-- up once the manhunt runs out. SQLite can't change a CHECK, so the table is rebuilt.
CREATE TABLE crimes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thief_uid TEXT NOT NULL,
  victim_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pickpocket', 'burglary')),
  success INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  item TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'wanted', 'arrested')),
  returned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  reported_at INTEGER,
  arrested_at INTEGER,
  -- The player officer who made the arrest (null: NPC police).
  officer_uid TEXT,
  -- What the officer was paid out of the thief's wallet.
  reward INTEGER NOT NULL DEFAULT 0,
  fine INTEGER NOT NULL DEFAULT 0
);
INSERT INTO crimes_new (id, thief_uid, victim_uid, kind, success, amount, item, status, returned, created_at)
  SELECT id, thief_uid, victim_uid, kind, success, amount, item, status, returned, created_at FROM crimes;
DROP TABLE crimes;
ALTER TABLE crimes_new RENAME TO crimes;
CREATE INDEX crimes_victim ON crimes(victim_uid, created_at);
CREATE INDEX crimes_thief ON crimes(thief_uid, created_at);
CREATE INDEX crimes_wanted ON crimes(status, reported_at);
