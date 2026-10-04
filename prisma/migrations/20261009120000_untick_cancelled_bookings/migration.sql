-- A cancelled or refunded booking is no longer checked in. Setting either
-- status now unticks "Checked in" automatically; this does the same for the
-- bookings that were cancelled or refunded before, which kept the tick.
UPDATE `Booking`
SET `checkedIn` = false, `checkedInAt` = NULL
WHERE `status` IN ('CANCELLED', 'REFUNDED') AND `checkedIn` = true;
