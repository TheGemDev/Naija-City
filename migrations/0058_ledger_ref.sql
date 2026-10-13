-- Property money is looked up by ledger ref (`p:<id>:<what>`) on every wallet sync. Without this the lookup
-- walks every ledger line the player has ever written.
CREATE INDEX ledger_uid_ref ON ledger(uid, ref);
