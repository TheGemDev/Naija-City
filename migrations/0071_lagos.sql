-- Lagos is the third city (src/game/lagos.ts). Like Abuja it has its own government: the Governor of Lagos
-- (office 'lagosgov', src/game/civic.ts) runs it the way the governor runs Kaduna.
ALTER TABLE civic_policies ADD COLUMN lagosgov_uid TEXT REFERENCES players(uid);
ALTER TABLE civic_policies ADD COLUMN lagosgov_term_ends INTEGER;

-- Its own okada ban.
ALTER TABLE civic_policies ADD COLUMN okada_ban_lagos INTEGER NOT NULL DEFAULT 0 CHECK (okada_ban_lagos IN (0, 1));

-- Its own share of the treasury (ALLOCATION). The shares may not add up to more than 100%, so the column starts
-- at 0 and Lagos's first share comes out of federal palliatives: up to 10%, in the 5% steps the budget uses.
ALTER TABLE civic_policies ADD COLUMN alloc_lagos INTEGER NOT NULL DEFAULT 0 CHECK (alloc_lagos BETWEEN 0 AND 100);
UPDATE civic_policies SET alloc_lagos = MIN(10, alloc_welfare), alloc_welfare = alloc_welfare - MIN(10, alloc_welfare);

-- Its own potholes: sites are numbered from 2000 in the same potholes table, with their own clock and their own
-- road funding, set by the Governor of Lagos (worker/roads.ts). About half start open, the worst on the
-- Oshodi–Apapa Expressway where the port trailers run.
ALTER TABLE civic_policies ADD COLUMN roads_funding_lagos INTEGER NOT NULL DEFAULT 50 CHECK (roads_funding_lagos BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN pothole_at_lagos INTEGER;

INSERT OR IGNORE INTO potholes (site, opened_at) VALUES
  (2000, 0), (2001, 0), (2003, 0), (2004, 0), (2006, 0), (2008, 0), (2009, 0), (2012, 0),
  (2014, 0), (2016, 0), (2017, 0), (2019, 0), (2023, 0), (2024, 0), (2027, 0), (2029, 0);

-- Its motor park (src/game/underworld.ts): Oshodi can be claimed and fought over like Kawo and Utako.
INSERT OR IGNORE INTO parks (id) VALUES ('oshodi');
