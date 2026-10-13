-- Where a burglary victim's furniture stood when it was stolen (JSON: { propertyId, item }), so a recovered
-- piece goes back to the same spot, or to storage if that spot is gone or taken.
ALTER TABLE crimes ADD COLUMN origin TEXT;
