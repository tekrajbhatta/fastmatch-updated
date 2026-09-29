-- Who invited a member through "Tell A Friend" (NULL for everyone else).
-- AlterTable
ALTER TABLE `Member` ADD COLUMN `referredById` VARCHAR(191) NULL;
-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_referredById_fkey` FOREIGN KEY (`referredById`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
