-- Referral links: naija.city/?ref=<code>. Only the codes listed here count, so a link exists only for the people it was made for.
CREATE TABLE referral_links (
  code TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0   -- browsers that opened the link (each one counted once)
);
-- One row per new player who signed up after opening a link.
CREATE TABLE referral_signups (
  uid TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX referral_signups_code ON referral_signups (code);

INSERT INTO referral_links (code, owner_uid, created_at)
SELECT 'nicoleharrison', uid, unixepoch() * 1000 FROM players WHERE username = 'nicoleharrison';
