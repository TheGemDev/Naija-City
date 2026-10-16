-- NPC tenants on the player rental market (worker/rentals.ts, NPC_TENANTS in src/game/property.ts). An NPC household
-- sits in tenant_uid as 'npc:<uuid>', never a real player's uid; these say who they are and when they mean to move out.
ALTER TABLE rentals ADD COLUMN npc_name TEXT;
ALTER TABLE rentals ADD COLUMN npc_until INTEGER;
