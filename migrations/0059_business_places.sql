-- Businesses rent a stall at a place on the map (src/game/career.ts STALLS). The place decides which kinds of
-- business can open there, how many fit, the rent and how much trade walks past.
ALTER TABLE businesses ADD COLUMN place_id TEXT NOT NULL DEFAULT '';
UPDATE businesses SET place_id = CASE type WHEN 'suya' THEN 'suya' WHEN 'shop' THEN 'market' WHEN 'keke' THEN 'motorpark' ELSE '' END;
UPDATE businesses SET area = CASE place_id WHEN 'suya' THEN 'Barnawa' WHEN 'market' THEN 'Central' WHEN 'motorpark' THEN 'Kawo' ELSE area END;
CREATE INDEX businesses_place ON businesses(place_id, stocked_until);

-- Ordering from somewhere else instead of walking in adds a delivery fee the seller does not get.
ALTER TABLE marketplace_orders ADD COLUMN fee INTEGER NOT NULL DEFAULT 0;

-- One row per player per place per day: the foot traffic that lifts trade for the stalls there.
CREATE TABLE place_visits (
  place_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  uid TEXT NOT NULL,
  PRIMARY KEY (place_id, day, uid)
);
