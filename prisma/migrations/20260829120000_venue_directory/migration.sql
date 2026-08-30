-- Venue directory: replaces Event.venue (free text) with a Venue table.
--
-- WRITTEN BY HAND, NOT `migrate diff`. The generated diff opened with
--     ALTER TABLE `Event` DROP COLUMN `venue`, ADD COLUMN `venueId` ...
-- which would discard every existing event's venue before anything had a
-- chance to read it. The order below moves the data across first, and only
-- drops the old column once every event points at a Venue row.
--
-- Safe to run whether the database has zero events or hundreds.

-- 1. The new table.
CREATE TABLE `Venue` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `websiteUrl` VARCHAR(191) NULL,
    `photoUrl` VARCHAR(191) NULL,
    `cityId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Venue_cityId_idx`(`cityId`),
    UNIQUE INDEX `Venue_name_cityId_key`(`name`, `cityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Venue` ADD CONSTRAINT `Venue_cityId_fkey`
    FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. One Venue per distinct (venue text, city) pair already in use. The whole
--    existing string becomes the venue NAME and address is left null — the
--    old field mixed the two ("Sheaf Hotel, Double Bay") and guessing where
--    to split would corrupt names. Gil edits them afterwards in the admin.
--    Keyed by (name, city) because the same pub name can exist in two cities.
INSERT INTO `Venue` (`id`, `name`, `cityId`, `createdAt`, `updatedAt`)
SELECT UUID(), e.`venue`, e.`cityId`, NOW(3), NOW(3)
FROM `Event` e
GROUP BY e.`venue`, e.`cityId`;

-- 3. Point every event at its venue, while the old column still exists.
ALTER TABLE `Event` ADD COLUMN `venueId` VARCHAR(191) NULL;

UPDATE `Event` e
JOIN `Venue` v ON v.`name` = e.`venue` AND v.`cityId` = e.`cityId`
SET e.`venueId` = v.`id`;

-- 4. Now that every row is populated, enforce the constraint. If any event
--    failed to match above this ALTER fails and the migration stops here,
--    with the original `venue` column still intact and readable.
ALTER TABLE `Event` MODIFY COLUMN `venueId` VARCHAR(191) NOT NULL;

CREATE INDEX `Event_venueId_idx` ON `Event`(`venueId`);

ALTER TABLE `Event` ADD CONSTRAINT `Event_venueId_fkey`
    FOREIGN KEY (`venueId`) REFERENCES `Venue`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Only now is the old column redundant.
ALTER TABLE `Event` DROP COLUMN `venue`;
