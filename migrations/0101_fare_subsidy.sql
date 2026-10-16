-- The President's fare subsidy (src/game/transport.ts FARE_SUBSIDY): a percent off every airline seat and every train
-- ticket, paid out of the federal treasury (civic_policies.treasury) by worker/wallet.ts when a ticket is bought.
ALTER TABLE civic_policies ADD COLUMN air_subsidy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_policies ADD COLUMN rail_subsidy INTEGER NOT NULL DEFAULT 0;
