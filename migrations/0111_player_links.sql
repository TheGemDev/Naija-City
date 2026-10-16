-- Which accounts share a device (worker/links.ts). Only salted hashes are kept, never the raw values.
-- kind: 'device' (a random id the browser keeps), 'print' (a hash of the hardware), 'ip' (the network address).
CREATE TABLE player_links (
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (uid, kind, hash)
);
CREATE INDEX player_links_hash ON player_links(kind, hash, uid);

-- EFCC cases are about dirty money ('money') or a rigged election ('election', on one race: election_id).
ALTER TABLE efcc_cases ADD COLUMN kind TEXT NOT NULL DEFAULT 'money';
ALTER TABLE efcc_cases ADD COLUMN election_id INTEGER;
