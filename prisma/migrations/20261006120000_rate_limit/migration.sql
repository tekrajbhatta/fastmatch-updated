-- Rate limiting: attempt counters (see src/lib/rateLimit.ts).
-- CreateTable
CREATE TABLE `RateLimit` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `resetAt` DATETIME(3) NOT NULL,

    INDEX `RateLimit_resetAt_idx`(`resetAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
