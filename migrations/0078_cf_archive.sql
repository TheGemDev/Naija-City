-- Cloudflare's daily page views per zone (naija.city, kaduna.life), saved once a year by the cron (worker/cfTraffic.ts)
-- because Cloudflare only keeps about a year of daily numbers. The all-time visit total adds these to the live ones.
CREATE TABLE cf_archive (
  zone TEXT NOT NULL,
  day TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (zone, day)
);
