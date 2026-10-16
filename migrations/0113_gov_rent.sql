-- Government house rent becomes a state law (src/game/treasury.ts STATE_LAWS.govRent): each state's governor sets the
-- weekly rent of its government houses, up to a maximum the president sets. What tenants pay goes to that state's treasury.
-- ₦10k a week is what everyone paid before; the president's maximum starts at ₦40k.
ALTER TABLE state_treasuries ADD COLUMN gov_rent INTEGER NOT NULL DEFAULT 10000 CHECK (gov_rent BETWEEN 0 AND 400000);
ALTER TABLE civic_policies ADD COLUMN cap_gov_rent INTEGER NOT NULL DEFAULT 40000 CHECK (cap_gov_rent BETWEEN 0 AND 400000);
