-- Blast sends record how many recipients a message failed for, so the
-- progress box and History say "N sent, M failed" instead of counting
-- failures as sent.
ALTER TABLE `CampaignSend` ADD COLUMN `failedCount` INTEGER NOT NULL DEFAULT 0;
