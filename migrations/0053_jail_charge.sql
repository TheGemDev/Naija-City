-- What a jailed player is being held for (JSON list, one line per offence). Kept here rather than on the
-- player's phone, so the cell can always show the charge, whatever put them in it and wherever they sign in.
ALTER TABLE players ADD COLUMN jail_charge TEXT;
