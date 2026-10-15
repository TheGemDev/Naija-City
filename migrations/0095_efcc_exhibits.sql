-- Everything the EFCC (and customs) took from a player, item by item (worker/exhibits.ts): cash, savings, a house and
-- the furniture in it, phone apps, shop stock, recovered loot, fines. `event` groups what one arrest or raid took;
-- `kind` 'house' is marked returned when it is bought back.
CREATE TABLE efcc_exhibits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  event TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  icon TEXT NOT NULL,
  label TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  returned_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX efcc_exhibits_uid ON efcc_exhibits(uid, created_at);
