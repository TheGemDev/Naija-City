-- Longer cell time: the default jail term goes from 5 to 20 real minutes (the DPO can still set it, 1-30).
UPDATE civic_policies SET jail_minutes = 20 WHERE id = 1 AND jail_minutes < 20;
