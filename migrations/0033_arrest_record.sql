-- When a player was last locked up (any cause), so candidates with a recent arrest can be barred from running for office.
ALTER TABLE players ADD COLUMN last_arrest_at INTEGER;
UPDATE players SET last_arrest_at = jailed_until WHERE jailed_until IS NOT NULL;

CREATE TRIGGER players_arrest_record
AFTER UPDATE OF jailed_until ON players
WHEN NEW.jailed_until IS NOT NULL AND NEW.jailed_until > COALESCE(OLD.jailed_until, 0)
BEGIN
  UPDATE players SET last_arrest_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE uid = NEW.uid;
END;
