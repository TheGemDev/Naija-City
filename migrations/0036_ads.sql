-- Player ads paid for with real money (src/game/ads.ts, worker/ads.ts). An ad is created 'awaiting_payment';
-- the payment webhook (not wired yet) flips it to 'active' and sets starts_at/ends_at. 'removed' = taken down.
CREATE TABLE ads (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  status TEXT NOT NULL CHECK (status IN ('awaiting_payment', 'active', 'removed')),
  checkout_id TEXT,
  event_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  starts_at INTEGER,
  ends_at INTEGER
);
CREATE INDEX ads_by_uid ON ads(uid, created_at);
CREATE INDEX ads_live ON ads(status, ends_at);
