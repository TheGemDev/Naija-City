-- players is read by uid/username everywhere, but four queries had no index and scanned the whole table:
--   civic.ts   last_seen > ? ORDER BY last_seen DESC LIMIT n   (who to notify about an election)
--   crime.ts   jailed_until > ? ORDER BY jailed_until LIMIT 20 (the jail list)
--   crime.ts   LOWER(username) IN (...)                         (tagging names in a crime report)
--   efcc.ts    LOWER(username) = LOWER(?)                       (filing a case against a name)
-- Partial indexes stay tiny: only named players, only people actually in jail.
CREATE INDEX players_last_seen ON players (last_seen) WHERE username IS NOT NULL;
CREATE INDEX players_jailed ON players (jailed_until) WHERE jailed_until IS NOT NULL;
CREATE INDEX players_username_lower ON players (LOWER(username));
