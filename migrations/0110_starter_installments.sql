-- A new life's starting money is paid in installments (worker/wallet.ts payStarter), so a throwaway account has little
-- to pass on. starter_left: what is still to come; starter_day: the last day (Nigerian time, days since 1970) one was paid.
ALTER TABLE wallets ADD COLUMN starter_left INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallets ADD COLUMN starter_day INTEGER NOT NULL DEFAULT 0;
