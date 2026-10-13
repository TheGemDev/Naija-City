-- A business is open while its shelf (business_products.stock) holds something to sell, and stock leaves the shelf
-- only when a player buys. shelf_at is when the shelf last held stock (a restock or a sale): the stall stays the
-- owner's for a while after that. Timed stock (stocked_until) can't be bought any more; it starts the hold off.
ALTER TABLE businesses ADD COLUMN shelf_at INTEGER NOT NULL DEFAULT 0;
UPDATE businesses SET shelf_at = stocked_until;
