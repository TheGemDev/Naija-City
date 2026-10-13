-- Which live room (shard) each player is in. Shard 0 is the original 'kaduna' room; more open as it fills.
CREATE TABLE IF NOT EXISTS room_assign (
  uid TEXT PRIMARY KEY,
  shard INTEGER NOT NULL,
  at INTEGER NOT NULL
);
