-- What an event's price includes (Gil): "inc one drink", "inc food"... shown
-- beside the price. Existing events: no extras.
ALTER TABLE `Event` ADD COLUMN `offering` ENUM('NONE', 'ONE_DRINK', 'TWO_DRINKS', 'FOOD', 'FOOD_AND_DRINKS', 'PRIZES') NOT NULL DEFAULT 'NONE';
