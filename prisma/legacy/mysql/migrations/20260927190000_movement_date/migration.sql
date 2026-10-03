ALTER TABLE `StockMovement` ADD COLUMN `movementDate` DATE NULL;

CREATE INDEX `StockMovement_userId_movementDate_idx` ON `StockMovement`(`userId`, `movementDate`);
