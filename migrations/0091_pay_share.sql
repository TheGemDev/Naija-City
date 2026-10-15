-- A governor is paid out of their own state's treasury. The president's pay list sets the most they can take; this is the
-- share of that maximum the governor takes (percent). What they leave stays in the state treasury.
ALTER TABLE state_treasuries ADD COLUMN pay_share INTEGER NOT NULL DEFAULT 100 CHECK (pay_share IN (0, 25, 50, 75, 100));
