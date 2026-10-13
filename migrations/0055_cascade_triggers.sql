-- When a parent row goes, its children go with it, whoever deleted it: the daily sweep (worker/prune.ts), the
-- hourly Twitter sweep (worker/feed.ts) or a player. Saves every delete from having to remember the leftovers.

-- A post takes its likes, its replies, and the replies' likes.
CREATE TRIGGER feed_cascade
AFTER DELETE ON feed
BEGIN
  DELETE FROM feed_likes WHERE post_id = OLD.id OR post_id IN (SELECT id FROM feed WHERE parent_id = OLD.id);
  DELETE FROM feed WHERE parent_id = OLD.id;
END;

CREATE TRIGGER contracts_cascade
AFTER DELETE ON contracts
BEGIN
  DELETE FROM ransom_pledges WHERE contract_id = OLD.id;
END;

CREATE TRIGGER heist_crews_cascade
AFTER DELETE ON heist_crews
BEGIN
  DELETE FROM heist_members WHERE crew_id = OLD.id;
END;

CREATE TRIGGER hangouts_cascade
AFTER DELETE ON hangouts
BEGIN
  DELETE FROM hangout_guests WHERE hangout_id = OLD.id;
END;

CREATE TRIGGER owambes_cascade
AFTER DELETE ON owambes
BEGIN
  DELETE FROM owambe_guests WHERE owambe_id = OLD.id;
END;

-- Clear out anything already orphaned before the triggers existed.
DELETE FROM feed WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM feed WHERE parent_id IS NULL);
DELETE FROM feed_likes WHERE post_id NOT IN (SELECT id FROM feed);
DELETE FROM ransom_pledges WHERE contract_id NOT IN (SELECT id FROM contracts);
DELETE FROM heist_members WHERE crew_id NOT IN (SELECT id FROM heist_crews);
DELETE FROM hangout_guests WHERE hangout_id NOT IN (SELECT id FROM hangouts);
DELETE FROM owambe_guests WHERE owambe_id NOT IN (SELECT id FROM owambes);
