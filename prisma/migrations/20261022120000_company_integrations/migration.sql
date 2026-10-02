-- Credenciales de Brevo y ZapSign por empresa (aditiva: todo nullable o con default).
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "brevoApiCredential" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "emailFromName" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "emailFromAddress" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "zapsignApiCredential" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "zapsignSandbox" BOOLEAN NOT NULL DEFAULT false;
