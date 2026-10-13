-- The Government Gazette: what office holders did with their powers (new laws, treasury spending, scandals,
-- who took office). The Civic app's News tab reads it, and everyone online is alerted as each line is written
-- (worker/gazette.ts). Lines are kept a week.
CREATE TABLE civic_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Who did it; NULL when nobody is named (the "snake" that swallows treasury money).
  uid TEXT,
  -- The office they acted as: governor / president / dpo / efcc.
  office TEXT,
  -- law / project / palliative / scandal / elected
  kind TEXT NOT NULL,
  icon TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX civic_news_recent ON civic_news (created_at DESC);
