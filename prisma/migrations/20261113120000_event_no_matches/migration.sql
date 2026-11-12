-- A third choice for "On the night, members see and rate": no check-in, no
-- choosing and no results (Gil: social days like a day at the races).
ALTER TABLE `Event` MODIFY `ratingAudience` ENUM('OPPOSITE_GENDER', 'EVERYONE', 'NO_MATCHES') NOT NULL DEFAULT 'OPPOSITE_GENDER';
