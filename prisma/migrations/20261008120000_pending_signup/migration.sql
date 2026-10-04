-- Sign-ups waiting for their email link to be clicked. The account is created
-- from the link, so the sign-up form never reveals whether an address already
-- belongs to a member. Rows are deleted when used, and once expired.
CREATE TABLE `PendingSignup` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PendingSignup_tokenHash_key`(`tokenHash`),
    INDEX `PendingSignup_email_idx`(`email`),
    INDEX `PendingSignup_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
