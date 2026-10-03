-- Les tables sont exclusivement accessibles au serveur Prisma (propriétaire/BYPASSRLS).
-- Aucune politique publique : les rôles anon/authenticated de Supabase n'ont pas accès aux comptes.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaptchaChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RequestRateLimit" ENABLE ROW LEVEL SECURITY;
