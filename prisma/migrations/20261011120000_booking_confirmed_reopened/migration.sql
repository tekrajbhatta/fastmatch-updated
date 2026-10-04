-- Bookings remember when they were first confirmed, so confirming one again
-- (after it was set back to unpaid) doesn't re-send its emails or count its
-- discount code twice; and a cancelled or refunded booking reopened by a new
-- online attempt remembers what it was, to be put back if that attempt is
-- never paid. Bookings already confirmed count as confirmed when they were made.
ALTER TABLE `Booking` ADD COLUMN `confirmedAt` DATETIME(3) NULL,
    ADD COLUMN `reopenedFrom` JSON NULL;

UPDATE `Booking` SET `confirmedAt` = `createdAt` WHERE `status` = 'CONFIRMED';
