-- Bank loans on real days, against what a player owns (src/game/loans.ts, worker/loans.ts). A loan left unpaid a day
-- past its due date is in default: the bank takes cash, savings, cars, jets and houses until it is covered, and the
-- borrower goes to a cell.

-- A loan can now end in default as well as repaid. SQLite can't change a CHECK in place, so the table is rebuilt.
CREATE TABLE loans_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  principal INTEGER NOT NULL CHECK (principal >= 0),
  interest INTEGER NOT NULL DEFAULT 0 CHECK (interest >= 0),
  borrowed INTEGER NOT NULL,
  taken_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  last_accrual INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'repaid', 'defaulted')),
  -- When the borrower was told the loan is overdue (once).
  warned_at INTEGER,
  -- Default: when the bank moved in, what it got back, and what it wrote off.
  defaulted_at INTEGER,
  recovered INTEGER,
  written_off INTEGER
);
INSERT INTO loans_new (id, uid, principal, interest, borrowed, taken_at, due_at, last_accrual, status)
SELECT id, uid, principal, interest, borrowed, taken_at, due_at, last_accrual, status FROM loans;
DROP TABLE loans;
ALTER TABLE loans_new RENAME TO loans;
CREATE INDEX loans_by_uid ON loans(uid, status);
CREATE INDEX loans_due ON loans(status, due_at);

-- Loans open now were given 4 game weeks (about 11 hours). They get the new 7 real days from when they were taken.
UPDATE loans SET due_at = MAX(due_at, taken_at + 7 * 86400000) WHERE status = 'open';

-- The rate is now % per real day (0 to 10) instead of per game week: everyone starts again from the new default.
UPDATE civic_policies SET loan_rate = 3 WHERE id = 1;

-- A borrower's record with the bank: loans repaid on time raise how much of their assets it lends against,
-- and a default shuts the door for a while.
CREATE TABLE bank_credit (
  uid TEXT PRIMARY KEY,
  repaid_on_time INTEGER NOT NULL DEFAULT 0,
  defaults INTEGER NOT NULL DEFAULT 0,
  banned_until INTEGER
) WITHOUT ROWID;

-- What the bank took when a loan defaulted, one row per thing: the record, the houses, cars and jets the borrower's game
-- applies once (applied), and houses that stay off the save after (worker/index.ts). Nothing is handed back.
CREATE TABLE foreclosures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  loan_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cash', 'savings', 'house', 'car', 'jet')),
  ref TEXT NOT NULL,
  property_json TEXT,
  value INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX foreclosures_by_uid ON foreclosures(uid, applied);
