-- Natural disasters (src/game/disasters.ts, worker/disasters.ts): floods, fires, windstorms and bushfires the cron rolls
-- and every player in the city sees at once. `slot` is the cron slot that rolled it, so a tick that runs twice can't
-- start it twice. struck_at is set once its damage has been dealt; relief is what the state paid back (0: nothing, the
-- governor gets the blame), and relief_paid marks that the treasury was actually charged for it.
CREATE TABLE disasters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL UNIQUE,
  city TEXT NOT NULL,
  kind TEXT NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  r REAL NOT NULL,
  place TEXT,
  area TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  strikes_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  clear_at INTEGER NOT NULL,
  struck_at INTEGER,
  toll TEXT,
  relief INTEGER,
  relief_paid INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX disasters_live ON disasters(clear_at);
CREATE INDEX disasters_city ON disasters(city, clear_at);

-- Everything a disaster did, one row per thing, so nothing is done twice: a house ('house:<pid>'), a player's repair bill
-- ('bill'), a shop ('biz:<id>'), a car ('car'), someone hurt ('hurt'), sandbags bought in the warning ('prep'), relief
-- paid ('relief'), and the city's own losses (uid '': 'asset', 'pothole:<site>', 'lamp:<site>'). cost is in naira.
CREATE TABLE disaster_hits (
  disaster_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  what TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (disaster_id, uid, what)
);
CREATE INDEX disaster_hits_uid ON disaster_hits(uid, created_at);
