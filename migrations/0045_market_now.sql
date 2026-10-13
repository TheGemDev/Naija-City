-- The newest two prices per venture, so reading "the price now" is ~12 rows instead of a scan of the whole history
-- (it was ~2.9M D1 rows read a day). worker/market.ts keeps it current on every cron tick.
CREATE TABLE market_now (
  inv_id TEXT PRIMARY KEY,
  mult REAL NOT NULL,
  prev REAL NOT NULL,
  t INTEGER NOT NULL
);

INSERT INTO market_now (inv_id, mult, prev, t)
SELECT inv_id, mult,
       COALESCE((SELECT mult FROM market_ticks p WHERE p.inv_id = m.inv_id AND p.t < m.t ORDER BY p.t DESC LIMIT 1), mult),
       t
FROM market_ticks m
WHERE t = (SELECT MAX(t) FROM market_ticks WHERE inv_id = m.inv_id);

-- The 24-hour chart and the pruning both filter on time alone, which the (inv_id, t) key can't serve.
CREATE INDEX market_ticks_t ON market_ticks (t);
