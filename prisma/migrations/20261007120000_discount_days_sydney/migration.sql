-- Discount codes: "Valid from" and "Valid to" become whole days in Sydney.
--
-- Until now the admin form saved each chosen day as midnight UTC (10-11 am in
-- Sydney), so a code stopped working on the morning of its last advertised
-- day. Each such value moves to the start ("Valid from") or the very end
-- ("Valid to", 11:59:59.999 pm) of that same day in Sydney, as the site now
-- saves them (src/lib/discountDates.ts). Only values at exactly midnight UTC
-- are touched, so nothing else changes and running it twice changes nothing.
--
-- Sydney's offset is worked out here rather than with CONVERT_TZ, which needs
-- MySQL's timezone tables loaded and returns NULL without them. The rules in
-- force since 2008: UTC+11 from 2 am on the first Sunday of October until
-- 3 am on the first Sunday of April, otherwise UTC+10. So midnight starting a
-- day is on UTC+11 for days after the first Sunday of October, or up to and
-- including the first Sunday of April; the end of a day is on UTC+11 from the
-- first Sunday of October, or before the first Sunday of April.
-- (WEEKDAY: Monday = 0 ... Sunday = 6.)

UPDATE `DiscountCode`
SET `validFrom` = TIMESTAMP(DATE(`validFrom`)) - INTERVAL IF(
      DATE(`validFrom`) > DATE_ADD(MAKEDATE(YEAR(`validFrom`), 1) + INTERVAL 9 MONTH,
                                   INTERVAL 6 - WEEKDAY(MAKEDATE(YEAR(`validFrom`), 1) + INTERVAL 9 MONTH) DAY)
      OR DATE(`validFrom`) <= DATE_ADD(MAKEDATE(YEAR(`validFrom`), 1) + INTERVAL 3 MONTH,
                                       INTERVAL 6 - WEEKDAY(MAKEDATE(YEAR(`validFrom`), 1) + INTERVAL 3 MONTH) DAY),
      11, 10) HOUR
WHERE `validFrom` = TIMESTAMP(DATE(`validFrom`));

UPDATE `DiscountCode`
SET `validTo` = TIMESTAMP(DATE(`validTo`)) + INTERVAL 1 DAY - INTERVAL 1000 MICROSECOND - INTERVAL IF(
      DATE(`validTo`) >= DATE_ADD(MAKEDATE(YEAR(`validTo`), 1) + INTERVAL 9 MONTH,
                                  INTERVAL 6 - WEEKDAY(MAKEDATE(YEAR(`validTo`), 1) + INTERVAL 9 MONTH) DAY)
      OR DATE(`validTo`) < DATE_ADD(MAKEDATE(YEAR(`validTo`), 1) + INTERVAL 3 MONTH,
                                    INTERVAL 6 - WEEKDAY(MAKEDATE(YEAR(`validTo`), 1) + INTERVAL 3 MONTH) DAY),
      11, 10) HOUR
WHERE `validTo` = TIMESTAMP(DATE(`validTo`));
