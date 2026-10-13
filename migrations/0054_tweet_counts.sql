-- Twitter only keeps a day of posts now (worker/feed.ts pruneFeed), but the "post N tweets" quests count over
-- a whole week. So tweets are tallied here per player per day, and the tally outlives the posts themselves.
CREATE TABLE tweet_counts (
  uid TEXT NOT NULL,
  day INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, day)
);

INSERT INTO tweet_counts (uid, day, n)
SELECT uid, created_at / 86400000, COUNT(*) FROM feed WHERE kind = 'post' AND uid IS NOT NULL GROUP BY 1, 2;
