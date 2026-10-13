ALTER TABLE businesses ADD COLUMN area TEXT NOT NULL DEFAULT 'Central';

CREATE TABLE business_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  product TEXT NOT NULL,
  price INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0 AND stock <= 500),
  UNIQUE (business_id, product)
);
CREATE INDEX business_products_market ON business_products(product, stock, business_id);

CREATE TABLE business_restock_requests (
  id TEXT PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  uid TEXT NOT NULL,
  product TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  created_at INTEGER NOT NULL
);

CREATE TABLE marketplace_orders (
  id TEXT PRIMARY KEY,
  buyer_uid TEXT NOT NULL,
  seller_uid TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES business_products(id),
  product TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  created_at INTEGER NOT NULL,
  UNIQUE (buyer_uid, id)
);
CREATE INDEX marketplace_orders_seller ON marketplace_orders(seller_uid, status, created_at);
