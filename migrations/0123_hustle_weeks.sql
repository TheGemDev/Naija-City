-- Money made by hustling, per player per week, for the Hustlers app's weekly board (GET /api/hustlers/week).
-- `week` is weekKey() from src/game/community.ts: floor(created_at / 7 days), the same week the weekly quests use.
-- Only money worked for counts: wages, gigs, business takings, shop sales and rent (the app's "What counts" says the
-- same). Gifts, loans, office salaries, winnings and crime don't.
-- The ledger stays the record. Triggers keep this table in step with it, so no code that writes the ledger changes.
CREATE TABLE hustle_weeks (
  week INTEGER NOT NULL,
  uid TEXT NOT NULL,
  earned INTEGER NOT NULL,
  PRIMARY KEY (week, uid)
) WITHOUT ROWID;
CREATE INDEX hustle_weeks_top ON hustle_weeks(week, earned DESC);

-- Wallet events go in unapplied and are applied in the same batch (worker/wallet.ts applyStmts).
CREATE TRIGGER hustle_weeks_on_apply
AFTER UPDATE OF applied ON ledger
WHEN NEW.applied = 1 AND OLD.applied = 0 AND NEW.amount > 0 AND NEW.kind IN ('work', 'gig', 'biz_income', 'market_sale', 'rent_in')
BEGIN
  INSERT INTO hustle_weeks (week, uid, earned) VALUES (NEW.created_at / 604800000, NEW.uid, NEW.amount)
  ON CONFLICT(week, uid) DO UPDATE SET earned = earned + excluded.earned;
END;

-- Shop sales and the like write their lines already applied.
CREATE TRIGGER hustle_weeks_on_insert
AFTER INSERT ON ledger
WHEN NEW.applied = 1 AND NEW.amount > 0 AND NEW.kind IN ('work', 'gig', 'biz_income', 'market_sale', 'rent_in')
BEGIN
  INSERT INTO hustle_weeks (week, uid, earned) VALUES (NEW.created_at / 604800000, NEW.uid, NEW.amount)
  ON CONFLICT(week, uid) DO UPDATE SET earned = earned + excluded.earned;
END;

-- This week so far. It replaces anything the triggers wrote since they were made a moment ago.
INSERT INTO hustle_weeks (week, uid, earned)
SELECT created_at / 604800000, uid, SUM(amount)
FROM ledger
WHERE applied = 1 AND amount > 0 AND kind IN ('work', 'gig', 'biz_income', 'market_sale', 'rent_in')
  AND created_at >= (CAST(strftime('%s', 'now') AS INTEGER) * 1000 / 604800000) * 604800000
GROUP BY created_at / 604800000, uid
ON CONFLICT(week, uid) DO UPDATE SET earned = excluded.earned;
