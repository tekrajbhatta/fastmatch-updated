-- Event description: a longer blurb shown on the public event page, under the
-- Book button. Purely additive and nullable, so every existing event keeps
-- working with no description until one is written.
ALTER TABLE `Event` ADD COLUMN `description` TEXT NULL;
