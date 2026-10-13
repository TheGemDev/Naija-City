-- Every life is born in a state, drawn by the server along with its origin (worker/wallet.ts): the starter home
-- stands in that city (src/game/regions.ts). Null for lives drawn before there were states: they are Kaduna's.
ALTER TABLE wallets ADD COLUMN state TEXT;
