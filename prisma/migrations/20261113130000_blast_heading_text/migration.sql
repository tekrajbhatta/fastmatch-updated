-- A blast's heading can now be written in the blast editor (bold, colours,
-- sizes, links), stored as HTML: longer than the 191 characters it had.
ALTER TABLE `Campaign` MODIFY `heading` TEXT NULL;
ALTER TABLE `CampaignTemplate` MODIFY `heading` TEXT NULL;
