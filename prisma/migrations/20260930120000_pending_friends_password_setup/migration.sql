-- Friends on an unpaid booking wait here as details only; they become
-- accounts and bookings once the payment goes through.
-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `pendingFriends` JSON NULL;
-- AlterTable
ALTER TABLE `Member` ADD COLUMN `awaitingPasswordSetup` BOOLEAN NOT NULL DEFAULT false;
