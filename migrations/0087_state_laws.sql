-- A state's own taxes and fees, set by its governor (src/game/treasury.ts STATE_LAWS). Income tax is extra wage tax on
-- people who live in the state, on top of the president's. The three fees are a percent of the standard fee.
ALTER TABLE state_treasuries ADD COLUMN income_tax INTEGER NOT NULL DEFAULT 0 CHECK (income_tax BETWEEN 0 AND 10);
ALTER TABLE state_treasuries ADD COLUMN biz_fee INTEGER NOT NULL DEFAULT 100 CHECK (biz_fee BETWEEN 0 AND 200);
ALTER TABLE state_treasuries ADD COLUMN move_fee INTEGER NOT NULL DEFAULT 100 CHECK (move_fee BETWEEN 0 AND 200);
ALTER TABLE state_treasuries ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 100 CHECK (delivery_fee BETWEEN 0 AND 200);
