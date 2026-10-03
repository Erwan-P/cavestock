-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `normalizedName` VARCHAR(100) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Category_userId_position_idx`(`userId`, `position`),
    UNIQUE INDEX `Category_userId_normalizedName_key`(`userId`, `normalizedName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wine` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `identityKey` VARCHAR(64) NOT NULL,
    `region` VARCHAR(150) NOT NULL,
    `appellation` VARCHAR(150) NOT NULL,
    `domaine` VARCHAR(150) NOT NULL,
    `vintage` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `cuvee` VARCHAR(150) NULL,
    `purchasePrice` DECIMAL(10, 2) NULL,
    `comment` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Wine_userId_categoryId_idx`(`userId`, `categoryId`),
    UNIQUE INDEX `Wine_userId_categoryId_identityKey_key`(`userId`, `categoryId`, `identityKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `wineId` VARCHAR(191) NOT NULL,
    `kind` ENUM('ENTRY', 'EXIT') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `StockMovement_wineId_createdAt_idx`(`wineId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wine` ADD CONSTRAINT `Wine_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wine` ADD CONSTRAINT `Wine_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_wineId_fkey` FOREIGN KEY (`wineId`) REFERENCES `Wine`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
