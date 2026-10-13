-- One row per Nigerian (WAT) day: how many game sessions started. Feeds the public stats page (stats.kaduna.life).
CREATE TABLE site_visits (
  day INTEGER PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);
