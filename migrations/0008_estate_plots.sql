-- Plot slots in each region's estate (src/game/estate.ts). One row per property a player owns;
-- the slot decides where it sits so every visitor sees the same neighbours.
CREATE TABLE estate_plots (
  region TEXT NOT NULL,
  slot INTEGER NOT NULL,
  uid TEXT NOT NULL,
  pid TEXT NOT NULL,
  plot TEXT NOT NULL,
  design TEXT,
  stage INTEGER NOT NULL DEFAULT 0,
  building INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (region, slot)
);
CREATE UNIQUE INDEX estate_plots_owner ON estate_plots(uid, pid);
