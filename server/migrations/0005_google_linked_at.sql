-- When a chef was linked to a Google account, for the dev site's sign-in counts. Chefs linked before this have none.
ALTER TABLE players ADD COLUMN google_linked_at INTEGER;
