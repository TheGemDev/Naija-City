-- Server-side game clock. The client reports task start/end; the server advances each player's
-- clock by real time (×10 only inside tasks long enough to skip) and judges pay and study by it.
ALTER TABLE players ADD COLUMN event_at INTEGER;          -- real ms of the last processed event
ALTER TABLE players ADD COLUMN clock REAL;                -- most game minutes the player could have reached
ALTER TABLE players ADD COLUMN task_id TEXT;              -- open task, if any
ALTER TABLE players ADD COLUMN task_action TEXT;
ALTER TABLE players ADD COLUMN task_clock REAL;           -- server clock when it started
ALTER TABLE players ADD COLUMN knowledge_credit REAL NOT NULL DEFAULT 0;  -- earned by study, not yet claimed by a save
ALTER TABLE players ADD COLUMN last_work_day INTEGER;     -- server-clock day of the last paid shift
