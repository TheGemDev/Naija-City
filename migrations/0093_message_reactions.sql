-- A reaction on a private message (game/reactions.ts): one emoji from each side of the chat, NULL for none.
ALTER TABLE messages ADD COLUMN from_react TEXT;
ALTER TABLE messages ADD COLUMN to_react TEXT;
