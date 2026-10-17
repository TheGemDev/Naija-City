-- NPC citizens go by usernames, like players (src/game/npcs.ts npcUsername): on their plots in the estates, on their
-- posts and wherever a post names them. Never one a player has; the NPCs already here get theirs on the next
-- population round (worker/npcs.ts).
ALTER TABLE npcs ADD COLUMN username TEXT;
CREATE UNIQUE INDEX npcs_username ON npcs(username) WHERE username IS NOT NULL;
