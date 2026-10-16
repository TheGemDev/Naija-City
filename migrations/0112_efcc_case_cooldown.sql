-- The EFCC chair's law: how long after a case on someone before a new one can be filed on them (worker/efcc.ts).
-- In minutes, from 10 minutes to 12 hours; 12 hours is the old fixed rule and stays the default.
ALTER TABLE civic_policies ADD COLUMN case_cooldown_min INTEGER NOT NULL DEFAULT 720 CHECK (case_cooldown_min BETWEEN 10 AND 720);
