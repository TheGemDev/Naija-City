-- More of what a state keeps up: police stations, motor parks and stations, schools, heritage, parks and squares, and the
-- tech hub (src/game/treasury.ts). Every state gets each one, in good order and at the usual upkeep.
INSERT OR IGNORE INTO state_assets (city, asset) SELECT city, 'police' FROM state_treasuries;
INSERT OR IGNORE INTO state_assets (city, asset) SELECT city, 'transport' FROM state_treasuries;
INSERT OR IGNORE INTO state_assets (city, asset) SELECT city, 'schools' FROM state_treasuries;
INSERT OR IGNORE INTO state_assets (city, asset) SELECT city, 'culture' FROM state_treasuries;
INSERT OR IGNORE INTO state_assets (city, asset) SELECT city, 'parks' FROM state_treasuries;
INSERT OR IGNORE INTO state_assets (city, asset) SELECT city, 'techhub' FROM state_treasuries;
