-- Each city's square holds its own owambe (worker/owambe.ts): Murtala Square in Kaduna, Eagle Square in Abuja.
ALTER TABLE owambes ADD COLUMN city TEXT NOT NULL DEFAULT 'kaduna';
CREATE INDEX owambes_city ON owambes(city, ends_at);
