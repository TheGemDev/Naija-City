-- House app "For rent": owners list a finished house, another player rents it by the week.
-- paid_through: real ms the tenant has paid up to (a game week is 7 × 24 real minutes).
CREATE TABLE rentals (
  property_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  region TEXT NOT NULL,
  design TEXT NOT NULL,
  weekly INTEGER NOT NULL,
  listed_at INTEGER NOT NULL,
  tenant_uid TEXT,
  rented_at INTEGER,
  paid_through INTEGER
);
CREATE INDEX rentals_by_owner ON rentals(owner_uid);
CREATE UNIQUE INDEX rentals_one_lease ON rentals(tenant_uid) WHERE tenant_uid IS NOT NULL;
