-- KD Twitter: replies are feed rows pointing at their parent post.
ALTER TABLE feed ADD COLUMN parent_id INTEGER;
CREATE INDEX feed_by_parent ON feed(parent_id, id);

-- Group chats (worker/groups.ts). last_read_id is the highest group message the member has opened.
CREATE TABLE group_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_uid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE group_members (
  group_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, uid)
);
CREATE INDEX group_members_by_uid ON group_members(uid);
CREATE TABLE group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  from_uid TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX group_messages_by_group ON group_messages(group_id, id);
