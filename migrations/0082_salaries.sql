-- What the state pays each office a game day (src/game/civic.ts SALARY). The President sets every one, their own
-- included, and it comes out of the treasury (worker/civic.ts paySalaries). Nobody is paid until a President says so.
ALTER TABLE civic_policies ADD COLUMN salary_president INTEGER NOT NULL DEFAULT 0 CHECK (salary_president >= 0);
ALTER TABLE civic_policies ADD COLUMN salary_governor INTEGER NOT NULL DEFAULT 0 CHECK (salary_governor >= 0);
ALTER TABLE civic_policies ADD COLUMN salary_minister INTEGER NOT NULL DEFAULT 0 CHECK (salary_minister >= 0);
ALTER TABLE civic_policies ADD COLUMN salary_lagosgov INTEGER NOT NULL DEFAULT 0 CHECK (salary_lagosgov >= 0);
ALTER TABLE civic_policies ADD COLUMN salary_igp INTEGER NOT NULL DEFAULT 0 CHECK (salary_igp >= 0);
ALTER TABLE civic_policies ADD COLUMN salary_efcc INTEGER NOT NULL DEFAULT 0 CHECK (salary_efcc >= 0);
-- When the last pay round went out (ms).
ALTER TABLE civic_policies ADD COLUMN salaries_paid_at INTEGER;
