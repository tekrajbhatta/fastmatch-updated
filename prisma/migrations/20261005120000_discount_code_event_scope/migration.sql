-- Discount codes: "Event" (All, or one event the code works for).
-- AlterTable
ALTER TABLE `DiscountCode` ADD COLUMN `scopeEventId` VARCHAR(191) NULL;
