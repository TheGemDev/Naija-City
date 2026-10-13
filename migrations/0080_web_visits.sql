-- Real visitors per UTC day from Cloudflare Web Analytics (the browser beacon, so bots that never run JS are left out).
-- The cron rewrites the last few days every 5 minutes; keeping them here means the all-time total does not depend on
-- how long Cloudflare keeps Web Analytics data. Replaces the zone page-view counts (cf_archive), which bots inflate.
CREATE TABLE web_visits (
  day TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0
);
