-- The president sets a maximum for each state tax and fee (src/game/treasury.ts STATE_LAWS); a governor then picks a
-- share of it. Every cap starts at today's highest value, so nothing changes until the president lowers one.
ALTER TABLE civic_policies ADD COLUMN cap_income_tax INTEGER NOT NULL DEFAULT 10 CHECK (cap_income_tax BETWEEN 0 AND 10);
ALTER TABLE civic_policies ADD COLUMN cap_biz_fee INTEGER NOT NULL DEFAULT 200 CHECK (cap_biz_fee BETWEEN 0 AND 200);
ALTER TABLE civic_policies ADD COLUMN cap_move_fee INTEGER NOT NULL DEFAULT 200 CHECK (cap_move_fee BETWEEN 0 AND 200);
ALTER TABLE civic_policies ADD COLUMN cap_delivery_fee INTEGER NOT NULL DEFAULT 200 CHECK (cap_delivery_fee BETWEEN 0 AND 200);
ALTER TABLE civic_policies ADD COLUMN cap_biz_tax INTEGER NOT NULL DEFAULT 20 CHECK (cap_biz_tax BETWEEN 0 AND 20);
ALTER TABLE civic_policies ADD COLUMN cap_sales_tax INTEGER NOT NULL DEFAULT 10 CHECK (cap_sales_tax BETWEEN 0 AND 10);
ALTER TABLE civic_policies ADD COLUMN cap_hospital_fee INTEGER NOT NULL DEFAULT 200 CHECK (cap_hospital_fee BETWEEN 0 AND 200);

-- Three more things a state can charge: a tax on business income, a sales tax on marketplace sales, and a hospital fee.
ALTER TABLE state_treasuries ADD COLUMN biz_tax INTEGER NOT NULL DEFAULT 0 CHECK (biz_tax BETWEEN 0 AND 20);
ALTER TABLE state_treasuries ADD COLUMN sales_tax INTEGER NOT NULL DEFAULT 0 CHECK (sales_tax BETWEEN 0 AND 10);
ALTER TABLE state_treasuries ADD COLUMN hospital_fee INTEGER NOT NULL DEFAULT 100 CHECK (hospital_fee BETWEEN 0 AND 200);

-- The sales tax taken from a seller on each order, so the order, the ledger and the state agree.
ALTER TABLE marketplace_orders ADD COLUMN tax INTEGER NOT NULL DEFAULT 0;
