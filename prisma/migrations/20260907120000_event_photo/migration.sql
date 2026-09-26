-- The event photo replaces the venue photo: the image is chosen per event now,
-- not once per place.
ALTER TABLE `Event` ADD COLUMN `photoUrl` VARCHAR(191) NULL;

-- Carry each venue's photo onto its events BEFORE dropping the column, so no
-- event that was already showing a picture loses it.
UPDATE `Event` `e`
  JOIN `Venue` `v` ON `e`.`venueId` = `v`.`id`
  SET `e`.`photoUrl` = `v`.`photoUrl`
  WHERE `v`.`photoUrl` IS NOT NULL;

ALTER TABLE `Venue` DROP COLUMN `photoUrl`;
