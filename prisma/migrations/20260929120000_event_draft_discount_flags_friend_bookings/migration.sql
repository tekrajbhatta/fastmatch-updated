-- "Duplicate event" copies start as drafts; FastMatch Discounts and Group
-- Discounts are on by default, so every existing event keeps its discount
-- code box and gains the bring-a-friend option.
ALTER TABLE `Event` ADD COLUMN `draft` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `fastmatchDiscounts` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `groupDiscounts` BOOLEAN NOT NULL DEFAULT true;

-- A friend's booking points at the booking of the member who paid for it.
ALTER TABLE `Booking` ADD COLUMN `bookedById` VARCHAR(191) NULL;
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_bookedById_fkey` FOREIGN KEY (`bookedById`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
