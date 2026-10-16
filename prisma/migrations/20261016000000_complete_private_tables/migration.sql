-- Align fresh databases with the private-table protections used in production.
-- Prisma connects as the owner or a BYPASSRLS role; there is no public policy.
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- These roles exist on Supabase, but not necessarily on local PostgreSQL or CI.
-- RLS does not govern TRUNCATE, so remove unused grants as well.
DO $$
DECLARE
    public_role TEXT;
BEGIN
    FOREACH public_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = public_role) THEN
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE public."User", public."EmailVerificationToken", public."PasswordResetToken", public."Session", public."Category", public."Wine", public."StockMovement", public."DataTransfer", public."CaptchaChallenge", public."RequestRateLimit", public."ImportJob", public."_prisma_migrations" FROM %I',
                public_role
            );
        END IF;
    END LOOP;
END $$;
