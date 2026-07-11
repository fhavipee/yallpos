-- Authenticator (TOTP) for manager/owner elevated approval
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
