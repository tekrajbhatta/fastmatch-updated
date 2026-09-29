-- Blasts: "Exclude booked members" (optionally for one event).
-- AlterTable
ALTER TABLE `Campaign` ADD COLUMN `excludeBooked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `excludeBookedEventId` VARCHAR(191) NULL;
-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_excludeBookedEventId_fkey` FOREIGN KEY (`excludeBookedEventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
