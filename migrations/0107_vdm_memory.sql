-- VDM's memory (src/game/vdm.ts, worker/vdm.ts): one row per post he made. The phrase ids of his last posts keep him
-- from repeating himself, the hashes stop a post ever going up twice word for word, and uid/uid2 keep his score on
-- people: who he dragged (uid) and who he praised (uid2), so he can say "third time this week" or "last time I praised
-- you". Pruned after two weeks by the cron (worker/news.ts vdmGrumbles).
CREATE TABLE vdm_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The official (or thief) he dragged, and the one he praised. A mixed post has both.
  uid TEXT,
  uid2 TEXT,
  topic TEXT NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('drag', 'praise', 'mixed')),
  -- Space-separated phrase ids the post was built from.
  phrases TEXT NOT NULL,
  text TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX vdm_memory_uid ON vdm_memory (uid, created_at);
CREATE INDEX vdm_memory_uid2 ON vdm_memory (uid2, created_at);
CREATE INDEX vdm_memory_at ON vdm_memory (created_at);
