-- NPC citizens rent from players (worker/rentals.ts settleNpcTenants): a citizen without a finished house of their own
-- takes a listed house in their state and pays the rent out of their own balance. Their tenant_uid is their npcs.id;
-- this marks those rows apart from the made-up households, so a citizen who japa'd or moved state is seen to have gone.
ALTER TABLE rentals ADD COLUMN npc_citizen INTEGER NOT NULL DEFAULT 0;
