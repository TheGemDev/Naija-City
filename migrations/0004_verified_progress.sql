-- Knowledge as the server has verified it (it gates jobs). Grows no faster than real time allows.
ALTER TABLE players ADD COLUMN knowledge REAL NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN knowledge_at INTEGER;

-- Existing players keep what their last save said (capped at the max).
UPDATE players SET
  knowledge = MIN(10, MAX(0, COALESCE((SELECT CAST(json_extract(data, '$.knowledge') AS REAL) FROM saves WHERE saves.uid = players.uid), 0))),
  knowledge_at = (SELECT saved_at FROM saves WHERE saves.uid = players.uid);
