/*
  Warnings:

  - You are about to drop the `pendingregistration` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `pendingregistration`;

-- CreateTable
CREATE TABLE `CaptchaChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `answerHash` VARCHAR(64) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaptchaChallenge_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
