-- Admin sets this by hand once the venue and numbers are locked in. Every
-- existing event starts unconfirmed, matching the checkbox's default.
ALTER TABLE `Event` ADD COLUMN `confirmed` BOOLEAN NOT NULL DEFAULT false;

-- How an admin-added booking was paid. NULL = booked and paid online via
-- Stripe, which is what every existing booking is.
ALTER TABLE `Booking` ADD COLUMN `paymentMethod` ENUM('CASH', 'CARD', 'PAY_AT_DOOR', 'FRIEND_BOOKED_IN') NULL;
