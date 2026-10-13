-- Optional picture on a player ad: a /api/media/u/<uid>/<file> URL from POST /api/media (worker/media.ts).
ALTER TABLE ads ADD COLUMN image TEXT;
