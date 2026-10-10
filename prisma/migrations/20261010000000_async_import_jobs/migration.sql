CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'IMPORTED');

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" VARCHAR(180) NOT NULL,
    "fileData" BYTEA,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "leaseHash" VARCHAR(64),
    "claimedAt" TIMESTAMP(3),
    "analysis" JSONB,
    "error" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "notificationAttempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");
CREATE INDEX "ImportJob_userId_createdAt_idx" ON "ImportJob"("userId", "createdAt");
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
