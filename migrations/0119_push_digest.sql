-- Government notices are one push every couple of hours at most (worker/gazette.ts GAZETTE_PUSH_GAP_MS), carrying a
-- count of the notices since the last one, instead of a buzz for every road that wears down. When the last went out.
ALTER TABLE civic_policies ADD COLUMN gazette_push_at INTEGER NOT NULL DEFAULT 0;
