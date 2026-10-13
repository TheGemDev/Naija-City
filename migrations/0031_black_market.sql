-- Black Market app: stolen furniture listed for sale. The seller's name is public.
CREATE TABLE black_market (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_uid TEXT NOT NULL,
  item TEXT NOT NULL,
  price INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('listed', 'sold', 'cancelled')),
  buyer_uid TEXT,
  listed_at INTEGER NOT NULL,
  sold_at INTEGER
);
CREATE INDEX black_market_open ON black_market(status, listed_at DESC);
CREATE INDEX black_market_by_seller ON black_market(seller_uid, listed_at DESC);
