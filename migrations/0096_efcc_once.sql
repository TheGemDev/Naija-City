-- When an EFCC case was last filed on a player (worker/efcc.ts). A new audit only reads income that landed after it, so
-- nothing is judged twice, and nobody can file on the same player again until EFCC.caseCooldownMs has passed.
ALTER TABLE players ADD COLUMN efcc_case_at INTEGER;
UPDATE players SET efcc_case_at = (SELECT MAX(filed_at) FROM efcc_cases WHERE target_uid = players.uid)
  WHERE EXISTS (SELECT 1 FROM efcc_cases WHERE target_uid = players.uid);
