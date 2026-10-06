-- Members the admin added with a password the admin chose: asked once to keep
-- it or choose their own. False for everyone already registered.
ALTER TABLE `Member` ADD COLUMN `passwordSetByAdmin` BOOLEAN NOT NULL DEFAULT false;
