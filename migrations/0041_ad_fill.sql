-- 1 = the ad's picture fills the whole billboard (no border or lettering).
ALTER TABLE ads ADD COLUMN fill INTEGER NOT NULL DEFAULT 0;
