ALTER TABLE `User` ADD COLUMN `pendingEmail` VARCHAR(191) NULL,
    ADD COLUMN `verifiedAt` DATETIME(3) NULL;

-- Les comptes créés avant cette fonctionnalité restent accessibles.
UPDATE `User` SET `verifiedAt` = `createdAt` WHERE `verifiedAt` IS NULL;

CREATE UNIQUE INDEX `User_pendingEmail_key` ON `User`(`pendingEmail`);

CREATE TABLE `EmailVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `EmailVerificationToken_userId_key`(`userId`),
    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
