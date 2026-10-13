-- Kano is the fourth city (src/game/kano.ts). Like Lagos it has its own government: the Governor of Kano
-- (office 'kanogov', src/game/civic.ts) runs it the way the governor runs Kaduna.
ALTER TABLE civic_policies ADD COLUMN kanogov_uid TEXT REFERENCES players(uid);
ALTER TABLE civic_policies ADD COLUMN kanogov_term_ends INTEGER;
-- What the office is paid a game day (0082_salaries.sql): nothing until a President says so.
ALTER TABLE civic_policies ADD COLUMN salary_kanogov INTEGER NOT NULL DEFAULT 0 CHECK (salary_kanogov >= 0);

-- Its own okada ban.
ALTER TABLE civic_policies ADD COLUMN okada_ban_kano INTEGER NOT NULL DEFAULT 0 CHECK (okada_ban_kano IN (0, 1));

-- Its own share of the treasury (ALLOCATION). The shares may not add up to more than 100%, so the column starts
-- at 0 and Kano's first share, up to 10%, comes out of whatever the President has left unallocated, then out of
-- federal palliatives. Every share is a multiple of the 5% step the budget uses, so this one is too.
ALTER TABLE civic_policies ADD COLUMN alloc_kano INTEGER NOT NULL DEFAULT 0 CHECK (alloc_kano BETWEEN 0 AND 100);
UPDATE civic_policies SET
  alloc_kano = MIN(10, MAX(0, 100 - alloc_kaduna - alloc_abuja - alloc_lagos - alloc_police - alloc_efcc - alloc_welfare))
    + MIN(10 - MIN(10, MAX(0, 100 - alloc_kaduna - alloc_abuja - alloc_lagos - alloc_police - alloc_efcc - alloc_welfare)), alloc_welfare),
  alloc_welfare = alloc_welfare
    - MIN(10 - MIN(10, MAX(0, 100 - alloc_kaduna - alloc_abuja - alloc_lagos - alloc_police - alloc_efcc - alloc_welfare)), alloc_welfare);

-- Its own potholes and street lights: sites are numbered from 3000, with their own clocks and their own road
-- funding, set by the Governor of Kano (worker/roads.ts). Half the potholes start open, the worst on the Katsina
-- road and the Eastern Bypass where the trailers run. Every street light starts working.
ALTER TABLE civic_policies ADD COLUMN roads_funding_kano INTEGER NOT NULL DEFAULT 50 CHECK (roads_funding_kano BETWEEN 0 AND 100);
ALTER TABLE civic_policies ADD COLUMN pothole_at_kano INTEGER;
ALTER TABLE civic_policies ADD COLUMN lamp_at_kano INTEGER;

INSERT OR IGNORE INTO potholes (site, opened_at) VALUES
  (3000, 0), (3002, 0), (3004, 0), (3005, 0), (3007, 0), (3008, 0), (3011, 0), (3013, 0),
  (3014, 0), (3017, 0), (3019, 0), (3022, 0), (3023, 0), (3026, 0), (3028, 0);

-- Its motor park (src/game/underworld.ts): Naibawa can be claimed and fought over like Kawo, Utako and Oshodi.
INSERT OR IGNORE INTO parks (id) VALUES ('naibawa');
