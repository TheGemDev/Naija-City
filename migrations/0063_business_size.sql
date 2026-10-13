-- How big a business's building is (src/game/career.ts BIZ_SIZES): a bigger one costs more to open and rent,
-- holds more stock per product and has room for more staff. Existing businesses start as the smallest.
ALTER TABLE businesses ADD COLUMN size TEXT NOT NULL DEFAULT 'small';
