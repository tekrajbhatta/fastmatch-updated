-- AlterTable
ALTER TABLE `Member` ADD COLUMN `franchiseFrom` DATETIME(3) NULL,
    ADD COLUMN `franchiseTill` DATETIME(3) NULL,
    ADD COLUMN `isFranchisee` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `_FranchiseCities` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_FranchiseCities_AB_unique`(`A`, `B`),
    INDEX `_FranchiseCities_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_DiscountCodeCities` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_DiscountCodeCities_AB_unique`(`A`, `B`),
    INDEX `_DiscountCodeCities_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_FranchiseCities` ADD CONSTRAINT `_FranchiseCities_A_fkey` FOREIGN KEY (`A`) REFERENCES `City`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_FranchiseCities` ADD CONSTRAINT `_FranchiseCities_B_fkey` FOREIGN KEY (`B`) REFERENCES `Member`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_DiscountCodeCities` ADD CONSTRAINT `_DiscountCodeCities_A_fkey` FOREIGN KEY (`A`) REFERENCES `City`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_DiscountCodeCities` ADD CONSTRAINT `_DiscountCodeCities_B_fkey` FOREIGN KEY (`B`) REFERENCES `DiscountCode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Gil's franchise locations (15 Nov) that the site didn't have yet. Sydney,
-- Melbourne, Brisbane, Perth, Adelaide, Gold Coast, Central Coast,
-- Wollongong and Newcastle already exist. Skipped if one was added by hand.
INSERT IGNORE INTO `City` (`id`, `name`) VALUES
    ('fmcity_hobart', 'Hobart'),
    ('fmcity_canberra', 'Canberra'),
    ('fmcity_sunshine_coast', 'Sunshine Coast'),
    ('fmcity_townsville', 'Townsville'),
    ('fmcity_cairns', 'Cairns'),
    ('fmcity_rockhampton', 'Rockhampton'),
    ('fmcity_north_coast_nsw', 'North Coast (NSW)'),
    ('fmcity_fremantle', 'Fremantle'),
    ('fmcity_geelong', 'Geelong');
