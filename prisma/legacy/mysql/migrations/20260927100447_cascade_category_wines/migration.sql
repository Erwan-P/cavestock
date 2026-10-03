-- DropForeignKey
ALTER TABLE `wine` DROP FOREIGN KEY `Wine_categoryId_fkey`;

-- DropIndex
DROP INDEX `Wine_categoryId_fkey` ON `wine`;

-- AddForeignKey
ALTER TABLE `Wine` ADD CONSTRAINT `Wine_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
