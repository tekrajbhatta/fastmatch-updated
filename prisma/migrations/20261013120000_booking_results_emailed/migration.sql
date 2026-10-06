-- When each attendee was emailed their results (matches, or the "no mutual
-- matches this time" email). Null for everyone until their email goes.
ALTER TABLE `Booking` ADD COLUMN `resultsEmailedAt` DATETIME(3) NULL;
