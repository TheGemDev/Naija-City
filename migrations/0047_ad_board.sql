-- Each ad is booked on one specific billboard (key like 'city:3' or 'estate:<region>:1'; see src/game/boards.ts).
-- NULL = an older ad from before boards were bookable; it only rolls through the indoor posters and screens.
ALTER TABLE ads ADD COLUMN board TEXT;
CREATE INDEX ads_by_board ON ads(board, status, ends_at);
