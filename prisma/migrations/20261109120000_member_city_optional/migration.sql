-- A member's city can be empty: members imported from the old site whose
-- city isn't one of the site's choose one in Edit profile. Deleting a city
-- that members use is still refused, as before.
ALTER TABLE `Member` DROP FOREIGN KEY `Member_cityId_fkey`;
ALTER TABLE `Member` MODIFY `cityId` VARCHAR(191) NULL;
ALTER TABLE `Member` ADD CONSTRAINT `Member_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `City`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
