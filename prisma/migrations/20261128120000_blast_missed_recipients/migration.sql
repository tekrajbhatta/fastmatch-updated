-- Members a blast email didn't reach (Mailgun kept saying "try again later"),
-- and, on a resend to them, the send it finishes.
ALTER TABLE `CampaignSend` ADD COLUMN `emailFailedIds` JSON NULL,
    ADD COLUMN `retryOfId` VARCHAR(191) NULL;
