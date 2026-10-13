-- Server-kept price history for investments (worker/market.ts). One row per venture per 5-minute tick;
-- `mult` is the price as a multiple of the venture's base costPerUnit (1.0 = launch price).
CREATE TABLE market_ticks (
  inv_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  mult REAL NOT NULL,
  PRIMARY KEY (inv_id, t)
);
