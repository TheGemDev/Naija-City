-- Bank loans. The president sets the interest rate (% per game week) for everyone; interest goes to the treasury.
ALTER TABLE civic_policies ADD COLUMN loan_rate INTEGER NOT NULL DEFAULT 10 CHECK (loan_rate BETWEEN 0 AND 30);

CREATE TABLE loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  principal INTEGER NOT NULL CHECK (principal >= 0),
  interest INTEGER NOT NULL DEFAULT 0 CHECK (interest >= 0),
  borrowed INTEGER NOT NULL,
  taken_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  last_accrual INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'repaid'))
);
CREATE INDEX loans_by_uid ON loans(uid, status);
