-- The president's fee on money sent between players (percent of the amount, paid into the treasury).
ALTER TABLE civic_policies ADD COLUMN transfer_fee INTEGER NOT NULL DEFAULT 0 CHECK (transfer_fee BETWEEN 0 AND 10);
