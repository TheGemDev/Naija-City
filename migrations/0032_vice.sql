-- Vice: drugs (the Plug app), protection rackets, murder/kidnap contracts, dirty work and jail hustles
-- (src/game/vice.ts, worker/vice.ts). Everything is settled by the server.

ALTER TABLE players ADD COLUMN high_until INTEGER;
-- Kidnapped until then (or until the ransom is met).
ALTER TABLE players ADD COLUMN held_until INTEGER;
-- Last time the police rolled to pull this player over for driving high, and a stop waiting for an answer.
ALTER TABLE players ADD COLUMN dui_at INTEGER;
ALTER TABLE players ADD COLUMN dui_pending INTEGER;
ALTER TABLE players ADD COLUMN sweep_at INTEGER;
ALTER TABLE underworld ADD COLUMN vice INTEGER NOT NULL DEFAULT 0;

CREATE TABLE stash (
  uid TEXT NOT NULL,
  good TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (uid, good)
);

-- Public sell ads for the Plug app. Stock leaves the seller's stash when listed.
CREATE TABLE vice_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_uid TEXT NOT NULL,
  good TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('listed', 'sold', 'cancelled')),
  buyer_uid TEXT,
  listed_at INTEGER NOT NULL,
  sold_at INTEGER
);
CREATE INDEX vice_listings_open ON vice_listings(status, listed_at DESC);

-- A private offer from one player to another (also how cellmates trade).
CREATE TABLE vice_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_uid TEXT NOT NULL,
  to_uid TEXT NOT NULL,
  good TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'declined', 'cancelled')),
  created_at INTEGER NOT NULL
);
CREATE INDEX vice_offers_to ON vice_offers(to_uid, status);
CREATE INDEX vice_offers_from ON vice_offers(from_uid, status);

-- Protection rackets: a boss demands a weekly fee ('demanded'), the payer agrees ('active') or doesn't.
CREATE TABLE rackets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boss_uid TEXT NOT NULL,
  payer_uid TEXT NOT NULL,
  fee INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('demanded', 'active', 'refused', 'broken', 'ended', 'protected')),
  next_due INTEGER,
  paid_total INTEGER NOT NULL DEFAULT 0,
  strikes INTEGER NOT NULL DEFAULT 0,
  protector_uid TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX rackets_boss ON rackets(boss_uid, status);
CREATE INDEX rackets_payer ON rackets(payer_uid, status);

-- Hits and kidnaps. The poster's reward is held by the server until the job is done or cancelled.
CREATE TABLE contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('hit', 'kidnap')),
  poster_uid TEXT NOT NULL,
  target_uid TEXT NOT NULL,
  reward INTEGER NOT NULL,
  ransom INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('open', 'taken', 'ransom', 'done', 'failed', 'expired', 'cancelled', 'rescued')),
  taker_uid TEXT,
  created_at INTEGER NOT NULL,
  taken_at INTEGER,
  hold_ends INTEGER
);
CREATE INDEX contracts_open ON contracts(status, created_at DESC);
CREATE INDEX contracts_target ON contracts(target_uid, status);
CREATE INDEX contracts_taker ON contracts(taker_uid, status);

-- Money pledged towards a kidnap ransom (held by the server; refunded if the victim goes free another way).
CREATE TABLE ransom_pledges (
  contract_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (contract_id, uid)
);

-- Dirty work: one row per operation a player is running (forgery, counterfeit naira, pirate radio…).
CREATE TABLE ops (
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ready_at INTEGER NOT NULL,
  PRIMARY KEY (uid, kind)
);

-- Jailbreaks planned from inside a cell; a free player takes the job.
CREATE TABLE breakouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inmate_uid TEXT NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'done', 'failed', 'cancelled')),
  helper_uid TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX breakouts_open ON breakouts(status, created_at DESC);
