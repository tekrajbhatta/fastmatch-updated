-- Who members see and rate on the check-in list: the opposite gender only
-- (the default, for every existing event too) or everyone.
ALTER TABLE `Event` ADD COLUMN `ratingAudience` ENUM('OPPOSITE_GENDER', 'EVERYONE') NOT NULL DEFAULT 'OPPOSITE_GENDER';
