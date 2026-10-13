-- Twitter's News tab can be read one state at a time (All, Kaduna, Abuja, Lagos). A news post carries the city it
-- is about; NULL is national news (the president, the season, the cup final), which only "All" shows.
ALTER TABLE feed ADD COLUMN city TEXT;

-- Today's posts were written before the column: the ones that name their city can be told from the text.
UPDATE feed SET city = CASE
  WHEN text LIKE '%Kaduna%' THEN 'kaduna'
  WHEN text LIKE '%Abuja%' OR text LIKE '%FCT Minister%' THEN 'abuja'
  WHEN text LIKE '%Lagos%' THEN 'lagos'
END
WHERE parent_id IS NULL AND kind IN ('politics', 'election', 'roads', 'vdm');
