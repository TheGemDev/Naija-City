-- Each state makes some goods (src/game/trade.ts). A shop that restocks goods made in another state pays that state an
-- export levy on the wholesale price, set by the governor of the state that makes them, within the president's maximum.
ALTER TABLE state_treasuries ADD COLUMN export_levy INTEGER NOT NULL DEFAULT 20 CHECK (export_levy BETWEEN 0 AND 40);
ALTER TABLE civic_policies ADD COLUMN cap_export_levy INTEGER NOT NULL DEFAULT 40 CHECK (cap_export_levy BETWEEN 0 AND 40);
