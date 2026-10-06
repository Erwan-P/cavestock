ALTER TABLE "User"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "inactivityNoticeAt" TIMESTAMP(3),
  ADD COLUMN "inactivityDueAt" TIMESTAMP(3),
  ADD COLUMN "inactivityAdminNoticeAt" TIMESTAMP(3),
  ADD COLUMN "inactivityReminderAt" TIMESTAMP(3),
  ADD COLUMN "inactivityAdminReminderAt" TIMESTAMP(3);

CREATE INDEX "User_verifiedAt_createdAt_idx" ON "User"("verifiedAt", "createdAt");
CREATE INDEX "User_inactivityDueAt_idx" ON "User"("inactivityDueAt");
