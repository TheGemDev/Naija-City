-- Each city's government now has a treasury of its own. What players pay in a city (VAT, land registration, wage tax,
-- fines, permits, stall rent) lands there; civic_policies.treasury is the federal treasury from here on (src/game/treasury.ts).
-- Every hour the federal cut of what a state took in is sent up to the federal treasury (worker/state.ts runStateRound).
CREATE TABLE state_treasuries (
  city TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  -- Revenue since the last round: the federal cut is taken from this.
  incoming INTEGER NOT NULL DEFAULT 0 CHECK (incoming >= 0),
  -- Bills the state could not pay. Paid off first, before anything else, and they lock the governor's spending.
  arrears INTEGER NOT NULL DEFAULT 0 CHECK (arrears >= 0),
  -- A governor's request for a federal grant, waiting for the president.
  ask_amount INTEGER,
  ask_at INTEGER
);

-- Today's treasury is split between the states by the shares the president had set; the rest stays federal.
INSERT INTO state_treasuries (city, balance) VALUES
  ('kaduna', COALESCE((SELECT treasury * alloc_kaduna / 100 FROM civic_policies WHERE id = 1), 0)),
  ('abuja', COALESCE((SELECT treasury * alloc_abuja / 100 FROM civic_policies WHERE id = 1), 0)),
  ('lagos', COALESCE((SELECT treasury * alloc_lagos / 100 FROM civic_policies WHERE id = 1), 0)),
  ('kano', COALESCE((SELECT treasury * alloc_kano / 100 FROM civic_policies WHERE id = 1), 0));
UPDATE civic_policies SET treasury = treasury - (treasury * alloc_kaduna / 100 + treasury * alloc_abuja / 100 + treasury * alloc_lagos / 100 + treasury * alloc_kano / 100) WHERE id = 1;

-- The president's share of every state's revenue, sent up each round (0 to 30 percent), and when the last round ran.
ALTER TABLE civic_policies ADD COLUMN federal_cut INTEGER NOT NULL DEFAULT 10 CHECK (federal_cut BETWEEN 0 AND 30);
ALTER TABLE civic_policies ADD COLUMN state_round_at INTEGER;

-- What a state owns and has to keep up: roads, street lights, markets, the hospital, the stadium and Government House.
-- `level` is how much the governor pays to maintain it (percent of the full bill); `condition` is how it is holding up.
CREATE TABLE state_assets (
  city TEXT NOT NULL,
  asset TEXT NOT NULL,
  condition INTEGER NOT NULL DEFAULT 80 CHECK (condition BETWEEN 0 AND 100),
  level INTEGER NOT NULL DEFAULT 50 CHECK (level IN (0, 25, 50, 75, 100)),
  PRIMARY KEY (city, asset)
) WITHOUT ROWID;
INSERT INTO state_assets (city, asset) SELECT city, 'roads' FROM state_treasuries;
INSERT INTO state_assets (city, asset) SELECT city, 'lights' FROM state_treasuries;
INSERT INTO state_assets (city, asset) SELECT city, 'markets' FROM state_treasuries;
INSERT INTO state_assets (city, asset) SELECT city, 'hospital' FROM state_treasuries;
INSERT INTO state_assets (city, asset) SELECT city, 'stadium' FROM state_treasuries;
INSERT INTO state_assets (city, asset) SELECT city, 'govhouse' FROM state_treasuries;
