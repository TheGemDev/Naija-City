-- A business's own badge (icon and colour picked by the owner), and the stall rent it has accrued since the
-- last collection, which is paid into the state treasury when the owner collects.
ALTER TABLE businesses ADD COLUMN icon TEXT NOT NULL DEFAULT '';
ALTER TABLE businesses ADD COLUMN color TEXT NOT NULL DEFAULT '';
ALTER TABLE businesses ADD COLUMN pending_rent INTEGER NOT NULL DEFAULT 0;
