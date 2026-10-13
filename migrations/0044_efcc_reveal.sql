-- The accused only sees who filed an EFCC investigation after paying the reveal fee.
ALTER TABLE efcc_cases ADD COLUMN accuser_revealed_at INTEGER;
