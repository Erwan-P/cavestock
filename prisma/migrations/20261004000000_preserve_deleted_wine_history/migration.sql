ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_wineId_fkey";
ALTER TABLE "StockMovement" ALTER COLUMN "wineId" DROP NOT NULL;
ALTER TABLE "StockMovement"
  ADD COLUMN "archivedCategoryName" VARCHAR(100),
  ADD COLUMN "archivedRegion" VARCHAR(150),
  ADD COLUMN "archivedAppellation" VARCHAR(150),
  ADD COLUMN "archivedDomaine" VARCHAR(150),
  ADD COLUMN "archivedVintage" INTEGER,
  ADD COLUMN "archivedCuvee" VARCHAR(150);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_wineId_fkey"
  FOREIGN KEY ("wineId") REFERENCES "Wine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
