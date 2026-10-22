-- The Business app and the Market both count each product's paid sales with
-- (SELECT SUM(quantity) FROM marketplace_orders WHERE product_id = ? AND status = 'paid'), and the Business app finds a
-- player's products by business_id. Neither had an index, so each load scanned both tables (~25k rows a read).
CREATE INDEX business_products_business ON business_products(business_id);
CREATE INDEX marketplace_orders_product ON marketplace_orders(product_id, status, quantity);
