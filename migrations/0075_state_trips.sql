-- Every ride an office holder takes in the state's fleet (helicopter, convoy, jet), paid by the treasury.
-- The blogs count them: a flight to another city is news, and so is an official who travels too much
-- (worker/news.ts). Rows are kept a day.
CREATE TABLE state_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  -- The office they rode as: president / governor / minister / lagosgov.
  office TEXT NOT NULL,
  -- helicopter / cab / jet
  vehicle TEXT NOT NULL,
  -- The city a jet flew to; NULL for a ride inside a city.
  dest TEXT,
  cost INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX state_trips_recent ON state_trips (uid, created_at);
