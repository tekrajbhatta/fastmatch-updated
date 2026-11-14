-- Affiliates (Gil, Nov): partners whose promotions are discount codes that
-- earn them a commission on each booking made with them.
-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `affiliateCommission` DECIMAL(10, 2) NULL,
    ADD COLUMN `affiliateCommissionBase` DECIMAL(10, 2) NULL,
    ADD COLUMN `affiliateCommissionPercent` DECIMAL(5, 2) NULL,
    ADD COLUMN `affiliateId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `DiscountCode` ADD COLUMN `affiliateId` VARCHAR(191) NULL,
    ADD COLUMN `commissionPercent` DECIMAL(5, 2) NULL;

-- CreateTable
CREATE TABLE `Affiliate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Affiliate_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_affiliateId_fkey` FOREIGN KEY (`affiliateId`) REFERENCES `Affiliate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscountCode` ADD CONSTRAINT `DiscountCode_affiliateId_fkey` FOREIGN KEY (`affiliateId`) REFERENCES `Affiliate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

