-- Run ONCE on your existing database (new installs already get this from schema.sql):
--   npx wrangler d1 execute shins-library --remote --file=./migration-001.sql

-- Listings that come from the Preset Finder (user_id 0) and the TikTok video they were found in
ALTER TABLE listings ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE listings ADD COLUMN source_url TEXT NOT NULL DEFAULT '';

-- "Jugg packs" and "Editing styles" no longer exist as categories. Existing entries move to "Packs".
-- ("Other packs" keeps its key, it is simply called "Packs" now.)
UPDATE listings SET category='packs' WHERE category IN ('jugg','styles');
