-- Street lights break down like potholes open (worker/roads.ts, src/game/roads.ts): the server tracks which
-- lamp sites are out, each city on its own clock, and whoever runs the city pays to fix them. All start working.
CREATE TABLE broken_lamps (
  site INTEGER PRIMARY KEY,
  broken_at INTEGER NOT NULL
);

-- When the last street light went out in each city; the next is due LAMPS.spawnHours after this.
ALTER TABLE civic_policies ADD COLUMN lamp_at INTEGER;
ALTER TABLE civic_policies ADD COLUMN lamp_at_abuja INTEGER;
ALTER TABLE civic_policies ADD COLUMN lamp_at_lagos INTEGER;
