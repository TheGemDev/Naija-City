-- Notification categories a player has switched off (src/game/push.ts). No row means the category is on.
CREATE TABLE push_muted (
  uid TEXT NOT NULL,
  category TEXT NOT NULL,
  PRIMARY KEY (uid, category)
);
