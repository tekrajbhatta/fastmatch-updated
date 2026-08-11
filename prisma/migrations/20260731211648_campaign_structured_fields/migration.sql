-- AlterTable
ALTER TABLE `Campaign` ADD COLUMN `bannerImageUrl` VARCHAR(191) NULL,
    ADD COLUMN `bookingLink` VARCHAR(191) NULL,
    ADD COLUMN `eventDetailsText` TEXT NULL,
    ADD COLUMN `freeText` TEXT NULL,
    ADD COLUMN `heading` VARCHAR(191) NULL,
    ADD COLUMN `photoUrl` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `CampaignTemplate` ADD COLUMN `bannerImageUrl` VARCHAR(191) NULL,
    ADD COLUMN `bookingLink` VARCHAR(191) NULL,
    ADD COLUMN `eventDetailsText` TEXT NULL,
    ADD COLUMN `freeText` TEXT NULL,
    ADD COLUMN `heading` VARCHAR(191) NULL,
    ADD COLUMN `photoUrl` VARCHAR(191) NULL;

