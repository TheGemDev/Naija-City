-- Date of birth (YYYY-MM-DD), asked once after sign-up. NULL = not asked yet; players must be 18+.
ALTER TABLE players ADD COLUMN birthdate TEXT;
