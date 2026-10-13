-- Real-money naira packs (src/game/shop.ts, worker/shop.ts). Paid via Bachs; the webhook flips pending -> paid
-- and credits the wallet exactly once.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  naira INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
  checkout_id TEXT,
  event_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX orders_uid ON orders(uid, created_at);
