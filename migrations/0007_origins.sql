-- Where each player started in life (src/game/origins.ts). NULL = not drawn yet.
-- origin_at: when it was drawn; a new life can redraw only after a day.
ALTER TABLE wallets ADD COLUMN origin TEXT;
ALTER TABLE wallets ADD COLUMN origin_at INTEGER;

-- Everyone who already has a wallet started as a regular person, free to redraw on a new life.
UPDATE wallets SET origin = 'normal', origin_at = 0;
