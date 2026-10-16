-- Auto-restock per product on a player's shelf (worker/shops.ts, NPC_SHOP in src/game/career.ts): once stock drops to
-- auto_min the cron buys it back up to auto_to from the owner's wallet. NULL is off. auto_short is set when the wallet
-- couldn't cover a refill and the owner has been told, so they are told once, not every five minutes.
ALTER TABLE business_products ADD COLUMN auto_min INTEGER;
ALTER TABLE business_products ADD COLUMN auto_to INTEGER;
ALTER TABLE business_products ADD COLUMN auto_short INTEGER NOT NULL DEFAULT 0;
CREATE INDEX business_products_auto ON business_products(auto_min) WHERE auto_min IS NOT NULL;
