-- Family app: a player can have several partners (a babe plus side cheeks). Replaces `couples`
-- (one relationship per player). a < b. status: asked_date | dating | asked_marry | married.
CREATE TABLE lovers (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  asker TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('asked_date', 'dating', 'asked_marry', 'married')),
  since INTEGER NOT NULL,
  dating_since INTEGER,
  bond INTEGER NOT NULL DEFAULT 0,
  last_night INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (a, b)
);
CREATE INDEX lovers_by_b ON lovers(b);
INSERT INTO lovers (a, b, asker, status, since, dating_since, bond) SELECT a, b, asker, status, since, dating_since, bond FROM couples;

-- Date nights are for one named partner.
ALTER TABLE hangouts ADD COLUMN partner_uid TEXT;
