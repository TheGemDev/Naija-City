-- A business belongs to one city: a stall at Kaduna's airport is not a stall at Abuja's, though both places
-- share the id 'airport'. Everything opened before this was opened in Kaduna.
ALTER TABLE businesses ADD COLUMN city TEXT NOT NULL DEFAULT 'kaduna';
DROP INDEX businesses_place;
CREATE INDEX businesses_place ON businesses(city, place_id, stocked_until);

-- Foot traffic is counted per city too.
CREATE TABLE place_visits_new (
  city TEXT NOT NULL DEFAULT 'kaduna',
  place_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  uid TEXT NOT NULL,
  PRIMARY KEY (city, place_id, day, uid)
);
INSERT INTO place_visits_new (city, place_id, day, uid) SELECT 'kaduna', place_id, day, uid FROM place_visits;
DROP TABLE place_visits;
ALTER TABLE place_visits_new RENAME TO place_visits;
