-- site_visits.n holds the old per-session counts (before Analytics Engine); live holds the per-day count rolled up from Analytics Engine. Totals use both.
ALTER TABLE site_visits ADD COLUMN live INTEGER NOT NULL DEFAULT 0;
